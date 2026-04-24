const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();
// Start Cron Job

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('public/uploads'));

// Attach io to requests check
app.use((req, _res, next) => {
    req.io = io;
    next();
});
// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tours', require('./routes/tourRoutes'));
app.use('/api/dondattours', require('./routes/bookingRoutes')); // Reverted from /bookings
app.use('/api/diadiems', require('./routes/locationRoutes')); // Reverted from /locations
app.use('/api/danhgia', require('./routes/reviewRoutes')); // Reverted from /reviews
app.use('/api/LienHe', require('./routes/contactRoutes')); // Reverted from /contacts
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/admin/notifications', require('./routes/notificationRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes')); // [NEW] Coupon Routes
app.use('/api/posts', require('./routes/postRoutes')); // [NEW] Community Post Routes
app.use('/api/upload', require('./routes/uploadRoutes')); // [NEW] Upload Routes
app.use('/api/notifications', require('./routes/userNotificationRoutes')); // [NEW] User Notification Routes

// Error Middleware
app.use(require('./middleware/errorMiddleware'));

const PORT = process.env.PORT || 5000;

// Socket.io Setup
const http = require('http');
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all frontend URLs including Vercel
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
});

io.on("connection", (socket) => {
    // User joins their conversation room
    socket.on("join_room", (data) => {
        socket.join(data); // data = conversationId
    });

    // Admin joins to listen
    socket.on("admin_join_room", (data) => {
        socket.join(data);
    });

    // Formal un-join to allow offline notifications
    socket.on("leave_room", (data) => {
        socket.leave(data);
    });

    socket.on("send_message", () => {
        // Broadcasts are now securely handled by post/chat API controllers
        // removing duplicate emits here to fix issue where messages show up twice
    });

    // Handle delete conversation event
    socket.on("admin_delete_conversation", (conversationId) => {
        io.to(conversationId).emit("conversation_deleted");
    });

    // Handle delete message event
    socket.on("admin_delete_message", (data) => {
        // data = { conversationId, messageId }
        io.to(data.conversationId).emit("message_deleted", data.messageId);
    });

    // --- NEW: Typing Indicators ---
    socket.on("typing", (conversationId) => {
        // Broadcast to everyone else in the room (e.g. User typing -> Admin sees it)
        socket.to(conversationId).emit("typing", conversationId);
    });

    socket.on("stop_typing", (conversationId) => {
        socket.to(conversationId).emit("stop_typing", conversationId);
    });

    // --- NEW: Read Receipts ---
    socket.on("mark_read", (conversationId) => {
        // Ideally update DB here to set readByAdmin = true or readByUser = true
        // For now, just broadcast to UI
        socket.to(conversationId).emit("message_read", conversationId);
    });

    // --- Presence Tracking ---
    socket.on("add_user", (userId) => {
        onlineUsers.set(String(userId), socket.id);
        io.emit("get_users", Array.from(onlineUsers.keys()));
    });

    socket.on("disconnect", () => {
        // Find userId by socket.id and remove
        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                io.emit("get_users", Array.from(onlineUsers.keys()));
                break;
            }
        }
    });
});

const onlineUsers = new Map();

// Start Cron Job (Pass io for notifications)
require('./utils/cronJob')(io);

server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
