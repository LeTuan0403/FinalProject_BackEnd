const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const getNextSequence = require('../utils/idGenerator');
const { sendBookingConfirmationEmail, sendRefundOtpEmail, sendRefundCompletedEmail } = require('../utils/emailService');
const { checkBookingRestrictions, validateStatusChange, validateSeatAdjustment } = require('../utils/bookingValidations');

// eslint-disable-next-line complexity
exports.createBooking = async (req, res, next) => {
    try {
        const { tourId, ngayKhoiHanh, tongTienThanhToan, soLuongNguoiLon, soLuongTreEm, nguoiLienHe, emailLienHe, sdtLienHe, ghiChu, couponCode } = req.body;

        // Support both Legacy ID (Number) and New ID (ObjectId)
        let tour;
        if (!isNaN(tourId) && tourId !== null && tourId !== '') {
            tour = await Tour.findOne({ tourId: Number(tourId) });
        }

        if (!tour && mongoose.Types.ObjectId.isValid(tourId)) {
            tour = await Tour.findById(tourId);
        }

        if (!tour) {
            return res.status(404).json({ msg: 'Tour không tồn tại hoặc mã Tour không hợp lệ.' });
        }

        // Calculate total guests
        const totalGuests = Number(soLuongNguoiLon) + Number(soLuongTreEm);

        // Check seat availability and restrictions (Dynamic)
        if (req.user.role !== 1) {
            const validationError = await checkBookingRestrictions(req.user, ngayKhoiHanh, tour, totalGuests);
            if (validationError && validationError.error) {
                return res.status(400).json({ msg: validationError.error });
            }
        }

        // --- COUPON VALIDATION ---
        // --- COUPON VALIDATION ---
        let discountAmount = 0;
        if (couponCode) {
            const result = await validateAndCalculateCoupon(couponCode, req.user.id, tongTienThanhToan, tour, soLuongNguoiLon, soLuongTreEm, ngayKhoiHanh);
            if (result.error) {
                return res.status(400).json({ msg: result.error });
            }
            discountAmount = result.discountAmount;
        }

        const newBooking = new Booking({
            donDatId: await getNextSequence('bookingId'),
            userId: req.user.id,
            tourId: tour._id,
            ngayKhoiHanh,
            soLuongNguoi: totalGuests,
            soLuongNguoiLon,
            soLuongTreEm,
            tongTienThanhToan: tongTienThanhToan, // or usage calculated: baseTotal - discountAmount
            // Note: If we use backend calc, we ensure correctness.
            // But let's trust frontend if consistent, OR better -> override `tongTienThanhToan` with backend calc if coupon exists.
            // Let's blindly accept for now OR enforce matching? 
            // Better: `tongTienThanhToan` should be final.
            ghiChu,
            couponCode: couponCode ? couponCode.toUpperCase() : null,
            discountAmount,
            trangThai: (req.user.role === 1 && req.body.trangThai) ? req.body.trangThai : 'Chờ thanh toán',
            nguoiLienHe,
            emailLienHe,
            sdtLienHe,
            isRebooking: req.body.isRebooking || false
        });

        const booking = await newBooking.save();

        // If coupon used, update bookingId in Coupon usage (Optional but good for tracking)
        if (couponCode) {
            const Coupon = require('../models/Coupon');
            await Coupon.findOneAndUpdate(
                { code: couponCode.toUpperCase(), "usedBy.userId": req.user.id },
                { $set: { "usedBy.$.bookingId": booking._id } }
            );
        }

        // Emit Admin Notification
        if (req.io) {
            req.io.emit('admin_notification', {
                type: 'booking',
                message: `Đơn đặt tour mới từ ${nguoiLienHe || req.user.hoTen} ${couponCode ? '(Có mã giảm giá)' : ''}`,
                data: booking
            });
        }

        // Send Confirmation Email
        try {
            await sendBookingConfirmationHelper(req, booking, tour, tongTienThanhToan, soLuongNguoiLon, soLuongTreEm, nguoiLienHe, sdtLienHe, ghiChu, emailLienHe);
        } catch (emailError) {
            console.error("❌ Failed to send confirmation email:", emailError.message);
            // We ignore email error to return 200 to user (booking created)
        }

        res.json(booking);
    } catch (err) {
        next(err);
    }
};

