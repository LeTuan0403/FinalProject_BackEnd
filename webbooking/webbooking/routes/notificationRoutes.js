const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// GET /api/admin/notifications/counts
router.get('/counts', notificationController.getCounts);

module.exports = router;
