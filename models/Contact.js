const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    lienHeId: { type: Number, required: true, unique: true }, // Legacy SQL ID
    hoTen: { type: String, required: true },
    email: { type: String, required: true },
    noiDung: { type: String, required: true },
    ngayGui: { type: Date, default: Date.now },
    trangThai: { type: String, default: 'Chờ xử lý' }, // 'Chờ xử lý', 'Đã xử lý'
    phanHoi: String // Admin response
});

module.exports = mongoose.model('Contact', contactSchema);
