/* 2Gather v39 · Service Worker · SYNC-V39-7
   Troque VERSAO a cada publicação: os aparelhos descartam o cache antigo sozinhos.
   - Arquivos do app (HTML/JS/CSS/config) sempre buscados na internet primeiro, sem cache HTTP.
   - Sem internet: usa a última cópia guardada.
   - Pré-cache tolerante: um arquivo ausente não impede a instalação da versão nova. */
var VERSAO = '2gather-v39-sync32';
var PRECACHE = ['./', './index.html', './manifest.webmanifest', './config.js', './app.js', './icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) {
      return fetch(u, { cache: 'no-store' }).then(function (r) { if (r && r.ok) return c.put(u, r); }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (x) { return x !== VERSAO; }).map(function (x) { return caches.delete(x); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING' || (e.data && e.data.tipo === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin !== location.origin) return;                     // Supabase, mapas, CDNs: direto, sem interferência
  var codigo = req.mode === 'navigate' || /\.(html|js|css|json|webmanifest)$/i.test(u.pathname) || u.pathname.endsWith('/');
  var busca = codigo ? fetch(req, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(busca.then(function (r) {
    if (r && r.ok && r.type === 'basic') { var c2 = r.clone(); caches.open(VERSAO).then(function (c) { c.put(req, c2); }); }
    return r;
  }).catch(function () {
    return caches.match(req).then(function (m) {
      return m || caches.match(req, { ignoreSearch: true }).then(function (m2) {
        return m2 || (req.mode === 'navigate' ? caches.match('./index.html') : undefined);
      });
    });
  }));
});

/* Toque na notificação: abre o app e leva aos avisos */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) { l[i].postMessage({ tipo: 'ABRIR' }); if ('focus' in l[i]) return l[i].focus(); }
    return self.clients.openWindow('./');
  }));
});
