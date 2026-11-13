"use strict";

// Read-only markup/behavior fixtures: no browser storage or production records.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert/strict");
const source = fs.readFileSync(path.join(__dirname, "../assets/js/screens/annual.js"), "utf8");
const extract = (name, next) => source.slice(source.indexOf("  function " + name + "("), source.indexOf("  function " + next + "("));
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let row = {};
let complete = false;
const context = vm.createContext({
  expandedFlowRecord: "", RiceOS: { agro: { SEASON_STAGES: [{ key: "heading", label: "出穂期" }] } },
  U: { attr: escape, escapeHTML: escape, number: (v, d) => Number(v) || d,
    daysBetween: (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000 },
  state: { isHarvestThermalComplete: () => complete },
  annualRecordTarget: () => ({ row }),
  annualRecordDate: value => value, reviewYearValue: () => "2026"
});
vm.runInContext(extract("isTimelineDate", "timelineDateParts") +
  extract("isObservedHeading", "fieldYearTimeline"), context);
const field = { fieldId: "f1" };
const entry = { id: 'id"<', editKind: "fieldWork", label: "除草", tone: "work", category: "農作業", detail: "資材<", date: "2026-07-20" };
const render = (changes = {}, timeline = []) => context.renderExpandableFlowCard(field, { ...entry, ...changes }, timeline);
row = { material: "資材<", machine: "機械", worker: "", date: entry.date };
let html = render();
assert(html.includes("資材&lt;"));
assert(html.includes("補足を見る"));
assert(html.includes('data-annual-record-open-id="id&quot;&lt;"'));
assert(html.includes('data-annual-flow-menu-id="id&quot;&lt;"'));
context.expandedFlowRecord = 'fieldWork:id"<';
assert(render().includes("機械 機械"));
row = { material: "資材<", date: entry.date };
assert(!render().includes("data-annual-flow-summary"));
row.memo = "<script>memo</script>";
context.expandedFlowRecord = "";
assert(render().includes("メモあり・補足を見る"));
context.expandedFlowRecord = 'fieldWork:id"<';
assert(render().includes("補足を閉じる"));
assert(render().includes("&lt;script&gt;memo&lt;/script&gt;"));
row = {};
assert(!render({ detail: "", label: "未知" }).includes("data-annual-flow-summary"));
assert(!context.observedGrowthFact({ panicleLengthMm: 0 }));
assert.equal(context.observedGrowthFact({ panicleLengthMm: 0.1 }).kind, "panicle");
row = { panicleLengthMm: 1, date: entry.date };
html = render({ editKind: "growth", milestone: "panicle", detail: "幼穂 1mm" });
assert(html.includes("幼穂長 1.0mm"));
assert(html.includes("rice-stage-05.png"));
assert(/annual-year-flow-open[\s\S]*annual-flow-milestone-art[\s\S]*<\/button><button[^>]*annual-year-flow-menu/.test(html));
row = { stageConfirmed: true, observedStage: "heading", date: entry.date };
html = render({ editKind: "growth", milestone: "manual-stage", label: "現場ステージ", detail: "現地判断: 出穂期" });
assert(html.includes("現地判断"));
assert(!html.includes("annual-flow-milestone-art"));
assert(!html.includes("出穂確認"));
row = { headingObserved: true, date: entry.date };
const planting = { id: "plant", date: "2026-05-14", editKind: "fieldWork", label: "田植え" };
html = render({ editKind: "growth", milestone: "heading" }, [planting]);
assert(html.includes("rice-stage-06.png"));
assert(html.includes("現地観察"));
assert(html.includes("田植えから67日"));
row = { workName: "稲刈り", date: "2026-09-12", fieldIds: ["f1", "f2"],
  harvestSnapshots: [{ fieldId: "f2", harvestDate: "2026-09-12", thermal: { total: 999 } }] };
complete = true;
assert(!render().includes("積算温度"));
row.harvestSnapshots.push({ fieldId: "f1", harvestDate: row.date, thermal: { total: 1030 } });
assert(render().includes("収穫時積算温度 1,030℃"));
complete = false;
assert(!render().includes("積算温度"));
assert(render().includes("rice-stage-08.png"));
const before = JSON.stringify(row);
assert(render({ date: row.date }, [{ id: "heading", editKind: "growth", milestone: "heading", date: "2026-07-27" }]).includes("出穂から47日"));
assert(!render({ date: row.date }, [{ id: "heading", editKind: "growth", milestone: "heading", date: "2025-07-27" }]).includes("出穂から"));
assert.equal(JSON.stringify(row), before);
row.harvestSnapshots[1].harvestDate = "2026-09-11";
complete = true;
assert(!render().includes("積算温度"));
assert(!render({ editKind: "milling" }).includes("rice-stage-08.png"));
row.cropYear = "2025";
assert(!render().includes("annual-flow-milestone-art"));
assert(source.includes('class="annual-year-flow annual-story"'));
const flow = extract("renderYearFlow", "harvestTotalsForFieldYear");
assert(flow.includes('renderRecordFocus(["重要な記録", "繰り返し作業", "すべて"])'));
assert(flow.includes('class="annual-flow-field-context"'));
assert(!flow.includes("<select"));
assert(source.includes("includePlanned: false"));
assert(source.includes("String(a.date).localeCompare(String(b.date))"));
const overview = extract("renderReviewOverview", "renderReviewCompare");
assert(overview.indexOf("renderYearFlow(field)") < overview.indexOf("annual-flow-compare-link"));
for (const selector of ["data-annual-record-open-kind", "data-annual-flow-menu-kind", "data-annual-flow-summary"]) assert(source.includes(selector));
console.log("Annual story PASS: actual/unknown/memo/empty/escaping/routes/panicle/manual/heading/multi-field harvest.");
