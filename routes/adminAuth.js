import express from 'express'
import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'
import { verifyAdmin, requireSuperAdmin } from '../middleware/adminAuth.js'

const router = express.Router()

// Generate JWT token for admin
const generateAdminToken = (adminId) => {
  return jwt.sign(
    { id: adminId, isAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  )
}

// POST /api/admin-auth/login - Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' })
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() })
    
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated' })
    }

    const isMatch = await admin.comparePassword(password)
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    // Update last login
    admin.lastLogin = new Date()
    await admin.save()

    const token = generateAdminToken(admin._id)

    res.json({
      message: 'Login successful',
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    })
  } catch (error) {
    console.error('Admin login error:', error)
    res.status(500).json({ message: 'Error during login', error: error.message })
  }
})

// GET /api/admin-auth/me - Get current admin
router.get('/me', verifyAdmin, async (req, res) => {
  try {
    res.json({
      admin: {
        _id: req.admin._id,
        name: req.admin.name,
        email: req.admin.email,
        role: req.admin.role,
        permissions: req.admin.permissions,
        lastLogin: req.admin.lastLogin
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admin', error: error.message })
  }
})

// GET /api/admin-auth/admins - Get all admins (super admin only)
router.get('/admins', verifyAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const admins = await Admin.find()
      .select('-password')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })

    res.json({
      message: 'Admins fetched successfully',
      admins,
      total: admins.length
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admins', error: error.message })
  }
})

// POST /api/admin-auth/admins - Create new admin (super admin only)
router.post('/admins', verifyAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' })
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() })
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin with this email already exists' })
    }

    const admin = await Admin.create({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'viewer',
      permissions: permissions || [],
      createdBy: req.admin._id
    })

    res.status(201).json({
      message: 'Admin created successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    })
  } catch (error) {
    console.error('Error creating admin:', error)
    res.status(500).json({ message: 'Error creating admin', error: error.message })
  }
})

// PUT /api/admin-auth/admins/:id - Update admin (super admin only)
router.put('/admins/:id', verifyAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, role, permissions, isActive } = req.body

    const admin = await Admin.findById(req.params.id)
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' })
    }

    // Prevent modifying your own super admin role
    if (admin._id.toString() === req.admin._id.toString() && role !== 'super_admin') {
      return res.status(400).json({ message: 'Cannot demote yourself from super admin' })
    }

    if (name) admin.name = name
    if (email) admin.email = email.toLowerCase()
    if (role) admin.role = role
    if (permissions) admin.permissions = permissions
    if (typeof isActive === 'boolean') admin.isActive = isActive

    await admin.save()

    res.json({
      message: 'Admin updated successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        isActive: admin.isActive
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating admin', error: error.message })
  }
})

// PUT /api/admin-auth/admins/:id/password - Change admin password (super admin only)
router.put('/admins/:id/password', verifyAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { password } = req.body

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    const admin = await Admin.findById(req.params.id)
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' })
    }

    admin.password = password
    await admin.save()

    res.json({ message: 'Password updated successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Error updating password', error: error.message })
  }
})

// DELETE /api/admin-auth/admins/:id - Delete admin (super admin only)
router.delete('/admins/:id', verifyAdmin, requireSuperAdmin, async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.admin._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete yourself' })
    }

    const admin = await Admin.findByIdAndDelete(req.params.id)
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' })
    }

    res.json({ message: 'Admin deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Error deleting admin', error: error.message })
  }
})

// PUT /api/admin-auth/change-password - Change own password
router.put('/change-password', verifyAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' })
    }

    const admin = await Admin.findById(req.admin._id)
    const isMatch = await admin.comparePassword(currentPassword)

    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' })
    }

    admin.password = newPassword
    await admin.save()

    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Error changing password', error: error.message })
  }
})

export default router
