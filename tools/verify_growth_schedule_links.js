"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let failWrites = false;
const context = vm.createContext({
  console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: {
    getItem: key => memory.get(key) || null,
    setItem(key, value) {
      if (failWrites) throw new Error("Injected storage failure");
      memory.set(key, String(value));
    },
    removeItem: key => memory.delete(key)
  }
});
context.window = context;
const read = file => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
for (const name of ["utils", "schema", "storage", "state"]) {
  vm.runInContext(read(`assets/js/core/${name}.js`), context);
}
const { state, schema } = context.RiceOS;
const panicle = "\u5e7c\u7a42";
const heading = "\u51fa\u7a42";
function reset(patch = {}) {
  assert(state.replace(schema.normalize({
    fields: ["a", "b"].map(fieldId => ({ fieldId, name: fieldId })),
    schedules: [
      { scheduleId: "p", title: panicle, date: "2026-07-01", fieldIds: ["a"], batchFieldIds: ["a", "b"] },
      { scheduleId: "sibling", title: panicle, date: "2026-07-01", fieldIds: ["b"], batchFieldIds: ["a", "b"] },
      { scheduleId: "same", title: panicle, date: "2026-07-01", fieldIds: ["a"] },
      { scheduleId: "h", title: heading, date: "2026-07-20", fieldIds: ["a"] }
    ], ...patch
  })));
}
const schedule = id => state.data().schedules.find(s => s.scheduleId === id);
const log = id => state.data().growthLogs.find(g => g.logId === id);
const snapshot = () => JSON.stringify(state.data());
function save(patch = {}) {
  return state.saveGrowthLog({ logId: "g", date: "2026-07-02", fieldId: "a", sourceScheduleId: log("g") ? log("g").sourceScheduleId || "" : "p", panicleLengthMm: "2", ...log("g"), ...patch });
}
function pending(id = "p") { assert.equal(Boolean(schedule(id).completedAt), false); }
function completed(id = "p", event = "panicle") {
  assert(schedule(id).completedAt);
  assert.equal(schedule(id).completionLink.kind, "growth");
  assert.equal(schedule(id).completionLink.recordId, "g");
  assert.equal(schedule(id).completionLink.event, event);
}
function failed(action) {
  const before = snapshot();
  const stored = JSON.stringify([...memory]);
  failWrites = true;
  try { assert.equal(action(), null); } finally { failWrites = false; }
  assert.equal(snapshot(), before);
  assert.equal(JSON.stringify([...memory]), stored);
}

reset();
const sibling = JSON.stringify(schedule("sibling"));
const same = JSON.stringify(schedule("same"));
assert(save()); completed();
assert.equal(JSON.stringify(schedule("sibling")), sibling);
assert.equal(JSON.stringify(schedule("same")), same);
assert.equal(log("g").sourceScheduleId, "p");
assert(state.replace(JSON.parse(snapshot()))); completed();
assert.equal(log("g").sourceScheduleId, "p");
const completion = JSON.stringify(schedule("p"));
assert(save({ memo: "edit" }));
assert.equal(JSON.stringify(schedule("p")), completion);
assert(save({ panicleLengthMm: "" })); pending();
assert.equal(log("g").sourceScheduleId || "", "");
assert(save({ panicleLengthMm: "3" })); pending();

for (const patch of [
  { panicleLengthMm: "0" }, { panicleLengthMm: "-1" },
  { panicleLengthMm: "Infinity" }, { panicleLengthMm: true },
  { fieldId: "b" }, { date: "2027-07-02" },
  { sourceScheduleId: "missing" }, { sourceScheduleId: "" },
  { sourceScheduleId: "h" }
]) {
  reset(); assert(save(patch)); pending(); pending("h");
}
for (const patch of [
  { fieldIds: ["a", "b"] }, { fieldIds: [] },
  { fieldIds: ["b"], batchFieldIds: ["a", "b"] },
  { targetScope: "offField" }, { season: 2027 }, { recordKind: "water" }
]) {
  reset();
  assert(state.replace({ ...state.data(), schedules: state.data().schedules.map(s => s.scheduleId === "p" ? { ...s, ...patch } : s) }));
  assert(save()); pending();
}
reset();
assert(save({ sourceScheduleId: "h", panicleLengthMm: "", observedStage: "heading", stageConfirmed: true, headingObserved: false }));
pending("h");
assert(save({ headingObserved: "true" })); pending("h");
assert(save({ headingObserved: true })); completed("h", "heading");
assert(save({ headingObserved: false })); pending("h");

for (const patch of [{ date: "2026-07-03" }, { date: "2027-07-02" }, { fieldId: "b" }]) {
  reset(); assert(save()); completed(); assert(save(patch)); pending();
  assert(save({ date: "2026-07-02", fieldId: "a" })); pending();
  pending("sibling"); pending("same");
}
reset(); assert(save());
assert(state.replace(JSON.parse(snapshot())));
assert(state.deleteGrowthLog("g")); pending(); pending("same"); pending("sibling");
reset(); assert(save()); completed();
assert(save({ sourceScheduleId: "same" })); pending(); completed("same");
assert(save({ sourceScheduleId: "" })); pending("same"); pending();
reset(); assert(save());
assert(save({ sourceScheduleId: "sibling" })); pending(); pending("sibling");
reset(); assert(save());
failed(() => save({ sourceScheduleId: "same" })); completed(); pending("same");
for (const patch of [
  { completedManuallyAt: "2026-07-03T00:00:00Z" },
  { completedByWorkId: "work" }, { completedByWaterPeriodId: "water" }
]) {
  reset(); assert(save());
  Object.assign(schedule("p"), patch);
  const before = JSON.stringify(schedule("p"));
  assert(state.deleteGrowthLog("g"));
  assert.equal(JSON.stringify(schedule("p")), before);
}
reset(); failed(() => save()); pending();
assert(save()); completed();
failed(() => save({ panicleLengthMm: "" })); completed();
failed(() => state.deleteGrowthLog("g")); completed();

// Route wiring complements the parent's real-browser cancellation/quick-button test.
const sheet = read("assets/js/screens/bottom-sheet.js");
assert.match(sheet, /prefillStageRecord\(U\.today\(\), fieldIds, \{ sourceScheduleId: record\.scheduleId \}\)/);
const growth = read("assets/js/screens/growth.js");
assert.match(growth, /function prefillStageRecord\(date, fieldIds, options = \{\}\)/);
assert.match(growth, /function saveHeadingObservedRecords\(targets\)[\s\S]*?sourceScheduleId,/);
assert.match(growth, /const common = \{\s*sourceScheduleId,/);
assert.match(growth, /function resetForm\(\) \{\s*sourceScheduleId = ""/);
console.log("Growth schedule links: evidence, isolation, corrections, roundtrip, failures and route wiring passed.");
