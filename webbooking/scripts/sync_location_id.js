const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Location = require('../models/Location');
const Counter = require('../models/Counter');

// Load env vars
dotenv.config();

const syncLocationId = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Find the maximum diaDiemId
        const result = await Location.find().sort({ diaDiemId: -1 }).limit(1);

        let maxId = 0;
        if (result.length > 0) {
            maxId = result[0].diaDiemId;
        }

        console.log(`Current max diaDiemId in locations: ${maxId}`);

        // Update the Counter
        const counter = await Counter.findOneAndUpdate(
            { _id: 'locationId' },
            { $set: { seq: maxId } },
            { new: true, upsert: true }
        );

        console.log(`Counter 'locationId' updated to: ${counter.seq}`);

        process.exit(0);
    } catch (err) {
        console.error('Error syncing location ID:', err);
        process.exit(1);
    }
};

syncLocationId();
