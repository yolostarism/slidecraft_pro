const express = require('express');
const bodyParser = require('body-parser');
const { neon } = require('@neondatabase/serverless');
const { put } = require('@vercel/blob');
const multiparty = require('multiparty');

const app = express();

// 初始化 Neon 数据库连接
// 它会自动读取 .env.development.local 里的 DATABASE_URL
const sql = neon(process.env.DATABASE_URL);

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// 初始化数据库表结构
async function initDB() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS presentations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                title VARCHAR(255),
                slides TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("✅ Neon 数据库表结构初始化成功！");
    } catch (e) {
        console.error("❌ 数据库初始化失败:", e);
    }
}
initDB();

app.post(['/api/login', '/login'], async (req, res) => {
    const { username, password } = req.body;
    try {
        // 使用 Neon SQL 查询
        const rows = await sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
        
        // 关键点：检查 rows 是否存在且有数据
        if (rows && rows.length > 0) {
            const user = rows[0];
            // 返回包含 id 的正确 JSON
            res.json({ success: true, username: user.username, id: user.id });
        } else {
            res.status(401).json({ error: '用户名或密码错误' });
        }
    } catch (e) { 
        console.error("登录报错:", e);
        res.status(500).json({ error: e.message }); 
    }
});

app.post(['/api/register', '/register'], async (req, res) => {
    return res.status(403).json({ error: '系统当前已关闭注册功能，请直接登录或联系管理员。' });
});

app.get(['/api/projects', '/projects'], async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.json([]);
        const rows = await sql`SELECT id, title, updated_at FROM presentations WHERE user_id = ${userId} ORDER BY updated_at DESC`;
        res.json(rows);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post(['/api/projects', '/projects'], async (req, res) => {
    try {
        const { userId, title, slides } = req.body;
        const slidesStr = typeof slides === 'string' ? slides : JSON.stringify(slides);
        
        const rows = await sql`
            INSERT INTO presentations (user_id, title, slides) 
            VALUES (${userId}, ${title}, ${slidesStr}) 
            RETURNING id
        `;
        res.json({ success: true, id: rows[0].id });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.get(['/api/projects/:id', '/projects/:id'], async (req, res) => {
    try {
        const rows = await sql`SELECT * FROM presentations WHERE id = ${req.params.id}`;
        if(rows.length === 0) return res.status(404).json({error: 'Not found'});
        const p = rows[0]; 
        try {
            p.slides = typeof p.slides === 'string' ? JSON.parse(p.slides) : p.slides;
        } catch (e) { p.slides = []; }
        res.json(p);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post(['/api/projects/:id', '/projects/:id'], async (req, res) => {
    try {
        const { slides, title } = req.body;
        const slidesStr = typeof slides === 'string' ? slides : JSON.stringify(slides);
        await sql`
            UPDATE presentations 
            SET slides = ${slidesStr}, title = ${title}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ${req.params.id}
        `;
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.delete(['/api/projects/:id', '/projects/:id'], async (req, res) => {
    try {
        await sql`DELETE FROM presentations WHERE id = ${req.params.id}`;
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/upload', (req, res) => {
    const form = new multiparty.Form();
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const imageFile = files.image ? files.image[0] : null;
        if (!imageFile) return res.status(400).json({ error: '请选择文件' });

        try {
            const fs = require('fs');
            const fileBuffer = fs.readFileSync(imageFile.path);
            
            const blob = await put(`img-${Date.now()}-${imageFile.originalFilename}`, fileBuffer, {
                access: 'public',
            });
            
            res.json({ success: true, url: blob.url });
        } catch (e) {
            res.status(500).json({ error: "图片上传失败: " + e.message });
        }
    });
});

module.exports = app;
