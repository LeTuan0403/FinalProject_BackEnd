const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const reviewController = require('../controllers/reviewController');

// GET /api/danhgia/tour/:tourId
router.get('/tour/:tourId', reviewController.getReviewsByTour);

// POST /api/danhgia - Create Review
router.post('/', auth, reviewController.createReview);

// GET /api/danhgia - All Reviews (Admin usually)
router.get('/', reviewController.getAllReviews);

// PUT /api/danhgia/:id/reply - Admin Reply
router.put('/:id/reply', auth, reviewController.replyReview);

// DELETE /api/danhgia/:id
router.delete('/:id', auth, reviewController.deleteReview);

module.exports = router;
