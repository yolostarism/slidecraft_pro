const CACHE_NAME = 'slidecraft-pwa-v3';

// 1. 安装阶段：立即生效，无需等待
self.addEventListener('install', (event) => {
    self.skipWaiting(); // 强制覆盖旧的（崩溃的）Service Worker
});

// 2. 激活阶段：瞬间接管当前网页
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim()); // 确保第一次打开就能开始记录缓存
    
    // 清理旧版本的垃圾缓存
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.map(name => {
                if (name !== CACHE_NAME) return caches.delete(name);
            })
        ))
    );
});

// 3. 拦截网络请求
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = event.request.url;

    // A. 你的后端 API (比如加载幻灯片数据)
    // 策略：网络优先，失败时读取上次的缓存
    if (url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // B. React, Tailwind 等巨大静态文件与 HTML 页面
    // 策略：绝对的缓存优先！只要硬盘里有，0 毫秒瞬间返回！
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // 命中缓存，瞬间起飞
            }
            
            return fetch(event.request).then(response => {
                // 允许缓存跨域的 CDN 文件 (状态码为 0 的情况)
                if (!response || (response.status !== 200 && response.status !== 0)) {
                    return response;
                }
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch((error) => {
                // 【修复核心】：断网且没缓存时，绝对不能返回乱码！直接让它报错，防止 JS 引擎死机
                console.error('断网无法获取资源:', url);
                throw error; 
            });
        })
    );
});
