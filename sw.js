// Service worker: приложение открывается без интернета.
// Сначала сеть (чтобы сразу получать обновления), при отсутствии связи — кэш.
const CACHE = 'treasury-v3';
const FONTS_CACHE = 'treasury-fonts';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS_CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Шрифт Inter с Google Fonts: сначала кэш (файлы шрифтов не меняются), чтобы работал без интернета
  if (req.method === 'GET' && FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(FONTS_CACHE).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }))));
    return;
  }

  if (req.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      // Без сети: сохранённая копия; для страниц — приложение, для данных (курсы) — ничего
      .catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
