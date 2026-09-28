"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const data = { fields: [], fieldGroups: [{ fieldGroupId: "g", name: "Group" }], varieties: [] };
const listeners = {};
const list = { innerHTML: "", addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
const context = vm.createContext({
  document: { getElementById: (id) => id === "fieldList" ? list : null, querySelectorAll: () => [] },
  RiceOS: { storage: { loadData: () => data } },
  scrollTo() {}
});
context.window = context;
for (const file of ["assets/js/core/utils.js", "assets/js/core/schema.js", "assets/js/core/state.js", "assets/js/screens/fields.js"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context, { filename: file });
}
// Keep this test focused on the real fields renderer and activeFields contract.
Object.assign(context.RiceOS.state, {
  growthLogsFor: () => [], plantingDateForField: () => "", resolvedWaterPeriodsFor: () => []
});
const screen = context.RiceOS.screens.fields;
screen.bind();
const active = "\u4f7f\u7528\u4e2d";
const missing = "0a\u30fb\u672a\u8a2d\u5b9a";
const field = (fieldId, areaA, status = active, extra = {}) => ({ fieldId, name: fieldId, areaA, status, ...extra });
function summary() {
  screen.render();
  const matches = [...list.innerHTML.matchAll(/<p class="muted" data-field-active-area>(.*?)<\/p>/g)];
  assert.equal(matches.length, 1);
  assert.ok(matches[0][1].includes("<b>\u4f5c\u4ed8\u3051\u4e2d\u306e\u5408\u8a08\u9762\u7a4d\uff08\u5168\u5703\u5834\uff09</b>"));
  assert.ok(matches[0][1].includes("<br>\u4f7f\u7528\u4e2d\u306e\u5703\u5834\uff1a"));
  return matches[0][1];
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }

test("empty list shows zero area and zero fields", () => {
  assert.match(summary(), /0 a \/ 0 ha .* 0/);
  assert.ok(!summary().includes(missing));
});
test("active fields counted once; all three inactive statuses excluded", () => {
  data.fields = [field("a", "120.25", active, { fieldGroupId: "g" }), field("b", 30.5),
    field("a", 120.25), field("paused", 900, "\u4f11\u6b62"),
    field("fallow", 800, "\u4f11\u8015"), field("ended", 700, "\u7d42\u4e86")];
  const before = JSON.stringify(data);
  assert.match(summary(), /150\.75 a \/ 1\.5075 ha .* 2/);
  assert.equal(JSON.stringify(data), before);
});
test("group and search never change the global total, even no matches", () => {
  const expected = summary();
  screen.openGroup("g");
  assert.equal(summary(), expected);
  for (const fn of listeners.input) fn({ target: { closest: (selector) => selector === "[data-field-search]" ? { value: "no-match" } : null } });
  assert.equal(summary(), expected);
  assert.ok(!list.innerHTML.includes('data-field-open="a"'));
  screen.openGroup("all");
  assert.equal(summary(), expected);
});
test("zero, blank and invalid area share the warning; only positive area is summed", () => {
  const values = [undefined, null, "", "  ", "bad", NaN, Infinity, -1, false, {}, 0, "0", 10];
  data.fields = values.map((value, i) => field(String(i), value));
  const html = summary();
  assert.match(html, /10 a \/ 0\.1 ha .* 13/);
  assert.ok(html.includes(`${missing} 12圃場`));
  data.fields = [field("zero", 0), field("zero-string", "0")];
  assert.match(summary(), /0 a \/ 0 ha .* 2/);
  assert.ok(summary().includes(`${missing} 2圃場`));
});
test("all missing shows zero total with the combined warning", () => {
  data.fields = [field("unknown", "")];
  assert.ok(summary().includes(missing));
  assert.ok(summary().includes("0 a / 0 ha"));
});

test("real schema normalization preserves the zero and unknown warning", () => {
  const schema = context.RiceOS.schema;
  const values = [undefined, null, "", "  ", "bad", 0, "0", 25.5];
  const normalized = schema.normalize({ fields: [
    ...schema.DEFAULT_FIELDS.map(row => ({ ...row, status: "休止" })),
    ...values.map((value, i) => field(`normalized-${i}`, value)),
    field("normalized-paused", 900, "休止"),
    field("normalized-fallow", 800, "休耕"),
    field("normalized-ended", 700, "終了")
  ] });
  Object.assign(data, normalized);
  for (let i = 0; i < 7; i++) {
    assert.equal(data.fields.find(row => row.fieldId === `normalized-${i}`).areaA, 0);
  }
  const before = JSON.stringify(data);
  assert.match(summary(), /25\.5 a \/ 0\.255 ha .* 8圃場/);
  assert.ok(summary().includes(`${missing} 7圃場`));
  assert.equal(JSON.stringify(data), before);
});
test("decimal noise suppressed and subsequent edits recalculated", () => {
  data.fields = [field("a", 0.1), field("b", 0.2)];
  assert.match(summary(), /0\.3 a \/ 0\.003 ha/);
  data.fields[0].areaA = 100;
  assert.match(summary(), /100\.2 a \/ 1\.002 ha/);
  data.fields[0].status = "\u4f11\u8015";
  assert.match(summary(), /0\.2 a \/ 0\.002 ha .* 1/);
});
console.log(`${passed} fields active-area checks passed`);
