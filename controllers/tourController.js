const Tour = require('../models/Tour');
const mongoose = require('mongoose');
const getNextSequence = require('../utils/idGenerator');
const Booking = require('../models/Booking');
const Location = require('../models/Location');
const { createNotification } = require('./userNotificationController');
const { recommendTours } = require('../routes/aiService');

// AI Recommendation Endpoint
exports.getAIRecommendations = async (req, res) => {
    try {
        const { requirement } = req.body;
        if (!requirement) {
            return res.status(400).json({ msg: 'Vui lòng nhập yêu cầu của bạn' });
        }

        // 1. Get ALL active tours (approved + not custom + has schedule)
        // We want to give AI the full context of AVAILABLE tours
        const activeTours = await Tour.find({
            daDuyet: 1, // Approved
            isTuChon: false, // Standard tours
            ngayKhoiHanh: { $exists: true, $not: { $size: 0 } } // Has departures
        })
            .select('tenTour tongGiaDuKien thoiGian ngayKhoiHanh diemKhoiHanh moTa tourId dichVuBaoGom phuongTien')
            .lean();

        // Filter future tours logic similar to chatController if needed, 
        // but for general recommendation, maybe listings are fine even if near future?
        // Let's filter slightly to ensure we don't recommend expired stuff
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const validTours = activeTours.filter(t => {
            if (!Array.isArray(t.ngayKhoiHanh)) {
                return false;
            }
            return t.ngayKhoiHanh.some(date => new Date(date) >= now);
        });

        // 2. Call AI Service
        const aiResult = await recommendTours(requirement, validTours);

        // 3. Return IDs and Message
        res.json(aiResult);

    } catch (err) {
        console.error("AI Recommendation Error:", err);
        res.status(500).send('Server Error');
    }
};

const processTourSchedule = async (tourChiTiets) => {
    if (!tourChiTiets || !Array.isArray(tourChiTiets)) { return []; }

    return await Promise.all(tourChiTiets.map(async (item) => {
        let locationObjectId = item.diaDiemId;

        // If diaDiemId is a legacy Number, lookup the ObjectId
        // Note: mongoose.Types.ObjectId.isValid returns true for 12/24 char strings, but numbers are false.
        // We check if it is a number or string number.
        if (locationObjectId !== undefined && locationObjectId !== null) {
            // If it's not a valid ObjectID, try to find by diaDiemId (Number)
            if (!mongoose.Types.ObjectId.isValid(locationObjectId)) {
                // If ID is 0 or invalid number, we might want to just set null, 
                // OR try to find if 0 is a valid ID in DB (unlikely but safe).
                const loc = await Location.findOne({ diaDiemId: locationObjectId });
                if (loc) {
                    locationObjectId = loc._id;
                } else {
                    locationObjectId = null; // Prevent CastError if location not found or is 0
                }
            }
        }

        return {
            ngayThu: item.ngayThu,
            tieuDe: item.tieuDe,
            diaDiemId: locationObjectId, // Now an ObjectId or original if not found
            ghiChu: item.ghiChu || item.moTa,
            hinhAnh: item.hinhAnh,
            thoiGian: item.thoiGian,
            thuTu: item.thuTu,
            phuongTienDiChuyen: item.phuongTienDiChuyen
        };
    }));
};

// Helper to apply last minute discounts
const checkAndApplyLastMinuteDiscount = async (tour) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    let modified = false;
    const newDiscounts = [];

    if (!tour.ngayKhoiHanh || tour.ngayKhoiHanh.length === 0) { return { modified, newDiscounts }; }

    tour.ngayKhoiHanh.forEach(originalDate => {
        const dateToCheck = new Date(originalDate);
        const checkTime = dateToCheck.getTime();
        const startTime = today.getTime();
        const endTime = threeDaysFromNow.getTime();

        if (checkTime >= startTime && checkTime <= endTime) {
            const exists = tour.discounts && tour.discounts.some(d => {
                return new Date(d.date).getTime() === dateToCheck.getTime();
            });

            if (!exists) {
                if (!tour.discounts) { tour.discounts = []; }
                tour.discounts.push({ date: originalDate, percentage: 10 });
                modified = true;
                newDiscounts.push({ tourName: tour.tenTour, date: originalDate });
            }
        }
    });

    if (modified) {
        await tour.save();
    }

    return { modified, newDiscounts };
};

