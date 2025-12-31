const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    danhGiaId: { type: Number, required: true, unique: true },
    tourId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tour' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    soSao: { type: Number, min: 1, max: 5 },
    binhLuan: String,
    ngayDanhGia: { type: Date, default: Date.now },
    traLoi: String,
    ngayTraLoi: Date
});

module.exports = mongoose.model('Review', reviewSchema);
