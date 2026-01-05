const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const User = require('../models/User');
const { sendBookingConfirmation } = require('../utils/emailService');

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
exports.handleSepayWebhook = async (req, res) => {
    try {
        const { gateway, transactionDate, accountNumber, subAccount, transferAmount, transferType, transferContent, content, referenceCode, description, in: amountIn, out, accumulated, transactionId } = req.body;

        console.log("SePay Webhook Received:", JSON.stringify(req.body, null, 2));

        // Simple security check (optional): Check if API Key matches (if configured)
        // For now, we rely on the specific content syntax.

        // Content Pattern: "TOUR <BookingID>" (e.g., "TOUR 12345")
        // Flexible check: SePay might send 'content' or 'transferContent' or 'description'
        const paymentText = transferContent || content || description || "";
        const regex = /TOUR\s*(\d+)/i; // Allow 0 or more spaces just in case, though standard is space
        const match = contentMatches(paymentText, regex);

        if (!match) {
            // Not a payment for our system, or wrong format
            return res.status(200).json({ success: true, msg: 'Ignored: No matching content' });
        }

        const bookingId = match[1];

        const booking = await Booking.findOne({ donDatId: Number(bookingId) });

        if (!booking) {
            console.error(`Booking #${bookingId} not found for payment webhook`);
            return res.status(200).json({ success: true, msg: 'Booking not found, processed anyway' });
        }

        // Verify Amount (Approximate check mainly because user might transfer slightly different amount? OR exact match required)
        // SePay sends number or string. Warning: transferAmount might be type string or number.
        if (parseFloat(transferAmount) < booking.tongTienThanhToan) {
            console.warn(`Payment amount mismatch for Booking #${bookingId}. Expected: ${booking.tongTienThanhToan}, Received: ${transferAmount}`);
        }

        if (booking.trangThai === 'CONFIRMED' || booking.trangThai === 'PAID') {
            return res.status(200).json({ success: true, msg: 'Already confirmed' });
        }

        // Update Status
        booking.trangThai = 'CONFIRMED'; // Or 'PAID'
        await booking.save();

        // Send Email
        const tour = await Tour.findById(booking.tourId);
        const user = await User.findById(booking.userId);

        // Note: sendBookingConfirmation is async, but we don't need to wait for it to respond to webhook
        sendBookingConfirmation(booking, tour, user).catch(console.error);

        return res.status(200).json({ success: true, bookingId: booking.donDatId });

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// Helper: Extract content
function contentMatches(content, regex) {
    if (!content) return null;
    return content.match(regex);
}