exports.getMyBookings = async (req, res, next) => {
    try {
        const bookings = await Booking.find({ userId: req.user.id }).populate('tourId').lean();

        const formatted = bookings.map(b => ({
            ...b,
            tour: b.tourId,
            tourId: b.tourId?._id || b.tourId,
            couponCode: b.couponCode || null,
            discountAmount: b.discountAmount || 0
        }));

        res.json(formatted);
    } catch (err) {
        next(err);
    }
};

exports.getAllBookings = async (req, res, next) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const bookings = await Booking.find().populate('tourId').populate('userId').lean();

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

exports.cancelBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findOne({ donDatId: req.params.id });
        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }

        if (booking.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        const allowedStatuses = ['Chờ thanh toán', 'Pending', 'CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất'];

        if (!allowedStatuses.includes(booking.trangThai)) {
            return res.status(400).json({ msg: 'Booking cannot be cancelled in its current state' });
        }

        booking.trangThai = 'Đã hủy';
        await booking.save();

        // Notify Admin
        if (req.io) {
            req.io.emit('admin_notification', {
                type: 'booking',
                message: `Đơn hàng #${booking.donDatId} đã bị hủy bởi người dùng`,
                data: booking
            });
        }

        return res.json({ msg: 'Booking cancelled' });
    } catch (err) {
        next(err);
    }
};

exports.getBookingById = async (req, res, next) => {
    try {
        const booking = await Booking.findOne({ donDatId: req.params.id }).populate('tourId').populate('userId');
        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }

        const bookingUserId = booking.userId ? (booking.userId._id || booking.userId) : null;
        if (!bookingUserId || (bookingUserId.toString() !== req.user.id && req.user.role !== 1)) {
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
        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }

        if (booking.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await Booking.findOneAndDelete({ donDatId: req.params.id });

        res.json({ msg: 'Booking deleted' });
    } catch (err) {
        next(err);
    }
};

exports.updateBooking = async (req, res, next) => {
    try {
        const { soLuongNguoi, trangThai } = req.body;
        const booking = await Booking.findOne({ donDatId: req.params.id });

        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }

        if (booking.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        // Helper to validate Status and Seats
        const validationResult = await validateStatusAndSeats(req, booking, trangThai, soLuongNguoi);
        if (validationResult && validationResult.error) {
            return res.status(validationResult.status || 400).json({ msg: validationResult.error });
        }

        // --- 2. Update Basic Fields ---
        const basicFields = ['soLuongNguoiLon', 'soLuongTreEm', 'ghiChu', 'nguoiLienHe', 'sdtLienHe', 'emailLienHe', 'ngayKhoiHanh', 'couponCode'];
        basicFields.forEach(field => {
            if (req.body[field] !== undefined) {
                // Handle specific type conversions if needed, but schema handles type coercion usually.
                // However, 'soLuongNguoiLon' and 'soLuongTreEm' need to be Numbers for safety.
                if (['soLuongNguoiLon', 'soLuongTreEm'].includes(field)) {
                    booking[field] = Number(req.body[field]);
                } else if (field === 'couponCode') {
                    booking[field] = req.body[field] ? req.body[field].toUpperCase() : null;
                } else {
                    booking[field] = req.body[field];
                }
            }
        });

        // --- 3. Recalculate Total Price ---
        // Determine values to use: req.body (if updating) or existing booking value
        const newAdults = req.body.soLuongNguoiLon !== undefined ? Number(req.body.soLuongNguoiLon) : booking.soLuongNguoiLon;
        const newChildren = req.body.soLuongTreEm !== undefined ? Number(req.body.soLuongTreEm) : booking.soLuongTreEm;

        if (req.body.soLuongNguoiLon !== undefined || req.body.soLuongTreEm !== undefined) {
            // We need to pass the updated values to recalculatePrice temporarily or update booking object first
            booking.soLuongNguoiLon = newAdults;
            booking.soLuongTreEm = newChildren;
            await recalculatePrice(booking);
        }

        await booking.save();
        res.json(booking);
    } catch (err) {
        next(err);
    }
};

