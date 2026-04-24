const multer = require('multer');
const path = require('path');

// Storage Engine
const storage = multer.diskStorage({
    destination: './public/uploads/reviews/',
    filename: (req, file, cb) => {
        cb(null, 'review-' + Date.now() + path.extname(file.originalname));
    }
});

// Check File Type
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images and Videos Only!');
    }
}

// Init Multer
const upload = multer({
    storage: storage,
    limits: { fileSize: 20000000 }, // 20MB limit
    fileFilter: (req, file, cb) => {
        checkFileType(file, cb);
    }
}).array('media', 5); // Max 5 files

const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configure Cloudinary (explicitly or via process.env automatically if configured right, 
// but using CLOUDINARY_URL from env manually ensures it works if the lib doesn't auto-pick it up immediately)
if (process.env.CLOUDINARY_URL) {
    // cloudinary.config() will automatically read CLOUDINARY_URL if present, 
    // but we can also set it explicitly if needed. Usually just require is enough if env is set.
    // However, to be safe:
    // However, to be safe:
    // const url = process.env.CLOUDINARY_URL; // Unused
    // If using the connection string, we don't need manual config usually, 
    // but let's ensure it's loaded.
}

// Configure Storage for Posts
const postStorage = multer.diskStorage({
    destination: './public/uploads/posts/', // Ensure this folder exists or Multer might error if not recursive? Multer doesn't create folders. 
    // I should probably stick to one temp folder or ensure it exists. 
    // Actually, './public/uploads/reviews/' is hardcoded above. 
    // I'll assume ./public/uploads/ exists. I'll use ./public/uploads/ for everything to be safe or reviews folder.
    // Let's use './public/uploads/' to simplify.
    filename: (req, file, cb) => {
        cb(null, 'post-' + Date.now() + path.extname(file.originalname));
    }
});

const uploadPost = multer({
    storage: postStorage,
    limits: { fileSize: 50000000 }, // 50MB for video
    fileFilter: (req, file, cb) => {
        checkFileType(file, cb);
    }
}).array('media', 5);

exports.uploadPostMedia = (req, res) => {
    // Ensure public/uploads/posts exists. Nodejs doesn't create it. 
    // Using fs.mkdirSync if not exists? Or just fallback to existing folder.
    // I'll check if fs is imported. Yes.
    const dir = './public/uploads/posts';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    uploadPost(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ msg: err });
        } else {
            if (req.files === undefined || req.files.length === 0) {
                return res.status(400).json({ msg: 'No file selected!' });
            } else {
                try {
                    const uploadPromises = req.files.map(file => {
                        return new Promise((resolve, reject) => {
                            // Upload to Cloudinary
                            cloudinary.uploader.upload(file.path, {
                                folder: 'tour_booking_posts',
                                resource_type: 'auto'
                            }, (error, result) => {
                                // Delete local file
                                fs.unlink(file.path, (unlinkErr) => {
                                    if (unlinkErr) { console.error("Failed to delete local image:", unlinkErr); }
                                });

                                if (error) { reject(error); }
                                else {
                                    resolve(result.secure_url);
                                }
                            });
                        });
                    });

                    const results = await Promise.all(uploadPromises);

                    res.json(results); // Return Array of strings (URLs)

                } catch (uploadError) {
                    console.error("Cloudinary Upload Error:", uploadError);
                    res.status(500).json({ msg: 'Cloudinary Upload Failed' });
                }
            }
        }
    });
};

exports.uploadReviewMedia = (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ msg: err });
        } else {
            if (req.files === undefined || req.files.length === 0) {
                return res.status(400).json({ msg: 'No file selected!' });
            } else {
                try {
                    const uploadPromises = req.files.map(file => {
                        return new Promise((resolve, reject) => {
                            // Upload to Cloudinary
                            cloudinary.uploader.upload(file.path, {
                                folder: 'tour_booking_reviews',
                                resource_type: 'auto'
                            }, (error, result) => {
                                // Delete local file regardless of success/failure to save space
                                fs.unlink(file.path, (unlinkErr) => {
                                    if (unlinkErr) { console.error("Failed to delete local image:", unlinkErr); }
                                });

                                if (error) { reject(error); }
                                else {
                                    resolve({
                                        type: result.resource_type === 'video' ? 'video' : 'image',
                                        url: result.secure_url,
                                        public_id: result.public_id
                                    });
                                }
                            });
                        });
                    });

                    const results = await Promise.all(uploadPromises);

                    res.json({
                        msg: 'File Uploaded to Cloudinary!',
                        files: results
                    });

                } catch (uploadError) {
                    console.error("Cloudinary Upload Error:", uploadError);
                    res.status(500).json({ msg: 'Cloudinary Upload Failed' });
                }
            }
        }
    });
};
