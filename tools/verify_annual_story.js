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
  annualRecordDate: value => value, reviewYearValue: () => "2026",
  timelineDateParts: value => ({ day: value.split("-").slice(1).map(Number).join("/") })
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
assert(html.includes("assets/images/annual-story/annual-story-panicle.png"));
assert(/annual-year-flow-open[\s\S]*annual-flow-milestone-art[\s\S]*<\/button>\s*<button[^>]*annual-year-flow-menu/.test(html));
assert(/annual-flow-category"><em class="annual-flow-category-label annual-flow-milestone-badge">実測<\/em><\/span>\s*<span class="annual-flow-copy"><span class="annual-year-flow-title"><b>/.test(html));
assert(/annual-flow-copy[\s\S]*annual-year-flow-title[\s\S]*annual-year-flow-detail/.test(html));
assert(!html.includes("annual-year-flow-stage-fact"));
row.memo = "観察メモ";
context.expandedFlowRecord = "";
html = render({ editKind: "growth", milestone: "panicle" });
assert(/annual-year-flow-menu[^]*<\/button>\s*<div class="annual-flow-supplement"><button[^>]*annual-year-flow-summary-toggle/.test(html));
assert(html.includes("メモあり・補足を見る"));
row = { stageConfirmed: true, observedStage: "heading", date: entry.date };
html = render({ editKind: "growth", milestone: "manual-stage", label: "現場ステージ", detail: "現地判断: 出穂期" });
assert(html.includes("現地判断"));
assert(!html.includes("annual-flow-milestone-art"));
assert(!html.includes("出穂確認"));
row = { headingObserved: true, date: entry.date };
const planting = { id: "plant", date: "2026-05-14", editKind: "fieldWork", label: "田植え" };
html = render({ editKind: "growth", milestone: "heading" }, [planting]);
assert(html.includes("assets/images/annual-story/annual-story-heading.png"));
assert(html.includes("現地観察"));
assert(html.replace(/<[^>]*>/g, "").includes("田植えから67日"));
assert(html.includes('<span class="annual-flow-day-count">67日</span>'));
row = { workName: "稲刈り", date: "2026-09-12", fieldIds: ["f1", "f2"],
  harvestSnapshots: [{ fieldId: "f2", harvestDate: "2026-09-12", thermal: { total: 999 } }] };
complete = true;
assert(render().includes("収穫時積算温度 未取得"));
row.harvestSnapshots.push({ fieldId: "f1", harvestDate: row.date, thermal: { total: 1030 } });
assert(render().includes("収穫時積算温度 1,030℃"));
complete = false;
assert(render().includes("保存済積算温度 1,030℃（旧記録）"));
assert(render().includes("assets/images/annual-story/annual-story-harvest.png"));
const before = JSON.stringify(row);
assert(render({ date: row.date }, [{ id: "heading", editKind: "growth", milestone: "heading", date: "2026-07-27" }]).replace(/<[^>]*>/g, "").includes("出穂から47日"));
assert(!render({ date: row.date }, [{ id: "heading", editKind: "growth", milestone: "heading", date: "2025-07-27" }]).includes("出穂から"));
assert.equal(JSON.stringify(row), before);
row.harvestSnapshots[1].harvestDate = "2026-09-11";
complete = true;
assert(render().includes("収穫時積算温度 未取得"));
assert(!render({ editKind: "milling" }).includes("annual-story-harvest.png"));
row.cropYear = "2025";
assert(!render().includes("annual-flow-milestone-art"));
row = { workName: "稲刈り", date: "2026-09-12", fieldIds: ["f1", "f2"] };
const thermalDisplay = (thermal, extra = {}) => {
  row.harvestSnapshots = [{ fieldId: "f1", harvestDate: row.date, thermal, ...extra }];
  const before = JSON.stringify(row);
  const result = render();
  assert.equal(JSON.stringify(row), before);
  return result;
};
complete = true;
assert(thermalDisplay({ total: 1030, status: "complete" }).includes("収穫時積算温度 1,030℃"));
complete = false;
for (const status of ["partial", "missing", "一部欠測"]) {
  assert(thermalDisplay({ total: "1030", status }).includes("保存済積算温度 1,030℃（一部取得）"));
}
assert(thermalDisplay({ total: 1030, status: "legacy" }).includes("保存済積算温度 1,030℃（旧記録）"));
assert(thermalDisplay({ total: 1030, status: "未保存" }).includes("保存済積算温度 1,030℃（旧記録）"));
assert(thermalDisplay({ total: 1030, status: "当日速報" }).includes("保存済積算温度 1,030℃（当日速報）"));
assert(thermalDisplay({ total: 1030 }).includes("保存済積算温度 1,030℃（旧記録）"));
assert(thermalDisplay({ total: 1030, status: "unknown" }).includes("保存済積算温度 1,030℃（要確認）"));
assert(thermalDisplay({ total: 1030, status: "complete" }).includes("保存済積算温度 1,030℃（要確認）"));
for (const total of ["", null, undefined]) assert(thermalDisplay({ total }).includes("収穫時積算温度 未取得"));
for (const total of [" ", "invalid", "0x10", -1, Infinity, NaN, false, [], {}]) {
  assert(thermalDisplay({ total }).includes("収穫時積算温度 記録要確認"));
}
complete = true;
for (const total of [0, "0", "0.0"]) assert(thermalDisplay({ total }).includes("収穫時積算温度 0℃"));
assert(thermalDisplay(null).includes("収穫時積算温度 未取得"));
for (const malformed of ["bad", [], 12]) assert(thermalDisplay(malformed).includes("収穫時積算温度 記録要確認"));
assert(thermalDisplay({ total: 999 }, { fieldId: "f2" }).includes("収穫時積算温度 未取得"));
assert(!render().includes("999℃"));
assert(thermalDisplay({ total: 999 }, { harvestDate: "2026-09-11" }).includes("収穫時積算温度 未取得"));
row.harvestSnapshots = [
  { fieldId: "f1", harvestDate: row.date, thermal: { total: 1000 } },
  { fieldId: "f1", harvestDate: row.date, thermal: { total: 1100 } }
];
assert(render().includes("収穫時積算温度 記録要確認"));
assert(!render().includes("1,000℃"));
row.harvestSnapshots = {};
assert(render().includes("収穫時積算温度 記録要確認"));
delete row.harvestSnapshots;
assert(render().includes("収穫時積算温度 未取得"));
assert(source.includes('class="annual-year-flow annual-story"'));
const flow = extract("renderYearFlow", "harvestTotalsForFieldYear");
assert(flow.includes('renderRecordFocus(["重要な記録", "繰り返し作業", "すべて"])'));
assert(flow.includes('class="annual-flow-field-context"'));
assert(!flow.includes("<select"));
assert(flow.includes('<h3>一年の流れ</h3>'));
assert(flow.includes('<small class="year">'));
assert(flow.includes('${timeLabel}<small>'));
assert(source.includes('selectedTab === "karte" ? " annual-story-surface" : ""'));
assert(flow.includes('class="annual-flow-actual-only"'));
row = { startDate: "2026-06-25", actualEndDate: "2026-07-11" };
html = render({ editKind: "dry", tone: "water", label: "中干し", category: "水管理",
  periodStartDate: row.startDate, periodEndDate: row.actualEndDate, days: 16, detail: "旧期間表示" });
assert(html.includes('6/25開始 → 7/11完了、<strong class="annual-flow-duration">16日間</strong>'));
assert(!html.includes("<br>"));
assert(!html.includes("旧期間表示"));
assert(!html.includes("data-annual-flow-summary"));
assert(!html.includes("annual-flow-milestone-badge"));
assert(source.includes("includePlanned: false"));
assert(source.includes("String(a.date).localeCompare(String(b.date))"));
const overview = extract("renderReviewOverview", "renderReviewCompare");
assert(overview.indexOf("renderYearFlow(field)") < overview.indexOf("annual-flow-compare-link"));
for (const selector of ["data-annual-record-open-kind", "data-annual-flow-menu-kind", "data-annual-flow-summary"]) assert(source.includes(selector));
console.log("Annual story PASS: actual/unknown/memo/empty/escaping/routes/panicle/manual/heading/multi-field harvest.");
