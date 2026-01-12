import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  role: {
    type: String,
    enum: ['super_admin', 'manager', 'support', 'finance', 'viewer'],
    default: 'viewer'
  },
  permissions: [{
    type: String,
    enum: [
      'users',
      'accounts',
      'trades',
      'funds',
      'transactions',
      'ib',
      'copy_trade',
      'prop_firm',
      'support',
      'settings',
      'admins',
      'all'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, { timestamps: true })

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// Check if admin has permission
adminSchema.methods.hasPermission = function(permission) {
  if (this.role === 'super_admin') return true
  if (this.permissions.includes('all')) return true
  return this.permissions.includes(permission)
}

export default mongoose.model('Admin', adminSchema)
