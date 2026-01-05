const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();
// Start Cron Job
require('./utils/cronJob')();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tours', require('./routes/tourRoutes'));
app.use('/api/dondattours', require('./routes/bookingRoutes')); // Reverted from /bookings
app.use('/api/diadiems', require('./routes/locationRoutes')); // Reverted from /locations
app.use('/api/danhgia', require('./routes/reviewRoutes')); // Reverted from /reviews
app.use('/api/LienHe', require('./routes/contactRoutes')); // Reverted from /contacts
app.use('/api/payment', require('./routes/paymentRoutes'));

// Error Middleware
app.use(require('./middleware/errorMiddleware'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
