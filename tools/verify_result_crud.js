"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("fail"); memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const { state, schema, storage, utils: U } = context.RiceOS;
U.today = () => "2026-10-05";
let tick = 0;
U.now = () => `2026-10-05T12:00:${String(tick++).padStart(2, "0")}`;
const json = value => JSON.stringify(value);
const results = () => state.data().varietyResults;
const get = id => results().find(row => row.resultId === id);
const unrelated = () => Object.fromEntries(Object.entries(state.data()).filter(([key]) => !["varietyResults", "meta"].includes(key)));
const snapshot = () => json([state.data(), [...memory]]);
const historical = {
  fields: [{ fieldId: "a", name: "A" }], varieties: [{ varietyId: "v", name: "V" }],
  fieldWorks: [{ workId: "h", date: "2026-09-10", workName: "稲刈り", fieldIds: ["a"], harvestStatusByField: { a: "complete" }, harvestSnapshots: [{ fieldId: "a", harvestDate: "2026-09-10", note: "snapshot" }] }],
  growthLogs: [{ logId: "g", fieldId: "a", date: "2026-08-01", headingObserved: true }],
  irrigations: [{ irrigationId: "i", fieldId: "a", date: "2026-08-01", startDate: "2026-08-01", method: "間断灌水", memo: "water", waterMovements: [{ movementId: "m", startDate: "2026-08-01", phase: "flood" }] }],
  dryPeriods: [{ dryPeriodId: "d", fieldId: "a", date: "2026-07-01", startDate: "2026-07-01", actualEndDate: "2026-07-10" }],
  schedules: [{ scheduleId: "s", date: "2026-07-01", fieldIds: ["a"], title: "草刈り" }],
  shipments: [{ shipmentId: "sh", date: "2026-09-20", recipient: "R", packages: [{ kg: 30, bags: 2 }] }],
  varietyResults: [
    { resultId: "old", season: 2025, varietyId: "v", fieldId: "a", areaA: "10", yield: "500", grade: "1", quality: "keep", reflection: "old", createdAt: "created", updatedAt: "updated" },
    { resultId: "old", season: 2025, yield: "999", reflection: "duplicate" }
  ]
};
assert(state.replace(schema.normalize(historical)));
assert.equal(results().length, 1); assert.equal(get("old").yield, "500");
assert.equal(historical.varietyResults.length, 2);
const otherBefore = json(unrelated());
const original = { ...get("old") };
assert(state.saveResult({ resultId: "old", yield: "600", reflection: "edited", createdAt: "must not replace" }));
assert.equal(results().length, 1); assert.equal(get("old").yield, "600");
for (const key of ["createdAt", "fieldId", "grade", "quality", "season", "varietyId", "areaA"]) assert.equal(get("old")[key], original[key]);
assert.notEqual(get("old").updatedAt, original.updatedAt);
assert(state.saveResult({ resultId: "old", grade: undefined, fieldId: undefined, reflection: "", areaA: 0, yield: "0", salesAmount: 0, shippedQuantity: "0" }));
assert.equal(get("old").reflection, ""); assert.equal(get("old").grade, "1"); assert.equal(get("old").fieldId, "a");
for (const key of ["areaA", "yield", "salesAmount", "shippedQuantity"]) assert.equal(get("old")[key], "0");
assert(state.saveResult({ resultId: "old", fieldId: "", grade: "", quality: null }));
for (const key of ["fieldId", "grade", "quality"]) assert.equal(get("old")[key], "");
assert.equal(json(unrelated()), otherBefore);
assert.equal(json(storage.loadData().varietyResults), json(results()));
assert(state.replace(JSON.parse(json(state.data())))); assert.equal(get("old").yield, "0");
assert(state.saveResult({ resultId: "", varietyId: "v", season: 2026, yield: 0 }));
assert.equal(results().length, 2);
const added = results().find(row => row.resultId !== "old"); assert(added.resultId); assert.equal(added.yield, "0");
assert(state.saveResult({ resultId: "   ", reflection: "new blank ID" })); assert.equal(results().length, 3);
assert(state.saveResult({})); assert.equal(results().length, 4);
for (const action of [() => state.saveResult({ resultId: "unknown", yield: "9" }), () => state.deleteResult("unknown"), () => state.deleteResult(""), () => state.deleteResult(undefined)]) {
  const before = snapshot(); assert.equal(action(), null); assert.equal(snapshot(), before);
}
const beforeFail = snapshot();
fail = true;
assert.equal(state.saveResult({ resultId: "old", yield: "failure" }), null);
assert.equal(state.saveResult({ yield: "new failure" }), null);
assert.equal(state.deleteResult("old"), null);
fail = false; assert.equal(snapshot(), beforeFail);
assert(state.deleteResult("old")); assert(!get("old")); assert.equal(results().length, 3);
const afterDelete = snapshot(); assert.equal(state.saveResult({ resultId: "old", yield: "resurrection" }), null); assert.equal(snapshot(), afterDelete);
assert.equal(json(unrelated()), otherBefore);
assert.equal(json(storage.loadData().varietyResults), json(results()));
console.log("verify_result_crud: PASS stable IDs, partial edits, clear/zero, legacy duplicates, isolation, rollback, unknown rejection, JSON");
