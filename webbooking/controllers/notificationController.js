const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const Contact = require('../models/Contact');
const Review = require('../models/Review');
const Conversation = require('../models/Conversation');

// Get counts of pending items
exports.getCounts = async (_req, res) => {
    try {
        const [
            pendingBookings,
            pendingTours,
            pendingContacts,
            pendingReviews,
            unreadMessages,
            lastMinuteTours
        ] = await Promise.all([
            // 1. Pending Bookings (Status: Pending or Chờ thanh toán)
            Booking.countDocuments({ trangThai: { $in: ['Pending', 'Chờ thanh toán', 'Chờ xác nhận'] } }),

            // 2. Pending Tours (daDuyet: 0)
            Tour.countDocuments({ daDuyet: 0 }),

            // 3. Pending Contacts (trangThai: 'Chờ xử lý')
            Contact.countDocuments({ trangThai: 'Chờ xử lý' }),

            // 4. Pending Reviews (Reviews that have not been replied to yet)
            Review.countDocuments({ traLoi: { $exists: false } }),

            // 5. Unread Messages (Conversations where isReadByAdmin is false)
            Conversation.countDocuments({ isReadByAdmin: false }),

            // 6. Last Minute Tours (Departs within 3 days with discount)
            (async () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const threeDaysFromNow = new Date(today);
                threeDaysFromNow.setDate(today.getDate() + 3);
                threeDaysFromNow.setHours(23, 59, 59, 999);

                return await Tour.countDocuments({
                    'discounts.date': { $gte: today, $lte: threeDaysFromNow }
                });
            })()
        ]);

        res.json({
            success: true,
            counts: {
                bookings: pendingBookings,
                tours: pendingTours,
                contacts: pendingContacts,
                reviews: pendingReviews,
                messages: unreadMessages,
                lastMinute: lastMinuteTours,
                total: pendingBookings + pendingTours + pendingContacts + pendingReviews + unreadMessages + lastMinuteTours
            }
        });

    } catch (error) {
        console.error("Error fetching notification counts:", error);
        res.status(500).json({ success: false, message: "Lỗi server khi lấy thông báo" });
    }
};
