"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const memory = new Map(); let writes = 0;
const root = { innerHTML: "" };
const c = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
  localStorage: { getItem: k => memory.get(k) ?? null, setItem(k, v) { writes++; memory.set(k, String(v)); } } });
c.window = c;
const read = name => fs.readFileSync(path.join(__dirname, "../assets/js", name + ".js"), "utf8");
for (const name of ["utils", "schema", "storage", "state", "agro", "cultivation", "outlook"]) vm.runInContext(read("core/" + name), c);
const R = c.RiceOS, U = R.utils, S = R.state, plain = v => JSON.parse(JSON.stringify(v));
U.today = () => "2026-07-20";
const fixture = {
  varieties: [{ varietyId: "v", name: "Test variety", panicleInitiationDaysAfterPlanting: 60, headingDaysAfterPlanting: 90, topDressingDaysBeforeHeading: 20,
    panicleAccumulatedTempTarget: 1, headingAccumulatedTempTarget: 2, ripeningAccumulatedTempMin: 3, ripeningAccumulatedTempMax: 4, harvestDaysAfterHeadingMin: 1, harvestDaysAfterHeadingMax: 2 }],
  fields: [{ fieldId: "a", name: "Field A", varietyId: "v" }],
  fieldWorks: [{ workId: "plant", fieldIds: ["a"], date: "2026-05-01", workName: "田植え" },
    { workId: "old-plant", fieldIds: ["a"], date: "2025-05-01", workName: "田植え" }],
  growthLogs: [{ logId: "old-heading", fieldId: "a", date: "2025-08-09", headingObserved: true, varietyId: "v", varietyProfile: "Test variety" },
    { logId: "manual", fieldId: "a", date: "2026-07-01", stageConfirmed: true, observedStage: "heading", headingObserved: false }]
};
assert(S.replace(fixture, "fixture"));
let count = writes, before = JSON.stringify(S.data());
let row = R.outlook.forField("a");
assert.equal(row.heading.kind, "combined");
assert.equal(row.heading.date, R.cultivation.forField("a").heading.date);
assert.equal(row.panicle.date, R.cultivation.forField("a").panicle.date);
assert.equal(row.topDressing.date, U.dateAddDays(row.heading.date, -20));
assert.equal(row.stage.fieldStage.evidence, "現地判断");
assert.equal(row.stage.fieldStage.current.key, "heading");
assert.equal(row.snapshot.actualHeadingDate, "");
assert.deepEqual(plain(row.stage.outlookStage.current.key), plain(row.cultivation.predictedStage.key));
assert.equal(row.cultivation.history.heading.years.length, 1);
assert(!row.sources.some(s => s.key === "varietyPrevious" || s.key === "fieldPrevious"));
assert.equal(JSON.stringify(S.data()), before); assert.equal(writes, count);
const reference = R.agro.harvestReferenceFor("a");
assert.equal(reference.minimum, 1000); assert.equal(reference.maximum, 1000);
assert.equal(reference.daysMin, 40); assert.equal(reference.daysMax, 50);
for (const [name, target, minimum, maximum] of [["天のつぶ",1100,1100,1100],["コシヒカリ",1125,1100,1150]]) {
  const editedTarget = plain(S.data());
  Object.assign(editedTarget.varieties[0], { name, ripeningAccumulatedTempTarget: target });
  assert(S.replace(editedTarget, "target edit"));
  const adjusted = R.agro.harvestReferenceFor("a");
  assert.equal(adjusted.target, target); assert.equal(adjusted.minimum, minimum); assert.equal(adjusted.maximum, maximum);
  assert.equal(adjusted.daysMin, 40); assert.equal(adjusted.daysMax, 50);
  assert(adjusted.label.includes(String(minimum)));
}
assert(S.replace(fixture, "restore target fixture"));
const oldFieldStage = plain(row.stage.fieldStage), oldHeading = row.heading.date, oldSnapshot = plain(row.snapshot);
assert(S.saveOutlookSnapshots([oldSnapshot]));
count = writes;
assert(S.saveOutlookSnapshots([oldSnapshot])); assert.equal(writes, count, "same snapshot is a no-op");
const changed = plain(S.data()); changed.varieties[0].headingDaysAfterPlanting = 110;
assert(S.replace(changed, "master edit"));
row = R.outlook.forField("a");
assert.notEqual(row.heading.date, oldHeading);
assert.deepEqual(plain(row.stage.fieldStage), oldFieldStage, "master never rewrites field judgement");
assert.equal(S.data().meta.outlookSnapshots[0].headingDate, oldHeading);
assert(S.saveOutlookSnapshots([row.snapshot]));
assert.equal(S.data().meta.outlookSnapshots.length, 2);
assert.deepEqual(plain(S.data().meta.outlookSnapshots[1].basis.cultivation), plain(row.cultivation));
count = writes;
assert(S.saveOutlookSnapshots([R.outlook.forField("a").snapshot])); assert.equal(writes, count);
const noHistory = plain(fixture); delete noHistory.growthLogs[0].varietyId; delete noHistory.growthLogs[0].varietyProfile;
assert(S.replace(noHistory, "unconfirmed history"));
assert.equal(R.outlook.forField("a").heading.kind, "master", "never infer past variety from current field");
assert.equal(R.outlook.forField("a").cultivation.history.heading.rows.length, 0);
const missing = plain(noHistory); missing.varieties[0].headingDaysAfterPlanting = "";
assert(S.replace(missing, "missing heading"));
assert.equal(R.outlook.forField("a").heading.kind, "missing", "no legacy fallback when common model lacks heading");
const observed = plain(fixture);
observed.growthLogs.push({ logId: "actual", fieldId: "a", date: "2026-07-19", headingObserved: true });
assert(S.replace(observed, "actual heading"));
row = R.outlook.forField("a"); assert.equal(row.heading.kind, "actual"); assert.equal(row.heading.date, "2026-07-19");
assert.equal(row.snapshot.actualHeadingDate, "2026-07-19");
assert.equal(R.outlook.harvestTemperatureProjection("a", { asOf: U.today() }).status, "location-mismatch");
const thermalTarget = plain(S.data());
thermalTarget.meta.weatherLocation = { latitude:37, longitude:140 };
Object.assign(thermalTarget.varieties[0], { name:"天のつぶ", ripeningAccumulatedTempTarget:1100 });
assert(S.replace(thermalTarget, "thermal target"));
let thermal = R.outlook.harvestTemperatureProjection("a", { asOf:U.today(), locationKey:"37|140", rows:[] });
assert.equal(thermal.thresholds.minimum,1100); assert.equal(thermal.thresholds.maximum,1100);
const thermalEdited = plain(S.data()); thermalEdited.varieties[0].ripeningAccumulatedTempTarget = 1200;
assert(S.replace(thermalEdited, "thermal target edit"));
thermal = R.outlook.harvestTemperatureProjection("a", { asOf:U.today(), locationKey:"37|140", rows:[] });
assert.equal(thermal.thresholds.minimum,1200); assert.equal(thermal.thresholds.maximum,1200);
assert(S.replace(fixture, "UI fixture"));
U.$ = id => id === "outlookDashboard" ? root : null;
vm.runInContext(read("screens/outlook").replace("  function render(options)",
  "  RiceOS.testOutlook = { detail, fieldCard, weatherKey };\n  function render(options)"), c);
