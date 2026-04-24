const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const auth = require('../middleware/authMiddleware');

// Public (Authenticated User)
router.get('/available', auth, couponController.getAvailableCoupons); // [NEW]
router.post('/validate', auth, couponController.validateCoupon);

// Admin
router.post('/', auth, couponController.createCoupon);
router.get('/', auth, couponController.getAllCoupons);
router.put('/:id/toggle', auth, couponController.toggleCoupon);
router.delete('/:id', auth, couponController.deleteCoupon);
router.put('/:id', auth, couponController.updateCoupon); // [NEW]
router.put('/:id/assign', auth, couponController.assignCoupon);
router.put('/:id/assign-all', auth, couponController.assignToAllUsers);

module.exports = router;
