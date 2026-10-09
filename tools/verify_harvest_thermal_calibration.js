"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const memory = new Map(); let writes = 0; let fail = false;
const c = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("synthetic failure"); writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state", "agro", "outlook"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c);
const R = c.RiceOS, U = R.utils;
U.today = () => "2026-10-07";
U.now = () => "2026-10-07T00:00:00Z";
const location = { latitude: 37, longitude: 140 };
const source = "Open-Meteo Archive (reanalysis/model)";
R.agro.harvestReferenceFor = () => ({ minimum: 1000, maximum: 1200, daysMin: 40, daysMax: 50 });
function history(year, low, high) {
  const heading = `${year}-08-01`, start = U.dateAddDays(heading, 45), end = U.dateAddDays(heading, 47);
  return { workId: `w${year}`, fieldIds: ["a"], workName: "稲刈り", date: U.dateAddDays(heading, 46), harvestStatusByField: { a: "complete" },
    harvestTimingByField: { a: { assessment: "appropriate", idealStartDate: start, idealEndDate: end,
      varietyId: "v", varietySource: "assessment-current-master", evaluatedAt: "2026-07-01T00:00:00Z",
      thermal: { headingDate: heading, startDate: U.dateAddDays(heading, 1), asOf: U.today(), source,
        locationToken: JSON.stringify(location), retrievedAt: "2026-07-01T00:00:00Z", endpoints: [
          { date: start, total: low, count: 45, expectedDays: 45, status: "complete", source },
          { date: end, total: high, count: 47, expectedDays: 47, status: "complete", source }
        ] } } } };
}
function reset(rows) {
  assert(R.state.replace(R.schema.normalize({ fields: ["a", "b"].map(fieldId => ({ fieldId, varietyId: "v" })), varieties: [{ varietyId: "v" }],
    meta: { weatherLocation: location }, fieldWorks: rows, growthLogs: [2024, 2025, 2026].flatMap(year => ["a", "b"].map(fieldId => ({ fieldId, date: `${year}-08-01`, headingObserved: true }))) })));
}
function read() {
  const before = JSON.stringify([R.state.data(), writes]); const result = R.outlook.forField("a");
  assert.equal(JSON.stringify([R.state.data(), writes]), before); return result;
}
reset([history(2024, 900, 1100), history(2025, 1050, 1199)]);
let view = read(), t = view.thermalCalibration;
assert.equal(t.status, "applied"); assert.equal(t.accepted.length, 2);
assert.equal(t.minimum, 900); assert.equal(t.maximum, 1200);
assert.equal(view.confidence.key, "medium");
assert.equal(JSON.stringify(view.snapshot.basis.thermalCalibration), JSON.stringify(t));
t.accepted[0].minimum = 1; assert.equal(view.snapshot.basis.thermalCalibration.accepted[0].minimum, 900);
const projection = R.outlook.harvestTemperatureProjection("a", { asOf: U.today(), locationKey: "37|140", rows: [] });
assert.equal(projection.minimum, 900); assert.equal(projection.maximum, 1200);
const archiveRows = Array.from({ length: 66 }, (_, i) => ({ date: U.dateAddDays("2026-08-02", i),
  tempMean: 20, basis: "historical", source: "Open-Meteo Archive" }));
const generalOnly = R.outlook.harvestTemperatureProjection("a", { asOf: U.today(), locationKey: "37|140", rows: archiveRows });
assert.equal(generalOnly.generalArrivalMaxDate, U.dateAddDays("2026-08-01", 60));
assert.equal(generalOnly.arrivalMaxDate, U.dateAddDays("2026-08-01", 60));
R.agro.harvestReferenceFor = () => ({ minimum: 1000, maximum: 1100, daysMin: 40, daysMax: 50 });
const gapProjection = R.outlook.harvestTemperatureProjection("a", { asOf: "2026-10-01", locationKey: "37|140",
  rows: archiveRows.filter(row => row.date < "2026-10-01").map(row => ({ ...row, tempMean: 19 })) });
