import express from 'express'
import PaymentMethod from '../models/PaymentMethod.js'

const router = express.Router()

// GET /api/payment-methods - Get all active payment methods (for users)
router.get('/', async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ isActive: true })
    res.json({ paymentMethods })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment methods', error: error.message })
  }
})

// GET /api/payment-methods/all - Get all payment methods (for admin)
router.get('/all', async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find()
    res.json({ paymentMethods })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching payment methods', error: error.message })
  }
})

// POST /api/payment-methods - Create payment method (admin)
router.post('/', async (req, res) => {
  try {
    const { type, bankName, accountNumber, accountHolderName, ifscCode, upiId, qrCodeImage } = req.body
    const paymentMethod = new PaymentMethod({
      type,
      bankName,
      accountNumber,
      accountHolderName,
      ifscCode,
      upiId,
      qrCodeImage
    })
    await paymentMethod.save()
    res.status(201).json({ message: 'Payment method created', paymentMethod })
  } catch (error) {
    res.status(500).json({ message: 'Error creating payment method', error: error.message })
  }
})

// PUT /api/payment-methods/:id - Update payment method (admin)
router.put('/:id', async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' })
    }
    res.json({ message: 'Payment method updated', paymentMethod })
  } catch (error) {
    res.status(500).json({ message: 'Error updating payment method', error: error.message })
  }
})

// DELETE /api/payment-methods/:id - Delete payment method (admin)
router.delete('/:id', async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findByIdAndDelete(req.params.id)
    if (!paymentMethod) {
      return res.status(404).json({ message: 'Payment method not found' })
    }
    res.json({ message: 'Payment method deleted' })
  } catch (error) {
    res.status(500).json({ message: 'Error deleting payment method', error: error.message })
  }
})

export default router
