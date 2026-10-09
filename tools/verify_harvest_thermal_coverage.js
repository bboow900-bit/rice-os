"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const memory = new Map(); let writes = 0, fail = false;
const c = vm.createContext({ console, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("failure"); writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state", "agro"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c);
const R = c.RiceOS, U = R.utils; let today = "2026-09-20";
U.today = () => today; U.now = () => "2026-09-20T00:00:00Z";
const rows = () => Array.from({ length: 9 }, (_, i) => ({ date: U.dateAddDays("2026-09-02", i), tempMean: 20, source: "Open-Meteo Archive" }));
const work = () => R.state.data().fieldWorks[0], thermal = () => work().harvestSnapshots[0].thermal;
const raw = () => JSON.stringify([R.state.data(), [...memory], writes]);
function reset(old = { status: "確定", total: 8120, count: "999" }) {
  today = "2026-09-20";
  assert(R.state.replace(R.schema.normalize({ fields: [{ fieldId: "a" }, { fieldId: "b" }],
    meta: { weatherLocation: { latitude: 37, longitude: 140 } },
    growthLogs: [{ fieldId: "a", date: "2026-09-01", headingObserved: true }],
    fieldWorks: [{ workId: "h", date: "2026-09-10", workName: "稲刈り", fieldIds: ["a", "b"], harvestSnapshots: [
      { fieldId: "a", harvestDate: "2026-09-10", thermal: old },
      { fieldId: "b", harvestDate: "2026-09-10", thermal: { total: 999, status: "確定" } }
    ] }] })));
  R.weather = { fetchDailyRange: async () => ({ rows: rows(), total: 99999, count: 999, retrievedAt: U.now() }) };
}
async function run() {
  reset(); const sibling = JSON.stringify(work().harvestSnapshots[1]);
  const beforeRead = raw(); assert.equal(R.state.isHarvestThermalComplete("h", "a"), false); assert.equal(raw(), beforeRead);
  assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "saved");
  assert.equal(thermal().total, 180); assert.equal(thermal().count, "9"); assert.equal(thermal().coverageVersion, 1);
  assert.equal(R.state.isHarvestThermalComplete("h", "a"), true);
  assert.equal(R.state.isHarvestThermalComplete("missing", "a"), false);
  assert.equal(JSON.stringify(work().harvestSnapshots[1]), sibling);
  const stable = raw(); assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "unchanged"); assert.equal(raw(), stable);
  assert(R.state.replace(JSON.parse(JSON.stringify(R.state.data())))); assert.equal(thermal().coverageVersion, 1);
  assert.equal(thermal().locationToken, JSON.stringify({ latitude: 37, longitude: 140 }));
  assert(R.state.updateWeatherLocation({ latitude: 38, longitude: 140 }));
  assert.equal(R.state.isHarvestThermalComplete("h", "a"), false);
  assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "saved");
  assert.equal(thermal().locationToken, JSON.stringify({ latitude: 38, longitude: 140 }));
  reset({ status: "確定", total: 500, count: "9", expectedDays: "9", headingDate: "2026-09-01", startDate: "2026-09-02", endDate: "2026-09-10", source: "Open-Meteo Archive", retrievedAt: U.now() });
  R.weather.fetchDailyRange = async () => ({ rows: rows().slice(0, 2) });
  assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "saved"); assert.equal(thermal().total, 40); assert.equal(thermal().status, "一部欠測");
  const partial = raw(); R.weather.fetchDailyRange = async () => ({ rows: rows().slice(0, 1) });
  assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "not_saved"); assert.equal(raw(), partial);
  reset(); R.weather.fetchDailyRange = async () => ({ rows: Array.from({ length: 9 }, () => rows()[0]), count: 9, total: 180 });
  const duplicate = raw(); assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "not_saved"); assert.equal(raw(), duplicate);
  for (const patch of [{ source: "Open-Meteo Forecast" }, { tempMean: "20" }, { tempMean: "" }, { tempMean: null }, { tempMean: NaN }]) {
    reset(); R.weather.fetchDailyRange = async () => ({ rows: rows().map((row, i) => i ? row : { ...row, ...patch }) });
    assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "saved");
    assert.equal(thermal().count, "8"); assert.equal(thermal().status, "一部欠測");
  }
  reset(); R.weather.fetchDailyRange = async () => ({ rows: [{ ...rows()[0], date: "2026-02-30" }] });
  const invalid = raw(); assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "not_saved"); assert.equal(raw(), invalid);
  reset(); today = "2026-09-10";
  assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "saved"); assert.equal(thermal().count, "8"); assert.equal(thermal().status, "一部欠測");
  for (const context of ["heading", "location"]) {
    reset(); if (context === "heading") R.state.data().growthLogs.push({ fieldId: "a", date: "2026-09-02", headingObserved: true });
    else R.state.data().meta.weatherLocation = null;
    const before = raw(); assert.equal((await R.state.retryHarvestThermal("h", "a")).status, "not_saved"); assert.equal(raw(), before);
  }
  for (const change of ["cancel", "edit", "delete", "failure"]) {
    reset(); let resolve; R.weather.fetchDailyRange = () => new Promise(r => { resolve = r; });
    const signal = { aborted: false }, pending = R.state.retryHarvestThermal("h", "a", { signal });
    if (change === "cancel") signal.aborted = true;
    if (change === "edit") assert(R.state.saveFieldWork({ ...work(), memo: "newer" }));
    if (change === "delete") assert(R.state.deleteFieldWork("h"));
    const before = raw(); fail = change === "failure"; resolve({ rows: rows(), retrievedAt: U.now() });
    assert.notEqual((await pending).status, "saved"); fail = false; assert.equal(raw(), before);
  }
  reset(); const before = raw();
  assert.equal(R.state.saveHarvestThermalSnapshots("h", [{ fieldId: "a", status: "確定", total: 999, count: 9 }]), null);
  assert.equal(raw(), before);
  console.log("harvest thermal coverage: PASS");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
