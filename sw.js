// Service worker tanpa cache (selalu jaringan) agar data tetap sinkron.
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => { /* biarkan request normal ke jaringan */ });