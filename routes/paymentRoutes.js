const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Helper to wrap async route handlers
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Poll status
router.get('/check-status/:bookingId', asyncHandler(paymentController.checkPaymentStatus));

// Webhook (SePay calls this)
router.post('/sepay-webhook', asyncHandler(paymentController.handleSepayWebhook));

module.exports = router;
