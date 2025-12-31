const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const getNextSequence = require('../utils/idGenerator');

exports.createBooking = async (req, res) => {
    try {
        const { tourId, ngayKhoiHanh, soLuongNguoi, tongTienThanhToan, soLuongNguoiLon, soLuongTreEm, nguoiLienHe, emailLienHe, sdtLienHe, ghiChu } = req.body;

        // Frontend sends Legacy ID (integer), so we must find by { tourId: ... }
        const tour = await Tour.findOne({ tourId: tourId });
        if (!tour) {
            return res.status(404).json({ msg: 'Tour not found' });
        }

        const newBooking = new Booking({
            donDatId: await getNextSequence('bookingId'),
            userId: req.user.id,
            tourId: tour._id,
            ngayKhoiHanh,
            soLuongNguoi: soLuongNguoiLon + soLuongTreEm,
            soLuongNguoiLon,
            soLuongTreEm,
            tongTienThanhToan,
            ghiChu,
            trangThai: 'Chờ thanh toán', // Fixed encoding
            nguoiLienHe,
            emailLienHe,
            sdtLienHe
        });

        const booking = await newBooking.save();
        res.json(booking);
    } catch (err) {
        next(err);
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ userId: req.user.id }).populate('tourId').lean();

        const formatted = bookings.map(b => ({
            ...b,
            tour: b.tourId,
            tourId: b.tourId?.tourId || b.tourId
        }));

        res.json(formatted);
    } catch (err) {
        next(err);
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        if (req.user.role !== 1) return res.status(403).json({ msg: 'Access denied' });

        const bookings = await Booking.find().populate('tourId').populate('userId').lean();

        // Map to match frontend structure: tourId should be legacy ID (if needed) or keep strictly, 
        // but 'tour' field must be populated.
        const formatted = bookings.map(b => ({
            ...b,
            tour: b.tourId, // Move populated object to 'tour'
            tourId: b.tourId?.tourId || b.tourId // Use legacy ID if available
        }));

        res.json(formatted);
    } catch (err) {
        next(err);
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        let booking = await Booking.findOne({ donDatId: req.params.id });
        if (!booking) return res.status(404).json({ msg: 'Booking not found' });

        if (booking.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Owner can cancel if pending
        if (booking.trangThai === 'Chờ thanh toán') {
            booking.trangThai = 'Đã hủy'; // Fixed encoding
            await booking.save();
            return res.json({ msg: 'Booking cancelled' });
        } else {
            return res.status(400).json({ msg: 'Booking cannot be cancelled in its current state' });
        }
    } catch (err) {
        next(err);
    }
};
exports.getBookingById = async (req, res, next) => {
    try {
        const booking = await Booking.findOne({ donDatId: req.params.id }).populate('tourId').populate('userId');
        if (!booking) return res.status(404).json({ msg: 'Booking not found' });

        // Authorization check: User must own the booking or be admin
        if (booking.userId._id.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'Not authorized' });
        }
        res.json(booking);
    } catch (err) {
        next(err);
    }
};

exports.deleteBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findOne({ donDatId: req.params.id });
        if (!booking) return res.status(404).json({ msg: 'Booking not found' });

        // Authorization: Only Admin or Owner can delete
        if (booking.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await Booking.findOneAndDelete({ donDatId: req.params.id });
        res.json({ msg: 'Booking deleted' });
    } catch (err) {
        next(err);
    }
};
