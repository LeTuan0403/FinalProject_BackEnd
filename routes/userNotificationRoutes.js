const express = require('express');
const router = express.Router();
const userNotificationController = require('../controllers/userNotificationController');
const protect = require('../middleware/authMiddleware');

router.get('/', protect, userNotificationController.getMyNotifications);
router.put('/:id/read', protect, userNotificationController.markAsRead);
router.put('/read-all', protect, userNotificationController.markAllAsRead);
router.delete('/:id', protect, userNotificationController.deleteNotification);

module.exports = router;
