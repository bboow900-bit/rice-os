const CACHE_NAME = "rice-karte-20261114-319";
const APP_VERSION = "20261114_ver319";
const CACHE_PREFIX = "rice-karte-";
const RETAINED_APP_CACHES = 2;

const APP_SHELL = [
  `./assets/css/harvest-reflection.css?v=${APP_VERSION}`,
  `./assets/js/core/harvest-review.js?v=${APP_VERSION}`,
  "./",
  `./index.html?v=${APP_VERSION}`,
  `./mobile.html?v=${APP_VERSION}`,
  `./manifest.webmanifest?v=${APP_VERSION}`,
  `./assets/css/app.css?v=${APP_VERSION}`,
  `./assets/css/field-management.css?v=${APP_VERSION}`,
  `./assets/css/pop-shell.css?v=${APP_VERSION}`,
  `./assets/css/home-pop.css?v=${APP_VERSION}`,
  `./assets/css/annual-pop.css?v=${APP_VERSION}`,
  `./assets/css/herbicide-master.css?v=${APP_VERSION}`,
  `./assets/css/material-purchases.css?v=${APP_VERSION}`,
  `./assets/css/field-herbicide.css?v=${APP_VERSION}`,
  `./assets/css/backup-center.css?v=${APP_VERSION}`,
  `./assets/js/core/backup-export.js?v=${APP_VERSION}`,
  `./assets/css/materials-ledger.css?v=${APP_VERSION}`,
  `./assets/css/seeder-settings.css?v=${APP_VERSION}`,
  `./assets/css/review-ledger.css?v=${APP_VERSION}`,
  `./assets/css/readable-ledgers.css?v=${APP_VERSION}`,
  `./assets/css/annual-story.css?v=${APP_VERSION}`,
  `./assets/css/review-unified.css?v=${APP_VERSION}`,
  "./assets/images/annual-story/annual-story-panicle.png",
  "./assets/images/annual-story/annual-story-heading.png",
  "./assets/images/annual-story/annual-story-harvest.png",
  `./assets/css/season-theme.css?v=${APP_VERSION}`,
  `./assets/css/ui-rhythm.css?v=${APP_VERSION}`,
  `./assets/css/annual-review-ui.css?v=${APP_VERSION}`,
  `./assets/js/ui/season-theme.js?v=${APP_VERSION}`,
  `./assets/js/core/seeder-settings.js?v=${APP_VERSION}`,
  `./assets/js/screens/seeder-settings.js?v=${APP_VERSION}`,
  `./assets/js/core/material-purchases.js?v=${APP_VERSION}`,
  `./assets/js/core/material-stock.js?v=${APP_VERSION}`,
  `./assets/js/core/material-insights.js?v=${APP_VERSION}`,
  `./assets/js/core/material-quantities.js?v=${APP_VERSION}`,
  `./assets/js/core/material-planning.js?v=${APP_VERSION}`,
  `./assets/js/core/cultivation.js?v=${APP_VERSION}`,
  `./assets/js/core/harvest-ledger.js?v=${APP_VERSION}`,
  `./assets/js/screens/harvest-ledger.js?v=${APP_VERSION}`,
  `./assets/js/ui/season-art.js?v=${APP_VERSION}`,
  "./assets/images/ui-pop/rice-sowing.png",
  "./assets/images/ui-pop/rice-growing.png",
  "./assets/images/ui-pop/rice-processing.png",
  "./assets/images/ui-pop/rice-winter.png",
  "./assets/images/ui-pop/harvest-rice.png",
  "./assets/images/ui-pop/rice-transplanter.png",
  "./assets/images/ui-pop/rice-combine.png",
  "./assets/images/rice-hero-karte2.jpg",
  "./assets/images/menu-icons/field-master.png",
  "./assets/images/menu-icons/recipe.png",
  "./assets/images/menu-icons/transplanter.png",
  "./assets/images/menu-icons/dry-period.png",
  "./assets/images/menu-icons/photos.png",
  "./assets/images/menu-icons/irrigation.png",
  "./assets/images/menu-icons/materials.png",
  "./assets/images/menu-icons/maintenance.png",
  "./assets/images/menu-icons/herbicide-program.png",
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
  "./assets/images/light-icons/farm-calendar.png",
  "./assets/images/light-icons/farm-masters.png",
  "./assets/images/light-icons/rice-sack.png",
  "./assets/images/light-icons/mowing-worker.png",
  "./assets/images/light-icons/dry-paddy.png",
  "./assets/images/light-icons/spraying-worker.png",
  "./assets/images/light-icons/tractor-puddling.png",
  `./assets/js/core/utils.js?v=${APP_VERSION}`,
  `./assets/js/core/schema.js?v=${APP_VERSION}`,
  `./assets/js/core/storage.js?v=${APP_VERSION}`,
  `./assets/js/core/state.js?v=${APP_VERSION}`,
  `./assets/js/core/herbicide.js?v=${APP_VERSION}`,
  `./assets/js/core/agro.js?v=${APP_VERSION}`,
  `./assets/js/core/outlook.js?v=${APP_VERSION}`,
  `./assets/js/core/record-actions.js?v=${APP_VERSION}`,
  `./assets/js/core/calendar.js?v=${APP_VERSION}`,
  `./assets/js/core/alerts.js?v=${APP_VERSION}`,
  `./assets/js/core/weather.js?v=${APP_VERSION}`,
  `./assets/js/core/harvest-weather.js?v=${APP_VERSION}`,
  `./assets/js/core/navigation.js?v=${APP_VERSION}`,
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
  `./assets/js/screens/herbicide.js?v=${APP_VERSION}`,
  `./assets/js/screens/materials.js?v=${APP_VERSION}`,
  `./assets/js/screens/results.js?v=${APP_VERSION}`,
  `./assets/js/screens/harvest-performance.js?v=${APP_VERSION}`,
  `./assets/js/screens/notices.js?v=${APP_VERSION}`,
  `./assets/js/screens/outlook.js?v=${APP_VERSION}`,
  `./assets/js/screens/machines.js?v=${APP_VERSION}`,
  `./assets/js/screens/tractor-settings.js?v=${APP_VERSION}`,
  `./assets/js/screens/transplanter-settings.js?v=${APP_VERSION}`,
  `./assets/js/screens/data.js?v=${APP_VERSION}`,
  `./assets/js/app.js?v=${APP_VERSION}`,
  `./assets/js/screens/shipments.js?v=${APP_VERSION}`,
  "./assets/icons/rice-sun-v1-32.png",
  "./assets/icons/rice-sun-v1-180.png",
  "./assets/icons/rice-sun-v1-192.png",
  "./assets/icons/rice-sun-v1-512.png"
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
      .then((keys) => {
        // Keep one known-good offline shell while a new release takes over.
        const previousCaches = keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .sort()
          .reverse();
        const retainedCaches = new Set([CACHE_NAME, ...previousCaches.slice(0, RETAINED_APP_CACHES - 1)]);
        return keys.filter((key) => key.startsWith(CACHE_PREFIX) && !retainedCaches.has(key));
      })
      .then((obsoleteKeys) => Promise.all(obsoleteKeys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "reload" }))
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
