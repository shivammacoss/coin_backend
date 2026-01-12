import jwt from 'jsonwebtoken'
import Admin from '../models/Admin.js'

// Verify admin is authenticated
export const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Not an admin token.' })
    }

    const admin = await Admin.findById(decoded.id).select('-password')
    
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found.' })
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: 'Admin account is deactivated.' })
    }

    req.admin = admin
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired.' })
    }
    res.status(500).json({ message: 'Server error during authentication.' })
  }
}

// Check if admin has required permission
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ message: 'Admin not authenticated.' })
    }

    if (!req.admin.hasPermission(permission)) {
      return res.status(403).json({ 
        message: `Access denied. Required permission: ${permission}` 
      })
    }

    next()
  }
}

// Check if admin is super admin
export const requireSuperAdmin = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ message: 'Admin not authenticated.' })
  }

  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ message: 'Access denied. Super admin required.' })
  }

  next()
}

export default { verifyAdmin, requirePermission, requireSuperAdmin }
