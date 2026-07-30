"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const memory = new Map();
global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [] };
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
global.alert = () => {};
global.dispatchEvent = () => true;
global.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
global.RiceOS = {};
global.__RICEOS_TEST__ = true;

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("assets/js/core/utils.js");
load("assets/js/core/schema.js");

const schema = global.RiceOS.schema;
const fieldId = "field-water-flow";
memory.set(schema.STORE_KEY, JSON.stringify(schema.normalize({
  varieties: [{ varietyId: "variety-water-flow", name: "Test variety" }],
  fields: [{ fieldId, name: "Test field", varietyId: "variety-water-flow", areaA: 20 }]
})));
load("assets/js/core/storage.js");
load("assets/js/core/state.js");
const state = global.RiceOS.state;
const intermittent = "\u9593\u65ad\u704c\u6c34";

state.saveDryPeriod({
  dryPeriodId: "dry-2026", fieldId, date: "2026-06-24", startDate: "2026-06-24", actualEndDate: "2026-07-11"
});
state.saveIrrigation({
  irrigationId: "intermittent-2026", fieldId, method: intermittent, date: "2026-07-11", startDate: "2026-07-11"
});
state.saveDryPeriod({
  dryPeriodId: "same-day-water", fieldId, date: "2026-07-22", startDate: "2026-07-22", actualEndDate: "2026-07-22"
});
load("assets/js/screens/annual.js");

const before = JSON.stringify(state.data());
const timeline = global.RiceOS.annualTest.fieldYearTimeline(state.fields()[0], 2026);
assert(JSON.stringify(state.data()) === before, "Annual flow mutated stored water records");

const sameDay = [
  { periodRole: "start" },
  { periodRole: "end" }
].sort((a, b) => global.RiceOS.annualTest.waterRoleRank(a) - global.RiceOS.annualTest.waterRoleRank(b));
assert(sameDay.map((entry) => entry.periodRole).join(",") === "end,start", "Same-day completion must precede a new water-management start");

const handoff = timeline.filter((entry) => entry.date === "2026-07-11" && entry.lane === "water");
assert(handoff.length === 2, "Same-day handoff must retain both source markers");
assert(handoff[0].periodRole === "end-marker" && handoff[1].periodRole === "start", "Same-day handoff order is incorrect");
assert(handoff.filter((entry) => !entry.isWaterMarker).length === 1, "Same-day handoff duplicated its displayed water card");

const completed = timeline.find((entry) => entry.editId === "dry-2026" && !entry.isWaterMarker);
assert(completed && completed.days === 17, "Completed water period lost its calculated duration");
assert(/\u958b\u59cb/.test(completed.detail) && /\u5b8c\u4e86/.test(completed.detail), "Completed water period lost start/end text");

const ongoing = timeline.find((entry) => entry.editId === "intermittent-2026" && !entry.isWaterMarker);
assert(ongoing && /\u7d99\u7d9a\u4e2d/.test(ongoing.detail) && Number(ongoing.days) > 0, "Ongoing water period lost its current summary");

const compactSameDay = timeline.filter((entry) => entry.editId === "same-day-water");
assert(compactSameDay.length === 1 && !compactSameDay[0].isWaterMarker, "Same-day water record must remain one compact card");

console.log("PASS annual flow: one-card water periods, chronological handoff, data untouched");
