"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/home.js"), "utf8");
const listeners = {};
const root = { dataset: {}, addEventListener(type, handler, capture) {
  listeners[type] = handler;
  if (type === "toggle") assert.equal(capture, true);
} };
const statuses = { a: "complete", b: "partial", c: "legacy", d: "none", e: "complete" };
const queries = [];
const RiceOS = {
  utils: { today: () => "2026-10-03", $: () => root, escapeHTML: String },
  state: { harvestStatusForField(id, year, date) {
    queries.push({ id, year, date });
    return { status: statuses[id] };
  } }
};
const context = vm.createContext({ window: { RiceOS }, console });
// Keep grouping and event handling intact; isolate unrelated card dependencies.
const cardStart = source.indexOf("  function renderDecisionFieldCard(field) {");
const cardEnd = source.indexOf("  // A home card is read-only", cardStart);
const isolated = source.slice(0, cardStart)
  + '  function renderDecisionFieldCard(field) { return `<article data-test-field="${field.fieldId}"></article>`; }\n'
  + source.slice(cardEnd);
vm.runInContext(isolated.replace("RiceOS.screens.home = { render, bind };",
  "RiceOS.screens.home = { render, bind, renderHarvestGroupedFields };"), context);
const screen = RiceOS.screens.home;
const fields = Object.keys(statuses).map(fieldId => ({ fieldId }));
const before = JSON.stringify(statuses);
let html = screen.renderHarvestGroupedFields(fields, "2026-10-03");
assert(html.includes("2/5"));
assert(!html.includes("data-home-harvest-completed open"));
const split = html.indexOf("<details");
for (const id of ["b", "c", "d"]) assert(html.indexOf(`data-test-field="${id}"`) < split);
for (const id of ["a", "e"]) assert(html.indexOf(`data-test-field="${id}"`) > split);
assert(queries.every(query => String(query.year) === "2026" && query.date === "2026-10-03"));
screen.bind();
listeners.toggle({ target: { matches: selector => selector === "[data-home-harvest-completed]", open: true } });
html = screen.renderHarvestGroupedFields(fields.slice(0, 3), "2026-10-03");
assert(html.includes("1/3"));
assert(html.includes("data-home-harvest-completed open"));
assert(!html.includes('data-test-field="e"'));
screen.renderHarvestGroupedFields([fields[1]], "2026-10-03");
assert(screen.renderHarvestGroupedFields(fields, "2026-10-03").includes("data-home-harvest-completed open"));
listeners.toggle({ target: { matches: () => true, open: false } });
assert(!screen.renderHarvestGroupedFields(fields, "2026-10-03").includes("data-home-harvest-completed open"));
assert(!screen.renderHarvestGroupedFields([], "2026-10-03").includes("<details"));
assert(screen.renderHarvestGroupedFields([fields[0]], "2026-10-03").includes("1/1"));
assert.equal(JSON.stringify(statuses), before);
assert(source.includes('harvestStatus.status === "legacy" ? "区分未確認"'));
assert(source.includes('harvestStatus.status === "partial" ? "一部実施"'));
console.log("PASS home harvest grouping: explicit completion only, filtered counts, retained toggle, empty/all-complete and read-only");
