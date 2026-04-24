const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const auth = require('../middleware/authMiddleware');

// Upload post media
router.post('/posts', auth, uploadController.uploadPostMedia);

module.exports = router;
