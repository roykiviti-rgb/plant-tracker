// Offline support: always try the network first (so updates show up right away)
// and fall back to the saved copy when there is no connection.
const CACHE = 'plants-v1';

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
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png',
  ...PLANT_THUMBS,
];

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
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

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

async function fromCache(request) {
  const cached = await caches.match(request);
  if (cached || request.mode !== 'navigate') return cached;
  return caches.match('index.html');
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}
