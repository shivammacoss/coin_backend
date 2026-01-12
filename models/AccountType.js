import mongoose from 'mongoose'

const accountTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ''
  },
  minDeposit: {
    type: Number,
    required: true,
    min: 0
  },
  leverage: {
    type: String,
    required: true,
    default: '1:100'
  },
  exposureLimit: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true })

export default mongoose.model('AccountType', accountTypeSchema)
