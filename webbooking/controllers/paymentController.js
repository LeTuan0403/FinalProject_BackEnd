const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const User = require('../models/User');
const { sendPaymentSuccessEmail } = require('../utils/emailService');

// Check Payment Status (Polling)
exports.checkPaymentStatus = async (req, res) => {
    const { bookingId } = req.params;
    try {
        // Determine if bookingId refers to legacy SQL ID (number) or Mongo ID
        // Our schema says donDatId is Number (legacy SQL ID). But frontend might send Mongo ID?
        // Let's assume frontend sends donDatId for now if it has it, otherwise try to find by _id.

        let booking;
        if (!isNaN(bookingId)) {
            booking = await Booking.findOne({ donDatId: Number(bookingId) });
        } else {
            booking = await Booking.findById(bookingId);
        }

        if (!booking) {
            return res.status(404).json({ msg: 'Booking not found' });
        }

        res.json({ status: booking.trangThai }); // 'PENDING' or 'CONFIRMED'
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// Handle SePay Webhook
// Handle SePay Webhook
exports.handleSepayWebhook = async (req, res) => {
    try {
        const { transferContent, content, description } = req.body;
        const paymentText = transferContent || content || description || "";

        // Security Check
        const apiToken = process.env.SEPAY_API_TOKEN;
        if (apiToken) {
            const authHeader = req.headers.authorization;
            const incomingToken = authHeader?.split(" ")[1] || req.body.api_token;

            if (!incomingToken || incomingToken !== apiToken) {
                console.warn("SePay Webhook Unauthorized Attempt");
                // return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
        }

        // 1. Check for REFUND
        if (paymentText.match(/Hoan tien Tour\s*(\d+)/i)) {
            return await processRefundWebhook(req, res, paymentText);
        }

        // 2. Check for PAYMENT
        if (paymentText.match(/TOUR\s*(\d+)/i)) {
            return await processPaymentWebhook(req, res, paymentText);
        }

        return res.status(200).json({ success: true, msg: 'Ignored: No matching content' });

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

const processRefundWebhook = async (req, res, paymentText) => {
    const refundMatch = paymentText.match(/Hoan tien Tour\s*(\d+)/i);
    const bookingId = refundMatch[1];
    const booking = await Booking.findOne({ donDatId: Number(bookingId) }).populate('userId');

    if (!booking) { return res.status(200).json({ success: true, msg: 'Refund Booking not found' }); }
    if (booking.trangThai !== 'Chờ hoàn tiền') { return res.status(200).json({ success: true, msg: 'Booking not pending refund' }); }

    // Update Status
    booking.trangThai = 'Đã hoàn tiền';
    await booking.save();

    // Send Email
    const { sendRefundCompletedEmail } = require('../utils/emailService');
    const userEmail = booking.emailLienHe || (booking.userId ? booking.userId.email : '');
    let emailSent = false;

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

    // Notify Admin via Socket
    if (req.io) {
        req.io.emit('admin_notification', {
            type: 'refund_auto',
            message: `✅ Hoàn tiền tự động thành công cho đơn #${booking.donDatId}${emailSent ? ' - Email đã gửi' : ''}`,
            data: {
                bookingId: booking.donDatId,
                emailSent,
                amount: booking.refundAmountEst || booking.tongTienThanhToan
            }
        });
    }

    return res.json({
        success: true,
        msg: 'Refund confirmed via Webhook',
        emailSent,
        bookingId: booking.donDatId
    });
};

const processPaymentWebhook = async (req, res, paymentText) => {
    const { transferAmount } = req.body;
    const match = paymentText.match(/TOUR\s*(\d+)/i);
    const bookingId = match[1];

    const booking = await Booking.findOne({ donDatId: Number(bookingId) });

    if (!booking) {
        console.error(`Booking #${bookingId} not found for payment webhook`);
        return res.status(200).json({ success: true, msg: 'Booking not found, processed anyway' });
    }

    if (parseFloat(transferAmount) < booking.tongTienThanhToan) {
        console.warn(`Payment amount mismatch for Booking #${bookingId}. Expected: ${booking.tongTienThanhToan}, Received: ${transferAmount}`);
    }

    if (booking.trangThai === 'CONFIRMED' || booking.trangThai === 'PAID') {
        return res.status(200).json({ success: true, msg: 'Already confirmed' });
    }

    // Update Status
    booking.trangThai = 'CONFIRMED';
    await booking.save();

    // Notify Admin via Socket
    if (req.io) {
        req.io.emit('admin_notification', {
            type: 'payment',
            message: `💰 Thanh toán thành công cho đơn #${booking.donDatId} (${Number(transferAmount).toLocaleString('vi-VN')}đ)`,
            data: booking
        });
    }

    // Send Email
    const tour = await Tour.findById(booking.tourId);
    const user = await User.findById(booking.userId);
    const emailToSend = booking.emailLienHe || (user ? user.email : null);

    if (emailToSend) {
        sendPaymentSuccessEmail(emailToSend, {
            bookingId: booking.donDatId,
            tourName: tour ? tour.tenTour : 'Tour du lịch',
            departureDate: new Date(booking.ngayKhoiHanh).toLocaleDateString('vi-VN'),
            totalPrice: booking.tongTienThanhToan,
            adults: booking.soLuongNguoiLon,
            children: booking.soLuongTreEm,
            contactName: booking.nguoiLienHe || (user ? user.hoTen : 'Quý khách')
        }).catch(console.error);
    }

    return res.status(200).json({ success: true, bookingId: booking.donDatId });
};