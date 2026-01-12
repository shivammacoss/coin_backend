import mongoose from 'mongoose'

const copyFollowerSchema = new mongoose.Schema({
  followerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  masterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterTrader',
    required: true
  },
  followerAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingAccount',
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'PAUSED', 'STOPPED'],
    default: 'ACTIVE'
  },
  // Copy settings
  copyMode: {
    type: String,
    enum: ['FIXED_LOT', 'LOT_MULTIPLIER'],
    required: true
  },
  copyValue: {
    type: Number,
    required: true,
    min: 0.01
  },
  // Risk settings
  maxLotSize: {
    type: Number,
    default: 10 // Maximum lot size per copied trade
  },
  maxDailyLoss: {
    type: Number,
    default: null // Optional daily loss limit
  },
  // Statistics
  stats: {
    totalCopiedTrades: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalLoss: { type: Number, default: 0 },
    totalCommissionPaid: { type: Number, default: 0 },
    activeCopiedTrades: { type: Number, default: 0 }
  },
  // Daily tracking (reset daily)
  dailyProfit: {
    type: Number,
    default: 0
  },
  dailyLoss: {
    type: Number,
    default: 0
  },
  lastDailyReset: {
    type: Date,
    default: Date.now
  },
  // Timestamps
  startedAt: {
    type: Date,
    default: Date.now
  },
  pausedAt: {
    type: Date,
    default: null
  },
  stoppedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true })

// Compound index to prevent duplicate follows
copyFollowerSchema.index({ followerId: 1, masterId: 1, followerAccountId: 1 }, { unique: true })
copyFollowerSchema.index({ masterId: 1, status: 1 })
copyFollowerSchema.index({ followerId: 1, status: 1 })

export default mongoose.model('CopyFollower', copyFollowerSchema)
