const CACHE_NAME = "rice-os-stable-pwa1";

const APP_SHELL = [
  "./",
  "./index.html?v=20260623_pwa1",
  "./mobile.html?v=20260623_pwa1",
  "./manifest.webmanifest?v=20260623_pwa1",
  "./assets/css/app.css?v=20260623_pwa1",
  "./assets/js/core/utils.js?v=20260623_pwa1",
  "./assets/js/core/schema.js?v=20260623_pwa1",
  "./assets/js/core/storage.js?v=20260623_pwa1",
  "./assets/js/core/state.js?v=20260623_pwa1",
  "./assets/js/core/weather.js?v=20260623_pwa1",
  "./assets/js/core/pwa.js?v=20260623_pwa1",
  "./assets/js/screens/home.js?v=20260623_pwa1",
  "./assets/js/screens/recipes.js?v=20260623_pwa1",
  "./assets/js/screens/fields.js?v=20260623_pwa1",
  "./assets/js/screens/field-work.js?v=20260623_pwa1",
  "./assets/js/screens/growth.js?v=20260623_pwa1",
  "./assets/js/screens/photos.js?v=20260623_pwa1",
  "./assets/js/screens/other-work.js?v=20260623_pwa1",
  "./assets/js/screens/annual.js?v=20260623_pwa1",
  "./assets/js/screens/materials.js?v=20260623_pwa1",
  "./assets/js/screens/results.js?v=20260623_pwa1",
  "./assets/js/screens/data.js?v=20260623_pwa1",
  "./assets/js/app.js?v=20260623_pwa1",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html?v=20260623_pwa1"))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
  );
});
