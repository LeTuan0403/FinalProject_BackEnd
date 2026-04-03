const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { check } = require('express-validator');

// POST /api/auth/register
router.post('/register', [
    check('email', 'Vui lòng nhập email hợp lệ').isEmail(),
    check('matKhau', 'Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
], authController.register);
router.post('/verify', authController.verifyAccount);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/google-login
router.post('/google-login', authController.googleLogin);

// POST /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);

module.exports = router;
