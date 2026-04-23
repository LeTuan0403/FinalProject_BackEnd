const mongoose = require('mongoose');

// 1. Tách Schema tin nhắn ra riêng để dễ quản lý
const messageSchema = new mongoose.Schema({
    senderId: { type: String }, // userId hoặc 'admin'
    text: { type: String },
    type: {
        type: String,
        enum: ['text', 'tour_card'],
        default: 'text'
    },
    tourId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tour'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // --- MỚI: Thêm trường này để đánh dấu tin nhắn của AI ---
    metaData: {
        isAiGenerated: { type: Boolean, default: false }
    }
});

// 2. Schema cuộc hội thoại chính
const conversationSchema = new mongoose.Schema({
    members: {
        type: Array, // [userId/guestId, adminId]
    },
    lastMessage: {
        type: String,
        default: ""
    },
    isReadByAdmin: {
        type: Boolean,
        default: false
    },
    isReadByUser: {
        type: Boolean,
        default: true // User gửi thì mặc định là user đã đọc
    },
    guestName: {
        type: String, // Tên khách vãng lai
    },
    unreadSince: {
        type: Date,
        default: null
    },
    // Nhúng schema tin nhắn vào đây
    messages: [messageSchema]

}, { timestamps: true });

module.exports = mongoose.model("Conversation", conversationSchema);