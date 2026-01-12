import mongoose from 'mongoose'

const copyTradeSchema = new mongoose.Schema({
  // Master trade reference
  masterTradeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trade',
    required: true
  },
  masterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterTrader',
    required: true
  },
  // Follower trade reference
  followerTradeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trade',
    required: true
  },
  followerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CopyFollower',
    required: true
  },
  followerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  followerAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingAccount',
    required: true
  },
  // Trade details
  symbol: {
    type: String,
    required: true
  },
  side: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  masterLotSize: {
    type: Number,
    required: true
  },
  followerLotSize: {
    type: Number,
    required: true
  },
  copyMode: {
    type: String,
    enum: ['FIXED_LOT', 'LOT_MULTIPLIER'],
    required: true
  },
  copyValue: {
    type: Number,
    required: true
  },
  // Prices
  masterOpenPrice: {
    type: Number,
    required: true
  },
  followerOpenPrice: {
    type: Number,
    required: true
  },
  masterClosePrice: {
    type: Number,
    default: null
  },
  followerClosePrice: {
    type: Number,
    default: null
  },
  // PnL
  followerPnl: {
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED', 'FAILED'],
    default: 'OPEN'
  },
  failureReason: {
    type: String,
    default: null
  },
  // Timestamps
  openedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date,
    default: null
  },
  // For daily commission calculation
  tradingDay: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  commissionApplied: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })

// Indexes
copyTradeSchema.index({ masterTradeId: 1 })
copyTradeSchema.index({ masterId: 1, tradingDay: 1 })
copyTradeSchema.index({ followerId: 1, tradingDay: 1 })
copyTradeSchema.index({ status: 1 })

export default mongoose.model('CopyTrade', copyTradeSchema)
