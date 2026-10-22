// Offline support: always try the network first (so updates show up right away)
// and fall back to the saved copy when there is no connection.
// Also shows the daily reminder notifications sent by the server.
const CACHE = 'plants-v2';

// Keep this list in sync with the starting plants in js/seed.js.
const PLANT_THUMBS = [
  'herbs-a', 'herbs-b', 'parsley', 'oregano', 'salvia', 'angelonia', 'zz',
  'sansevieria', 'sansevieria-hahnii', 'dieffenbachia', 'birkin', 'palm', 'pothos', 'mint',
].map((id) => `plants/${id}-thumb.jpg`);

const PRECACHE = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/logic.js',
  'js/store.js',
  'js/seed.js',
  'js/config.js',
  'js/cloud.js',
  'js/reminders.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/badge-96.png',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  ...PLANT_THUMBS,
];

// The Firebase SDK files have the version in their address, so a saved copy never goes stale.
const SDK_PREFIX = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.url.startsWith(SDK_PREFIX)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  event.respondWith(
    Promise.race([network, timeout(4000)]).catch(async () => (await fromCache(request)) ?? network),
  );
});

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    // Not JSON: show the default text.
  }
  event.waitUntil(self.registration.showNotification(message.title || 'הצמחים שלי', {
    body: message.body || 'יש צמחים שצריך להשקות היום',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: message.tag || 'watering',
    lang: 'he',
    dir: 'rtl',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    return open ? open.focus() : self.clients.openWindow('./');
  })());
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function fromCache(request) {
  const cached = await caches.match(request);
  if (cached || request.mode !== 'navigate') return cached;
  return caches.match('index.html');
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}
