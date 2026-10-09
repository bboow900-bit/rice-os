"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let fail = false;
let writes = 0;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("fail"); writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const { state, schema, utils: U } = context.RiceOS;
U.today = () => "2026-10-05";
const json = value => JSON.stringify(value);
const snapshot = () => json([state.data(), [...memory], writes]);
function reset(extra = {}) {
  assert(state.replace(schema.normalize({ fields: ["a", "b"].map(fieldId => ({ fieldId })), ...extra })));
}
function rejected(action) { const before = snapshot(); assert.equal(action(), null); assert.equal(snapshot(), before); }
for (const save of [state.saveGrowthLog, state.saveDryPeriod, state.saveIrrigation]) {
  for (const date of ["2026-02-30", "2026-02-29", "2024-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", "2026/01/01", "2026-01-01T00:00:00", "", null, 20260101]) {
    reset(); rejected(() => save({ fieldId: "a", date }));
  }
  reset(); assert(save({ fieldId: "a", date: "2024-02-29" }));
  reset(); assert(save({ fieldId: "a" }));
}
reset();
rejected(() => state.saveGrowthLogsBatch([{ fieldId: "a", date: "2024-02-29" }, { fieldId: "b", date: "2026-02-30" }]));
assert(state.saveGrowthLogsBatch([{ fieldId: "a", date: "2024-02-29" }, { fieldId: "b", date: "2024-02-29" }]));
for (const save of [state.saveDryPeriod, state.saveIrrigation]) {
  for (const key of ["startDate", "endDate", "actualEndDate", "plannedStartDate"]) {
    reset(); rejected(() => save({ fieldId: "a", date: "2026-08-01", [key]: "2026-02-30" }));
  }
  reset(); rejected(() => save({ fieldId: "a", date: "2026-08-01", startDate: "2026-08-10", actualEndDate: "2026-08-09" }));
  rejected(() => save({ fieldId: "a", date: "2026-08-01", plannedStartDate: "2026-08-10", endDate: "2026-08-09" }));
  assert(save({ fieldId: "a", date: "2026-08-01", startDate: "2026-08-01", endDate: "", actualEndDate: "" }));
}
for (const save of [state.saveDryPeriodsBatch, state.saveIrrigationsBatch]) {
  reset(); rejected(() => save([{ fieldId: "a", date: "2026-08-01", startDate: "2026-08-01" }, { fieldId: "b", date: "2026-08-01", startDate: "2026-02-30" }]));
}
for (const [collection, idKey, save] of [["dryPeriods", "dryPeriodId", state.saveDryPeriod], ["irrigations", "irrigationId", state.saveIrrigation]]) {
  reset({ [collection]: [{ [idKey]: "legacy-period", fieldId: "a", date: "2026-08-10", startDate: "" }] });
  rejected(() => save({ [idKey]: "legacy-period", actualEndDate: "2026-08-01" }));
  assert(save({ [idKey]: "legacy-period", actualEndDate: "2026-08-10" }));
  assert.equal(state.data()[collection][0].startDate, "");
}
for (const movement of [
  { startDate: "2026-02-30" }, { startDate: "2026-08-02", endDate: "2026-02-30" },
  { startDate: "2026-07-31" }, { startDate: "2026-08-03", endDate: "2026-08-02" },
  { startDate: "2026-08-11" }, { startDate: "2026-08-02", endDate: "2026-08-11" }
]) {
  reset(); rejected(() => state.saveIrrigation({ fieldId: "a", date: "2026-08-01", startDate: "2026-08-01", actualEndDate: "2026-08-10", waterMovements: [movement] }));
}
reset(); assert(state.saveIrrigation({ irrigationId: "i", fieldId: "a", date: "2026-08-01", startDate: "2026-08-01", waterMovements: [{ movementId: "m", startDate: "2026-08-02", endDate: "" }] }));
rejected(() => state.saveIrrigation({ irrigationId: "i", startDate: "2026-08-03" }));
assert(state.saveIrrigation({ irrigationId: "i", actualEndDate: "2026-08-10" }));
assert(state.saveIrrigation({ irrigationId: "i", actualEndDate: "" }));
const legacy = {
  growthLogs: [{ logId: "g", fieldId: "a", date: "2026-02-30", headingObserved: true }],
  dryPeriods: [{ dryPeriodId: "d", fieldId: "a", date: "2026-02-30", startDate: "2026-02-30" }],
  irrigations: [{ irrigationId: "old", fieldId: "a", date: "2026-02-30", startDate: "2026-02-30", waterMovements: [{ movementId: "bad", startDate: "2026-02-30" }] }],
  schedules: [{ scheduleId: "growth", fieldIds: ["a"], date: "2026-02-28", title: "出穂" },
    { scheduleId: "water", fieldIds: ["a"], date: "2026-02-28", title: "中干し開始" }]
};
reset(legacy);
assert.equal(state.data().growthLogs[0].date, "2026-02-30");
assert(state.saveGrowthLog({ logId: "g", memo: "legacy memo", sourceScheduleId: "growth" }));
assert.equal(state.data().growthLogs[0].date, "2026-02-30"); assert(!state.data().schedules[0].completedAt);
assert(state.saveDryPeriod({ dryPeriodId: "d", memo: "legacy memo", sourceScheduleId: "water", sourceSchedulePhase: "start" }));
assert.equal(state.data().dryPeriods[0].startDate, "2026-02-30"); assert(!state.data().schedules[1].completedAt);
assert(state.saveIrrigation({ irrigationId: "old", memo: "legacy memo" }));
assert.equal(state.data().irrigations[0].waterMovements[0].startDate, "2026-02-30");
rejected(() => state.saveGrowthLog({ logId: "g", date: "2026-02-30" }));
rejected(() => state.saveDryPeriod({ dryPeriodId: "d", startDate: "2026-02-30" }));
rejected(() => state.saveIrrigation({ irrigationId: "old", waterMovements: state.data().irrigations[0].waterMovements }));
assert(state.saveGrowthLog({ logId: "g", date: "2026-02-28" }));
reset(); const before = snapshot(); fail = true;
assert.equal(state.saveGrowthLogsBatch([{ fieldId: "a", date: "2024-02-29" }, { fieldId: "b", date: "2024-02-29" }]), null);
assert.equal(state.saveIrrigation({ fieldId: "a", date: "2024-02-29", startDate: "2024-02-29" }), null);
fail = false; assert.equal(snapshot(), before);
console.log("verify_record_date_safety: PASS strict dates, optional blanks, atomic batches, phase ranges, legacy retention, schedule guards, rollback");
