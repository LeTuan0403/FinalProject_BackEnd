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
        if (req.user.role !== 1) return res.status(403).json({ msg: 'Access denied' });
        const users = await User.find().select('-matKhau');
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { hoTen, soDienThoai, diaChi, ngaySinh } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        if (hoTen) user.hoTen = hoTen;
        if (soDienThoai) user.soDienThoai = soDienThoai;
        if (diaChi) user.diaChi = diaChi;
        if (ngaySinh) user.ngaySinh = ngaySinh;

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
        if (!tour) return res.status(404).json({ msg: 'Tour not found' });

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
