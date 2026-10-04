"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("quota"); memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils","schema","storage","state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../assets/js/core/${name}.js`),"utf8"),context);
const { state, schema, utils: U } = context.RiceOS;
U.today = () => "2026-10-03";
const name = "\u7a32\u5208\u308a";
function reset() {
  assert(state.replace(schema.normalize({ fields: [{ fieldId: "a" },{ fieldId: "b" }],
    fieldWorks: [{ workId: "h", date: "2026-09-10", workName: name, fieldIds: ["a","b"], memo: "keep", sourceScheduleId: "linked", harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", thermal: { total: 100, status: "\u78ba\u5b9a" }, savedAt: "old" }] },
      { workId: "planned", date: "2026-09-10", workName: name + "\u4e88\u5b9a", fieldIds: ["a"] }],
    schedules: [{ scheduleId: "a", date: "2026-09-10", title: name, fieldIds: ["a"] },
      { scheduleId: "b", date: "2026-09-10", title: name, fieldIds: ["b"] },
      { scheduleId: "group", date: "2026-09-10", title: name, fieldIds: ["a","b"], status: "\u5b9f\u65bd\u6e08\u307f", completedAt: "old", completedByWorkId: "h" },
      { scheduleId: "linked", date: "2026-08-01", title: name, fieldIds: ["a"], status: "\u5b9f\u65bd\u6e08\u307f", completedAt: "old", completedByWorkId: "h" },
      { scheduleId: "manual", date: "2026-09-10", title: name, fieldIds: ["a"], status: "\u624b\u52d5\u5b8c\u4e86" },
      { scheduleId: "manual-linked", date: "2026-09-10", title: name, fieldIds: ["a","b"], status: "\u624b\u52d5\u5b8c\u4e86", completedAt: "manual-old", completedByWorkId: "h", completedManuallyAt: "manual-date" },
      { scheduleId: "manual-date-linked", date: "2026-09-10", title: name, fieldIds: ["a","b"], status: "\u4e88\u5b9a", completedAt: "manual-old", completedByWorkId: "h", completedManuallyAt: "manual-date" }] })));
}
const work = () => state.data().fieldWorks.find(r => r.workId === "h");
const schedule = id => state.data().schedules.find(r => r.scheduleId === id);
const snapshot = () => JSON.stringify([state.data(),[...memory]]);
reset();
const beforeWork = JSON.parse(JSON.stringify(work()));
const fields = JSON.stringify(state.data().fields);
const manualLinked = ["manual-linked","manual-date-linked"].map(id => JSON.stringify(schedule(id)));
assert(state.confirmHarvestCompletion("h","a"));
assert.deepEqual(["manual-linked","manual-date-linked"].map(id => JSON.stringify(schedule(id))),manualLinked);
assert.equal(state.harvestStatusForField("a",2026).status,"complete");
assert.equal(state.harvestStatusForField("b",2026).status,"legacy");
assert.deepEqual(Object.keys(work().harvestStatusByField),["a"]);
for (const key of Object.keys(beforeWork).filter(k => !["updatedAt","harvestStatusByField"].includes(k))) assert.equal(JSON.stringify(work()[key]),JSON.stringify(beforeWork[key]),key);
assert.equal(JSON.stringify(state.data().fields),fields);
assert(schedule("a").completedAt);
assert(!schedule("b").completedAt);
assert(!schedule("group").completedAt);
assert.equal(schedule("linked").completedAt,"old");
assert.equal(schedule("manual").status,"\u624b\u52d5\u5b8c\u4e86");
for (const [id,field] of [["h","a"],["h","missing"],["missing","a"],["planned","a"],["manual","a"]]) {
  const before = snapshot(); assert.equal(state.confirmHarvestCompletion(id,field),null); assert.equal(snapshot(),before);
}
fail = true;
const before = snapshot(); assert.equal(state.confirmHarvestCompletion("h","b"),null); assert.equal(snapshot(),before);
fail = false;
assert(state.confirmHarvestCompletion("h","b"));
assert.deepEqual(["manual-linked","manual-date-linked"].map(id => JSON.stringify(schedule(id))),manualLinked);
assert(schedule("group").completedAt);
assert(state.replace(JSON.parse(JSON.stringify(state.data()))));
assert.equal(state.harvestStatusForField("b",2026).status,"complete");
assert(state.saveFieldWork({ ...work(), harvestStatusByField: { a: "complete", b: "partial" } }));
assert(!schedule("group").completedAt);
assert.equal(state.confirmHarvestCompletion("h","b"),null);
for (const scenario of ["delayed","year","field","kind","partial","auto"]) {
  assert(state.replace(schema.normalize({ fields: [{ fieldId: "a" },{ fieldId: "b" }],
    schedules: [{ scheduleId: "source", date: scenario === "year" ? "2025-09-01" : "2026-09-01",
      title: scenario === "kind" ? "\u7530\u690d\u3048" : name, fieldIds: scenario === "field" ? ["b"] : ["a"] }] })));
  assert(state.saveFieldWork({ workId: "new", date: "2026-09-11", workName: name, fieldIds: ["a"],
    sourceScheduleId: scenario === "auto" ? "" : "source", harvestStatusByField: { a: scenario === "partial" ? "partial" : "complete" } }));
  assert.equal(Boolean(schedule("source").completedAt),scenario === "delayed",scenario);
}
// Confirming a delayed legacy source follows the same strict explicit path.
reset();
assert(state.replace(schema.normalize({ ...state.data(), schedules: [{ scheduleId: "linked", date: "2026-08-01", title: name, fieldIds: ["a"] }] })));
assert(state.confirmHarvestCompletion("h","a"));
assert(schedule("linked").completedAt);
// An explicit map cannot retain legacy undefined as implicit group completion.
reset();
assert(state.saveFieldWork({ ...work(), harvestStatusByField: { a: "complete" } }));
assert(!schedule("group").completedAt);
assert(!schedule("b").completedAt);
const source = fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/annual.js"),"utf8");
assert(source.includes('if (harvestStatus.status === "legacy")'));
assert(source.includes('data-annual-harvest-confirm='));
assert(source.includes('fieldId === selectedFieldId && confirm('));
console.log("Harvest legacy confirmation: target-only, snapshots, strict group, old link, manual isolation, failure/no-op, roundtrip PASS");
