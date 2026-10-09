"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k, v) { if (fail) throw Error("fail"); memory.set(k, String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state", "agro"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const { state, schema, utils: U } = context.RiceOS;
U.today = () => "2026-10-04";
const json = value => JSON.stringify(value);
const irrigation = id => state.data().irrigations.find(row => row.irrigationId === id);
const dry = () => state.data().dryPeriods[0];
const work = () => state.data().fieldWorks.find(row => row.workId === "h");
function reset(extra = {}) {
  assert(state.replace(schema.normalize({
    fields: ["a", "b"].map(fieldId => ({ fieldId, name: fieldId })),
    irrigations: ["a", "b"].map(fieldId => ({ irrigationId: fieldId, fieldId, date: "2026-08-01", startDate: "2026-08-01", method: "間断灌水", memo: "keep", batchId: "shared", batchFieldIds: ["a", "b"],
      waterMovements: [{ movementId: `m-${fieldId}`, phase: "wait", startDate: "2026-09-01", endDate: "" }] })),
    dryPeriods: [{ dryPeriodId: "d", fieldId: "a", date: "2026-08-01", startDate: "2026-08-01" }], ...extra
  })));
}
function harvest(patch = {}) { return state.saveFieldWork({ workId: "h", date: "2026-09-10", workName: "稲刈り", fieldIds: ["a", "b"], harvestStatusByField: { a: "complete", b: "partial" }, ...work(), ...patch }); }
reset();
const bBefore = json(irrigation("b"));
const originalMovement = json(irrigation("a").waterMovements);
assert(harvest());
assert.equal(irrigation("a").actualEndDate, "2026-09-10");
assert.equal(irrigation("a").waterMovements[0].endDate, "2026-09-10");
assert.equal(irrigation("a").memo, "keep");
assert.equal(irrigation("a").batchId, "shared");
assert.equal(json(irrigation("b")), bBefore);
assert.equal(dry().actualEndDate, "2026-09-10");
assert(state.replace(JSON.parse(json(state.data()))));
assert.equal(irrigation("a").harvestAutoEnd.original.waterMovements[0].endDate, "");
assert(harvest({ date: "2026-09-15" }));
assert.equal(irrigation("a").actualEndDate, "2026-09-15");
assert(harvest({ harvestStatusByField: { a: "partial", b: "partial" } }));
assert.equal(irrigation("a").actualEndDate, "");
assert.equal(json(irrigation("a").waterMovements), originalMovement);
assert.equal(dry().actualEndDate, "");
assert(harvest({ harvestStatusByField: { a: "complete", b: "partial" } }));
assert(state.saveIrrigation({ ...irrigation("a"), memo: "edited memo" }));
assert(irrigation("a").harvestAutoEnd);
const conflictingEndBefore = json([state.data(), [...memory]]);
assert.equal(state.saveIrrigation({ ...irrigation("a"), actualEndDate: "2026-09-08" }), null);
assert.equal(json([state.data(), [...memory]]), conflictingEndBefore);
assert(state.saveIrrigation({ ...irrigation("a"), actualEndDate: "2026-09-08",
  waterMovements: irrigation("a").waterMovements.map(row => ({ ...row, endDate: "2026-09-08" })) }));
