const Review = require('../models/Review');
const User = require('../models/User');
const Tour = require('../models/Tour'); // Ensure Tour is imported if not already
// const { sendReviewReplyEmail } = require('../utils/emailService'); // Removed as per lint
const { createNotification } = require('./userNotificationController');
const getNextSequence = require('../utils/idGenerator');

// --- Helper Functions ---
const handleError = (res, err) => {
    console.error(err.message);
    res.status(500).send('Server Error');
};

const findReview = async (id, res) => {
    const review = await Review.findOne({ danhGiaId: id });
    if (!review) {
        res.status(404).json({ msg: 'Review not found' });
        return null;
    }
    return review;
};

const findReply = (review, replyId, res) => {
    const reply = review.replies.id(replyId);
    if (!reply) {
        res.status(404).json({ msg: 'Reply not found' });
        return null;
    }
    return reply;
};
// ------------------------

exports.getReviewsByTour = async (req, res) => {
    try {
        // 1. Find Tour by Legacy ID
        const tour = await Tour.findOne({ tourId: req.params.tourId });
        if (!tour) { return res.status(404).json({ msg: 'Tour not found' }); }

        // 2. Find Reviews by ObjectId
        const reviews = await Review.find({ tourId: tour._id })
            .populate('userId', 'hoTen avatar userId isAdmin email')
            .populate('replies.userId', 'hoTen avatar userId isAdmin email');
        res.json(reviews);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createReview = async (req, res) => {
    try {
        const { tourId, soSao, binhLuan, isAnonymous, media } = req.body;

        // Find Tour by Legacy ID (assuming FE sends integer)
        const tour = await Tour.findOne({ tourId });
        if (!tour) { return res.status(404).json({ msg: 'Tour not found' }); }

        // --- NEW CHECK: User must have COMPLETED booking (Hoàn tất) ---
        const Booking = require('../models/Booking');
        const hasCompletedBooking = await Booking.findOne({
            userId: req.user.id,
            tourId: tour._id,
            trangThai: 'Hoàn tất'
        });

        if (!hasCompletedBooking) {
            return res.status(403).json({ msg: 'Bạn chỉ có thể đánh giá tour sau khi đã trải nghiệm (trạng thái Hoàn tất).' });
        }

        const newReview = new Review({
            danhGiaId: await getNextSequence('reviewId'),
            tourId: tour._id, // Save ObjectId
            userId: req.user.id,
            soSao,
            binhLuan,
            isAnonymous: isAnonymous || false,
            subscribers: [req.user.id], // Auto-subscribe creator
            media: media || []
        });

        const review = await newReview.save();
        // Populate user details for immediate display
        await review.populate('userId', 'hoTen userId');

        if (req.io) {
            req.io.emit('admin_notification', {
                type: 'review',
                message: `Đánh giá mới ${soSao} sao`,
                data: review
            });
        }

        res.json(review);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate('userId', 'hoTen userId isAdmin email')
            .populate('tourId', 'tenTour')
            .populate('replies.userId', 'hoTen avatar userId isAdmin email');
        res.json(reviews);
    } catch (err) {
        handleError(res, err);
    }
};

exports.replyReview = async (req, res) => {
    try {
        if (!req.user.isAdmin) { return res.status(403).json({ msg: 'Access denied' }); }

        // Note: req.body is just the string according to service: JSON.stringify(reply)
        // But body-parser usually expects { reply: "..." }. 
        // Service sends: just "content"? Or { "0": "c", "1": "o"... } if verified?
        // Let's assume standard JSON object { reply: "..." } or check if FE sends raw string.
        // Looking at service: JSON.stringify(reply). This implies raw string or just the value.
        // It's safer to handle object. But let's check params using req.body.

        // const traLoiContent = req.body;
        // If content-type is json, and sent as primitive string, express might not parse it to object key.
        // Keep it simple: assume FE sends { "traLoi": "..." } or check `req.body` directly if it's not and object.

        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        const { traLoi } = req.body;
        review.traLoi = traLoi || req.body.traLoi; // Handle object structure
        review.ngayTraLoi = Date.now();
        await review.save();

        // Auto-subscribe Admin if not already subscribed
        if (!review.subscribers.includes(req.user.id)) {
            review.subscribers.push(req.user.id);
            await review.save();
        }

        // Send Email Notification to ALL subscribers (except admin sender)
        const subscribers = review.subscribers.filter(id => id.toString() !== req.user.id);

        if (subscribers.length > 0) {
            const tour = await Tour.findById(review.tourId);
            // Fetch recipient details
            const recipientUsers = await User.find({ '_id': { $in: subscribers } });

            for (const user of recipientUsers) {
                if (user) {
                    // Replaced Email with Notification
                    await createNotification({
                        userId: user._id,
                        legacyUserId: user.userId,
                        title: 'Phản hồi mới',
                        message: `Admin đã trả lời đánh giá của bạn về tour "${tour ? tour.tenTour : '...'}"`,
                        type: 'COMMUNITY',
                        link: `/tours/${tour ? tour.tourId : review.tourId}#review-${review.danhGiaId}`
                    }, req.io);
                }
            }
        }

        // Notify Admin if replier is not admin
        if (req.user.role !== 1 && req.io) {
            req.io.emit('admin_notification', {
                type: 'review', // reused 'review' type or 'review_reply'
                message: `Phản hồi mới từ người dùng trong đánh giá tour`,
                data: review
            });
        }

        res.json(review);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateReview = async (req, res) => {
    try {
        const { soSao, binhLuan, isAnonymous, media } = req.body;
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        // Ensure user owns review
        if (review.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        review.soSao = soSao || review.soSao;
        review.binhLuan = binhLuan || review.binhLuan;
        if (typeof isAnonymous !== 'undefined') {
            review.isAnonymous = isAnonymous;
        }
        if (media) {
            review.media = media;
        }

        await review.save();
        await review.populate('userId', 'hoTen userId'); // Ensure returned data is populated
        res.json(review);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteReview = async (req, res) => {
    try {
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        // Owner or Admin
        if (review.userId.toString() !== req.user.id && !req.user.isAdmin) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Review.deleteOne({ danhGiaId: req.params.id });
        res.json({ msg: 'Review removed' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.likeReview = async (req, res) => {
    try {
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        // Check if already liked
        const likeIndex = review.likes.indexOf(req.user.id);

        if (likeIndex > -1) {
            // Unlike
            review.likes.splice(likeIndex, 1);
        } else {
            // Like
            review.likes.push(req.user.id);
        }

        await review.save();
        res.json(review.likes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.commentReview = async (req, res) => {
    try {
        const { content, isAnonymous, media } = req.body;
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        const newReply = {
            userId: req.user.id,
            content,
            isAnonymous: isAnonymous || false,
            createdAt: Date.now(),
            media: media || [],
            likes: []
        };

        review.replies.push(newReply);
        await review.save();

        // Auto-subscribe replier if not already subscribed
        if (!review.subscribers.includes(req.user.id)) {
            review.subscribers.push(req.user.id);
            await review.save();
        }

        // Send Email Notification to ALL subscribers (except sender)
        const subscribers = review.subscribers.filter(id => id.toString() !== req.user.id);

        if (subscribers.length > 0) {
            const tour = await Tour.findById(review.tourId);
            const replier = await User.findById(req.user.id);
            const replierName = isAnonymous ? 'Người dùng ẩn danh' : (replier?.hoTen || 'Một người dùng');

            // Fetch visitor details for emails (batch)
            const recipientUsers = await User.find({ '_id': { $in: subscribers } });

            for (const user of recipientUsers) {
                if (user) {
                    // Replaced Email with Notification
                    await createNotification({
                        userId: user._id,
                        legacyUserId: user.userId,
                        title: 'Bình luận mới',
                        message: `${replierName} đã trả lời trong đánh giá tour "${tour ? tour.tenTour : '...'}"`,
                        type: 'COMMUNITY',
                        link: `/tours/${tour ? tour.tourId : review.tourId}#review-${review.danhGiaId}`
                    }, req.io);
                }
            }
        }

        // Populate replies user info
        await review.populate('replies.userId', 'hoTen avatar userId isAdmin email');

        res.json(review.replies);
    } catch (err) {
        handleError(res, err);
    }
};

exports.likeReply = async (req, res) => {
    try {
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        const reply = findReply(review, req.params.replyId, res);
        if (!reply) { return; }

        // Check if already liked
        const likeIndex = reply.likes.indexOf(req.user.id);

        if (likeIndex > -1) {
            // Unlike
            reply.likes.splice(likeIndex, 1);
        } else {
            // Like
            reply.likes.push(req.user.id);
        }

        await review.save();
        res.json(reply.likes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteReply = async (req, res) => {
    try {
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        const reply = findReply(review, req.params.replyId, res);
        if (!reply) { return; }

        // Check user authorization
        if (reply.userId.toString() !== req.user.id && !req.user.isAdmin) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Pull the reply from the array
        review.replies.pull(req.params.replyId);
        await review.save();

        // Repopulate for frontend update
        await review.populate('replies.userId', 'hoTen avatar userId isAdmin email');

        res.json(review.replies);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateReply = async (req, res) => {
    try {
        const { content, media } = req.body;
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        const reply = findReply(review, req.params.replyId, res);
        if (!reply) { return; }

        // Check user authorization
        if (reply.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        if (content) { reply.content = content; }
        if (media) { reply.media = media; } // Overwrite media

        await review.save();

        // Repopulate for frontend update
        await review.populate('replies.userId', 'hoTen avatar userId isAdmin email');

        res.json(review.replies);
    } catch (err) {
        handleError(res, err);
    }
};

exports.toggleSubscription = async (req, res) => {
    try {
        const review = await findReview(req.params.id, res);
        if (!review) { return; }

        // Allow any authenticated user to toggle subscription
        // No ownership check needed for subscription itself

        const userId = req.user.id;
        const index = review.subscribers.indexOf(userId);

        if (index > -1) {
            // Unsubscribe
            review.subscribers.splice(index, 1);
        } else {
            // Subscribe
            review.subscribers.push(userId);
        }

        await review.save();

        res.json({ subscribers: review.subscribers });
    } catch (err) {
        handleError(res, err);
    }
};
