const Post = require('../models/Post');
const userNotificationController = require('./userNotificationController');

// --- User Actions ---

// Create new post
exports.createPost = async (req, res) => {
    try {
        const { title, content, media, linkedTourId } = req.body;
        const newPost = new Post({
            userId: req.user.id,
            title,
            content,
            media,
            linkedTourId,
            status: 'Pending' // Default, will be updated by AI
        });

        // AI Moderation
        try {
            const { moderateContent } = require('../routes/aiService');
            const moderationResult = await moderateContent(title, content);

            newPost.moderationData = moderationResult;

            if (moderationResult.isSafe) {
                newPost.status = 'Approved';
            } else {
                // If not safe, check confidence. 
                // High confidence violation -> Reject
                // Low confidence or "Needs Review" -> Pending
                if (moderationResult.confidence > 0.8) {
                    newPost.status = 'Rejected';
                } else {
                    newPost.status = 'Pending';
                }
            }

        } catch (aiError) {
            console.error("AI Moderation Failed:", aiError);
            // Fallback to Pending
            newPost.status = 'Pending';
            newPost.moderationData = {
                isSafe: false,
                confidence: 0,
                reason: "AI Service Error, manual review required.",
                flaggedCategories: ["System Error"]
            };
        }

        const post = await newPost.save();

        // Notify Admin of new pending post
        if (req.io) {
            await userNotificationController.notifyAdmins({
                title: 'Bài viết cộng đồng mới',
                message: `Bài viết mới từ ${req.user.hoTen} (${post.status === 'Approved' ? 'Đã duyệt tự động' : post.status === 'Rejected' ? 'Đã chặn tự động' : 'Cần duyệt'})`,
                type: 'POST',
                link: '/admin/posts',
                socketData: {
                    type: 'post',
                    message: `Bài viết mới từ ${req.user.hoTen} (${post.status === 'Approved' ? 'Đã duyệt tự động' : post.status === 'Rejected' ? 'Đã chặn tự động' : 'Cần duyệt'})`,
                    data: post
                }
            }, req.io);

            // Notify User
            let userMsg = '';
            if (post.status === 'Approved') {
                userMsg = `Bài viết đã được đăng thành công!`;
            } else if (post.status === 'Rejected') {
                userMsg = `Bài viết bị từ chối vì: ${newPost.moderationData?.reason || 'Vi phạm điều khoản'}`;
            } else {
                userMsg = `Bài viết đang chờ quản trị viên duyệt.`;
            }

            userNotificationController.createNotification({
                userId: req.user.id,
                legacyUserId: req.user.userId,
                title: 'Trạng thái bài viết',
                message: userMsg,
                type: 'POST_STATUS',
                link: `/community?post=${post._id}`
            }, req.io);
        }

        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Get public feed (Approved posts only)
exports.getPublicPosts = async (req, res) => {
    try {
        const { search } = req.query;
        let query = { status: 'Approved' };

        if (search) {
            const searchRegex = new RegExp(search, 'i');

            // Find Users matching name (to filter by author)
            const matchingUsers = await require('../models/User').find({ hoTen: searchRegex }).select('_id');
            const matchingUserIds = matchingUsers.map(u => u._id);

            // Find Tours matching name (to filter by linked tour)
            const matchingTours = await require('../models/Tour').find({ tenTour: searchRegex }).select('_id');
            const matchingTourIds = matchingTours.map(t => t._id);

            // Build search query
            query = {
                status: 'Approved',
                $or: [
                    { title: searchRegex },
                    { content: searchRegex },
                    { userId: { $in: matchingUserIds } },
                    { linkedTourId: { $in: matchingTourIds } }
                ]
            };
        }

        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .populate('userId', 'hoTen avatar userId')
            .populate('linkedTourId', 'tenTour tourId hinhAnhBia')
            .populate('sharedPostId')
            .populate({
                path: 'sharedPostId',
                populate: [
                    { path: 'userId', select: 'hoTen avatar' },
                    { path: 'linkedTourId', select: 'tenTour tourId hinhAnhBia' }
                ]
            })
            .populate('comments.userId', 'hoTen avatar userId')
            .populate('comments.replies.userId', 'hoTen avatar userId');

        res.json(posts);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Get single post by ID
exports.getPostById = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
            .populate('userId', 'hoTen avatar userId')
            .populate('linkedTourId', 'tenTour tourId hinhAnhBia')
            .populate({
                path: 'sharedPostId',
                populate: [
                    { path: 'userId', select: 'hoTen avatar' },
                    { path: 'linkedTourId', select: 'tenTour tourId hinhAnhBia' }
                ]
            })
            .populate('comments.userId', 'hoTen avatar userId')
            .populate('comments.replies.userId', 'hoTen avatar userId');

        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }

        res.json(post);
    } catch (err) {
        console.error(err);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Post not found' });
        }
        res.status(500).send('Server Error');
    }
};

