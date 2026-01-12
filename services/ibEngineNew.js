import User from '../models/User.js'
import IBPlan from '../models/IBPlanNew.js'
import IBCommission from '../models/IBCommissionNew.js'
import IBWallet from '../models/IBWallet.js'

class IBEngine {
  constructor() {
    this.CONTRACT_SIZES = {
      'XAUUSD': 100,
      'XAGUSD': 5000,
      'BTCUSD': 1,
      'ETHUSD': 1,
      'DEFAULT_FOREX': 100000,
      'DEFAULT_CRYPTO': 1
    }
  }

  getContractSize(symbol) {
    if (this.CONTRACT_SIZES[symbol]) return this.CONTRACT_SIZES[symbol]
    if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('USD')) {
      if (symbol.length <= 6) return this.CONTRACT_SIZES.DEFAULT_CRYPTO
    }
    return this.CONTRACT_SIZES.DEFAULT_FOREX
  }

  // Generate unique referral code
  async generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code
    let exists = true
    
    while (exists) {
      code = 'IB'
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      exists = await User.findOne({ referralCode: code })
    }
    
    return code
  }

  // Apply to become IB
  async applyForIB(userId) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')
    
    if (user.isIB) {
      throw new Error('User is already an IB')
    }

    const referralCode = await this.generateReferralCode()
    
    user.isIB = true
    user.ibStatus = 'PENDING'
    user.referralCode = referralCode
    
    // If user was referred by an IB, set parent and level
    if (user.referredBy) {
      const parentIB = await User.findOne({ 
        referralCode: user.referredBy, 
        isIB: true, 
        ibStatus: 'ACTIVE' 
      })
      if (parentIB) {
        user.parentIBId = parentIB._id
        user.ibLevel = parentIB.ibLevel + 1
      } else {
        user.ibLevel = 1
      }
    } else {
      user.ibLevel = 1
    }

    await user.save()
    
    // Create IB wallet
    await IBWallet.getOrCreateWallet(userId)
    
    return user
  }

  // Admin approve IB
  async approveIB(userId, planId = null) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')
    if (!user.isIB) throw new Error('User is not an IB applicant')

    user.ibStatus = 'ACTIVE'
    
    if (planId) {
      user.ibPlanId = planId
    } else {
      const defaultPlan = await IBPlan.getDefaultPlan()
      user.ibPlanId = defaultPlan._id
    }

    await user.save()
    return user
  }

  // Admin block IB
  async blockIB(userId, reason = '') {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')

    user.ibStatus = 'BLOCKED'
    await user.save()
    return user
  }

  // Register user with referral code
  async registerWithReferral(userId, referralCode) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')

    const referringIB = await User.findOne({ 
      referralCode, 
      isIB: true, 
      ibStatus: 'ACTIVE' 
    })
    
    if (!referringIB) {
      throw new Error('Invalid or inactive referral code')
    }

    user.referredBy = referralCode
    user.parentIBId = referringIB._id
    await user.save()

    return { user, referringIB }
  }

  // Get IB chain for a trader (upline IBs)
  async getIBChain(userId, maxLevels = 5) {
    const chain = []
    let currentUser = await User.findById(userId)
    
    if (!currentUser) return chain

    let parentId = currentUser.parentIBId
    let level = 1

    while (parentId && level <= maxLevels) {
      const parentIB = await User.findById(parentId)
        .populate('ibPlanId')
      
      if (!parentIB || !parentIB.isIB || parentIB.ibStatus !== 'ACTIVE') {
        break
      }

      chain.push({
        ibUser: parentIB,
        level
      })

      parentId = parentIB.parentIBId
      level++
    }

    return chain
  }

  // Calculate and distribute IB commission when a trade closes
  async processTradeCommission(trade) {
    console.log(`Processing IB commission for trade ${trade.tradeId || trade._id}, userId: ${trade.userId}`)
    
    // Get the IB chain for the trader
    const ibChain = await this.getIBChain(trade.userId)
    
    console.log(`IB Chain length: ${ibChain.length}`)
    
    if (ibChain.length === 0) {
      console.log('No IB chain found for trader')
      return { processed: false, reason: 'No IB chain found for trader' }
    }

    const commissionResults = []
    const contractSize = this.getContractSize(trade.symbol)

    for (const { ibUser, level } of ibChain) {
      try {
        console.log(`Processing level ${level} for IB ${ibUser.firstName} (${ibUser._id})`)
        
        // Get IB's plan - always fetch fresh from DB
        let plan = await IBPlan.findById(ibUser.ibPlanId)
        if (!plan) {
          plan = await IBPlan.getDefaultPlan()
        }
        if (!plan) {
          console.log(`No plan found for IB ${ibUser.firstName}`)
          continue
        }
        
        console.log(`Plan: ${plan.name}, maxLevels: ${plan.maxLevels}, commissionType: ${plan.commissionType}`)
        console.log(`levelCommissions:`, plan.levelCommissions)

        // Check if level is within plan's max levels
        if (level > plan.maxLevels) {
          console.log(`Level ${level} exceeds maxLevels ${plan.maxLevels}`)
          continue
        }

        // Get rate for this level - support both levelCommissions object and levels array
        let rate = 0
        if (plan.levelCommissions && plan.levelCommissions[`level${level}`]) {
          rate = plan.levelCommissions[`level${level}`]
        } else if (plan.levels && plan.levels.length > 0) {
          const levelConfig = plan.levels.find(l => l.level === level)
          rate = levelConfig ? levelConfig.rate : 0
        } else if (plan.getRateForLevel) {
          rate = plan.getRateForLevel(level)
        }
        
        console.log(`Level ${level} rate: ${rate}`)
        
        if (rate <= 0) {
          console.log(`Rate is 0 for level ${level}`)
          continue
        }

        // Calculate commission based on commission type
        let commissionAmount = 0
        let baseAmount = trade.quantity // lot size
        
        if (plan.commissionType === 'PER_LOT') {
          // PER_LOT: rate is $ per lot
          commissionAmount = trade.quantity * rate
        } else {
          // PERCENTAGE: rate is % of trade value
          const tradeValue = trade.quantity * contractSize * (trade.openPrice || 0)
          commissionAmount = tradeValue * (rate / 100)
        }

        if (commissionAmount <= 0) {
          console.log(`IB Commission: Skipping - commission amount is 0 for level ${level}`)
          continue
        }

        // Check if commission already exists for this trade and IB to prevent duplicates
        const existingCommission = await IBCommission.findOne({
          tradeId: trade._id,
          ibUserId: ibUser._id,
          level
        })
        
        if (existingCommission) {
          console.log(`IB Commission: Skipping - commission already exists for trade ${trade._id} and IB ${ibUser._id} at level ${level}`)
          continue
        }

        // Create commission record
        const commission = await IBCommission.create({
          tradeId: trade._id,
          traderUserId: trade.userId,
          ibUserId: ibUser._id,
          level,
          baseAmount,
          commissionAmount,
          symbol: trade.symbol,
          tradeLotSize: trade.quantity,
          contractSize,
          commissionType: plan.commissionType,
          status: 'CREDITED'
        })

        // Credit IB wallet
        const wallet = await IBWallet.getOrCreateWallet(ibUser._id)
        await wallet.creditCommission(commissionAmount)

        commissionResults.push({
          ibUserId: ibUser._id,
          ibName: ibUser.firstName,
          level,
          baseAmount,
          commissionAmount,
          commissionId: commission._id
        })

        console.log(`IB Commission: Level ${level} IB ${ibUser.firstName} earned $${commissionAmount.toFixed(2)} from trade ${trade.tradeId}`)

      } catch (error) {
        console.error(`Error processing IB commission for level ${level}:`, error)
      }
    }

    return {
      processed: true,
      commissionsGenerated: commissionResults.length,
      results: commissionResults
    }
  }

  // Reverse commission (admin action)
  async reverseCommission(commissionId, adminId, reason = '') {
    const commission = await IBCommission.findById(commissionId)
    if (!commission) throw new Error('Commission not found')
    if (commission.status === 'REVERSED') throw new Error('Commission already reversed')

    // Deduct from IB wallet
    const wallet = await IBWallet.getOrCreateWallet(commission.ibUserId)
    await wallet.reverseCommission(commission.commissionAmount)

    // Update commission status
    commission.status = 'REVERSED'
    commission.reversedAt = new Date()
    commission.reversedBy = adminId
    commission.reversalReason = reason
    await commission.save()

    return commission
  }

  // Get IB tree using $graphLookup (for admin visualization)
  async getIBTree(ibId, maxDepth = 5) {
    const result = await User.aggregate([
      { $match: { _id: ibId } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentIBId',
          as: 'downlines',
          maxDepth: maxDepth - 1,
          depthField: 'level'
        }
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          email: 1,
          referralCode: 1,
          ibStatus: 1,
          ibLevel: 1,
          downlines: {
            _id: 1,
            firstName: 1,
            email: 1,
            referralCode: 1,
            ibStatus: 1,
            isIB: 1,
            parentIBId: 1,
            level: 1
          }
        }
      }
    ])

    return result[0] || null
  }

  // Get IB stats for admin dashboard
  async getIBStats(ibUserId) {
    const user = await User.findById(ibUserId)
    if (!user || !user.isIB) throw new Error('IB not found')

    // Get wallet
    const wallet = await IBWallet.getOrCreateWallet(ibUserId)

    // Get direct referrals count
    const directReferrals = await User.countDocuments({ parentIBId: ibUserId })

    // Get total downline count (all levels)
    const tree = await this.getIBTree(user._id, 5)
    const totalDownline = tree?.downlines?.length || 0

    // Get commission stats
    const commissionStats = await IBCommission.aggregate([
      { $match: { ibUserId: user._id, status: 'CREDITED' } },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          totalTrades: { $sum: 1 }
        }
      }
    ])

    // Get active traders (users who traded in last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const activeTraders = await IBCommission.aggregate([
      { 
        $match: { 
          ibUserId: user._id, 
          createdAt: { $gte: thirtyDaysAgo } 
        } 
      },
      { $group: { _id: '$traderUserId' } },
      { $count: 'count' }
    ])

    return {
      ibUser: {
        _id: user._id,
        firstName: user.firstName,
        email: user.email,
        referralCode: user.referralCode,
        ibStatus: user.ibStatus,
        ibLevel: user.ibLevel
      },
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn,
        pendingWithdrawal: wallet.pendingWithdrawal
      },
      stats: {
        directReferrals,
        totalDownline,
        totalCommission: commissionStats[0]?.totalCommission || 0,
        totalTrades: commissionStats[0]?.totalTrades || 0,
        activeTraders: activeTraders[0]?.count || 0
      }
    }
  }

  // Withdraw from IB wallet to main wallet
  async withdrawToWallet(ibUserId, amount) {
    const user = await User.findById(ibUserId)
    if (!user || !user.isIB) throw new Error('IB not found')

    const wallet = await IBWallet.getOrCreateWallet(ibUserId)
    
    if (amount > wallet.balance) {
      throw new Error('Insufficient IB wallet balance')
    }

    // Deduct from IB wallet
    await wallet.requestWithdrawal(amount)
    
    // Add to user's main wallet balance
    user.walletBalance = (user.walletBalance || 0) + amount
    await user.save()

    // Complete the withdrawal
    await wallet.completeWithdrawal(amount)

    return {
      ibWalletBalance: wallet.balance,
      mainWalletBalance: user.walletBalance,
      withdrawnAmount: amount
    }
  }
}

export default new IBEngine()
