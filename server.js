const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbhvD2fULvgytKV9epC8_df4UOuzSAsrSi_uJNDyTJqfP0sYWK7Hb50iPenHkzudrg/exec';

// --- BỘ NHỚ RAM TẠM THỜI (IN-MEMORY CACHE) ---
let memoryCache = {
    videos: {},       
    users: [],        
    chats: [],        // Danh sách chat realtime (Lưu tối đa 50 câu mới nhất)
    isLoaded: false
};

let hasChanges = false;

// --- DANH SÁCH 30 CÂU CHAT DẠO NGẪU NHIÊN ---
const RANDOM_CHAT_POOL = [
    "Hôm nay thời tiết đẹp quá nhỉ!",
    "Có ai đang xem phim gì hay không giới thiệu với.",
    "Web chạy mượt phết, tốc độ load 0ms luôn ae ơi.",
    "Vừa nạp thêm mấy trăm KNB xong, sướng thế.",
    "Admin ơi ra mắt thêm tính năng mới đi!",
    "Có ai thức khuya giống mình không điểm danh nào.",
    "Hệ thống cache RAM này đỉnh cao thật sự.",
    "Chúc mọi người một ngày tốt lành nhé.",
    "Ai kết bạn làm quen không nào.",
    "Vừa xem xong tập mới, cuốn quá chừng.",
    "Server chạy ổn định thế này thì ngon rồi.",
    "Cho xin link nhóm Telegram với các bác ơi.",
    "Tối nay có kèo gì chơi không ae?",
    "Mới vào nghề thấy code này hay quá.",
    "Ai đang online gật đầu cái xem nào.",
    "Chạy trâu bò thật, không thấy giật lag gì cả.",
    "Đang test thử tính năng chat realtime xem sao.",
    "Cho xin 1 nút like động viên nào ae.",
    "Hệ thống tự động sinh tin nhắn thông minh phết.",
    "Ai đoán xem bao giờ có bão nào?",
    "Cười cái xem nào mn ơi :D",
    "Web cá nhân mà xịn như web công ty lớn.",
    "Điểm danh anh em thiện lành nào!",
    "Ai rảnh vào đàm đạo chơi.",
    "Tốc độ phản hồi cực nhanh luôn.",
    "Thành viên mới xin chào cả nhà nhé.",
    "Hôm nay ae có săn được gì không?",
    "Hệ thống tự động chat dạo kích hoạt keke.",
    "Tuyệt vời ông mặt trời!",
    "Cố lên ae, sắp thành công rồi."
];

// --- 1. TIẾN TRÌNH TỰ ĐỘNG SINH CÂU CHAT MỖI 10 PHÚT ---
setInterval(() => {
    // Chọn ngẫu nhiên 1 câu từ kho chat dạo
    const randomMsg = RANDOM_CHAT_POOL[Math.floor(Math.random() * RANDOM_CHAT_POOL.length)];
    
    const botChat = {
        sender: "🤖 Bot Hệ Thống",
        message: randomMsg,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // Đưa lên đầu mảng chat
    memoryCache.chats.unshift(botChat);

    // Giới hạn tối đa chỉ lưu 50 câu chat mới nhất trên RAM
    if (memoryCache.chats.length > 50) {
        memoryCache.chats.pop(); // Xóa câu cũ nhất ở cuối mảng
    }

    console.log(`🤖 [Auto Chat]: ${randomMsg}`);
}, 10 * 60 * 1000); // 10 phút = 10 * 60 * 1000 ms

// --- 2. HÀM TẢI DỮ LIỆU TỪ SHEETS (GIỮ NGUYÊN) ---
async function loadDataToMemory() {
    if (memoryCache.isLoaded) return;
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getData`);
        const data = await response.json();
        if (Array.isArray(data.videos)) {
            data.videos.forEach(item => {
                memoryCache.videos[item.slug] = { banner: item.banner, link: item.link, view: Number(item.view) || 0 };
            });
        }
        if (Array.isArray(data.users)) memoryCache.users = data.users;
        memoryCache.isLoaded = true;
    } catch (error) { console.error('Lỗi load:', error); }
}

// --- 3. CÁC API CHAT REALTIME ---

// API Lấy danh sách tin nhắn chat hiện tại trên RAM
app.get('/api/chats', async (req, res) => {
    await loadDataToMemory();
    res.json({ success: true, chats: memoryCache.chats });
});

// API Gửi tin nhắn mới từ người dùng lên RAM
app.post('/api/chats', async (req, res) => {
    await loadDataToMemory();
    const { sender, message } = req.body;

    if (!message || message.trim() === "") {
        return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống!' });
    }

    const newChat = {
        sender: sender || "Khách ẩn danh",
        message: message.trim(),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // Thêm vào đầu danh sách chat trên RAM
    memoryCache.chats.unshift(newChat);

    // Giới hạn tối đa 50 câu mới nhất
    if (memoryCache.chats.length > 50) {
        memoryCache.chats.pop();
    }

    res.json({ success: true, chat: newChat });
});

// (Các API video, login, register giữ nguyên như cũ...)
app.get('/api/video/:slug', async (req, res) => {
    await loadDataToMemory();
    const video = memoryCache.videos[req.params.slug];
    if (!video) return res.status(404).json({ error: 'Không tìm thấy video!' });
    video.view += 1;
    res.json({ slug: req.params.slug, ...video });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
