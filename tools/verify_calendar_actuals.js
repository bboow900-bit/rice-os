"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
const context = vm.createContext({
  console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  navigator: {}, __RICEOS_TEST__: true,
  localStorage: {
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key)
  }
});
context.window = context;
function load(file) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context, { filename: file });
}
for (const name of ["utils", "schema", "storage", "state", "agro", "calendar"]) load(`assets/js/core/${name}.js`);
const { state, schema, calendar } = context.RiceOS;
const date = "2026-10-02";
const planned = "2026-10-01";
assert(state.replace(schema.normalize({
  fields: [{ fieldId: "a", name: "A" }],
  fieldWorks: [{ workId: "w", date, fieldIds: ["a"], workName: "mowing" }],
  growthLogs: [{ logId: "g", date, fieldId: "a" }],
  otherWorks: [{ otherWorkId: "o", date, workName: "office" }],
  shipments: [{ shipmentId: "s", date, season: 2025, kind: "gift", memo: "legacy" }],
  dryPeriods: [{ dryPeriodId: "dry", fieldId: "a", date, startDate: date }],
  irrigations: [{ irrigationId: "water", fieldId: "a", date, startDate: date, method: "\u6df1\u6c34\u7ba1\u7406" }],
  schedules: [
    { scheduleId: "work-plan", date: planned, fieldIds: ["a"], title: "mowing", completedAt: date, completedByWorkId: "w" },
    { scheduleId: "same-day", date, fieldIds: ["a"], title: "growth", completedAt: date, completionLink: { kind: "growth", recordId: "g" } },
    { scheduleId: "pending", date, fieldIds: ["a"], title: "pending" },
    { scheduleId: "dry-plan", date, fieldIds: ["a"], title: "\u4e2d\u5e72\u3057\u958b\u59cb", completedAt: date, completionLink: { kind: "dry", recordId: "dry", event: "start" } },
    { scheduleId: "water-plan", date, fieldIds: ["a"], title: "\u6df1\u6c34\u958b\u59cb", completedAt: date, completedByWaterPeriodId: "water" },
    { scheduleId: "manual", date, fieldIds: ["a"], title: "\u4e2d\u5e72\u3057\u78ba\u8a8d", completedAt: date, completedManuallyAt: date },
    { scheduleId: "manual-water", date, fieldIds: ["a"], title: "manual", recordKind: "water", completedAt: date, completedManuallyAt: date },
    { scheduleId: "orphan", date, fieldIds: ["a"], title: "orphan", recordKind: "water", completedAt: date, completionLink: { kind: "dry", recordId: "missing" } }
  ]
})));
const before = JSON.stringify(state.data());
const stored = JSON.stringify([...memory]);
for (const kind of ["work", "other", "growth", "water", "dry", "irrigation", "shipment"]) {
  assert.equal(calendar.isActualEntry({ kind, record: {} }), true);
  assert.equal(calendar.isActualEntry({ kind, planned: true }), false);
  assert.equal(calendar.isActualEntry({ kind, tone: "schedule" }), false);
  assert.equal(calendar.isActualEntry({ kind, record: { status: "planned" } }), false);
}
for (const kind of ["schedule", "schedule-completed", "candidate", "planned", "unknown"]) {
  assert.equal(calendar.isActualEntry({ kind, record: { completedAt: date } }), false);
}
assert.equal(calendar.isActualEntry(null), false);
const entries = calendar.entriesForDate(date);
const scheduleIds = entries.filter(e => e.kind === "schedule").map(e => e.record.scheduleId);
for (const id of ["same-day", "pending", "manual", "manual-water", "orphan"]) assert(scheduleIds.includes(id));
for (const id of ["dry-plan", "water-plan"]) assert(!scheduleIds.includes(id));
assert(entries.some(e => e.kind === "schedule-completed" && e.record.scheduleId === "work-plan"));
assert(calendar.entriesForDate(planned).some(e => e.record.scheduleId === "work-plan"));
const actuals = entries.filter(calendar.isActualEntry);
assert.equal(actuals.length, 6);
assert.equal(actuals.filter(e => e.kind === "work").length, 1);
assert.equal(actuals.filter(e => e.kind === "shipment").length, 1);
assert.equal(actuals.filter(e => ["dry", "irrigation"].includes(e.kind)).length, 2);

load("assets/js/screens/annual.js");
const rows = context.RiceOS.annualTest.allRows();
for (const id of ["dry-plan", "water-plan"]) assert(!rows.some(row => row.kind === "schedule" && row.id === id));
for (const id of ["manual", "manual-water", "orphan", "work-plan"]) assert(rows.some(row => row.kind === "schedule" && row.id === id));

