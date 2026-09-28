"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
for (const name of ["utils", "schema", "storage"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, `assets/js/core/${name}.js`), "utf8"));
}
const idea = (ideaId, text, done = false) => ({ ideaId, text, done, createdAt: "2026-09-01", updatedAt: "2026-09-15" });
const current = { meta: { nextSeasonIdeas: [idea("same", "Current", true), idea("local", "Local")] } };
const incoming = { meta: { nextSeasonIdeas: [idea("same", "Incoming"), idea("new", "New"), idea("new", "Duplicate")] } };
const before = JSON.stringify([current, incoming]);
const result = RiceOS.storage.mergeData(current, incoming);
assert.deepEqual(result.data.meta.nextSeasonIdeas, [...current.meta.nextSeasonIdeas, incoming.meta.nextSeasonIdeas[1]]);
assert.equal(result.added.nextSeasonIdeas, 1);
assert.equal(result.skipped.nextSeasonIdeas, 2);
assert.equal(JSON.stringify([current, incoming]), before, "Merge must not mutate inputs");
const repeated = RiceOS.storage.mergeData(result.data, incoming);
assert.deepEqual(repeated.data.meta.nextSeasonIdeas, result.data.meta.nextSeasonIdeas);
assert.equal(repeated.added.nextSeasonIdeas, 0);
assert.deepEqual(RiceOS.storage.mergeData(current, {}).data.meta.nextSeasonIdeas, current.meta.nextSeasonIdeas);
assert.deepEqual(RiceOS.storage.mergeData({}, incoming).data.meta.nextSeasonIdeas, incoming.meta.nextSeasonIdeas.slice(0, 2));
const noIds = { meta: { nextSeasonIdeas: [{ text: "Legacy" }, { text: "Legacy" }] } };
const normalizedNoIds = RiceOS.schema.normalize(noIds).meta.nextSeasonIdeas;
const legacyMerge = RiceOS.storage.mergeData({}, noIds);
assert.deepEqual(legacyMerge.data.meta.nextSeasonIdeas, normalizedNoIds);
assert.equal(legacyMerge.added.nextSeasonIdeas, 2, "Distinct generated IDs must not be deduplicated by text");
const legacyRepeat = RiceOS.storage.mergeData(legacyMerge.data, noIds);
assert.equal(legacyRepeat.added.nextSeasonIdeas, 0);
assert.equal(legacyRepeat.skipped.nextSeasonIdeas, 2);
const legacyConflict = RiceOS.storage.mergeData(noIds, { meta: { nextSeasonIdeas: [{ text: "Changed legacy" }] } });
assert.deepEqual(legacyConflict.data.meta.nextSeasonIdeas, normalizedNoIds, "Generated same IDs also use current-wins policy");
assert.equal(legacyConflict.added.nextSeasonIdeas, 0);
assert.equal(legacyConflict.skipped.nextSeasonIdeas, 1);
const memory = new Map();
global.localStorage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
RiceOS.storage.saveData(result.data);
delete window.__riceMemoryData;
assert.deepEqual(RiceOS.storage.loadData().meta.nextSeasonIdeas, result.data.meta.nextSeasonIdeas);
let exportedText;
RiceOS.utils.download = (filename, text) => { exportedText = text; };
RiceOS.storage.exportJson(RiceOS.storage.loadData());
assert.deepEqual(JSON.parse(exportedText).meta.nextSeasonIdeas, result.data.meta.nextSeasonIdeas);
RiceOS.storage.importJsonText(exportedText);
delete window.__riceMemoryData;
assert.deepEqual(RiceOS.storage.loadData().meta.nextSeasonIdeas, result.data.meta.nextSeasonIdeas);
const savedBefore = JSON.stringify([...memory]);
const noOp = RiceOS.storage.mergeData(RiceOS.storage.loadData(), JSON.parse(exportedText));
assert.equal(noOp.added.nextSeasonIdeas, 0);
assert.equal(noOp.skipped.nextSeasonIdeas, 3);
assert.equal(JSON.stringify([...memory]), savedBefore, "Merge preview/cancellation must not write storage");

