const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbhvD2fULvgytKV9epC8_df4UOuzSAsrSi_uJNDyTJqfP0sYWK7Hb50iPenHkzudrg/exec'; // Nhớ điền link Apps Script của bạn vào đây

// --- BỘ NHỚ RAM TẠM THỜI (IN-MEMORY CACHE) ---
let memoryCache = {
    videos: {},       
    users: [],        
    chats: [],        
    isLoaded: false
};

let hasChanges = false;
const sessions = new Map();

function getSessionUser(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const username = sessions.get(token);
    return username ? memoryCache.users.find(user => user.username === username) : null;
}

// --- KHO 30 CÂU CHAT DẠO ---
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
    "C cười cái xem nào mn ơi :D",
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

// --- BOT TỰ ĐỘNG CHAT MỖI 10 PHÚT ---
setInterval(() => {
    const randomMsg = RANDOM_CHAT_POOL[Math.floor(Math.random() * RANDOM_CHAT_POOL.length)];
    const botChat = {
        sender: "🤖 Bot Hệ Thống",
        message: randomMsg,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    memoryCache.chats.unshift(botChat);
    if (memoryCache.chats.length > 50) memoryCache.chats.pop();
}, 10 * 60 * 1000);

// --- HÀM TẢI DỮ LIỆU TỪ GOOGLE SHEETS VÀO RAM ---
async function loadDataToMemory() {
    if (memoryCache.isLoaded) return;
    console.log('🔄 Đang kéo dữ liệu từ Google Sheets vào RAM...');
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getData`);
        const data = await response.json();
        
        if (Array.isArray(data.videos)) {
            data.videos.forEach(item => {
                memoryCache.videos[item.slug] = { banner: item.banner, link: item.link, view: Number(item.view) || 0 };
            });
        }
        if (Array.isArray(data.users)) {
            memoryCache.users = data.users;
        }
        memoryCache.isLoaded = true;
        console.log('✅ Đã nạp dữ liệu vào RAM thành công!');
    } catch (error) {
        console.error('❌ Lỗi load dữ liệu:', error);
    }
}

// --- ĐỒNG BỘ ĐỊNH KỲ VỀ SHEETS ---
setInterval(async () => {
    if (!hasChanges) return;
    try {
        const payload = {
            action: 'syncData',
            videos: Object.keys(memoryCache.videos).map(slug => ({ slug, ...memoryCache.videos[slug] })),
            users: memoryCache.users
        };
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        hasChanges = false;
        console.log('✅ Đồng bộ về Google Sheets thành công!');
    } catch (error) {
        console.error('❌ Lỗi đồng bộ:', error);
    }
}, 5 * 60 * 1000);

// --- API ROUTES ---

app.get('/', (req, res) => {
    res.send({ status: 'Server is running', cacheLoaded: memoryCache.isLoaded });
});

// 1. API Đăng ký
app.post('/api/register', async (req, res) => {
    await loadDataToMemory();
    const { username, password, Name } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu!' });
    }

    const exist = memoryCache.users.find(u => u.username === username);
    if (exist) {
        return res.status(400).json({ error: 'Tài khoản đã tồn tại!' });
    }

    const newUser = {
        username,
        password,
        Name: Name || username,
        KNB: 100
    };

    memoryCache.users.push(newUser);
    hasChanges = true;

    res.json({ success: true, message: 'Đăng ký thành công!', user: { username: newUser.username, Name: newUser.Name, KNB: newUser.KNB } });
});

// 2. API Đăng nhập
app.post('/api/login', async (req, res) => {
    await loadDataToMemory();
    const { username, password } = req.body;

    const user = memoryCache.users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
    }

    res.json({ 
        success: true, 
        message: 'Đăng nhập thành công!', 
        token: (() => { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user.username); return token; })(),
        user: { 
            username: user.username, 
            Name: user.Name, 
            KNB: user.KNB 
        } 
    });
});

// Thông tin tài khoản hiện tại của phiên đăng nhập
app.get('/api/me', async (req, res) => {
    await loadDataToMemory();
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    res.json({ success: true, user: { username: user.username, Name: user.Name, KNB: user.KNB } });
});

// Danh sách video đang được cache trong RAM
app.get('/api/videos', async (req, res) => {
    await loadDataToMemory();
    res.json({ success: true, videos: Object.keys(memoryCache.videos).map(slug => ({ slug, ...memoryCache.videos[slug] })) });
});

// 3. API Xem video
app.get('/api/video/:slug', async (req, res) => {
    await loadDataToMemory();
    const slug = req.params.slug;
    const video = memoryCache.videos[slug];

    if (!video) {
        return res.status(404).json({ error: 'Không tìm thấy video!' });
    }

    video.view += 1;
    hasChanges = true;

    res.json({ slug, ...video });
});

// 4. API Lấy tin nhắn chat
app.get('/api/chats', async (req, res) => {
    await loadDataToMemory();
    res.json({ success: true, chats: memoryCache.chats });
});

// 5. API Gửi tin nhắn chat
app.post('/api/chats', async (req, res) => {
    await loadDataToMemory();
    const { sender, message } = req.body;

    if (!message || message.trim() === "") {
        return res.status(400).json({ error: 'Nội dung tin nhắn trống!' });
    }

    const newChat = {
        sender: sender || "Khách",
        message: message.trim(),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    memoryCache.chats.unshift(newChat);
    if (memoryCache.chats.length > 50) memoryCache.chats.pop();

    res.json({ success: true, chat: newChat });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
