const Tour = require('../models/Tour');
const mongoose = require('mongoose');
const getNextSequence = require('../utils/idGenerator');

exports.getAllTours = async (req, res) => {
    try {
        const { mode } = req.query;
        let query = {};

        // If NOT admin mode, only show standard tours (exclude custom tours)
        if (mode !== 'admin') {
            query.isTuChon = { $ne: true };
        }

        const tours = await Tour.find(query).populate('lichTrinh.diaDiemId');
        res.json(tours);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getTourById = async (req, res) => {
    try {
        const tour = await Tour.findOne({ tourId: req.params.id }).populate('lichTrinh.diaDiemId');
        if (!tour) return res.status(404).json({ msg: 'Tour not found' });
        res.json(tour);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.createTour = async (req, res) => {
    try {
        const newTour = new Tour({
            tourId: await getNextSequence('tourId'),
            ...req.body
        });
        const tour = await newTour.save();
        res.json(tour);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.createCustomTour = async (req, res, next) => {
    try {
        const { tourChiTiets, ...rest } = req.body;
        const lichTrinh = [];

        // Map tourChiTiets (Frontend) to lichTrinh (Backend)
        if (tourChiTiets && Array.isArray(tourChiTiets)) {
            const Location = require('../models/Location');
            for (const item of tourChiTiets) {
                let locationObjectId = null;
                const rawId = item.diaDiemId;

                // Robust ID handling
                if (rawId) {
                    if (typeof rawId === 'number') {
                        // Legacy handling
                        const loc = await Location.findOne({ diaDiemId: rawId });
                        if (loc) locationObjectId = loc._id;
                    } else if (typeof rawId === 'object' && rawId._id) {
                        // Populated object handling
                        locationObjectId = rawId._id;
                    } else if (typeof rawId === 'string' && mongoose.Types.ObjectId.isValid(rawId)) {
                        // Standard ObjectId string
                        locationObjectId = rawId;
                    }
                }

                // Allow items without location (e.g., free time, meals)
                lichTrinh.push({
                    diaDiemId: locationObjectId, // Can be null
                    thuTu: item.thuTu,
                    ngayThu: item.ngayThu,
                    thoiGian: item.thoiGian,
                    ghiChu: item.ghiChu,
                });
            }
        }

        const newTour = new Tour({
            tourId: await getNextSequence('tourId'),
            isTuChon: true,
            daDuyet: 0,
            nguoiTaoId: req.user.id, // Authenticated User ID
            lichTrinh: lichTrinh,
            ...rest
        });

        const tour = await newTour.save();
        res.json(tour);
    } catch (err) {
        if (typeof next === 'function') next(err);
        else {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    }
};

exports.getToursByUser = async (req, res, next) => {
    try {
        const tours = await Tour.find({ nguoiTaoId: req.user.id }).populate('lichTrinh.diaDiemId');
        res.json(tours);
    } catch (err) {
        if (typeof next === 'function') next(err);
        else res.status(500).send('Server Error');
    }
};

exports.updateCustomTour = async (req, res, next) => {
    try {
        const { tourChiTiets, ...rest } = req.body;
        const lichTrinh = [];

        // Map tourChiTiets (Frontend) to lichTrinh (Backend)
        if (tourChiTiets && Array.isArray(tourChiTiets)) {
            const Location = require('../models/Location');
            for (const item of tourChiTiets) {
                let locationObjectId = null;
                const rawId = item.diaDiemId;

                if (rawId) {
                    if (typeof rawId === 'number') {
                        const loc = await Location.findOne({ diaDiemId: rawId });
                        if (loc) locationObjectId = loc._id;
                    } else if (typeof rawId === 'object' && rawId._id) {
                        locationObjectId = rawId._id;
                    } else if (typeof rawId === 'string' && mongoose.Types.ObjectId.isValid(rawId)) {
                        locationObjectId = rawId;
                    }
                }

                // Allow items without location
                lichTrinh.push({
                    diaDiemId: locationObjectId, // Can be null
                    thuTu: item.thuTu,
                    ngayThu: item.ngayThu,
                    thoiGian: item.thoiGian,
                    ghiChu: item.ghiChu,
                });
            }
        }

        const updateData = {
            ...rest,
            lichTrinh: lichTrinh
        };

        const tour = await Tour.findOneAndUpdate(
            { tourId: req.params.id, nguoiTaoId: req.user.id },
            updateData,
            { new: true }
        );

        if (!tour) return res.status(404).json({ msg: 'Tour not found or unauthorized' });
        res.json(tour);

    } catch (err) {
        if (typeof next === 'function') next(err);
        else {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    }
};

exports.approveTour = async (req, res, next) => {
    try {
        const tour = await Tour.findOneAndUpdate(
            { tourId: req.params.id },
            { daDuyet: 1 }, // 1 = Approved
            { new: true }
        );

        if (!tour) return res.status(404).json({ msg: 'Tour not found' });
        res.json(tour);
    } catch (err) {
        if (typeof next === 'function') next(err);
        else res.status(500).send('Server Error');
    }
};

exports.deleteCustomTour = async (req, res, next) => {
    try {


        // Try to find tour by tourId (Number) OR _id (ObjectId)
        let query = { tourId: req.params.id };
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            query = { _id: req.params.id };
        }

        // Find first, then check auth
        // We use query $or to be safe if ID is ambiguous, but usually req.params.id is distinct
        // Let's rely on finding by tourId first as per schema
        let tour = await Tour.findOne({ tourId: req.params.id });
        if (!tour && mongoose.Types.ObjectId.isValid(req.params.id)) {
            tour = await Tour.findOne({ _id: req.params.id });
        }

        if (!tour) {

            return res.status(404).json({ msg: 'Tour not found' });
        }



        // Check ownership
        // nguoiTaoId is ObjectId, req.user.id is String. toString() comparison needed.
        const isOwner = tour.nguoiTaoId && tour.nguoiTaoId.toString() === req.user.id;
        const isAdmin = req.user.role === 1;

        if (!isOwner && !isAdmin) {

            return res.status(401).json({ msg: 'User not authorized' });
        }

        await Tour.findByIdAndDelete(tour._id);


        res.json({ msg: 'Tour deleted' });
    } catch (err) {
        if (typeof next === 'function') next(err);
        else res.status(500).send('Server Error');
    }
};

exports.updateTour = async (req, res, next) => {
    try {
        const { tourChiTiets, _id, tourId, ngayTao, nguoiTaoId, ...rest } = req.body;

        const lichTrinh = [];

        // Logic similar to create/update custom tour for handling lichTrinh
        if (tourChiTiets && Array.isArray(tourChiTiets)) {
            const Location = require('../models/Location');
            for (const item of tourChiTiets) {
                let locationObjectId = null;
                const rawId = item.diaDiemId;

                if (rawId) {
                    if (typeof rawId === 'number') {
                        const loc = await Location.findOne({ diaDiemId: rawId });
                        if (loc) locationObjectId = loc._id;
                    } else if (typeof rawId === 'object' && rawId._id) {
                        locationObjectId = rawId._id;
                    } else if (typeof rawId === 'string' && mongoose.Types.ObjectId.isValid(rawId)) {
                        locationObjectId = rawId;
                    }
                }

                // Allow items without location (e.g., free time, meals)
                lichTrinh.push({
                    diaDiemId: locationObjectId, // Can be null
                    thuTu: item.thuTu,
                    ngayThu: item.ngayThu,
                    thoiGian: item.thoiGian,
                    ghiChu: item.ghiChu,
                    tieuDe: item.tieuDe,
                    hinhAnh: item.hinhAnh
                });
            }
        }

        const updateData = { ...rest };
        if (lichTrinh.length > 0) {
            updateData.lichTrinh = lichTrinh;
        }

        // Use findOneAndUpdate with tourId (Number)
        // If req.params.id is passed as string "1", Mongoose might auto-cast if schema is Number, but safer to parse if needed.
        // However, findOneAndUpdate query is { tourId: req.params.id }. 

        const tour = await Tour.findOneAndUpdate(
            { tourId: req.params.id },
            updateData,
            { new: true }
        );

        if (!tour) {

            return res.status(404).json({ msg: 'Tour not found' });
        }


        res.json(tour);
    } catch (err) {


        if (typeof next === 'function') next(err);
        else res.status(500).send('Server Error');
    }
};
