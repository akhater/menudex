// Offline support. Serves from cache first and refreshes the cache in the
// background, so the app opens instantly in the field and picks up new menu
// data on the next launch. Bump VERSION when the app shell changes.
const VERSION = 'menudex-v1';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/search.js',
  'js/icons.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'data/catalog.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Cache every camera file too: the whole catalog is small, and it must work offline.
    const catalog = await (await fetch('data/catalog.json')).json();
    const files = catalog.brands.flatMap((b) => b.models.flatMap((m) => m.firmware.map((f) => f.file)));
    await cache.addAll(files);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    return (await fresh) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  })());
});
