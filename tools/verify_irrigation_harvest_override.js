"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { value: "", hidden: false, listeners: {}, classList: { add() {}, remove() {} },
    scrollIntoView() {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    insertAdjacentHTML() { node("waterManualEndConfirm").hidden = true; }
  });
  return nodes.get(id);
}
const data = { irrigations: [], dryPeriods: [] };
let saved;
function save(record) { saved = record; return data; }
const RiceOS = { utils: { today: () => "2026-10-04", $: id => id === "waterManualEndConfirm" ? nodes.get(id) : node(id) },
  state: { data: () => data, saveIrrigation: save, saveDryPeriod: save } };
const context = vm.createContext({ window: { RiceOS }, document: { querySelector: () => node("reset") }, alert() {}, console });
let source = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/irrigation.js"), "utf8");
// Run the real editor/event handlers; unrelated dashboard rendering is isolated.
source = source.replace("RiceOS.screens.irrigation = {", "render = () => {}; RiceOS.screens.irrigation = { resetEdit, fillEdit,");
vm.runInContext(source, context);
const screen = RiceOS.screens.irrigation;
screen.bind();
function fixture(type = "irrigation", blocked = false) {
  const record = { fieldId: "a", startDate: "2026-08-01", date: "2026-08-01", actualEndDate: blocked ? "" : "2026-09-10", memo: "old", waterMovements: [],
    harvestAutoEnd: { date: "2026-09-10", blocked } };
  if (type === "dry") { record.dryPeriodId = "d"; data.dryPeriods = [record]; }
  else { record.irrigationId = "i"; data.irrigations = [record]; }
  screen.fillEdit(type, type === "dry" ? "d" : "i");
  saved = undefined;
}
function submit(submitter) { node("waterEditForm").listeners.submit({ preventDefault() {}, submitter }); }
fixture(); node("waterEditMemo").value = "new memo"; submit();
assert.equal(saved.memo, "new memo"); assert(!saved.harvestEndOverride);
fixture(); submit(node("waterManualEndConfirm"));
assert.equal(saved.actualEndDate, "2026-09-10"); assert.equal(saved.harvestEndOverride, true);
fixture(); node("waterEditEnd").listeners.change(); submit();
assert.equal(saved.harvestEndOverride, true);
fixture(); node("waterEditEnd").listeners.input(); screen.resetEdit(); fixture(); submit();
assert(!saved.harvestEndOverride);
fixture("dry"); node("waterEditEnd").listeners.change(); submit(); assert.equal(saved.harvestEndOverride, true);
fixture("irrigation", true); assert.equal(node("waterManualEndConfirm").hidden, true); submit(); assert(!saved.harvestEndOverride);
fixture(); node("waterEditEnd").value = ""; node("waterEditEnd").listeners.input(); submit(); assert(!saved.harvestEndOverride);
assert(source.includes("harvestEndOverride: true, status:"));
assert(source.includes("収穫後の入落水記録があります。日付を要確認"));
console.log("PASS irrigation harvest override: memo ownership, same-date explicit submit/change, reset/cancel, dry, blocked and blank guards");
