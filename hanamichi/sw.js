// Service worker: guarda Hanamichi para poder jugar sin conexión.
// Al publicar una versión nueva, sube VERSION.
const VERSION = 'hanamichi-v2';
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest', './assets/icono.svg',
  './assets/fonts/dela-gothic.woff2', './assets/fonts/mplus-500.woff2', './assets/fonts/mplus-800.woff2',
  './vendor/three.module.min.js', './vendor/BufferGeometryUtils.js',
  './src/estilo.css', './src/main.js', './src/render.js', './src/mapa.js', './src/personaje.js', './src/armas.js',
  './src/jugador.js', './src/bots.js', './src/efectos.js', './src/juego.js', './src/input.js', './src/audio.js',
  './src/ui.js', './src/datos.js', './src/red.js', './src/config.js', './src/heroes.js', './src/poderes.js', './src/vista.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(ARCHIVOS.map((a) => c.add(a)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('hanamichi-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.status === 200) { const copia = res.clone(); e.waitUntil(caches.open(VERSION).then((c) => c.put(req, copia)).catch(() => {})); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
});
