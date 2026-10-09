"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map(); let fail = false; let writes = 0;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("fail"); writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state", "agro", "outlook"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const R = context.RiceOS; const { state, schema, utils: U, outlook } = R;
U.today = () => "2026-10-06"; U.now = () => "2026-08-10T00:00:00Z";
R.agro.harvestReferenceFor = () => ({ daysMin: 40, daysMax: 50, target: 1000, label: "general", source: "general" });
const json = value => JSON.stringify(value);
const asOf = "2026-08-10";
function historical(year, min, max, patch = {}) {
  const heading = `${year}-08-01`; const date = U.dateAddDays(heading, Math.round((min + max) / 2));
  return { workId: `h${year}`, date, fieldIds: ["a"], workName: "稲刈り", harvestStatusByField: { a: "complete" },
    harvestTimingByField: { a: { assessment: "appropriate", idealStartDate: U.dateAddDays(heading, min), idealEndDate: U.dateAddDays(heading, max),
      varietyId: "v", varietyName: "evaluation reference", varietySource: "assessment-current-master", evaluatedAt: "2026-07-01T00:00:00Z" } }, ...patch };
}
function reset(rows = [historical(2024, 48, 50), historical(2025, 50, 52)], patch = {}) {
  assert(state.replace(schema.normalize({ fields: [{ fieldId: "a", varietyId: "v" }, { fieldId: "b", varietyId: "v" }],
    varieties: [{ varietyId: "v", name: "current reference" }], fieldWorks: rows,
    growthLogs: [2024, 2025, 2026].map(year => ({ logId: `g${year}`, fieldId: "a", date: `${year}-08-01`, headingObserved: true })), ...patch })));
}
function read(date = asOf) {
  const before = json([state.data(), [...memory], writes]); const result = outlook.forField("a", { asOf: date });
  assert.equal(json([state.data(), [...memory], writes]), before); return result;
}
reset(); let result = read(); const applied = result.calibration;
assert.equal(applied.status, "applied"); assert.equal(applied.shiftDays, 5); assert.equal(applied.accepted.length, 2);
assert.equal(json(applied.policy), json({ minimumYears: 2, maximumShiftDays: 7, guardDays: 14 }));
assert.equal(result.heading.kind, "actual"); assert.equal(result.confidence.key, "medium");
assert.equal(result.harvest.date, U.dateAddDays("2026-08-01", 50));
assert(applied.range.start <= applied.baseRange.start); assert(applied.range.end >= applied.baseRange.end);
assert.equal(json(result.snapshot.basis.harvestCalibration), json(applied)); assert.equal(result.snapshot.engineVersion, "outlook-v2-harvest-calibration");
assert.equal(json(read().calibration), json(applied));
reset([historical(2024, 48, 50)]); assert.equal(read().calibration.status, "insufficient");
const duplicate = historical(2025, 50, 52, { workId: "second2025" });
reset([historical(2024, 48, 50), historical(2025, 50, 52), duplicate]);
result = read(); assert.equal(result.calibration.status, "insufficient"); assert.equal(result.calibration.accepted.length, 1);
assert.equal(result.calibration.excluded.filter(row => row.season === "2025").length, 2);
for (const patch of [
  { assessment: "pending" }, { varietyId: "other" }, { varietySource: "" }, { evaluatedAt: "bad" },
  { evaluatedAt: "2026-08-11T00:00:00Z" }, { idealStartDate: "2025-02-30" }
]) {
  const bad = historical(2025, 50, 52); Object.assign(bad.harvestTimingByField.a, patch);
  reset([historical(2024, 48, 50), bad]); assert.equal(read().calibration.status, "insufficient"); assert.equal(read().calibration.excluded.length, 1);
}
for (const status of ["partial", undefined]) {
  reset([historical(2024, 48, 50), historical(2025, 50, 52, { harvestStatusByField: status ? { a: status } : undefined })]);
  assert.equal(read().calibration.status, "insufficient");
}
reset(undefined, { growthLogs: [{ logId: "g2024", fieldId: "a", date: "2024-08-01", headingObserved: true }, { logId: "g2026", fieldId: "a", date: "2026-08-01", headingObserved: true }] });
assert.equal(read().calibration.status, "insufficient");
reset(undefined, { growthLogs: [] }); assert.equal(read().calibration.status, "not-applicable");
reset(undefined, { growthLogs: [{ logId: "manual", fieldId: "a", date: "2026-08-01", observedStage: "出穂", stageConfirmed: true }] });
assert.equal(read().calibration.status, "not-applicable");
reset([historical(2024, 65, 65), historical(2025, 50, 52)]); assert.equal(read().calibration.status, "insufficient");
assert(read().calibration.excluded[0].reason.includes("前後14日"));
reset([historical(2024, 60, 64), historical(2025, 60, 64)]); assert.equal(read().calibration.shiftDays, 7);
assert(read().calibration.range.end >= U.dateAddDays("2026-08-01", 64));
reset([historical(2024, 26, 30), historical(2025, 26, 30)]); assert.equal(read().calibration.shiftDays, -7);
assert(read().calibration.range.start <= U.dateAddDays("2026-08-01", 26));
reset(); assert.equal(read("2026-02-30").calibration.status, "not-applicable"); assert.equal(read("2027-01-01").calibration.status, "not-applicable");
const lateEvaluation = historical(2025, 50, 52); lateEvaluation.harvestTimingByField.a.evaluatedAt = "2026-08-10T23:59:59Z";
reset([historical(2024, 48, 50), lateEvaluation]); assert.equal(read().calibration.status, "applied");
const fallback = [historical(2024, 49, 49), historical(2025, 51, 51)];
fallback.forEach(row => { row.harvestTimingByField.a.idealStartDate = ""; row.harvestTimingByField.a.idealEndDate = ""; });
reset(fallback); assert.equal(read().calibration.status, "applied");
reset([historical(2024, 48, 50), historical(2025, 50, 52), historical(2026, 48, 50)]);
assert.equal(read().calibration.status, "applied"); assert(read().calibration.excluded.some(row => row.season === "2026"));
const thermalLocation = { latitude: 37, longitude: 140, label: "test" };
const thermalRow = historical(2024, 48, 50);
thermalRow.harvestTimingByField.a.thermal = { headingDate: "2024-08-01", startDate: "2024-08-02", asOf,
  source: "Open-Meteo Archive (reanalysis/model)", retrievedAt: "2026-07-01T00:00:00Z", locationToken: json(thermalLocation), endpoints: [
    { date: thermalRow.harvestTimingByField.a.idealStartDate, total: 1000, count: 48, expectedDays: 48, status: "complete", source: "Open-Meteo Archive (reanalysis/model)" },
    { date: thermalRow.harvestTimingByField.a.idealEndDate, total: 1100, count: 50, expectedDays: 50, status: "complete", source: "Open-Meteo Archive (reanalysis/model)" }
  ] };
