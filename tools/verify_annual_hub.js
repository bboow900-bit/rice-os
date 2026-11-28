"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { value: "", innerHTML: "", handlers: {},
    classList: { toggle() {} }, addEventListener(type, handler) { this.handlers[type] = handler; },
    querySelector: () => null });
  return nodes.get(id);
}
let approveDelete = false;
const context = vm.createContext({ console, navigator: {}, alert() {}, confirm: () => approveDelete, CustomEvent: class {},
  dispatchEvent() {}, scrollTo() {}, setTimeout() {}, clearTimeout() {},
  document: { getElementById: node, querySelectorAll: () => [] },
  localStorage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) }
});
context.window = context;
function load(file) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context, { filename: file });
}
for (const name of ["utils", "schema", "storage", "state", "herbicide"]) load(`assets/js/core/${name}.js`);
const R = context.RiceOS;
R.utils.setOptions = (select, options, value) => { select.value = value || options[0].value; };
R.utils.toast = () => {};
R.app = { syncBackButton() {} };
load("assets/js/screens/herbicide.js");
load("assets/js/screens/annual.js");
const annual = R.screens.annual;
annual.bind();
const before = JSON.stringify(R.state.data());
const stored = JSON.stringify([...memory]);
const html = () => node("annualTimeline").innerHTML;
function click(selector, dataset = {}) {
  node("annualTimeline").handlers.click({ target: { closest: query => query === selector ? { dataset, closest: () => null } : null } });
}
node("annualYear").value = "all";
annual.resetNavigation();
assert(html().includes('data-annual-hub-panel="fields"'));
assert(html().includes('id="annualSearch"'));
assert(!html().includes('class="annual-work-archive"'));
assert(!html().includes('class="next-season-ideas"'));
click("[data-annual-hub-notes]");
assert.equal((html().match(/class="next-season-ideas"/g) || []).length, 1);
click("[data-annual-hub-view]", { annualHubView: "work" });
assert(!html().includes('id="annualSearch"'));
assert(!html().includes('class="annual-work-archive"'));
assert(!html().includes('<details class="annual-hub-summary">'));
assert.match(html(), /class="[^"]*\bannual-work-heading\b[^"]*"/);
assert(!html().includes("herbicide-review"));
assert.equal((html().match(/class="next-season-ideas"/g) || []).length, 1);
const field = R.state.activeFields()[0];
let routedFields = 0;
R.navigation = { current: () => null, openField() { routedFields++; return true; } };
click("[data-annual-hub-open-field]", { annualHubOpenField: field.fieldId });
assert.equal(routedFields, 0, "Hub cards must not enter the fixed-field return route");
assert(!html().includes('class="annual-hub-nav"'));
annual.handleBack();
assert(html().includes('data-annual-hub-panel="work"'));
click("[data-annual-hub-view]", { annualHubView: "compare" });
assert(html().includes('data-annual-hub-panel="compare"'));
assert(html().includes(`${new Date().getFullYear()}`));
assert(html().includes('data-annual-hub-compare-field='));
click("[data-annual-hub-compare-field]", { annualHubCompareField: field.fieldId });
assert(html().includes('class="annual-compare-experience"'));
assert(!html().includes('class="annual-hub-nav"'));
annual.handleBack();
assert(html().includes('data-annual-hub-panel="compare"'));
node("annualYear").value = "2025";
node("annualYear").handlers.change();
assert(html().includes("2025"));
click("[data-annual-hub-compare-field]", { annualHubCompareField: field.fieldId });
assert(html().includes("2025") && html().includes("2024"));
click("[data-annual-close-compare]");
assert(html().includes('data-annual-hub-panel="compare"'));
annual.resetNavigation();
assert(html().includes('data-annual-hub-panel="fields"'));
assert(!html().includes('class="next-season-ideas"'));
assert.equal(node("annualYear").value, "2025");
assert.equal(JSON.stringify(R.state.data()), before, "Hub navigation must not mutate farm records");
assert.equal(JSON.stringify([...memory]), stored, "Hub state must remain in memory only");
console.log("PASS annual hub: panels, shared notes, work filter expansion, direct comparison, year fallback, back/reset and data safety");

assert(R.state.saveFieldWork({ workId: "qa-off-field-action", date: "2025-05-01", cropYear: 2025,
  targetScope: "offField", fieldIds: [], workName: "播種", memo: "Protected off-field memo" }));
const off = R.state.data().fieldWorks.find(row => row.workId === "qa-off-field-action");
assert(off);
annual.resetNavigation();
const actionBefore = JSON.stringify(R.state.data());
const actionStored = JSON.stringify([...memory]);
const recordTarget = { annualRecordOpenKind: "fieldWork", annualRecordOpenId: off.workId, annualRecordOpenLabel: "播種" };
let editRoute = null;
R.navigation.openRecord = (kind, id, options) => { editRoute = { kind, id, options }; return true; };
click("[data-annual-record-open-kind]", recordTarget);
assert(html().includes('class="annual-record-detail"'));
assert(html().includes("Protected off-field memo"));
assert(html().includes("data-annual-record-detail-edit"));
click("[data-annual-record-detail-edit]");
assert.equal(editRoute.kind, "fieldWork");
assert.equal(editRoute.id, off.workId);
assert.equal(editRoute.options.originScreen, "annual");
assert.equal(editRoute.options.returnToAnnualHub, true);
annual.handleBack();
function contextMenu() {
  let prevented = false;
  node("annualTimeline").handlers.contextmenu({ preventDefault() { prevented = true; },
    target: { closest: selector => selector === "[data-annual-record-open-kind]" ? { dataset: recordTarget } : null } });
  assert(prevented);
  assert(html().includes('class="annual-record-action-sheet"'));
}
contextMenu();
editRoute = null;
click("[data-annual-record-action]", { annualRecordAction: "edit" });
assert.equal(editRoute.id, off.workId);
assert(!html().includes('class="annual-record-action-sheet"'));
assert.equal(JSON.stringify(R.state.data()), actionBefore);
assert.equal(JSON.stringify([...memory]), actionStored);
contextMenu();
click("[data-annual-record-action]", { annualRecordAction: "delete" });
assert.equal(JSON.stringify(R.state.data()), actionBefore, "Cancelled deletion must preserve all records");
assert.equal(JSON.stringify([...memory]), actionStored);
contextMenu();
approveDelete = true;
click("[data-annual-record-action]", { annualRecordAction: "delete" });
assert(!R.state.data().fieldWorks.some(row => row.workId === off.workId));
const afterDelete = JSON.parse(actionBefore);
afterDelete.fieldWorks = afterDelete.fieldWorks.filter(row => row.workId !== off.workId);
const actual = JSON.parse(JSON.stringify(R.state.data()));
delete afterDelete.meta;
delete actual.meta;
assert.deepEqual(actual, afterDelete, "Confirmed deletion may remove only the targeted record");
console.log("PASS off-field actions: normal detail/edit, hub context menu/edit, cancellation and targeted deletion");
