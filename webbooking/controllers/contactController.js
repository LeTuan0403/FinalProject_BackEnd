const Contact = require('../models/Contact');
const sendEmail = require('../utils/emailService');
const getNextSequence = require('../utils/idGenerator');
// If file is Contact.js, require Contact. If LienHe.js, require LienHe.
// Based on plan: Contact.js

exports.createContact = async (req, res) => {
    try {
        const { hoTen, email, noiDung } = req.body;

        const newContact = new Contact({
            lienHeId: await getNextSequence('contactId'),
            hoTen,
            email,
            noiDung
        });

        const contact = await newContact.save();
        res.json(contact);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getAllContacts = async (req, res) => {
    try {
        if (req.user.role !== 1) return res.status(403).json({ msg: 'Access denied' });
        const contacts = await Contact.find().sort({ ngayGui: -1 });
        res.json(contacts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.replyContact = async (req, res) => {
    try {
        if (req.user.role !== 1) return res.status(403).json({ msg: 'Access denied' });

        const { id, replyContent } = req.body;

        // Find by Legacy ID
        const contact = await Contact.findOne({ lienHeId: id });
        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        contact.phanHoi = replyContent;
        contact.trangThai = 'Đã xử lý';

        await contact.save();

        // Send email to user
        const subject = 'Phản hồi từ Tour Booking';
        const text = `Xin chào ${contact.hoTen},\n\nChúng tôi đã nhận được tin nhắn của bạn:\n"${contact.noiDung}"\n\nPhản hồi của chúng tôi:\n${replyContent}\n\nCảm ơn bạn đã liên hệ!`;

        await sendEmail(contact.email, subject, text);

        res.json(contact);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.deleteContact = async (req, res) => {
    try {
        if (req.user.role !== 1) return res.status(403).json({ msg: 'Access denied' });

        // Find by Legacy ID
        const contact = await Contact.findOne({ lienHeId: req.params.id });
        if (!contact) return res.status(404).json({ msg: 'Contact not found' });

        await Contact.deleteOne({ lienHeId: req.params.id });
        res.json({ msg: 'Contact removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
