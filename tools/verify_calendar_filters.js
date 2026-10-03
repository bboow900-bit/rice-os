"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const element = () => ({ value: "", innerHTML: "", textContent: "", listeners: {}, addEventListener(type, handler) { this.listeners[type] = handler; } });
const ids = Object.fromEntries(["calendarGrid", "calendarTitle", "selectedDateTitle", "selectedDateMeta", "selectedDateEntries", "selectedDateSummary", "calendarTargetFilter", "calendarDisplayMode", "calendarSelectionMode", "calendarToday"].map((id) => [id, element()]));
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let fields = [{ fieldId: "f1", name: "Field <one>", fieldGroupId: "g1" }, { fieldId: "f2", name: "Field two", fieldGroupId: "g1" }];
let groups = [{ fieldGroupId: "g1", name: "Group <one>" }];
const entries = [
  { kind: "schedule", title: "Pending batch", record: { id: "plan", fieldIds: ["f1"], batchFieldIds: ["f1", "f2"] } },
  { kind: "water", planned: true, title: "Water plan", record: { fieldId: "f2" } },
  { kind: "schedule", title: "Off plan", record: { id: "off", targetScope: "offField", fieldIds: [] } },
  { kind: "work", title: "Field actual", record: { id: "actual", fieldIds: ["f1"] } },
  { kind: "other", title: "Legacy related", record: { id: "legacy", relatedFieldIds: ["f2"] } },
  { kind: "shipment", title: "Rice shipment", record: { shipmentId: "ship1" } }
];
const calls = [];
const RiceOS = {
  utils: { today: () => "2026-10-02", $: (id) => ids[id], fd: (value) => value, attr: escape, escapeHTML: escape },
  state: { fieldGroups: () => groups, activeFields: () => fields, field: (id) => fields.find((row) => row.fieldId === id), fieldGroup: (id) => groups.find((row) => row.fieldGroupId === id), groupForField: (row) => groups.find((group) => group.fieldGroupId === (typeof row === "string" ? fields.find((field) => field.fieldId === row)?.fieldGroupId : row.fieldGroupId)) },
  calendar: { monthStart: (value) => value.slice(0, 7) + "-01", monthLabel: (value) => value, daysForMonth: () => ["2026-10-02"], entriesForDate: () => entries },
  recordActions: {
    idFor: (kind, row) => { assert.notEqual(kind, "shipment"); return row.id || ""; },
    edit: (kind, row) => calls.push(["edit", kind, row.id]),
    remove: (kind, row) => calls.push(["delete", kind, row.id])
  },
  navigation: { clear: () => calls.push("clear") },
  app: { openInput: (...args) => calls.push(args) },
  screens: { shipments: { openDetail: (id) => calls.push(["detail", id]) } },
  bottomSheet: { open: (...args) => calls.push(["record", ...args]), openSchedule: (...args) => calls.push(["plan", ...args]), openScheduleCompletion: (row) => calls.push(["complete", row.id]) }
};
const before = JSON.stringify(entries);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/screens/calendar.js"), "utf8"), { window: { RiceOS }, document: { querySelectorAll: () => [] } });
const screen = RiceOS.screens.calendar;
screen.bind();
screen.render();
assert.match(ids.calendarTargetFilter.innerHTML, /Group &lt;one&gt;/);
assert.match(ids.calendarTargetFilter.innerHTML, /value="field:f1"/);
function choose(target, mode = "all") {
  ids.calendarDisplayMode.value = mode;
  ids.calendarDisplayMode.listeners.change();
  ids.calendarTargetFilter.value = target;
  ids.calendarTargetFilter.listeners.change();
}
choose("field:f2");
assert.doesNotMatch(ids.selectedDateEntries.innerHTML, /Pending batch|data-id="plan"/);
assert.match(ids.selectedDateEntries.innerHTML, /Legacy related/);
assert.doesNotMatch(ids.selectedDateEntries.innerHTML, /Field actual|Off plan|Rice shipment/);
assert.match(ids.calendarGrid.innerHTML, /予定・実績 2件/);
choose("group:g1", "planned");
assert.match(ids.calendarGrid.innerHTML, /予定 2件/);
assert.doesNotMatch(ids.selectedDateEntries.innerHTML, /Legacy related|Off plan/);
assert.ok(ids.selectedDateEntries.innerHTML.indexOf('data-calendar-action="complete"') < ids.selectedDateEntries.innerHTML.indexOf('<details class="calendar-entry-menu">'));
assert.match(ids.selectedDateEntries.innerHTML, /<summary>操作<\/summary>/);
choose("offField");
assert.match(ids.selectedDateEntries.innerHTML, /Off plan/);
assert.match(ids.selectedDateEntries.innerHTML, /data-calendar-open-shipment="ship1"/);
assert.match(ids.calendarGrid.innerHTML, /mark-shipment/);
assert.doesNotMatch(ids.selectedDateEntries.innerHTML, /Field actual|Legacy related|Water plan/);
function click(selector, dataset = {}) {
  ids.selectedDateSummary.listeners.click({ target: { closest: (query) => query === selector ? { dataset } : null } });
}
click("[data-calendar-open-shipment]", { calendarOpenShipment: "ship1" });
assert.deepEqual(calls.splice(0), ["clear", ["shipments", "calendar"], ["detail", "ship1"]]);
click("[data-calendar-add-plan]");
click("[data-calendar-open-selected], [data-calendar-add-record]");
assert.deepEqual(JSON.parse(JSON.stringify(calls.splice(0))), [["plan", "2026-10-02", { mode: "offField" }], ["record", "2026-10-02", "", { mode: "offField" }]]);
function expectInitialTarget(filter, target) {
  choose(filter);
  click("[data-calendar-add-plan]");
  click("[data-calendar-open-selected], [data-calendar-add-record]");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.splice(0))), [["plan", "2026-10-02", target], ["record", "2026-10-02", "", target]]);
}
expectInitialTarget("field:f2", { mode: "field", fieldId: "f2" });
expectInitialTarget("group:g1", { mode: "group", groupId: "g1" });
expectInitialTarget("all", { mode: "field", fieldId: "" });
choose("field:f2");
for (const action of ["edit", "delete", "complete"]) click("[data-calendar-action]", { calendarAction: action, kind: "schedule", id: "plan" });
assert.deepEqual(calls.splice(0), [], "A batch schedule for f1 must not be actionable from f2");
choose("group:g1");
assert.match(ids.selectedDateEntries.innerHTML, /Pending batch/);
click("[data-calendar-action]", { calendarAction: "edit", kind: "schedule", id: "plan" });
assert.deepEqual(calls.splice(0), [["edit", "schedule", "plan"]]);
const regressionRows = [
  { kind: "schedule-completed", title: "Completed f1", record: { id: "done-f1", fieldIds: ["f1"], batchFieldIds: ["f1", "f2"] } },
  { kind: "work", title: "Actual f1 only", record: { id: "actual-f1", fieldId: "f1", batchFieldIds: ["f1", "f2"] } },
  { kind: "work", title: "Legacy batch fallback", record: { id: "legacy-batch", batchFieldIds: ["f2"] } }
];
entries.push(...regressionRows);
choose("field:f2");
assert.doesNotMatch(ids.selectedDateEntries.innerHTML, /Completed f1|Actual f1 only/);
assert.match(ids.selectedDateEntries.innerHTML, /Legacy batch fallback/);
click("[data-calendar-action]", { calendarAction: "delete", kind: "schedule-completed", id: "done-f1" });
assert.deepEqual(calls.splice(0), []);
entries.splice(-regressionRows.length);
choose("field:f1");
fields[0].name = "Renamed";
screen.render();
assert.equal(ids.calendarTargetFilter.value, "field:f1");
assert.match(ids.calendarTargetFilter.innerHTML, /Renamed/);
fields = fields.filter((row) => row.fieldId !== "f1");
click("[data-calendar-add-plan]");
assert.deepEqual(JSON.parse(JSON.stringify(calls.splice(0))), [["plan", "2026-10-02", { mode: "field", fieldId: "" }]], "Refresh deleted targets at input-open time");
screen.render();
assert.equal(ids.calendarTargetFilter.value, "all");
choose("group:g1");
groups = [];
click("[data-calendar-add-plan]");
assert.deepEqual(JSON.parse(JSON.stringify(calls.splice(0))), [["plan", "2026-10-02", { mode: "field", fieldId: "" }]]);
screen.render();
assert.equal(ids.calendarTargetFilter.value, "all");
assert.equal(JSON.stringify(entries), before);
console.log("PASS calendar stable-ID field/group/offField filters, planned water, legacy links, shipment routing, action menu, target rename/delete fallback and no data mutation");

