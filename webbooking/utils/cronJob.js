const cron = require('node-cron');
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');

const checkExpiredBookings = () => {
    // Run every minute: '*/1 * * * *'
    cron.schedule('*/1 * * * *', async () => {
        try {
            const now = new Date();
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            // Find bookings that are:
            // 1. Status is 'Chờ thanh toán' or 'Pending'
            // 2. Created (ngayDat) before 24 hours ago
            const expiredBookings = await Booking.find({
                $or: [{ trangThai: 'Chờ thanh toán' }, { trangThai: 'Pending' }],
                ngayDat: { $lt: twentyFourHoursAgo }
            });

            if (expiredBookings.length > 0) {
                console.log(`Found ${expiredBookings.length} expired bookings.`);

                for (const booking of expiredBookings) {
                    booking.trangThai = 'Đã hủy'; // Cancelled
                    await booking.save();

                    // Restore seats
                    const tour = await Tour.findById(booking.tourId);
                    if (tour) {
                        tour.soLuongCho += booking.soLuongNguoi;
                        await tour.save();
                        console.log(`Auto-cancelled Booking #${booking.donDatId} and restored ${booking.soLuongNguoi} seats.`);
                    } else {
                        console.log(`Auto-cancelled Booking #${booking.donDatId}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error running auto-cancellation cron job:', error);
        }
    });
};

module.exports = checkExpiredBookings;