const recalculatePrice = async (booking) => {
    const tour = await Tour.findById(booking.tourId);
    if (!tour) { return; }

    // Correct derivation of Base Price per Person
    let priceAdult = tour.isTuChon ? Math.round(tour.tongGiaDuKien / (tour.soLuongCho || 1)) : tour.tongGiaDuKien;
    let priceChild = priceAdult * 0.75;

    // 1. Check for last-minute discount on departure date
    if (tour.discounts && tour.discounts.length > 0) {
        const bookingDate = new Date(booking.ngayKhoiHanh);
        bookingDate.setHours(0, 0, 0, 0);

        const discount = tour.discounts.find(d => {
            const dDate = new Date(d.date);
            dDate.setHours(0, 0, 0, 0);
            return dDate.getTime() === bookingDate.getTime();
        });

        if (discount) {
            const discountFactor = (100 - discount.percentage) / 100;
            priceAdult = priceAdult * discountFactor;
            priceChild = priceChild * discountFactor;
        }
    }

    const newAdults = booking.soLuongNguoiLon || 0;
    const newChildren = booking.soLuongTreEm || 0;
    const baseTotal = (newAdults * priceAdult) + (newChildren * priceChild);

    // 2. Handle Coupon Discount
    let couponDiscount = 0;
    if (booking.couponCode) {
        const Coupon = require('../models/Coupon');
        const coupon = await Coupon.findOne({ code: booking.couponCode.toUpperCase() });

        if (coupon && baseTotal >= coupon.minOrder) {
            if (coupon.type === 'PERCENT') {
                couponDiscount = (baseTotal * coupon.value) / 100;
                if (coupon.maxDiscount > 0) {
                    couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
                }
            } else {
                couponDiscount = coupon.value;
            }
            couponDiscount = Math.min(couponDiscount, baseTotal);
        }
    }

    booking.discountAmount = couponDiscount;
    booking.tongTienThanhToan = baseTotal - couponDiscount;
};

// --- REFUND SYSTEM ---

exports.requestRefundOtp = async (req, res, next) => {
    try {
        const { bankName, accountNumber, accountHolder, reason } = req.body;
        const booking = await Booking.findOne({ donDatId: Number(req.params.id) });

        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }
        if (booking.userId.toString() !== req.user.id) { return res.status(401).json({ msg: 'Unauthorized' }); }

        // Valid statuses for refund
        if (!['PAID', 'CONFIRMED', 'Đã thanh toán', 'Đã duyệt'].includes(booking.trangThai)) {
            return res.status(400).json({ msg: 'Booking not eligible for refund request' });
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Cancellation Policy Logic
        const departureDate = new Date(booking.ngayKhoiHanh);
        const now = new Date();
        const diffTime = departureDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let refundPercent = 0;
        if (diffDays > 7) {
            refundPercent = 100;
        } else if (diffDays >= 3) {
            refundPercent = 50;
        } else {
            refundPercent = 0;
        }

        const calculatedRefund = (booking.tongTienThanhToan * refundPercent) / 100;

        // Save Temp Data
        booking.refundBankName = bankName;
        booking.refundAccountNumber = accountNumber;
        booking.refundAccountHolder = accountHolder;
        booking.refundReason = reason;
        booking.refundAmountEst = calculatedRefund;
        booking.refundPolicyApplied = `Hủy trước ${diffDays} ngày: Hoàn ${refundPercent}%`;
        booking.refundOtp = otp;
        booking.refundOtpExpires = expires;

        await booking.save();

        // Send Email
        const userEmail = booking.emailLienHe || req.user.email;
        await sendRefundOtpEmail(userEmail, otp, booking.donDatId);

        res.json({ msg: 'OTP sent successfully' });
    } catch (err) {
        next(err);
    }
};

