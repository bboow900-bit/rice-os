"use strict";

// Navigation must only choose a screen and pass stable IDs. This test uses an
// in-memory fixture so it never reads or writes the user's localStorage data.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const memory = new Map();

global.window = global;
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} }
};
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
global.alert = () => {};
global.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }
};
global.dispatchEvent = () => true;
global.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stable(value[key]);
    return result;
  }, {});
}

function recordIds(rows, key) {
  return (rows || []).map((row) => String(row[key] || "")).sort();
}

function fieldReferences(data) {
  return {
    fields: (data.fields || []).map((row) => [row.fieldId, row.varietyId, row.fieldGroupId]).sort(),
    works: (data.fieldWorks || []).map((row) => [row.workId, ...(row.fieldIds || []).slice().sort()]).sort(),
    growth: (data.growthLogs || []).map((row) => [row.logId, row.fieldId]).sort(),
    dry: (data.dryPeriods || []).map((row) => [row.dryPeriodId, row.fieldId]).sort(),
    irrigation: (data.irrigations || []).map((row) => [row.irrigationId, row.fieldId]).sort(),
    schedules: (data.schedules || []).map((row) => [row.scheduleId, ...(row.fieldIds || []).slice().sort()]).sort(),
    results: (data.varietyResults || []).map((row) => [row.resultId, row.fieldId, row.varietyId]).sort()
  };
}

function photoReferences(data) {
  const photos = [];
  const add = (kind, id, row) => {
    if (!row || (!row.photo && !row.photoData)) return;
    photos.push([kind, id, row.photo || "", row.photoData || ""]);
  };
  (data.fieldWorks || []).forEach((row) => add("work", row.workId, row));
  (data.growthLogs || []).forEach((row) => add("growth", row.logId, row));
  (data.dryPeriods || []).forEach((row) => add("dry", row.dryPeriodId, row));
  (data.irrigations || []).forEach((row) => add("irrigation", row.irrigationId, row));
  (data.photos || []).forEach((row, index) => add("photo", row.photoId || row.id || String(index), row));
  return photos.sort();
}

function navigationSafetySnapshot(data) {
  return stable({
    ids: {
      varieties: recordIds(data.varieties, "varietyId"),
      fieldGroups: recordIds(data.fieldGroups, "fieldGroupId"),
      fields: recordIds(data.fields, "fieldId"),
      fieldWorks: recordIds(data.fieldWorks, "workId"),
      growthLogs: recordIds(data.growthLogs, "logId"),
      dryPeriods: recordIds(data.dryPeriods, "dryPeriodId"),
      irrigations: recordIds(data.irrigations, "irrigationId"),
      schedules: recordIds(data.schedules, "scheduleId"),
      results: recordIds(data.varietyResults, "resultId"),
      shipments: recordIds(data.shipments, "shipmentId")
    },
    fieldReferences: fieldReferences(data),
    photos: photoReferences(data)
  });
}

load("assets/js/core/utils.js");
load("assets/js/core/schema.js");
const S = global.RiceOS.schema;

