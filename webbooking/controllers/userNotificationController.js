const Notification = require('../models/Notification');

// Get my notifications
exports.getMyNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);

        const unreadCount = await Notification.countDocuments({ user: req.user.id, isRead: false });

        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// Mark as read
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
        }

        res.json({ success: true, notification });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.user.id, isRead: false },
            { isRead: true }
        );
        res.json({ success: true, message: "Đã đánh dấu tất cả là đã đọc" });
    } catch (error) {
        console.error("Error marking all as read:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// Delete notification
exports.deleteNotification = async (req, res) => {
    try {
        const result = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        if (!result) {
            return res.status(404).json({ success: false, message: "Không tìm thấy thông báo" });
        }
        res.json({ success: true, message: "Đã xóa thông báo" });
    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

// Internal: Create Notification
exports.createNotification = async ({ userId, legacyUserId, title, message, type = 'SYSTEM', link = '' }, io) => {
    try {
        const notification = new Notification({
            user: userId, // ObjectId for DB
            title,
            message,
            type,
            link
        });
        await notification.save();

        if (io) {
            // Prefer legacyUserId (integer) for socket room if provided, fitting frontend/legacy SQL data
            const targetRoom = legacyUserId ? `user_${legacyUserId}` : `user_${userId}`;
            console.log(`[Notification Debug] Socket emitting user_notification to room: ${targetRoom}`);
            io.to(targetRoom).emit('user_notification', notification);
        }

        return notification;
    } catch (error) {
        console.error("Error creating notification:", error);
    }
};