assert.equal(gapProjection.generalArrivalMaxDate, U.dateAddDays("2026-08-01", 58));
assert.equal(gapProjection.arrivalMaxDate, ""); assert.equal(gapProjection.status, "future-missing");
R.agro.harvestReferenceFor = () => ({ minimum: 1000, maximum: 1200, daysMin: 40, daysMax: 50 });
reset([history(2024, 900, 1300)]); t = read().thermalCalibration;
assert.equal(t.status, "insufficient"); assert.equal(t.minimum, 1000); assert.equal(t.maximum, 1200);
for (const change of [
  row => row.harvestTimingByField.a.thermal.endpoints.pop(),
  row => { row.harvestTimingByField.a.thermal.endpoints[1].status = "missing"; },
  row => { row.harvestTimingByField.a.thermal.endpoints[1].total = 800; },
  row => { row.harvestTimingByField.a.thermal.locationToken = "different"; },
  row => { row.harvestTimingByField.a.thermal.retrievedAt = "2027-01-01"; },
  row => { row.harvestTimingByField.a.thermal.endpoints[0].count = 1; }
]) {
  const second = history(2025, 1050, 1199); change(second);
  reset([history(2024, 900, 1100), second]); t = read().thermalCalibration;
  assert.equal(t.status, "insufficient"); assert.equal(t.accepted.length, 1); assert.equal(t.excluded.length, 1);
}
for (const upper of [1200, 1201, 1300]) {
  reset([history(2024, 900, 1100), history(2025, 1050, upper)]);
  t = read().thermalCalibration;
  assert.equal(t.status, "insufficient"); assert.equal(t.accepted.length, 1);
  assert(t.excluded[0].reason.includes("1200"));
  assert.equal(t.minimum, 1000); assert.equal(t.maximum, 1200);
}
reset([history(2024, 1050, 1100), history(2025, 1070, 1150)]);
assert.equal(read().thermalCalibration.minimum, 1000); assert.equal(read().thermalCalibration.maximum, 1200);
const duplicate = history(2025, 900, 1300); duplicate.workId = "duplicate";
reset([history(2024, 900, 1100), history(2025, 1050, 1300), duplicate]);
assert.equal(read().thermalCalibration.status, "insufficient");
const duplicateView = read();
assert.equal(duplicateView.thermalCalibration.excluded.filter(row => row.season === "2025" && row.stage === "day-guard").length, 2);
const wrongVariety = history(2025, 1050, 1199);
wrongVariety.harvestTimingByField.a.varietyId = "other";
reset([history(2024, 900, 1100), wrongVariety]);
const mismatchView = read();
assert.equal(mismatchView.thermalCalibration.accepted.length, 1);
assert.equal(mismatchView.thermalCalibration.status, "insufficient");
assert.equal(mismatchView.thermalCalibration.excluded[0].reason, mismatchView.calibration.excluded[0].reason);
assert.equal(mismatchView.thermalCalibration.excluded[0].stage, "day-guard");
const singles = [history(2024, 950, 1100), history(2025, 1050, 1250)];
singles.forEach(row => {
  const timing = row.harvestTimingByField.a;
  timing.idealStartDate = timing.idealEndDate = "";
  timing.thermal.endpoints = [{ date: row.date, total: 1100, count: 46, expectedDays: 46, status: "complete", source }];
});
reset(singles); assert.equal(read().thermalCalibration.status, "applied");
assert.equal(read().thermalCalibration.accepted.length, 2);
const baseline = R.outlook.forField("a", { asOf: "2026-06-30" });
assert.equal(baseline.thermalCalibration.status, "not-applicable");
assert.equal(baseline.thermalCalibration.minimum, 1000);
const grouped = [history(2024, 900, 1100), history(2025, 1050, 1199)];
grouped.forEach((row, index) => {
  row.fieldIds = ["a", "b"]; row.harvestStatusByField.b = "complete";
  row.harvestTimingByField.b = JSON.parse(JSON.stringify(row.harvestTimingByField.a));
  if (index === 0) {
    row.harvestTimingByField.b.thermal.endpoints[0].total = 980;
    row.harvestTimingByField.b.thermal.endpoints[1].total = 1150;
  } else delete row.harvestTimingByField.b.thermal;
});
reset(grouped);
const beforeGrouped = JSON.stringify([R.state.data(), writes]);
assert.equal(read().thermalCalibration.status, "applied");
const b = R.outlook.forField("b").thermalCalibration;
assert.equal(b.status, "insufficient"); assert.equal(b.accepted.length, 1);
assert.equal(b.accepted[0].minimum, 980); assert.equal(b.minimum, 1000);
assert.equal(b.excluded[0].workId, "w2025");
assert.equal(JSON.stringify([R.state.data(), writes]), beforeGrouped);
const missingBoth = JSON.parse(JSON.stringify(grouped));
missingBoth.forEach(row => { delete row.harvestTimingByField.b.thermal; });
reset(missingBoth);
assert.equal(R.outlook.forField("b").thermalCalibration.accepted.length, 0);
assert.equal(read().thermalCalibration.status, "applied");
reset(grouped);
const first = read().snapshot, firstKey = R.state.outlookSnapshotKey(first);
const records = JSON.stringify(R.state.data().fieldWorks);
assert(R.state.saveOutlookSnapshots([first]));
const persisted = JSON.stringify(R.state.data().meta.outlookSnapshots[0]);
const noop = JSON.stringify([R.state.data(), [...memory], writes]);
assert(R.state.saveOutlookSnapshots([read().snapshot]));
assert.equal(JSON.stringify([R.state.data(), [...memory], writes]), noop);
const modifiedInput = JSON.parse(JSON.stringify(grouped));
modifiedInput[0].harvestTimingByField.a.thermal.endpoints[0].total = 910;
// Imported correction is synthetic; comparison remains a read-only projection.
const replacement = JSON.parse(JSON.stringify(R.state.data())); replacement.fieldWorks = modifiedInput;
assert(R.state.replace(replacement));
const correctedRecords = JSON.stringify(R.state.data().fieldWorks);
const second = read().snapshot;
assert.notEqual(R.state.outlookSnapshotKey(second), firstKey);
assert(R.state.saveOutlookSnapshots([second]));
assert.equal(R.state.data().meta.outlookSnapshots.length, 2);
assert.equal(JSON.stringify(R.state.data().meta.outlookSnapshots[0]), persisted);
second.basis.thermalCalibration.accepted[0].minimum = 1;
assert.equal(R.state.data().meta.outlookSnapshots[1].basis.thermalCalibration.accepted[0].minimum, 910);
assert.equal(JSON.stringify(R.state.data().fieldWorks), correctedRecords);
assert.notEqual(correctedRecords, records);
const roundTrip = JSON.stringify(R.state.data());
assert(R.state.replace(JSON.parse(roundTrip))); assert.equal(JSON.stringify(R.state.data()), roundTrip);
const rollback = JSON.stringify([R.state.data(), [...memory], writes]);
fail = true;
assert.equal(R.state.saveOutlookSnapshots([{ ...read().snapshot, asOf: "2026-10-06" }]), null);
fail = false; assert.equal(JSON.stringify([R.state.data(), [...memory], writes]), rollback);
console.log("harvest thermal calibration: PASS");
