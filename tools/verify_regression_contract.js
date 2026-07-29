"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function versions(text) {
  return [...text.matchAll(/(?:ver|APP_VERSION\s*=\s*")[^\d]*(\d{8}_ver\d+|\d{8}-\d+)/g)].map((match) => match[1]);
}

function main() {
  cp.execFileSync(process.execPath, [path.join(__dirname, "verify_data_integrity.js")], { stdio: "inherit" });

  const index = read("index.html");
  const app = read("assets/js/app.js");
  const schema = read("assets/js/core/schema.js");
  const state = read("assets/js/core/state.js");
  const home = read("assets/js/screens/home.js");
  const annual = read("assets/js/screens/annual.js");
  const pwa = read("assets/js/core/pwa.js");
  const worker = read("service-worker.js");

  ["home", "fields", "calendar", "annual", "field-work", "growth", "irrigation", "data"].forEach((screen) => {
    assert(index.includes(`id=\"screen-${screen}\"`), `Baseline screen is missing: ${screen}`);
    assert(app.includes(`\"${screen}\"`), `App route is missing: ${screen}`);
  });

  ["fieldWorks", "growthLogs", "dryPeriods", "irrigations", "schedules", "fieldGroups"].forEach((key) => {
    assert(schema.includes(key), `Schema collection is missing: ${key}`);
  });
  assert(schema.includes('STORE_KEY = "rice_os_v8_stable"'), "Storage key changed without a migration plan");
  assert(state.includes("plantingDateForField"), "Planting-date resolver is missing");
  assert(state.includes("resolvedWaterPeriodsFor"), "Water-management resolver is missing");
  assert(home.includes("home-linked-flow"), "Home growth/water progress map is missing");
  assert(annual.includes("annual-year-flow-grid"), "Annual work/water flow is missing");
  assert(annual.includes("annual-year-flow-lane"), "Annual work/water lanes are missing");
  assert(index.includes('id="appBackButton"'), "Global back button is missing");

  const pwaVersion = (pwa.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  const workerVersion = (worker.match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
  assert(pwaVersion && workerVersion && pwaVersion === workerVersion, "PWA module and service worker versions differ");
  assert(index.includes(`?v=${pwaVersion}`), "Index asset versions do not match the PWA version");
  assert(!versions(index).some((version) => version !== pwaVersion), "Index contains stale versioned assets");

  console.log("PASS regression contract", JSON.stringify({ pwaVersion }));
}

main();
