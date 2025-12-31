const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

// GET /api/users/me
router.get('/me', auth, userController.getMe);

// GET /api/users (Admin)
router.get('/', auth, userController.getAllUsers);

// PUT /api/users/profile
router.put('/profile', auth, userController.updateProfile);

// GET /api/users/favorites
router.get('/favorites', auth, userController.getFavorites);

// POST /api/users/favorites/:id
router.post('/favorites/:id', auth, userController.toggleFavorite);

module.exports = router;
