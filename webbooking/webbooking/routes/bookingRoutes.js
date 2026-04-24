const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const bookingController = require('../controllers/bookingController');

// POST /api/dondattours - Create Booking
router.post('/', auth, bookingController.createBooking);

// GET /api/dondattours/my-bookings - Get User Bookings
router.get('/my-bookings', auth, bookingController.getMyBookings);

// GET /api/dondattours/all - Get All Bookings (Admin)
router.get('/all', auth, bookingController.getAllBookings);

// GET /api/dondattours/:id - Get Booking Detail
router.get('/:id', auth, bookingController.getBookingById);

// PUT /api/dondattours/:id/cancel
router.put('/:id/cancel', auth, bookingController.cancelBooking);

// PUT /api/dondattours/:id - Update Booking
router.put('/:id', auth, bookingController.updateBooking);

// DELETE /api/dondattours/:id - Delete Booking
router.delete('/:id', auth, bookingController.deleteBooking);

// POST /api/dondattours/:id/request-refund - Request Refund OTP
router.post('/:id/request-refund', auth, bookingController.requestRefundOtp);

// POST /api/dondattours/:id/confirm-refund - Confirm Request with OTP
router.post('/:id/confirm-refund', auth, bookingController.confirmRefundRequest);

// PUT /api/dondattours/:id/admin-confirm-refund - Admin mark as Refunded
router.put('/:id/admin-confirm-refund', auth, bookingController.adminConfirmRefund);

module.exports = router;