assert(!irrigation("a").harvestAutoEnd);
assert(state.deleteFieldWork("h"));
assert.equal(irrigation("a").actualEndDate, "2026-09-08");
assert.equal(irrigation("a").memo, "edited memo");
reset(); assert(harvest());
assert(state.saveIrrigation({ ...irrigation("a"), harvestEndOverride: true }));
assert(state.deleteFieldWork("h")); assert.equal(irrigation("a").actualEndDate, "2026-09-10");
reset(); assert(harvest()); const before = json([state.data(), [...memory]]);
fail = true; assert.equal(state.deleteFieldWork("h"), null); fail = false;
assert.equal(json([state.data(), [...memory]]), before);
assert(state.deleteFieldWork("h")); assert.equal(irrigation("a").actualEndDate, "");
reset(); assert(harvest());
assert(state.saveFieldWork({ workId: "second", date: "2026-09-20", workName: "稲刈り", fieldIds: ["a"], harvestStatusByField: { a: "complete" } }));
assert.equal(irrigation("a").actualEndDate, "2026-09-10");
assert(state.deleteFieldWork("h")); assert.equal(irrigation("a").actualEndDate, "2026-09-20");
reset(); assert(harvest({ date: "2026-10-05" })); assert.equal(irrigation("a").actualEndDate, "");
reset(); assert(harvest({ date: "2025-09-10" })); assert.equal(irrigation("a").actualEndDate, "");
reset(); assert(harvest({ harvestStatusByField: undefined })); assert.equal(irrigation("a").actualEndDate, "");
reset({ irrigations: [{ irrigationId: "a", fieldId: "a", startDate: "2026-08-01", actualEndDate: "2026-09-20", method: "深水管理" }] });
assert(harvest()); assert.equal(irrigation("a").actualEndDate, "2026-09-20"); assert(!irrigation("a").harvestAutoEnd);
reset({ irrigations: [{ irrigationId: "a", fieldId: "a", date: "2026-08-01", plannedStartDate: "2026-08-01", status: "予定中", method: "間断灌水" }] });
assert(harvest()); assert.equal(irrigation("a").actualEndDate, "");
reset({ irrigations: [{ irrigationId: "a", fieldId: "a", startDate: "2026-08-01", method: "間断灌水", waterMovements: [{ phase: "flood", startDate: "2026-09-20" }] }] });
assert(harvest()); assert.equal(irrigation("a").actualEndDate, ""); assert.equal(irrigation("a").waterMovements.length, 1);
assert.equal(irrigation("a").harvestAutoEnd.blocked, true);
assert(state.replace(JSON.parse(json(state.data()))));
assert.equal(irrigation("a").harvestAutoEnd.blocked, true);
assert(state.deleteFieldWork("h")); assert(!irrigation("a").harvestAutoEnd);
reset({ fieldWorks: [{ workId: "legacy", workName: "間断灌水開始", date: "2026-08-01", fieldIds: ["a", "b"], memo: "legacy keep" }] });
assert(harvest());
let legacy = state.data().fieldWorks.find(row => row.workId === "legacy");
assert.equal(legacy.harvestWaterClosures.a.date, "2026-09-10"); assert(!legacy.harvestWaterClosures.b);
const periods = id => state.resolvedWaterPeriodsFor(id, { year: "2026", includePlanned: true });
assert.equal(periods("a").find(row => row.source === "legacy-work").actualEndDate, "2026-09-10");
assert.equal(periods("b").find(row => row.source === "legacy-work").actualEndDate, "");
assert.equal(legacy.memo, "legacy keep"); assert.deepEqual(Array.from(legacy.fieldIds), ["a", "b"]);
assert(state.deleteFieldWork("h")); assert.equal(periods("a").find(row => row.source === "legacy-work").actualEndDate, "");
reset(); assert(harvest());
assert(state.saveIrrigation({ ...irrigation("a"), fieldId: "b" }));
assert.equal(irrigation("a").actualEndDate, ""); assert(!irrigation("a").harvestAutoEnd);
reset(); assert(harvest());
const conflictingStartBefore = json([state.data(), [...memory]]);
assert.equal(state.saveIrrigation({ ...irrigation("a"), startDate: "2026-09-20", date: "2026-09-20" }), null);
assert.equal(json([state.data(), [...memory]]), conflictingStartBefore);
reset({ irrigations: [{ irrigationId: "a", fieldId: "a", date: "2026-08-01", startDate: "2026-08-01", method: "間断灌水" }] });
assert(harvest());
assert(state.saveIrrigation({ ...irrigation("a"), startDate: "2026-09-20", date: "2026-09-20", actualEndDate: "", harvestEndOverride: true }));
assert.equal(irrigation("a").actualEndDate, "");
reset({ fieldWorks: [
  { workId: "legacy", workName: "間断灌水開始", date: "2026-08-01", fieldIds: ["a", "b"] },
  { workId: "end", workName: "間断灌水終了", date: "2026-09-25", fieldIds: ["a"] }
] });
assert(harvest()); assert.equal(periods("a").find(row => row.source === "legacy-work").actualEndDate, "2026-09-25");
reset({ fieldWorks: [
  { workId: "explicit-start", workName: "間断灌水開始", date: "2026-08-01", fieldIds: ["a", "b"] },
  { workId: "bare", workName: "間断灌水", date: "2026-08-02", fieldIds: ["a", "b"] },
  { workId: "explicit-end", workName: "間断灌水終了", date: "2026-08-03", fieldIds: ["a", "b"] }
] });
assert(harvest());
assert.equal(periods("a").find(row => row.sourceWorkIds.includes("explicit-start")).actualEndDate, "2026-09-10");
assert.equal(periods("b").find(row => row.sourceWorkIds.includes("explicit-start")).actualEndDate, "");
assert.equal(state.data().fieldWorks.find(row => row.workId === "bare").harvestWaterClosures, undefined);
assert(state.deleteFieldWork("h"));
assert.equal(periods("a").find(row => row.sourceWorkIds.includes("explicit-start")).actualEndDate, "");
// Existing records are reconciled in memory at boot, without a startup write.
const bootFixture = schema.normalize({ fields: [{ fieldId: "a", name: "A" }],
  fieldWorks: [{ workId: "boot-h", date: "2026-09-10", workName: "稲刈り", fieldIds: ["a"], harvestStatusByField: { a: "complete" } }],
  irrigations: [{ irrigationId: "boot-i", fieldId: "a", startDate: "2026-08-01", method: "間断灌水" }]
});
const bootBefore = json(bootFixture);
let bootWrites = 0;
const boot = vm.createContext({ console, window: null }); boot.window = boot;
boot.RiceOS = { utils: U, schema, storage: {
  loadData: () => JSON.parse(bootBefore),
  saveData: next => { bootWrites++; return schema.normalize(next); }
} };
boot.dispatchEvent = () => {}; boot.CustomEvent = class {}; boot.alert = () => {};
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core/state.js"), "utf8"), boot);
assert.equal(bootWrites, 0); assert.equal(json(bootFixture), bootBefore);
assert.equal(boot.RiceOS.state.data().irrigations[0].actualEndDate, "2026-09-10");
assert.equal(boot.RiceOS.state.resolvedWaterPeriodsFor("a", { year: "2026", throughDate: "2026-09-01" })[0].actualEndDate, "");
assert(boot.RiceOS.state.saveIrrigation({ ...boot.RiceOS.state.data().irrigations[0], memo: "next save" }));
assert.equal(bootWrites, 1); assert(boot.RiceOS.state.data().irrigations[0].harvestAutoEnd);
console.log("PASS harvest water closure: per-field group, raw/movements, manual override, correction/delete, roundtrip, failure, future/year/planned/legacy guards");
