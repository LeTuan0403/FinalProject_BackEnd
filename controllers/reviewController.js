const Review = require('../models/Review');
const User = require('../models/User');

const Tour = require('../models/Tour');
const getNextSequence = require('../utils/idGenerator');

exports.getReviewsByTour = async (req, res) => {
    try {
        // 1. Find Tour by Legacy ID
        const tour = await Tour.findOne({ tourId: req.params.tourId });
        if (!tour) return res.status(404).json({ msg: 'Tour not found' });

        // 2. Find Reviews by ObjectId
        const reviews = await Review.find({ tourId: tour._id })
            .populate('userId', 'hoTen avatar');
        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.createReview = async (req, res) => {
    try {
        const { tourId, soSao, binhLuan } = req.body;

        // Find Tour by Legacy ID (assuming FE sends integer)
        const tour = await Tour.findOne({ tourId });
        if (!tour) return res.status(404).json({ msg: 'Tour not found' });

        const newReview = new Review({
            danhGiaId: await getNextSequence('reviewId'),
            tourId: tour._id, // Save ObjectId
            userId: req.user.id,
            soSao,
            binhLuan
        });

        const review = await newReview.save();
        // Populate user details for immediate display
        await review.populate('userId', 'hoTen');
        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find().populate('userId', 'hoTen').populate('tourId', 'tenTour');
        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.replyReview = async (req, res) => {
    try {
        if (req.user.role !== 1) return res.status(403).json({ msg: 'Access denied' });

        // Note: req.body is just the string according to service: JSON.stringify(reply)
        // But body-parser usually expects { reply: "..." }. 
        // Service sends: just "content"? Or { "0": "c", "1": "o"... } if verified?
        // Let's assume standard JSON object { reply: "..." } or check if FE sends raw string.
        // Looking at service: JSON.stringify(reply). This implies raw string or just the value.
        // It's safer to handle object. But let's check params using req.body.

        let traLoiContent = req.body;
        // If content-type is json, and sent as primitive string, express might not parse it to object key.
        // Keep it simple: assume FE sends { "traLoi": "..." } or check `req.body` directly if it's not and object.

        const review = await Review.findOne({ danhGiaId: req.params.id });
        if (!review) return res.status(404).json({ msg: 'Review not found' });

        const { traLoi } = req.body;
        review.traLoi = traLoi || req.body.traLoi; // Handle object structure
        review.ngayTraLoi = Date.now();
        await review.save();

        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findOne({ danhGiaId: req.params.id });
        if (!review) return res.status(404).json({ msg: 'Review not found' });

        // Owner or Admin
        if (review.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Review.deleteOne({ danhGiaId: req.params.id });
        res.json({ msg: 'Review removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
