"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const date = "2026-09-28";
const data = {
  fieldWorks: [
    { workId: "field", fieldIds: ["a"], date, season: 2026, workName: "Field work" },
    { workId: "off", targetScope: "offField", fieldIds: [], date, season: 2026, workName: "Sowing" },
    { workId: "missing", fieldIds: [], date, season: 2026, workName: "Legacy unresolved" }
  ],
  otherWorks: [{ otherWorkId: "old", date, season: 2026, workName: "Legacy off field", relatedFieldIds: [], quantity: "10", varietyIds: ["v"] }],
  growthLogs: [], dryPeriods: [], irrigations: [], schedules: [
    { scheduleId: "plan", targetScope: "offField", fieldIds: [], date, season: 2026, title: "Off field plan" }
  ]
};
const before = JSON.stringify(data);
const field = { fieldId: "a", name: "A" };
const context = vm.createContext({
  __RICEOS_TEST__: true,
  document: { getElementById: () => null, querySelectorAll: () => [] },
  RiceOS: { state: { data: () => data, field: id => id === "a" ? field : null, activeFields: () => [field] } }
});
context.window = context;
for (const file of ["assets/js/core/utils.js", "assets/js/core/calendar.js", "assets/js/core/record-actions.js", "assets/js/screens/annual.js"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context, {filename: file});
}
const app = context.RiceOS;
const entries = app.calendar.entriesForDate(date);
assert.equal(entries.find(e => e.record.workId === "off").subtitle, "圃場外");
assert.equal(entries.find(e => e.record.scheduleId === "plan").subtitle, "圃場外");
assert.equal(entries.filter(e => e.kind === "other").length, 1);
assert.equal(app.calendar.recentEntries(20).filter(e => e.kind === "other").length, 1);
const rows = app.annualTest.allRows();
assert.equal(rows.filter(r => r.id === "off").length, 1);
assert.equal(rows.filter(r => r.id === "old").length, 1);
assert.equal(rows.filter(r => r.id === "missing").length, 0, "Missing field is not explicit off-field");
assert.equal(app.annualTest.rowsForField(rows, "a").length, 1);
const html = app.annualTest.renderWorkArchive(rows);
assert.match(html, /data-annual-work-scope="offField"/);
assert.match(html, /data-kind="fieldWork" data-id="off"/);
assert.match(html, /data-kind="other" data-id="old"/);
let edited = "";
app.app = { show: screen => { edited = screen; } };
app.screens.otherWork = { editWork: id => { edited += ":" + id; } };
assert.equal(app.recordActions.edit("other", data.otherWorks[0]), true);
assert.equal(edited, "other-work:old");
assert.equal(JSON.stringify(data), before);
console.log("Off-field calendar, review, old-record routes and read-only preservation passed");
