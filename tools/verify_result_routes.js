"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/annual.js"), "utf8");
const route = source.match(/function openHarvestResults\(\) \{[\s\S]*?(?=\n  function openHarvestWork)/)[0];
function run(rows) {
  const controls = { annualYear: { value: "2026" }, rSeason: { value: "" }, rVariety: { value: "" } };
  const calls = [];
  const context = vm.createContext({
    state: { field: () => ({ fieldId: "a", varietyId: "v" }), data: () => ({ varietyResults: rows }) },
    U: { $: id => controls[id] }, reviewYearValue: () => "2026", yearValue: () => "2026",
    selectedFieldId: "a", selectedTab: "karte", reviewView: "overview", compareFromHub: true,
    compareFilter: "work", topView: "fields",
    RiceOS: {
      navigation: { clear: () => calls.push("clear") },
      app: { openInput: (screen, origin) => calls.push([screen, origin]) },
      screens: { results: { editResult: id => { calls.push(["edit", id]); return true; }, resetForm: () => calls.push("new") } }
    }
  });
  vm.runInContext(`${route}\nopenHarvestResults();`, context);
  assert.deepEqual(calls.slice(0, 2), ["clear", ["results", "annual"]]);
  assert.equal(context.selectedFieldId, "a");
  assert.equal(context.selectedTab, "karte");
  assert.equal(context.compareFromHub, true);
  assert.equal(controls.annualYear.value, "2026");
  return { calls, controls };
}
const result = (resultId, fieldId, season = 2026, varietyId = "v") => ({ resultId, fieldId, season, varietyId });
assert.deepEqual(run([result("aggregate", ""), result("other", "b"), result("exact", "a")]).calls[2], ["edit", "exact"]);
assert.deepEqual(run([result("other", "b"), result("aggregate", "")]).calls[2], ["edit", "aggregate"]);
const fresh = run([result("previous", "a", 2025), result("other", "b"), result("variety", "a", 2026, "other")]);
assert.equal(fresh.calls[2], "new");
assert.equal(fresh.controls.rSeason.value, "2026");
assert.equal(fresh.controls.rVariety.value, "v");
assert.deepEqual(run([result("first", "a"), result("second", "a")]).calls[2], ["edit", "first"]);
console.log("PASS annual result route: displayed scope/year/variety, existing edit, new fallback and return context");
