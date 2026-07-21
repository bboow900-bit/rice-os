const CACHE_NAME = "rice-karte-20260721-97";
const APP_VERSION = "20260721_ver97";

const APP_SHELL = [
  "./",
  `./index.html?v=${APP_VERSION}`,
  `./mobile.html?v=${APP_VERSION}`,
  `./manifest.webmanifest?v=${APP_VERSION}`,
  `./assets/css/app.css?v=${APP_VERSION}`,
  `./assets/css/field-management.css?v=${APP_VERSION}`,
  "./assets/images/rice-hero-karte2.jpg",
  "./assets/images/menu-icons/field-master.png",
  "./assets/images/menu-icons/recipe.png",
  "./assets/images/menu-icons/transplanter.png",
  "./assets/images/menu-icons/dry-period.png",
  "./assets/images/menu-icons/photos.png",
  "./assets/images/menu-icons/irrigation.png",
  "./assets/images/menu-icons/materials.png",
  "./assets/images/menu-icons/harvest.png",
  "./assets/images/rice-stages/rice-stage-01.png",
  "./assets/images/rice-stages/rice-stage-02.png",
  "./assets/images/rice-stages/rice-stage-03.png",
  "./assets/images/rice-stages/rice-stage-04.png",
  "./assets/images/rice-stages/rice-stage-05.png",
  "./assets/images/rice-stages/rice-stage-06.png",
  "./assets/images/rice-stages/rice-stage-07.png",
  "./assets/images/rice-stages/rice-stage-08.png",
  "./assets/images/rice-stages/rice-card-clump-01.png",
  "./assets/images/rice-stages/rice-card-clump-02.png",
  "./assets/images/rice-stages/rice-card-clump-03.png",
  "./assets/images/rice-stages/rice-card-clump-04.png",
  "./assets/images/rice-stages/rice-card-clump-05.png",
  "./assets/images/rice-stages/rice-card-clump-06.png",
  "./assets/images/rice-stages/rice-card-clump-07.png",
  "./assets/images/rice-stages/rice-card-clump-08.png",
  "./assets/images/rice-stages/rice-paddy-tile-01.png",
  "./assets/images/rice-stages/rice-paddy-tile-02.png",
  "./assets/images/rice-stages/rice-paddy-tile-03.png",
  "./assets/images/rice-stages/rice-paddy-tile-04.png",
  "./assets/images/rice-stages/rice-paddy-tile-05.png",
  "./assets/images/rice-stages/rice-paddy-tile-06.png",
  "./assets/images/rice-stages/rice-paddy-tile-07.png",
  "./assets/images/rice-stages/rice-paddy-tile-08.png",
  "./assets/images/light-icons/paddy-field.png",
  "./assets/images/light-icons/rice-clump.png",
  "./assets/images/light-icons/rice-panicle.png",
  "./assets/images/light-icons/seedling-tray.png",
  "./assets/images/light-icons/transplanter-light.png",
  "./assets/images/light-icons/fertilizer-bag.png",
  "./assets/images/light-icons/water-gate.png",
  "./assets/images/light-icons/water-channel.png",
  "./assets/images/light-icons/muddy-footprint.png",
  "./assets/images/light-icons/dry-cracks.png",
  "./assets/images/light-icons/karte-notebook.png",
  "./assets/images/light-icons/rice-sack.png",
  `./assets/js/core/utils.js?v=${APP_VERSION}`,
  `./assets/js/core/schema.js?v=${APP_VERSION}`,
  `./assets/js/core/storage.js?v=${APP_VERSION}`,
  `./assets/js/core/state.js?v=${APP_VERSION}`,
  `./assets/js/core/agro.js?v=${APP_VERSION}`,
  `./assets/js/core/record-actions.js?v=${APP_VERSION}`,
  `./assets/js/core/calendar.js?v=${APP_VERSION}`,
  `./assets/js/core/alerts.js?v=${APP_VERSION}`,
  `./assets/js/core/weather.js?v=${APP_VERSION}`,
  `./assets/js/core/pwa.js?v=${APP_VERSION}`,
  `./assets/js/screens/home.js?v=${APP_VERSION}`,
  `./assets/js/screens/calendar.js?v=${APP_VERSION}`,
  `./assets/js/screens/bottom-sheet.js?v=${APP_VERSION}`,
  `./assets/js/screens/recipes.js?v=${APP_VERSION}`,
  `./assets/js/screens/fields.js?v=${APP_VERSION}`,
  `./assets/js/screens/field-work.js?v=${APP_VERSION}`,
  `./assets/js/screens/fertilizer.js?v=${APP_VERSION}`,
  `./assets/js/screens/growth.js?v=${APP_VERSION}`,
  `./assets/js/screens/dry-period.js?v=${APP_VERSION}`,
  `./assets/js/screens/irrigation.js?v=${APP_VERSION}`,
  `./assets/js/screens/photos.js?v=${APP_VERSION}`,
  `./assets/js/screens/other-work.js?v=${APP_VERSION}`,
  `./assets/js/screens/annual.js?v=${APP_VERSION}`,
  `./assets/js/screens/materials.js?v=${APP_VERSION}`,
  `./assets/js/screens/results.js?v=${APP_VERSION}`,
  `./assets/js/screens/data.js?v=${APP_VERSION}`,
  `./assets/js/app.js?v=${APP_VERSION}`,
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
        .catch(() => caches.match(`./index.html?v=${APP_VERSION}`))
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url || `./index.html?v=${APP_VERSION}`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
