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
    ghiChu: String
});

module.exports = mongoose.model('Booking', bookingSchema);
