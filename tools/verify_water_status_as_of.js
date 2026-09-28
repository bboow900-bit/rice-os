"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Isolate the date selection from storage, schema normalization and real data.
const field = { fieldId: "water-history" };
let periods = [];
const context = vm.createContext({ RiceOS: { state: {
  resolvedWaterPeriodsFor(id, options) {
    assert.equal(id, field.fieldId);
    assert.equal(options.throughDate, queryDate);
    return periods;
  }
} } });
context.window = context;
for (const file of ["utils", "agro"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "assets", "js", "core", `${file}.js`), "utf8"), context);
}
const today = "2026-09-17";
context.RiceOS.utils.today = () => today;
let queryDate;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
const movement = (phase, startDate, endDate = "", extra = {}) => ({ phase, startDate, endDate, ...extra });
function setup(kind, movements, extra = {}) {
  periods = [{ kind, label: kind === "saturated" ? "飽水管理" : "間断灌水", startDate: "2026-01-01",
    actualEndDate: "", raw: { waterMovements: movements }, ...extra }];
}
function status(date) {
  queryDate = date || today;
  const before = JSON.stringify(periods);
  const result = context.RiceOS.agro.managementStatus(field, date);
  assert.equal(JSON.stringify(periods), before, "status must not mutate source movements");
  return result;
}

for (const [kind, parent, labels] of [
  ["intermittent", "間断灌水中", ["間断灌水・入水中", "間断灌水・落水中", "間断灌水・入水待ち"]],
  ["saturated", "飽水管理中", ["飽水管理・給水中", "飽水管理・自然落水中", "飽水管理・給水待ち"]]
]) {
  test(`${kind}: closed flood/drain/wait intervals include both boundaries`, () => {
    setup(kind, [movement("wait", "2026-07-07", "2026-07-09"),
      movement("flood", "2026-07-01", "2026-07-03"),
      movement("flood", "2026-08-01"), movement("drain", "2026-07-04", "2026-07-06")]);
    for (let day = 1; day <= 9; day++) {
      const result = status(`2026-07-0${day}`);
      const phase = Math.floor((day - 1) / 3);
      assert.equal(result.label, labels[phase]);
      assert.equal(result.date, `2026-07-0${phase * 3 + 1}`);
      assert.equal(result.detail, phase === 2 ? `${day - 6}日目。水が切れた後の待機を記録中` : "");
    }
  });
  test(`${kind}: before movements and gaps show only the parent method`, () => {
    for (const date of ["2026-06-30", "2026-07-10", "2026-07-31"]) {
      const result = status(date);
      assert.equal(result.label, parent);
      assert.equal(result.date, "2026-01-01");
      assert.equal(result.detail, "");
    }
  });
  test(`${kind}: same-day transition prefers the later start`, () => {
    setup(kind, [movement("drain", "2026-07-03", "2026-07-05"),
      movement("flood", "2026-07-01", "2026-07-03")]);
    assert.equal(status("2026-07-02").label, labels[0]);
    assert.equal(status("2026-07-03").label, labels[1]);
    assert.equal(status("2026-07-05").label, labels[1]);
    assert.equal(status("2026-07-06").label, parent);
  });
  test(`${kind}: equal starts use timeline creation order`, () => {
    setup(kind, [movement("wait", "2026-07-03", "", { createdAt: "2026-07-03T12:00:00" }),
      movement("drain", "2026-07-03", "2026-07-03", { createdAt: "2026-07-03T08:00:00" })]);
    assert.equal(status("2026-07-03").label, labels[2]);
    assert.match(status("2026-07-03").detail, /^1日目/);
  });
  test(`${kind}: invalid dates and future movements cannot supply a phase`, () => {
    const invalid = [null, movement("wait", ""), movement("wait", "bad"),
      movement("wait", "2026-02-30"), movement("wait", "2026-13-01"),
      movement("wait", "2026-7-01"), movement("wait", "2026-07-01", "bad"),
      movement("wait", "2026-07-01", "2026-07-32"),
      movement("wait", "2026-07-01", "2026-06-30"),
      movement("wait", "2026-08-01"), movement("wait", "2026-08-02", "2026-08-03")];
    setup(kind, invalid);
    assert.equal(status("2026-07-15").label, parent);
    setup(kind, [...invalid, movement("drain", "2026-07-10", "2026-07-20")]);
    assert.equal(status("2026-07-15").label, labels[1]);
    for (const date of ["bad", "2026-07-32"]) {
      assert.ok(!labels.includes(status(date).label));
    }
  });
  test(`${kind}: current-date default ignores a future open movement`, () => {
    setup(kind, [movement("wait", "2026-09-15"), movement("flood", "2026-09-18")]);
    const result = status();
    assert.equal(result.label, labels[2]);
    assert.equal(result.date, "2026-09-15");
    assert.match(result.detail, /^3日目/);
    assert.equal(JSON.stringify(result), JSON.stringify(status(today)));
  });
}

test("parent planned/completed/overlap decisions remain authoritative", () => {
  setup("intermittent", [movement("flood", "2026-07-01")], { planned: true });
  assert.equal(status("2026-07-03").key, "waterWaiting");
  setup("intermittent", [movement("flood", "2026-07-01")], { actualEndDate: "2026-07-03" });
  assert.equal(status("2026-07-02").key, "intermittent");
  assert.equal(status("2026-07-03").key, "intermittentCompleted");
  setup("intermittent", []);
  periods.push({ ...periods[0], kind: "saturated", label: "飽水管理" });
  assert.equal(status("2026-07-03").key, "overlap");
});
console.log(`${passed} historical water-state checks passed (isolated VM; no UI or storage changes)`);