exports.getAllTours = async (req, res) => {
    try {
        const { mode, keyword, ids } = req.query;
        const query = {};

        if (ids) {
            const idList = ids.split(',');
            query.$or = [
                { tourId: { $in: idList.map(id => !isNaN(id) ? Number(id) : null).filter(id => id !== null) } },
                { _id: { $in: idList.filter(id => mongoose.Types.ObjectId.isValid(id)) } }
            ];
        } else {
            if (keyword) {
                query.$or = [
                    { tenTour: { $regex: keyword, $options: 'i' } },
                    { maTour: { $regex: keyword, $options: 'i' } }
                ];
            }

            // If NOT admin mode, only show standard tours (exclude custom tours)
            if (mode !== 'admin') {
                query.isTuChon = { $ne: true };
            }
        }

        const tours = await Tour.find(query).populate('lichTrinh.diaDiemId').lean();

        // Calculate availability for each tour
        const toursWithAvailability = await Promise.all(tours.map(async (tour) => {
            // Only calculate if needed (optimize?) - for now do all
            if (!tour.ngayKhoiHanh || tour.ngayKhoiHanh.length === 0) { return tour; }

            const availability = await Promise.all(tour.ngayKhoiHanh.map(async (date) => {
                const bookings = await Booking.find({
                    tourId: tour._id,
                    ngayKhoiHanh: date,
                    trangThai: { $in: ['CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất', 'Chờ thanh toán', 'Pending'] }
                });
                const bookedSeats = bookings.reduce((sum, b) => sum + b.soLuongNguoi, 0);
                return {
                    date: date,
                    remainingSeats: Math.max(0, tour.soLuongCho - bookedSeats)
                };
            }));
            return { ...tour, availability };
        }));

        res.json(toursWithAvailability);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getTourById = async (req, res) => {
    try {
        let tour;
        // Check if ID is a valid number (Legacy tourId)
        if (!isNaN(req.params.id)) {
            tour = await Tour.findOne({ tourId: req.params.id }).populate('lichTrinh.diaDiemId').lean();
        }
        // Check if ID is a valid ObjectId (New System)
        else if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            tour = await Tour.findById(req.params.id).populate('lichTrinh.diaDiemId').lean();
        } else {
            return res.status(400).json({ msg: 'Invalid Tour ID' });
        }

        if (!tour) { return res.status(404).json({ msg: 'Tour not found' }); }

        // Dynamic Seat Calculation
        // Holding statuses: CONFIRMED, PAID, etc.
        const holdingStatuses = ['CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất', 'Chờ thanh toán', 'Pending'];

        const dates = tour.ngayKhoiHanh || [];
        const availability = await Promise.all(dates.map(async (date) => {
            // Find bookings for this tour and this specific date
            // Note: date in DB is ISO, but we might need to match carefully. 
            // Usually simple equality works if saved correctly.
            const bookings = await Booking.find({
                tourId: tour._id,
                ngayKhoiHanh: date,
                trangThai: { $in: holdingStatuses }
            });

            const bookedSeats = bookings.reduce((sum, b) => sum + b.soLuongNguoi, 0);
            return {
                date: date,
                bookedSeats: bookedSeats,
                remainingSeats: Math.max(0, tour.soLuongCho - bookedSeats)
            };
        }));

        // Attach to response (will need frontend to read this)
        res.json({ ...tour, availability });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.createTour = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }
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
        const lichTrinh = await processTourSchedule(tourChiTiets);

        const newTour = new Tour({
            tourId: await getNextSequence('tourId'),
            isTuChon: true,
            daDuyet: 0,
            nguoiTaoId: req.user.id, // Authenticated User ID
            lichTrinh: lichTrinh,
            ...rest
        });

        const tour = await newTour.save();

        if (req.io) {
            req.io.emit('admin_notification', {
                type: 'tour',
                message: `Tour thiết kế mới từ ${req.user.hoTen}`,
                data: tour
            });
        }

        res.json(tour);
    } catch (err) {
        if (typeof next === 'function') { next(err); }
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
        if (typeof next === 'function') { next(err); }
        else { res.status(500).send('Server Error'); }
    }
};

