const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const getNextSequence = require('../utils/idGenerator');
const crypto = require('crypto');

// Client ID should be in env but fallback to hardcoded for testing if needed
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.register = async (req, res) => {
    const { hoTen, email, matKhau } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = new User({
            userId: await getNextSequence('userId'),
            hoTen,
            email,
            matKhau,
            isAdmin: 0 // Default customer
        });

        const salt = await bcrypt.genSalt(10);
        user.matKhau = await bcrypt.hash(matKhau, salt);

        await user.save();

        const payload = { user: { id: user.id, role: user.isAdmin } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, hoTen: user.hoTen, role: user.isAdmin === 1 ? 'Admin' : 'Customer', userId: user.userId });
        });
    } catch (err) {
        next(err);
    }
};

exports.login = async (req, res) => {
    const { email, matKhau } = req.body;

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(matKhau, user.matKhau);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const payload = { user: { id: user.id, role: user.isAdmin } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, hoTen: user.hoTen, role: user.isAdmin === 1 ? 'Admin' : 'Customer', userId: user.userId });
        });
    } catch (err) {
        next(err);
    }
};

exports.googleLogin = async (req, res) => {
    const { idToken } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { name, email, picture } = ticket.getPayload();

        let user = await User.findOne({ email });

        if (user) {
            // User exists, login
            const payload = { user: { id: user.id, role: user.isAdmin } };
            jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
                if (err) throw err;
                res.json({ token, hoTen: user.hoTen, role: user.isAdmin === 1 ? 'Admin' : 'Customer', userId: user.userId });
            });
        } else {
            // Create new user from Google
            user = new User({
                userId: await getNextSequence('userId'),
                hoTen: name,
                email,
                matKhau: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10), // Stronger password
                isAdmin: 0,
                // avatar: picture // If we had avatar field
            });
            await user.save();

            const payload = { user: { id: user.id, role: user.isAdmin } };
            jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
                if (err) throw err;
                res.json({ token, hoTen: user.hoTen, role: user.isAdmin === 1 ? 'Admin' : 'Customer', userId: user.userId });
            });
        }
    } catch (err) {
        console.error(err);
        res.status(401).send('Google Token Verification Failed');
    }
};
