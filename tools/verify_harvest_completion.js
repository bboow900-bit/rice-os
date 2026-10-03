"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let failWrites = false;
const context = vm.createContext({
  console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {}, __RICEOS_TEST__: true,
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: {
    getItem: key => memory.get(key) || null,
    setItem(key, value) { if (failWrites) throw new Error("Injected failure"); memory.set(key, String(value)); },
    removeItem: key => memory.delete(key)
  }
});
context.window = context;
function load(file) { vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context); }
for (const name of ["utils", "schema", "storage", "state", "agro", "outlook"]) load(`assets/js/core/${name}.js`);
const { state, schema, agro, outlook } = context.RiceOS;
const harvest = "\u7a32\u5208\u308a";
const date = "2026-09-10";
const asOf = "2026-09-20";
const status = (id = "a", year = 2026, through = asOf) => state.harvestStatusForField(id, year, through);
const row = () => state.data().fieldWorks.find(work => work.workId === "h");
function reset(extra = {}) {
  assert(state.replace(schema.normalize({
    fields: ["a", "b", "c"].map(fieldId => ({ fieldId, name: fieldId })),
    schedules: [
      { scheduleId: "a-plan", date, title: harvest, fieldIds: ["a"] },
      { scheduleId: "b-plan", date, title: harvest, fieldIds: ["b"] },
      { scheduleId: "group-plan", date, title: harvest, fieldIds: ["a", "b"] },
      { scheduleId: "manual", date, title: harvest, fieldIds: ["c"] }
    ], ...extra
  })));
}
function save(patch = {}) {
  return state.saveFieldWork({ workId: "h", date, workName: harvest, fieldIds: ["a", "b"], ...row(), ...patch });
}
const schedule = id => state.data().schedules.find(s => s.scheduleId === id);
function failure(action) {
  const before = JSON.stringify(state.data()); const stored = JSON.stringify([...memory]);
  assert.equal(action(), null);
  assert.equal(JSON.stringify(state.data()), before); assert.equal(JSON.stringify([...memory]), stored);
}
reset();
const fieldsBefore = JSON.stringify(state.data().fields);
assert.equal(status().status, "none");
assert(state.completeSchedule("manual")); assert.equal(status("c").harvested, false);
assert(save({ sourceScheduleId: "group-plan", harvestStatusByField: { a: "partial", b: "complete" } }));
assert.equal(status().status, "partial"); assert.equal(status().harvested, false);
assert.equal(status("b").status, "complete"); assert.equal(status("b").harvested, true);
assert(!schedule("a-plan").completedAt); assert(schedule("b-plan").completedAt); assert(!schedule("group-plan").completedAt);
assert.equal(JSON.stringify(state.data().fields), fieldsBefore);
assert.equal(outlook.forField("a", { asOf }).snapshot.actualHarvestDate, "");
assert.equal(outlook.forField("b", { asOf }).snapshot.actualHarvestDate, date);
assert.notEqual(agro.seasonStageForField("a", asOf).evidenceKind, "harvest");
assert.equal(agro.seasonStageForField("b", asOf).evidenceKind, "harvest");
for (const fieldId of ["a", "b"]) assert(state.saveGrowthLog({ logId: `heading-${fieldId}`, fieldId, date: "2026-09-01", headingObserved: true }));
assert.equal(agro.criticalWaterWindow("a", asOf).active, true);
assert.equal(agro.criticalWaterWindow("b", asOf).active, false);
assert.equal(status("b", 2026, "2026-09-09").harvested, false);
assert.equal(status("b", 2025).status, "none");
assert(state.replace(JSON.parse(JSON.stringify(state.data()))));
assert.equal(status("b").status, "complete");
const snapshots = JSON.stringify(row().harvestSnapshots);
assert(save({ memo: "edit" })); assert.equal(JSON.stringify(row().harvestSnapshots), snapshots);
assert(save({ harvestStatusByField: { a: "complete", b: "complete" } }));
assert(schedule("a-plan").completedAt); assert(schedule("group-plan").completedAt);
assert(save({ harvestStatusByField: { a: "partial", b: "complete" } }));
assert(!schedule("group-plan").completedAt); assert(!schedule("a-plan").completedAt);
assert(save({ fieldIds: ["b"], harvestStatusByField: { b: "complete", a: "complete" } }));
assert.equal(status().status, "none"); assert.deepEqual(Object.keys(row().harvestStatusByField), ["b"]);
assert(save({ date: "2027-09-10" }));
assert.equal(status("b").status, "none"); assert.equal(status("b", 2027, "2027-09-20").status, "complete");
assert(state.deleteFieldWork("h")); assert.equal(status("b", 2027, "2027-09-20").status, "none");
reset();
for (const patch of [
  { harvestStatusByField: {} }, { harvestStatusByField: { a: "complete" } },
  { harvestStatusByField: { a: "bad", b: "complete" } }, { harvestStatusByField: [] },
  { harvestStatusByField: null }, { date: "2026-09-99", harvestStatusByField: { a: "complete", b: "complete" } }
]) failure(() => save(patch));
failWrites = true;
failure(() => save({ harvestStatusByField: { a: "complete", b: "complete" } }));
failWrites = false;
assert(save({ harvestStatusByField: { a: "complete", b: "complete" } }));
failWrites = true;
failure(() => save({ harvestStatusByField: { a: "partial", b: "partial" } }));
failure(() => state.deleteFieldWork("h"));
failWrites = false;
assert.equal(status().status, "complete");
reset(); assert(save());
assert.equal(status().status, "legacy"); assert.equal(status().harvested, true);
assert(!Object.prototype.hasOwnProperty.call(row(), "harvestStatusByField"));
assert(save({ memo: "legacy edit" })); assert.equal(status().status, "legacy");
assert(!Object.prototype.hasOwnProperty.call(row(), "harvestStatusByField"));
assert(save({ harvestStatusByField: { a: "partial" } }));
assert.equal(status().status, "partial"); assert.equal(status("b").status, "legacy");
assert(!schedule("group-plan").completedAt);
assert.equal(outlook.forField("b", { asOf }).harvest.label, "\u5b8c\u4e86\u533a\u5206\u672a\u78ba\u8a8d");
for (const invalid of ["not-a-date", "2026-09-99", "2026-02-29", "2026-2-01", "", null, 20260910]) {
  assert.equal(status("b", 2026, invalid).harvested, false);
  const original = row().date;
  row().date = invalid;
  assert.equal(status("b").harvested, false);
  row().date = original;
}
reset();
assert(save({ targetScope: "offField", fieldIds: [], harvestStatusByField: { a: "complete" } }));
assert.equal(status().harvested, false); assert(!row().harvestStatusByField);
assert(save({ targetScope: "field", fieldIds: ["a"], workName: harvest + "\u4e88\u5b9a", harvestStatusByField: { a: "complete" } }));
assert.equal(status().harvested, false);
const code = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/field-work.js"), "utf8");
assert.match(code, /data-harvest-field=/); assert.match(code, /harvestStatusValue\(ids\)/);
assert.match(code, /fwHarvestCompletion/); assert.match(code, /fwHarvestStatusFields/);
const annualCode = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/annual.js"), "utf8");
vm.runInContext(annualCode.replace("RiceOS.screens.annual = {", "RiceOS.harvestSummaryTest = { renderEndSeasonReflection, fieldYearRows }; RiceOS.screens.annual = {"), context);
reset(); assert(save({ harvestStatusByField: { a: "complete", b: "partial" } }));
assert(state.saveHarvestThermalSnapshots("h", [{ fieldId: "a", headingDate: "2026-08-01", startDate: "2026-08-02", endDate: date, total: 980, count: "40", expectedDays: "40", status: "saved" }]));
const savedBefore = JSON.stringify(state.data());
const renderSummary = context.RiceOS.harvestSummaryTest.renderEndSeasonReflection;
const summary = renderSummary(state.field("a"), { year: 2026, harvest: date, harvestStatus: status("a") });
assert(summary.includes("980")); assert(summary.includes("40")); assert(summary.includes(date));
assert(summary.includes("data-annual-results"));
const partialSummary = renderSummary(state.field("b"), { year: 2026, harvest: "", harvestStatus: status("b") });
assert(!partialSummary.includes('class="annual-compare-check complete"'));
assert.equal(JSON.stringify(state.data()), savedBefore);
assert.match(annualCode, /openInput\("results", "annual"\)/);
assert.match(annualCode, /navigation\.clear\(\);[\s\S]*?selectedFieldId = origin\.fieldId;[\s\S]*?RiceOS\.app\.openInput\("results", "annual"\)/);
assert(summary.includes("annual-harvest-metrics")); assert(summary.includes("annual-harvest-details"));
assert.match(summary, /<dt>収穫日<\/dt><dd>9\/10（木）<\/dd>/);
row().season = 2025;
assert(context.RiceOS.harvestSummaryTest.fieldYearRows("a", 2026).some(item => item.id === "h"));
assert(!context.RiceOS.harvestSummaryTest.fieldYearRows("a", 2025).some(item => item.id === "h"));
row().season = 2026;
load("assets/js/screens/home.js");
const originalToday = context.RiceOS.utils.today;
context.RiceOS.utils.today = () => asOf;
const heat = context.RiceOS.homeTest.renderRipeningHeatMeter(state.field("a"), { rows: [], projectionRows: [] }, "2026-05-01", 1200);
assert(heat.includes("\u53ce\u7a6b\u6e08\u307f"));
assert(!heat.includes("\u53ce\u7a6b\u9069\u671f\u8fd1\u3044"));
assert(!heat.includes("\u53ce\u7a6b\u78ba\u8a8d\u5019\u88dc"));
context.RiceOS.utils.today = originalToday;
// Execute the production transition with a destructive onClear callback.
const resultNodes = { annualYear: { value: "2026" }, rSeason: { value: "" }, rVariety: { value: "" } };
context.U = { ...context.RiceOS.utils, $: id => resultNodes[id] };
context.state = state;
const transition = annualCode.match(/  function openHarvestResults\(\) \{[\s\S]*?\n  \}/)[0];
vm.runInContext(`let selectedFieldId = "a", selectedTab = "karte", reviewView = "compare", compareFromHub = true, compareFilter = "harvest", topView = "fields";
  function yearValue() { return U.$("annualYear").value; }
  function reviewYearValue() { return yearValue() === "all" ? "2026" : yearValue(); }
  ${transition}
  globalThis.resultOrigin = () => ({ field: selectedFieldId, tab: selectedTab, review: reviewView, fromHub: compareFromHub, filter: compareFilter });`, context);
let cleared = false;
context.RiceOS.navigation = { clear() {
  cleared = true;
  vm.runInContext('selectedFieldId = ""; selectedTab = "karte"; reviewView = "overview"; compareFromHub = false; compareFilter = "work";', context);
  resultNodes.annualYear.value = "all";
} };
context.RiceOS.app = { openInput(screen, origin) {
  assert(cleared); assert.equal(screen, "results"); assert.equal(origin, "annual");
  assert.equal(context.resultOrigin().field, "a"); assert.equal(context.resultOrigin().review, "compare");
  assert.equal(resultNodes.annualYear.value, "2026");
} };
context.RiceOS.screens.results = { resetForm() { resultNodes.rSeason.value = ""; resultNodes.rVariety.value = ""; } };
vm.runInContext("openHarvestResults()", context);
assert.equal(context.resultOrigin().fromHub, true); assert.equal(context.resultOrigin().filter, "harvest");
assert.equal(resultNodes.rSeason.value, "2026"); assert.equal(resultNodes.rVariety.value, state.field("a").varietyId);
console.log("PASS harvest completion: field/year/asOf, mixed group, schedule isolation, legacy, CRUD, roundtrip, failures and snapshot retention");
