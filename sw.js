/* Field Audio Kit — service worker
   Strategy: network-first for the page (freshest online, cached offline, 2s timeout),
   cache-first for static assets. Versioned cache; bump VERSION to force an update. */
'use strict';

var VERSION = 'v1';
var CACHE = 'fak-' + VERSION;
var NET_TIMEOUT = 2000;

// All paths relative to the SW scope (/av-tools/ on GitHub Pages).
var PRECACHE = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-192-maskable.png',
  'icon-512-maskable.png',
  'apple-touch-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE) { return caches.delete(k); }
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function fromNetwork(request, timeout) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, timeout);
    fetch(request).then(function (res) {
      clearTimeout(timer); resolve(res);
    }, function (err) {
      clearTimeout(timer); reject(err);
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) { return; }

  var isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  if (isNav) {
    // Network-first: newest page when online, cached page when offline.
    e.respondWith(
      fromNetwork(req, NET_TIMEOUT).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('index.html');
        });
      })
    );
    return;
  }

  // Static assets: cache-first, fall back to network (and cache the result).
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) { return cached; }
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});

// deploy loop verified 2026-08-24
