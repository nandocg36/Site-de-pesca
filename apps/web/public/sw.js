/* Marco 1 — SW mínimo para critérios de instalação PWA (cache real no Marco 2+). */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