// Exercise the receiving sheet, not just the forwarded calendar arguments.
{
  const elements = new Map();
  function node(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        value: "", innerHTML: "", disabled: false, handlers: {},
        classList: {
          add: (value) => classes.add(value), remove: (value) => classes.delete(value),
          contains: (value) => classes.has(value),
          toggle(value, on) { if (on) classes.add(value); else classes.delete(value); }
        },
        querySelector: (selector) => node(`${id}:${selector}`),
        setAttribute() {}, focus() {}, addEventListener(type, handler) { this.handlers[type] = handler; }
      });
    }
    return elements.get(id);
  }
  let liveFields = [{ fieldId: "a", name: "A", fieldGroupId: "g1" }, { fieldId: "b", name: "B", fieldGroupId: "g2" }, { fieldId: "c", name: "C", fieldGroupId: "g2" }];
  let liveGroups = [{ fieldGroupId: "g1", name: "First" }, { fieldGroupId: "g2", name: "Second" }];
  const schedule = { scheduleId: "existing", date: "2026-10-02", fieldIds: ["a"], title: "Existing", targetScope: "field" };
  const sheetRows = [
    { kind: "schedule", title: "Existing", record: schedule },
    { kind: "shipment", title: "Shipment", record: { shipmentId: "ship", date: "2026-10-02" } }
  ];
  const saved = [], routes = [], prefills = [];
  const app = {
    utils: {
      today: () => "2026-10-02", fd: (value) => value, $: node, $$: () => [], attr: escape, escapeHTML: escape,
      toast() {}, id: () => "batch",
      setOptions(select, options, value) { select.value = options.some((option) => option.value === value) ? value : options[0]?.value || ""; }
    },
    state: {
      activeFields: () => liveFields, field: (id) => liveFields.find((field) => field.fieldId === id),
      groupedFields: () => liveGroups.map((group) => ({ ...group, fields: liveFields.filter((field) => field.fieldGroupId === group.fieldGroupId) })),
      variety: () => null, data: () => ({ schedules: [schedule] }), saveSchedule: (record) => { saved.push(record); return record; }
    },
    schema: { OTHER_WORK_NAMES: ["Office"] },
    calendar: { entriesForDate: () => sheetRows },
    app: { currentScreen: () => "calendar", syncBackButton() {}, openInput: (...args) => routes.push(args) },
    navigation: { clear: () => routes.push("clear") },
    recordActions: { idFor: (kind, record) => { assert.notEqual(kind, "shipment"); return record.scheduleId || ""; } },
    screens: {
      fieldWork: { prefillFields: (...args) => prefills.push(args), prefillSchedule: (record) => prefills.push(record) },
      growth: { prefillFields: (...args) => prefills.push(args) },
      shipments: { openDetail: (id) => routes.push(["detail", id]) }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../assets/js/screens/bottom-sheet.js"), "utf8"), {
    window: { RiceOS: app }, document: { querySelector: () => null }, setTimeout: (fn) => fn(), alert() {}
  });
  app.screens.bottomSheet.bind();
  const clickSheet = (selector, dataset = {}) => node("dateSheet").handlers.click({ target: { closest: (query) => query === selector ? { dataset } : null } });
  const chooseKind = (kind) => clickSheet("[data-sheet-add]", { sheetAdd: kind });
  const snapshot = () => JSON.stringify([saved, sheetRows]);
  const isSelected = (id) => new RegExp(`class="select-card selected"\\s+data-sheet-field="${id}"`).test(node("sheetScheduleFields").innerHTML);
  const before = snapshot();
  app.bottomSheet.open("2026-10-02", "a");
  chooseKind("work");
  clickSheet("#sheetOpenRecord");
  assert.deepEqual(JSON.parse(JSON.stringify(prefills.pop())), ["2026-10-02", ["a"], { targetScope: "field" }]);
  app.bottomSheet.open("2026-10-02", "", { mode: "group", groupId: "g2" });
  assert.equal(node("sheetGroup").value, "g2");
  chooseKind("work");
  clickSheet("#sheetOpenRecord");
  assert.deepEqual(JSON.parse(JSON.stringify(prefills.pop()))[1], ["b", "c"]);
  app.bottomSheet.open("2026-10-02", "", { mode: "offField" });
  app.bottomSheet.render();
  assert.equal(node("sheetTargetMode").value, "offField", "Preserve scope until kind selection");
  chooseKind("work");
  assert.equal(node("sheetOpenRecord").disabled, false);
  clickSheet("#sheetOpenRecord");
  assert.deepEqual(JSON.parse(JSON.stringify(prefills.pop())), ["2026-10-02", [], { targetScope: "offField" }]);
  app.bottomSheet.open("2026-10-02", "", { mode: "offField" });
  chooseKind("growth");
  assert.equal(node("sheetTargetMode").value, "field");
  assert.equal(node("sheetOpenRecord").disabled, true);
  for (const target of [undefined, { mode: "all" }, { mode: "field", fieldId: "missing" }, { mode: "group", groupId: "missing" }]) {
    app.bottomSheet.open("2026-10-02", "", target);
    chooseKind("work");
    assert.equal(node("sheetTargetMode").value, "field");
    assert.equal(node("sheetOpenRecord").disabled, true);
  }
  app.bottomSheet.openSchedule("2026-10-02", { mode: "group", groupId: "g2" });
  assert.equal(node("sheetScheduleTargetMode").value, "group");
  assert.equal(node("sheetScheduleGroup").value, "g2", "Do not substitute the first group");
  assert.equal(isSelected("a"), false);
  assert.equal(isSelected("b"), true);
  assert.equal(isSelected("c"), true);
  node("sheetScheduleTargetMode").value = "field";
  node("sheetScheduleTargetMode").handlers.change();
  const card = { dataset: { sheetField: "c" }, closest: () => node("sheetScheduleFields") };
  node("dateSheet").handlers.click({ target: { closest: (query) => query === "[data-sheet-field]" ? card : null } });
  assert.equal(isSelected("c"), false, "Initial group remains editable");
  assert.equal(snapshot(), before, "Opening/changing input selection must never save");
  app.bottomSheet.openSchedule("2026-10-02", { mode: "offField" });
  assert.equal(node("sheetScheduleTargetMode").value, "offField");
  assert.equal(node("sheetScheduleFields").hidden, true);
  assert.equal(snapshot(), before);
  app.bottomSheet.openSchedule("2026-10-02", { mode: "group", groupId: "g2" });
  node("sheetScheduleTitle").value = "Group plan";
  node("sheetScheduleForm").handlers.submit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(JSON.stringify(saved.map((row) => row.fieldIds))), [["b"], ["c"]]);
  saved.length = 0;
  liveFields = liveFields.filter((field) => field.fieldId !== "c");
  liveFields.push({ fieldId: "d", name: "D", fieldGroupId: "g2" });
  app.bottomSheet.openSchedule("2026-10-02", { mode: "group", groupId: "g2" });
  assert.equal(isSelected("c"), false);
  assert.equal(isSelected("d"), true, "Re-read current group membership");
  liveGroups = liveGroups.filter((group) => group.fieldGroupId !== "g2");
  app.bottomSheet.openSchedule("2026-10-02", { mode: "group", groupId: "g2" });
  assert.equal(node("sheetScheduleTargetMode").value, "field");
  assert.equal(isSelected("b"), false);
  assert.equal(isSelected("d"), false);
  app.bottomSheet.open("2026-10-02", "a");
  clickSheet("[data-sheet-action]", { sheetAction: "edit", kind: "schedule", id: "existing" });
  assert.equal(node("sheetScheduleTargetMode").disabled, true);
  assert.equal(isSelected("a"), true);
  assert.equal(node("sheetScheduleTitle").value, "Existing");
  clickSheet("[data-sheet-action]", { sheetAction: "complete", kind: "schedule", id: "existing" });
  assert.strictEqual(prefills.pop(), schedule);
  app.bottomSheet.open("2026-10-02");
  assert.match(node("sheetEntries").innerHTML, /data-sheet-open-shipment="ship"/);
  assert.doesNotMatch(node("sheetEntries").innerHTML, /data-kind="shipment"/);
  routes.length = 0;
  clickSheet("[data-sheet-open-shipment]", { sheetOpenShipment: "ship" });
  assert.deepEqual(routes, ["clear", ["shipments", "calendar"], ["detail", "ship"]]);
  routes.length = 0;
  clickSheet("[data-sheet-open-shipment]", { sheetOpenShipment: "deleted" });
  assert.deepEqual(routes, []);
  assert.equal(snapshot(), before);
  console.log("PASS receiving sheet legacy caller, group/offField initial scope, current masters, editable targets, unchanged edit/completion, shipment details and no auto-save");
}
