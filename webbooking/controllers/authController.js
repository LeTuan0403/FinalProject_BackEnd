const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const getNextSequence = require('../utils/idGenerator');
const crypto = require('crypto');
const { sendVerificationEmail, sendResetEmail } = require('../utils/emailService');
const { validationResult } = require('express-validator'); // Added from Code Edit

// Client ID should be in env but fallback to hardcoded for testing if needed
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to create and send token
const createAndSendToken = (user, res) => {
    const payload = { user: { id: user.id, role: user.isAdmin } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
        if (err) { throw err; }
        res.json({
            token,
            hoTen: user.hoTen,
            role: user.isAdmin === 1 ? 'Admin' : 'Customer',
            userId: user.userId,
            email: user.email,
            soDienThoai: user.soDienThoai,
            diaChi: user.diaChi,
            hanCheThanhToan: user.hanCheThanhToan
        });
    });
};

exports.register = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { hoTen, email, matKhau, soDienThoai } = req.body; // Removed diaChi, ngaySinh

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
        // const verificationCodeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes // Moved into user object

        user = new User({
            userId: await getNextSequence('userId'),
            hoTen,
            email,
            matKhau,
            soDienThoai,
            // diaChi, // Removed
            // ngaySinh, // Removed
            isAdmin: 0, // Default customer
            verificationCode,
            verificationCodeExpires: Date.now() + 10 * 60 * 1000, // 10 mins
            isVerified: false
        });

        const salt = await bcrypt.genSalt(10);
        user.matKhau = await bcrypt.hash(matKhau, salt);

        await user.save();

        try {
            // Send verification email
            await sendVerificationEmail(user.email, verificationCode);
            res.json({ msg: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản.' });
        } catch (emailError) {
            console.error("Lỗi gửi email xác thực:", emailError);
            // Rollback user creation if email fails
            await User.findByIdAndDelete(user._id);
            return res.status(400).json({ msg: 'Email không tồn tại hoặc không thể nhận thư. Vui lòng kiểm tra lại.' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.verifyAccount = async (req, res) => {
    const { email, code } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ msg: 'Người dùng không tồn tại' }); // Updated message
        }

        if (user.isVerified) {
            return res.status(400).json({ msg: 'Tài khoản đã được xác thực' }); // Updated message
        }

        if (user.verificationCode !== code || user.verificationCodeExpires < Date.now()) {
            return res.status(400).json({ msg: 'Mã xác thực không đúng hoặc đã hết hạn' }); // Updated message
        }

        user.isVerified = true;
        user.verificationCode = undefined;
        user.verificationCodeExpires = undefined;
        await user.save();

        createAndSendToken(user, res); // Refactored to use helper
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.login = async (req, res) => {
    const { email, matKhau } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Email hoặc mật khẩu không chính xác' });
        }

        if (!user.isVerified) {
            return res.status(400).json({ msg: 'Tài khoản chưa được xác thực. Vui lòng kiểm tra email.' });
        }

        const isMatch = await bcrypt.compare(matKhau, user.matKhau);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Email hoặc mật khẩu không chính xác' });
        }

        createAndSendToken(user, res); // Refactored to use helper
    } catch (err) {
        console.error(err.message); // Changed from next(err)
        res.status(500).send('Server Error');
    }
};

exports.googleLogin = async (req, res) => {
    const { idToken } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { name, email } = ticket.getPayload();

        let user = await User.findOne({ email });

        if (user) {
            // User exists, login
            createAndSendToken(user, res); // Refactored to use helper
        } else {
            // Register new user via Google
            // Generate random password
            const password = crypto.randomBytes(16).toString('hex');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                userId: await getNextSequence('userId'), // Kept userId generation
                hoTen: name,
                email,
                isAdmin: 0,
                isVerified: true,
                matKhau: hashedPassword
                // avatar: picture // If we had avatar field
            });
            await user.save();

            const payload = { user: { id: user.id, role: user.isAdmin } };
            jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
                if (err) { throw err; }
                res.json({
                    token,
                    hoTen: user.hoTen,
                    role: user.isAdmin === 1 ? 'Admin' : 'Customer',
                    userId: user.userId,
                    email: user.email,
                    soDienThoai: user.soDienThoai,
                    diaChi: user.diaChi
                });
            });
        }
    } catch (err) {
        console.error(err);
        res.status(401).send('Google Token Verification Failed');
    }
};

exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ msg: 'Email không tồn tại trong hệ thống' });
        }

        // Generate 6-digit OTP for reset
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        await user.save();

        // Send email
        if (sendResetEmail) {
            await sendResetEmail(user.email, resetToken);
            res.json({ msg: 'Mã xác nhận đã được gửi đến email của bạn.' });
        } else {

            res.json({ msg: 'Chức năng gửi email đang cập nhật. Mã reset: ' + resetToken });
        }

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.resetPassword = async (req, res) => {
    const { email, token, newPassword } = req.body;

    try {
        const user = await User.findOne({
            email,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ msg: 'Token không hợp lệ hoặc đã hết hạn' });
        }

        const salt = await bcrypt.genSalt(10);
        user.matKhau = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        // Auto login after reset
        const payload = { user: { id: user.id, role: user.isAdmin } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
            if (err) { throw err; }
            res.json({
                msg: 'Đổi mật khẩu thành công.',
                token,
                hoTen: user.hoTen,
                role: user.isAdmin === 1 ? 'Admin' : 'Customer',
                userId: user.userId,
                email: user.email,
                soDienThoai: user.soDienThoai,
                diaChi: user.diaChi,
                hanCheThanhToan: user.hanCheThanhToan
            });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
