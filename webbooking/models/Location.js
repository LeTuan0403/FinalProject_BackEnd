const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
    diaDiemId: { type: Number, required: true, unique: true },
    tenDiaDiem: { type: String, required: true },
    moTa: String,
    hinhAnh: String,
    diaChiCuThe: String,
    giaVe: { type: Number, default: 0 },
    thoiGianThamQuanDuKien: Number,
    nguoiTaoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    daDuyet: { type: Number, default: 0 }
});

module.exports = mongoose.model('Location', locationSchema);
