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

for (const kind of ["dry", "irrigation"]) {
  const idKey = kind === "dry" ? "dryPeriodId" : "irrigationId";
  const collection = kind === "dry" ? "dryPeriods" : "irrigations";
  const save = kind === "dry" ? state.saveDryPeriod : state.saveIrrigation;
  const saveBatch = kind === "dry" ? state.saveDryPeriodsBatch : state.saveIrrigationsBatch;
  const recordId = `${kind}_reopen`;
  const scheduleId = `${recordId}_end`;
  const schedule = (id) => state.data().schedules.find((row) => row.scheduleId === id);
  const period = () => state.data()[collection].find((row) => row[idKey] === recordId);
  const base = { fieldIds: [fieldId], date: "2026-08-20", title: "reopen test", recordKind: "water", waterKind: kind === "dry" ? "dry" : "intermittent", waterPhase: "end" };
  state.saveSchedule({ ...base, scheduleId });
  assert(save({ [idKey]: recordId, fieldId, date: "2026-08-01", startDate: "2026-08-01", actualEndDate: "2026-08-20", method: "間断灌水", sourceScheduleId: scheduleId, sourceSchedulePhase: "end" }), `${kind}: initial save failed`);
  assert(schedule(scheduleId).completionLink.event === "end", `${kind}: end did not complete`);

  const protectedIds = [];
  for (const [suffix, link, extra] of [
    ["start", { kind, recordId, event: "start" }, {}],
    ["other_record", { kind, recordId: `${recordId}_other`, event: "end" }, {}],
    ["other_kind", { kind: kind === "dry" ? "irrigation" : "dry", recordId, event: "end" }, {}],
    ["no_event", { kind, recordId, event: "" }, {}],
    ["manual", null, { completedManuallyAt: "2026-08-20T12:00:00", status: "手動完了" }],
    ["manual_link", { kind, recordId, event: "end" }, { completedManuallyAt: "2026-08-20T12:00:00", status: "手動完了" }],
    ["work", { kind, recordId, event: "end" }, { completedByWorkId: "unrelated_work" }]
  ]) {
    const id = `${recordId}_${suffix}`;
    state.saveSchedule({ ...base, scheduleId: id, completedAt: "2026-08-20T12:00:00", status: "実施済み", completionLink: link && { ...link, fieldId }, ...extra });
    protectedIds.push(id);
  }
  const protectedBefore = JSON.stringify(protectedIds.map(schedule));
  const beforeCancel = JSON.stringify(state.data());
  const storageBeforeCancel = JSON.stringify([...memory]);
  const cancelledDraft = JSON.parse(JSON.stringify(period()));
  cancelledDraft.actualEndDate = "";
  assert(saveBatch([]) === null, `${kind}: empty batch should be a no-op`);
  assert(JSON.stringify(state.data()) === beforeCancel && JSON.stringify([...memory]) === storageBeforeCancel, `${kind}: cancelled draft/empty batch mutated data`);

  assert(save(cancelledDraft), `${kind}: reopening failed`);
  const reopened = schedule(scheduleId);
  assert(reopened.status === "予定" && !reopened.completedAt && !reopened.completedByWaterPeriodId && !reopened.completionLink && !reopened.completionReason, `${kind}: clearing actual end did not reopen exact end schedule`);
  assert(JSON.stringify(protectedIds.map(schedule)) === protectedBefore, `${kind}: reopening altered an unrelated/start/manual completion`);
  assert(!period().actualEndDate && period().sourceScheduleId === scheduleId, `${kind}: source link was lost`);
  const reloaded = RiceOS.storage.loadData();
  assert(!reloaded[collection].find((row) => row[idKey] === recordId).actualEndDate, `${kind}: reopened period did not persist`);
  assert(!reloaded.schedules.find((row) => row.scheduleId === scheduleId).completedAt, `${kind}: reopened schedule did not persist`);
  assert(state.replace(JSON.parse(JSON.stringify(reloaded))), `${kind}: reload failed`);
  const reopenedBefore = JSON.stringify(schedule(scheduleId));
  assert(save({ ...period(), memo: "still open" }), `${kind}: open-period edit failed`);
  assert(JSON.stringify(schedule(scheduleId)) === reopenedBefore, `${kind}: already-open edit changed schedule`);
  assert(save({ ...period(), actualEndDate: "2026-08-22" }), `${kind}: re-completion failed`);
  assert(schedule(scheduleId).completedByWaterPeriodId === recordId && schedule(scheduleId).completionLink.event === "end", `${kind}: re-completion did not relink`);
  assert(JSON.stringify(protectedIds.map(schedule)) === protectedBefore, `${kind}: re-completion altered protected schedules`);
  const completedReload = RiceOS.storage.loadData();
  assert(completedReload[collection].find((row) => row[idKey] === recordId).actualEndDate === "2026-08-22", `${kind}: re-completed end date did not persist`);
  assert(completedReload.schedules.find((row) => row.scheduleId === scheduleId).completionLink.recordId === recordId, `${kind}: re-completed link did not persist`);
}
console.log("PASS water schedule links");
