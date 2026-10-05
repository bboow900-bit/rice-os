"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k, v) { if (fail) throw Error("fail"); memory.set(k, String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const { state, schema, utils: U } = context.RiceOS;
U.today = () => "2026-10-04";
const schedule = () => state.data().schedules[0];
function reset(date = "2026-08-01") {
  assert(state.replace(schema.normalize({ fields: ["a", "b", "c"].map(fieldId => ({ fieldId, name: fieldId })),
    schedules: [{ scheduleId: "s", date, fieldIds: ["a", "b"], title: "草刈り", scheduleType: "作業予定", status: "予定" }] })));
}
function work(id, fieldId, patch = {}) {
  return state.saveFieldWork({ workId: id, date: "2026-08-01", fieldIds: [fieldId], workName: "草刈り", ...patch });
}
reset(); assert(work("a", "a")); assert.equal(schedule().status, "予定");
assert(work("c", "c")); assert.equal(schedule().status, "予定");
assert(work("b", "b")); assert.equal(schedule().status, "実施済み");
assert(state.deleteFieldWork("a")); assert.equal(schedule().status, "予定");
assert(work("a", "a")); assert.equal(schedule().status, "実施済み");
assert(work("b", "b", { workName: "耕起" })); assert.equal(schedule().status, "予定");
assert(work("b", "b")); assert.equal(schedule().status, "実施済み");
assert(work("a", "c")); assert.equal(schedule().status, "予定");
reset("2026-12-31");
assert(work("a", "a", { date: "2027-01-01", fieldIds: ["a", "b"] })); assert.equal(schedule().status, "予定");
reset();
assert(work("a", "a", { date: "2026-08-11", sourceScheduleId: "s" }));
assert.equal(schedule().status, "予定");
assert.equal(state.data().fieldWorks[0].sourceScheduleId, "s");
assert(work("b", "b", { date: "2026-08-11", sourceScheduleId: "s" })); assert.equal(schedule().status, "実施済み");
const before = JSON.stringify([state.data(), [...memory]]);
fail = true; assert.equal(state.deleteFieldWork("a"), null); fail = false;
assert.equal(JSON.stringify([state.data(), [...memory]]), before);
assert(state.deleteFieldWork("a")); assert.equal(schedule().status, "予定");
assert(work("a", "a", { date: "2027-08-11", sourceScheduleId: "s" })); assert.equal(schedule().status, "予定");
assert.equal(state.data().fieldWorks.find(row => row.workId === "a").sourceScheduleId, "");
reset(); assert(work("a", "a")); assert(work("b", "b"));
assert(state.saveSchedule({ ...schedule(), fieldIds: ["a", "b", "c"] })); assert.equal(schedule().status, "予定");
assert(work("c", "c")); assert.equal(schedule().status, "実施済み");
assert(state.completeSchedule("s"));
assert(state.deleteFieldWork("c")); assert.equal(schedule().status, "手動完了");
assert(work("a", "a", { workName: "耕起" })); assert.equal(schedule().status, "手動完了");
reset("2026-02-28");
assert(work("invalid", "a", { date: "2026-02-30", fieldIds: ["a", "b"] }));
assert.equal(schedule().status, "予定");
reset();
assert(work("all", "a", { fieldIds: ["a", "b"], batchFieldIds: ["a", "b", "c"] }));
assert.equal(schedule().status, "実施済み");
assert(work("all", "a", { fieldIds: ["a"], batchFieldIds: ["a", "b"] }));
assert.equal(schedule().status, "予定");
// A non-owner contributor renamed to harvest must invalidate group coverage.
reset();
assert(work("a", "a")); assert(work("b", "b"));
assert.equal(schedule().completedByWorkId, "b");
assert(work("a", "a", { workName: "稲刈り", harvestStatusByField: { a: "complete" } }));
assert.equal(schedule().status, "予定");
assert.equal(schedule().completedByWorkId, "");
assert.equal(schedule().completedAt, "");
assert.equal(state.data().fieldWorks.find(row => row.workId === "b").workName, "草刈り");
// Boot correction is cache-only; unchanged and manual completions are byte-stable.
const historical = schema.normalize({ fields: ["a", "b"].map(fieldId => ({ fieldId })),
  fieldWorks: [{ workId: "old-a", date: "2026-08-01", workName: "草刈り", fieldIds: ["a"] }],
  schedules: [
    { scheduleId: "wrong", date: "2026-08-01", title: "草刈り", fieldIds: ["a", "b"], status: "実施済み", completedByWorkId: "old-a", completedAt: "old", updatedAt: "old" },
    { scheduleId: "valid", date: "2026-08-01", title: "草刈り", fieldIds: ["a"], status: "実施済み", completedByWorkId: "old-a", completedAt: "old", completionReason: "original reason", updatedAt: "old" },
    { scheduleId: "manual", date: "2026-08-01", title: "草刈り", fieldIds: ["a", "b"], status: "手動完了", completedByWorkId: "old-a", completedManuallyAt: "manual", updatedAt: "old" },
    { scheduleId: "pending", date: "2026-08-01", title: "草刈り", fieldIds: ["a"], status: "予定", updatedAt: "old" }
  ] });
let writes = 0;
const boot = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  RiceOS: { utils: U, schema, storage: { loadData: () => JSON.parse(JSON.stringify(historical)),
    saveData: value => { writes++; return value; }, replaceData: value => { writes++; return value; } } } });
boot.window = boot;
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core/state.js"), "utf8"), boot);
const restored = boot.RiceOS.state;
const byId = id => restored.data().schedules.find(row => row.scheduleId === id);
assert.equal(writes, 0);
assert.equal(byId("wrong").status, "予定");
assert.equal(historical.schedules[0].status, "実施済み");
for (const id of ["valid", "manual", "pending"]) assert.equal(JSON.stringify(byId(id)), JSON.stringify(historical.schedules.find(row => row.scheduleId === id)));
assert(restored.save(restored.data()));
assert.equal(writes, 1);
for (const id of ["valid", "manual", "pending"]) assert.equal(JSON.stringify(byId(id)), JSON.stringify(historical.schedules.find(row => row.scheduleId === id)));
assert(restored.replace(historical));
assert.equal(byId("wrong").status, "予定");
assert.equal(writes, 2);
assert.equal(JSON.stringify(byId("manual")), JSON.stringify(historical.schedules.find(row => row.scheduleId === "manual")));
console.log("verify_work_schedule_targets: PASS");
