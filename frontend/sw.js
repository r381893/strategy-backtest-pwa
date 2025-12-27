/**
 * Service Worker - 高級回測系統 Pro
 * 處理離線快取和資源預取
 */

const CACHE_NAME = 'backtest-pro-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/firebase-config.js',
    '/js/file-parser.js',
    '/js/chart.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

const EXTERNAL_ASSETS = [
    'https://cdn.plot.ly/plotly-2.27.0.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap'
];

// 安裝事件 - 快取靜態資源
self.addEventListener('install', (event) => {
    console.log('[SW] 安裝中...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] 快取靜態資源');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 啟用事件 - 清理舊快取
self.addEventListener('activate', (event) => {
    console.log('[SW] 啟用中...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] 刪除舊快取:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// 請求攔截 - 實現快取優先策略
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API 請求不快取，直接通過網路
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 靜態資源使用快取優先策略
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // 有快取就使用快取，同時在背景更新
                    fetchAndUpdate(event.request);
                    return cachedResponse;
                }

                // 沒有快取就從網路取得
                return fetchAndCache(event.request);
            })
            .catch(() => {
                // 離線且沒有快取時顯示離線頁面
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                return new Response('離線中', { status: 503 });
            })
    );
});

// 從網路取得並快取
async function fetchAndCache(request) {
    try {
        const response = await fetch(request);

        // 只快取成功的 GET 請求
        if (response.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.error('[SW] 取得失敗:', error);
        throw error;
    }
}

// 背景更新快取
async function fetchAndUpdate(request) {
    try {
        const response = await fetch(request);

        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
    } catch (error) {
        // 背景更新失敗不影響使用者
        console.log('[SW] 背景更新失敗:', error);
    }
}

// 推送通知（未來擴充）
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();

        event.waitUntil(
            self.registration.showNotification(data.title || '回測系統通知', {
                body: data.body || '',
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-72.png'
            })
        );
    }
});
