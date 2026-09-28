"use strict";

// Pure-helper scope: isolated fixtures, no storage, migrations, annual yield writes,
// browser integration, area accumulation, or rate calculation. Parent owns UI QA.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
let data;
const context = vm.createContext({ __RICEOS_TEST__: true });
context.window = context;
context.RiceOS = { state: { data: () => data } };
for (const file of ["assets/js/core/utils.js", "assets/js/screens/annual.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const { harvestTotalsForFieldYear: totals, renderHarvestTotals, annualRecordTarget } = context.RiceOS.annualTest;
const plain = (value) => JSON.parse(JSON.stringify(value));
const wet = "\u7c7e\uff08\u4e7e\u71e5\u524d\uff09";
const dry = "\u7c7e\uff08\u4e7e\u71e5\u5f8c\uff09";
const brown = "\u7384\u7c73\uff08\u4e7e\u71e5\u8abf\u88fd\u5f8c\uff09";
const work = (workId, yieldKg = "100", extra = {}) => ({ workId, date: "2026-09-10", fieldIds: ["a"],
  workName: "\u7a32\u5208\u308a", harvestReview: { yieldKg, harvestAreaA: "10", yieldBasis: wet }, ...extra });
const get = (rows, field = "a", year = "2026") => plain(totals(rows, field, year));
let passed = 0;
function test(name, run) { run(); passed++; console.log(`PASS ${name}`); }

test("empty input and invalid scope", () => {
  for (const rows of [undefined, null, [], {}]) assert.equal(get(rows).individualSubtotals.length, 0);
  for (const year of ["all", "26", "2026x", " 2026"]) assert.equal(get([work("a")], "a", year).individualRecords.length, 0);
  assert.equal(get([work("a")], "").individualRecords.length, 0);
});
test("exact field IDs, date year rather than season, harvest names only", () => {
  const rows = [work("ok", 1, { season: 2025 }), work("prefix", 50, { fieldIds: ["aa"] }),
    work("case", 50, { fieldIds: ["A"] }), work("wrong", 50, { workName: "other" }),
    work("short", 2, { workName: "\u7a32\u5208" }), work("harvest", 3, { workName: "\u53ce\u7a6b" })];
  assert.equal(get(rows).individualSubtotals[0].yieldKg, 4);
});
test("renamed drainage, preparation and planned harvest retain reviews but are excluded", () => {
  const names = ["\u53ce\u7a6b\u524d\u843d\u6c34", "\u53ce\u7a6b\u6e96\u5099", "\u7a32\u5208\u308a\u4e88\u5b9a"];
  for (const workName of names) {
    for (const fieldIds of [["a"], ["a", "b"]]) {
      const row = work("renamed", 100, { fieldIds });
      const review = row.harvestReview;
      row.workName = workName;
      const before = JSON.stringify(row);
      assert.deepEqual(get([row]), { individualSubtotals: [], individualRecords: [], sharedRecords: [] });
      assert.equal(row.harvestReview, review);
      assert.equal(JSON.stringify(row), before);
      row.workName = "\u53ce\u7a6b";
      const restored = get([row]);
      assert.equal(fieldIds.length === 1 ? restored.individualSubtotals[0].yieldKg : restored.sharedRecords[0].yieldKg, 100);
    }
  }
});
test("zero is measured and blanks are not zero", () => {
  for (const value of [0, "0", "0.0"]) assert.equal(get([work("z", value)]).individualSubtotals[0].yieldKg, 0);
  for (const value of [undefined, null, "", "  "]) {
    const row = work("blank"); row.harvestReview.yieldKg = value;
    assert.equal(get([row]).individualSubtotals.length, 0);
    assert.equal(get([row]).individualRecords[0].yieldKg, null);
  }
});
test("invalid kg excluded without coercion", () => {
  for (const value of [-1, NaN, Infinity, "-0", "-1", "1e3", "0x10", "1,000", true, false, [], {}, "bad"]) {
    assert.equal(get([work("bad", value)]).individualSubtotals.length, 0, String(value));
  }
});
test("repeated cuts sum kg only; no area or rate", () => {
  const result = get([work("one", "100.25"), work("two", "200.5")]);
  assert.deepEqual(result.individualSubtotals, [{ yieldBasis: wet, yieldKg: 300.75, recordCount: 2 }]);
  assert.doesNotMatch(JSON.stringify(result), /harvestAreaA|yieldRate|per10a/);
});
test("mixed bases stay separate; unknown conditions remain individual only", () => {
  const rows = [wet, dry, brown, "", "bad", null].map((yieldBasis, i) => work(String(i), 10, { harvestReview: { yieldKg: 10, yieldBasis } }));
  assert.deepEqual(get(rows).individualSubtotals.map((row) => [row.yieldBasis, row.yieldKg]), [[wet, 10], [dry, 10], [brown, 10]]);
  assert.equal(get(rows).individualRecords.filter((row) => !row.yieldBasis).length, 3);
});
test("decimal display rounds floating-point noise and retains unknown records", () => {
  data = { fields: [{ fieldId: "a", name: "A" }], fieldWorks: [work("one", "0.1"), work("two", "0.2"),
    work("unknown", 77, { harvestReview: { yieldKg: 77, yieldBasis: "" } })] };
  const html = renderHarvestTotals(data.fields[0], 2026);
  assert.match(html, /0\.3kg/);
  assert.doesNotMatch(html, /0\.30000000000000004/);
  assert.match(html, /77kg/);
  assert.match(html, /data-annual-record-open-id="unknown"/);
  assert.doesNotMatch(html, /style=/);
});
test("group totals are not allocated or added to individual totals", () => {
  const rows = [work("individual", 100), work("group", 1000, { fieldIds: ["a", "b", "a"] }),
    work("group2", 2000, { fieldIds: ["a", "b"] }), work("repeat-field", 50, { fieldIds: ["a", "a"] })];
  assert.equal(get(rows).individualSubtotals[0].yieldKg, 150);
  assert.deepEqual(get(rows).sharedRecords.map((row) => row.yieldKg), [1000, 2000]);
  assert.deepEqual(get(rows, "b").individualSubtotals, []);
  assert.deepEqual(get(rows, "b").sharedRecords, get(rows).sharedRecords);
});
test("exact duplicate ID dedupe, first record wins as detail route does", () => {
  const first = work("id", 100);
  const rows = [first, first, work("id", 500), work("id-long", 20), work("id ", 30), work("", 900)];
  assert.equal(get(rows).individualSubtotals[0].yieldKg, 150);
  assert.equal(get([work("same", 9, { date: "2025-09-10" }), work("same", 10)]).individualRecords.length, 0);
});
test("calendar validation and year boundaries", () => {
  const dates = ["2025-12-31", "2026-01-01", "2026-12-31", "2027-01-01", "2026-02-29", "2026-09-31", "2026-9-10", "2026-09-10T00:00:00", "2024-02-29"];
  const rows = dates.map((date) => work(date, 10, { date }));
  assert.equal(get(rows, "a", 2026).individualRecords.length, 2);
  assert.equal(get(rows, "a", 2024).individualRecords.length, 1);
});
test("pure input immutability and existing annual yields untouched", () => {
  data = { fields: [{ fieldId: "a", name: "<A>" }, { fieldId: "b", name: "B" }],
    fieldWorks: [work('exact"id', 123, { fieldIds: ["a", "b"] })], varietyResults: [{ yieldKg: 987 }] };
  const before = JSON.stringify(data);
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(data);
  get(data.fieldWorks);
  const html = renderHarvestTotals(data.fields[0], "2026");
  assert.equal(JSON.stringify(data), before);
  assert.match(html, /<details\b/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:\s|=|>)/);
  assert.match(html, /data-annual-record-open-kind="fieldWork"/);
  assert.match(html, /data-annual-record-open-id="exact&quot;id"/);
  assert.match(html, /&lt;A&gt;.*B/);
  assert.match(html, /2026-09-10/);
  assert.match(html, /123kg/);
  assert.ok(html.includes(wet));
  assert.equal(annualRecordTarget(data.fields[0], "fieldWork", 'exact"id').row, data.fieldWorks[0]);
  assert.equal(annualRecordTarget(data.fields[0], "fieldWork", "exact"), null);
});
console.log(`${passed} harvest totals checks PASS (pure helper + render/route contract; browser QA not included)`);
