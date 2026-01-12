import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const router = express.Router()

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { firstName, email, phone, countryCode, password } = req.body

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' })
    }

    // Create new user
    const user = await User.create({
      firstName,
      email,
      phone,
      countryCode,
      password
    })

    // Generate token
    const token = generateToken(user._id)

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: user._id,
        id: user._id,
        firstName: user.firstName,
        email: user.email,
        phone: user.phone
      },
      token
    })
  } catch (error) {
    console.error('Signup error:', error)
    res.status(500).json({ message: 'Error creating user', error: error.message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user by email
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    // Check password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    // Generate token
    const token = generateToken(user._id)

    res.json({
      message: 'Login successful',
      user: {
        _id: user._id,
        id: user._id,
        firstName: user.firstName,
        email: user.email,
        phone: user.phone
      },
      token
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Error logging in', error: error.message })
  }
})

// GET /api/auth/me - Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ message: 'No token provided' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id).select('-password')
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' })
  }
})

// PUT /api/auth/update-profile - Update user profile
router.put('/update-profile', async (req, res) => {
  try {
    const { userId, firstName, lastName, phone, address, city, country, dateOfBirth, bankDetails, upiId } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update basic profile fields
    if (firstName) user.firstName = firstName
    if (lastName !== undefined) user.lastName = lastName
    if (phone !== undefined) user.phone = phone
    if (address !== undefined) user.address = address
    if (city !== undefined) user.city = city
    if (country !== undefined) user.country = country
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth

    // Update bank details
    if (bankDetails) {
      user.bankDetails = {
        bankName: bankDetails.bankName || '',
        accountNumber: bankDetails.accountNumber || '',
        accountHolderName: bankDetails.accountHolderName || '',
        ifscCode: bankDetails.ifscCode || '',
        branchName: bankDetails.branchName || ''
      }
    }

    // Update UPI
    if (upiId !== undefined) user.upiId = upiId

    await user.save()

    res.json({ 
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        country: user.country,
        dateOfBirth: user.dateOfBirth,
        bankDetails: user.bankDetails,
        upiId: user.upiId,
        createdAt: user.createdAt
      }
    })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ message: 'Error updating profile', error: error.message })
  }
})

// GET /api/auth/user/:userId - Get user by ID (for admin)
router.get('/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message })
  }
})

export default router
