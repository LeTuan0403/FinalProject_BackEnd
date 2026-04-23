const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const authAdmin = require('../middleware/authAdminMiddleware');
const postController = require('../controllers/postController');

// Public/User Routes
router.get('/', postController.getPublicPosts);
router.get('/my-posts', auth, postController.getMyPosts);
router.get('/:id', postController.getPostById);
router.post('/', auth, postController.createPost);
router.put('/:id', auth, postController.updatePost); // [NEW] Edit Post
router.delete('/:id', auth, postController.deletePost);
router.put('/like/:id', auth, postController.likePost);
router.post('/comment/:id', auth, postController.commentPost);
router.post('/share', auth, postController.sharePost);
router.post('/comment/reply/:id/:commentId', auth, postController.replyComment);
router.put('/comment/like/:id/:commentId', auth, postController.reactComment);
router.put('/comment/:id/:commentId', auth, postController.updateComment);
router.delete('/comment/:id/:commentId', auth, postController.deleteComment);

// Admin Routes
router.get('/admin/all', auth, authAdmin, postController.getAllPostsAdmin);
router.put('/admin/approve/:id', auth, authAdmin, postController.approvePost);
router.put('/admin/reject/:id', auth, authAdmin, postController.rejectPost);

module.exports = router;
