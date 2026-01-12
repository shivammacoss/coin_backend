import MasterTrader from '../models/MasterTrader.js'
import CopyFollower from '../models/CopyFollower.js'
import CopyTrade from '../models/CopyTrade.js'
import CopyCommission from '../models/CopyCommission.js'
import CopySettings from '../models/CopySettings.js'
import Trade from '../models/Trade.js'
import TradingAccount from '../models/TradingAccount.js'
import tradeEngine from './tradeEngine.js'

class CopyTradingEngine {
  constructor() {
    this.CONTRACT_SIZE = 100000
  }

  // Get today's date string
  getTradingDay() {
    return new Date().toISOString().split('T')[0]
  }

  // Calculate follower lot size based on copy mode
  calculateFollowerLotSize(masterLotSize, copyMode, copyValue, maxLotSize = 10) {
    let followerLot
    
    if (copyMode === 'FIXED_LOT') {
      followerLot = copyValue
    } else if (copyMode === 'LOT_MULTIPLIER') {
      followerLot = masterLotSize * copyValue
    } else {
      followerLot = masterLotSize
    }

    // Apply max lot size limit
    followerLot = Math.min(followerLot, maxLotSize)
    
    // Round to 2 decimal places
    return Math.round(followerLot * 100) / 100
  }

