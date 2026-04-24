const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    media: [{
        type: String // URLs to images/videos
    }],
    linkedTourId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tour'
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        content: { type: String, required: true },
        likes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        replies: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            content: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            likes: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }]
        }],
        createdAt: { type: Date, default: Date.now }
    }],
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    sharedPostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        default: null
    },
    isRewardClaimed: {
        type: Boolean,
        default: false
    },
    rewardLevel: {
        type: Number,
        default: 0
    },
    shareCount: {
        type: Number,
        default: 0
    },
    moderationData: {
        isSafe: { type: Boolean, default: true },
        confidence: { type: Number, default: 0 },
        reason: { type: String, default: '' },
        flaggedCategories: [{ type: String }]
    }
});

module.exports = mongoose.model('Post', PostSchema);
