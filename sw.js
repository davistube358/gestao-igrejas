/* 2Gather — service worker.
   Guarda só a TELA do app (HTML, JS, CSS, ícones) para abrir rápido e sem internet.
   Dados nunca passam por aqui: as chamadas ao servidor (Apps Script) não são guardadas. */
var VERSAO = '2gather-v31';
var ARQUIVOS = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest',
  './lib/leaflet.js', './lib/leaflet.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data && e.data.tipo === 'ATUALIZAR') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(fetch(req).catch(function () { return caches.match('./index.html'); })); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (r) { return r || fetch(req); }));
});
