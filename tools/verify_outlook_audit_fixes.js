"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "..", "assets/js", name), "utf8");
const context = vm.createContext({ console });
context.window = context;
context.RiceOS = { utils: {} };
// Test-local access to the pure helper; no production global is added.
vm.runInContext(read("core/outlook.js").replace("  function median(values)", "  RiceOS.testDifference = seasonalDifference;\n  function median(values)"), context);
const diff = context.RiceOS.testDifference;
for (const [previous, current, expected] of [
  ["2025-08-01", "2026-08-01", 0],
  ["2025-08-01", "2026-07-30", -2],
  ["2025-08-01", "2026-08-03", 2],
  ["2023-08-01", "2024-08-01", 0],
  ["2024-02-29", "2025-02-28", 0],
  ["2024-02-29", "2025-03-01", 1],
  ["2025-02-28", "2024-02-29", 1],
  ["2025-02-30", "2026-03-01", ""],
  ["2025-08-01", "bad", ""], ["", "2026-08-01", ""]
]) assert.equal(diff(previous, current), expected);
assert.match(read("core/outlook.js"), /seasonalDifference\(sameField.heading, heading.date\)/);

const root = { innerHTML: "old detail" };
let syncs = 0;
let writes = 0;
const saved = { meta: {} };
context.RiceOS.utils = {
  $: id => id === "outlookDashboard" ? root : null,
  escapeHTML: String, attr: String, today: () => "2026-08-01", toast() {}
};
context.RiceOS.state = { data: () => saved, fieldGroups: () => [], saveOutlookSnapshots: () => writes++ };
context.RiceOS.outlook = { all: () => [] };
context.RiceOS.app = { syncBackButton: () => syncs++ };
// Seed the in-screen selection without changing the production export surface.
vm.runInContext(read("screens/outlook.js").replace("  function resetNavigation()", "  RiceOS.testSelectDetail = () => { selectedFieldId = 'field-a'; };\n  function resetNavigation()"), context);
const screen = context.RiceOS.screens.outlook;
context.RiceOS.testSelectDetail();
assert.equal(screen.canHandleBack(), true);
screen.resetNavigation();
assert.equal(screen.canHandleBack(), false);
assert.equal(screen.handleBack(), false);
assert.match(root.innerHTML, /outlook-list/);
assert.equal(syncs, 1);
screen.resetNavigation();
assert.equal(syncs, 2);
assert.equal(writes, 0);
assert.deepEqual(saved, { meta: {} });
let weatherCalls = 0;
saved.meta.weatherLocation = { latitude: 37.7, longitude: 140.4 };
context.RiceOS.utils.dateAddDays = () => "2026-08-07";
context.RiceOS.weather = {
  fetchDailyRange: () => { weatherCalls++; return new Promise(() => {}); },
  fetchSamePeriodAverage: () => { weatherCalls++; return new Promise(() => {}); }
};
context.RiceOS.testSelectDetail();
screen.resetNavigation();
assert.equal(weatherCalls, 0, "navigation reset must not fetch weather even with a location");
assert.match(root.innerHTML, /outlook-list/);
assert.equal(screen.canHandleBack(), false);
assert.equal(writes, 0);
screen.render();
assert.equal(weatherCalls, 2, "normal rendering retains weather loading");
console.log("PASS outlook seasonal comparison and reset rendering (isolated VM; not browser QA)");
