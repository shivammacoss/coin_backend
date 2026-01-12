import express from 'express'
import Trade from '../models/Trade.js'
import TradingAccount from '../models/TradingAccount.js'
import ChallengeAccount from '../models/ChallengeAccount.js'
import tradeEngine from '../services/tradeEngine.js'
import propTradingEngine from '../services/propTradingEngine.js'
import copyTradingEngine from '../services/copyTradingEngine.js'
import ibEngine from '../services/ibEngineNew.js'
import MasterTrader from '../models/MasterTrader.js'

const router = express.Router()

// POST /api/trade/open - Open a new trade
router.post('/open', async (req, res) => {
  try {
    const { 
      userId, 
      tradingAccountId, 
      symbol, 
      segment, 
      side, 
      orderType, 
      quantity, 
      bid, 
      ask, 
      sl, 
      tp 
    } = req.body

    // Validate required fields
    if (!userId || !tradingAccountId || !symbol || !side || !orderType || !quantity || !bid || !ask) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      })
    }

    // Validate side
    if (!['BUY', 'SELL'].includes(side)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid side. Must be BUY or SELL' 
      })
    }

    // Validate order type
    const validOrderTypes = ['MARKET', 'BUY_LIMIT', 'BUY_STOP', 'SELL_LIMIT', 'SELL_STOP']
    if (!validOrderTypes.includes(orderType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid order type' 
      })
    }

    // Check if this is a challenge account first
    const challengeAccount = await ChallengeAccount.findById(tradingAccountId).populate('challengeId')
    
    if (challengeAccount) {
      // This is a challenge account - use prop trading engine
      const tradeParams = {
        symbol,
        segment: segment || 'Forex',
        side,
        orderType,
        quantity: parseFloat(quantity),
        bid: parseFloat(bid),
        ask: parseFloat(ask),
        sl: sl ? parseFloat(sl) : null,
        tp: tp ? parseFloat(tp) : null
      }

      // Validate trade against challenge rules
      const validation = await propTradingEngine.validateTradeOpen(tradingAccountId, tradeParams)
      if (!validation.valid) {
        // Track violation and check if account should be failed
        const violationResult = await propTradingEngine.handleTradeAttemptViolation(tradingAccountId, validation)
        
        return res.status(400).json({
          success: false,
          message: violationResult.error,
          code: violationResult.code,
          uiAction: violationResult.uiAction,
          accountFailed: violationResult.accountFailed || false,
          failReason: violationResult.failReason || null,
          warningCount: violationResult.warningCount || 0,
          remainingWarnings: violationResult.remainingWarnings || 3
        })
      }

      // Open trade for challenge account
      const trade = await propTradingEngine.openChallengeTrade(
        userId,
        tradingAccountId,
        tradeParams
      )

      return res.json({
        success: true,
        message: 'Challenge trade opened successfully',
        trade,
        isChallengeAccount: true
      })
    }

    // Regular trading account - use standard trade engine
    const trade = await tradeEngine.openTrade(
      userId,
      tradingAccountId,
      symbol,
      segment || 'Forex',
      side,
      orderType,
      parseFloat(quantity),
      parseFloat(bid),
      parseFloat(ask),
      sl ? parseFloat(sl) : null,
      tp ? parseFloat(tp) : null
    )

    // Check if this is a master trader and copy to followers
    const master = await MasterTrader.findOne({ 
      tradingAccountId, 
      status: 'ACTIVE' 
    })
    
    let copyResults = []
    if (master) {
      try {
        copyResults = await copyTradingEngine.copyTradeToFollowers(trade, master._id)
        console.log(`Copied trade to ${copyResults.filter(r => r.status === 'SUCCESS').length} followers`)
      } catch (copyError) {
        console.error('Error copying trade to followers:', copyError)
      }
    }

    res.json({
      success: true,
      message: 'Trade opened successfully',
      trade,
      copyResults: copyResults.length > 0 ? copyResults : undefined
    })
  } catch (error) {
    console.error('Error opening trade:', error)
    res.status(400).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// POST /api/trade/close - Close a trade
router.post('/close', async (req, res) => {
  try {
    const { tradeId, bid, ask } = req.body

    if (!tradeId || !bid || !ask) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      })
    }

    // Get trade first to check if it's a challenge or master trade
    const tradeToClose = await Trade.findById(tradeId)
    
    if (!tradeToClose) {
      return res.status(404).json({ 
        success: false, 
        message: 'Trade not found' 
      })
    }

    // Check if this is a challenge account trade
    const challengeAccount = await ChallengeAccount.findById(tradeToClose.tradingAccountId)
    
    if (challengeAccount) {
      // Close trade for challenge account
      const closePrice = tradeToClose.side === 'BUY' ? parseFloat(bid) : parseFloat(ask)
      const pnl = tradeToClose.side === 'BUY'
        ? (closePrice - tradeToClose.openPrice) * tradeToClose.quantity * tradeToClose.contractSize
        : (tradeToClose.openPrice - closePrice) * tradeToClose.quantity * tradeToClose.contractSize
      
      // Update trade
      tradeToClose.status = 'CLOSED'
      tradeToClose.closePrice = closePrice
      tradeToClose.closedAt = new Date()
      tradeToClose.realizedPnl = pnl
      tradeToClose.closeReason = 'USER'
      await tradeToClose.save()
      
      // Update challenge account
      await propTradingEngine.onTradeClosed(challengeAccount._id, tradeToClose, pnl)
      
      return res.json({
        success: true,
        message: 'Challenge trade closed successfully',
        trade: tradeToClose,
        realizedPnl: pnl,
        isChallengeAccount: true
      })
    }
    
    // Regular trading account - use standard trade engine
    const result = await tradeEngine.closeTrade(
      tradeId,
      parseFloat(bid),
      parseFloat(ask),
      'USER'
    )

    // Check if this was a master trade and close follower trades
    if (tradeToClose) {
      const master = await MasterTrader.findOne({ 
        tradingAccountId: tradeToClose.tradingAccountId, 
        status: 'ACTIVE' 
      })
      
      if (master) {
        try {
          const closePrice = tradeToClose.side === 'BUY' ? parseFloat(bid) : parseFloat(ask)
          await copyTradingEngine.closeFollowerTrades(tradeId, closePrice)
          console.log(`Closed follower trades for master trade ${tradeId}`)
        } catch (copyError) {
          console.error('Error closing follower trades:', copyError)
        }
      }
    }

    // Process IB commission for the closed trade
    try {
      const ibResult = await ibEngine.processTradeCommission(result.trade)
      if (ibResult.processed) {
        console.log(`IB commission processed for trade ${result.trade._id}: ${ibResult.commissions?.length || 0} IBs credited`)
      }
    } catch (ibError) {
      console.error('Error processing IB commission:', ibError)
    }

    res.json({
      success: true,
      message: 'Trade closed successfully',
      trade: result.trade,
      realizedPnl: result.realizedPnl
    })
  } catch (error) {
    console.error('Error closing trade:', error)
    res.status(400).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// PUT /api/trade/modify - Modify trade SL/TP
router.put('/modify', async (req, res) => {
  try {
    const { tradeId, sl, tp } = req.body
    console.log('Modify trade request:', { tradeId, sl, tp })

    if (!tradeId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Trade ID is required' 
      })
    }

    // First check if trade exists
    const existingTrade = await Trade.findById(tradeId)
    if (!existingTrade) {
      console.log('Trade not found:', tradeId)
      return res.status(404).json({ 
        success: false, 
        message: 'Trade not found' 
      })
    }
    console.log('Found trade:', existingTrade.tradeId, existingTrade.status)

    // Parse values and handle NaN
    const parsedSl = sl !== undefined && sl !== null && sl !== '' ? parseFloat(sl) : null
    const parsedTp = tp !== undefined && tp !== null && tp !== '' ? parseFloat(tp) : null
    
    const trade = await tradeEngine.modifyTrade(
      tradeId,
      parsedSl !== null && !isNaN(parsedSl) ? parsedSl : null,
      parsedTp !== null && !isNaN(parsedTp) ? parsedTp : null
    )

    // Mirror SL/TP modification to follower trades
    const master = await MasterTrader.findOne({ 
      tradingAccountId: trade.tradingAccountId, 
      status: 'ACTIVE' 
    })
    
    if (master) {
      try {
        await copyTradingEngine.mirrorSlTpModification(
          tradeId,
          parsedSl,
          parsedTp
        )
        console.log(`Mirrored SL/TP modification to follower trades for ${tradeId}`)
      } catch (copyError) {
        console.error('Error mirroring SL/TP:', copyError)
      }
    }

    res.json({
      success: true,
      message: 'Trade modified successfully',
      trade
    })
  } catch (error) {
    console.error('Error modifying trade:', error)
    res.status(400).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/trade/open/:tradingAccountId - Get all open trades for an account
router.get('/open/:tradingAccountId', async (req, res) => {
  try {
    const { tradingAccountId } = req.params

    const trades = await Trade.find({ 
      tradingAccountId, 
      status: 'OPEN' 
    }).sort({ openedAt: -1 })

    res.json({
      success: true,
      trades
    })
  } catch (error) {
    console.error('Error fetching open trades:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/trade/pending/:tradingAccountId - Get all pending orders for an account
router.get('/pending/:tradingAccountId', async (req, res) => {
  try {
    const { tradingAccountId } = req.params

    const trades = await Trade.find({ 
      tradingAccountId, 
      status: 'PENDING' 
    }).sort({ createdAt: -1 })

    res.json({
      success: true,
      trades
    })
  } catch (error) {
    console.error('Error fetching pending orders:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/trade/history/:tradingAccountId - Get trade history for an account
router.get('/history/:tradingAccountId', async (req, res) => {
  try {
    const { tradingAccountId } = req.params
    const { limit = 50, offset = 0 } = req.query

    const trades = await Trade.find({ 
      tradingAccountId, 
      status: 'CLOSED' 
    })
      .sort({ closedAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))

    const total = await Trade.countDocuments({ 
      tradingAccountId, 
      status: 'CLOSED' 
    })

    res.json({
      success: true,
      trades,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (error) {
    console.error('Error fetching trade history:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/trade/summary/:tradingAccountId - Get account summary with real-time values
router.get('/summary/:tradingAccountId', async (req, res) => {
  try {
    const { tradingAccountId } = req.params
    const { prices } = req.query // JSON string of current prices

    // Check for regular trading account first
    let account = await TradingAccount.findById(tradingAccountId)
    let isChallengeAccount = false
    
    // If not found, check for challenge account
    if (!account) {
      const challengeAcc = await ChallengeAccount.findById(tradingAccountId)
      if (challengeAcc) {
        account = {
          balance: challengeAcc.currentBalance,
          credit: 0,
          equity: challengeAcc.currentEquity
        }
        isChallengeAccount = true
      }
    }
    
    if (!account) {
      return res.status(404).json({ 
        success: false, 
        message: 'Trading account not found' 
      })
    }

    const openTrades = await Trade.find({ 
      tradingAccountId, 
      status: 'OPEN' 
    })

    let currentPrices = {}
    if (prices) {
      try {
        currentPrices = JSON.parse(prices)
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Calculate used margin from open trades
    const usedMargin = openTrades.reduce((sum, t) => sum + (t.marginUsed || 0), 0)
    
    // Calculate floating PnL from current prices
    let floatingPnl = 0
    for (const trade of openTrades) {
      const priceData = currentPrices[trade.symbol]
      if (priceData) {
        const currentPrice = trade.side === 'BUY' ? priceData.bid : priceData.ask
        const pnl = trade.side === 'BUY'
          ? (currentPrice - trade.openPrice) * trade.quantity * trade.contractSize
          : (trade.openPrice - currentPrice) * trade.quantity * trade.contractSize
        floatingPnl += pnl
      }
    }

    // Calculate equity and free margin
    const balance = account.balance || 0
    const credit = account.credit || 0
    const equity = balance + credit + floatingPnl
    const freeMargin = equity - usedMargin
    const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : 0

    res.json({
      success: true,
      summary: {
        balance: Math.round(balance * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        equity: Math.round(equity * 100) / 100,
        usedMargin: Math.round(usedMargin * 100) / 100,
        freeMargin: Math.round(freeMargin * 100) / 100,
        floatingPnl: Math.round(floatingPnl * 100) / 100,
        marginLevel: Math.round(marginLevel * 100) / 100
      },
      openTradesCount: openTrades.length
    })
  } catch (error) {
    console.error('Error fetching account summary:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// POST /api/trade/check-stopout - Check and execute stop out if needed
router.post('/check-stopout', async (req, res) => {
  try {
    const { tradingAccountId, prices } = req.body

    if (!tradingAccountId) {
      return res.status(400).json({ success: false, message: 'Trading account ID required' })
    }

    let currentPrices = {}
    if (prices) {
      try {
        currentPrices = typeof prices === 'string' ? JSON.parse(prices) : prices
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Check if this is a challenge account
    const challengeAccount = await ChallengeAccount.findById(tradingAccountId)
    if (challengeAccount) {
      // For challenge accounts, check drawdown breach instead of stop out
      // This is handled by propTradingEngine during trade close
      return res.json({ success: true, stopOutTriggered: false, isChallengeAccount: true })
    }

    const result = await tradeEngine.checkStopOut(tradingAccountId, currentPrices)
    
    if (result && result.stopOutTriggered) {
      return res.json({
        success: true,
        stopOutTriggered: true,
        reason: result.reason,
        closedTradesCount: result.closedTrades?.length || 0,
        message: `STOP OUT: All trades closed due to ${result.reason}`
      })
    }

    res.json({ success: true, stopOutTriggered: false })
  } catch (error) {
    console.error('Error checking stop out:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

// POST /api/trade/cancel - Cancel a pending order
router.post('/cancel', async (req, res) => {
  try {
    const { tradeId } = req.body

    if (!tradeId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Trade ID is required' 
      })
    }

    const trade = await Trade.findById(tradeId)
    if (!trade) {
      return res.status(404).json({ 
        success: false, 
        message: 'Trade not found' 
      })
    }

    if (trade.status !== 'PENDING') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only pending orders can be cancelled' 
      })
    }

    trade.status = 'CANCELLED'
    trade.closedAt = new Date()
    trade.closedBy = 'USER'
    await trade.save()

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      trade
    })
  } catch (error) {
    console.error('Error cancelling order:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// POST /api/trade/check-sltp - Check and trigger SL/TP for challenge trades
router.post('/check-sltp', async (req, res) => {
  try {
    const { prices } = req.body

    if (!prices || typeof prices !== 'object') {
      return res.status(400).json({ 
        success: false, 
        message: 'Prices object is required' 
      })
    }

    // Check SL/TP for all open challenge trades
    const closedTrades = await propTradingEngine.checkSlTpForAllTrades(prices)

    res.json({
      success: true,
      closedCount: closedTrades.length,
      closedTrades: closedTrades.map(ct => ({
        tradeId: ct.trade.tradeId,
        symbol: ct.trade.symbol,
        reason: ct.reason,
        pnl: ct.pnl
      }))
    })
  } catch (error) {
    console.error('Error checking SL/TP:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

export default router