  // Copy master trade to all active followers
  async copyTradeToFollowers(masterTrade, masterId) {
    const master = await MasterTrader.findById(masterId)
    if (!master || master.status !== 'ACTIVE') {
      console.log(`Master ${masterId} not active, skipping copy`)
      return []
    }

    // Check if this master trade has already been copied (prevent duplicates)
    const existingCopyTrade = await CopyTrade.findOne({
      masterTradeId: masterTrade._id,
      masterId: masterId
    })
    
    if (existingCopyTrade) {
      console.log(`Master trade ${masterTrade._id} already copied, skipping duplicate`)
      return []
    }

    // Get all active followers for this master
    const followers = await CopyFollower.find({
      masterId: masterId,
      status: 'ACTIVE'
    }).populate('followerAccountId')

    const copyResults = []
    const tradingDay = this.getTradingDay()

    for (const follower of followers) {
      try {
        // Check if already copied for this specific follower (extra safety)
        const existingFollowerCopy = await CopyTrade.findOne({
          masterTradeId: masterTrade._id,
          followerId: follower._id
        })
        
        if (existingFollowerCopy) {
          console.log(`Trade already copied for follower ${follower._id}, skipping`)
          continue
        }

        // Calculate follower lot size
        const followerLotSize = this.calculateFollowerLotSize(
          masterTrade.quantity,
          follower.copyMode,
          follower.copyValue,
          follower.maxLotSize
        )

        // Validate follower account
        const followerAccount = await TradingAccount.findById(follower.followerAccountId)
        if (!followerAccount || followerAccount.status !== 'Active') {
          copyResults.push({
            followerId: follower._id,
            status: 'FAILED',
            reason: 'Account not active'
          })
          continue
        }

        // Check margin
        const contractSize = tradeEngine.getContractSize(masterTrade.symbol)
        const marginRequired = tradeEngine.calculateMargin(
          followerLotSize,
          masterTrade.openPrice,
          followerAccount.leverage,
          contractSize
        )

        // Calculate used margin from existing open trades
        const existingTrades = await Trade.find({ 
          tradingAccountId: followerAccount._id, 
          status: 'OPEN' 
        })
        const usedMargin = existingTrades.reduce((sum, t) => sum + (t.marginUsed || 0), 0)
        const freeMargin = followerAccount.balance + (followerAccount.credit || 0) - usedMargin
        
        if (marginRequired > freeMargin) {
          copyResults.push({
            followerId: follower._id,
            status: 'FAILED',
            reason: `Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${freeMargin.toFixed(2)}`
          })
          
          // Record failed copy trade
          await CopyTrade.create({
            masterTradeId: masterTrade._id,
            masterId: masterId,
            followerTradeId: null,
            followerId: follower._id,
            followerUserId: follower.followerId,
            followerAccountId: follower.followerAccountId,
            symbol: masterTrade.symbol,
            side: masterTrade.side,
            masterLotSize: masterTrade.quantity,
            followerLotSize: followerLotSize,
            copyMode: follower.copyMode,
            copyValue: follower.copyValue,
            masterOpenPrice: masterTrade.openPrice,
            followerOpenPrice: 0,
            status: 'FAILED',
            failureReason: `Insufficient margin`,
            tradingDay
          })
          continue
        }

        // Execute trade for follower
        const followerTrade = await tradeEngine.openTrade(
          follower.followerId,
          follower.followerAccountId._id || follower.followerAccountId,
          masterTrade.symbol,
          masterTrade.segment,
          masterTrade.side,
          'MARKET',
          followerLotSize,
          masterTrade.openPrice, // Use master's price as bid
          masterTrade.openPrice, // Use master's price as ask
          masterTrade.stopLoss,
          masterTrade.takeProfit
        )

        // Record successful copy trade
        await CopyTrade.create({
          masterTradeId: masterTrade._id,
          masterId: masterId,
          followerTradeId: followerTrade._id,
          followerId: follower._id,
          followerUserId: follower.followerId,
          followerAccountId: follower.followerAccountId._id || follower.followerAccountId,
          symbol: masterTrade.symbol,
          side: masterTrade.side,
          masterLotSize: masterTrade.quantity,
          followerLotSize: followerLotSize,
          copyMode: follower.copyMode,
          copyValue: follower.copyValue,
          masterOpenPrice: masterTrade.openPrice,
          followerOpenPrice: followerTrade.openPrice,
          status: 'OPEN',
          tradingDay
        })

        // Update follower stats
        follower.stats.totalCopiedTrades += 1
        follower.stats.activeCopiedTrades += 1
        await follower.save()

        // Update master stats
        master.stats.totalCopiedVolume += followerLotSize
        await master.save()

        copyResults.push({
          followerId: follower._id,
          status: 'SUCCESS',
          followerTradeId: followerTrade._id,
          lotSize: followerLotSize
        })

      } catch (error) {
        console.error(`Error copying trade to follower ${follower._id}:`, error)
        copyResults.push({
          followerId: follower._id,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return copyResults
  }

  // Mirror SL/TP modification to all follower trades
  async mirrorSlTpModification(masterTradeId, newSl, newTp) {
    const copyTrades = await CopyTrade.find({
      masterTradeId,
      status: 'OPEN'
    })

    const results = []

    for (const copyTrade of copyTrades) {
      try {
        await tradeEngine.modifyTrade(copyTrade.followerTradeId, newSl, newTp)
        results.push({
          copyTradeId: copyTrade._id,
          status: 'SUCCESS'
        })
      } catch (error) {
        console.error(`Error mirroring SL/TP to copy trade ${copyTrade._id}:`, error)
        results.push({
          copyTradeId: copyTrade._id,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return results
  }

  // Close all follower trades when master closes
  async closeFollowerTrades(masterTradeId, masterClosePrice) {
    const copyTrades = await CopyTrade.find({
      masterTradeId,
      status: 'OPEN'
    })

    const results = []

    for (const copyTrade of copyTrades) {
      try {
        // Close the follower trade
        const result = await tradeEngine.closeTrade(
          copyTrade.followerTradeId,
          masterClosePrice,
          masterClosePrice,
          'USER'
        )

        // Update copy trade record
        copyTrade.masterClosePrice = masterClosePrice
        copyTrade.followerClosePrice = result.trade.closePrice
        copyTrade.followerPnl = result.realizedPnl
        copyTrade.status = 'CLOSED'
        copyTrade.closedAt = new Date()
        await copyTrade.save()

        // Update follower stats
        const follower = await CopyFollower.findById(copyTrade.followerId)
        if (follower) {
          follower.stats.activeCopiedTrades -= 1
          if (result.realizedPnl >= 0) {
            follower.stats.totalProfit += result.realizedPnl
            follower.dailyProfit += result.realizedPnl
          } else {
            follower.stats.totalLoss += Math.abs(result.realizedPnl)
            follower.dailyLoss += Math.abs(result.realizedPnl)
          }
          await follower.save()
        }

        results.push({
          copyTradeId: copyTrade._id,
          status: 'SUCCESS',
          pnl: result.realizedPnl
        })

      } catch (error) {
        console.error(`Error closing copy trade ${copyTrade._id}:`, error)
        results.push({
          copyTradeId: copyTrade._id,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return results
  }

  // Calculate and apply daily commission (run at end of day)
  async calculateDailyCommission(tradingDay = null) {
    const day = tradingDay || this.getTradingDay()
    
    // Get all closed copy trades for the day that haven't had commission applied
    const copyTrades = await CopyTrade.find({
      tradingDay: day,
      status: 'CLOSED',
      commissionApplied: false
    })

    // Group by master and follower
    const groupedTrades = {}
    for (const trade of copyTrades) {
      const key = `${trade.masterId}_${trade.followerId}`
      if (!groupedTrades[key]) {
        groupedTrades[key] = {
          masterId: trade.masterId,
          followerId: trade.followerId,
          followerUserId: trade.followerUserId,
          followerAccountId: trade.followerAccountId,
          trades: [],
          totalPnl: 0
        }
      }
      groupedTrades[key].trades.push(trade)
      groupedTrades[key].totalPnl += trade.followerPnl
    }

    const commissionResults = []

    for (const key in groupedTrades) {
      const group = groupedTrades[key]
      
      // Only apply commission on profitable days
      if (group.totalPnl <= 0) {
        // Mark trades as processed (no commission)
        for (const trade of group.trades) {
          trade.commissionApplied = true
          await trade.save()
        }
        continue
      }

      try {
        // Get master's commission percentage
        const master = await MasterTrader.findById(group.masterId)
        if (!master || !master.approvedCommissionPercentage) continue

        const commissionPercentage = master.approvedCommissionPercentage
        const adminSharePercentage = master.adminSharePercentage || 30

        // Calculate commission
        const totalCommission = group.totalPnl * (commissionPercentage / 100)
        const adminShare = totalCommission * (adminSharePercentage / 100)
        const masterShare = totalCommission - adminShare

        // Deduct from follower account
        const followerAccount = await TradingAccount.findById(group.followerAccountId)
        if (followerAccount && followerAccount.balance >= totalCommission) {
          followerAccount.balance -= totalCommission
          await followerAccount.save()

          // Create commission record
          const commission = await CopyCommission.create({
            masterId: group.masterId,
            followerId: group.followerId,
            followerUserId: group.followerUserId,
            followerAccountId: group.followerAccountId,
            tradingDay: day,
            dailyProfit: group.totalPnl,
            commissionPercentage,
            totalCommission,
            adminShare,
            masterShare,
            adminSharePercentage,
            status: 'DEDUCTED',
            deductedAt: new Date()
          })

          // Update master pending commission
          master.pendingCommission += masterShare
          master.totalCommissionEarned += masterShare
          await master.save()

          // Update admin pool
          const settings = await CopySettings.getSettings()
          settings.adminCopyPool += adminShare
          await settings.save()

          // Update follower stats
          const follower = await CopyFollower.findById(group.followerId)
          if (follower) {
            follower.stats.totalCommissionPaid += totalCommission
            await follower.save()
          }

          // Mark trades as processed
          for (const trade of group.trades) {
            trade.commissionApplied = true
            await trade.save()
          }

          commissionResults.push({
            masterId: group.masterId,
            followerId: group.followerId,
            dailyProfit: group.totalPnl,
            commission: totalCommission,
            status: 'SUCCESS'
          })

        } else {
          // Insufficient balance for commission
          await CopyCommission.create({
            masterId: group.masterId,
            followerId: group.followerId,
            followerUserId: group.followerUserId,
            followerAccountId: group.followerAccountId,
            tradingDay: day,
            dailyProfit: group.totalPnl,
            commissionPercentage,
            totalCommission,
            adminShare,
            masterShare,
            adminSharePercentage,
            status: 'FAILED',
            deductionError: 'Insufficient balance'
          })

          commissionResults.push({
            masterId: group.masterId,
            followerId: group.followerId,
            status: 'FAILED',
            reason: 'Insufficient balance'
          })
        }

      } catch (error) {
        console.error(`Error calculating commission for ${key}:`, error)
        commissionResults.push({
          masterId: group.masterId,
          followerId: group.followerId,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return commissionResults
  }

  // Process master commission withdrawal
  async processMasterWithdrawal(masterId, amount, adminId) {
    const master = await MasterTrader.findById(masterId)
    if (!master) throw new Error('Master not found')

    if (amount > master.pendingCommission) {
      throw new Error(`Insufficient pending commission. Available: $${master.pendingCommission.toFixed(2)}`)
    }

    const settings = await CopySettings.getSettings()
    if (amount < settings.commissionSettings.minPayoutAmount) {
      throw new Error(`Minimum payout amount is $${settings.commissionSettings.minPayoutAmount}`)
    }

    // Get master's trading account
    const tradingAccount = await TradingAccount.findById(master.tradingAccountId)
    if (!tradingAccount) throw new Error('Master trading account not found')

    // Transfer commission to master
    tradingAccount.balance += amount
    await tradingAccount.save()

    // Update master records
    master.pendingCommission -= amount
    master.totalCommissionWithdrawn += amount
    await master.save()

    return {
      amount,
      newPendingCommission: master.pendingCommission,
      newAccountBalance: tradingAccount.balance
    }
  }

  // Close all follower trades when master is banned
  async closeAllMasterFollowerTrades(masterId, currentPrices) {
    const copyTrades = await CopyTrade.find({
      masterId,
      status: 'OPEN'
    })

    const results = []

    for (const copyTrade of copyTrades) {
      try {
        const price = currentPrices[copyTrade.symbol]
        if (!price) continue

        const result = await tradeEngine.closeTrade(
          copyTrade.followerTradeId,
          price.bid,
          price.ask,
          'ADMIN'
        )

        copyTrade.status = 'CLOSED'
        copyTrade.followerClosePrice = result.trade.closePrice
        copyTrade.followerPnl = result.realizedPnl
        copyTrade.closedAt = new Date()
        await copyTrade.save()

        results.push({
          copyTradeId: copyTrade._id,
          status: 'SUCCESS',
          pnl: result.realizedPnl
        })

      } catch (error) {
        results.push({
          copyTradeId: copyTrade._id,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return results
  }
}

export default new CopyTradingEngine()
