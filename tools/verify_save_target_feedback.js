"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = name => fs.readFileSync(path.join(root, "assets/js/core", `${name}.js`), "utf8");
const current = source("state");
// Compare the new notifications against identical save paths with only the old message arguments.
const baseline = current
  .replace('saveTargetsFeedback(message || `生育ログを${rows.length}件保存しました`, rows, "growthLogs", "logId")', 'message || `生育ログを${rows.length}件保存しました`')
  .replace('saveTargetsFeedback(message || `中干し記録を${rows.length}件保存しました`, rows, "dryPeriods", "dryPeriodId")', 'message || `中干し記録を${rows.length}件保存しました`')
  .replace('saveTargetsFeedback(message || `水管理を${rows.length}件保存しました`, rows, "irrigations", "irrigationId")', 'message || `水管理を${rows.length}件保存しました`');
assert.notEqual(baseline, current);

function fixture(stateSource) {
  const memory = new Map(), events = [];
  let fail = false, sequence = 0;
  const context = vm.createContext({ console, alert() {}, navigator: {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: event => events.push(event.detail),
    localStorage: { getItem: key => memory.get(key) || null,
      setItem(key, value) { if (fail) throw Error("QA write failure"); memory.set(key, String(value)); },
      removeItem: key => memory.delete(key) }
  });
  context.window = context;
  vm.runInContext(source("utils"), context);
  const U = context.RiceOS.utils;
  U.today = () => "2026-07-20";
  U.now = () => "2026-07-20T03:00:00.000Z";
  U.id = prefix => `${prefix}-${++sequence}`;
  for (const name of ["schema", "storage"]) vm.runInContext(source(name), context);
  vm.runInContext(stateSource, context);
  const S = context.RiceOS.state;
  assert(S.replace(context.RiceOS.schema.normalize({
    varieties: [{ varietyId: "v", name: "Rice" }],
    fields: ["a", "b", "c"].map(fieldId => ({ fieldId, name: `圃場${fieldId.toUpperCase()}`, varietyId: "v", fieldGroupId: "g" })),
    fieldGroups: [{ fieldGroupId: "g", name: "東グループ" }],
    otherWorks: [{ workId: "old", date: "2025-01-01", workName: "旧メモ", memo: "preserved" }]
  })));
  events.length = 0;
  return { S, memory, events, fail: value => { fail = value; }, saved: () => events.filter(e => e.status === "saved").at(-1)?.message };
}

function scenario(f) {
  const { S } = f;
  assert(S.saveFieldWork({ workId: "w", date: "2026-07-01", workName: "草刈り", fieldIds: ["a", "b", "b"] }));
  return JSON.stringify(S.data());
}
const a = fixture(current), b = fixture(baseline);
assert.equal(scenario(a), scenario(b), "Notification-only changes must not alter normalized data or metadata");
assert.equal(a.saved(), "圃場Aほか・計2圃場に草刈りを残しました。圃場カードの季節ステージを更新しました。");
assert.equal((a.saved().match(/圃場A/g) || []).length, 1, "Work target appears only once");
const run = (method, record, message) => {
  assert(a.S[method](record, message));
  assert(b.S[method](record, message));
  assert.equal(JSON.stringify(a.S.data()), JSON.stringify(b.S.data()), `${method}: records/snapshots/routes remain identical`);
  return a.saved();
};
assert.equal(run("saveFieldWork", { workId: "w", memo: "memo-only edit" }), "圃場Aほか・計2圃場に草刈りを残しました。圃場カードの季節ステージを更新しました。");
assert.equal(run("saveFieldWork", { workId: "off", date: "2026-07-01", workName: "清掃", targetScope: "offField", fieldIds: [] }), "作業を保存しました。");
assert.equal(run("saveFieldWork", { workId: "off", memo: "off-field edit" }), "作業を保存しました。");
assert.equal(run("saveFieldWork", { workId: "single", date: "2026-07-01", workName: "見回り", fieldIds: ["c"] }), "圃場Cに見回りを残しました。圃場カードの季節ステージを更新しました。");

assert.match(run("saveGrowthLog", { logId: "g-a", fieldId: "a", date: "2026-07-01", memo: "one" }), /対象：圃場A/);
assert.match(run("saveGrowthLog", { logId: "g-a", memo: "edit" }), /対象：圃場A/);
const growthMessage = run("saveGrowthLogsBatch", [
  { logId: "g-a", memo: "batch edit" },
  { logId: "g-b", fieldId: "b", date: "2026-07-01" },
  { logId: "g-a2", fieldId: "a", date: "2026-07-02" }
], "東グループへ生育を登録しました");
assert.match(growthMessage, /^東グループへ生育を登録しました/);
assert.match(growthMessage, /計2圃場/, "Count actual distinct targets, not three records or the full three-field group");

assert.match(run("saveDryPeriod", { dryPeriodId: "d-a", fieldId: "a", date: "2026-06-01", startDate: "2026-06-01" }), /対象：圃場A/);
assert.match(run("saveDryPeriod", { dryPeriodId: "d-a", memo: "memo-only" }), /対象：圃場A/);
assert.match(run("saveDryPeriodsBatch", [
  { dryPeriodId: "d-a", memo: "group edit" },
  { dryPeriodId: "d-b", fieldId: "b", date: "2026-06-01", startDate: "2026-06-01" }
], "東グループの中干しを開始しました"), /計2圃場/);

assert.match(run("saveIrrigation", { irrigationId: "i-a", fieldId: "a", date: "2026-07-01", startDate: "2026-07-01", method: "間断灌水" }), /対象：圃場A/);
assert.match(run("saveIrrigation", { irrigationId: "i-a", memo: "memo-only" }), /対象：圃場A/);
assert.match(run("saveIrrigationsBatch", [
  { irrigationId: "i-a", memo: "group edit" },
  { irrigationId: "i-b", fieldId: "b", date: "2026-07-01", startDate: "2026-07-01", method: "間断灌水" }
], "東グループの水管理を終了しました"), /計2圃場/);
assert.match(run("saveFieldWork", {
  workId: "harvest", date: "2026-07-10", workName: "稲刈り", fieldIds: ["a", "b"],
  harvestStatusByField: { a: "complete", b: "partial" }
}), /計2圃場/, "Harvest snapshots and water closure effects also remain identical to the original save path");

for (const [method, record] of [
  ["saveFieldWork", { workId: "w", memo: "failed" }],
  ["saveGrowthLog", { logId: "g-a", memo: "failed" }],
  ["saveDryPeriod", { dryPeriodId: "d-a", memo: "failed" }],
  ["saveIrrigation", { irrigationId: "i-a", memo: "failed" }]
]) {
  const before = JSON.stringify([a.S.data(), [...a.memory]]), savedCount = a.events.filter(e => e.status === "saved").length;
  a.fail(true); assert.equal(a.S[method](record), null); a.fail(false);
  assert.equal(JSON.stringify([a.S.data(), [...a.memory]]), before);
  assert.equal(a.events.filter(e => e.status === "saved").length, savedCount, "Failed writes never announce success");
}
console.log("PASS save target feedback: single, actual unique batch count, group wording, omitted edit targets, off-field, identical persisted data and failed-write protection");
