const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Không thể gửi email: ' + error.message);
  }
};

const sendVerificationEmail = async (email, code) => {
  const subject = 'Xác thực tài khoản - Tour Booking';
  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2c3e50; text-align: center;">Chào mừng bạn đến với Tour Booking!</h2>
            <p>Cảm ơn bạn đã đăng ký tài khoản. Đây là mã xác thực của bạn:</p>
            <div style="text-align: center; margin: 30px 0;">
                <h1 style="color: #2c3e50; letter-spacing: 5px; background: #f8f9fa; padding: 10px; display: inline-block; border-radius: 5px;">${code}</h1>
            </div>
            <p style="text-align: center;">Hoặc nhấp vào nút bên dưới để xác thực ngay:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="http://localhost:3000/verify-account?email=${email}&code=${code}" style="background-color: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Xác thực tài khoản</a>
            </div>
            <p>Mã này sẽ hết hạn sau 10 phút.</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

const sendResetEmail = async (email, code) => {
  const subject = 'Mã xác nhận đặt lại mật khẩu - Tour Booking';
  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2c3e50; text-align: center;">Yêu cầu đặt lại mật khẩu</h2>
            <p>Bạn nhận được email này vì bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>
            <p>Mã xác thực của bạn là:</p>
            <div style="text-align: center; margin: 30px 0;">
                <h1 style="color: #2c3e50; letter-spacing: 5px; background: #f8f9fa; padding: 10px; display: inline-block; border-radius: 5px;">${code}</h1>
            </div>
            <p>Mã này sẽ hết hạn sau 10 phút.</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

// Function gửi thông báo xác nhận đặt tour (Validation/Pending)
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  const subject = 'Xác nhận đặt tour - Tour Booking';

  // Format currency
  const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(bookingDetails.totalPrice);

  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #27ae60; text-align: center;">Đơn đặt tour đã được ghi nhận!</h2>
            <p>Chào <strong>${bookingDetails.contactName}</strong>,</p>
            <p>Cảm ơn bạn đã đặt tour tại Tour Booking. Đơn hàng của bạn đang ở trạng thái <strong>Chờ thanh toán</strong>.</p>
            
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #2c3e50;">Thông tin đơn hàng #${bookingDetails.bookingId}</h3>
                <p><strong>Tour:</strong> ${bookingDetails.tourName}</p>
                <p><strong>Ngày khởi hành:</strong> ${bookingDetails.departureDate}</p>
                <p><strong>Số lượng:</strong> ${bookingDetails.adults} Người lớn, ${bookingDetails.children} Trẻ em</p>
                <p><strong>Tổng tiền:</strong> ${formattedPrice}</p>
                ${bookingDetails.notes ? `<p><strong>Ghi chú:</strong> ${bookingDetails.notes}</p>` : ''}
            </div>

            <p>Vui lòng thanh toán để hoàn tất giữ chỗ.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${bookingDetails.paymentLink}" style="background-color: #27ae60; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Tiến Hành Thanh Toán</a>
            </div>
            
            <p style="color: #7f8c8d; font-size: 0.9em;">Nếu cần hỗ trợ, vui lòng trả lời email này.</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

// Function gửi thông báo hủy tour
const sendBookingCancellationEmail = async (email, bookingDetails) => {
  const subject = 'Thông báo hủy tour - Tour Booking';
  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #e74c3c; text-align: center;">Thông Báo Hủy Tour</h2>
             <p>Xin chào <strong>${bookingDetails.hoTen || 'Quý khách'}</strong>,</p>
            <p>Đơn đặt tour <strong>#${bookingDetails.bookingId}</strong> của bạn đã bị hủy.</p>
            
            <div style="background: #fff5f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #e74c3c;">
                <h3 style="margin-top: 0; color: #c0392b;">Chi tiết hủy</h3>
                <p><strong>Tour:</strong> ${bookingDetails.tenTour}</p>
                 <p><strong>Lý do:</strong> ${bookingDetails.lyDo || 'Đã quá hạn thanh toán hoặc yêu cầu hủy'}</p>
            </div>

            <p>Nếu bạn đã thanh toán, nhân viên sẽ liên hệ để hoàn tiền theo chính sách (nếu có).</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Nếu đây là sự nhầm lẫn, vui lòng liên hệ ngay với chúng tôi.</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

// DISABLED: Notification handled via In-App Notification
const sendReviewReplyEmail = async (_email, _reviewDetails) => {
  // Disabled as per user request to use in-app notifications only
  return true;
};

const sendPaymentSuccessEmail = async (email, bookingDetails) => {
  const subject = 'Xác nhận thanh toán thành công - Tour Booking';

  // Format currency
  const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(bookingDetails.totalPrice);

  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #27ae60; text-align: center;">Thanh toán thành công!</h2>
            <p>Xin chào <strong>${bookingDetails.contactName}</strong>,</p>
            <p>Chúng tôi đã nhận được thanh toán cho đơn đặt tour của bạn. Chỗ của bạn đã được xác nhận.</p>
            
            <div style="background: #e8f8f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #27ae60;">
                <h3 style="margin-top: 0; color: #1e8449;">Chi tiết thanh toán</h3>
                <p><strong>Mã đơn hàng:</strong> #${bookingDetails.bookingId}</p>
                <p><strong>Tour:</strong> ${bookingDetails.tourName}</p>
                <p><strong>Ngày khởi hành:</strong> ${bookingDetails.departureDate}</p>
                <p><strong>Số lượng:</strong> ${bookingDetails.adults} Người lớn, ${bookingDetails.children} Trẻ em</p>
                <p><strong>Đã thanh toán:</strong> <span style="color: #c0392b; font-weight: bold;">${formattedPrice}</span></p>
            </div>

            <p>Hướng dẫn viên sẽ liên hệ với bạn trước ngày khởi hành để thông báo chi tiết điểm đón.</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Cảm ơn bạn đã tin tưởng lựa chọn Tour Booking!</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

const sendRefundOtpEmail = async (email, otpCode, bookingId) => {
  const subject = 'Mã xác thực yêu cầu hủy tour - Tour Booking';
  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #c0392b; text-align: center;">Yêu cầu hủy tour</h2>
            <p>Xin chào,</p>
            <p>Bạn đang thực hiện yêu cầu hủy tour cho đơn hàng <strong>#${bookingId}</strong>.</p>
            <p>Mã OTP xác thực của bạn là:</p>
            <div style="text-align: center; margin: 30px 0;">
                <h1 style="color: #c0392b; letter-spacing: 5px; background: #fdf2f2; padding: 10px; display: inline-block; border-radius: 5px; border: 1px dashed #c0392b;">${otpCode}</h1>
            </div>
            <p>Mã này sẽ hết hạn sau <strong>5 phút</strong>.</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Nếu bạn không thực hiện yêu cầu này, vui lòng liên hệ ngay với chúng tôi.</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

const sendRefundCompletedEmail = async (email, bookingDetails) => {
  const subject = 'Hoàn tiền thành công - Tour Booking';
  const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(bookingDetails.refundAmount);

  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #27ae60; text-align: center;">Thông báo hoàn tiền</h2>
            <p>Xin chào <strong>${bookingDetails.contactName}</strong>,</p>
            <p>Chúng tôi đã thực hiện chuyển khoản hoàn tiền cho đơn hủy tour <strong>#${bookingDetails.bookingId}</strong>.</p>
            
            <div style="background: #e8f8f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #27ae60;">
                <h3 style="margin-top: 0; color: #1e8449;">Chi tiết giao dịch</h3>
                <p><strong>Số tiền hoàn:</strong> <span style="font-weight: bold; color: #27ae60;">${formattedPrice}</span></p>
                <p><strong>Ngân hàng:</strong> ${bookingDetails.bankName}</p>
                <p><strong>Số tài khoản:</strong> ${bookingDetails.accountNumber}</p>
                 <p><strong>Chủ tài khoản:</strong> ${bookingDetails.accountHolder}</p>
            </div>

            <p>Vui lòng kiểm tra tài khoản của bạn. Thời gian nhận tiền phụ thuộc vào ngân hàng thụ hưởng (thường trong vòng 24h).</p>
            <p style="color: #7f8c8d; font-size: 0.9em;">Cảm ơn bạn!</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

// Function gửi thông báo tin nhắn hỗ trợ (Chat Reply)
// DISABLED: Notification handled via In-App Notification
const sendChatReplyEmail = async (_email, _userName, _messageText, _link) => {
  // Disabled: Use in-app notification
  return true; // No-op
};

// DISABLED: Notification handled via In-App Notification
const sendPostCommentEmail = async (_email, _details) => {
  // Disabled
  return true; // No-op
};

// DISABLED: Notification handled via In-App Notification
// Function gửi thông báo duyệt tour thành công
const sendTourApprovalEmail = async (email, tourDetails) => {
  const subject = 'Tour của bạn đã được duyệt - Tour Booking';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const link = `${frontendUrl}/tours/${tourDetails.tourId}`;

  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #27ae60; text-align: center;">Tour của bạn đã được duyệt!</h2>
            <p>Xin chào <strong>${tourDetails.creatorName}</strong>,</p>
            <p>Tin vui! Tour <strong>${tourDetails.tourName}</strong> mà bạn thiết kế đã được ban quản trị phê duyệt.</p>
            
            <div style="background: #e8f8f5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #27ae60;">
                <p>Hiện tại, tour của bạn đã được hiển thị công khai trên hệ thống và khách hàng có thể bắt đầu đặt chỗ.</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="background-color: #27ae60; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Xem Tour Của Bạn</a>
            </div>
            
            <p style="color: #7f8c8d; font-size: 0.9em;">Chúc bạn có thật nhiều khách hàng!</p>
        </div>
    `;
  return await sendEmail(email, subject, html);
};

module.exports = {
  sendVerificationEmail,
  sendResetEmail,
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendChatReplyEmail,
  sendReviewReplyEmail,
  sendPaymentSuccessEmail,
  sendRefundOtpEmail,
  sendRefundCompletedEmail,
  sendPostCommentEmail,
  sendTourApprovalEmail,
  sendEmail
};
