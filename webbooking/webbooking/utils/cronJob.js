const cron = require('node-cron');
const Booking = require('../models/Booking');

const cancelExpiredBooking = async (booking, io) => {
    // Check if double-execution (already cancelled)
    if (booking.trangThai === 'Đã hủy') { return; }

    booking.trangThai = 'Đã hủy';
    await booking.save();

    const User = require('../models/User');
    const user = await User.findById(booking.userId);
    if (user) {
        user.soLanHuyDong = (user.soLanHuyDong || 0) + 1;
        if (user.soLanHuyDong >= 3) {
            user.hanCheThanhToan = true;
        }
        await user.save();
        console.log(`Auto-cancelled booking ${booking.donDatId}. User ${user.email} reputation: ${user.soLanHuyDong}`);

        // Emit Socket Notification to Admin
        if (io) {
            io.emit('admin_notification', {
                type: 'booking',
                message: `Đơn hàng #${booking.donDatId} đã tự động hủy do quá hạn thanh toán.`,
                data: booking
            });
        }
    }
};

const checkExpiredBookings = (io) => {
    // Run every minute: '*/1 * * * *'
    cron.schedule('*/1 * * * *', async () => {
        try {
            // Fetch all Pending bookings to check individually
            const pendingBookings = await Booking.find({
                $or: [{ trangThai: 'Chờ thanh toán' }, { trangThai: 'Pending' }]
            });

            if (pendingBookings.length > 0) {
                for (const booking of pendingBookings) {
                    const created = new Date(booking.ngayDat).getTime();
                    const departure = new Date(booking.ngayKhoiHanh).getTime();
                    const leadTime = departure - created;
                    const now = new Date();
                    const nowTime = now.getTime();

                    let allowedDuration = 12 * 60 * 60 * 1000;
                    if (leadTime < 24 * 60 * 60 * 1000) {
                        allowedDuration = 4 * 60 * 60 * 1000;
                    } else if (leadTime < 48 * 60 * 60 * 1000) {
                        allowedDuration = 8 * 60 * 60 * 1000;
                    }

                    // Strict Re-booking Rule: If re-booking (detected via flag or context), logic could go here.
                    // But for now, user asked for shortened time on re-book.
                    // We need a field 'isRebooking' on Booking. 
                    // Assuming we will add it, we can modify this logic:
                    if (booking.isRebooking) {
                        // Example: Reduce to 2 hours or half time
                        allowedDuration = Math.min(allowedDuration, 2 * 60 * 60 * 1000);
                    }

                    const deadline = Math.min(created + allowedDuration, departure);

                    if (nowTime > deadline) {
                        await cancelExpiredBooking(booking, io);
                    }
                }
            }
        } catch (error) {
            console.error('Error running auto-cancellation cron job:', error);
        }
    });

    // Run every day at 8:00 AM for Last Minute Tours
    cron.schedule('0 8 * * *', async () => {
        try {
            const tourController = require('../controllers/tourController');
            // Mock req/res for controller reuse or extract logic
            // Ideally refactor controller to separate logic, but for now wrap it
            const req = {
                user: { role: 1 },
                io: io
            };
            const res = {
                json: (data) => console.log('Auto-Scan Result:', data?.msg),
                status: () => ({ json: (err) => console.error('Auto-Scan Error:', err) })
            };
            await tourController.scanLastMinuteTours(req, res);
        } catch (error) {
            console.error('Error running last-minute scan cron job:', error);
        }
    });
};

module.exports = checkExpiredBookings;
