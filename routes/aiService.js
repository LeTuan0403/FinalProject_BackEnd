const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
        responseMimeType: "application/json"
    }
});

const generateAIResponse = async (history, userMessage, tours) => {
    try {
        const toursContext = tours.map(t =>
            `- ID: ${t.tourId} (ObjectID: ${t._id})
             - Tên: ${t.tenTour}
             - Giá: ${t.tongGiaDuKien?.toLocaleString('vi-VN')} VNĐ
             - Thời gian: ${t.thoiGian}
             - Khởi hành: ${t.diemKhoiHanh}
             - Lịch: ${Array.isArray(t.ngayKhoiHanh) ? t.ngayKhoiHanh.map(d => new Date(d).toLocaleDateString('vi-VN')).join(', ') : ''}
             - Mô tả: ${t.moTa || 'Không có mô tả'}
             - Dịch vụ: ${Array.isArray(t.dichVuBaoGom) ? t.dichVuBaoGom.join(', ') : (t.dichVuBaoGom || '')}`
        ).join('\n\n');

        const prompt = `
            Bạn là nhân viên tư vấn du lịch nhiệt tình, chuyên nghiệp của TravelBooking.
            
            DỮ LIỆU TOUR HIỆN CÓ:
            ${toursContext}
            
            LỊCH SỬ CHAT:
            ${history.map(msg => `${msg.senderId === 'admin' ? 'Bot' : 'Khách'}: ${msg.text}`).join('\n')}
            Khách: ${userMessage}
            
            NHIỆM VỤ:
            1. Trả lời tin nhắn của khách một cách tự nhiên, ngắn gọn (dưới 100 từ).
            2. Nếu khách hỏi về tour cụ thể hoặc nhu cầu phù hợp với tour nào trong danh sách trên, hãy gợi ý tour đó.
            3. Nếu câu hỏi của khách nằm ngoài thông tin được cung cấp (ví dụ: hỏi về tour không có trong danh sách, vé máy bay, visa...), hãy trả lời lịch sự rằng bạn sẽ nối máy tới nhân viên hỗ trợ và đặt "needsAdminSupport": true.
            4. Trả về JSON format chính xác.
            
            FORMAT JSON:
            {
                "text": "Câu trả lời của bạn...",
                "suggestedTourId": "ObjectID của tour được gợi ý (nếu có, nếu không thì để null)",
                "needsAdminSupport": boolean (true nếu không trả lời được, false nếu trả lời được)
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        try {
            const jsonResponse = JSON.parse(responseText);
            return jsonResponse;
        } catch (e) {
            console.error("AI JSON Parse Error:", e);
            return {
                text: responseText, // Fallback to raw text if not JSON
                suggestedTourId: null
            };
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            text: "Xin lỗi, hiện tại tôi đang gặp sự cố kỹ thuật. Bạn vui lòng chờ giây lát hoặc liên hệ hotline nhé!",
            suggestedTourId: null
        };
    }
};

const recommendTours = async (userRequirement, tours) => {
    try {
        const toursContext = tours.map(t =>
            `- ID: ${t.tourId} (ObjectID: ${t._id})
             - Tên: ${t.tenTour}
             - Giá: ${t.tongGiaDuKien?.toLocaleString('vi-VN')} VNĐ
             - Thời gian: ${t.thoiGian}
             - Khởi hành: ${t.diemKhoiHanh}
             - Lịch: ${Array.isArray(t.ngayKhoiHanh) ? t.ngayKhoiHanh.map(d => new Date(d).toLocaleDateString('vi-VN')).join(', ') : ''}
             - Mô tả: ${t.moTa ? t.moTa.substring(0, 200) + "..." : 'Không có mô tả'}
             - Dịch vụ: ${Array.isArray(t.dichVuBaoGom) ? t.dichVuBaoGom.join(', ') : (t.dichVuBaoGom || '')}`
        ).join('\n\n');

        const prompt = `
            Bạn là một trợ lý AI thông minh chuyên về du lịch. 
            Nhiệm vụ của bạn là phân tích yêu cầu của khách hàng và tìm ra các tour phù hợp nhất từ danh sách bên dưới.

            DỮ LIỆU TOUR HIỆN CÓ:
            ${toursContext}

            YÊU CẦU CỦA KHÁCH HÀNG:
            "${userRequirement}"

            CHỈ DẪN:
            1. Phân tích kỹ yêu cầu (địa điểm, ngân sách, thời gian, số lượng người, sở thích...).
            2. So khớp với dữ liệu tour. Hãy tìm kiếm tương đối (ví dụ: khách nói "biển" thì tìm tour có biển, Hạ Long, Phú Quốc...).
            3. Chọn ra tối đa 5 tour phù hợp nhất. Sắp xếp theo độ phù hợp giảm dần.
            4. Nếu không có tour nào thực sự phù hợp, hãy tìm các tour liên quan gần nhất (ví dụ: cùng vùng miền).
            5. Trả về kết quả dưới dạng JSON thuần túy. KHÔNG bọc trong markdown code block.

            FORMAT JSON OUTPUT:
            {
                "tourIds": ["ObjectID_1", "ObjectID_2", ...],  // Mảng các ObjectID (hoặc tourId nếu cần) của các tour được chọn
                "message": "Câu trả lời ngắn gọn (dưới 30 từ) tóm tắt tại sao lại chọn các tour này."
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        try {
            // Clean markdown if present
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonResponse = JSON.parse(cleanText);
            return jsonResponse;
        } catch (e) {
            console.error("AI JSON Parse Error:", e);
            return {
                tourIds: [],
                message: "Xin lỗi, tôi không thể tìm thấy tour phù hợp ngay lúc này."
            };
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            tourIds: [],
            message: "Hệ thống đang bận, vui lòng thử lại sau."
        };
    }
};

const moderateContent = async (title, content) => {
    try {
        const prompt = `
            Bạn là một hệ thống kiểm duyệt nội dung tự động cho cộng đồng du lịch.
            Nhiệm vụ của bạn là phân tích tiêu đề và nội dung bài viết dưới đây để xác định xem nó có an toàn và phù hợp không.

            TIÊU ĐỀ: "${title || ''}"
            NỘI DUNG: "${content}"

            CÁC TIÊU CHÍ VI PHẠM (Flagged Categories):
            1. Harassment: Quấy rối, đe dọa, xúc phạm cá nhân hoặc nhóm người.
            2. Hate Speech: Ngôn từ thù ghét, phân biệt chủng tộc, tôn giáo, giới tính...
            3. Sexually Explicit: Nội dung khiêu dâm, gợi dục.
            4. Spam/Scam: Quảng cáo rác, lừa đảo, phishing, nội dung vô nghĩa lặp đi lặp lại.
            5. Dangerous: Khuyến khích bạo lực, tự hại, khủng bố, hành vi phạm pháp.
            6. Irrelevant: Nội dung KHÔNG liên quan đến du lịch, địa điểm, tour, review trải nghiệm, văn hóa, ẩm thực. (Vui lòng đánh dấu vi phạm nếu bài viết bàn về chính trị, lập trình, buôn bán không liên quan, hoặc chuyện cá nhân không gắn với du lịch).

            ĐÁNH GIÁ:
            - Nếu nội dung vi phạm bất kỳ tiêu chí nào (bao gồm cả không liên quan chủ đề), hãy đánh dấu là KHÔNG AN TOÀN (isSafe: false).
            - Nếu nội dung an toàn, hữu ích, liên quan đến du lịch/chia sẻ trải nghiệm, hãy đánh dấu là AN TOÀN (isSafe: true).
            - Nếu nghi ngờ nhưng không chắc chắn, hãy đánh dấu là CẦN REVIEW (isSafe: false, confidence thấp).

            FORMAT JSON OUTPUT:
            {
                "isSafe": boolean, // true nếu an toàn, false nếu vi phạm hoặc cần review
                "confidence": number, // 0.0 đến 1.0 (Độ tin cậy của đánh giá)
                "reason": "Giải thích ngắn gọn lý do tại sao an toàn hoặc vi phạm (tiếng Việt)",
                "flaggedCategories": ["Category1", "Category2"] // Danh sách các vi phạm nếu có
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);

    } catch (error) {
        console.error("AI Moderation Error:", error);
        // Default fail-safe: Mark as needing review if AI fails
        return {
            isSafe: false,
            confidence: 0,
            reason: "Lỗi hệ thống kiểm duyệt, vui lòng kiểm tra thủ công.",
            flaggedCategories: ["System Error"]
        };
    }
};

module.exports = { generateAIResponse, recommendTours, moderateContent };