const router = require("express").Router();
const chatController = require("../controllers/chatController");

// Conversations
router.post("/conversation", chatController.createConversation);
router.get("/conversation/:userId", chatController.getConversation);
router.get("/conversations", chatController.getAllConversations); // For Admin
router.get("/conversation/id/:conversationId", chatController.getConversationById); // New deep link route
router.put("/conversation/read/:conversationId", chatController.markAsRead);
router.delete("/conversation/:conversationId", chatController.deleteConversation);

// Messages
router.post("/message", chatController.addMessage);
router.get("/message/:conversationId", chatController.getMessages);
router.delete("/message/:messageId", chatController.deleteMessage);

module.exports = router;
