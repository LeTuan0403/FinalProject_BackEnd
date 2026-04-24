const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    donDatId: { type: Number, required: true, unique: true }, // Legacy SQL ID
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tourId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },
    ngayKhoiHanh: Date,
    soLuongNguoi: { type: Number, default: 1 },
    tongTienThanhToan: Number,
    trangThai: String,
    ngayDat: { type: Date, default: Date.now },
    soLuongNguoiLon: Number,
    soLuongTreEm: Number,
    nguoiLienHe: String,
    emailLienHe: String,
    sdtLienHe: String,
    ghiChu: String,

    // Re-booking Flag
    isRebooking: { type: Boolean, default: false },

    // Refund System Fields
    refundBankName: String,
    refundAccountNumber: String,
    refundAccountHolder: String,
    refundReason: String,
    refundAmountEst: Number,
    refundPolicyApplied: String,
    isRefundCommitment: { type: Boolean, default: false },
    refundCommitmentDate: Date,
    refundOtp: String,
    refundOtpExpires: Date,
    couponCode: String, // [NEW]
    discountAmount: { type: Number, default: 0 } // [NEW]
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
