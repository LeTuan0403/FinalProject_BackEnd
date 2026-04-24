const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['PERCENT', 'FIXED'], required: true }, // 'PERCENT' or 'FIXED'
    value: { type: Number, required: true }, // % or Amount
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // Max reduction amount (for PERCENT)
    expiry: { type: Date, required: true },
    usageLimit: { type: Number, default: 0 }, // 0 = Unlimited
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    usedBy: [
        {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
            usedAt: { type: Date, default: Date.now }
        }
    ],
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // If populated, ONLY these users can use/see it
    isPublic: { type: Boolean, default: false } // If true, visible to everyone in "Kho Voucher"
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
