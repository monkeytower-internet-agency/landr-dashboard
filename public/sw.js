// Service worker stub — landr-m05.11 ships the real PWA wiring.
// Kept intentionally empty so /sw.js exists for the registration call in
// src/main.tsx without claiming any caches.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
