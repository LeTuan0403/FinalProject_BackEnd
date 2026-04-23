const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
  tourId: { type: Number, required: true, unique: true }, // Legacy SQL ID
  tenTour: { type: String, required: true },
  moTa: String,
  hinhAnhBia: String,
  isTuChon: { type: Boolean, default: false },
  nguoiTaoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  anSang: String,
  anTrua: String,
  anToi: String,
  tongGiaDuKien: Number,
  soLuongCho: { type: Number, default: 0 },
  ngayKhoiHanh: { type: [Date], default: [] },
  ngayTao: { type: Date, default: Date.now },
  phuongTien: String,
  daDuyet: { type: Number, default: 0 }, // 0: Pending, 1: Approved? Screenshot shows 1
  maTour: String,
  tenDiaDiem: String, // Stores list of destinations e.g. "Hà Nội - Lào Cai"
  thoiGian: String,
  diemKhoiHanh: String,
  diemNhan: String,
  dichVuBaoGom: String,
  dichVuKhongBaoGom: String,
  chinhSachTour: String,
  loaiTour: String,
  khuVuc: String,
  lichTrinh: [
    {
      id: Number, // Day ID (1, 2, 3...)
      diaDiemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
      thuTu: Number,
      ngayThu: Number,
      phuongTienDiChuyen: String,
      ghiChu: String,
      thoiGian: String,
      tieuDe: String,
      hinhAnh: String,
      dichVuAnUong: String
    }
  ],
  discounts: [
    {
      date: Date,
      percentage: { type: Number, default: 10 }
    }
  ]
});

module.exports = mongoose.model('Tour', tourSchema);
