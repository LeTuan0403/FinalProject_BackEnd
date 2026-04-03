const mongoose = require('mongoose');

const MediaSchema = {
    type: { type: String, enum: ['image', 'video'] },
    url: { type: String }
};

const LikesSchema = [{ type: String, ref: 'User' }];

const reviewSchema = new mongoose.Schema({
    danhGiaId: { type: Number, required: true, unique: true },
    tourId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    soSao: { type: Number, min: 1, max: 5 },
    binhLuan: String,
    ngayDanhGia: { type: Date, default: Date.now },
    isAnonymous: { type: Boolean, default: false },
    subscribers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // List of users subscribed to this thread
    media: [MediaSchema],
    likes: LikesSchema, // Store User IDs
    replies: [
        {
            userId: { type: String, ref: 'User' },
            content: String,
            createdAt: { type: Date, default: Date.now },
            isAnonymous: { type: Boolean, default: false },
            media: [MediaSchema],
            likes: LikesSchema
        }
    ]
});

module.exports = mongoose.model('Review', reviewSchema);
