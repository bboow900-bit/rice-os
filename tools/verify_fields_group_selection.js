"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const data = {
  fields: ["k1", "k2", "k3", "other", "unassigned"].map((fieldId, i) => ({
    fieldId, name: fieldId, areaA: 10, status: "\u4f7f\u7528\u4e2d",
    fieldGroupId: i < 3 ? "kameishi" : i === 3 ? "other" : ""
  })),
  fieldGroups: [{ fieldGroupId: "kameishi", name: "\u4e80\u77f3" }, { fieldGroupId: "other", name: "Other" }],
  varieties: []
};
const before = JSON.stringify(data);
const listeners = {};
const list = { innerHTML: "", addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
const context = vm.createContext({
  document: { getElementById: (id) => id === "fieldList" ? list : null, querySelectorAll: () => [] },
  RiceOS: { storage: { loadData: () => data } }, scrollTo() {}
});
context.window = context;
for (const file of ["assets/js/core/utils.js", "assets/js/core/schema.js", "assets/js/core/state.js", "assets/js/screens/fields.js"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context, { filename: file });
}
Object.assign(context.RiceOS.state, {
  growthLogsFor: () => [], plantingDateForField: () => "", resolvedWaterPeriodsFor: () => []
});
const screen = context.RiceOS.screens.fields;
screen.bind();
screen.render();
const area = () => list.innerHTML.match(/<p class="muted" data-field-active-area>(.*?)<\/p>/)[1];
const total = area();
assert.match(total, /50 a \/ 0\.5 ha/);
function check(value, ids, expectedData = before) {
  const select = list.innerHTML.match(/<select data-field-group-filter>(.*?)<\/select>/)[1];
  const selected = [...select.matchAll(/<option value="([^"]*)"[^>]*\bselected\b[^>]*>/g)];
  assert.deepEqual(selected.map((match) => match[1]), [value]);
  assert.deepEqual([...list.innerHTML.matchAll(/data-field-open="([^"]*)"/g)].map((match) => match[1]).sort(), ids.slice().sort());
  assert.equal(area(), total);
  assert.equal(JSON.stringify(data), expectedData);
}
function event(type, selector, element) {
  for (const fn of listeners[type]) fn({ target: { closest: (query) => query === selector ? element : null } });
}
const all = data.fields.map((field) => field.fieldId);
check("all", all);
for (const [value, ids] of [["kameishi", ["k1", "k2", "k3"]], ["", ["unassigned"]], ["all", all]]) {
  event("change", "[data-field-group-filter]", { value });
  check(value, ids);
  screen.render();
  check(value, ids);
}
for (const [value, ids] of [["kameishi", ["k1", "k2", "k3"]], ["", ["unassigned"]]]) {
  event("click", "[data-field-group-open]", { dataset: { fieldGroupOpen: value } });
  check(value, ids);
  screen.resetNavigation();
  check(value, ids);
}
screen.openGroup("\u4e80\u77f3");
check("kameishi", ["k1", "k2", "k3"]);
event("input", "[data-field-search]", { value: "no-match" });
screen.render();
check("kameishi", []);
screen.openGroup("all");
check("all", all);
console.log("PASS fields group selection, rerender, unassigned, search and global area");

for (const scenario of ["deleted", "empty", "unassigned-removed"]) {
  Object.assign(data, JSON.parse(before));
  const value = scenario === "unassigned-removed" ? "" : "kameishi";
  event("change", "[data-field-group-filter]", { value });
  check(value, value === "" ? ["unassigned"] : ["k1", "k2", "k3"]);
  // Simulate an external edit before rendering; rendering must not mutate it.
  if (scenario === "deleted") {
    data.fieldGroups = data.fieldGroups.filter((group) => group.fieldGroupId !== "kameishi");
  }
  for (const field of data.fields) {
    if (field.fieldGroupId === value) field.fieldGroupId = scenario === "unassigned-removed" ? "other" : "";
  }
  const editedData = JSON.stringify(data);
  screen.render();
  check("all", all, editedData);
  screen.render();
  check("all", all, editedData);
  console.log(`PASS missing group fallback: ${scenario}, global area and data unchanged`);
}
