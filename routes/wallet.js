import express from 'express'
import Wallet from '../models/Wallet.js'
import Transaction from '../models/Transaction.js'
import TradingAccount from '../models/TradingAccount.js'

const router = express.Router()

// GET /api/wallet/:userId - Get user wallet
router.get('/:userId', async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.params.userId })
    if (!wallet) {
      wallet = new Wallet({ userId: req.params.userId, balance: 0 })
      await wallet.save()
    }
    res.json({ wallet })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wallet', error: error.message })
  }
})

// POST /api/wallet/deposit - Create deposit request
router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, paymentMethod, transactionRef, screenshot } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 })
      await wallet.save()
    }

    // Create transaction
    const transaction = new Transaction({
      userId,
      walletId: wallet._id,
      type: 'Deposit',
      amount,
      paymentMethod,
      transactionRef,
      screenshot,
      status: 'Pending'
    })
    await transaction.save()

    // Update pending deposits
    wallet.pendingDeposits += amount
    await wallet.save()

    res.status(201).json({ message: 'Deposit request submitted', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error creating deposit', error: error.message })
  }
})

// POST /api/wallet/withdraw - Create withdrawal request
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount, paymentMethod } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' })
    }

    // Check balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' })
    }

    // Create transaction
    const transaction = new Transaction({
      userId,
      walletId: wallet._id,
      type: 'Withdrawal',
      amount,
      paymentMethod,
      status: 'Pending'
    })
    await transaction.save()

    // Deduct from balance and add to pending
    wallet.balance -= amount
    wallet.pendingWithdrawals += amount
    await wallet.save()

    res.status(201).json({ message: 'Withdrawal request submitted', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error creating withdrawal', error: error.message })
  }
})

// POST /api/wallet/transfer-to-trading - Transfer from wallet to trading account
router.post('/transfer-to-trading', async (req, res) => {
  try {
    const { userId, tradingAccountId, amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' })
    }

    // Check wallet balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' })
    }

    // Get trading account
    const tradingAccount = await TradingAccount.findById(tradingAccountId)
    if (!tradingAccount) {
      return res.status(404).json({ message: 'Trading account not found' })
    }

    // Verify ownership
    if (tradingAccount.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' })
    }

    // Transfer funds
    wallet.balance -= amount
    tradingAccount.balance += amount

    await wallet.save()
    await tradingAccount.save()

    res.json({ 
      message: 'Funds transferred successfully',
      walletBalance: wallet.balance,
      tradingAccountBalance: tradingAccount.balance
    })
  } catch (error) {
    res.status(500).json({ message: 'Error transferring funds', error: error.message })
  }
})

// POST /api/wallet/transfer-from-trading - Transfer from trading account to wallet
router.post('/transfer-from-trading', async (req, res) => {
  try {
    const { userId, tradingAccountId, amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get trading account
    const tradingAccount = await TradingAccount.findById(tradingAccountId)
    if (!tradingAccount) {
      return res.status(404).json({ message: 'Trading account not found' })
    }

    // Verify ownership
    if (tradingAccount.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' })
    }

    // Check trading account balance
    if (tradingAccount.balance < amount) {
      return res.status(400).json({ message: 'Insufficient trading account balance' })
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 })
    }

    // Transfer funds
    tradingAccount.balance -= amount
    wallet.balance += amount

    await tradingAccount.save()
    await wallet.save()

    res.json({ 
      message: 'Funds transferred successfully',
      walletBalance: wallet.balance,
      tradingAccountBalance: tradingAccount.balance
    })
  } catch (error) {
    res.status(500).json({ message: 'Error transferring funds', error: error.message })
  }
})

// GET /api/wallet/transactions/:userId - Get user transactions
router.get('/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
    res.json({ transactions })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message })
  }
})

// GET /api/wallet/transactions/all - Get all transactions (admin)
router.get('/admin/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
    res.json({ transactions })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message })
  }
})

// PUT /api/wallet/admin/approve/:id - Approve transaction (admin)
router.put('/admin/approve/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    const wallet = await Wallet.findById(transaction.walletId)

    if (transaction.type === 'DEPOSIT') {
      wallet.balance += transaction.amount
      if (wallet.pendingDeposits) wallet.pendingDeposits -= transaction.amount
    } else {
      if (wallet.pendingWithdrawals) wallet.pendingWithdrawals -= transaction.amount
    }

    transaction.status = 'APPROVED'
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    res.json({ message: 'Transaction approved', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error approving transaction', error: error.message })
  }
})

// PUT /api/wallet/admin/reject/:id - Reject transaction (admin)
router.put('/admin/reject/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    const wallet = await Wallet.findById(transaction.walletId)

    if (transaction.type === 'DEPOSIT') {
      if (wallet.pendingDeposits) wallet.pendingDeposits -= transaction.amount
    } else {
      // Refund withdrawal amount
      wallet.balance += transaction.amount
      if (wallet.pendingWithdrawals) wallet.pendingWithdrawals -= transaction.amount
    }

    transaction.status = 'REJECTED'
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    res.json({ message: 'Transaction rejected', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting transaction', error: error.message })
  }
})

// PUT /api/wallet/transaction/:id/approve - Approve transaction (admin)
router.put('/transaction/:id/approve', async (req, res) => {
  try {
    const { adminRemarks } = req.body
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'Pending') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    const wallet = await Wallet.findById(transaction.walletId)

    if (transaction.type === 'Deposit') {
      wallet.balance += transaction.amount
      wallet.pendingDeposits -= transaction.amount
    } else {
      wallet.pendingWithdrawals -= transaction.amount
    }

    transaction.status = 'Approved'
    transaction.adminRemarks = adminRemarks || ''
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    res.json({ message: 'Transaction approved', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error approving transaction', error: error.message })
  }
})

// PUT /api/wallet/transaction/:id/reject - Reject transaction (admin)
router.put('/transaction/:id/reject', async (req, res) => {
  try {
    const { adminRemarks } = req.body
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'Pending') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    const wallet = await Wallet.findById(transaction.walletId)

    if (transaction.type === 'Deposit') {
      wallet.pendingDeposits -= transaction.amount
    } else {
      // Refund withdrawal amount
      wallet.balance += transaction.amount
      wallet.pendingWithdrawals -= transaction.amount
    }

    transaction.status = 'Rejected'
    transaction.adminRemarks = adminRemarks || ''
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    res.json({ message: 'Transaction rejected', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting transaction', error: error.message })
  }
})

export default router
