const CACHE_NAME = 'mon-agenda-v12-4-1-beta-1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=12.4.1',
  './app.js?v=12.4.1',
  './manifest.webmanifest?v=12.4.1',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name.startsWith('mon-agenda-') && name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(request) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), 3500));
  try {
    const response = await Promise.race([fetch(request, { cache: 'no-store' }), timeout]);
    if (response?.ok) return response;
    throw new Error('NETWORK_ERROR');
  } catch {
    return (await caches.match('./index.html')) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => {
    if (!cached) return fetch(event.request);
    const refresh = fetch(event.request, { cache: 'no-store' }).then(response => {
      if (!response.ok) return response;
      return caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())).then(() => response);
    }).catch(() => cached);
    event.waitUntil(refresh.then(() => undefined));
    return cached;
  }));
});
