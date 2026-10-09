"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map(); let fail = false;
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("fail"); memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), context);
const { state, schema, utils: U, storage } = context.RiceOS;
U.today = () => "2026-10-06"; let tick = 0; U.now = () => `time-${tick++}`;
const json = value => JSON.stringify(value);
const work = () => state.data().fieldWorks.find(row => row.workId === "h");
assert(state.replace(schema.normalize({ fields: ["a", "b"].map(fieldId => ({ fieldId, varietyId: "v" })), varieties: [{ varietyId: "v", name: "Original variety" }],
  fieldWorks: [{ workId: "old", date: "2026-09-10", workName: "稲刈り", fieldIds: [] }],
  varietyResults: [{ resultId: "r", yield: "100" }], dryPeriods: [{ dryPeriodId: "d", fieldId: "a", date: "2026-07-01", startDate: "2026-07-01", actualEndDate: "2026-07-10" }] })));
assert(!Object.hasOwn(state.data().fieldWorks[0], "harvestTimingByField"));
const old = json(state.data().fieldWorks[0]);
const other = json([state.data().dryPeriods, state.data().varietyResults]);
const save = patch => state.saveFieldWork({ workId: "h", date: "2026-09-10", workName: "稲刈り", fieldIds: ["a", "b"],
  harvestStatusByField: { a: "complete", b: "partial" }, ...work(), ...patch });
assert(save({})); assert(!Object.hasOwn(work(), "harvestTimingByField") || work().harvestTimingByField === undefined);
const snapshots = json(work().harvestSnapshots);
assert(save({ harvestTimingByField: {
  a: { assessment: "early", idealStartDate: "2026-09-11", idealEndDate: "2026-09-15", moisturePct: 0, moistureDate: "2026-09-10", yellowing: "green", memo: "A" },
  b: { assessment: "late", idealStartDate: "2026-09-01", idealEndDate: "2026-09-09", delayReason: "rain", memo: "B" }
} }));
assert.equal(work().harvestTimingByField.a.moisturePct, "0");
assert.equal(work().harvestTimingByField.a.varietyId, "v");
assert.equal(work().harvestTimingByField.a.varietyName, "Original variety");
assert.equal(work().harvestTimingByField.a.varietySource, "assessment-current-master");
assert.equal(work().harvestTimingByField.a.season, "2026");
const aTime = work().harvestTimingByField.a.evaluatedAt; const b = json(work().harvestTimingByField.b);
assert(save({ harvestTimingByField: { a: { memo: "A changed" } } }));
assert.notEqual(work().harvestTimingByField.a.evaluatedAt, aTime); assert.equal(json(work().harvestTimingByField.b), b);
const changed = work().harvestTimingByField.a.evaluatedAt;
assert(save({ harvestTimingByField: { a: { memo: "A changed", evaluatedAt: "fake" } } }));
assert.equal(work().harvestTimingByField.a.evaluatedAt, changed);
assert(save({ harvestTimingByField: { a: { assessment: "", idealStartDate: "", idealEndDate: "", moisturePct: "", moistureDate: "", yellowing: "", memo: "" } } }));
assert.equal(work().harvestTimingByField.a.moisturePct, ""); assert.equal(work().harvestTimingByField.a.assessment, "");
assert.equal(json(work().harvestSnapshots), snapshots);
const rejected = patch => { const before = json([state.data(), [...memory]]); assert.equal(save(patch), null); assert.equal(json([state.data(), [...memory]]), before); };
for (const value of [{ assessment: "bad" }, { yellowing: "yellow" }, { delayReason: "weather" },
  { idealStartDate: "2026-02-30" }, { moistureDate: "2026/09/10" }, { moisturePct: -1 }, { moisturePct: 101 }, { moisturePct: "NaN" },
  { assessment: "early", idealStartDate: "2026-09-10" }, { assessment: "late", idealEndDate: "2026-09-10" },
  { assessment: "early", idealStartDate: "", idealEndDate: "2026-09-09" },
  { assessment: "late", idealStartDate: "2026-09-11", idealEndDate: "" },
  { assessment: "appropriate", idealStartDate: "2026-09-11" }, { idealStartDate: "2026-09-12", idealEndDate: "2026-09-11" }]) rejected({ harvestTimingByField: { a: value } });
