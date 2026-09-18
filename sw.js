const BUILD_ID = '2026.15.1';
const CACHE_PREFIX = 'mon-agenda-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const LEGACY_CACHE_NAMES = new Set(['mon-agenda-v12-5-beta-1']);
const INDEX_FALLBACK = `./index.html?v=${BUILD_ID}`;
const APP_SHELL = [
  INDEX_FALLBACK,
  `./style.css?v=${BUILD_ID}`,
  `./storage.js?v=${BUILD_ID}`,
  `./app.js?v=${BUILD_ID}`,
  `./manifest.webmanifest?v=${BUILD_ID}`,
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];
const APP_SHELL_URLS = new Set(APP_SHELL.map(url => new URL(url, self.location.href).href));

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(APP_SHELL.map(async url => {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`APP_SHELL_FETCH_FAILED:${url}`);
    await cache.put(request, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(installShell());
});

self.addEventListener('message', event => {
  if (!['WORKER_STATUS', 'SKIP_WAITING'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appWindows = windows.filter(client => typeof client.url === 'string' && client.url.startsWith(self.registration.scope));
    const activeUrl = self.registration?.active?.scriptURL || '';
    const status = {
      activated: Boolean(activeUrl) && new URL(activeUrl, self.location.href).href === self.location.href,
      clientCount: appWindows.length
    };
    if (event.data.type === 'SKIP_WAITING') {
      const accepted = status.clientCount === 1;
      if (accepted) await self.skipWaiting();
      event.ports?.[0]?.postMessage({ ...status, accepted });
      return;
    }
    event.ports?.[0]?.postMessage(status);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME && (name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_NAMES.has(name))).map(name => caches.delete(name))))
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
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(INDEX_FALLBACK)) || Response.error();
  }
}

async function shellResponse(request) {
  if (!APP_SHELL_URLS.has(request.url)) return fetch(request, { cache: 'no-store' });
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request, { cache: 'no-store' });
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }
  event.respondWith(shellResponse(event.request));
});