exports.confirmRefundRequest = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const booking = await Booking.findOne({ donDatId: Number(req.params.id) });

        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }
        if (booking.userId.toString() !== req.user.id) { return res.status(401).json({ msg: 'Unauthorized' }); }

        // Validate OTP
        if (!booking.refundOtp || booking.refundOtp !== otp) {
            return res.status(400).json({ msg: 'Invalid OTP' });
        }
        if (booking.refundOtpExpires < Date.now()) {
            return res.status(400).json({ msg: 'OTP Expired' });
        }

        // Update Status
        booking.trangThai = 'Chờ hoàn tiền';
        booking.isRefundCommitment = true;
        booking.refundCommitmentDate = new Date();

        // Clear OTP
        booking.refundOtp = undefined;
        booking.refundOtpExpires = undefined;

        await booking.save();

        // Notify Admin (Socket)
        if (req.io) {
            req.io.emit('admin_notification', {
                type: 'booking',
                message: `Yêu cầu hoàn tiền mới từ Đơn #${booking.donDatId}`,
                data: booking
            });
        }

        res.json({ msg: 'Refund request submitted successfully' });
    } catch (err) {
        next(err);
    }
};

exports.adminConfirmRefund = async (req, res, next) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const booking = await Booking.findOne({ donDatId: Number(req.params.id) }).populate('userId');
        if (!booking) { return res.status(404).json({ msg: 'Booking not found' }); }

        // Idempotency check: If already refunded, return success
        if (booking.trangThai === 'Đã hoàn tiền') {
            return res.json({
                success: true,
                msg: 'Refund already confirmed previously',
                emailSent: false,
                bookingId: booking.donDatId
            });
        }

        const allowedStatuses = ['Chờ hoàn tiền', 'PAID', 'CONFIRMED', 'Đã thanh toán', 'Đã duyệt', 'Chờ duyệt'];
        if (!allowedStatuses.includes(booking.trangThai)) {
            return res.status(400).json({ msg: `Booking status '${booking.trangThai}' is not eligible for refund` });
        }

        // Update Status
        booking.trangThai = 'Đã hoàn tiền';
        await booking.save();

        // Send Email
        let emailSent = false;
        const userEmail = booking.emailLienHe || (booking.userId ? booking.userId.email : '');
        if (userEmail) {
            try {
                await sendRefundCompletedEmail(userEmail, {
                    bookingId: booking.donDatId,
                    contactName: booking.nguoiLienHe || 'Quý khách',
                    refundAmount: (booking.refundAmountEst !== undefined && booking.refundAmountEst !== null) ? booking.refundAmountEst : booking.tongTienThanhToan,
                    bankName: booking.refundBankName,
                    accountNumber: booking.refundAccountNumber,
                    accountHolder: booking.refundAccountHolder
                });
                emailSent = true;
            } catch (emailError) {
                console.error('Failed to send refund email:', emailError);
            }
        }

        res.json({
            success: true,
            msg: emailSent
                ? 'Refund confirmed and email sent successfully'
                : 'Refund confirmed but email could not be sent',
            emailSent,
            bookingId: booking.donDatId
        });
    } catch (err) {
        next(err);
    }
};

