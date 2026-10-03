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
      if (failWrites) throw new Error("Injected failure");
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
const dry = "\u4e2d\u5e72\u3057";
const start = "\u958b\u59cb";
const end = "\u7d42\u4e86";
function reset(patch = {}) {
  assert(state.replace(schema.normalize({
    fields: ["a", "b"].map(fieldId => ({ fieldId, name: fieldId })),
    schedules: [
      { scheduleId: "p", title: dry + start, date: "2026-06-20", fieldIds: ["a"], ...patch },
      { scheduleId: "other", title: dry + start, date: "2026-06-20", fieldIds: ["a"] },
      { scheduleId: "sibling", title: dry + start, date: "2026-06-20", fieldIds: ["b"] }
    ]
  })));
}
const schedule = id => state.data().schedules.find(s => s.scheduleId === id);
const snapshot = () => JSON.stringify(state.data());
function save(patch = {}) {
  return state.saveDryPeriod({ dryPeriodId: "d", fieldId: "a", date: "2026-06-22", startDate: "2026-06-22", sourceScheduleId: "p", sourceSchedulePhase: "start", ...patch });
}
function pending(id = "p") { assert(!schedule(id).completedAt); }
function done(phase) {
  assert(schedule("p").completedAt);
  assert.equal(schedule("p").completionLink.recordId, "d");
  assert.equal(schedule("p").completionLink.event, phase);
}
reset();
const before = snapshot();
const resolved = state.waterScheduleTarget(schedule("p"));
assert.equal(resolved.kind, "dry"); assert.equal(resolved.phase, "start");
assert.equal(snapshot(), before);
assert(save()); done("start"); pending("other"); pending("sibling");
assert.equal(schedule("p").recordKind, "");
assert.equal(state.data().dryPeriods.find(d => d.dryPeriodId === "d").sourceScheduleId, "p");
assert(state.replace(JSON.parse(snapshot()))); done("start");
assert(state.deleteDryPeriod("d")); pending();
reset({ title: dry + end });
assert(save({ sourceSchedulePhase: "end" })); pending();
assert(save({ sourceSchedulePhase: "end", actualEndDate: "2026-07-10" })); done("end");
for (const patch of [
  { sourceScheduleId: "" }, { sourceScheduleId: "missing" },
  { fieldId: "b" }, { date: "2027-06-22", startDate: "2027-06-22" },
  { sourceSchedulePhase: "end", actualEndDate: "2026-07-10" }
]) { reset(); assert(save(patch)); pending(); pending("other"); pending("sibling"); }
for (const patch of [
  { title: "unrelated" }, { title: dry }, { targetScope: "offField" },
  { recordKind: "work" }, { waterKind: "deep", waterPhase: "start" },
  { waterKind: "dry", waterPhase: "invalid" }, { fieldIds: ["a", "b"] },
  { fieldIds: ["b"], batchFieldIds: ["a", "b"] }, { season: 2027 },
  { completedAt: "2026-06-20", completedManuallyAt: "2026-06-20" }
]) {
  reset(patch); const before = JSON.stringify(schedule("p"));
  assert(save()); assert.equal(JSON.stringify(schedule("p")), before);
}
reset();
assert(state.saveIrrigation({ irrigationId: "i", fieldId: "a", method: "\u6df1\u6c34\u7ba1\u7406", date: "2026-06-22", startDate: "2026-06-22", sourceScheduleId: "p", sourceSchedulePhase: "start" }));
pending(); pending("other");
for (const title of [
  dry + start + "\u30fb" + end + "\u4e88\u5b9a",
  dry + end + "\u30fb\u6df1\u6c34" + start + "\u4e88\u5b9a",
  dry + end + "\u30fb\u6df1\u6c34" + end,
  dry + start + "\u30fb\u843d\u6c34" + start,
  dry + start + "\u30fb\u9593\u65ad\u704c\u6c34" + start,
  dry + start + "\u30fb\u98fd\u6c34" + start,
  dry + start + "\u30fb\u5b8c\u4e86"
]) {
  reset({ title });
  const before = JSON.stringify(schedule("p"));
  assert.equal(state.waterScheduleTarget(schedule("p")), null);
  assert(save({ sourceSchedulePhase: "end", actualEndDate: "2026-07-10" }));
  assert.equal(JSON.stringify(schedule("p")), before);
  assert(save());
  assert.equal(JSON.stringify(schedule("p")), before);
}
// Explicit modern attributes remain authoritative despite free-form titles.
reset({ title: dry + start + "\u30fb" + end, recordKind: "water", waterKind: "dry", waterPhase: "start" });
assert(save()); done("start");
const confirmation = dry + "\u78ba\u8a8d";
for (const title of [confirmation, confirmation + "\u4e88\u5b9a"]) {
  reset({ title });
  const before = snapshot();
  assert.equal(state.isWaterConfirmationSchedule(schedule("p")), true);
  assert.equal(state.waterScheduleTarget(schedule("p")), null);
  assert.equal(snapshot(), before);
  assert(save()); pending();
  const records = JSON.stringify(state.data().dryPeriods);
  assert(state.completeSchedule("p"));
  assert(schedule("p").completedManuallyAt);
  assert.equal(schedule("p").completionLink, undefined);
  assert.equal(JSON.stringify(state.data().dryPeriods), records);
  assert(state.replace(JSON.parse(snapshot())));
  assert.equal(state.isWaterConfirmationSchedule(schedule("p")), true);
}
for (const patch of [
  { title: confirmation + "\u6e08\u307f" }, { title: " " + confirmation },
  { title: confirmation + "\u30fb" + start }, { title: dry + start },
  { title: "unrelated", scheduleType: confirmation }, { targetScope: "offField" },
  { recordKind: "growth" }, { waterKind: "dry" }, { waterPhase: "start" },
  { waterKind: "invalid" }, { waterPhase: "invalid" }
]) {
  reset({ title: confirmation, ...patch });
  assert.equal(state.isWaterConfirmationSchedule(schedule("p")), false);
}
reset({ title: confirmation, recordKind: "water" });
assert.equal(state.isWaterConfirmationSchedule(schedule("p")), true);
const confirmationBefore = snapshot();
const confirmationStored = JSON.stringify([...memory]);
failWrites = true;
assert.equal(state.completeSchedule("p"), null);
failWrites = false;
assert.equal(snapshot(), confirmationBefore);
assert.equal(JSON.stringify([...memory]), confirmationStored);
pending();
for (const [kind, title] of [
  ["intermittent", "\u9593\u65ad\u704c\u6c34"],
  ["saturated", "\u98fd\u6c34\u7ba1\u7406"],
  ["deep", "\u6df1\u6c34\u7ba1\u7406"],
  ["drain", "\u7a32\u5208\u308a\u524d\u306e\u843d\u6c34"]
]) {
  reset({ title: title + start + "\u4e88\u5b9a" });
  assert.equal(state.waterScheduleTarget(schedule("p")).kind, kind);
  assert(state.saveIrrigation({ irrigationId: "i", fieldId: "a", method: title, date: "2026-06-22", startDate: "2026-06-22", sourceScheduleId: "p", sourceSchedulePhase: "start" }));
  assert.equal(schedule("p").completionLink.recordId, "i"); pending("other");
}
reset();
const unchanged = snapshot(); const stored = JSON.stringify([...memory]);
failWrites = true;
assert.equal(save(), null);
failWrites = false;
assert.equal(snapshot(), unchanged); assert.equal(JSON.stringify([...memory]), stored);
assert(save()); done("start");

// The parent exercises these routes with real confirmation dialogs at 360/390px.
const screen = read("assets/js/screens/irrigation.js");
assert.match(screen, /function prefillSchedule[\s\S]*?state\.waterScheduleTarget\(schedule\)/);
assert.match(screen, /function matchingWaterSchedule[\s\S]*?if \(pendingWaterSchedule\)[\s\S]*?scheduleId === pendingWaterSchedule\.scheduleId/);
assert.match(screen, /sourceScheduleId: linkedSchedule\?\.scheduleId/);
assert.match(screen, /const saved = state\.saveDryPeriodsBatch/);
const sheet = read("assets/js/screens/bottom-sheet.js");
assert.match(sheet, /isWaterConfirmation \? "confirm" : "complete"/);
assert.match(sheet, /sheetAction === "confirm"[\s\S]*?if \(confirm\([\s\S]*?state\.completeSchedule\(entry\.record\.scheduleId\)/);
assert(sheet.includes('title: "' + dry + start + '"'));
assert(sheet.includes('title: "' + dry + end + '"'));
assert(!sheet.includes('title: "' + confirmation + '"'));
console.log("PASS water schedule forms: legacy resolver, explicit IDs, shifted dates, boundaries, isolation, roundtrip and failures");
