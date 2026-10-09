"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const memory = new Map(); let writes = 0;
const c = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c);
const R = c.RiceOS, U = R.utils;
U.today = () => "2026-10-07"; U.now = () => "2026-10-07T00:00:00Z";
function timing(patch = {}) { return { assessment: "appropriate", varietyId: "v", varietyName: "recorded reference", varietySource: "assessment-current-master", ...patch }; }
function reset(patch = {}) {
  assert(R.state.replace(R.schema.normalize({ varieties: [{ varietyId: "v", name: "same name" }, { varietyId: "other", name: "same name" }],
    fields: [{ fieldId: "a", name: "A", varietyId: "v" }, { fieldId: "b", name: "B", varietyId: "other" }],
    growthLogs: ["a", "b"].map(fieldId => ({ fieldId, date: "2025-08-01", headingObserved: true })),
    fieldWorks: [{ workId: "group", date: "2025-09-15", fieldIds: ["a", "b"], workName: "稲刈り", harvestStatusByField: { a: "complete", b: "complete" },
      harvestTimingByField: { a: timing(), b: timing({ idealStartDate: "2025-09-10", idealEndDate: "2025-09-12", assessment: "late" }) } }], ...patch })));
}
function read(id = "a") {
  const before = JSON.stringify([R.state.data(), [...memory], writes]);
  const result = R.state.harvestVarietyComparisonFor(id);
  assert.equal(JSON.stringify([R.state.data(), [...memory], writes]), before); return result;
}
reset(); let result = read();
assert.equal(result.varietyId, "v"); assert.equal(result.rows.length, 2); assert.equal(result.excluded.length, 0);
const a = result.rows.find(row => row.fieldId === "a"), b = result.rows.find(row => row.fieldId === "b");
assert.equal(a.currentField, true); assert.equal(b.currentField, false);
assert.equal(a.delayReason, "");
R.state.data().fieldWorks[0].harvestTimingByField.a.delayReason = "rain";
R.state.data().fieldWorks[0].harvestTimingByField.b.delayReason = "machine";
assert.equal(read().rows.find(row => row.fieldId === "a").delayReason, "rain");
assert.equal(read().rows.find(row => row.fieldId === "b").delayReason, "machine");
R.state.data().fieldWorks[0].harvestTimingByField.b.delayReason = "invalid";
assert.equal(read().rows.find(row => row.fieldId === "b").delayReason, "");
assert.equal(a.daysAfterHeading, 45); assert.equal(a.idealDaysMin, 45); assert.equal(a.idealUsesActualDate, true);
assert.equal(b.idealDaysMin, 40); assert.equal(b.idealDaysMax, 42); assert.equal(b.varietyName, "recorded reference");
assert(a.sourceLabel.includes("栽培品種確定ではありません"));
assert.equal(read("b").rows.length, 0); assert.equal(read("b").excluded.length, 2);
result.rows[0].memo = "mutated"; assert.notEqual(read().rows[0].memo, "mutated");
for (const change of [
  t => { t.varietyId = "other"; }, t => { t.varietyId = ""; }, t => { t.varietySource = "unknown"; },
  t => { t.assessment = "pending"; }, t => { t.assessment = ""; }
]) {
  reset(); change(R.state.data().fieldWorks[0].harvestTimingByField.b);
  result = read(); assert.equal(result.rows.length, 1); assert.equal(result.excluded[0].fieldId, "b"); assert(result.excluded[0].reason);
}
for (const status of ["partial", "legacy"]) {
  reset(); if (status === "legacy") delete R.state.data().fieldWorks[0].harvestStatusByField.b;
  else R.state.data().fieldWorks[0].harvestStatusByField.b = status;
  assert.equal(read().rows.length, 1); assert.equal(read().excluded[0].fieldId, "b");
}
reset(); R.state.data().growthLogs.push({ fieldId: "b", date: "2025-08-02", headingObserved: true });
result = read(); assert.equal(result.rows.find(row => row.fieldId === "b").daysAfterHeading, "");
assert.equal(result.rows.find(row => row.fieldId === "a").daysAfterHeading, 45);
reset({ growthLogs: [] }); assert(read().rows.every(row => row.daysAfterHeading === ""));
reset(); R.state.data().fieldWorks[0].harvestTimingByField.b.idealStartDate = "2025-02-30";
result = read().rows.find(row => row.fieldId === "b"); assert.equal(result.idealStartDate, ""); assert.equal(result.idealEndDate, ""); assert.equal(result.idealDaysMin, "");
reset(); R.state.data().fieldWorks[0].date = "2027-09-15"; assert.equal(read().rows.length, 0);
reset(); R.state.data().fields.find(row => row.fieldId === "a").varietyId = "";
assert.equal(read().rows.length, 0); assert.equal(read().excluded.length, 2);
reset();
R.state.data().fields.find(row => row.fieldId === "a").varietyId = "orphan";
R.state.data().fieldWorks[0].harvestTimingByField.a.varietyId = "orphan";
result = read(); assert.equal(result.varietyId, "orphan"); assert.equal(result.varietyName, "");
assert.equal(result.rows.length, 0); assert(result.excluded.every(row => row.reason.includes("基準品種マスターが未確認")));
reset(); const persisted = JSON.stringify(R.state.data()), comparison = JSON.stringify(read());
assert(R.state.replace(JSON.parse(persisted))); assert.equal(JSON.stringify(read()), comparison);
assert.equal(JSON.stringify(R.state.data()), persisted);
console.log("harvest variety comparison: PASS");
