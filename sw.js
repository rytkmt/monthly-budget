// アプリシェルのオフライン配信。
// 更新方針: ネットワーク優先（成功したらキャッシュも更新）、失敗時のみキャッシュ。
// 古い版が残り続けないよう、ファイル構成を変えたら CACHE_VERSION を上げる。
const CACHE_VERSION = 'v1';
const CACHE_NAME = `monthly-budget-${CACHE_VERSION}`;

// すべて sw.js からの相対パス（GitHub Pages のサブパス配信でも動く）
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './src/app.js',
  './src/db.js',
  './src/domain/month.js',
  './src/domain/budget.js',
  './src/domain/calendar.js',
  './src/domain/expense.js',
  './src/domain/backup.js',
  './src/domain/format.js',
  './src/ui/calendar.js',
  './src/ui/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('monthly-budget-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
