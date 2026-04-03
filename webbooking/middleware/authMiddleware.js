const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    // Check if not token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    // Verify token
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch fresh user data from DB to ensure role changes take effect immediately
        const user = await User.findById(decoded.user.id).select('-matKhau');

        if (!user) {
            return res.status(401).json({ msg: 'User not found or disabled' });
        }

        // Standardize req.user to match what controllers expect
        // Controllers expect: req.user.id, req.user.role (1 or 0)
        req.user = {
            id: user.id, // Mongoose virtual 'id' returns _id as string
            _id: user._id,
            userId: user.userId,
            email: user.email,
            hoTen: user.hoTen, // Required for email notifications
            role: user.isAdmin, // Map isAdmin to role
            isAdmin: user.isAdmin
        };

        next();
    } catch (err) {
        console.error('Middleware Error:', err.message);
        res.status(401).json({ msg: 'Token is not valid' });
    }
};
