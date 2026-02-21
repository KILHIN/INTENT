/* =========================================================
   SERVICE WORKER — Intent V1
   Cache offline first
   ========================================================= */

const CACHE_NAME = "intent-v1";

const ASSETS = [
  "/INTENT/",
  "/INTENT/index.html",
  "/INTENT/style.css",
  "/INTENT/storage.js",
  "/INTENT/engine.js",
  "/INTENT/analytics.js",
  "/INTENT/events.store.js",
  "/INTENT/sessions.js",
  "/INTENT/import-export.js",
  "/INTENT/ui.js",
  "/INTENT/main.js",
  "/INTENT/manifest.json",
  "/INTENT/icon-192.png",
  "/INTENT/icon-512.png"
];

// Installation — met tout en cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation — supprime les anciens caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — cache first, réseau en fallback
self.addEventListener("fetch", event => {
  // Ne cache pas les requêtes externes (raccourcis, etc.)
  if (!event.request.url.includes("kilhin.github.io")) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Met en cache les nouvelles ressources valides
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback si hors ligne et pas en cache
        return caches.match("/INTENT/index.html");
      });
    })
  );
});
