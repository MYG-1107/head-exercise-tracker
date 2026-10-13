/* Static app-shell cache only. No camera frames or session data are cached. */
'use strict';
const CACHE_NAME = 'head-exercise-tracker-shell-v2.4.0';
const APP_FILES = [
  './', './index.html', './style.css', './script.js', './tracker-core.js',
  './favicon.svg', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './guide.html', './privacy.html', './safety.html', './social-card.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('head-exercise-tracker-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => {
      const cached = await caches.match(request, { ignoreSearch: true });
      return cached || caches.match('./index.html');
    }));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