// Get my posts
exports.getMyPosts = async (req, res) => {
    try {
        const posts = await Post.find({ userId: req.user.id })
            .sort({ createdAt: 1 }) // Oldest first
            .populate('userId', 'hoTen avatar userId')
            .populate('linkedTourId', 'tenTour tourId hinhAnhBia')
            .populate({
                path: 'sharedPostId',
                populate: [
                    { path: 'userId', select: 'hoTen avatar' },
                    { path: 'linkedTourId', select: 'tenTour tourId hinhAnhBia' }
                ]
            });
        res.json(posts);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Toggle Like
exports.likePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        const index = post.likes.indexOf(req.user.id);
        if (index > -1) {
            post.likes.splice(index, 1); // Unlike
        } else {
            post.likes.push(req.user.id); // Like
        }

        await post.save();

        // Engagement Reward Check
        await checkEngagementReward(post, req.io);

        res.json(post.likes);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Add Comment
exports.commentPost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        const newComment = {
            userId: req.user.id,
            content: req.body.content,
            createdAt: new Date()
        };

        post.comments.push(newComment);
        await post.save();

        // Engagement Reward Check
        await checkEngagementReward(post, req.io);

        // Notify author via email if not commenting on own post
        // Notify author via email if not commenting on own post
        const populatedPost = await Post.findById(post._id).populate('userId', 'hoTen email userId');
        if (populatedPost.userId && String(populatedPost.userId._id) !== String(req.user.id)) {
            const { createNotification } = require('./userNotificationController');
            await createNotification({
                userId: populatedPost.userId._id,
                legacyUserId: populatedPost.userId.userId, // Pass integer ID for socket
                title: 'Bình luận mới',
                message: `${req.user.hoTen} đã bình luận về bài viết của bạn`,
                type: 'COMMUNITY',
                link: `/community?post=${post._id}`
            }, req.io);
        }

        // Repopulate to return full comment data
        await post.populate('comments.userId', 'hoTen avatar email userId');
        await post.populate('comments.replies.userId', 'hoTen avatar email userId');

        res.json(post.comments);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Reply to Comment
exports.replyComment = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        const comment = post.comments.id(req.params.commentId);
        if (!comment) { return res.status(404).json({ msg: 'Comment not found' }); }

        const newReply = {
            userId: req.user.id,
            content: req.body.content,
            createdAt: new Date()
        };

        comment.replies.push(newReply);
        await post.save();

        // Notify comment author if reply is from someone else
        const populatedComment = await Post.findById(post._id)
            .populate('comments.userId', 'hoTen avatar email userId')
            .populate('comments.replies.userId', 'hoTen avatar email userId');

        const targetComment = populatedComment.comments.id(req.params.commentId);
        if (targetComment && targetComment.userId && String(targetComment.userId._id) !== String(req.user.id)) {
            const { createNotification } = require('./userNotificationController');
            await createNotification({
                userId: targetComment.userId._id,
                legacyUserId: targetComment.userId.userId, // Pass integer ID
                title: 'Phản hồi mới',
                message: `${req.user.hoTen} đã trả lời bình luận của bạn`,
                type: 'COMMUNITY',
                link: `/community?post=${post._id}`
            }, req.io);
        }

        res.json(populatedComment.comments);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// React to Comment (Like/Unlike)
exports.reactComment = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        const comment = post.comments.id(req.params.commentId);
        if (!comment) { return res.status(404).json({ msg: 'Comment not found' }); }

        const replyId = req.query.replyId;
        let target = comment;

        if (replyId) {
            target = comment.replies.id(replyId);
            if (!target) { return res.status(404).json({ msg: 'Reply not found' }); }
        }

        const index = target.likes.indexOf(req.user.id);
        if (index > -1) {
            target.likes.splice(index, 1); // Unlike
        } else {
            target.likes.push(req.user.id); // Like
        }

        await post.save();

        // Repopulate for consistent frontend data
        await post.populate('comments.userId', 'hoTen avatar userId');
        await post.populate('comments.replies.userId', 'hoTen avatar userId');

        res.json(post.comments);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Update Comment/Reply
exports.updateComment = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        const comment = post.comments.id(req.params.commentId);
        if (!comment) { return res.status(404).json({ msg: 'Comment not found' }); }

        const replyId = req.query.replyId;
        let target = comment;

        if (replyId) {
            target = comment.replies.id(replyId);
            if (!target) { return res.status(404).json({ msg: 'Reply not found' }); }
        }

        // Check ownership
        if (target.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        target.content = req.body.content;
        await post.save();

        // Repopulate
        await post.populate('comments.userId', 'hoTen avatar userId');
        await post.populate('comments.replies.userId', 'hoTen avatar userId');

        res.json(post.comments);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Delete Comment/Reply
exports.deleteComment = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        const comment = post.comments.id(req.params.commentId);
        if (!comment) { return res.status(404).json({ msg: 'Comment not found' }); }

        const replyId = req.query.replyId;

        if (replyId) {
            const reply = comment.replies.id(replyId);
            if (!reply) { return res.status(404).json({ msg: 'Reply not found' }); }

            // Check ownership (Reply owner or Comment owner or Post owner or Admin)
            if (
                reply.userId.toString() !== req.user.id &&
                comment.userId.toString() !== req.user.id && // Comment owner can delete replies? Usually yes.
                post.userId.toString() !== req.user.id &&
                req.user.role !== 'admin'
            ) {
                return res.status(401).json({ msg: 'User not authorized' });
            }

            comment.replies.pull(replyId);
        } else {
            // Check ownership (Comment owner or Post owner or Admin)
            if (
                comment.userId.toString() !== req.user.id &&
                post.userId.toString() !== req.user.id &&
                req.user.role !== 'admin'
            ) {
                return res.status(401).json({ msg: 'User not authorized' });
            }

            post.comments.pull(req.params.commentId);
        }

        await post.save();

        // Repopulate
        await post.populate('comments.userId', 'hoTen avatar userId');
        await post.populate('comments.replies.userId', 'hoTen avatar userId');

        res.json(post.comments);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Delete Post (Owner or Admin)
exports.deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        if (post.userId.toString() !== req.user.id && req.user.role !== 1) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await Post.deleteOne({ _id: req.params.id });
        res.json({ msg: 'Post removed' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Update Post (Reset to Pending)
// eslint-disable-next-line complexity
exports.updatePost = async (req, res) => {
    try {
        const { title, content, media, linkedTourId } = req.body;
        const post = await Post.findById(req.params.id);

        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        // Check ownership
        if (post.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        post.title = title !== undefined ? title : post.title;
        post.content = content !== undefined ? content : post.content;
        post.media = media !== undefined ? media : post.media;
        post.linkedTourId = linkedTourId !== undefined ? linkedTourId : post.linkedTourId;

        // AI Moderation for updated content
        try {
            const { moderateContent } = require('../routes/aiService');
            const moderationResult = await moderateContent(post.title, post.content);

            post.moderationData = moderationResult;

            if (moderationResult.isSafe) {
                post.status = 'Approved';
            } else {
                if (moderationResult.confidence > 0.8) {
                    post.status = 'Rejected';
                } else {
                    post.status = 'Pending';
                }
            }
        } catch (aiError) {
            console.error("AI Moderation Failed on Update:", aiError);
            post.status = 'Pending';
            post.moderationData = {
                isSafe: false,
                confidence: 0,
                reason: "AI Service Error, manual review required.",
                flaggedCategories: ["System Error"]
            };
        }

        await post.save();

        if (req.io) {
            await userNotificationController.notifyAdmins({
                title: 'Bài viết cộng đồng được chỉnh sửa',
                message: `${req.user.hoTen} vừa chỉnh sửa bài viết (${post.status === 'Approved' ? 'Đã duyệt tự động' : post.status === 'Rejected' ? 'Đã chặn tự động' : 'Cần duyệt'})`,
                type: 'POST',
                link: '/admin/posts',
                socketData: {
                    type: 'post',
                    message: `${req.user.hoTen} vừa chỉnh sửa bài viết (${post.status === 'Approved' ? 'Đã duyệt tự động' : post.status === 'Rejected' ? 'Đã chặn tự động' : 'Cần duyệt'})`,
                    data: post
                }
            }, req.io);
        }

        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// --- Admin Actions ---

// Get all posts (for management)
exports.getAllPostsAdmin = async (req, res) => {
    try {
        // Filter by status if query param exists
        const { status } = req.query;
        const query = status ? { status } : {};

        const posts = await Post.find(query)
            .sort({ createdAt: 1 }) // Oldest first
            .populate('userId', 'hoTen email avatar')
            .populate('linkedTourId', 'tenTour hinhAnhBia tourId')
            .populate({
                path: 'sharedPostId',
                populate: [
                    { path: 'userId', select: 'hoTen avatar' },
                    { path: 'linkedTourId', select: 'tenTour tourId hinhAnhBia' }
                ]
            })
            .populate('comments.userId', 'hoTen avatar');
        res.json(posts);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Approve Post
exports.approvePost = async (req, res) => {
    try {
        const post = await Post.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved' },
            { new: true }
        ).populate('userId', 'userId');
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        // Notify User
        if (req.io && post.userId) {
            userNotificationController.createNotification({
                userId: post.userId._id,
                legacyUserId: post.userId.userId,
                title: 'Bài viết được duyệt ✅',
                message: `Bài viết của bạn đã được quản trị viên phê duyệt.`,
                type: 'POST_APPROVED',
                link: `/community?post=${post._id}`
            }, req.io);
        }

        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Reject Post
exports.rejectPost = async (req, res) => {
    try {
        const post = await Post.findByIdAndUpdate(
            req.params.id,
            { status: 'Rejected' },
            { new: true }
        ).populate('userId', 'userId');
        if (!post) { return res.status(404).json({ msg: 'Post not found' }); }

        // Notify User
        if (req.io && post.userId) {
            userNotificationController.createNotification({
                userId: post.userId._id,
                legacyUserId: post.userId.userId,
                title: 'Bài viết bị từ chối ⛔',
                message: `Bài viết của bạn đã bị từ chối bởi quản trị viên.`,
                type: 'POST_REJECTED',
                link: `/community?post=${post._id}` // Link so they can see the reason if we add it later or delete it
            }, req.io);
        }

        res.json(post);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Share / Quote Post
exports.sharePost = async (req, res) => {
    try {
        const { content, sharedPostId } = req.body;

        const originalPost = await Post.findById(sharedPostId);
        if (!originalPost) { return res.status(404).json({ msg: 'Original post not found' }); }

        const newPost = new Post({
            userId: req.user.id,
            content: content || 'Đã chia sẻ bài viết',
            sharedPostId,
            status: 'Approved' // Shared posts are auto-approved for now
        });

        const post = await newPost.save();

        // Increment share count on original
        originalPost.shareCount = (originalPost.shareCount || 0) + 1;
        await originalPost.save();

        res.status(201).json(post);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Reward Helper
// eslint-disable-next-line complexity
const checkEngagementReward = async (post, io) => {
    try {
        const likeCount = post.likes.length;
        const commentCount = post.comments.length;
        const currentLevel = post.rewardLevel || 0;
        let newLevel = currentLevel;
        let rewardCode = '';

        // Define Tiers (Low to High)
        // Tier 1: 50 Likes + 50 Comments -> DANHGIA10
        // Tier 2: 100 Likes + 100 Comments -> DANHGIA20
        // Tier 3: 200 Likes + 200 Comments -> SIEUDEAL

        if (likeCount >= 200 && commentCount >= 200 && currentLevel < 3) {
            newLevel = 3;
            rewardCode = 'SIEUDEAL';
        } else if (likeCount >= 100 && commentCount >= 100 && currentLevel < 2) {
            newLevel = 2;
            rewardCode = 'DANHGIA20';
        } else if (likeCount >= 50 && commentCount >= 50 && currentLevel < 1) {
            newLevel = 1;
            rewardCode = 'DANHGIA10';
        }

        if (newLevel > currentLevel) {
            const Coupon = require('../models/Coupon');
            // Find specific coupon by code
            const coupon = await Coupon.findOne({ code: rewardCode, isActive: true });

            if (coupon) {
                // Assign to user if not already assigned
                if (!coupon.assignedTo) { coupon.assignedTo = []; }
                const alreadyAssigned = coupon.assignedTo.some(id => String(id) === String(post.userId));

                if (!alreadyAssigned) {
                    coupon.assignedTo.push(post.userId);
                    await coupon.save();

                    post.rewardLevel = newLevel;
                    post.isRewardClaimed = true; // Keep for legacy or general flag
                    await post.save();

                    if (io) {
                        io.emit('user_notification', {
                            userId: String(post.userId),
                            type: 'reward',
                            message: `Chúc mừng! Bài viết đạt mốc mới (${likeCount} like, ${commentCount} cmt). Bạn nhận được voucher level ${newLevel}: ${coupon.code}`,
                            data: { couponCode: coupon.code, level: newLevel }
                        });
                    }
                }
            } else {
                // Coupon not found or inactive - silently fail or log to dedicated error stream
            }
        }
    } catch (err) {
        console.error("Reward system error:", err);
    }
};
