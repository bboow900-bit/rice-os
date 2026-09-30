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
load("assets/js/screens/annual.js", "renderHarvestReview, renderHarvestSnapshot, renderAnnualRecordDetail");
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
console.log(`Harvest review: ${passed} passed, ${failed} failed (UI source/VM checks; no browser verification).`);
process.exitCode = failed ? 1 : 0;
