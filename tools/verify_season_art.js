"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../assets/js/ui/season-art.js"), "utf8");
let storageCalls = 0;
class NoClockDate extends Date {
  constructor(...args) { assert(args.length, "Season art must not read the current time"); super(...args); }
  static now() { throw Error("Current time must not be used"); }
}
const fixture = { fields: [{ fieldId: "a", stage: "heading" }], schedules: [], meta: { activeCropYear: 2099 } };
const before = JSON.stringify(fixture);
const context = vm.createContext({ window: { RiceOS: { state: { data: () => { throw Error("No farm data reads"); } } } }, Date: NoClockDate,
  localStorage: { getItem() { storageCalls++; throw Error("No storage reads"); }, setItem() { storageCalls++; throw Error("No storage writes"); } } });
vm.runInContext(source, context);
const art = context.window.RiceOS.seasonArt;
const expected = ["winter", "winter", "winter", "sowing", "transplanting", "transplanting", "growing", "growing", "harvesting", "harvesting", "processing", "winter"];
assert.equal(art.phases.length, 6);
const configured = art.phases.flatMap(p => p.months);
assert.equal(new Set(configured).size, 12); assert.equal(configured.length, 12);
for (const year of [1900, 2000, 2024, 2026, 2100, 2199]) {
  for (let month = 1; month <= 12; month++) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const day of [1, days]) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const result = art.forDate(date);
      assert.equal(result.key, expected[month - 1], date);
      assert.equal(result.src, art.phases.find(p => p.key === result.key).src);
      assert.equal(typeof result.label, "string");
    }
  }
}
assert.equal(art.forDate("2024-02-29").key, "winter");
for (const invalid of [undefined, null, "", "2026-02-29", "2026-04-31", "2026-07-32", "2026-00-01", "2026-13-01", "2026-5-01", "2026-05-1", " 2026-05-01", "2026-05-01 ", "2026-05-01T00:00:00Z", "0000-05-01", 20260501, {}, new Date()]) {
  assert.equal(art.forDate(invalid).key, "winter");
}
const value = art.forDate("2026-05-01"); value.key = "changed"; value.src = "changed";
assert.equal(art.forDate("2026-05-01").src, "assets/images/ui-pop/rice-transplanter.png");
assert.equal(art.forDate("2026-10-31").src, "assets/images/ui-pop/rice-combine.png");
assert.equal(storageCalls, 0); assert.equal(JSON.stringify(fixture), before);
assert(Object.isFrozen(art.phases)); assert(Object.isFrozen(art.phases[0].months));

// Exercise the real header across rerenders without replacing any dashboard logic.
const homeSource = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/home.js"), "utf8");
assert(!homeSource.includes("paddy-day.png"));
let today = "2026-04-30";
const R = context.window.RiceOS;
R.utils = { today: () => today, fd: d => d, attr: String, escapeHTML: String };
vm.runInContext(homeSource.replace("RiceOS.screens.home = { render, bind };", "RiceOS.screens.home = { render, bind, renderHeader };"), context);
let html = R.screens.home.renderHeader();
assert(html.includes('data-season-art="sowing"')); assert(html.includes('alt=""')); assert(html.includes('aria-hidden="true"'));
today = "2026-05-01"; html = R.screens.home.renderHeader();
assert(html.includes('data-season-art="transplanting"')); assert(html.includes("rice-transplanter.png"));
assert(html.includes("今日の田んぼ")); assert(html.includes(today)); assert.equal(storageCalls, 0);
console.log("season art PASS: months, boundaries, leap dates, invalid fallback, pure header rerender");
