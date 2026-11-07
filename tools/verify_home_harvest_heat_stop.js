"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = file => fs.readFileSync(`assets/js/${file}`, "utf8");
let today = "2026-10-10", status = "complete", harvestDate = "2026-10-03";
let headingDate = "2026-10-01", planting = "2026-10-01", verified = false;
const field = { fieldId: "a", name: "Field A", varietyId: "v", areaA: 10 };
const data = { meta: {}, fieldWorks: [{ workId: "h", date: harvestDate, fieldIds: ["a"], harvestSnapshots: [] }] };
const queries = [], fetches = [];
const state = {
  data: () => data,
  harvestStatusForField(id, year, date) {
    queries.push({ id, year, date });
    return { status, date: harvestDate, workIds: ["h"] };
  },
  isHarvestThermalComplete: () => verified,
  plantingDateForField: () => planting,
  growthSummaryFor: () => ({ headingDate, panicleLog: null }),
  variety: () => ({ name: "Variety" }),
  activeFields: () => [field]
};
const context = vm.createContext({ window: { RiceOS: { state } }, console,
  document: { querySelector: () => null, querySelectorAll: () => [] }, CSS: { escape: String } });
vm.runInContext(read("core/utils.js"), context);
const R = context.window.RiceOS;
R.utils.today = () => today;
let homeSource = read("screens/home.js");
homeSource = homeSource.replace("RiceOS.screens.home = { render, bind };",
  "RiceOS.screens.home = { render, bind, homeStageHeat, renderHeatMeter, renderRipeningHeatMeter, heatCacheKey, heatCache, accumulatedFromRows, harvestHeatContext, hydrateHeatMeters };");
vm.runInContext(homeSource, context);
const H = R.screens.home;
const rows = [1, 2, 3, 4, 9, 10, 11].map(day => ({ date: `2026-10-${String(day).padStart(2, "0")}`, tempMean: 20, source: "Open-Meteo Archive" }));
const cache = { rows, total: 9999, count: 999, projectionRows: [{ date: "2026-10-12", tempMean: 100 }] };
const setCache = value => H.heatCache.set(H.heatCacheKey(field, planting, today), value);
setCache(cache);
const original = JSON.stringify(data);
assert.equal(H.homeStageHeat(field, today).title, "40℃");
assert.match(H.homeStageHeat(field, today).note, /収穫時積算/);
let html = H.renderHeatMeter(field);
assert.match(html, /<strong>60℃<\/strong>/);
assert.match(html, /<strong>40℃<\/strong>/);
assert(!html.includes("9999℃"));
assert(!html.includes("予測:"));
assert(!html.includes("あと"));
assert.match(html, /収穫時の積算気温/);
today = "2026-10-20"; setCache(cache);
assert.equal(H.homeStageHeat(field, today).title, "40℃", "Post-harvest days never increase any displayed total");
today = "2026-10-10";

for (const openStatus of ["partial", "legacy", "none"]) {
  status = openStatus; setCache(cache);
  assert.equal(H.homeStageHeat(field, today).title, "80℃", `${openStatus} keeps accumulating through yesterday`);
}
status = "complete";
harvestDate = "2026-10-11"; setCache(cache);
assert.equal(H.harvestHeatContext(field, today).completed, false);
assert.equal(H.homeStageHeat(field, today).title, "80℃", "Future completion is not a cutoff");
harvestDate = "2025-10-03";
assert.equal(H.harvestHeatContext(field, today).completed, false, "Another season is not a cutoff");
harvestDate = "2026-10-03";

const thermal = { headingDate, startDate: "2026-10-02", endDate: harvestDate, total: 55, count: "2", expectedDays: "2" };
data.fieldWorks[0].harvestSnapshots = [{ fieldId: "a", harvestDate, thermal }];
verified = true;
setCache({ error: "offline" });
const withSnapshot = JSON.stringify(data);
assert.equal(H.homeStageHeat(field, today).title, "55℃", "Verified snapshot works offline");
assert.match(H.renderHeatMeter(field), /<strong>55℃<\/strong>/);
assert.match(H.homeStageHeat(field, today).note, /保存済み/);
verified = false; setCache(cache);
assert.equal(H.homeStageHeat(field, today).title, "40℃", "Unverified/stale snapshot falls back to bounded rows");
verified = true;
thermal.headingDate = "2026-09-30";
assert.equal(H.homeStageHeat(field, today).title, "40℃", "Heading mismatch is not reused");
thermal.headingDate = headingDate;
thermal.endDate = "2026-10-04";
assert.equal(H.homeStageHeat(field, today).title, "40℃", "End-date mismatch is not reused");
thermal.endDate = harvestDate;
assert.equal(JSON.stringify(data), withSnapshot);
data.fieldWorks[0].harvestSnapshots = []; verified = false;
assert.equal(JSON.stringify(data), original);

