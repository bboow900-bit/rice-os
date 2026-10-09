"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const memory = new Map(); let writes = 0;
const c = vm.createContext({ console, URL, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k, v) { writes++; memory.set(k, String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state", "agro", "outlook", "weather"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c);
const R = c.RiceOS, U = R.utils;
U.today = () => "2026-08-10";
R.agro.harvestReferenceFor = () => ({ minimum: 200, maximum: 300, daysMin: 40, daysMax: 50 });
function reset(extra = {}) {
  R.state.replace(R.schema.normalize({ meta: { weatherLocation: { latitude: 37, longitude: 140 } },
    fields: [{ fieldId: "a" }], growthLogs: [{ logId: "g", fieldId: "a", date: "2026-08-01", headingObserved: true }], ...extra }));
}
const rows = Array.from({ length: 30 }, (_, i) => ({ date: U.dateAddDays("2026-08-02", i), tempMean: 20,
  basis: i < 8 ? "historical" : i < 15 ? "forecast" : "seasonal",
  source: i < 8 ? "Open-Meteo Archive" : i < 15 ? "Open-Meteo Forecast" : "Open-Meteo prior-year daily seasonal reference (reanalysis/model)",
  ...(i >= 15 ? { count: 2, expectedYears: 3 } : {}) }));
function read(data = rows, extra = {}) {
  const before = JSON.stringify([R.state.data(), writes]);
  const p = R.outlook.harvestTemperatureProjection("a", { asOf: U.today(), locationKey: "37|140", rows: data, ...extra });
  assert.equal(JSON.stringify([R.state.data(), writes]), before); return p;
}
reset(); let p = read();
assert.equal(p.status, "projected"); assert.equal(p.total, 160); assert.equal(p.receivedDays, 8); assert.equal(p.expectedDays, 8);
assert.equal(p.arrivalMinDate, "2026-08-11"); assert.equal(p.arrivalMaxDate, "2026-08-16"); assert.equal(p.forecastDays, 7);
assert.equal(read(rows.slice(1)).status, "historical-missing"); assert.equal(read(rows.slice(1)).total, 140);
assert.equal(read([...rows, rows[0]]).historical.count, 7);
assert.equal(read(rows.map((r, i) => i === 0 ? { ...r, tempMean: "" } : r)).historical.count, 7);
assert.equal(read(rows.map((r, i) => i === 0 ? { ...r, source: "Open-Meteo Forecast" } : r)).status, "historical-missing");
assert.equal(read(rows, { locationKey: "38|140" }).status, "location-mismatch");
assert.equal(read(rows, { contextAsOf: "2026-08-09" }).status, "stale-context");
assert.equal(read(rows.filter(r => r.date !== "2026-08-12")).stoppedAt, "2026-08-12");
assert.equal(read(rows.map(r => r.basis === "forecast" ? { ...r, source: "fake forecast" } : r)).status, "future-missing");
assert.equal(read(rows, { asOf: "2026-02-30" }).status, "invalid-as-of");
R.agro.harvestReferenceFor = () => ({ minimum: 340, maximum: 360, daysMin: 40, daysMax: 50 });
p = read(); assert.equal(p.seasonalDays, 3); assert.equal(p.seasonalMinimumYears, 2);
assert.equal(p.trajectory.at(-1).expectedYears, 3);
assert.equal(read(rows.map(r => r.basis === "seasonal" ? { ...r, source: "untrusted made up" } : r)).status, "future-missing");
R.agro.harvestReferenceFor = () => ({ minimum: 100, maximum: 140, daysMin: 40, daysMax: 50 });
p = read(); assert.equal(p.forecastDays, 0); assert(!p.reason.includes("予報"));
R.agro.harvestReferenceFor = () => ({ minimum: 200, maximum: 300, daysMin: 40, daysMax: 50 });
const view = R.outlook.forField("a", { weather: { thermal: { asOf: U.today(), locationKey: "37|140", rows } } });
assert.equal(view.thermalProjection.status, "projected");
const basis = view.snapshot.basis.thermalProjection;
assert.equal(Object.hasOwn(basis, "trajectory"), false);
assert.equal(Object.hasOwn(basis.historical, "missingDates"), false);
assert.equal(basis.trajectoryDays, view.thermalProjection.trajectory.length);
assert.equal(basis.trajectoryFingerprint, R.outlook.forField("a", { weather: { thermal: { asOf: U.today(), locationKey: "37|140", rows } } }).snapshot.basis.thermalProjection.trajectoryFingerprint);
const frozen = JSON.stringify(basis);
view.thermalProjection.historical.total = 999;
view.thermalProjection.sources.historical.push("changed");
view.thermalProjection.thresholds.minimum = 999;
view.thermalProjection.range.start = "changed";
view.thermalProjection.trajectory[0].tempMean = 999;
assert.equal(JSON.stringify(basis), frozen);
const changed = R.outlook.forField("a", { weather: { thermal: { asOf: U.today(), locationKey: "37|140", rows: rows.map((r, i) => i === 0 ? { ...r, tempMean: 21 } : r) } } });
assert.notEqual(changed.snapshot.basis.thermalProjection.trajectoryFingerprint, basis.trajectoryFingerprint);
view.thermalProjection.total = 999; assert.equal(view.snapshot.basis.thermalProjection.total, 160);
reset({ growthLogs: [{ fieldId: "a", date: "2026-08-01", headingObserved: true }, { fieldId: "a", date: "2026-08-02", headingObserved: true }] });
assert.equal(read().status, "heading-conflict");
reset({ fieldWorks: [{ workId: "h", fieldIds: ["a"], workName: "稲刈り", date: "2026-08-09", harvestStatusByField: { a: "complete" } }] });
assert.equal(read().status, "not-applicable");
reset();
R.state.data().meta.weatherLocation = { latitude: 999, longitude: 140 };
assert.equal(read(rows, { locationKey: "999|140" }).status, "location-mismatch");
reset();
c.fetch = async url => {
  const q = new URL(url).searchParams; const dates = [];
  for (let d = q.get("start_date"); d <= q.get("end_date"); d = U.dateAddDays(d, 1)) dates.push(d);
  return { ok: true, json: async () => ({ daily: { time: dates, temperature_2m_mean: dates.map(d => d.endsWith("08-17") ? null : 0) } }) };
};
(async () => {
  const before = JSON.stringify([R.state.data(), writes]);
  const ref = await R.weather.fetchSamePeriodDailyAverage("2026-08-17", "2026-08-18", { latitude: 37, longitude: 140 }, 3);
  assert.equal(ref.rows[0].tempMean, ""); assert.equal(ref.rows[0].count, 0);
  assert.equal(ref.rows[1].tempMean, 0); assert.equal(ref.rows[1].count, 3);
  assert.equal(ref.rows[1].basedOn.length, 3); assert.equal(ref.rows[1].basedOn[0].date, "2025-08-18");
  const cross = await R.weather.fetchSamePeriodDailyAverage("2026-12-31", "2027-01-01", { latitude: 37, longitude: 140 }, 3);
  assert.equal(cross.rows.length, 2); assert.equal(cross.rows[1].count, 3);
  const leap = await R.weather.fetchSamePeriodDailyAverage("2028-02-29", "2028-02-29", { latitude: 37, longitude: 140 }, 3);
  assert.equal(leap.rows[0].count, 0);
  await assert.rejects(R.weather.fetchSamePeriodDailyAverage("2026-02-30", "2026-03-01", { latitude: 37, longitude: 140 }));
  await assert.rejects(R.weather.fetchSamePeriodDailyAverage("2026-08-17", "2027-08-17", { latitude: 37, longitude: 140 }));
  assert.equal(JSON.stringify([R.state.data(), writes]), before);
  console.log("harvest temperature projection: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
