const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const locationController = require('../controllers/locationController');

// GET /api/diadiems
router.get('/', locationController.getAllLocations);

// GET /api/diadiems/:id
router.get('/:id', locationController.getLocationById);

// POST /api/diadiems (Admin)
router.post('/', auth, locationController.createLocation);

// PUT /api/diadiems/:id (Admin)
router.put('/:id', auth, locationController.updateLocation);

// DELETE /api/diadiems/:id (Admin)
router.delete('/:id', auth, locationController.deleteLocation);

module.exports = router;
