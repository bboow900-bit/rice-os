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
const context = vm.createContext({ console, navigator: {}, alert() {}, CustomEvent: class {},
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
  node("annualTimeline").handlers.click({ target: { closest: query => query === selector ? { dataset } : null } });
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
assert(html().includes('class="annual-work-archive"'));
assert(html().includes('<details class="annual-hub-summary">'));
assert(html().includes('class="annual-used-materials"'));
assert(html().includes("herbicide-review"));
assert.equal((html().match(/class="next-season-ideas"/g) || []).length, 1);
click("[data-annual-work-scope]", { annualWorkScope: "offField" });
assert(html().includes("<details data-annual-work-list open>"));
click("[data-annual-work-scope]", { annualWorkScope: "field" });
assert(html().includes("<details data-annual-work-list open>"));
const field = R.state.activeFields()[0];
let routedFields = 0;
R.navigation = { openField() { routedFields++; return true; } };
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
