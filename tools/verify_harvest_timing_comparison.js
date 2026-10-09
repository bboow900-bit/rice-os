"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map(); let writes = 0; let fetches = 0;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state", "agro"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const R = context.RiceOS; const { state, schema, utils: U } = R;
U.today = () => "2026-10-06"; R.weather = { fetchDailyRange() { fetches++; throw Error("read API must not fetch"); } };
const source = "Open-Meteo Archive (reanalysis/model)";
const location = { latitude: 37, longitude: 140, label: "Test" };
const json = value => JSON.stringify(value);
const actual = patch => ({ total: 180, count: "9", expectedDays: "9", headingDate: "2026-09-01", startDate: "2026-09-02", endDate: "2026-09-10", status: "確定", source, locationLabel: "Test", ...patch });
const ideal = patch => ({ headingDate: "2026-09-01", startDate: "2026-09-02", asOf: "2026-10-06", source,
  locationLabel: "Test", locationToken: json(location), retrievedAt: "original", endpoints: [
    { date: "2026-09-09", total: 160, count: 8, expectedDays: 8, status: "complete", source },
    { date: "2026-09-11", total: 200, count: 10, expectedDays: 10, status: "complete", source } ], ...patch });
const timing = patch => ({ assessment: "appropriate", idealStartDate: "2026-09-09", idealEndDate: "2026-09-11", memo: "evaluated",
  varietyName: "Historical reference", varietySource: "assessment-current-master", thermal: ideal(), ...patch });
const harvest = (workId, patch = {}) => ({ workId, date: "2026-09-10", workName: "稲刈り", fieldIds: ["a"],
  harvestTimingByField: { a: timing() }, harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", thermal: actual() }], ...patch });
assert(state.replace(schema.normalize({ fields: [{ fieldId: "a", varietyId: "v" }, { fieldId: "b" }],
  varieties: [{ varietyId: "v", name: "Current variety not historical" }], meta: { weatherLocation: location },
  growthLogs: [{ logId: "g", fieldId: "a", date: "2026-09-01", headingObserved: true }],
  fieldWorks: [
    harvest("old", { date: "2025-09-20", season: 2024, harvestTimingByField: undefined, harvestSnapshots: [] }),
    harvest("group", { fieldIds: ["a", "b"], harvestStatusByField: { a: "partial", b: "complete" }, harvestTimingByField: { a: timing(), b: timing({ assessment: "late", memo: "B only" }) } }),
    harvest("split", { harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", thermal: actual({ total: 40, count: "2", status: "一部欠測" }) }], harvestTimingByField: { a: timing({ thermal: ideal({ endpoints: [
      { date: "2026-09-09", total: 20, count: 1, expectedDays: 8, status: "missing", source },
      { date: "2026-09-11", total: 200, count: 10, expectedDays: 10, status: "complete", source } ] }) }) } }),
    harvest("bad-total", { harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", thermal: actual({ total: "", count: 0 }) }] }),
    harvest("bad-count", { harvestStatusByField: { a: "bad" }, harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", thermal: actual({ expectedDays: 1, count: 1, headingDate: "2026-02-30", startDate: "2026/09/02" }) }] }),
    harvest("bad-date", { date: "2026-02-30" }), harvest("future", { date: "2027-09-10" }),
    harvest("plan", { workName: "稲刈り予定" }), harvest("office", { targetScope: "offField" }), harvest("other-field", { fieldIds: ["b"] })
  ] })));
function read(id = "a") {
  const before = json([state.data(), [...memory], writes]); const rows = state.harvestTimingComparisonFor(id);
  assert.equal(json([state.data(), [...memory], writes]), before); assert.equal(fetches, 0); return rows;
}
let rows = read(); assert.equal(rows.length, 5); assert.equal(rows[0].workId, "old"); assert.equal(rows[0].season, "2025");
assert.equal(rows[0].assessment, ""); assert.equal(rows[0].varietyName, ""); assert.equal(rows[0].actualThermal, null); assert.equal(rows[0].idealThermal, null);
assert.equal(rows[0].harvestStatus, "legacy");
assert(!Object.hasOwn(rows[0], "headingDate"));
const group = rows.find(row => row.workId === "group"); assert.equal(group.varietyName, "Historical reference");
assert.equal(group.harvestStatus, "partial"); assert.equal(rows.find(row => row.workId === "bad-count").harvestStatus, "unknown");
assert.equal(group.actualThermal.total, 180); assert.equal(group.actualThermal.status, "complete");
assert.equal(group.headingDate, "2026-09-01"); assert.equal(group.daysAfterHeading, 9);
assert.equal(group.idealThermal.current, true); assert.equal(group.idealThermal.endpoints[0].total, 160);
const split = rows.find(row => row.workId === "split"); assert.equal(split.actualThermal.total, 40); assert.equal(split.actualThermal.status, "missing");
assert.equal(split.idealThermal.endpoints[0].total, 20); assert.equal(split.idealThermal.endpoints[0].status, "missing");
assert.equal(split.idealThermal.endpoints[1].total, 200);
for (const id of ["bad-total", "bad-count"]) {
  assert.equal(rows.find(row => row.workId === id).actualThermal.total, "");
  assert.equal(rows.find(row => row.workId === id).actualThermal.count, 0);
  assert.equal(rows.find(row => row.workId === id).actualThermal.expectedDays, 0);
}
assert.equal(rows.find(row => row.workId === "bad-count").actualThermal.startDate, "");
assert.equal(rows.find(row => row.workId === "bad-count").actualThermal.headingDate, "");
assert(!Object.hasOwn(rows.find(row => row.workId === "bad-count"), "headingDate"));
assert.equal(read("b").find(row => row.workId === "group").memo, "B only");
assert.equal(read("b").find(row => row.workId === "group").harvestStatus, "complete");
assert.deepEqual(Array.from(read("missing")), []);
group.idealThermal.endpoints[0].total = 9999; assert.equal(read().find(row => row.workId === "group").idealThermal.endpoints[0].total, 160);
assert(state.updateWeatherLocation({ ...location, latitude: 38 }));
rows = read(); assert.equal(rows.find(row => row.workId === "group").actualThermal.total, 180);
assert.equal(rows.find(row => row.workId === "group").idealThermal.current, false);
assert(rows.find(row => row.workId === "group").idealThermal.endpoints.every(row => row.total === "" && row.status === "stale"));
assert(state.updateWeatherLocation(location));
assert(state.saveGrowthLog({ logId: "g", fieldId: "a", date: "2026-09-02", headingObserved: true }));
rows = read(); assert.equal(rows.find(row => row.workId === "group").actualThermal.total, 180);
assert.equal(rows.find(row => row.workId === "group").idealThermal.current, false);
assert(state.deleteFieldWork("split")); assert(!read().some(row => row.workId === "split"));
assert(state.replace(JSON.parse(json(state.data())))); read();
console.log("verify_harvest_timing_comparison: PASS records/year/group, frozen actual vs stale ideal, partial flags, deletion, detached projection, no writes/fetch");
