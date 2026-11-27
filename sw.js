/* StudyBuddy offline app shell. Bump CACHE when the shell changes. */
const CACHE = 'studybuddy-v89';
const SHELL = './index.html';
const OPTIONAL_ASSETS = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const scope = new URL(self.registration.scope);
const shellURL = new URL(SHELL, scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(shellURL, { cache: 'reload' }));
    await Promise.allSettled(OPTIONAL_ASSETS.map(path => cache.add(new URL(path, scope).href)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('studybuddy-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate' &&
      (url.pathname === scope.pathname || url.pathname === new URL(shellURL).pathname)) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(shellURL)) || Response.error();
    }));
    return;
  }

  if (!OPTIONAL_ASSETS.some(path => new URL(path, scope).href === url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(request)) || fetch(request);
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') event.waitUntil(self.skipWaiting());
});
