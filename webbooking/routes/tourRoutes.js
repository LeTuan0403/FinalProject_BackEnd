const express = require('express');
const router = express.Router();
const tourController = require('../controllers/tourController');
const auth = require('../middleware/authMiddleware');

// GET all tours
router.get('/', tourController.getAllTours);

// GET tours by current user
router.get('/user/me', auth, tourController.getToursByUser);

// GET tour by ID (Legacy ID)
router.get('/:id', tourController.getTourById);

// POST /api/tours/custom - Create Custom Tour
router.post('/custom', auth, tourController.createCustomTour);

// PUT /api/tours/custom/:id - Update Custom Tour
router.put('/custom/:id', auth, tourController.updateCustomTour);

// DELETE /api/tours/custom/:id - Delete Custom Tour
router.delete('/custom/:id', auth, tourController.deleteCustomTour);

// FALLBACK: DELETE /api/tours/:id - Handle delete if client misses /custom
router.delete('/:id', auth, tourController.deleteCustomTour);

// POST /api/tours - Create Tour (Protected)
router.post('/', auth, tourController.createTour);

// PUT /api/tours/approve/:id - Approve Tour (Admin)
router.put('/approve/:id', auth, tourController.approveTour);

// PUT /api/tours/:id - Update Tour (Admin/Standard)
router.put('/:id', auth, tourController.updateTour);

module.exports = router;