exports.updateCustomTour = async (req, res, next) => {
    try {
        const { tourChiTiets, ...rest } = req.body;
        const lichTrinh = await processTourSchedule(tourChiTiets);

        const updateData = {
            ...rest,
            lichTrinh: lichTrinh
        };

        const tourId = req.params.id;
        const query = { nguoiTaoId: req.user.id };
        if (!isNaN(tourId)) {
            query.tourId = Number(tourId);
        } else if (mongoose.Types.ObjectId.isValid(tourId)) {
            query._id = tourId;
        } else {
            return res.status(400).json({ msg: 'ID Tour không hợp lệ' });
        }

        const tour = await Tour.findOneAndUpdate(query, updateData, { new: true });

        if (!tour) { return res.status(404).json({ msg: 'Tour not found or unauthorized' }); }
        res.json(tour);

    } catch (err) {
        if (typeof next === 'function') { next(err); }
        else {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    }
};

const emailService = require('../utils/emailService');

exports.approveTour = async (req, res, next) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }
        const tourId = req.params.id;
        const filter = !isNaN(tourId) ? { tourId: Number(tourId) } : (mongoose.Types.ObjectId.isValid(tourId) ? { _id: tourId } : null);

        if (!filter) {
            return res.status(400).json({ msg: 'ID Tour không hợp lệ' });
        }

        // Find and update, populating creator to get email
        const tour = await Tour.findOneAndUpdate(filter, { daDuyet: 1 }, { new: true }).populate('nguoiTaoId');

        if (!tour) { return res.status(404).json({ msg: 'Tour not found' }); }

        // Send Email Notification if creator exists and has email
        // Send Email Notification if creator exists and has email
        if (tour.nguoiTaoId) {
            const creator = tour.nguoiTaoId; // Populated User Object

            // 1. Send In-App Notification
            await createNotification({
                userId: creator._id,
                legacyUserId: creator.userId,
                title: 'Tour đã được duyệt',
                message: `Tour "${tour.tenTour}" của bạn đã được Admin phê duyệt!`,
                type: 'SYSTEM',
                link: `/tours/${tour.tourId}`
            }, req.io);

            // 2. Send Email (Restored as per request)
            if (creator.email) {
                const tourDetails = {
                    tourId: tour.tourId,
                    tourName: tour.tenTour,
                    creatorName: creator.hoTen || creator.email
                };
                emailService.sendTourApprovalEmail(creator.email, tourDetails).catch(err => {
                    console.error("Failed to send approval email:", err);
                });
            }
        }

        res.json(tour);
    } catch (err) {
        if (typeof next === 'function') { next(err); }
        else { res.status(500).send('Server Error'); }
    }
};

exports.deleteCustomTour = async (req, res, next) => {
    try {

        // Try to find tour by tourId (Number) OR _id (ObjectId)
        // let query = { tourId: req.params.id };

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
            return res.status(403).json({ msg: 'User not authorized' });
        }

        await Tour.findByIdAndDelete(tour._id);

        // Notify user if admin deleted their tour
        if (isAdmin && !isOwner && tour.nguoiTaoId && req.io) {
            const User = require('../models/User');
            const creator = await User.findById(tour.nguoiTaoId);
            if (creator) {
                const { createNotification } = require('./userNotificationController');
                await createNotification({
                    userId: creator._id,
                    legacyUserId: creator.userId,
                    title: 'Tour thiết kế bị từ chối/xóa',
                    message: `Tour thiết kế "${tour.tenTour}" của bạn đã bị từ chối và xóa khỏi hệ thống.`,
                    type: 'SYSTEM',
                    link: '#'
                }, req.io);
            }
        }

        res.json({ msg: 'Tour deleted' });
    } catch (err) {
        if (typeof next === 'function') { next(err); }
        else { res.status(500).send('Server Error'); }
    }
};

exports.updateTour = async (req, res, next) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }
        const { tourChiTiets, ...rest } = req.body;

        const lichTrinh = await processTourSchedule(tourChiTiets);

        // Exclude fields that should not be updated or might cause type mismatch (e.g. nguoiTaoId=Number vs ObjectId)
        // eslint-disable-next-line no-unused-vars
        const { _id, tourId, nguoiTaoId, userId, ngayTao, ...updatableFields } = rest;

        const updateData = { ...updatableFields };
        if (lichTrinh.length > 0) {
            updateData.lichTrinh = lichTrinh;
        }

        // Use findOneAndUpdate with tourId (Number)
        // If req.params.id is passed as string "1", Mongoose might auto-cast if schema is Number, but safer to parse if needed.
        // However, findOneAndUpdate query is { tourId: req.params.id }. 

        const tid = req.params.id;
        const filter = !isNaN(tid) ? { tourId: Number(tid) } : (mongoose.Types.ObjectId.isValid(tid) ? { _id: tid } : null);

        if (!filter) { return res.status(400).json({ msg: 'ID Tour không hợp lệ' }); }

        const tour = await Tour.findOneAndUpdate(filter, updateData, { new: true });

        if (!tour) {
            return res.status(404).json({ msg: 'Tour not found' });
        }

        // AUTO-CHECK Discounts after Update
        const { modified, newDiscounts } = await checkAndApplyLastMinuteDiscount(tour);

        // Refetch if modified to return fresh data
        let finalTour = tour;
        if (modified) {
            finalTour = await Tour.findOne(filter);
            // Notify via socket
            if (newDiscounts.length > 0 && req.io) {
                req.io.emit('admin_notification', {
                    type: 'last_minute',
                    message: `Tour "${tour.tenTour}" vừa cập nhật lịch và được tự động giảm giá giờ chót!`,
                    data: newDiscounts
                });
            }
        }

        res.json(finalTour);
    } catch (err) {

        if (typeof next === 'function') { next(err); }
        else {
            console.error("Update Tour Error:", err);
            res.status(500).send('Server Error');
        }
    }
};

