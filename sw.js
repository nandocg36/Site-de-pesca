const CACHE = 'pesca-v20';
/** Recursos críticos — falha de qualquer um ainda bloqueia install (ficheiros obrigatórios). */
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './styles.css',
  './app.js',
  './js/tide-epagri.js',
  './js/utils/escapeHtml.js',
  './js/social/constants.js',
  './js/social/geofence.js',
  './js/social/validation.js',
  './js/social/aggregate.js',
  './js/social/adapters/mockBackend.js',
  './js/social/adapters/firebaseAdapter.js',
  './js/social/adapters/supabaseAdapter.js',
  './js/social/socialShell.js',
  './js/social/bootstrap.js',
  './manifest.json',
  './data/epagri-tides-2026.json',
];
/** Ícones opcionais — 404 não impede instalação do SW. */
const OPTIONAL_ASSETS = ['./icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        await cache.addAll(CORE_ASSETS);
        await Promise.all(
          OPTIONAL_ASSETS.map((url) =>
            fetch(url)
              .then((res) => (res.ok ? cache.put(url, res) : undefined))
              .catch(() => undefined)
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return (
    url.hostname.includes('open-meteo.com') ||
    url.hostname.includes('geocoding-api.open-meteo.com') ||
    url.hostname.includes('api.open-meteo.com') ||
    url.hostname.includes('marine-api.open-meteo.com') ||
    url.hostname === 'api.met.no' ||
    url.hostname === 'nominatim.openstreetmap.org'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isApi(url)) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (req.url.startsWith(self.location.origin)) {
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          const accept = req.headers.get('accept') || '';
          const isHtmlNav =
            req.mode === 'navigate' || (accept.includes('text/html') && req.destination === 'document');
          if (isHtmlNav) {
            return caches.match('./offline.html').then((off) => off || caches.match('./index.html'));
          }
          return caches.match('./index.html');
        })
      )
  );
});
