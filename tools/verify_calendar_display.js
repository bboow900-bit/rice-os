"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element() {
  return { innerHTML: "", textContent: "", value: "", listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } };
}
const ids = Object.fromEntries(["calendarGrid", "calendarTitle", "selectedDateTitle", "selectedDateMeta", "selectedDateEntries", "selectedDateSummary", "calendarDisplayMode", "calendarSelectionMode", "calendarToday"].map((id) => [id, element()]));
const moves = [-1, 1].map((move) => ({ ...element(), dataset: { calendarMove: String(move) } }));
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const entries = {
  "2026-10-02": [
    { kind: "schedule", title: "Plan <one>", record: {} },
    { kind: "water", title: "Water plan", planned: true, record: {} },
    { kind: "schedule", title: "Third plan", record: {} },
    { kind: "schedule", title: "Done schedule", record: { status: "実施済み" } },
    { kind: "work", title: "Actual work", record: {} }
  ],
  "2026-10-03": [{ kind: "work", title: "Actual only", record: {} }]
};
const RiceOS = {
  utils: { today: () => "2026-10-02", $: (id) => ids[id], fd: (date) => date, attr: escape, escapeHTML: escape },
  state: { field: () => null },
  calendar: {
    monthStart: (date) => date.slice(0, 7) + "-01",
    monthLabel: (date) => date,
    daysForMonth: (date) => date.startsWith("2026-10") ? ["2026-10-02", "2026-10-03"] : [date],
    entriesForDate: (date) => entries[date] || [],
    addMonths: (date, difference) => {
      const parsed = new Date(date + "T00:00:00Z");
      parsed.setUTCMonth(parsed.getUTCMonth() + difference);
      return parsed.toISOString().slice(0, 10);
    }
  }
};
const before = JSON.stringify(entries);
const core = { window: { RiceOS } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/core/calendar.js"), "utf8"), core);
// Retain the small date/navigation fixture while using the real classification.
const isActualEntry = RiceOS.calendar.isActualEntry;
RiceOS.calendar = {
  ...RiceOS.calendar,
  monthStart: (date) => date.slice(0, 7) + "-01",
  monthLabel: (date) => date,
  daysForMonth: (date) => date.startsWith("2026-10") ? ["2026-10-02", "2026-10-03"] : [date],
  entriesForDate: (date) => entries[date] || [],
  isActualEntry
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/screens/calendar.js"), "utf8"), {
  window: { RiceOS }, document: { querySelectorAll: () => moves }
});
const screen = RiceOS.screens.calendar;
screen.bind();
screen.render();
assert.equal(ids.calendarDisplayMode.value, "planned");
assert.equal(ids.calendarSelectionMode.textContent, "予定のみ");
assert.match(ids.calendarGrid.innerHTML, /Plan &lt;one&gt;/);
assert.match(ids.calendarGrid.innerHTML, /calendar-event-more[^>]*>\+1/);
assert.equal((ids.calendarGrid.innerHTML.match(/class="calendar-event-label /g) || []).length, 2);
assert.match(ids.calendarGrid.innerHTML, /予定 3件/);
assert.doesNotMatch(ids.selectedDateEntries.innerHTML, /Done schedule|Actual work/);
assert.match(ids.selectedDateEntries.innerHTML, /Water plan/);
assert.match(ids.selectedDateTitle.textContent, /の予定$/);
ids.calendarDisplayMode.value = "all";
ids.calendarDisplayMode.listeners.change();
assert.match(ids.calendarGrid.innerHTML, />\+3</);
assert.match(ids.selectedDateEntries.innerHTML, /Done schedule/);
assert.match(ids.selectedDateEntries.innerHTML, /Actual work/);
assert.match(ids.selectedDateEntries.innerHTML, /実績 <span>1件/);
assert.match(ids.selectedDateEntries.innerHTML, /完了した予定 <span>1件/);
const trace = { kind: "schedule-completed", title: "Completion trace", tone: "schedule-done", record: {} };
entries["2026-10-02"].unshift(trace);
screen.render();
assert.match(ids.calendarGrid.innerHTML, /mark-schedule-done schedule-done[^>]*[\s\S]*Completion trace/);
assert.match(ids.selectedDateEntries.innerHTML, /実績 <span>1件/);
assert.match(ids.selectedDateEntries.innerHTML, /完了した予定 <span>2件/);
entries["2026-10-02"].shift();
assert.match(ids.selectedDateTitle.textContent, /予定・実績$/);
assert.equal(ids.calendarSelectionMode.textContent, "予定・実績");
moves[1].listeners.click();
assert.match(ids.selectedDateTitle.textContent, /^2026-11-01/);
moves[0].listeners.click();
assert.match(ids.selectedDateTitle.textContent, /^2026-10-02/);
assert.equal(ids.calendarDisplayMode.value, "all");
ids.calendarDisplayMode.value = "planned";
ids.calendarDisplayMode.listeners.change();
assert.equal(ids.calendarSelectionMode.textContent, "予定のみ");
screen.focusDate("2026-10-03");
assert.equal(ids.calendarDisplayMode.value, "all");
assert.equal(ids.calendarSelectionMode.textContent, "予定・実績");
assert.match(ids.selectedDateEntries.innerHTML, /Actual only/);
ids.calendarToday.listeners.click();
assert.match(ids.selectedDateTitle.textContent, /^2026-10-02/);
assert.equal(ids.calendarDisplayMode.value, "all");
assert.equal(JSON.stringify(entries), before);
console.log("PASS calendar planned/all filtering, two titles +N, escaping, accessible counts, month/today/focus navigation and no data mutation");
