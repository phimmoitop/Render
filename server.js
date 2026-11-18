const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(cors()); // Mở CORS tạm thời cho dễ test

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbhvD2fULvgytKV9epC8_df4UOuzSAsrSi_uJNDyTJqfP0sYWK7Hb50iPenHkzudrg/exec';

// BỘ NHỚ RAM TẠM THỜI (IN-MEMORY CACHE)
let memoryCache = {
    videos: {},       // { "slug": { banner, link, view } }
    users: [],        // [ { username, password, Name, KNB }, ... ]
    isLoaded: false
};

let hasChanges = false;

// 1. Tải dữ liệu từ Google Sheets vào RAM
async function loadDataToMemory() {
    if (memoryCache.isLoaded) return;
    
    console.log('🔄 Đang kéo dữ liệu (Videos & Accounts) từ Google Sheets vào RAM...');
    try {
        const response = await fetch(`${APPS_SCRIPT_URL}?action=getData`);
        const data = await response.json();
        
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
        console.log('✅ Đã nạp toàn bộ dữ liệu vào RAM thành công!');
    } catch (error) {
        console.error('❌ Lỗi load dữ liệu:', error);
    }
}

// 2. Đồng bộ định kỳ 5 phút về Google Sheets
setInterval(async () => {
    if (!hasChanges) {
        console.log('💤 RAM không có thay đổi mới, bỏ qua sync.');
        return;
    }

    console.log('⏳ Đang đồng bộ thay đổi từ RAM về Google Sheets...');
    try {
        const payload = {
            action: 'syncData',
            videos: Object.keys(memoryCache.videos).map(slug => ({
                slug, ...memoryCache.videos[slug]
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
            hasChanges = false;
            console.log('✅ Đồng bộ về Google Sheets thành công!');
        }
    } catch (error) {
        console.error('❌ Lỗi đồng bộ:', error);
    }
}, 5 * 60 * 1000);

// --- API ROUTES ---

app.get('/', (req, res) => {
    res.send({ status: 'Server is running', cacheLoaded: memoryCache.isLoaded });
});

// API Đăng ký tài khoản
app.post('/api/register', async (req, res) => {
    await loadDataToMemory();
    const { username, password, Name } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu!' });
    }

    // Kiểm tra trùng username trên RAM
    const exist = memoryCache.users.find(u => u.username === username);
    if (exist) {
        return res.status(400).json({ error: 'Tài khoản đã tồn tại!' });
    }

    // Thêm user mới vào RAM (Tặng mặc định 100 KNB làm quà chào mừng)
    const newUser = {
        username,
        password,
        Name: Name || username,
        KNB: 100
    };

    memoryCache.users.push(newUser);
    hasChanges = true; // Đánh dấu để sync về Sheets

    res.json({ success: true, message: 'Đăng ký thành công!', user: { username: newUser.username, Name: newUser.Name, KNB: newUser.KNB } });
});

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    await loadDataToMemory();
    const { username, password } = req.body;

    // Tìm trong RAM (Cực nhanh, 0ms)
    const user = memoryCache.users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
    }

    res.json({ 
        success: true, 
        message: 'Đăng nhập thành công!', 
        user: { 
            username: user.username, 
            Name: user.Name, 
            KNB: user.KNB 
        } 
    });
});

// API Xem video theo Slug (Tăng View trên RAM)
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại cổng ${PORT}`);
});
