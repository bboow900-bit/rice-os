"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function extract(source, start, end) { return source.slice(source.indexOf(`  function ${start}(`),source.indexOf(`  function ${end}(`)); }
const fields = fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/fields.js"),"utf8");
const annual = fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/annual.js"),"utf8");
let year = "2025", status = "none";
const calls = [];
const data = { fieldId: "a", name: "A", status: "master-unchanged", areaA: 10 };
const before = JSON.stringify(data);
const c = vm.createContext({ U: { today: () => "2026-10-04", dateYear: d => d.slice(0,4), escapeHTML: String, attr: String, fd: String },
  state: { variety: () => ({ name: "V" }), harvestStatusForField: (...args) => { calls.push(args); return { status, date: "2025-09-03" }; } },
  yearValue: () => year, stageAsOfDateForField: () => year === "all" ? "2026-10-04" : "2025-12-31",
  fieldStage: () => ({ number: 1, label: "stage" }), groupRiceImage: () => "image", fieldStatusText: () => "master-unchanged",
  annualStageForField: () => null, riceStageNumberForField: () => 1, annualPickerRiceImage: () => "image", varietyName: () => "V" });
vm.runInContext(extract(fields,"currentSeasonYear","currentYearCache") + extract(fields,"renderFieldListCard","renderActiveAreaSummary")
  + extract(annual,"pickerHarvestStatus","renderFieldPickerCard") + extract(annual,"renderFieldPickerCard","renderTop")
  + extract(annual,"fieldStatus","fieldStats"),c);
for (const value of ["none","complete","partial","legacy"]) {
  status = value;
  const fieldHtml = c.renderFieldListCard(data);
  const annualHtml = c.renderFieldPickerCard({ field: data, stats: { growth: 0, work: 0, water: 0 }, status: { label: "status", tone: "muted" } });
  for (const html of [fieldHtml,annualHtml]) {
    assert.equal(html.includes('data-harvest-status='),value !== "none");
    if (value === "complete") assert(html.includes("\u53ce\u7a6b\u6e08\u307f\u30fb9/3"));
    if (value === "partial") assert(html.includes("\u7a32\u5208\u308a\u4e00\u90e8\u5b9f\u65bd"));
    if (value === "legacy") assert(html.includes("\u5b8c\u4e86\u533a\u5206\u672a\u78ba\u8a8d"));
  }
  assert(fieldHtml.includes('data-field-open="a"'));
  assert(annualHtml.includes('data-annual-open-field="a"'));
}
assert.deepEqual(calls[0],["a","2026","2026-10-04"]);
assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),["a","2025","2026-10-04",{ cropYear: true }]);
year = "all"; status = "complete";
const result = c.fieldStatus(data,{ total: 0, growth: 0 });
assert.equal(result.label,"\u53ce\u7a6b\u6e08\u307f");
assert.equal(result.action,undefined);
assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),["a","2026","2026-10-04",{ cropYear: true }]);
// Exercise the production state helper against a future-year complete record.
const real = vm.createContext({ RiceOS: { storage: { loadData: () => ({ fields: [data], fieldWorks: [{ workId: "future", workName: "\u7a32\u5208\u308a", date: "2027-09-03", fieldIds: ["a"], harvestStatusByField: { a: "complete" } }] }) } },
  document: { getElementById: () => null, querySelectorAll: () => [] } });
real.window = real;
for (const name of ["utils","schema","state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../assets/js/core/${name}.js`),"utf8"),real);
c.state.harvestStatusForField = real.RiceOS.state.harvestStatusForField;
year = "2027";
assert.equal(c.pickerHarvestStatus(data).status,"none");
const futureHtml = c.renderFieldPickerCard({ field: data, stats: { growth: 0, work: 0, water: 0 }, status: { label: "status", tone: "muted" } });
assert(!futureHtml.includes('data-harvest-status='));
assert.equal(c.fieldStatus(data,{ total: 0 }).label,"\u8a18\u9332\u306a\u3057");
assert.equal(JSON.stringify(data),before);
console.log("Harvest list badges: both cards, complete/partial/legacy/none, year/asOf, priority, routes, no mutation PASS");
