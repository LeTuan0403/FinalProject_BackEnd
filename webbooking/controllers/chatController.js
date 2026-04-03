const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Tour = require('../models/Tour');
const { createNotification } = require('./userNotificationController');
const Notification = require('../models/Notification');

// Lưu ý: Đảm bảo đường dẫn này đúng với nơi bạn lưu file aiService.js
// Nếu bạn để trong folder services thì đổi thành '../services/aiService'
const { generateAIResponse } = require('../routes/aiService');

const sendOfflineEmailNotification = async (req, conversation, text) => {
    try {
        const roomNum = req.body.conversationId;
        const room = req.io.sockets.adapter.rooms.get(roomNum);
        const isUserOffline = !room || room.size <= 1;
        console.log(`[Notification Debug] Checking offline status for Conv ${roomNum}: Room Size = ${room ? room.size : 0}, isOffline = ${isUserOffline}`);

        // ALWAYS trigger notifications when admin responds
        // if (!isUserOffline) { return; }

        const userId = conversation.members.find(m => m !== 'admin');
        if (!userId) { return; }

        let user = null;
        if (!isNaN(userId)) {
            user = await User.findOne({ userId: Number(userId) });
        }
        if (!user && (String(userId).match(/^[0-9a-fA-F]{24}$/))) {
            user = await User.findById(userId);
        }

        if (user) {
            console.log(`[Notification Debug] Found user to notify: ${user.hoTen} (${user.userId}). Creating DB notification...`);
            await createNotification({
                userId: user._id,
                legacyUserId: user.userId,
                title: 'Tin nhắn hỗ trợ mới',
                message: `Admin đã trả lời: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
                type: 'MESSAGE',
                link: '/contact'
            }, req.io);
        } else {
            console.log(`[Notification Debug] User not found for ID: ${userId}`);
        }
    } catch (error) {
        console.error("Error sending offline notification:", error);
    }
};

const createConversation = async (req, res) => {
    const { senderId, guestName } = req.body;
    try {
        const existingConv = await Conversation.findOne({
            members: { $in: [senderId] }
        });

        if (existingConv) {
            return res.status(200).json(existingConv);
        }

        const newConversation = new Conversation({
            members: [senderId, 'admin'],
            guestName: guestName || "Khách vãng lai",
            messages: []
        });

        const savedConversation = await newConversation.save();
        res.status(200).json(savedConversation);
    } catch (err) {
        res.status(500).json(err);
    }
};

const getConversation = async (req, res) => {
    try {
        const userIdStr = String(req.params.userId);
        const userIdNum = !isNaN(Number(userIdStr)) ? Number(userIdStr) : null;
        const searchConditions = [userIdStr];
        if (userIdNum !== null) searchConditions.push(userIdNum);

        const conversation = await Conversation.findOne({
            members: { $in: searchConditions }
        }).populate('messages.tourId', 'tenTour tongGiaDuKien hinhAnhBia thoiGian tourId');
        res.status(200).json(conversation);
    } catch (err) {
        res.status(500).json(err);
    }
};

const getAllConversations = async (req, res) => {
    try {
        const { searchGuest, searchContent } = req.query;
        let query = {};
        const conditions = [];

        if (searchGuest) {
            conditions.push({ guestName: { $regex: searchGuest.trim(), $options: 'i' } });
        }

        if (searchContent) {
            conditions.push({ "messages.text": { $regex: searchContent.trim(), $options: 'i' } });
        }

        if (conditions.length > 0) {
            query = { $and: conditions };
        }

        const conversations = await Conversation.find(query)
            .sort({ isReadByAdmin: 1, unreadSince: 1, updatedAt: 1 })
            .select('-messages');

        res.status(200).json(conversations);
    } catch (err) {
        res.status(500).json(err);
    }
};

// Get single conversation by ID (for admin deep link)
const getConversationById = async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.conversationId)
            .populate('messages.tourId', 'tenTour tongGiaDuKien hinhAnhBia thoiGian tourId');
        if (!conversation) {
            return res.status(404).json("Conversation not found");
        }
        res.status(200).json(conversation);
    } catch (err) {
        res.status(500).json(err);
    }
};

// --- CORE FUNCTION: ADD MESSAGE ---
const handleSocketAndNotification = async (req, res, senderId, conversationId, conversation, isAiGenerated, messageResponse, text) => {
    // --- 1. SOCKET LOGIC ---
    if (req.io) {
        // Always emit receive_message to everyone in the room to replace redundant socket forwarding
        req.io.to(conversationId).emit("receive_message", messageResponse);

        if (senderId !== 'admin') {
            req.io.emit('admin_notification', {
                type: 'message',
                message: 'Tin nhắn mới từ khách hàng',
                data: messageResponse,
                unreadSince: conversation.unreadSince
            });
        } else if (isAiGenerated) {
            req.io.emit('admin_notification', {
                type: 'message',
                message: 'AI đã trả lời khách hàng',
                data: messageResponse,
                unreadSince: null
            });
        }
    }

    if (senderId === 'admin' && req.io) {
        console.log(`[Notification Debug] Admin sent a message. Triggering sendOfflineEmailNotification...`);
        await sendOfflineEmailNotification(req, conversation, text);
    }

    if (!isAiGenerated && res && !res.headersSent) {
        res.status(200).json(messageResponse);
    }
};

// --- HELPER FUNCTIONS FOR AI COPILOT ---
const getActiveTours = async () => {
    // Chỉ lấy các tour có lịch khởi hành (ngayKhoiHanh không rỗng)
    const activeTours = await Tour.find({
        ngayKhoiHanh: { $exists: true, $not: { $size: 0 } }
    })
        .select('tenTour tongGiaDuKien thoiGian ngayKhoiHanh diemKhoiHanh moTa tourId lichTrinh dichVuBaoGom dichVuKhongBaoGom chinhSachTour phuongTien anSang anTrua anToi discounts')
        .lean();

    // --- FILTER: Only keep future dates ---
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Start of today

    return activeTours.map(tour => {
        if (!Array.isArray(tour.ngayKhoiHanh)) { return null; }
        const futureDates = tour.ngayKhoiHanh.filter(dateStr => {
            const d = new Date(dateStr);
            return d >= now;
        });
        if (futureDates.length === 0) { return null; }
        return { ...tour, ngayKhoiHanh: futureDates };
    }).filter(Boolean); // Remove nulls
};

const handleAIResponseAction = async (req, conversation, text, aiResponse, addMessageFn) => {
    if (!aiResponse || !aiResponse.text) { return; }

    // 1. Gửi tin nhắn text trả lời
    const fakeReqText = {
        body: {
            conversationId: conversation._id.toString(),
            senderId: 'admin',
            text: aiResponse.text,
            type: 'text',
            isAiGenerated: true
        },
        io: req.io
    };
    await addMessageFn(fakeReqText, null);

    // 2. Nếu AI gợi ý Tour -> Gửi thêm tin nhắn Tour Card
    if (aiResponse.suggestedTourId) {
        const fakeReqCard = {
            body: {
                conversationId: conversation._id.toString(),
                senderId: 'admin',
                text: "Gợi ý tour phù hợp", // Text đại diện (client có thể ẩn hoặc hiển thị)
                type: 'tour_card',
                tourId: aiResponse.suggestedTourId,
                isAiGenerated: true
            },
            io: req.io
        };
        await addMessageFn(fakeReqCard, null);
    }

    // 3. Nếu cần hỗ trợ từ Admin (AI bó tay) -> Tạo thông báo cho Admin
    if (aiResponse.needsAdminSupport) {
        // We use a special system notification for admin dashboard
        if (req.io) {
            // Emit to admin dashboard via socket
            req.io.emit('admin_notification', {
                type: 'contact', // Use 'contact' or similar to highlight urgency
                message: `Khách cần hỗ trợ: "${text}"`,
                data: { conversationId: conversation._id },
                unreadSince: new Date()
            });
        }

        // --- NEW: Also create persistent notification for ALL Admins ---
        const admins = await User.find({ isAdmin: 1 });
        for (const admin of admins) {
            await createNotification({
                userId: admin._id,
                legacyUserId: admin.userId,
                title: 'Yêu cầu hỗ trợ mới',
                message: `Khách hàng yêu cầu hỗ trợ: "${text}"`,
                type: 'ADMIN_SUPPORT', // Special type or just 'SYSTEM'
                link: `/admin/chat?conversationId=${conversation._id}` // Direct to admin chat with param
            }, req.io);
        }
    }
};

const runAICopilot = async (req, conversation, senderId, text, type, isAiGenerated, addMessageFn) => {
    // --- 2. AI CO-PILOT LOGIC ---
    if (senderId === 'admin') { return; }
    if (type !== 'text') { return; }
    if (isAiGenerated) { return; }

    const recentMessages = conversation.messages.slice(-10);

    const lastHumanAdminMsg = [...recentMessages].reverse().find(m =>
        m.senderId === 'admin' &&
        (!m.metaData || !m.metaData.isAiGenerated)
    );

    const now = new Date();
    let adminIsActive = false;

    if (lastHumanAdminMsg) {
        const timeDiff = now - new Date(lastHumanAdminMsg.createdAt);
        if (timeDiff < 2 * 60 * 1000) {
            adminIsActive = true;
        }
    }

    if (adminIsActive) { return; }

    if (req.io) {
        req.io.to(conversation._id.toString()).emit("typing");
    }

    // Gọi AI sau 2 giây
    setTimeout(async () => {
        try {
            // --- BƯỚC 1: LẤY DỮ LIỆU TOUR TỪ DB (MỚI) ---
            const validTours = await getActiveTours();

            // --- BƯỚC 2: GỌI AI VỚI DATA TOUR (MỚI) ---
            // aiResponse sẽ là object { text: "...", suggestedTourId: "..." }
            const aiResponse = await generateAIResponse(recentMessages, text, validTours);

            if (req.io) {
                req.io.to(conversation._id.toString()).emit("stop_typing");
            }

            await handleAIResponseAction(req, conversation, text, aiResponse, addMessageFn);

        } catch (innerErr) {
            console.error("Error inside AI Timeout:", innerErr);
        }
    }, 2000);
};

// --- CORE FUNCTION: ADD MESSAGE ---
const addMessage = async (req, res) => {
    const { conversationId, senderId, text, tourId } = req.body;
    let { type } = req.body;
    const isAiGenerated = req.body.isAiGenerated || false;

    if (!type) {
        type = 'text';
    }

    try {
        const newMessage = {
            senderId,
            text,
            type: type,
            tourId: tourId || undefined,
            isRead: false,
            createdAt: new Date(),
            metaData: { isAiGenerated }
        };

        const updateData = {
            $push: { messages: newMessage },
            lastMessage: type === 'tour_card' ? '[Gợi ý Tour] Một tour du lịch' : text,
            isReadByAdmin: senderId === 'admin',
            isReadByUser: senderId !== 'admin',
        };

        if (senderId === 'admin') {
            updateData.unreadSince = null;
        } else {
            const currentConv = await Conversation.findById(conversationId);
            if (currentConv) {
                if (currentConv.isReadByAdmin || !currentConv.unreadSince) {
                    updateData.unreadSince = new Date();
                }
            } else {
                updateData.unreadSince = new Date();
            }
        }

        const conversation = await Conversation.findByIdAndUpdate(
            conversationId,
            updateData,
            { new: true }
        ).populate('messages.tourId', 'tenTour tongGiaDuKien hinhAnhBia thoiGian tourId');

        const savedMessage = conversation.messages[conversation.messages.length - 1];

        const messageResponse = {
            ...savedMessage.toObject(),
            conversationId: conversationId
        };

        await handleSocketAndNotification(req, res, senderId, conversationId, conversation, isAiGenerated, messageResponse, text);

        await runAICopilot(req, conversation, senderId, text, type, isAiGenerated, addMessage);

    } catch (err) {
        console.error("Add Message Error:", err);
        if (res && !res.headersSent) {
            res.status(500).json(err);
        }
    }
};

const getMessages = async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.conversationId)
            .populate('messages.tourId', 'tenTour tongGiaDuKien hinhAnhBia thoiGian tourId');

        if (!conversation) { return res.status(404).json("Conversation not found"); }

        res.status(200).json(conversation.messages);
    } catch (err) {
        res.status(500).json(err);
    }
};

const markAsRead = async (req, res) => {
    const { role } = req.body;
    try {
        const conversationId = req.params.conversationId;
        let update = {};
        if (role === 'admin') {
            update = { isReadByAdmin: true };
        } else {
            update = { isReadByUser: true };
        }
        await Conversation.findByIdAndUpdate(conversationId, update);
        res.status(200).json("Updated");
    } catch (err) {
        res.status(500).json(err);
    }
};

const deleteConversation = async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.conversationId);
        if (!conversation) {
            return res.status(404).json("Conversation not found");
        }

        // Identify user to notify (the one who is not admin)
        const userId = conversation.members.find(m => m !== 'admin');

        await Conversation.findByIdAndDelete(req.params.conversationId);

        if (userId && req.io) {
            let user = null;
            // Try finding by userId (number)
            if (!isNaN(userId)) {
                user = await User.findOne({ userId: Number(userId) });
            }
            // Try finding by _id (ObjectId)
            if (!user && (String(userId).match(/^[0-9a-fA-F]{24}$/))) {
                user = await User.findById(userId);
            }

            if (user) {
                // Delete all previous MESSAGE notifications for this user
                await Notification.deleteMany({ user: user._id, type: 'MESSAGE' });

                await createNotification({
                    userId: user._id,
                    legacyUserId: user.userId, // fallback
                    title: 'Lịch sử tin nhắn',
                    message: 'Lịch sử tin nhắn đã được xóa.',
                    type: 'HISTORY_DELETED',
                    link: '#'
                }, req.io);
            }
        }

        res.status(200).json("Conversation deleted");
    } catch (err) {
        console.error("Delete conversation error:", err);
        res.status(500).json(err);
    }
};

const deleteMessage = async (req, res) => {
    try {
        await Conversation.updateOne(
            { "messages._id": req.params.messageId },
            { $pull: { messages: { _id: req.params.messageId } } }
        );
        res.status(200).json("Message deleted");
    } catch (err) {
        res.status(500).json(err);
    }
};

module.exports = {
    createConversation,
    getConversation,
    getAllConversations,
    getConversationById,
    addMessage,
    getMessages,
    markAsRead,
    deleteConversation,
    deleteMessage
};