setCache({ error: "offline" });
assert.equal(H.homeStageHeat(field, today).title, "気温取得失敗");
headingDate = "";
assert.equal(H.homeStageHeat(field, today).title, "出穂日未登録", "Input shortage differs from network failure");
headingDate = "2026-10-01";
status = "partial"; planting = "";
assert.equal(H.homeStageHeat(field, today).title, "田植日未登録");
status = "complete"; planting = "2026-10-01";

setCache({ rows: [{ date: "2026-10-02", tempMean: 20 }, { date: "2026-10-03", tempMean: null }] });
assert.equal(H.homeStageHeat(field, today).title, "20℃");
assert.match(H.homeStageHeat(field, today).note, /一部欠測/);
setCache({ rows: [{ date: "2026-10-02", tempMean: " " }] });
assert.equal(H.homeStageHeat(field, today).title, "気温データなし", "Missing is not zero");
assert.equal(H.accumulatedFromRows([{ date: "2026-10-02", tempMean: 0 }], "2026-10-02", harvestDate).total, 0);
assert.equal(H.accumulatedFromRows([
  { date: "2026-10-02", tempMean: 20 }, { date: "2026-10-02", tempMean: 20 },
  { date: "2026-10-03", tempMean: 20, source: "Open-Meteo Forecast" }
], "2026-10-02", harvestDate).total, "");

const fieldsSource = read("screens/fields.js");
const start = fieldsSource.indexOf("  function fieldStage(field) {");
const end = fieldsSource.indexOf("  function latestPhotoForField", start);
const F = vm.createContext({ RiceOS: { agro: { seasonStageForField: () => ({ index: 12, image: 8, current: { label: "成熟期" }, certainty: "推定" }) } }, state, U: R.utils, currentSeasonYear: () => "2026" });
vm.runInContext(fieldsSource.slice(start, end), F);
assert.equal(F.fieldStage(field).label, "収穫済み");
assert.equal(F.fieldStage(field).harvestDate, harvestDate);
for (const other of ["partial", "legacy", "none"]) { status = other; assert.equal(F.fieldStage(field).label, "成熟期"); }
status = "complete";
assert(fieldsSource.includes('stage.harvestDate ? "現在の状態"'));
assert(queries.every(q => String(q.year) === String(q.date).slice(0, 4)));

(async () => {
  H.heatCache.clear();
  R.weather = {
    ensureLocation: async () => ({ latitude: 37, longitude: 140 }),
    fetchDailyRange: async (start, end) => { fetches.push({ start, end }); return { rows }; }
  };
  // Isolate only unrelated dashboard field selection, keeping the async fetch path intact.
  const fieldsAt = homeSource.indexOf("  function fields() {");
  const fieldsEnd = homeSource.indexOf("  function ", fieldsAt + 3);
  const asyncContext = vm.createContext({ window: { RiceOS: R }, document: { querySelector: () => null, querySelectorAll: () => [] }, CSS: { escape: String }, console });
  vm.runInContext(homeSource.slice(0, fieldsAt) + "  function fields() { return state.activeFields(); }\n" + homeSource.slice(fieldsEnd), asyncContext);
  await R.screens.home.hydrateHeatMeters();
  assert.deepEqual(fetches, [{ start: planting, end: harvestDate }], "Completed fields fetch only through harvest, without forecast");
  assert.equal(JSON.stringify(data), original, "Rendering and hydration never write business records");
  console.log("PASS home harvest heat stop: all displays, verified snapshot, partial/legacy, future/year guards, missing/duplicate rows, fetch cutoff, fields labels and no writes");
})().catch(error => { console.error(error); process.exitCode = 1; });
