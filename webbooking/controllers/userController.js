const User = require('../models/User');
const Tour = require('../models/Tour');

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-matKhau');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const { keyword } = req.query;
        let query = {};

        if (keyword) {
            query = {
                $or: [
                    { hoTen: { $regex: keyword, $options: 'i' } },
                    { email: { $regex: keyword, $options: 'i' } }
                ]
            };
        }

        const users = await User.find(query).select('-matKhau -verificationCode');
        res.json({ data: users }); // Consistent format { data: [...] } for frontend
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { hoTen, soDienThoai, diaChi, ngaySinh } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) { return res.status(404).json({ msg: 'User not found' }); }

        if (hoTen) { user.hoTen = hoTen; }
        if (soDienThoai) { user.soDienThoai = soDienThoai; }
        if (diaChi) { user.diaChi = diaChi; }
        if (ngaySinh) { user.ngaySinh = ngaySinh; }

        await user.save();
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getFavorites = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('toursYeuThich');
        res.json(user.toursYeuThich || []);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.toggleFavorite = async (req, res) => {
    try {
        const legacyTourId = req.params.id;

        // Find Tour by Legacy ID
        const tour = await Tour.findOne({ tourId: legacyTourId });
        if (!tour) { return res.status(404).json({ msg: 'Tour not found' }); }

        const user = await User.findById(req.user.id);

        // Check if exists in array
        const index = user.toursYeuThich.indexOf(tour._id);

        if (index > -1) {
            // Remove
            user.toursYeuThich.splice(index, 1);
        } else {
            // Add
            user.toursYeuThich.push(tour._id);
        }

        await user.save();
        res.json(user.toursYeuThich);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
exports.updateRole = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }
        const { isAdmin } = req.body;
        // Check if isAdmin is valid (0: User, 1: Admin)
        if (![0, 1].includes(Number(isAdmin))) {
            return res.status(400).json({ msg: 'Invalid role value' });
        }

        const user = await User.findOne({ userId: req.params.id });

        if (!user) { return res.status(404).json({ msg: 'User not found' }); }

        user.isAdmin = Number(isAdmin);
        await user.save();

        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const user = await User.findOne({ userId: req.params.id });

        if (!user) { return res.status(404).json({ msg: 'User not found' }); }

        await User.findOneAndDelete({ userId: req.params.id });
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
