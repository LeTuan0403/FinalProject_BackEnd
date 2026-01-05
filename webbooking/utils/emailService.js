const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, text, html) => {
  try {
    const mailOptions = {
      from: `"Tour Booking Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

const sendBookingConfirmation = async (booking, tour, user) => {
  const subject = `[Xác nhận thành công] Vé điện tử cho đơn hàng #${booking.donDatId}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #2563EB; padding: 20px; text-align: center; color: white;">
        <h1 style="margin: 0;">Vé Điện Tử</h1>
        <p style="margin: 5px 0 0;">Cảm ơn quý khách đã đặt tour!</p>
      </div>
      
      <div style="padding: 20px;">
        <p>Xin chào <strong>${booking.nguoiLienHe || user.hoTen}</strong>,</p>
        <p>Đơn đặt tour của quý khách đã được thanh toán thành công. Dưới đây là thông tin chi tiết:</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">${tour.tenTour}</h3>
          <p><strong>Mã Tour:</strong> ${tour.maTour || tour.tourId}</p>
          <p><strong>Ngày khởi hành:</strong> ${new Date(booking.ngayKhoiHanh).toLocaleDateString('vi-VN')}</p>
          <p><strong>Số lượng:</strong> ${booking.soLuongNguoi} khách (${booking.soLuongNguoiLon || 0} Lớn, ${booking.soLuongTreEm || 0} Trẻ em)</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 10px 0;">
          <p style="font-size: 18px; color: #dc2626; font-weight: bold;">Tổng tiền: ${booking.tongTienThanhToan?.toLocaleString()} ₫</p>
        </div>

        <p><strong>Mã đơn hàng:</strong> #${booking.donDatId}</p>
        
        <p>Quý khách vui lòng có mặt tại <strong>${tour.diemKhoiHanh}</strong> trước giờ khởi hành ít nhất 30 phút.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/profile" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Xem Chi Tiết Đơn Hàng</a>
        </div>
      </div>
      
      <div style="background-color: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
        <p>Đây là email tự động, vui lòng không trả lời.</p>
        <p>&copy; ${new Date().getFullYear()} Tour Booking Inc.</p>
      </div>
    </div>
  `;

  await sendEmail(booking.emailLienHe || user.email, subject, "Vé điện tử của bạn", html);
};

module.exports = { sendEmail, sendBookingConfirmation };
