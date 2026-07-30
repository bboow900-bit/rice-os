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
const fieldId = "field-water-lane";
memory.set(schema.STORE_KEY, JSON.stringify(schema.normalize({
  varieties: [{ varietyId: "variety-water-lane", name: "天のつぶ" }],
  fields: [{ fieldId, name: "亀石 右下", varietyId: "variety-water-lane", areaA: 20 }]
})));
load("assets/js/core/storage.js");
load("assets/js/core/state.js");
const state = global.RiceOS.state;
state.saveDryPeriod({
  dryPeriodId: "dry-2026", fieldId, date: "2026-06-24", startDate: "2026-06-24", actualEndDate: "2026-07-11"
});
state.saveIrrigation({
  irrigationId: "intermittent-2026", fieldId, method: "間断灌水", date: "2026-07-11", startDate: "2026-07-11"
});
state.saveDryPeriod({
  dryPeriodId: "same-day-water", fieldId, date: "2026-07-22", startDate: "2026-07-22", actualEndDate: "2026-07-22"
});
load("assets/js/screens/annual.js");

const input = [
  {
    id: "dry-2026", editId: "dry-2026", lane: "water", periodRole: "start",
    periodStartDate: "2026-06-24", periodEndDate: "2026-07-11", periodLineEndDate: "2026-07-11"
  },
  {
    id: "intermittent-2026", editId: "intermittent-2026", lane: "water", periodRole: "start",
    periodStartDate: "2026-07-11", periodEndDate: "", periodLineEndDate: "2026-07-31"
  }
];
const before = JSON.stringify(input);
const assigned = global.RiceOS.annualTest.assignWaterPeriodTracks(input);

assert(JSON.stringify(input) === before, "Water lane allocation mutated saved-record input");
assert(assigned[0].periodTrack === assigned[1].periodTrack, "Same-day water handoff did not share one stable track");
assert(assigned[1].periodTransition === true, "Same-day intermittent irrigation start was not marked as a handoff");
assert(assigned[1].periodLineEndDate === "2026-07-31", "Ongoing water management did not stop at the display date");

const sameDay = [
  { periodRole: "start", label: "間断灌水" },
  { periodRole: "end", label: "中干し 完了" }
].sort((a, b) => global.RiceOS.annualTest.waterRoleRank(a) - global.RiceOS.annualTest.waterRoleRank(b));
assert(sameDay.map((entry) => entry.periodRole).join(",") === "end,start", "Same-day end/start cards are not ordered completion then start");

const timeline = global.RiceOS.annualTest.fieldYearTimeline(state.fields()[0], 2026);
const handoffCards = timeline.filter((entry) => entry.date === "2026-07-11" && entry.lane === "water");
assert(handoffCards.length === 2, "Same-day handoff did not create both completion and new-start cards");
assert(handoffCards[0].periodRole === "end" && handoffCards[1].periodRole === "start", "Rendered handoff order is not completion then start");
const ongoingCard = timeline.find((entry) => entry.editId === "intermittent-2026" && entry.periodRole === "current");
assert(ongoingCard && ongoingCard.date === "2026-07-31", "Ongoing period does not render an endpoint at today");
const currentTrack = global.RiceOS.annualTest.waterTrackMarkup(timeline, "2026-07-31");
assert(/\bcurrent\b/.test(currentTrack) && !/\bend\b/.test(currentTrack), "Ongoing endpoint is visually marked as completed");
const sameDayCards = timeline.filter((entry) => entry.editId === "same-day-water");
assert(sameDayCards.length === 1 && /当日完了/.test(sameDayCards[0].label), "Same-day water record was not kept as one compact completion card");
assert(global.RiceOS.annualTest.waterTrackMarkup(sameDayCards, "2026-07-22") === "", "Same-day water record incorrectly drew a period line");

console.log("PASS annual water lane: stable handoff track, completion-before-start, ongoing endpoint, data untouched");
