// Lets the app open with patchy or no wifi. It uses the newest files when it can get
// them quickly, and otherwise the last copy it saved. Firebase's own data traffic
// isn't touched, because Firestore has its own offline storage.
const CACHE = 'salad-tower-v1';
const FIREBASE = 'https://www.gstatic.com/firebasejs/13.2.0';
const FILES = [
  './', 'index.html', 'styles.css', 'crops.js', 'seeds.js', 'logic.js', 'guide.js', 'sync-config.js',
  'sync-core.js', 'app.js', 'sync.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  `${FIREBASE}/firebase-app.js`, `${FIREBASE}/firebase-auth.js`, `${FIREBASE}/firebase-firestore.js`,
];
const WAIT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    // One file failing shouldn't stop the rest from being saved.
    await Promise.all(FILES.map((file) => cache.add(file).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const ours = url.origin === location.origin || url.href.startsWith(FIREBASE);
  if (event.request.method !== 'GET' || !ours) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(event.request).then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    });
    const saved = await cache.match(event.request, { ignoreSearch: true });
    if (!saved) return network;
    network.catch(() => {});
    const timeout = new Promise((resolve) => { setTimeout(() => resolve(saved), WAIT_MS); });
    return Promise.race([network.catch(() => saved), timeout]);
  })());
});
