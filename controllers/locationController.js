const Location = require('../models/Location');
const getNextSequence = require('../utils/idGenerator');

exports.getAllLocations = async (req, res) => {
    try {
        const locations = await Location.find();
        res.json(locations);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getLocationById = async (req, res) => {
    try {
        const location = await Location.findOne({ diaDiemId: req.params.id });
        if (!location) { return res.status(404).json({ msg: 'Location not found' }); }
        res.json(location);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.createLocation = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const { tenDiaDiem, moTa, hinhAnh, diaChiCuThe, giaVe, thoiGianThamQuanDuKien } = req.body;

        const newLocation = new Location({
            diaDiemId: await getNextSequence('locationId'),
            tenDiaDiem,
            moTa,
            hinhAnh,
            diaChiCuThe,
            giaVe,
            thoiGianThamQuanDuKien,
            nguoiTaoId: req.user.id
        });

        const location = await newLocation.save();
        res.json(location);
    } catch (err) {
        console.error("Create Location Error:", err);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

exports.updateLocation = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const { tenDiaDiem, moTa, hinhAnh, diaChiCuThe, giaVe, thoiGianThamQuanDuKien } = req.body;

        // Find and update
        const location = await Location.findOneAndUpdate(
            { diaDiemId: req.params.id },
            {
                $set: {
                    tenDiaDiem,
                    moTa,
                    hinhAnh,
                    diaChiCuThe,
                    giaVe,
                    thoiGianThamQuanDuKien
                }
            },
            { new: true }
        );

        if (!location) {
            return res.status(404).json({ msg: 'Location not found' });
        }

        res.json(location);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.deleteLocation = async (req, res) => {
    try {
        if (req.user.role !== 1) { return res.status(403).json({ msg: 'Access denied' }); }

        const location = await Location.findOneAndDelete({ diaDiemId: req.params.id });

        if (!location) {
            return res.status(404).json({ msg: 'Location not found' });
        }

        res.json({ msg: 'Location removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
