/* Peta Aset Keluarga — service worker opsional (Fase 2).
 * Hanya menyimpan berkas aplikasi dari origin yang sama ke cache agar bisa dibuka offline.
 * Tidak pernah mengirim data pengguna; data tetap di localStorage.
 */
'use strict';
var CACHE = 'peta-aset-keluarga-1.2.0';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('peta-aset-keluarga-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return fetch(req).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function () {
      return cache.match(req, { ignoreSearch: true });
    });
  }));
});