row = R.outlook.forField("a");
const card = R.testOutlook.fieldCard(row), detail = R.testOutlook.detail(row);
for (const label of ["幼穂形成目安", "出穂目安", "追肥参考時期"]) { assert(card.includes(label)); assert(detail.includes(label)); }
assert(detail.includes("data-outlook-cultivation-evidence")); assert(detail.includes("1年 / 1圃場"));
assert(detail.includes("ばらつき")); assert(card.includes("推定"));
assert(card.includes("現場記録")); assert(card.includes("出穂期（現地判断）")); assert(card.includes("生育推定:"));
assert.equal(R.agro.seasonStageForField("a", "2026-05-02").outlookStage.current.key, "establishment", "stage index starts at one");
const firstKey = R.testOutlook.weatherKey(null, U.today());
const masterOnly = plain(S.data()); masterOnly.varieties[0].topDressingDaysBeforeHeading = 10;
assert(S.replace(masterOnly, "master change without heading change"));
assert.notEqual(R.testOutlook.weatherKey(null, U.today()), firstKey, "model-only edits invalidate pending weather context");
vm.runInContext(read("screens/home").replace("  function cropYear(dateText)",
  "  RiceOS.testHome = { renderHeatMeter, headingDateInfo, homeStageHeat, progressRowsForField, heatCache, heatCacheKey };\n  function cropYear(dateText)"), c);
const home = R.testHome;
assert.equal(home.headingDateInfo(S.field("a"), { rows: [{ date: "2026-05-02", tempMean: 99999 }] }, "2026-05-01", 1, U.today()).date, R.cultivation.forField("a").heading.date);
const html = home.renderHeatMeter(S.field("a"));
assert(html.includes("data-cultivation-milestones")); assert(html.includes("追肥参考"));
assert(!html.includes("出穂目安 2℃")); assert(!html.includes("幼穂 1℃"));
const progress = home.progressRowsForField(S.field("a"));
assert(progress.some(r => r.title === "追肥参考時期"));
assert(!JSON.stringify(progress).includes("積算気温目標"));
assert.equal(JSON.stringify(S.data().growthLogs), JSON.stringify(masterOnly.growthLogs), "projection never enters the factual timeline");
const homeObserved = plain(observed);
homeObserved.growthLogs.find(log => log.logId === "actual").date = "2026-07-18";
assert(S.replace(homeObserved, "home actual thermal"));
home.heatCache.set(home.heatCacheKey(S.field("a"), "2026-05-01", U.today()), { rows:[
  { date:"2026-07-18",tempMean:100,source:"Open-Meteo Archive" },
  { date:"2026-07-19",tempMean:20,source:"Open-Meteo Archive" },
  { date:"2026-07-20",tempMean:888,source:"Open-Meteo Archive" },
  { date:"2026-07-21",tempMean:999,source:"Open-Meteo Archive" }
] });
assert.equal(home.homeStageHeat(S.field("a"), U.today()).title,"20℃");
assert.match(home.homeStageHeat(S.field("a"), U.today()).note,/出穂翌日/);
console.log("PASS cultivation integration: real module, master/history/actual/missing, field-stage separation, retired overrides, immutable snapshots/no-op, model weather fingerprint, outlook/home rendering and no legacy thermal targets");
