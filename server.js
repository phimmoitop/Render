const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors());

// URL Web App của Google Apps Script (Thay link của bạn vào đây)
const APPS_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';

// --- BỘ NHỚ RAM TẠM THỜI (IN-MEMORY CACHE) ---
let memoryCache = {
    videos: {},       // Lưu danh sách video theo slug/id: { "tv-1": { banner: "...", link: "...", view: 10 } }
    users: [],        // Lưu danh sách thành viên đăng ký tạm
    isLoaded: cF = false // Trạng thái đã load dữ liệu từ Sheets lên RAM chưa
};

// Cờ đánh dấu RAM có thay đổi so với Sheets hay không để tiết kiệm request sync
let hasChanges = false;

// --- 1. HÀM TẢI DỮ LIỆU TỪ GOOGLE SHEETS VÀO RAM ---
async function loadDataToMemory() {
    if (memoryCache.isLoaded) return; // Nếu đã load rồi thì bỏ qua
    
    console.log('🔄 Đang kéo dữ liệu từ Google Sheets vào RAM...');
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getData`);
        const data = await response.json();
        
        // Giả sử data trả về từ Sheets là mảng các video [{slug, banner, link, view}, ...]
        if (Array.isArray(data.videos)) {
            data.videos.forEach(item => {
                memoryCache.videos[item.slug] = {
                    banner: item.banner,
                    link: item.link,
                    view: Number(item.view) || 0
                };
            });
        }
        if (Array.isArray(data.users)) {
            memoryCache.users = data.users;
        }

        memoryCache.isLoaded = true;
        console.log('✅ Đã nạp dữ liệu vào RAM thành công!');
    } catch (error) {
        console.error('❌ Lỗi khi load dữ liệu từ Sheets:', error);
    }
}

// --- 2. HÀM ĐỒNG BỘ ĐỊNH KỲ VỀ GOOGLE SHEETS (5 PHÚT/LẦN) ---
setInterval(async () => {
    if (!hasChanges) {
        console.log('💤 RAM không có thay đổi gì mới, bỏ qua lượt đồng bộ.');
        return;
    }

    console.log('⏳ Đang đồng bộ dữ liệu thay đổi từ RAM về Google Sheets...');
    try {
        const payload = {
            action: 'syncData',
            videos: Object.keys(memoryCache.videos).map(slug => ({
                slug: slug,
                ...memoryCache.videos[slug]
            })),
            users: memoryCache.users
        };

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.success) {
            hasChanges = false; // Reset cờ sau khi lưu thành công
            console.log('✅ Đồng bộ về Google Sheets thành công!');
        } else {
            console.error('⚠️ Google Sheets phản hồi lỗi:', result);
        }
    } catch (error) {
        console.error('❌ Lỗi kết nối khi đồng bộ về Sheets:', error);
    }
}, 5 * 60 * 1000); // 5 phút = 5 * 60 * 1000 ms

// --- 3. CÁC API PHỤC VỤ CLIENT (BLOGSPOT / HTML TEST) ---

// API Kiểm tra server sống
app.get('/', (req, res) => {
    res.send({ status: 'Server is running', cacheLoaded: memoryCache.isLoaded });
});

// API Xem bài viết theo ID/Slug (Lấy từ RAM + Tăng View ngầm)
app.get('/api/video/:slug', async (req, res) => {
    await loadDataToMemory(); // Đảm bảo RAM đã có dữ liệu

    const slug = req.params.slug;
    const video = memoryCache.videos[slug];

    if (!video) {
        return res.status(404).json({ error: 'Không tìm thấy video!' });
    }

    // Tăng view trực tiếp trên RAM (Siêu nhanh)
    video.view += 1;
    hasChanges = true; // Đánh dấu RAM đã thay đổi để tí nữa đồng bộ

    res.json({
        slug: slug,
        banner: video.banner,
        link: video.link,
        view: video.view
    });
});

// API Đăng ký thành viên
app.post('/api/register', async (req, res) => {
    await loadDataToMemory();
    const { username, password } = req.body;

    // Kiểm tra tồn tại
    const exist = memoryCache.users.find(u => u.username === username);
    if (exist) {
        return res.status(400).json({ error: 'Tài khoản đã tồn tại!' });
    }

    memoryCache.users.push({ username, password });
    hasChanges = true; // Đánh dấu để sync về Sheets

    res.json({ success: true, message: 'Đăng ký thành công!' });
});

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    await loadDataToMemory();
    const { username, password } = req.body;

    const user = memoryCache.users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
    }

    res.json({ success: true, message: 'Đăng nhập thành công!', user: { username } });
});

// Khởi động Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
