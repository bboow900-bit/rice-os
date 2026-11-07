"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
let rows = [], stageById = {}, harvestById = {};
const data = { meta: { activeCropYear: 2027 } };
const baseline = JSON.stringify(data);
const R = {
  state: {
    activeFields: () => rows,
    harvestStatusForField: (id, year, date) => { assert.equal(year, "2026"); assert.equal(date, "2026-10-20"); return harvestById[id] || { status: "none" }; }
  },
  agro: { seasonStageForField: f => stageById[f.fieldId] || {} }
};
vm.runInNewContext(fs.readFileSync("assets/js/ui/season-theme.js", "utf8"), {
  window: { RiceOS: R, addEventListener() {} }, document: { addEventListener() {} }
});
const result = () => R.seasonTheme.resolve("2026-10-20");
assert.equal(result().key, "neutral");
rows = [{ fieldId: "g" }, { fieldId: "h" }, { fieldId: "r" }];
const stage = key => ({ fieldStage: { current: { key } } });
stageById = { g: stage("earlyTillering"), h: stage("heading"), r: stage("ripening") };
assert.equal(result().key, "ripening");
assert.equal(result().fieldId, "r");
harvestById.g = { status: "partial" };
assert.equal(result().key, "ripening");
harvestById.g = { status: "complete" };
assert.equal(result().key, "harvested");
rows[0].status = "休耕";
assert.equal(result().key, "ripening");
delete harvestById.g;
rows[0].status = "作付中";
stageById = { g: stage("panicleInitiation"), h: { current: { key: "maturity" } } };
assert.equal(result().key, "heading", "Calendar estimate must not outrank recorded stage");
assert.equal(JSON.stringify(data), baseline);
console.log("PASS seasonal theme priorities, no persistence, input-year independence");
