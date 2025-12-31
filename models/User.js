const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true }, // Legacy SQL ID
    hoTen: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    matKhau: { type: String, required: true },
    soDienThoai: String,
    diaChi: String,
    ngaySinh: Date,
    isAdmin: { type: Number, default: 0 }, // Screenshot shows 1 for admin
    ngayTao: { type: Date, default: Date.now },
    toursYeuThich: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tour' }]
});

module.exports = mongoose.model('User', userSchema);