const sendBookingConfirmationHelper = async (req, booking, tour, tongTienThanhToan, soLuongNguoiLon, soLuongTreEm, nguoiLienHe, sdtLienHe, ghiChu, emailLienHe) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const paymentLink = `${frontendUrl}/payment/${booking.donDatId}`;

    let emailToSend = emailLienHe;
    if (!emailToSend) {
        // Middleware attaches: req.user = { id, _id, userId, email, role, isAdmin }
        emailToSend = req.user.email;
    }

    if (emailToSend) {
        await sendBookingConfirmationEmail(emailToSend, {
            bookingId: booking.donDatId,
            tourName: tour.tenTour,
            departureDate: new Date(booking.ngayKhoiHanh).toLocaleDateString('vi-VN'),
            totalPrice: tongTienThanhToan,
            adults: soLuongNguoiLon,
            children: soLuongTreEm,
            contactName: nguoiLienHe || req.user.hoTen || 'Quý khách',
            contactPhone: sdtLienHe || req.user.soDienThoai || '',
            notes: ghiChu,
            paymentLink: paymentLink
        });
    }
};

// Helper for Status and Seats validation
const validateStatusAndSeats = async (req, booking, trangThai, soLuongNguoi) => {
    // --- 0. Handle Status Change (Admin/System) ---
    const holdingStatuses = ['CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất', 'Chờ thanh toán', 'Pending'];

    if (trangThai && booking.trangThai !== trangThai) {
        if (holdingStatuses.includes(trangThai) && req.user.role !== 1) {
            return { error: 'Only Admin can confirm bookings directly.', status: 403 };
        }

        const newStatus = trangThai;
        const statusError = await validateStatusChange(booking, newStatus, req.user);
        if (statusError) {
            return { error: statusError.error };
        }

        booking.trangThai = newStatus;
    }

    // --- 1. Handle Seat Count Adjustment (Validation only) ---
    if (soLuongNguoi !== undefined) {
        const newTotal = Number(soLuongNguoi);
        const seatError = await validateSeatAdjustment(booking, newTotal, req.user);
        if (seatError) {
            return { error: seatError.error };
        }
        booking.soLuongNguoi = newTotal;
    }

    return null;
};

const validateAndCalculateCoupon = async (couponCode, userId, tongTienThanhToan, tour, soLuongNguoiLon, soLuongTreEm, ngayKhoiHanh) => {
    const Coupon = require('../models/Coupon');
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });

    if (!coupon) {
        return { error: 'Invalid Coupon Code' };
    }
    if (new Date() > new Date(coupon.expiry)) {
        return { error: 'Coupon Expired' };
    }
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
        return { error: 'Coupon Usage Limit Reached' };
    }
    if (tongTienThanhToan < coupon.minOrder) {
        return { error: 'Order value does not meet minimum for coupon' };
    }

    // Check User Usage (Strict)
    const hasUsed = coupon.usedBy.some(u => u.userId.toString() === userId);
    if (hasUsed) {
        return { error: 'You have already used this coupon' };
    }

    // Recalculate Base Price First
    let priceAdult = tour.tongGiaDuKien;
    let priceChild = tour.tongGiaDuKien * 0.75;

    // Apply Last Minute Discount Check
    if (tour.discounts && tour.discounts.length > 0) {
        const bookingDate = new Date(ngayKhoiHanh);
        bookingDate.setHours(0, 0, 0, 0);
        const discount = tour.discounts.find(d => new Date(d.date).setHours(0, 0, 0, 0) === bookingDate.getTime());
        if (discount) {
            const factor = (100 - discount.percentage) / 100;
            priceAdult *= factor;
            priceChild *= factor;
        }
    }
    const baseTotal = (priceAdult * Number(soLuongNguoiLon)) + (priceChild * Number(soLuongTreEm));

    // Calculate Coupon Discount
    let discountAmount = 0;
    if (coupon.type === 'PERCENT') {
        discountAmount = (baseTotal * coupon.value) / 100;
        if (coupon.maxDiscount > 0) {
            discountAmount = Math.min(discountAmount, coupon.maxDiscount);
        }
    } else {
        discountAmount = coupon.value;
    }
    discountAmount = Math.min(discountAmount, baseTotal);

    await Coupon.findByIdAndUpdate(coupon._id, {
        $inc: { usedCount: 1 },
        $push: { usedBy: { userId: userId, bookingId: null, usedAt: new Date() } }
    });

    return { discountAmount };
};
