module.exports = function (req, res, next) {
    // Check if user is authenticated and is admin
    // User model: isAdmin is Number (1 for admin, 0 for user)
    // authMiddleware maps this to req.user.isAdmin and req.user.role

    if (req.user && (req.user.isAdmin === 1 || req.user.role === 1 || req.user.role === 'Admin')) {
        next();
    } else {
        return res.status(403).json({ msg: 'Admin resource. Access denied' });
    }
};
