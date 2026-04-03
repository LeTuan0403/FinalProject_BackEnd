const mongoose = require('mongoose');
const Post = require('./models/Post');
const User = require('./models/User');

const testComment = async () => {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/tour_booking_db_test', { useNewUrlParser: true });
        // NOTE: we will use the local env string if needed, better to just log
        console.log("Connected to local testing DB");
    } catch(e) {
        console.error("DB error", e);
    }
};

testComment();
