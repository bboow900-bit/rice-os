"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("fail"); memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const { state, schema, utils: U } = context.RiceOS;
U.today = () => "2026-10-05";
const json = value => JSON.stringify(value);
for (const kind of ["dry", "irrigation"]) {
  const save = kind === "dry" ? state.saveDryPeriod : state.saveIrrigation;
  const remove = kind === "dry" ? state.deleteDryPeriod : state.deleteIrrigation;
  const rows = () => kind === "dry" ? state.data().dryPeriods : state.data().irrigations;
  const get = id => state.data().schedules.find(row => row.scheduleId === id);
  function reset() {
    assert(state.replace(schema.normalize({ fields: ["a", "b"].map(fieldId => ({ fieldId })),
      schedules: ["start", "end", "other"].map(id => ({ scheduleId: id, date: "2026-08-01", fieldIds: ["a"],
        title: "water", recordKind: "water", waterKind: kind === "dry" ? "dry" : "intermittent", waterPhase: id === "end" ? "end" : "start" })) })));
    assert(save({ [kind === "dry" ? "dryPeriodId" : "irrigationId"]: "p", fieldId: "a", date: "2026-08-01", startDate: "2026-08-01",
      method: "間断灌水", sourceScheduleId: "start", sourceSchedulePhase: "start" }));
    assert.equal(get("start").status, "実施済み");
  }
  const edit = patch => save({ ...rows()[0], ...patch });
  for (const patch of [{ startDate: "" }, { startDate: "2027-08-01" }, { fieldId: "b" }, { sourceScheduleId: "" },
    { sourceScheduleId: "other" }, { sourceSchedulePhase: "" }, ...(kind === "irrigation" ? [{ method: "深水管理" }] : [])]) {
    reset(); assert(edit(patch)); assert.equal(get("start").status, "予定", json(patch));
    if (patch.sourceScheduleId === "other") assert.equal(get("other").status, "実施済み");
  }
  reset(); const initial = json(get("start"));
  assert(edit({ memo: "memo only" })); assert.equal(json(get("start")), initial);
  assert(edit({ startDate: "2026-08-11" })); assert.equal(get("start").status, "実施済み");
  assert(edit({ actualEndDate: "2026-08-12", sourceScheduleId: "end", sourceSchedulePhase: "end" }));
  assert.equal(get("start").status, "実施済み"); assert.equal(get("end").status, "実施済み");
  assert(edit({ actualEndDate: "" })); assert.equal(get("end").status, "予定"); assert.equal(get("start").status, "実施済み");
  assert(edit({ actualEndDate: "2027-08-12" })); assert.equal(get("end").status, "予定");
  const invalidBoundaryBefore = json([state.data(), [...memory]]);
  assert.equal(edit({ actualEndDate: "2026-08-10" }), null);
  assert.equal(json([state.data(), [...memory]]), invalidBoundaryBefore);
  reset(); assert(edit({ startDate: "2025-12-31", actualEndDate: "2026-08-01", sourceScheduleId: "end", sourceSchedulePhase: "end" }));
  assert.equal(get("end").status, "実施済み");
  for (const patch of [{ fieldId: "b" }, { startDate: "" }, { actualEndDate: "2027-08-12" },
    { sourceScheduleId: "" }, ...(kind === "irrigation" ? [{ method: "深水管理" }] : [])]) {
    reset(); assert(edit({ actualEndDate: "2026-08-12", sourceScheduleId: "end", sourceSchedulePhase: "end" }));
    assert(edit(patch)); assert.equal(get("end").status, "予定", json(patch));
  }
  reset(); const before = json([state.data(), [...memory]]);
  // Cancelled operations never invoke the state mutation API.
  assert.equal(json([state.data(), [...memory]]), before);
  fail = true; assert.equal(edit({ startDate: "" }), null); assert.equal(remove("p"), null); fail = false;
  assert.equal(json([state.data(), [...memory]]), before);
  assert(remove("p")); assert.equal(get("start").status, "予定");
  reset();
  assert(edit({ actualEndDate: "2026-08-12", sourceScheduleId: "end", sourceSchedulePhase: "end" }));
  assert(state.completeSchedule("end"));
  const manualEnd = json(get("end"));
  assert(remove("p")); assert.equal(json(get("end")), manualEnd); assert.equal(get("start").status, "予定");
  for (const manual of [{ status: "手動完了" }, { completedManuallyAt: "2026-08-20" }]) {
    reset(); assert(state.saveSchedule({ ...get("start"), ...manual }));
    const preserved = json(get("start"));
    assert(edit({ startDate: "" })); assert.equal(json(get("start")), preserved);
    assert(remove("p")); assert.equal(json(get("start")), preserved);
  }
  reset();
  // Old owned links without completionLink are repaired only when ownership and target are known.
  const legacy = JSON.parse(json(state.data()));
  delete legacy.schedules.find(row => row.scheduleId === "start").completionLink;
  assert(state.replace(legacy));
  assert(!get("start").completionLink);
  assert(edit({ fieldId: "b" })); assert.equal(get("start").status, "予定");
  reset(); const old = JSON.parse(json(state.data()));
  delete old.schedules.find(row => row.scheduleId === "start").completionLink;
  assert(state.replace(old));
  assert(remove("p")); assert.equal(get("start").status, "予定");
  reset();
  const invalidDateBefore = json([state.data(), [...memory]]);
  assert.equal(edit({ startDate: "2026-02-30" }), null);
  assert.equal(json([state.data(), [...memory]]), invalidDateBefore);
  reset();
  assert(state.saveSchedule({ ...get("other"), fieldIds: ["a", "b"] }));
  assert(edit({ sourceScheduleId: "other" })); assert.equal(get("other").status, "予定");
  reset();
  assert(save({ ...rows()[0], startDate: undefined })); assert.equal(get("start").status, "実施済み");
  reset();
  assert(save({ ...rows()[0], startDate: "", plannedStartDate: "2026-08-20", status: "予定" }));
  assert.equal(get("start").status, "予定");
  console.log(`PASS ${kind}: edit, phases, year, source, manual, legacy, delete/failure`);
}
// Loading repairs only provable stale links, never writes, and preserves legacy/unknown/manual provenance.
const historical = schema.normalize({ fields: [{ fieldId: "a" }, { fieldId: "b" }],
  dryPeriods: [{ dryPeriodId: "d", fieldId: "b", date: "2026-08-01", startDate: "2026-08-01" },
    { dryPeriodId: "single", fieldId: "a", date: "2026-08-01" }],
  schedules: [
    { scheduleId: "stale", fieldIds: ["a"], date: "2026-08-01", title: "中干し開始", status: "実施済み", completedAt: "old", completedByWaterPeriodId: "d", completionLink: { kind: "dry", recordId: "d", fieldId: "a", event: "start" } },
    { scheduleId: "legacy", fieldIds: ["a"], date: "2026-08-01", title: "中干し開始", status: "実施済み", completedAt: "old", completedByWaterPeriodId: "single" },
    { scheduleId: "unknown", fieldIds: ["a"], date: "2026-08-01", title: "中干し開始", status: "実施済み", completedAt: "old", completionLink: { kind: "dry", recordId: "d" } },
    { scheduleId: "manual", fieldIds: ["a"], date: "2026-08-01", title: "中干し開始", status: "手動完了", completedAt: "old", completedManuallyAt: "manual", completionLink: { kind: "dry", recordId: "d", fieldId: "a", event: "start" } }
  ] });
let writes = 0;
const boot = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  RiceOS: { utils: U, schema, storage: { loadData: () => JSON.parse(json(historical)),
    saveData: value => { writes++; return value; }, replaceData: value => { writes++; return value; } } } });
boot.window = boot;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core/state.js"), "utf8"), boot);
const reloaded = boot.RiceOS.state;
const loaded = id => reloaded.data().schedules.find(row => row.scheduleId === id);
assert.equal(writes, 0); assert.equal(loaded("stale").status, "予定");
assert.equal(historical.schedules[0].status, "実施済み");
for (const id of ["legacy", "unknown", "manual"]) assert.equal(json(loaded(id)), json(historical.schedules.find(row => row.scheduleId === id)));
assert(reloaded.save(reloaded.data())); assert.equal(writes, 1);
for (const id of ["legacy", "unknown", "manual"]) assert.equal(json(loaded(id)), json(historical.schedules.find(row => row.scheduleId === id)));
assert(reloaded.replace(historical)); assert.equal(writes, 2); assert.equal(loaded("stale").status, "予定");
for (const id of ["legacy", "unknown", "manual"]) assert.equal(json(loaded(id)), json(historical.schedules.find(row => row.scheduleId === id)));
console.log("verify_water_schedule_reconciliation: PASS");