const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: "", disabled: false, dataset: {}, handlers: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, addEventListener(type, fn) { this.handlers[type] = fn; }
  });
  return elements.get(id);
}
let groups = [{ fieldGroupId: "g", fields: [{ fieldId: "a", name: "A" }, { fieldId: "b", name: "B" }] }];
const fields = [...groups[0].fields, { fieldId: "unassigned", name: "Unassigned" }];
const opened = [];
const prefilled = [];
let cleared = 0;
let toasted = 0;
Object.assign(RiceOS.utils, {
  $: element, $$: () => [], toast: () => toasted++,
  setOptions(select, options, value) { select.value = options.some((option) => option.value === value) ? value : ""; }
});
RiceOS.state = { activeFields: () => fields, field: (id) => fields.find((field) => field.fieldId === id), groupedFields: () => groups };
RiceOS.calendar = { entriesForDate: () => [] };
RiceOS.app = { currentScreen: () => "home", openInput: (screen) => opened.push(screen) };
RiceOS.navigation = { clear: () => cleared++ };
RiceOS.screens = { fieldWork: { prefillFields: (date, ids) => prefilled.push(ids) } };
vm.runInThisContext(fs.readFileSync(path.join(root, "assets/js/screens/bottom-sheet.js"), "utf8"));
RiceOS.screens.bottomSheet.bind();
const change = (id, value) => { element(id).value = value; element(id).handlers.change(); };
const click = (selector, dataset = {}) => element("dateSheet").handlers.click({ target: { closest: (query) => query === selector ? { dataset } : null } });
function start() {
  RiceOS.bottomSheet.open("2026-09-15", "a");
  click("[data-sheet-add]", { sheetAdd: "work" });
}
function blocked() {
  assert.equal(element("sheetOpenRecord").disabled, true);
  const before = JSON.stringify([opened, prefilled, cleared]);
  click("#sheetOpenRecord");
  assert.equal(JSON.stringify([opened, prefilled, cleared]), before, "Invalid target must not navigate or prefill");
}
start();
change("sheetTargetMode", "group");
blocked();
change("sheetGroup", "missing");
blocked();
change("sheetGroup", "g");
assert.equal(element("sheetOpenRecord").disabled, false);
click("#sheetOpenRecord");
assert.deepEqual(prefilled.at(-1), ["a", "b"]);
start();
change("sheetTargetMode", "group");
change("sheetGroup", "g");
change("sheetGroup", "");
blocked();
change("sheetGroup", "g");
groups = [];
RiceOS.bottomSheet.render();
assert.equal(element("sheetTargetMode").value, "group", "Removed groups must not switch to a stale individual");
blocked();
change("sheetTargetMode", "field");
assert.equal(element("sheetOpenRecord").disabled, false);
element("sheetField").value = "";
click("#sheetOpenRecord");
assert.equal(prefilled.length, 1, "Cleared select must not reuse cached field even before change fires");
change("sheetField", "");
blocked();
change("sheetField", "b");
click("#sheetOpenRecord");
assert.deepEqual(prefilled.at(-1), ["b"]);
assert.ok(toasted >= 6);

const schedules = [];
RiceOS.state.saveSchedule = (record) => { schedules.push(record); return record; };
start();
element("sheetScheduleTitle").value = "Group schedule";
element("sheetScheduleMemo").value = "Keep this draft";
element("sheetScheduleTargetMode").value = "group";
let prevented = 0;
let hidden = 0;
element("sheetScheduleForm").classList.add = () => hidden++;
const submitSchedule = () => element("sheetScheduleForm").handlers.submit({ preventDefault: () => prevented++ });
groups = [{ fieldGroupId: "g", fields: fields.slice(0, 2) }, { fieldGroupId: "empty", fields: [] }];
for (const groupId of ["", "missing", "empty"]) {
  element("sheetScheduleGroup").value = groupId;
  const before = JSON.stringify([schedules, [...memory], hidden, opened, prefilled]);
  const toastBefore = toasted;
  submitSchedule();
  assert.equal(JSON.stringify([schedules, [...memory], hidden, opened, prefilled]), before, `Invalid schedule group ${groupId} must be a no-op`);
  assert.equal(element("sheetScheduleTitle").value, "Group schedule");
  assert.equal(element("sheetScheduleMemo").value, "Keep this draft");
  assert.equal(toasted, toastBefore + 1);
}
element("sheetScheduleGroup").value = "g";
submitSchedule();
assert.equal(prevented, 4, "Exercise the bound form submit handler");
assert.deepEqual(schedules.map((record) => record.fieldIds), [["a"], ["b"]]);
assert.ok(schedules[0].batchId);
assert.equal(schedules[0].batchId, schedules[1].batchId);
for (const record of schedules) {
  assert.deepEqual(record.batchFieldIds, ["a", "b"]);
  assert.equal(record.date, "2026-09-15");
  assert.equal(record.title, "Group schedule");
  assert.equal(record.memo, "Keep this draft");
}
assert.ok(hidden > 0, "Valid save closes the schedule form");
console.log("PASS: first-stage audit record/schedule targets and next-season idea merge");
