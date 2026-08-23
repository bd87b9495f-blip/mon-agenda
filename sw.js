const CACHE = 'mon-agenda-v5';
const ASSETS = ['./', './index.html', './style.css', './overrides.css', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok && !event.request.url.includes('?')) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    } catch {
      const cached = await caches.match(event.request);
      return cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
    }
  })());
});