reset([thermalRow, historical(2025, 50, 52)], { meta: { weatherLocation: thermalLocation } });
let withThermal = read(); assert.equal(withThermal.calibration.thermalReference.count, 2);
assert.equal(withThermal.calibration.thermalReference.minimum, 1000); assert.equal(withThermal.calibration.shiftDays, 5);
assert(state.updateWeatherLocation({ ...thermalLocation, latitude: 38 }));
assert(!read().calibration.thermalReference); assert.equal(read().harvest.date, withThermal.harvest.date);
const futureThermal = JSON.parse(json(thermalRow)); futureThermal.harvestTimingByField.a.thermal.retrievedAt = "2026-08-11T00:00:00Z";
reset([futureThermal, historical(2025, 50, 52)], { meta: { weatherLocation: thermalLocation } }); assert(!read().calibration.thermalReference);
const partialThermal = JSON.parse(json(thermalRow));
partialThermal.harvestTimingByField.a.thermal.endpoints[1] = { ...partialThermal.harvestTimingByField.a.thermal.endpoints[1], total: 20, count: 1, status: "missing" };
reset([partialThermal, historical(2025, 50, 52)], { meta: { weatherLocation: thermalLocation } });
assert(!read().calibration.thermalReference); assert.equal(read().calibration.shiftDays, 5);
partialThermal.harvestTimingByField.a.thermal.asOf = U.today();
reset([partialThermal, historical(2025, 50, 52)], { meta: { weatherLocation: thermalLocation } });
const currentMixed = read(U.today());
assert.equal(currentMixed.calibration.thermalReference.count, 1);
assert.equal(currentMixed.calibration.thermalReference.minimum, 1000);
assert.equal(currentMixed.calibration.thermalReference.maximum, 1000);
assert.equal(currentMixed.calibration.shiftDays, 5);
const currentLogs = [2024, 2025, 2026].map(year => ({ logId: `g${year}`, fieldId: "a", date: `${year}-08-01`, headingObserved: true }));
reset(undefined, { growthLogs: [...currentLogs, { logId: "conflicting-current", fieldId: "a", date: "2026-08-02", headingObserved: true }] });
assert.equal(read().calibration.status, "not-applicable"); assert(read().calibration.reason.includes("異なる日付"));
assert.equal(read().calibration.shiftDays, 0); assert.equal(json(read().calibration.range), json(read().calibration.baseRange));
// The conflicting observation is not yet visible in an earlier asOf replay.
assert.equal(read("2026-08-01").calibration.status, "applied");
reset(undefined, { growthLogs: [...currentLogs, { logId: "same-current-date", fieldId: "a", date: "2026-08-01", headingObserved: true }] });
assert.equal(read().calibration.status, "applied");
const wrongHeading = historical(2025, 50, 52);
reset([historical(2024, 48, 50), wrongHeading], { growthLogs: [
  { logId: "g2024", fieldId: "a", date: "2024-08-01", headingObserved: true },
  { logId: "g2025", fieldId: "a", date: "2025-08-01", headingObserved: true },
  { logId: "duplicate-heading", fieldId: "a", date: "2025-08-02", headingObserved: true },
  { logId: "g2026", fieldId: "a", date: "2026-08-01", headingObserved: true }
] }); assert.equal(read().calibration.status, "insufficient");
const single = historical(2025, 51, 51); single.harvestTimingByField.a.idealStartDate = "";
reset([historical(2024, 49, 49), single]); assert.equal(read().calibration.status, "applied");
reset(); const original = read().calibration.fingerprint;
const edited = state.data().fieldWorks.find(row => row.workId === "h2025");
assert(state.saveFieldWork({ ...edited, harvestTimingByField: { a: { idealStartDate: U.dateAddDays("2025-08-01", 49) } } }));
assert.notEqual(read().calibration.fingerprint, original);
assert(state.deleteFieldWork("h2025")); assert.equal(read().calibration.status, "insufficient");
reset(); assert(state.saveFieldWork({ date: "2026-08-09", workName: "稲刈り", fieldIds: ["a"], harvestStatusByField: { a: "complete" } }));
result = read(); assert.equal(result.harvest.kind, "actual"); assert.equal(result.harvest.date, "2026-08-09"); assert.equal(result.calibration.status, "not-applicable");
reset(); assert(state.saveFieldWork({ date: "2026-08-09", workName: "稲刈り", fieldIds: ["a"], harvestStatusByField: { a: "partial" } }));
assert.equal(read().calibration.status, "not-applicable");
reset(); const unchangedFarm = json(Object.fromEntries(Object.entries(state.data()).filter(([key]) => key !== "meta")));
const firstSnapshot = read().snapshot; assert(state.saveOutlookSnapshots([firstSnapshot, firstSnapshot]));
assert.equal(state.data().meta.outlookSnapshots.length, 1); const saved = json(state.data().meta.outlookSnapshots[0]);
const savedNoop = json([state.data(), [...memory], writes]); assert(state.saveOutlookSnapshots([read().snapshot])); assert.equal(json([state.data(), [...memory], writes]), savedNoop);
const differentBasis = JSON.parse(json(firstSnapshot)); differentBasis.basis.harvestCalibration.accepted[0].evaluatedAt = "2026-07-02T00:00:00Z";
assert(state.saveOutlookSnapshots([differentBasis])); assert.equal(state.data().meta.outlookSnapshots.length, 2); assert.equal(json(state.data().meta.outlookSnapshots[0]), saved);
differentBasis.basis.harvestCalibration.accepted[0].workId = "mutated caller";
assert.notEqual(state.data().meta.outlookSnapshots[1].basis.harvestCalibration.accepted[0].workId, "mutated caller");
const differentRange = { ...firstSnapshot, harvestRange: { ...firstSnapshot.harvestRange, end: "2026-09-30" } };
assert(state.saveOutlookSnapshots([differentRange])); assert.equal(state.data().meta.outlookSnapshots.length, 3);
assert.equal(json(Object.fromEntries(Object.entries(state.data()).filter(([key]) => key !== "meta"))), unchangedFarm);
assert(state.replace(JSON.parse(json(state.data())))); assert.equal(json(state.data().meta.outlookSnapshots[0]), saved);
const legacy = { fieldId: "a", season: "2020", asOf: "2020-08-01", headingDate: "2020-08-01", harvestDate: "2020-09-15", confidence: "medium" };
assert.equal(state.outlookSnapshotKey(legacy), state.outlookSnapshotKey({ ...legacy, savedAt: "old", snapshotId: "old", headingErrorDays: 1 }));
assert(state.saveOutlookSnapshots([legacy])); const legacyNoop = json([state.data(), [...memory], writes]); assert(state.saveOutlookSnapshots([legacy])); assert.equal(json([state.data(), [...memory], writes]), legacyNoop);
const beforeFailure = json([state.data(), [...memory], writes]); fail = true; assert.equal(state.saveOutlookSnapshots([{ ...firstSnapshot, asOf: "2026-08-11" }]), null); fail = false;
assert.equal(json([state.data(), [...memory], writes]), beforeFailure);
console.log("verify_harvest_timing_calibration: PASS thresholds/conflicts/guards, asOf/replay, confidence/actual, pure projection, append/key/no-op/rollback/JSON");
