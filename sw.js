// Service worker: deja la app funcionando sin internet.
// Siempre pide la versión más reciente a internet y solo usa lo guardado si no hay conexión.
// Para publicar una versión nueva: cambia CACHE aquí, VERSION en app.js y ?v= en index.html (y en ASSETS).
var CACHE = 'fitness-v7';
var ASSETS = ['./', 'index.html', 'style.css?v=7', 'logic.js?v=7', 'app.js?v=7', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(u, { cache: 'reload' }).then(function (r) { if (r.ok) return c.put(u, r); });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // "no-cache": pregunta siempre a internet si hay algo nuevo, ignorando los 10 minutos de caché de GitHub Pages.
  var req = new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' });
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
