const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String, // e.g., 'SYSTEM', 'PROMOTION', 'REMINDER'
        default: 'SYSTEM'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    link: {
        type: String, // Optional URL to redirect to
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', notificationSchema);
