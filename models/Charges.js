import mongoose from 'mongoose'

const chargesSchema = new mongoose.Schema({
  // Hierarchy level - higher priority overrides lower
  level: {
    type: String,
    enum: ['USER', 'INSTRUMENT', 'SEGMENT', 'ACCOUNT_TYPE', 'GLOBAL'],
    required: true
  },
  // Reference IDs based on level
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  instrumentSymbol: {
    type: String,
    default: null
  },
  segment: {
    type: String,
    enum: ['Forex', 'Crypto', 'Commodities', 'Indices', 'Metals', null],
    default: null
  },
  accountTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AccountType',
    default: null
  },
  // Spread settings
  spreadType: {
    type: String,
    enum: ['FIXED', 'PERCENTAGE'],
    default: 'FIXED'
  },
  spreadValue: {
    type: Number,
    default: 0
  },
  // Commission settings
  commissionType: {
    type: String,
    enum: ['PER_LOT', 'PER_TRADE', 'PERCENTAGE'],
    default: 'PER_LOT'
  },
  commissionValue: {
    type: Number,
    default: 0
  },
  // Swap settings (overnight fees)
  swapLong: {
    type: Number,
    default: 0
  },
  swapShort: {
    type: Number,
    default: 0
  },
  swapType: {
    type: String,
    enum: ['POINTS', 'PERCENTAGE'],
    default: 'POINTS'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true })

// Compound index for efficient lookups
chargesSchema.index({ level: 1, userId: 1, instrumentSymbol: 1, segment: 1, accountTypeId: 1 })

// Static method to get applicable charges for a trade
chargesSchema.statics.getChargesForTrade = async function(userId, symbol, segment, accountTypeId) {
  // Priority: USER > INSTRUMENT > SEGMENT > ACCOUNT_TYPE > GLOBAL
  const levels = ['USER', 'INSTRUMENT', 'SEGMENT', 'ACCOUNT_TYPE', 'GLOBAL']
  
  for (const level of levels) {
    let query = { level, isActive: true }
    
    switch (level) {
      case 'USER':
        query.userId = userId
        query.instrumentSymbol = symbol
        break
      case 'INSTRUMENT':
        query.instrumentSymbol = symbol
        break
      case 'SEGMENT':
        query.segment = segment
        break
      case 'ACCOUNT_TYPE':
        query.accountTypeId = accountTypeId
        break
      case 'GLOBAL':
        // No additional filters for global
        break
    }
    
    const charges = await this.findOne(query)
    if (charges) return charges
  }
  
  // Return default charges if none found
  return {
    spreadType: 'FIXED',
    spreadValue: 0,
    commissionType: 'PER_LOT',
    commissionValue: 0,
    swapLong: 0,
    swapShort: 0,
    swapType: 'POINTS'
  }
}

export default mongoose.model('Charges', chargesSchema)