// Scan for Last Minute Tours (Departs within 3 days)
exports.scanLastMinuteTours = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(today.getDate() + 3);

        // Find tours with departure dates in range [today, threeDaysFromNow]
        // Note: exact date match might need parsing, assuming dates are stored clean or we compare ISO strings
        const tours = await Tour.find({}); // Get all to filter in JS for safety with Array of Dates, or optimize query
        // Query optimization: { ngayKhoiHanh: { $gte: today, $lte: threeDaysFromNow } } might work if mapped correctly.
        // Let's filter in JS to be safe about "exact date" vs "timestamp" issues in mongo.

        let updatedCount = 0;
        const newDiscounts = [];

        for (const tour of tours) {
            let modified = false;
            if (!tour.ngayKhoiHanh) { continue; }

            tour.ngayKhoiHanh.forEach(originalDate => {
                // Ensure we work with a Date object
                const dateToCheck = new Date(originalDate);

                // We compare using timestamps to check range, 
                // but when we verify exact range, we should be careful.
                // Simple logic: Is dateToCheck >= today AND dateToCheck <= threeDaysFromNow?
                // Note: dateToCheck includes time if stored. 
                // If we want to check "Calendar Date", we should normalize check, but NOT normalize storage.

                // Create normalized sort-of dates for comparison only
                const checkTime = dateToCheck.getTime();
                const startTime = today.getTime();
                const endTime = threeDaysFromNow.getTime();

                // Check range (Inclusive of today, <= 3 days out)
                if (checkTime >= startTime && checkTime <= endTime) {

                    // Check if discount exists for this EXACT date value
                    // We compare .getTime() to ensure we match the exact timestamp of ngayKhoiHanh
                    const exists = tour.discounts && tour.discounts.some(d => {
                        return new Date(d.date).getTime() === dateToCheck.getTime();
                    });

                    if (!exists) {
                        if (!tour.discounts) { tour.discounts = []; }
                        // Push ORIGINAL DATE to ensure references match
                        tour.discounts.push({ date: originalDate, percentage: 10 });
                        modified = true;
                        newDiscounts.push({ tourName: tour.tenTour, date: originalDate });
                    }
                }
            });

            if (modified) {
                await tour.save();
                updatedCount++;
            }
        }

        // Notify Admin via Socket if new matches
        if (newDiscounts.length > 0 && req.io) {
            req.io.emit('admin_notification', {
                type: 'last_minute',
                message: `Có ${newDiscounts.length} tour giờ chót mới được tự động giảm giá 10%!`,
                data: newDiscounts
            });
        }

        res.json({ msg: `Scanned tours. Updated ${updatedCount} tours.`, newDiscounts });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Update Discount for a specific date
exports.updateTourDiscount = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }
        const { tourId, date, percentage } = req.body;

        const query = {};
        if (!isNaN(tourId)) {
            query.tourId = Number(tourId);
        } else if (mongoose.Types.ObjectId.isValid(tourId)) {
            query._id = tourId;
        } else {
            return res.status(400).json({ msg: 'ID Tour không hợp lệ' });
        }

        const tour = await Tour.findOne(query);
        if (!tour) { return res.status(404).json({ msg: 'Tour not found' }); }

        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        // Find and update or add
        const discountIndex = tour.discounts.findIndex(d => {
            const dDate = new Date(d.date);
            dDate.setHours(0, 0, 0, 0);
            return dDate.getTime() === targetDate.getTime();
        });

        if (discountIndex > -1) {
            tour.discounts[discountIndex].percentage = percentage;
        } else {
            tour.discounts.push({ date: targetDate, percentage });
        }

        await tour.save();
        res.json(tour);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
