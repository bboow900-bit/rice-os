"use strict";

// Exercises only an in-memory fixture. It must never read or alter the user's
// browser localStorage data.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const memory = new Map();
global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [], body: { appendChild() {} } };
global.alert = () => {};
global.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
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

load("assets/js/core/utils.js");
load("assets/js/core/schema.js");
const S = global.RiceOS.schema;
const fieldId = "field_water_test";
memory.set(S.STORE_KEY, JSON.stringify(S.normalize({
  varieties: [{ varietyId: "variety_water_test", name: "test" }],
  fields: [{ fieldId, name: "test field", varietyId: "variety_water_test", areaA: 10 }],
  schedules: [
    { scheduleId: "schedule_dry_start", date: "2026-06-20", fieldIds: [fieldId], recordKind: "water", waterKind: "dry", waterPhase: "start", title: "dry start" },
    { scheduleId: "schedule_inter_end", date: "2026-07-20", fieldIds: [fieldId], recordKind: "water", waterKind: "intermittent", waterPhase: "end", title: "intermittent end" }
  ]
})));
load("assets/js/core/storage.js");
load("assets/js/core/state.js");
const state = global.RiceOS.state;

state.saveDryPeriod({ dryPeriodId: "dry_real", fieldId, date: "2026-06-21", startDate: "2026-06-21", sourceScheduleId: "schedule_dry_start", sourceSchedulePhase: "start" });
let drySchedule = state.data().schedules.find((row) => row.scheduleId === "schedule_dry_start");
assert(drySchedule.completedByWaterPeriodId === "dry_real", "Drying start did not link its exact schedule");
assert(drySchedule.completionLink && drySchedule.completionLink.event === "start", "Drying start completion link is missing");

state.deleteDryPeriod("dry_real");
drySchedule = state.data().schedules.find((row) => row.scheduleId === "schedule_dry_start");
assert(!drySchedule.completedAt && !drySchedule.completionLink, "Deleting a linked water period did not reopen its schedule");

state.saveIrrigation({ irrigationId: "water_real", fieldId, method: "間断灌水", date: "2026-07-10", startDate: "2026-07-10" });
state.saveIrrigation({ irrigationId: "water_real", fieldId, method: "間断灌水", date: "2026-07-10", startDate: "2026-07-10", actualEndDate: "2026-07-21", sourceScheduleId: "schedule_inter_end", sourceSchedulePhase: "end" });
const endSchedule = state.data().schedules.find((row) => row.scheduleId === "schedule_inter_end");
assert(endSchedule.completedByWaterPeriodId === "water_real", "Intermittent end did not link its exact schedule");
assert(endSchedule.completionLink && endSchedule.completionLink.event === "end", "Intermittent end completion link is missing");

state.saveSchedule({ scheduleId: "manual_done", date: "2026-07-25", fieldIds: [fieldId], recordKind: "water", waterKind: "deep", waterPhase: "start", title: "manual", completedAt: "2026-07-25T09:00:00", completedManuallyAt: "2026-07-25T09:00:00" });
state.saveIrrigation({ irrigationId: "deep_real", fieldId, method: "深水管理", date: "2026-07-25", startDate: "2026-07-25", sourceScheduleId: "manual_done", sourceSchedulePhase: "start" });
const manualDone = state.data().schedules.find((row) => row.scheduleId === "manual_done");
assert(!manualDone.completionLink && manualDone.completedManuallyAt, "Water saving overwrote a manual schedule completion");

state.saveSchedule({ scheduleId: "end_without_actual", date: "2026-07-26", fieldIds: [fieldId], recordKind: "water", waterKind: "deep", waterPhase: "end", title: "end" });
state.saveIrrigation({ irrigationId: "deep_pending", fieldId, method: "深水管理", date: "2026-07-26", startDate: "2026-07-26", sourceScheduleId: "end_without_actual", sourceSchedulePhase: "end" });
const endWithoutActual = state.data().schedules.find((row) => row.scheduleId === "end_without_actual");
assert(!endWithoutActual.completedAt, "An end schedule completed without an actual end date");

const secondFieldId = "field_water_test_2";
state.updateField(fieldId, { name: "test field" });
state.addField("group test field");
const addedField = state.fields().find((row) => row.name === "group test field");
state.saveSchedule({ scheduleId: "group_start_a", date: "2026-08-01", fieldIds: [fieldId], recordKind: "water", waterKind: "dry", waterPhase: "start", title: "group A" });
state.saveSchedule({ scheduleId: "group_start_b", date: "2026-08-01", fieldIds: [addedField.fieldId], recordKind: "water", waterKind: "dry", waterPhase: "start", title: "group B" });
state.saveDryPeriodsBatch([
  { dryPeriodId: "group_dry_a", fieldId, date: "2026-08-01", startDate: "2026-08-01", sourceScheduleId: "group_start_a", sourceSchedulePhase: "start" },
  { dryPeriodId: "group_dry_b", fieldId: addedField.fieldId, date: "2026-08-01", startDate: "2026-08-01", sourceScheduleId: "group_start_b", sourceSchedulePhase: "start" }
]);
assert(state.data().schedules.find((row) => row.scheduleId === "group_start_a").completedByWaterPeriodId === "group_dry_a", "First group field did not complete its own schedule");
assert(state.data().schedules.find((row) => row.scheduleId === "group_start_b").completedByWaterPeriodId === "group_dry_b", "Second group field did not complete its own schedule");

const stored = S.normalize(state.data());
assert(stored.schedules.find((row) => row.scheduleId === "schedule_inter_end").completedByWaterPeriodId === "water_real", "Schedule water link was not JSON-safe");
console.log("PASS water schedule links");
