const Coupon = require('../models/Coupon');

// Create Coupon
exports.createCoupon = async (req, res) => {
    try {
        const { code, type, value, minOrder, maxDiscount, expiry, usageLimit } = req.body;

        const existing = await Coupon.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(400).json({ msg: 'Coupon code already exists' });
        }

        // Set expiry to end of day
        const expiryDate = new Date(expiry);
        expiryDate.setHours(23, 59, 59, 999);

        const newCoupon = new Coupon({
            code, type, value, minOrder, maxDiscount, expiry: expiryDate, usageLimit,
            isPublic: req.body.isPublic || false
        });

        await newCoupon.save();
        res.status(201).json(newCoupon);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Get All Coupons
exports.getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch {
        res.status(500).send('Server Error');
    }
};

// Toggle Active
exports.toggleCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ msg: 'Coupon not found' });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();
        res.json(coupon);
    } catch {
        res.status(500).send('Server Error');
    }
};

// Delete Coupon
exports.deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Coupon deleted' });
    } catch {
        res.status(500).send('Server Error');
    }
};

// Get Available Coupons for User
exports.getAvailableCoupons = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        // Fetch all candidates
        const allCoupons = await Coupon.find({});

        // Filter valid coupons
        const currentBookingId = (req.query && req.query.bookingId) || (req.body && req.body.bookingId);

        // Filter valid coupons using helper
        const available = allCoupons.filter(c => isCouponValidForUser(c, userId, now, currentBookingId));

        res.json(available);
    } catch (err) {
        console.error("❌ getAvailableCoupons Error:", err);
        res.status(500).json({ msg: 'Server Error', error: err.message, stack: err.stack });
    }
};

// Validate Coupon (Public/Client)
exports.validateCoupon = async (req, res) => {
    try {
        const { code, orderValue } = req.body;
        const userId = req.user ? req.user.id : null;

        const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

        if (!coupon) {
            return res.status(404).json({ msg: 'Mã giảm giá không tồn tại hoặc đã hết hạn.' });
        }

        // Check Expiry, Limits, Usage
        const usageError = checkCouponUsage(coupon, userId, req.body);
        if (usageError) {
            return res.status(400).json({ msg: usageError });
        }

        // Check Min Order
        if (orderValue < coupon.minOrder) {
            return res.status(400).json({ msg: `Đơn hàng tối thiểu để áp dụng là ${coupon.minOrder.toLocaleString()}đ` });
        }

        // Calculate Discount
        const discountAmount = calculateDiscount(coupon, orderValue);

        res.json({
            success: true,
            coupon,
            discountAmount,
            msg: 'Áp dụng mã thành công!'
        });

    } catch (err) {
        console.error("❌ validateCoupon Error:", err);
        res.status(500).json({ msg: 'Server Error', error: err.message, stack: err.stack });
    }
};

const checkCouponUsage = (coupon, userId, reqBody) => {
    // Check Expiry
    if (new Date() > new Date(coupon.expiry)) {
        return 'Mã giảm giá đã hết hạn.';
    }

    // Check Global Limit
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
        return 'Mã giảm giá đã hết lượt sử dụng.';
    }

    // Check User Limit & Assignment
    if (userId) {
        const usedByArr = coupon.usedBy || [];
        const userUsage = usedByArr.find(u => u && u.userId && String(u.userId) === String(userId));

        if (userUsage) {
            const currentBookingId = (reqBody && reqBody.bookingId);
            if (!currentBookingId || String(userUsage.bookingId || '') !== String(currentBookingId)) {
                return 'Bạn đã sử dụng mã giảm giá này rồi.';
            }
        }

        // Check Visibility & Assignment
        if (!coupon.isPublic) {
            const isAssigned = coupon.assignedTo && coupon.assignedTo.some(id => id && String(id) === String(userId));
            if (!isAssigned) {
                return 'Mã giảm giá này không áp dụng cho tài khoản của bạn.';
            }
        }
    } else if (!coupon.isPublic) {
        // Unauthenticated users cannot use private coupons
        return 'Vui lòng đăng nhập để sử dụng mã giảm giá này.';
    }
    return null;
};

