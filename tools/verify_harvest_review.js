"use strict";

// Isolated fixtures only: never reads browser storage or writes application files.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const memory = new Map();
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { value: "", dataset: {}, hidden: false,
    classList: { toggle() {}, add() {}, remove() {} }, querySelectorAll: () => [],
    get parentElement() { return element(`${id}:parent`); },
    closest(selector) { return element(`${id}:ancestor:${selector}`); },
    setAttribute(name, value) { this[name] = String(value); } });
  return elements.get(id);
}
const context = vm.createContext({ console, navigator: {}, alert() {}, dispatchEvent() {},
  document: { getElementById: element, querySelectorAll: () => [], body: { appendChild() {} } },
  localStorage: { getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) }
});
context.window = context;
context.scrollTo = () => {};
function load(file, exports) {
  let code = source(file);
  // Expose private functions in this VM only, preserving the checked-out sources.
  if (exports) {
    assert.match(code, /\}\)\(\);\s*$/);
    code = code.replace(/\}\)\(\);\s*$/, `window.audit = { ${exports} }; })();`);
  }
  vm.runInContext(code, context, { filename: file });
}
const plain = (value) => JSON.parse(JSON.stringify(value));
let passed = 0;
let failed = 0;
function test(name, run) {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
load("assets/js/core/utils.js");
load("assets/js/core/schema.js");
const S = context.RiceOS.schema;
memory.set(S.STORE_KEY, JSON.stringify(S.normalize({
  varieties: [{ varietyId: "v", name: "fixture" }],
  fields: ["a", "b", "c"].map((fieldId) => ({ fieldId, name: fieldId, varietyId: "v", areaA: 10 }))
})));
load("assets/js/core/storage.js");
load("assets/js/core/state.js");
load("assets/js/core/harvest-review.js");
const state = context.RiceOS.state;
const harvest = "\u7a32\u5208\u308a";
const other = "\u8349\u5208\u308a";
const review = { surface: "\u786c\u3081", traffic: "\u554f\u984c\u306a\u3057",
  weeds: "\u5c11\u3057", weedExtent: "\u4e00\u90e8", weedImpact: "\u306a\u3057",
  weedNote: "<script>fixture</script>\nweed note", yieldKg: "1000.25", harvestAreaA: "30",
  yieldBasis: "\u7384\u7c73\uff08\u4e7e\u71e5\u8abf\u88fd\u5f8c\uff09" };
const base = { workId: "review", date: "2026-09-10", fieldIds: ["a", "b"], workName: harvest };
const row = (id = "review") => state.data().fieldWorks.find((work) => work.workId === id);
test("save all nine review fields and one shared group total", () => {
  state.saveFieldWork({ ...base, harvestReview: review });
  assert.deepEqual(plain(row().harvestReview), review);
  assert.equal(state.data().fieldWorks.filter((work) => work.workId === base.workId).length, 1);
  assert.equal(row().harvestSnapshots.length, 2);
  assert.ok(row().harvestSnapshots.every((item) => item.harvestReview === undefined && item.yieldKg === undefined));
});
test("partial edit and omitted review preserve existing values", () => {
  state.saveFieldWork({ ...base, harvestReview: { weedNote: "edited" } });
  assert.deepEqual(plain(row().harvestReview), { ...review, weedNote: "edited" });
  state.saveFieldWork({ ...base, memo: "ordinary edit" });
  assert.deepEqual(plain(row().harvestReview), { ...review, weedNote: "edited" });
});
test("non-harvest rename retains review and JSON roundtrip", () => {
  state.saveFieldWork({ ...base, workName: other });
  assert.equal(row().harvestReview.yieldKg, review.yieldKg);
  const restored = S.normalize(plain(state.data())).fieldWorks.find((work) => work.workId === base.workId);
  assert.deepEqual(plain(restored.harvestReview), plain(row().harvestReview));
  state.saveFieldWork(base);
});
test("explicit blank clears only that field; zero yield is retained", () => {
  state.saveFieldWork({ ...base, harvestReview: { weedNote: "", yieldKg: 0 } });
  assert.equal(row().harvestReview.weedNote, "");
  assert.equal(row().harvestReview.yieldKg, "0");
  assert.equal(row().harvestReview.harvestAreaA, "30");
});
for (const invalid of [null, [], "bad", { surface: "bad" }, { traffic: "bad" }, { weeds: "bad" },
  { weedExtent: "bad" }, { weedImpact: "bad" }, { yieldBasis: "bad" }, { weedNote: 1 },
  ...[-1, Infinity, NaN, "1e3", "0x10", "1,000", true, {}, "-0"].map((yieldKg) => ({ yieldKg })),
  ...[0, -1, "0", "oops", [], true].map((harvestAreaA) => ({ harvestAreaA }))]) {
  test(`reject invalid ${JSON.stringify(invalid)} atomically`, () => {
    const before = JSON.stringify(state.data());
    const stored = [...memory.entries()];
    assert.throws(() => S.normalizeHarvestReview(invalid, true));
    assert.equal(state.saveFieldWork({ ...base, harvestReview: invalid }), null);
    assert.equal(JSON.stringify(state.data()), before);
    assert.deepEqual([...memory.entries()], stored);
  });
}
test("decimal precision, whitespace and tolerant import", () => {
  assert.equal(S.normalizeHarvestReview({ yieldKg: " 1.234567 " }, true).yieldKg, "1.234567");
  assert.equal(S.normalizeHarvestReview({ harvestAreaA: ".001" }, true).harvestAreaA, ".001");
  const value = S.normalizeHarvestReview({ yieldKg: "bad", harvestAreaA: -1, surface: "bad", weedNote: "keep" });
  assert.equal(value.yieldKg, ""); assert.equal(value.harvestAreaA, "");
  assert.equal(value.surface, ""); assert.equal(value.weedNote, "keep");
});
function waterWork(id, fieldId, date) {
  state.saveFieldWork({ workId: id, fieldIds: [fieldId], date, workName: harvest });
  return row(id).harvestSnapshots[0].water;
}
test("water missing facts stay blank, false survives JSON", () => {
  const water = waterWork("empty", "c", "2026-09-10");
  assert.equal(water.elapsedDaysFromFinalDrain, "");
  assert.equal(water.elapsedDaysFromHeadingToDrain, "");
  assert.equal(water.rewateringAfterDrain, false);
});
state.saveGrowthLog({ logId: "heading", fieldId: "a", date: "2026-08-01", headingObserved: true, observedStage: "heading", stageConfirmed: true });
state.saveIrrigation({ irrigationId: "drain", fieldId: "a", method: "\u843d\u6c34", startDate: "2026-08-25" });
test("elapsed days exclude start day; same-day zero survives normalization", () => {
  const same = waterWork("same-day", "a", "2026-08-25");
  assert.equal(same.elapsedDaysFromFinalDrain, "0");
  assert.equal(same.daysFromFinalDrain, "1");
  assert.equal(same.elapsedDaysFromHeadingToDrain, "24");
  assert.equal(waterWork("later", "a", "2026-09-10").elapsedDaysFromFinalDrain, "16");
  assert.equal(waterWork("before", "a", "2026-08-24").finalDrainDate, "");
});
state.saveIrrigation({ irrigationId: "reflood", fieldId: "a", method: "\u9593\u65ad\u704c\u6c34", startDate: "2026-08-26",
  waterMovements: [{ movementId: "flood", phase: "flood", startDate: "2026-08-27" },
    { movementId: "future", phase: "flood", startDate: "2026-09-20" }] });
test("rewatering is bounded by harvest date; snapshots remain immutable on ordinary edit", () => {
  const water = waterWork("rewater", "a", "2026-09-10");
  assert.equal(water.rewateringAfterDrain, true);
  assert.equal(water.lastWateringDate, "2026-08-27");
  assert.equal(row("later").harvestSnapshots[0].water.rewateringAfterDrain, false);
  assert.deepEqual(plain(S.normalize(plain(state.data())).fieldWorks.find((work) => work.workId === "rewater").harvestSnapshots[0].water), plain(water));
});
test("planned drain must not become actual final drain", () => {
  state.saveIrrigation({ irrigationId: "planned", fieldId: "c", method: "\u843d\u6c34", date: "2026-08-20",
    startDate: "", plannedStartDate: "2026-08-25", periodStatus: "\u4e88\u5b9a" });
  assert.equal(waterWork("planned-harvest", "c", "2026-09-10").finalDrainDate, "");
});
test("planned drain status alone must not become actual drainage", () => {
  state.saveIrrigation({ irrigationId: "planned", fieldId: "c", method: "\u843d\u6c34", date: "2026-08-20",
    startDate: "", plannedStartDate: "", endDate: "", periodStatus: "\u4e88\u5b9a" });
  assert.equal(waterWork("status-plan-harvest", "c", "2026-09-10").finalDrainDate, "");
});
test("planned drain boundaries: end-only plan excluded, explicit actual start retained", () => {
  state.saveIrrigation({ irrigationId: "planned", fieldId: "c", method: "\u843d\u6c34", date: "2026-08-20",
    startDate: "", plannedStartDate: "", endDate: "2026-08-30", periodStatus: "\u4e88\u5b9a" });
  assert.equal(waterWork("end-plan-harvest", "c", "2026-09-10").finalDrainDate, "");
  state.saveIrrigation({ irrigationId: "planned", fieldId: "c", method: "\u843d\u6c34", date: "2026-08-20",
    startDate: "2026-08-26", plannedStartDate: "2026-08-25", endDate: "2026-08-30" });
  assert.equal(waterWork("actual-plan-harvest", "c", "2026-09-10").finalDrainDate, "2026-08-26");
});
load("assets/js/screens/annual.js", "renderHarvestReview, renderHarvestSnapshot, renderAnnualRecordDetail, renderHarvestReflection");
const annual = context.audit;
for (const [hours, totalHours, expected] of [
  ["3\u6642\u9593", "", "3\u6642\u9593"], ["1\u6642\u959330\u5206", "", "1.5\u6642\u9593"],
  ["90\u5206", "", "1.5\u6642\u9593"], ["3", "", "3\u6642\u9593"],
  ["", "3\u6642\u9593", "3\u6642\u9593"], ["0", "", "0\u6642\u9593"], ["", "", ""]
]) {
  test(`annual actual detail duration ${JSON.stringify({ hours, totalHours })}`, () => {
    const workId = `duration-${passed}-${failed}`;
    state.saveFieldWork({ ...base, workId, hours, totalHours });
    const before = JSON.stringify(state.data());
    const html = annual.renderAnnualRecordDetail(state.field("a"), { kind: "fieldWork", id: workId });
    if (expected) assert.ok(html.includes(expected), html);
    else assert.ok(!html.includes("0\u6642\u9593"));
    assert.equal(JSON.stringify(state.data()), before);
  });
}
test("annual totals, rounding, conditions, escaping and empty review", () => {
  const html = annual.renderHarvestReview({ ...base, harvestReview: review });
  assert.ok(html.includes("1000.25kg")); assert.ok(html.includes("333.4kg/10a"));
  assert.ok(html.includes("\u914d\u5206\u3057\u3066\u3044\u307e\u305b\u3093"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!annual.renderHarvestReview({ harvestReview: { ...review, yieldBasis: "" } }).includes("kg/10a"));
  assert.ok(annual.renderHarvestReview({ harvestReview: { ...review, yieldKg: "0" } }).includes("0kg/10a"));
  assert.equal(annual.renderHarvestReview({ harvestReview: S.normalizeHarvestReview({}) }), "");
});
load("assets/js/screens/field-work.js", "loadHarvestReview, harvestReviewValue, renderHarvestReview");
const ui = context.audit;
test("UI loader restores all values, clears stale data and disables non-harvest inputs", () => {
  element("fwName").value = harvest;
  ui.loadHarvestReview({ workName: harvest, harvestReview: review });
  assert.deepEqual(plain(ui.harvestReviewValue()), review);
  assert.equal(element("fwHarvestReview").open, true);
  ui.loadHarvestReview(null);
  assert.ok(Object.values(ui.harvestReviewValue()).every((value) => value === ""));
  element("fwName").value = other;
  ui.loadHarvestReview({ workName: other, harvestReview: review });
  assert.equal(element("fwHarvestReview").hidden, true);
  assert.equal(element("fwHarvestYieldKg").disabled, true);
});
test("public edit and new-record entry points load or clear review", () => {
  state.saveFieldWork({ ...base, harvestReview: review });
  const screen = context.RiceOS.screens.fieldWork;
  screen.editWork(base.workId);
  assert.deepEqual(plain(ui.harvestReviewValue()), review);
  for (const run of [() => screen.resetForm(), () => screen.prefillField("a"),
    () => screen.prefillDate("2026-09-10", "a"), () => screen.prefillFields("2026-09-10", ["a", "b"]),
    () => screen.prefillSchedule({ scheduleId: "s", title: harvest, fieldIds: ["a"] })]) {
    screen.editWork(base.workId);
    run();
    assert.ok(Object.values(ui.harvestReviewValue()).every((value) => value === ""));
  }
});
test("retained non-harvest review must survive changing work name back to harvest", () => {
  state.saveFieldWork({ ...base, workName: other, harvestReview: review });
  context.RiceOS.screens.fieldWork.editWork(base.workId);
  element("fwName").value = harvest;
  ui.renderHarvestReview();
  state.saveFieldWork({ ...base, harvestReview: ui.harvestReviewValue() });
  assert.deepEqual(plain(row().harvestReview), review);
});
test("source contract: both edit loaders, reset, template, duplicate and prefills", () => {
  const code = source("assets/js/screens/field-work.js");
  assert.equal((code.match(/loadHarvestReview\(work\);/g) || []).length, 2);
  for (const name of ["resetForm", "applyWorkTemplate"]) {
    const body = code.match(new RegExp(`function ${name}\\([^]*?\\n  \\}`))[0];
    assert.ok(body.includes("loadHarvestReview(null)"), name);
  }
  for (const name of ["prefillField", "prefillDate", "prefillFields", "prefillSchedule"]) {
    assert.ok(code.match(new RegExp(`function ${name}\\([^]*?\\n  \\}`))[0].includes("resetForm()"), name);
  }
  assert.match(code, /workAction === "duplicate"[^]*?loadHarvestReview\(null\)/);
  assert.match(code, /isHarvestWork\(workName\) \? \{ harvestReview: harvestReviewValue\(\) \} : \{\}/);
  for (const id of ["Surface", "Traffic", "Weeds", "WeedExtent", "WeedImpact", "WeedNote", "YieldKg", "AreaA", "YieldBasis"]) {
    assert.equal((source("index.html").match(new RegExp(`id="fwHarvest${id}"`, "g")) || []).length, 1);
  }
});
test("off-field custom name survives edit and schedule prefill without harvest defaults", () => {
  const customName = "Custom harvest workshop";
  const screen = context.RiceOS.screens.fieldWork;
  state.saveFieldWork({ workId: "custom-off-field", date: "2026-09-10", targetScope: "offField", fieldIds: [], workName: customName });
  screen.editWork("custom-off-field");
  assert.equal(element("fwTargetScope").value, "offField");
  assert.equal(element("fwName").value, "\u305d\u306e\u4ed6");
  assert.equal(element("fwCustomName").value, customName);
  assert.equal(element("fwCustomNameLabel").hidden, false);
  assert.equal(element("fwCustomName").required, true);
  assert.equal(element("fwHarvestReview").hidden, true);
  screen.prefillSchedule({ scheduleId: "custom-plan", targetScope: "offField", fieldIds: [], title: `${customName}\u4e88\u5b9a` });
  assert.equal(element("fwCustomName").value, customName);
  assert.equal(element("fwMachine").value, "");
  screen.resetForm();
  assert.equal(element("fwCustomName").value, "");
  assert.equal(element("fwCustomNameLabel").hidden, true);
  assert.equal(element("fwCustomName").required, false);
});
test("literal Other off-field name remains editable", () => {
  const name = "\u305d\u306e\u4ed6";
  const screen = context.RiceOS.screens.fieldWork;
  state.saveFieldWork({ workId: "literal-other", date: "2026-09-10", targetScope: "offField", fieldIds: [], workName: name });
  screen.editWork("literal-other");
  assert.equal(element("fwCustomName").value, name);
  screen.prefillSchedule({ scheduleId: "literal-other-plan", targetScope: "offField", fieldIds: [], title: `${name}\u4e88\u5b9a` });
  assert.equal(element("fwCustomName").value, name);
});
const describe = context.RiceOS.harvestReview.describe;
const U = context.RiceOS.utils;
U.today = () => "2026-11-14";
U.now = () => "2026-11-14T00:00:00Z";
const reflectionWork = () => ({ ...base, cropYear: 2025, memo: "Original\n<script>not HTML</script>",
  harvestTimingByField: { a: { assessment: "early", idealStartDate: "2026-09-11", idealEndDate: "2026-09-13", delayReason: "rain", memo: "operator reason" }, b: { assessment: "late" } },
  harvestReview: { ...review } });
function pureDescribe(work, fieldId) {
  const before = JSON.stringify([work, state.data(), [...memory]]);
  const setItem = context.localStorage.setItem, removeItem = context.localStorage.removeItem;
  const fail = () => { throw Error("Read-only description attempted I/O"); };
  context.localStorage.setItem = fail; context.localStorage.removeItem = fail; context.fetch = fail;
  let result;
  try { result = describe(work, fieldId); }
  finally { context.localStorage.setItem = setItem; context.localStorage.removeItem = removeItem; }
  assert.equal(JSON.stringify([work, state.data(), [...memory]]), before, "Description must not mutate work, state, or storage");
  return result;
}
test("reflection DTO keeps per-field assessment, work crop year, exact memo and group scope", () => {
  const work = reflectionWork(), dto = pureDescribe(work, "a");
  assert.equal(dto.assessment.code, "early"); assert.equal(dto.assessment.recorded, true);
  assert.equal(dto.assessment.evaluatedAt, ""); assert.equal(dto.year, "2025");
  assert.equal(dto.sourceMemo, work.memo); assert.equal(dto.timing.memo, "operator reason");
  assert.equal(dto.observations.shared, true); assert.match(dto.observations.scopeLabel, /共通/);
  assert.equal(dto.metrics.kg, 1000.25); assert.equal(dto.metrics.areaA, 30);
  assert.equal(dto.metrics.kgPer10a, 1000.25 / 30 * 10); assert.equal(dto.metrics.scope, "work");
  assert.equal(pureDescribe(work, "b").metrics.kg, dto.metrics.kg, "Never allocate group totals");
  assert.equal(pureDescribe(work, "b").assessment.code, "late");
  assert(dto.summaryLines.includes(`元の作業メモ: ${work.memo}`));
  dto.observations.surface = "changed"; dto.summaryLines.push("changed");
  assert.equal(work.harvestReview.surface, review.surface);
});
test("unassociated, off-field, and non-harvest work never leaks field observations", () => {
  for (const [work, id] of [[reflectionWork(), "c"], [{ ...reflectionWork(), targetScope: "offField" }, "a"], [{ ...reflectionWork(), workName: other }, "a"]]) {
    const dto = pureDescribe(work, id); assert.equal(dto.associated, false); assert.equal(dto.assessment.recorded, false);
    assert.equal(dto.observations.surface, ""); assert.equal(dto.metrics.kg, null); assert.equal(dto.sourceMemo, "");
    assert.equal(dto.comparison.day.available, false); assert.deepEqual(plain(dto.summaryLines), []);
  }
});
test("missing, zero, malformed, infinite, and overflow metrics are distinct", () => {
  const work = reflectionWork();
  work.harvestReview = {}; assert.equal(pureDescribe(work, "a").metrics.kg, null);
  for (const value of ["", " ", null, true, {}, "no", -1, Infinity, "Infinity"]) {
    work.harvestReview = { yieldKg: value, harvestAreaA: "10", yieldBasis: review.yieldBasis };
    assert.equal(pureDescribe(work, "a").metrics.kg, null);
  }
  work.harvestReview = { yieldKg: "0", harvestAreaA: "10", yieldBasis: review.yieldBasis };
  assert.equal(pureDescribe(work, "a").metrics.kgPer10a, 0);
  work.harvestReview.harvestAreaA = "0"; assert.equal(pureDescribe(work, "a").metrics.kgPer10a, null);
  work.harvestReview = { yieldKg: "100", harvestAreaA: "10", yieldBasis: "" };
  assert.equal(pureDescribe(work, "a").metrics.kgPer10a, null);
  work.harvestReview = { yieldKg: "1" + "0".repeat(307), harvestAreaA: ".1", yieldBasis: review.yieldBasis };
  assert.equal(pureDescribe(work, "a").metrics.kgPer10a, null);
  assert.equal(pureDescribe({}, "a").harvestDate, ""); assert.equal(pureDescribe({}, "a").year, "");
});
test("all recorded assessments including pending stay human-only; no invented summary", () => {
  for (const code of ["early", "appropriate", "late", "pending", "invalid", "toString"]) {
    const work = { ...base, harvestTimingByField: { a: { assessment: code } } };
    const dto = pureDescribe(work, "a");
    assert.equal(dto.assessment.recorded, ["early", "appropriate", "late", "pending"].includes(code));
    assert.equal(dto.summaryLines.length, dto.assessment.recorded ? 1 : 0);
    assert.equal(dto.timing.idealStartDate, "", "Never invent ideal dates from the assessment");
  }
});
test("saved thermal requires unique field/date and distinguishes partial and legacy", () => {
  const work = reflectionWork();
  const snapshot = { fieldId: "a", harvestDate: base.date, thermal: { coverageVersion: 1, status: "確定", headingDate: "2026-09-07", startDate: "2026-09-08", endDate: base.date,
    total: 0, count: "3", expectedDays: "3", source: "Open-Meteo Archive" } };
  work.harvestSnapshots = [snapshot];
  let thermal = pureDescribe(work, "a").metrics.thermal;
  assert.equal(thermal.status, "complete"); assert.equal(thermal.total, 0); assert.equal(thermal.savedAt, "");
  snapshot.thermal.count = "2"; thermal = pureDescribe(work, "a").metrics.thermal;
  assert.equal(thermal.status, "partial"); assert.equal(thermal.partial, true);
  delete snapshot.thermal.coverageVersion; assert.equal(pureDescribe(work, "a").metrics.thermal.status, "legacy");
  snapshot.thermal.source = "Open-Meteo Forecast"; assert.equal(pureDescribe(work, "a").metrics.thermal.available, false);
  snapshot.thermal.source = "Open-Meteo Archive"; snapshot.thermal.total = true;
  assert.equal(pureDescribe(work, "a").metrics.thermal.total, null);
  snapshot.thermal.total = 12; work.harvestSnapshots.push({ ...snapshot });
  assert.equal(pureDescribe(work, "a").metrics.thermal.status, "ambiguous");
  work.harvestSnapshots = [{ ...snapshot, fieldId: "b" }, { ...snapshot, harvestDate: "2026-09-09" }];
  assert.equal(pureDescribe(work, "a").metrics.thermal.available, false);
});
test("legacy numeric thermal stays visible without modern metadata and cannot enable comparison", () => {
  const work = reflectionWork();
  const snapshot = { fieldId: "a", harvestDate: work.date, thermal: { total: "820.5" } };
  work.harvestSnapshots = [snapshot];
  let dto = pureDescribe(work, "a");
  assert.equal(dto.metrics.thermal.available, true); assert.equal(dto.metrics.thermal.total, 820.5);
  assert.equal(dto.metrics.thermal.status, "legacy"); assert.equal(dto.metrics.thermal.legacy, true);
  assert.match(dto.metrics.thermal.label, /未検証/); assert.match(dto.metrics.thermal.label, /比較根拠には使用しません/);
  assert.equal(dto.metrics.thermal.count, null); assert.equal(dto.metrics.thermal.expectedDays, null);
  assert.equal(dto.metrics.thermal.savedAt, ""); assert.equal(dto.comparison.thermal.available, false);
  snapshot.thermal.total = 0; assert.equal(pureDescribe(work, "a").metrics.thermal.total, 0);
  for (const total of ["", " ", null, true, {}, Infinity, "bad"]) {
    snapshot.thermal.total = total; assert.equal(pureDescribe(work, "a").metrics.thermal.available, false);
  }
  snapshot.thermal.total = 820.5;
  for (const source of ["Open-Meteo Forecast", "seasonal", "予報"]) {
    snapshot.thermal.source = source; assert.equal(pureDescribe(work, "a").metrics.thermal.available, false);
  }
  snapshot.thermal.source = ""; snapshot.thermal.status = "forecast";
  assert.equal(pureDescribe(work, "a").metrics.thermal.available, false);
  snapshot.thermal.status = "一部欠測";
  assert.equal(pureDescribe(work, "a").metrics.thermal.partial, true);
  snapshot.thermal.coverageVersion = 1;
  assert.equal(pureDescribe(work, "a").metrics.thermal.available, false, "Modern data must still pass coverage validation");
});
test("comparison reuses real saved-preharvest validator, matches work ID, separates operator from offsets", () => {
  const forecast = { snapshotId: "valid-before", fieldId: "a", season: "2026", asOf: "2026-09-01", savedAt: "2026-09-01T01:00:00Z",
    headingKind: "actual", actualHeadingDate: "2026-08-01", harvestKind: "heading", harvestRange: { start: "2026-09-03", end: "2026-09-07" } };
  const work = reflectionWork();
  assert(state.replace(S.normalize({ fields: [{ fieldId: "a" }, { fieldId: "b" }], growthLogs: [{ fieldId: "a", date: "2026-08-01", headingObserved: true }],
    fieldWorks: [work], meta: { activeCropYear: 2024, outlookSnapshots: [forecast] } })));
  const saved = row();
  let dto = pureDescribe(saved, "a");
  assert.equal(dto.comparison.day.available, true); assert.equal(dto.comparison.day.offsetDays, 3);
  assert.equal(dto.comparison.day.labelText, "目安期間の終了から3日後");
  assert.equal(dto.assessment.code, "early"); assert.equal(dto.year, "2025");
  assert.equal(dto.comparison.thermal.available, false); assert.match(dto.comparison.thermal.reason, /積算/);
  assert(!dto.summaryLines.some(line => /3日後|刈り遅れ/.test(line)));
  const snapshot = state.data().meta.outlookSnapshots[0];
  snapshot.harvestRange = { start: "2026-09-13", end: "2026-09-15" };
  assert.equal(pureDescribe(saved, "a").comparison.day.labelText, "目安期間の開始から3日前");
  snapshot.harvestRange = { start: "2026-09-09", end: "2026-09-11" };
  assert.equal(pureDescribe(saved, "a").comparison.day.relation, "inside");
  snapshot.harvestRange = { start: "2026-02-30", end: "2026-09-11" };
  assert.equal(pureDescribe(saved, "a").comparison.day.available, false);
  snapshot.harvestRange = { start: "2026-09-03", end: "2026-09-07" };
  for (const savedAt of ["2026-09-10T00:00:00Z", "2026-09-09T15:00:00Z", "2026-09-11T00:00:00Z", "invalid"]) {
    snapshot.savedAt = savedAt; assert.equal(pureDescribe(saved, "a").comparison.day.available, false);
  }
  assert.equal(pureDescribe({ ...saved, workId: "different" }, "a").comparison.day.available, false);
});
test("thermal comparison uses validated ranges only, never raw snapshot errors or temperature division", () => {
  const snapshot = state.data().meta.outlookSnapshots[0];
  snapshot.savedAt = "2026-09-01T01:00:00Z";
  snapshot.errorDays = 999;
  state.data().meta.weatherLocation = { latitude: 37, longitude: 140 };
  snapshot.basis = { thermalProjection: { status: "projected", asOf: "2026-09-01", headingDate: "2026-08-01", startDate: "2026-08-02", endDate: "2026-08-31",
    retrievedAt: "2026-09-01T00:00:00Z", locationKey: "37|140", range: { start: "2026-09-11", end: "2026-09-16" },
    forecastDays: 7, seasonalDays: 9, seasonalMinimumYears: 2, seasonalExpectedYears: 3,
    historical: { complete: true, count: 30, expectedDays: 30, total: 600, source: "Open-Meteo Archive (reanalysis/model)" },
    sources: { historical: ["Open-Meteo Archive"], forecast: ["Open-Meteo Forecast"], seasonal: ["Open-Meteo prior-year daily seasonal reference (reanalysis/model)"] } } };
  let dto = pureDescribe(row(), "a");
  assert.equal(dto.comparison.thermal.available, true); assert.equal(dto.comparison.thermal.offsetDays, -1);
  assert.equal(dto.comparison.thermal.labelText, "目安期間の開始から1日前");
  assert.equal(dto.comparison.day.offsetDays, 3); assert.equal(dto.assessment.code, "early");
  snapshot.basis.thermalProjection.historical.count = 29;
  dto = pureDescribe(row(), "a"); assert.equal(dto.comparison.thermal.available, false); assert.equal(dto.comparison.day.available, true);
  snapshot.basis.thermalProjection.historical.count = 30;
  state.data().meta.weatherLocation.latitude = 38;
  assert.equal(pureDescribe(row(), "a").comparison.thermal.available, false);
});
test("integrated renderer escapes shared observations and preserves unverified legacy totals", () => {
  const work = reflectionWork();
  work.harvestReview.yieldKg = "0";
  work.harvestSnapshots = [{ fieldId: "a", harvestDate: work.date, thermal: { total: "820.5" } }];
  const before = JSON.stringify([work, state.data(), [...memory]]);
  const html = annual.renderHarvestReflection(work, { fieldId: "a", name: "<script>field</script>" });
  assert.match(html, /821<small> ℃/); assert.match(html, /旧保存値（未検証・比較根拠には使用しません）/);
  assert.match(html, /対象圃場合計（圃場別には配分しません）/);
  assert.match(html, /共通の観察/); assert.match(html, /0<small> kg/);
  assert(!html.includes("<script>")); assert.match(html, /&lt;script&gt;/);
  assert.match(html, /比較できません/); assert.match(html, /データ上の参考比較/);
  assert.equal(JSON.stringify([work, state.data(), [...memory]]), before);
});
test("integrated renderer separates operator early assessment from validated after-range reference", () => {
  const work = row(), before = JSON.stringify([state.data(), [...memory]]);
  const html = annual.renderHarvestReflection(work, state.field("a"));
  assert.match(html, /早かった/); assert.match(html, /目安期間の終了から3日後/);
  assert.match(html, /現場での適期判断とは別の比較/); assert(!html.includes("刈り遅れ"));
  assert.match(html, /比較できません/);
  assert.equal(describe(work, "a").year, "2025");
  assert.equal(JSON.stringify([state.data(), [...memory]]), before);
});
console.log(`Harvest review: ${passed} passed, ${failed} failed (UI source/VM checks; no browser verification).`);
process.exitCode = failed ? 1 : 0;