const fixture = S.normalize({
  varieties: [{ varietyId: "variety_main", name: "test variety" }],
  fieldGroups: [{ fieldGroupId: "group_main", name: "test group" }],
  fields: [
    { fieldId: "field_a", name: "field A", varietyId: "variety_main", fieldGroupId: "group_main", areaA: 10 },
    { fieldId: "field_b", name: "field B", varietyId: "variety_main", fieldGroupId: "group_main", areaA: 12 }
  ],
  fieldWorks: [{
    workId: "work_batch", date: "2026-05-10", fieldIds: ["field_a", "field_b"], batchId: "batch_planting",
    batchFieldIds: ["field_a", "field_b"], workName: "田植え", photoData: "data:image/png;base64,work",
    weatherAuto: { source: "fixture", temperature: { average: 22 } }
  }],
  growthLogs: [{ logId: "growth_a", date: "2026-06-10", fieldId: "field_a", panicleLengthMm: "8", photoData: "data:image/png;base64,growth" }],
  dryPeriods: [{ dryPeriodId: "dry_a", fieldId: "field_a", date: "2026-06-20", startDate: "2026-06-20", actualEndDate: "2026-06-27", photoData: "data:image/png;base64,dry" }],
  irrigations: [{ irrigationId: "water_b", fieldId: "field_b", date: "2026-07-01", startDate: "2026-07-01", method: "間断灌水", photoData: "data:image/png;base64,water" }],
  schedules: [{ scheduleId: "schedule_a", date: "2026-07-15", fieldIds: ["field_a", "field_b"], title: "追肥予定" }],
  otherWorks: [{ otherWorkId: "other_a", date: "2026-03-20", season: "2026", relatedFieldIds: ["field_a"], workName: "機械整備", memo: "tractor" }],
  varietyResults: [{ resultId: "result_a", season: 2026, fieldId: "field_a", varietyId: "variety_main", yield: "600" }],
  shipments: [{ shipmentId: "shipment_a", date: "2026-10-01", varietyId: "variety_main", quantity: "500" }],
  photos: [{ photoId: "standalone_photo", photoData: "data:image/png;base64,standalone" }]
});

const before = navigationSafetySnapshot(fixture);
memory.set(S.STORE_KEY, JSON.stringify(fixture));
const rawBeforeSelectors = memory.get(S.STORE_KEY);

load("assets/js/core/storage.js");
load("assets/js/core/state.js");
const state = global.RiceOS.state;

// These are the record reads a common field detail/navigation layer requires.
const groupFields = state.fieldsForGroup("group_main");
assert(groupFields.length === 2, "Group navigation lost a field membership");
["field_a", "field_b"].forEach((fieldId) => {
  assert(state.field(fieldId), `Field detail could not resolve ${fieldId}`);
  state.fieldWorksFor(fieldId, 2026);
  state.growthLogsFor(fieldId, 2026);
  state.dryPeriodsFor(fieldId, 2026);
  state.irrigationsFor(fieldId, 2026);
  state.resolvedWaterPeriodsFor(fieldId, { year: 2026, includePlanned: true, forDisplay: true });
  state.seasonNotesForField(fieldId, 2026);
  const timeline = state.timelineEntriesForField(fieldId, { year: 2026, includePlanned: true });
  assert(!timeline.waterPeriods.some((row) => Object.prototype.hasOwnProperty.call(row, "raw")), "Timeline selector leaked a mutable water raw record");
  assert(Array.isArray(timeline.works) && Array.isArray(timeline.growth) && Array.isArray(timeline.others), "Timeline selector omitted a record collection");
  if (fieldId === "field_a") {
    timeline.works[0].weatherAuto.temperature.average = 99;
    timeline.others[0].memo = "changed";
  }
});

const afterSelectors = navigationSafetySnapshot(state.data());
assert(JSON.stringify(before) === JSON.stringify(afterSelectors), "Navigation selectors changed canonical IDs, field links, or photo data");
assert(memory.get(S.STORE_KEY) === rawBeforeSelectors, "Navigation selectors wrote the fixture storage");

// The application router is deliberately presentation-only. A navigation
// change must not introduce direct record mutation APIs into app.js.
const appSource = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const navStart = appSource.indexOf("function bindNav()");
const navEnd = appSource.indexOf("function bindGlobalActions()", navStart);
const navSource = appSource.slice(navStart, navEnd);
assert(navStart >= 0 && navEnd > navStart, "Could not isolate the bottom-navigation handler");
assert(!/RiceOS\.state\.(save|replace|mutate|update|delete|add)[A-Za-z]*/.test(navSource), "Bottom navigation directly calls a persisted-record mutation API");

console.log("PASS navigation data safety");
console.log(JSON.stringify({
  fields: before.ids.fields.length,
  works: before.ids.fieldWorks.length,
  growthLogs: before.ids.growthLogs.length,
  dryPeriods: before.ids.dryPeriods.length,
  irrigations: before.ids.irrigations.length,
  schedules: before.ids.schedules.length,
  photos: before.photos.length
}, null, 2));