const calculateDiscount = (coupon, orderValue) => {
    let discountAmount = 0;
    if (coupon.type === 'PERCENT') {
        discountAmount = (orderValue * coupon.value) / 100;
        if (coupon.maxDiscount > 0) {
            discountAmount = Math.min(discountAmount, coupon.maxDiscount);
        }
    } else {
        discountAmount = coupon.value;
    }
    return Math.min(discountAmount, orderValue);
};

// Assign Coupon to Users
exports.assignCoupon = async (req, res) => {
    try {
        const { userIds } = req.body;
        const couponId = req.params.id;

        if (!Array.isArray(userIds)) {
            return res.status(400).json({ msg: 'Invalid user list' });
        }

        const coupon = await Coupon.findById(couponId);
        if (!coupon) { return res.status(404).json({ msg: 'Coupon not found' }); }

        if (!coupon.assignedTo) { coupon.assignedTo = []; }

        const currentAssigned = coupon.assignedTo.filter(id => id).map(id => id.toString());
        const newIds = userIds.filter(id => !currentAssigned.includes(id));

        if (newIds.length > 0) {
            coupon.assignedTo.push(...newIds);
            await coupon.save();
        }

        res.json({ msg: `Đã phát mã cho ${newIds.length} người dùng mới.`, totalAssigned: coupon.assignedTo.length });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Update Coupon
exports.updateCoupon = async (req, res) => {
    try {
        const { code, type, value, minOrder, maxDiscount, expiry, usageLimit } = req.body;
        const coupon = await Coupon.findById(req.params.id);

        if (!coupon) { return res.status(404).json({ msg: 'Coupon not found' }); }

        coupon.code = code.toUpperCase();
        coupon.type = type;
        coupon.value = value;
        coupon.minOrder = minOrder;
        coupon.maxDiscount = maxDiscount;

        const expiryDate = new Date(expiry);
        expiryDate.setHours(23, 59, 59, 999);
        coupon.expiry = expiryDate;

        coupon.usageLimit = usageLimit;
        coupon.isPublic = req.body.isPublic ?? coupon.isPublic;

        await coupon.save();
        res.json(coupon);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Assign Coupon to ALL Users
exports.assignToAllUsers = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        if (!coupon) { return res.status(404).json({ msg: 'Coupon not found' }); }

        const User = require('../models/User');
        const users = await User.find().select('_id');
        const userIds = users.map(u => u._id);

        if (!coupon.assignedTo) { coupon.assignedTo = []; }
        const currentAssigned = new Set(coupon.assignedTo.filter(id => id).map(id => id.toString()));
        let addedCount = 0;

        for (const userId of userIds) {
            if (!currentAssigned.has(userId.toString())) {
                coupon.assignedTo.push(userId);
                currentAssigned.add(userId.toString());
                addedCount++;
            }
        }

        await coupon.save();
        res.json({ msg: `Đã phát mã cho toàn bộ ${users.length} người dùng (${addedCount} người mới).`, totalAssigned: coupon.assignedTo.length });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

const isCouponValidForUser = (c, userId, now, queryBookingId) => {
    if (!c.isActive) { return false; }
    const expiry = c.expiry ? new Date(c.expiry) : new Date(0);
    if (expiry <= now) { return false; }
    if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) { return false; }

    // User Check
    const usedByArr = c.usedBy || [];
    const userUsage = usedByArr.find(u => u && u.userId && String(u.userId) === String(userId));
    if (userUsage) {
        if (!queryBookingId) { return false; } // Used but no booking context -> hide
        if (String(userUsage.bookingId || '') !== String(queryBookingId)) { return false; } // Used for diff booking
    }

    if (c.isPublic) { return true; }
    if (c.assignedTo && Array.isArray(c.assignedTo) && c.assignedTo.length > 0) {
        return c.assignedTo.some(id => id && String(id) === String(userId));
    }
    return false;
};
