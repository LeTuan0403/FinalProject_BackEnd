const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware'); // For admin check
const contactController = require('../controllers/contactController');

// POST /api/LienHe (Public)
router.post('/', contactController.createContact);

// GET /api/LienHe (Admin)
router.get('/', auth, contactController.getAllContacts);

// POST /api/LienHe/reply (Admin)
router.post('/reply', auth, contactController.replyContact);

// DELETE /api/LienHe/:id (Admin)
router.delete('/:id', auth, contactController.deleteContact);

module.exports = router;
