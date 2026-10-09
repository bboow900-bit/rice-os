"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map(); let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("fail"); memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state", "agro"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const R = context.RiceOS; const { state, schema, utils: U } = R;
let today = "2026-09-20"; U.today = () => today;
const json = value => JSON.stringify(value);
const work = () => state.data().fieldWorks[0];
const timing = () => work().harvestTimingByField.a;
const thermal = () => timing().thermal;
const raw = () => json([state.data(), [...memory]]);
let calls = 0;
const archive = (date, tempMean = 20, extra = {}) => ({ date, tempMean, source: "Open-Meteo Archive", dataset: "Open-Meteo Archive", ...extra });
function completeRows(start, end) {
  const rows = []; for (let day = start; day <= end; day = U.dateAddDays(day, 1)) rows.push(archive(day)); return rows;
}
function reset(patch = {}, dataPatch = {}) {
  today = "2026-09-20"; calls = 0;
  assert(state.replace(schema.normalize({ fields: [{ fieldId: "a", name: "A" }, { fieldId: "b" }],
    growthLogs: [{ logId: "g", fieldId: "a", date: "2026-09-01", headingObserved: true }],
    meta: { weatherLocation: { latitude: 37, longitude: 140, label: "Test location" } }, ...dataPatch })));
  assert(state.saveFieldWork({ workId: "h", date: "2026-09-10", fieldIds: ["a"], workName: "稲刈り", harvestStatusByField: { a: "complete" },
    harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", thermal: { total: 123, status: "確定" } }],
    harvestTimingByField: { a: { assessment: "appropriate", idealStartDate: "2026-09-09", idealEndDate: "2026-09-11", ...patch } } }));
  R.weather = { fetchDailyRange: async (start, end) => { calls++; return { rows: completeRows(start, end), retrievedAt: "retrieved" }; } };
}
async function main() {
  reset(); const actual = json(work().harvestSnapshots); const evaluatedAt = timing().evaluatedAt;
  assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "saved");
  assert.equal(thermal().startDate, "2026-09-02");
  assert.equal(thermal().endpoints[0].total, 160); assert.equal(thermal().endpoints[1].total, 200);
  assert.equal(thermal().endpoints[0].count, 8); assert.equal(thermal().endpoints[1].expectedDays, 10);
  assert(thermal().endpoints.every(row => row.status === "complete"));
  assert.equal(thermal().source, "Open-Meteo Archive (reanalysis/model)");
  assert.equal(timing().evaluatedAt, evaluatedAt); assert.equal(json(work().harvestSnapshots), actual);
  assert(state.harvestTimingThermalIsCurrent("h", "a"));
  const stable = raw(); assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "unchanged"); assert.equal(raw(), stable); assert.equal(calls, 1);
  assert(state.replace(JSON.parse(json(state.data())))); assert.equal(thermal().endpoints[1].total, 200);
  const savedThermal = json(thermal());
  assert(state.saveFieldWork({ ...work(), harvestTimingByField: { a: { memo: "only memo", thermal: { endpoints: [{ date: "fake", total: 999 }] } } } }));
  assert.equal(json(thermal()), savedThermal);
  assert(state.saveFieldWork({ ...work(), harvestTimingByField: { a: { idealEndDate: "2026-09-12" } } })); assert(!timing().thermal);
  reset(); R.weather.fetchDailyRange = async () => ({ rows: [archive("2026-09-02", 10), archive("2026-09-02", 99),
    archive("2026-09-03", 20, { dataset: "Forecast" }), archive("2026-09-04", "30"), archive("2026-09-05", NaN),
    archive("2026-09-06", Infinity), archive("2026-09-07", 0), archive("2026-09-08", -2), archive("2026-02-30", 20),
    archive("2026-09-01", 20), archive("2026-09-12", 20), archive("2026-09-09", 20, { source: "Open-Meteo Forecast" })] });
  await state.retryHarvestTimingThermal("h", "a");
  assert.equal(thermal().endpoints[0].count, 3); assert.equal(thermal().endpoints[0].total, 8); assert.equal(thermal().endpoints[0].status, "missing");
  reset(); R.weather.fetchDailyRange = async () => ({ rows: [] }); await state.retryHarvestTimingThermal("h", "a");
  assert.equal(thermal().endpoints[0].total, ""); assert.equal(thermal().endpoints[0].count, 0);
  reset(); R.weather.fetchDailyRange = async () => ({ rows: completeRows("2026-09-02", "2026-09-09") });
  await state.retryHarvestTimingThermal("h", "a"); const completeEndpoint = json(thermal().endpoints[0]);
  R.weather.fetchDailyRange = async () => { throw Error("retry fail"); };
  await state.retryHarvestTimingThermal("h", "a"); assert.equal(json(thermal().endpoints[0]), completeEndpoint);
  assert.equal(thermal().endpoints[1].status, "missing"); assert.equal(thermal().endpoints[1].count, 8);
  reset(); R.weather.fetchDailyRange = async () => ({ rows: [archive("2026-09-02", 20)] });
  await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints[0].total, 20); assert.equal(thermal().endpoints[0].count, 1);
  const oneDayPartial = raw(); R.weather.fetchDailyRange = async () => { throw Error("one-day partial retry fails"); };
  assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "unchanged"); assert.equal(raw(), oneDayPartial);
  reset(); R.weather.fetchDailyRange = async () => ({ rows: completeRows("2026-09-02", "2026-09-04") });
  await state.retryHarvestTimingThermal("h", "a"); const partialBefore = raw();
  R.weather.fetchDailyRange = async () => { throw Error("partial retry fails"); };
  assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "unchanged"); assert.equal(raw(), partialBefore);
  R.weather.fetchDailyRange = async () => ({ rows: completeRows("2026-09-02", "2026-09-03") });
  assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "unchanged"); assert.equal(raw(), partialBefore);
  R.weather.fetchDailyRange = async () => ({ rows: [] });
  assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "unchanged"); assert.equal(raw(), partialBefore);
  R.weather.fetchDailyRange = async () => ({ rows: completeRows("2026-09-02", "2026-09-05") });
  await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints[0].count, 4);
  reset(); R.weather.fetchDailyRange = async () => { throw Error("fetch fail"); }; await state.retryHarvestTimingThermal("h", "a");
  assert.equal(thermal().endpoints[0].status, "fetch-failed");
  reset({ assessment: "early", idealStartDate: "2026-09-20", idealEndDate: "2026-09-21" });
  await state.retryHarvestTimingThermal("h", "a"); assert.equal(calls, 0); assert(thermal().endpoints.every(row => row.status === "future" && row.total === ""));
  assert(state.harvestTimingThermalIsCurrent("h", "a")); today = "2026-09-21"; assert(!state.harvestTimingThermalIsCurrent("h", "a"));
  for (const assessment of ["early", "late", "pending", ""]) {
    reset({ assessment, idealStartDate: "", idealEndDate: "" }); await state.retryHarvestTimingThermal("h", "a");
    assert.equal(thermal().endpoints.length, 0); assert.equal(calls, 0);
  }
  reset({ idealStartDate: "", idealEndDate: "" }); await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints[0].date, "2026-09-10");
  reset({ assessment: "pending", idealStartDate: "2026-09-09", idealEndDate: "2026-09-09" }); await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints.length, 1);
  reset({}, { growthLogs: [] }); await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints[0].status, "no-heading"); assert(state.harvestTimingThermalIsCurrent("h", "a"));
  reset({}, { meta: {} }); await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints[0].status, "no-location"); assert(state.harvestTimingThermalIsCurrent("h", "a"));
  reset({ assessment: "pending", idealStartDate: "2026-08-01", idealEndDate: "" }); await state.retryHarvestTimingThermal("h", "a"); assert.equal(thermal().endpoints[0].status, "invalid-range");
  reset(); const aborted = { aborted: true }; const abortBefore = raw(); assert.equal((await state.retryHarvestTimingThermal("h", "a", { signal: aborted })).status, "cancelled"); assert.equal(raw(), abortBefore);
  for (const change of [
    () => state.saveFieldWork({ ...work(), memo: "concurrent edit" }),
    () => state.deleteFieldWork("h"),
    () => state.saveFieldWork({ ...work(), fieldIds: ["b"], harvestStatusByField: { b: "complete" }, harvestTimingByField: {} }),
    () => state.saveGrowthLog({ logId: "g", fieldId: "a", date: "2026-09-02", headingObserved: true }),
    () => state.updateWeatherLocation({ latitude: 38, longitude: 140, label: "Test location" }),
    () => state.updateField("a", { name: "Changed field" })
  ]) {
    reset(); let resolve; R.weather.fetchDailyRange = () => new Promise(r => { resolve = r; });
    const promise = state.retryHarvestTimingThermal("h", "a"); assert(change()); const changed = raw();
    resolve({ rows: completeRows("2026-09-02", "2026-09-11") }); assert.equal((await promise).status, "not_saved"); assert.equal(raw(), changed);
  }
  reset(); let resolve; const signal = { aborted: false }; R.weather.fetchDailyRange = () => new Promise(r => { resolve = r; });
  const promise = state.retryHarvestTimingThermal("h", "a", { signal }); const beforeAbort = raw(); signal.aborted = true; resolve({ rows: [] });
  assert.equal((await promise).status, "cancelled"); assert.equal(raw(), beforeAbort);
  reset(); await state.retryHarvestTimingThermal("h", "a"); assert(state.harvestTimingThermalIsCurrent("h", "a"));
  assert(state.updateWeatherLocation({ latitude: 38, longitude: 140, label: "Test location" })); assert(!state.harvestTimingThermalIsCurrent("h", "a")); assert(thermal());
  for (const corrupt of [{ count: 0 }, { count: 1, expectedDays: 1, total: 20 }, { count: 8, expectedDays: 9 }, { count: 200, expectedDays: 200 }, { date: "2026-02-30" }]) {
    reset(); await state.retryHarvestTimingThermal("h", "a");
    const imported = JSON.parse(json(state.data()));
    Object.assign(imported.fieldWorks[0].harvestTimingByField.a.thermal.endpoints[0], corrupt);
    imported.fieldWorks[0].harvestTimingByField.a.thermal.asOf = "2026-09-19";
    assert(state.replace(imported)); assert(!state.harvestTimingThermalIsCurrent("h", "a"));
    assert.notEqual(thermal().endpoints[0].status, "complete");
    assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "saved");
    assert.equal(thermal().endpoints[0].count, 8); assert.equal(thermal().endpoints[0].status, "complete");
  }
  reset(); const beforeFail = raw(); fail = true; assert.equal((await state.retryHarvestTimingThermal("h", "a")).status, "not_saved"); fail = false; assert.equal(raw(), beforeFail);
  console.log("verify_harvest_timing_thermal: PASS archive-only sums, partial/waiting, invalidation, freshness, race/abort, JSON, rollback");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