const originalData = state.data;
const base = JSON.parse(before);
const source = base.schedules.find(row => row.scheduleId === "dry-plan");
function retained(schedulePatch = {}, dataPatch = {}) {
  const fixture = { ...base, ...dataPatch, schedules: [{ ...source, ...schedulePatch }] };
  state.data = () => fixture;
  const unchanged = JSON.stringify(fixture);
  assert.equal(calendar.hasActualWaterCompletion(fixture.schedules[0]), false);
  assert(calendar.entriesForDate(fixture.schedules[0].date).some(entry => entry.kind === "schedule"));
  assert(context.RiceOS.annualTest.allRows().some(row => row.kind === "schedule"));
  assert.equal(JSON.stringify(fixture), unchanged);
}
try {
  for (const patch of [
    { fieldIds: ["wrong"] }, { fieldIds: ["a", "b"] }, { fieldIds: [] },
    { title: "\u4e2d\u5e72\u3057\u7d42\u4e86", completionLink: { kind: "dry", recordId: "dry", event: "end" } },
    { title: "\u6df1\u6c34\u958b\u59cb" }, { title: "\u4e2d\u5e72\u3057\u78ba\u8a8d" },
    { season: 2025 }, { date: "2025-10-02" }, { targetScope: "offField" },
    { completionLink: { kind: "irrigation", recordId: "dry", event: "start" } },
    { completionLink: { kind: "dry", recordId: "dry", event: "end" } },
    { completionLink: { kind: "dry", recordId: "dry" } },
    { completedByWaterPeriodId: "water" }
  ]) retained(patch);
  retained({}, { dryPeriods: [] });
  retained({}, { dryPeriods: [{ ...base.dryPeriods[0], startDate: "", actualEndDate: date }] });
  retained({}, { dryPeriods: [{ ...base.dryPeriods[0], fieldId: "wrong" }] });
  retained({}, { dryPeriods: [{ ...base.dryPeriods[0], startDate: "2025-10-02", season: 2025 }] });
  retained({ completionLink: { ...source.completionLink, fieldId: "wrong" } });
  for (const invalid of ["not-a-date", "2026-02-30", "2026-02-29", "2026-13-01", "2026-00-01", "2026-04-31", "2026-10-00", "2026-2-01", "2026-10-02T00:00:00Z", " 2026-10-02", null, 20261002, {}, [date]]) {
    retained({ date: invalid });
    retained({}, { dryPeriods: [{ ...base.dryPeriods[0], startDate: invalid }] });
    const invalidEnd = { ...source, title: "\u4e2d\u5e72\u3057\u7d42\u4e86", completionLink: { ...source.completionLink, event: "end" } };
    state.data = () => ({ ...base, dryPeriods: [{ ...base.dryPeriods[0], actualEndDate: invalid }] });
    assert.equal(calendar.hasActualWaterCompletion(invalidEnd), false);
  }
  for (const valid of ["2024-02-29", "2000-02-29", "2026-02-28"]) {
    const year = Number(valid.slice(0, 4));
    state.data = () => ({ ...base, dryPeriods: [{ ...base.dryPeriods[0], startDate: valid, actualEndDate: valid, season: year }] });
    const validPlan = { ...source, date: valid, season: year, completionLink: { ...source.completionLink, fieldId: "a" } };
    assert.equal(calendar.hasActualWaterCompletion(validPlan), true);
    assert.equal(calendar.hasActualWaterCompletion({ ...validPlan, title: "\u4e2d\u5e72\u3057\u7d42\u4e86", completionLink: { ...validPlan.completionLink, event: "end" } }), true);
  }
  const endPlan = { ...source, title: "\u4e2d\u5e72\u3057\u7d42\u4e86", completionLink: { kind: "dry", recordId: "dry", event: "end" } };
  state.data = () => ({ ...base, dryPeriods: [{ ...base.dryPeriods[0], actualEndDate: date }] });
  assert.equal(calendar.hasActualWaterCompletion(endPlan), true);
  const waterPlan = base.schedules.find(row => row.scheduleId === "water-plan");
  state.data = () => ({ ...base, irrigations: [{ ...base.irrigations[0], method: "\u9593\u65ad\u704c\u6c34" }] });
  assert.equal(calendar.hasActualWaterCompletion(waterPlan), false);
} finally { state.data = originalData; }

load("assets/js/screens/home.js");
// Isolate generated candidate suggestions; use actual calendar entries unchanged.
const activeFields = state.activeFields;
const entriesForDate = calendar.entriesForDate;
state.activeFields = () => [];
calendar.entriesForDate = () => entries;
assert.equal(context.RiceOS.homeTest.actualEntriesForDate(date).length, 6);
assert.equal(context.RiceOS.homeTest.eventTone(entries.find(e => e.kind === "schedule-completed")), "plan-done");
state.activeFields = activeFields;
calendar.entriesForDate = entriesForDate;
assert.equal(JSON.stringify(state.data()), before);
assert.equal(JSON.stringify([...memory]), stored);
console.log("PASS calendar actual classification, home counts, legacy water deduplication, manual/orphan audit retention and no writes");
