// Service worker: network-first (fresh content when online), cache fallback (works offline).
const CACHE = 'lernbau-v9';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'data/content.json',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/config.js',
  'js/sync.js',
  'js/content.js',
  'js/fsrs.js',
  'js/speech.js',
  'js/store.js',
  'js/ui.js',
  'js/util.js',
  'js/views/home.js',
  'js/views/quiz.js',
  'js/views/review.js',
  'js/views/settings.js',
  'js/views/stats.js',
  'js/views/subjects.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
      if (res.ok) cache.put(req.url.split('?')[0], res.clone());
      return res;
    } catch {
      const hit = await cache.match(req.url.split('?')[0], { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('Offline', { status: 503 });
    }
  })());
});
