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

// DELETE /api/dondattours/:id - Delete Booking
router.delete('/:id', auth, bookingController.deleteBooking);

module.exports = router;
