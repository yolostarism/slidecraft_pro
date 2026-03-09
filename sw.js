const CACHE_NAME = 'slidecraft-pwa-v1';

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // 1. 针对你的 API 接口 (分享的数据拉取)
    // 策略：网络优先，断网时用旧缓存
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

    // 2. 针对超大的 CDN 文件 (React, Babel, Tailwind) 和 HTML 本身
    // 策略：缓存优先，没有缓存再去网络下载（彻底消灭白屏）
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // 命中缓存，0毫秒返回！不管网多卡，这里都是瞬间完成
                return cachedResponse;
            }
            
            return fetch(event.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            return new Response('当前完全断网，且无本地缓存数据。');
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names.map(name => {
                if (name !== CACHE_NAME) return caches.delete(name);
            })
        ))
    );
});
