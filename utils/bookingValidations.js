const Booking = require('../models/Booking');
const Tour = require('../models/Tour');

exports.checkBookingRestrictions = async (user, ngayKhoiHanh, tour, totalGuests) => {
    // --- PROTECTION LAYER 0: BOOKING CUTOFF ---
    const departureDate = new Date(ngayKhoiHanh);
    departureDate.setHours(0, 0, 0, 0);
    const cutoffTime = new Date(departureDate);
    cutoffTime.setDate(cutoffTime.getDate() - 1); // Previous Day
    cutoffTime.setHours(20, 0, 0, 0); // 20:00

    if (new Date() > cutoffTime) {
        return { error: 'Đã quá hạn đăng ký tour này (Sau 20h ngày hôm trước). Vui lòng chọn ngày khác.' };
    }

    // --- PROTECTION LAYER 1: COOLDOWN RULE ---
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCancellation = await Booking.findOne({
        userId: user.id,
        tourId: tour._id,
        trangThai: 'Đã hủy',
        updatedAt: { $gt: twentyFourHoursAgo }
    });

    if (recentCancellation) {
        return { error: 'Bạn vừa hủy tour này. Vui lòng quay lại sau 24 giờ hoặc liên hệ CSKH để được hỗ trợ.' };
    }

    // --- PROTECTION LAYER 3: CONCURRENT BOOKING LIMIT ---
    const pendingCount = await Booking.countDocuments({
        userId: user.id,
        trangThai: { $in: ['Chờ thanh toán', 'Pending'] }
    });

    if (pendingCount >= 2) {
        return { error: 'Bạn đang có 2 đơn hàng chưa thanh toán. Vui lòng hoàn tất hoặc hủy bớt trước khi đặt thêm.' };
    }

    // Check seat availability
    // Note: Exclude 'Chờ hoàn tiền' and 'Đã hoàn tiền' - these bookings should not hold seats
    const holdingStatuses = ['CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất', 'Chờ thanh toán', 'Pending'];
    const existingBookings = await Booking.find({
        tourId: tour._id,
        ngayKhoiHanh: new Date(ngayKhoiHanh),
        trangThai: { $in: holdingStatuses }
    });
    const currentBooked = existingBookings.reduce((sum, b) => sum + b.soLuongNguoi, 0);

    if (currentBooked + totalGuests > tour.soLuongCho) {
        return { error: `Ngày khởi hành này chỉ còn ${Math.max(0, tour.soLuongCho - currentBooked)} chỗ trống.` };
    }

    return null; // No errors
};

exports.validateStatusChange = async (booking, newStatus, user) => {
    // Note: Exclude 'Chờ hoàn tiền' and 'Đã hoàn tiền' - these bookings should not hold seats
    const holdingStatuses = ['CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất', 'Chờ thanh toán', 'Pending'];
    const oldStatus = booking.trangThai;
    const becomingHolding = !holdingStatuses.includes(oldStatus) && holdingStatuses.includes(newStatus);

    if (becomingHolding && user.role !== 1) {
        const existing = await Booking.find({
            tourId: booking.tourId,
            ngayKhoiHanh: booking.ngayKhoiHanh,
            trangThai: { $in: holdingStatuses },
            _id: { $ne: booking._id }
        });
        const booked = existing.reduce((sum, b) => sum + b.soLuongNguoi, 0);
        const tour = await Tour.findById(booking.tourId);

        if (booked + booking.soLuongNguoi > tour.soLuongCho) {
            return { error: 'Không đủ chỗ trống để duyệt đơn này.' };
        }
    }
    return null;
};

exports.validateSeatAdjustment = async (booking, newTotal, user) => {
    // Note: Exclude 'Chờ hoàn tiền' and 'Đã hoàn tiền' - these bookings should not hold seats
    const holdingStatuses = ['CONFIRMED', 'PAID', 'Đã thanh toán', 'Đã duyệt', 'Hoàn tất', 'Chờ thanh toán', 'Pending'];
    if (holdingStatuses.includes(booking.trangThai) && user.role !== 1) {
        const diff = newTotal - booking.soLuongNguoi;
        if (diff > 0) {
            const Tour = require('../models/Tour'); // Ensure model is available
            const Booking = require('../models/Booking');

            const tour = await Tour.findById(booking.tourId);
            const existing = await Booking.find({
                tourId: booking.tourId,
                ngayKhoiHanh: booking.ngayKhoiHanh,
                trangThai: { $in: holdingStatuses },
                _id: { $ne: booking._id }
            });
            const booked = existing.reduce((sum, b) => sum + b.soLuongNguoi, 0);

            if (booked + newTotal > tour.soLuongCho) {
                const remaining = Math.max(0, tour.soLuongCho - booked);
                return { error: `Số chỗ vượt quá quy định. Tour này chỉ còn ${remaining} chỗ trống.` };
            }
        }
    }
    return null;
};
