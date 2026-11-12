// Service worker: guarda el juego para poder jugar sin conexión.
// Al publicar una versión nueva, cambia VERSION para renovar la caché.
const VERSION = 'tinta-v2';
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest', './assets/icon.svg',
  './assets/fonts/bigshoulders-stencil.woff2', './assets/fonts/atkinson-400.woff2', './assets/fonts/atkinson-700.woff2',
  './src/style.css', './src/main.js', './src/game.js', './src/player.js', './src/enemies.js', './src/bullets.js',
  './src/input.js', './src/audio.js', './src/ui.js', './src/fx.js', './src/storage.js', './src/util.js',
];

self.addEventListener('install', (e) => {
  // Archivo a archivo: si uno falla, el resto sigue disponible sin conexión.
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(ARCHIVOS.map((a) => c.add(a)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('tinta-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero la red (para recibir actualizaciones); si no hay conexión, la caché.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 200) {
          const copia = res.clone();
          e.waitUntil(caches.open(VERSION).then((c) => c.put(req, copia)).catch(() => {}));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
  );
});