rejected({ harvestTimingByField: { missing: { assessment: "pending" } } });
rejected({ harvestTimingByField: { a: null } });
rejected({ targetScope: "offField", harvestTimingByField: { a: { assessment: "pending" } } });
rejected({ workName: "草刈り", harvestTimingByField: { a: { assessment: "pending" } } });
assert(save({ harvestTimingByField: { a: { assessment: "appropriate", idealStartDate: "2026-09-10", idealEndDate: "2026-09-10", moisturePct: "100" } } }));
assert.equal(json(storage.loadData().fieldWorks.find(row => row.workId === "h").harvestTimingByField), json(work().harvestTimingByField));
assert(state.replace(JSON.parse(json(state.data()))));
assert.equal(work().harvestTimingByField.a.varietySource, "assessment-current-master");
assert(save({ harvestTimingByField: { a: { assessment: "early", idealStartDate: "", idealEndDate: "2026-09-11" } } }));
assert(save({ harvestTimingByField: { a: { assessment: "late", idealStartDate: "2026-09-09", idealEndDate: "" } } }));
const bBeforeClear = json(work().harvestTimingByField.b);
const beforeClear = JSON.parse(json(state.data()));
assert(save({ harvestTimingByField: { a: Object.fromEntries(["assessment", "idealStartDate", "idealEndDate", "moisturePct", "moistureDate", "yellowing", "delayReason", "memo"].map(key => [key, ""])) } }));
assert(!work().harvestTimingByField.a);
assert.equal(json(work().harvestTimingByField.b), bBeforeClear);
assert(state.replace(beforeClear));
const renamed = JSON.parse(json(state.data())); renamed.varieties[0].name = "Changed master";
assert(state.replace(renamed)); assert(save({ harvestTimingByField: { a: { memo: "after master change" } } }));
assert.equal(work().harvestTimingByField.a.varietyName, "Original variety");
const beforeFail = json([state.data(), [...memory]]); fail = true;
assert.equal(save({ harvestTimingByField: { a: { memo: "fail" } } }), null); fail = false;
assert.equal(json([state.data(), [...memory]]), beforeFail);
assert(save({ fieldIds: ["a"], harvestStatusByField: { a: "complete" }, harvestTimingByField: { a: { assessment: "pending" } } }));
assert(!work().harvestTimingByField.b);
assert(save({ date: "2027-09-10", harvestTimingByField: { a: { idealStartDate: "", idealEndDate: "" } } }));
assert.equal(work().harvestTimingByField.a.season, "2027");
assert.equal(work().harvestTimingByField.a.varietyName, "Original variety");
const unknownSource = JSON.parse(json(state.data()));
delete unknownSource.fieldWorks.find(row => row.workId === "h").harvestTimingByField.a.varietySource;
assert(state.replace(unknownSource));
assert(save({ harvestTimingByField: { a: { memo: "legacy source remains unknown", varietySource: "spoofed" } } }));
assert(!Object.hasOwn(work().harvestTimingByField.a, "varietySource"));
assert.equal(json(state.data().fieldWorks.find(row => row.workId === "old")), old);
assert.equal(json([state.data().dryPeriods, state.data().varietyResults]), other);
assert(save({ workName: "草刈り", harvestTimingByField: undefined })); assert(!work().harvestTimingByField);
assert(!schema.normalize({ fieldWorks: [{ workId: "x", targetScope: "offField", workName: "稲刈り", harvestTimingByField: { a: { assessment: "late" } } }] }).fieldWorks[0].harvestTimingByField);
console.log("verify_harvest_timing: PASS per-field merge/clear/prune, strict validation, stable timestamps, JSON, isolation, rollback");
