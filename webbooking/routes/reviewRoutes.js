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

// PUT /api/danhgia/:id - Update Review (User)
router.put('/:id', auth, reviewController.updateReview);

// DELETE /api/danhgia/:id
router.delete('/:id', auth, reviewController.deleteReview);

const uploadController = require('../controllers/uploadController');

// POST /api/danhgia/upload - Upload Media
router.post('/upload', auth, uploadController.uploadReviewMedia);

// PUT /api/danhgia/:id/like - Toggle Like
router.put('/:id/like', auth, reviewController.likeReview);

// POST /api/danhgia/:id/reply - User Reply (Comment)
router.post('/:id/reply', auth, reviewController.commentReview);

// Toggle Subscription
router.put('/:id/subscribe', auth, reviewController.toggleSubscription);

// PUT /api/danhgia/:id/reply/:replyId/like - Like Reply
router.put('/:id/reply/:replyId/like', auth, reviewController.likeReply);

// DELETE /api/danhgia/:id/reply/:replyId - Delete Reply
router.delete('/:id/reply/:replyId', auth, reviewController.deleteReply);

// PUT /api/danhgia/:id/reply/:replyId - Update Reply
router.put('/:id/reply/:replyId', auth, reviewController.updateReply);

module.exports = router;
