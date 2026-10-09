"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const memory = new Map(); let writes = 0;
const c = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c);
const R = c.RiceOS, U = R.utils;
U.today = () => "2026-10-07"; U.now = () => "2026-10-07T00:00:00Z";
function snapshot(patch = {}) {
  return { snapshotId: "first", fieldId: "a", season: "2026", asOf: "2026-09-01", savedAt: "2026-09-01T01:00:00Z",
    headingKind: "actual", actualHeadingDate: "2026-08-01", harvestKind: "heading", harvestRange: { start: "2026-09-10", end: "2026-09-15" },
    basis: { thermalProjection: { status: "projected", asOf: "2026-09-01", headingDate: "2026-08-01", startDate: "2026-08-02", endDate: "2026-08-31",
      retrievedAt: "2026-09-01T00:00:00Z", locationKey: "37|140", range: { start: "2026-09-11", end: "2026-09-16" },
      forecastDays: 7, seasonalDays: 9, seasonalMinimumYears: 2, seasonalExpectedYears: 3,
      historical: { complete: true, count: 30, expectedDays: 30, total: 600, source: "Open-Meteo Archive (reanalysis/model)" },
      sources: { historical: ["Open-Meteo Archive"], forecast: ["Open-Meteo Forecast"], seasonal: ["Open-Meteo prior-year daily seasonal reference (reanalysis/model)"] } } }, ...patch };
}
function reset(snapshots = [snapshot()], extra = {}) {
  assert(R.state.replace(R.schema.normalize({ fields: [{ fieldId: "a" }, { fieldId: "b" }],
    growthLogs: ["a", "b"].map(fieldId => ({ fieldId, date: "2026-08-01", headingObserved: true })),
    fieldWorks: [{ workId: "h", fieldIds: ["a", "b"], workName: "稲刈り", date: "2026-09-20", harvestStatusByField: { a: "partial", b: "complete" },
      harvestTimingByField: { a: { assessment: "late", idealStartDate: "2026-09-12", idealEndDate: "2026-09-14", delayReason: "rain" },
        b: { assessment: "pending" } } }], meta: { weatherLocation: { latitude: 37, longitude: 140 }, outlookSnapshots: snapshots }, ...extra })));
}
function read(field = "a") {
  const before = JSON.stringify([R.state.data(), [...memory], writes]);
  const rows = R.state.harvestForecastComparisonFor(field);
  assert.equal(JSON.stringify([R.state.data(), [...memory], writes]), before); return rows[0];
}
reset(); let row = read();
assert.equal(row.harvestStatus, "partial"); assert.equal(row.dayComparison.actual.days, 5); assert.equal(row.dayComparison.actual.label, "日程差");
assert.equal(row.dayComparison.ideal.days, 0); assert.equal(row.dayComparison.ideal.label, "見立て期間と重なる");
assert.equal(row.thermalComparison.actual.days, 4);
assert.equal(read("b").forecast, null); assert.equal(read("b").idealStartDate, "");
row.forecast.harvestRange.start = "changed"; assert.equal(read().forecast.harvestRange.start, "2026-09-10");
for (const patch of [
  { savedAt: "2026-09-20T00:00:00Z" }, { savedAt: "2026-09-19T15:00:00Z" },
  { savedAt: "2026-09-21T00:00:00Z" }, { savedAt: "2026-02-30T00:00:00Z" },
  { savedAt: "2026-09-01" }, { asOf: "2026-09-20" }, { asOf: "2026-09-02" },
  { actualHarvestDate: "2026-09-20" }, { harvestKind: "actual" }, { season: "2025" }
]) { reset([snapshot(patch)]); assert.equal(read().forecast, null); assert.equal(read().dayComparison.actual, null); }
reset([snapshot(), snapshot({ snapshotId: "later", asOf: "2026-09-02", savedAt: "2026-09-02T00:00:00Z" }),
  snapshot({ snapshotId: "tie-last", asOf: "2026-09-02", savedAt: "2026-09-02T00:00:00Z" })]);
assert.equal(read().forecast.snapshotId, "tie-last");
reset([snapshot({ actualHeadingDate: "2026-08-02" })]); assert.equal(read().dayComparison.actual, null);
reset([snapshot({ headingKind: "panicle", actualHeadingDate: "" })]); assert(read().dayComparison.reason.includes("推定"));
reset(); R.state.data().meta.weatherLocation.latitude = 38;
assert.equal(read().dayComparison.available, true); assert.equal(read().thermalComparison.reason, "現在の気象設定と異なる");
for (const mutate of [t => { t.historical.count = 1; }, t => { t.status = "future-missing"; },
  t => { t.retrievedAt = "2026-09-02T00:00:00Z"; }, t => { t.sources.historical = ["fake"]; },
  t => { t.sources.seasonal = []; }, t => { t.forecastDays = -1; t.seasonalDays = 0; },
  t => { t.forecastDays = 8; }, t => { t.seasonalDays = 8; },
  t => { t.seasonalMinimumYears = 0; }, t => { t.seasonalMinimumYears = 4; },
  t => { t.seasonalExpectedYears = 6; }, t => { t.sources.forecast = ["fake forecast"]; }]) {
  const s = snapshot(); mutate(s.basis.thermalProjection); reset([s]);
  assert.equal(read().dayComparison.available, true); assert.equal(read().thermalComparison.actual, null);
}
reset([snapshot({ harvestRange: { start: "2026-09-21", end: "2026-09-25" } })]);
assert.equal(read().dayComparison.actual.days, -1); assert.equal(read().dayComparison.ideal.days, -7);
const persisted = JSON.stringify(R.state.data()); assert(R.state.replace(JSON.parse(persisted))); assert.equal(JSON.stringify(R.state.data()), persisted);
assert.equal(read().dayComparison.actual.days, -1);
const forecastOnly = snapshot();
Object.assign(forecastOnly.basis.thermalProjection, { range: { start: "2026-09-03", end: "2026-09-05" },
  forecastDays: 5, seasonalDays: 0, seasonalMinimumYears: 0, seasonalExpectedYears: 0 });
forecastOnly.basis.thermalProjection.sources.seasonal = [];
reset([forecastOnly]); assert.equal(read().thermalComparison.available, true);
const historicalOnly = snapshot();
Object.assign(historicalOnly.basis.thermalProjection, { range: { start: "2026-08-29", end: "2026-08-31" },
  forecastDays: 0, seasonalDays: 0, seasonalMinimumYears: 0, seasonalExpectedYears: 0 });
historicalOnly.basis.thermalProjection.sources.forecast = [];
historicalOnly.basis.thermalProjection.sources.seasonal = [];
reset([historicalOnly]); assert.equal(read().thermalComparison.available, true);
console.log("harvest forecast comparison: PASS");
