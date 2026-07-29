"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const memory = new Map();

global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [], body: { appendChild() {} } };
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
global.alert = () => {};
global.dispatchEvent = () => true;
global.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("assets/js/core/utils.js");
load("assets/js/core/schema.js");

const S = global.RiceOS.schema;
const varietyId = "variety_test";
const fieldId = "field_test";
const saved = S.normalize({
  varieties: [{ varietyId, name: "test" }],
  fields: [{ fieldId, name: "test field", varietyId, areaA: 10 }],
  fieldWorks: [
    { workId: "plant-plan", date: "2026-04-20", fieldIds: [fieldId], workName: "\u7530\u690d\u3048\u4e88\u5b9a" },
    { workId: "plant-actual", date: "2026-05-15", fieldIds: [fieldId], workName: "\u7530\u690d\u3048" },
    { workId: "heading-plan", date: "2026-07-20", fieldIds: [fieldId], workName: "\u51fa\u7a42\u4e88\u5b9a" },
    { workId: "heading-actual", date: "2026-08-03", fieldIds: [fieldId], workName: "\u51fa\u7a42\u78ba\u8a8d", sourceScheduleId: "schedule_heading" }
  ]
});
memory.set(S.STORE_KEY, JSON.stringify(saved));

load("assets/js/core/storage.js");
load("assets/js/core/state.js");
const state = global.RiceOS.state;

assert(state.plantingDateForField(fieldId, 2026) === "2026-05-15", "A planting plan became the planting-date anchor");
assert(state.headingDateForField(fieldId, 2026) === "2026-08-03", "A planned heading or an actual heading confirmation was resolved incorrectly");
assert(!state.isActualFieldWork({ date: "2026-05-01", workName: "\u4e2d\u5e72\u3057\u78ba\u8a8d\u5019\u88dc" }), "A confirmation candidate was classified as actual");
assert(state.isActualFieldWork({ date: "2026-08-03", workName: "\u51fa\u7a42\u78ba\u8a8d", sourceScheduleId: "schedule_heading" }), "A completed scheduled work was not classified as actual");

state.saveFieldWork({
  workId: "fertilizer-work",
  date: "2026-07-10",
  fieldIds: [fieldId],
  workName: "\u8ffd\u80a5",
  growthSnapshots: { leafColor: "4.2", panicleLengthMm: "10" }
});
state.saveFieldWork({
  workId: "fertilizer-work",
  date: "2026-07-10",
  fieldIds: [fieldId],
  workName: "\u8ffd\u80a5",
  memo: "edited in regular work form"
});
const fertilizer = state.data().fieldWorks.find((row) => row.workId === "fertilizer-work");
assert(JSON.stringify(fertilizer.growthSnapshots) === JSON.stringify({ leafColor: "4.2", panicleLengthMm: "10" }), "Regular work editing erased fertilizer growth snapshots");

const renamedGroup = S.normalize({
  varieties: [{ varietyId, name: "test" }],
  fieldGroups: [{ fieldGroupId: "group_kameishi", name: "renamed group" }],
  fields: [{ fieldId, name: "test field", varietyId, fieldGroupId: "group_kameishi" }]
});
const sameIdGroups = renamedGroup.fieldGroups.filter((group) => group.fieldGroupId === "group_kameishi");
assert(sameIdGroups.length === 1 && sameIdGroups[0].name === "renamed group", "Renamed default field group was duplicated");
assert(renamedGroup.fields.find((field) => field.fieldId === fieldId).fieldGroupId === "group_kameishi", "Field group membership changed during normalization");
const legacyGroupLabel = S.normalize({
  varieties: [{ varietyId, name: "test" }],
  fieldGroups: [{ fieldGroupId: "group_kameishi", name: "renamed group" }],
  fields: [{ fieldId, name: "test field", varietyId, fieldGroupId: "\u4e80\u77f3" }]
});
assert(legacyGroupLabel.fields.find((field) => field.fieldId === fieldId).fieldGroupId === "group_kameishi", "A legacy group label did not resolve to the renamed master");
const sameLabelGroups = S.normalize({
  varieties: [{ varietyId, name: "test" }],
  fieldGroups: [
    { fieldGroupId: "group_a", name: "same label" },
    { fieldGroupId: "group_b", name: "same label" }
  ],
  fields: [
    { fieldId: "field_a", name: "field a", varietyId, fieldGroupId: "group_a" },
    { fieldId: "field_b", name: "field b", varietyId, fieldGroupId: "group_b" }
  ]
});
assert(sameLabelGroups.fieldGroups.filter((group) => /^group_[ab]$/.test(group.fieldGroupId)).length === 2, "Different group IDs were collapsed by display name");
assert(sameLabelGroups.fields.find((field) => field.fieldId === "field_a").fieldGroupId === "group_a", "First same-label membership changed");
assert(sameLabelGroups.fields.find((field) => field.fieldId === "field_b").fieldGroupId === "group_b", "Second same-label membership changed");

console.log("PASS record semantics");
