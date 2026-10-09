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
const json = value => JSON.stringify(value);
const snapshot = () => json([state.data(), [...memory]]);
const machine = id => state.data().machines.find(row => row.machineId === id);
const history = id => state.data().maintenanceRecords.find(row => row.maintenanceId === id);
const unrelated = () => json(Object.fromEntries(Object.entries(state.data()).filter(([key]) => !["machines", "maintenanceRecords", "meta"].includes(key))));
assert(state.replace(schema.normalize({ fields: [{ fieldId: "f" }],
  fieldWorks: [{ workId: "h", date: "2026-09-01", workName: "稲刈り", fieldIds: ["f"], harvestStatusByField: { f: "complete" }, harvestSnapshots: [{ fieldId: "f", harvestDate: "2026-09-01" }] }],
  irrigations: [{ irrigationId: "water", fieldId: "f", date: "2026-08-01", startDate: "2026-08-01", method: "間断灌水" }],
  varietyResults: [{ resultId: "r", yield: "100", fieldId: "f" }] })));
const other = unrelated();
const a = state.saveMachine({ name: "A", meterHours: "800" });
const b = state.saveMachine({ name: "B", meterHours: "100" }); assert(a && b);
assert.equal(machine(a).meterBaseline, "800");
const created = machine(a).createdAt;
const h = state.saveMaintenanceRecord({ machineId: a, date: "2026-08-01", item: "oil", meterHours: "8120", memo: "keep" }); assert(h);
const hCreated = history(h).createdAt;
assert.equal(machine(a).meterHours, "8120"); assert.equal(machine(a).meterOrigin, "maintenance");
assert(state.saveMachine({ machineId: a, name: "A renamed", meterHours: "8120", createdAt: "wrong" }));
assert.equal(machine(a).meterBaseline, "800"); assert.equal(machine(a).createdAt, created);
assert(state.saveMachine({ machineId: a, name: "Equivalent meter", meterHours: "8120.0" }));
assert.equal(machine(a).meterBaseline, "800");
assert(state.saveMaintenanceRecord({ maintenanceId: h, meterHours: "812", createdAt: "wrong" }));
assert.equal(machine(a).meterHours, "812"); assert.equal(history(h).createdAt, hCreated); assert.equal(history(h).memo, "keep");
assert.equal(state.data().maintenanceRecords.length, 1);
assert(state.deleteMaintenanceRecord(h)); assert.equal(machine(a).meterHours, "800");
const first = state.saveMaintenanceRecord({ machineId: a, meterHours: "900" });
const second = state.saveMaintenanceRecord({ machineId: a, meterHours: "1000" });
assert.equal(machine(a).meterHours, "1000");
assert(state.saveMaintenanceRecord({ maintenanceId: second, meterHours: "" })); assert.equal(machine(a).meterHours, "900");
assert(state.saveMaintenanceRecord({ maintenanceId: first, machineId: b }));
assert.equal(machine(a).meterHours, "800"); assert.equal(machine(b).meterHours, "900");
assert(state.saveMaintenanceRecord({ maintenanceId: first, meterHours: "0" })); assert.equal(machine(b).meterHours, "100");
assert(state.saveMachine({ machineId: a, meterHours: "1200" }));
assert.equal(machine(a).meterBaseline, "1200");
const typo = state.saveMaintenanceRecord({ machineId: a, meterHours: "8120" });
assert(state.saveMachine({ machineId: a, meterHours: "1300" }));
assert(state.saveMaintenanceRecord({ maintenanceId: typo, meterHours: "812" }));
assert.equal(machine(a).meterHours, "1300");
assert(state.deleteMaintenanceRecord(typo)); assert.equal(machine(a).meterHours, "1300");
assert(state.saveMachine({ machineId: a, meterHours: "1200" }));
assert(state.saveMaintenanceRecord({ maintenanceId: second, meterHours: "812" })); assert.equal(machine(a).meterHours, "1200");
assert(state.deleteMaintenanceRecord(second)); assert.equal(machine(a).meterHours, "1200");
assert(state.saveMachine({ machineId: a, meterHours: "" })); assert.equal(machine(a).meterHours, ""); assert.equal(machine(a).meterBaseline, "");
assert(state.saveMachine({ machineId: a, meterHours: 0 })); assert.equal(machine(a).meterHours, "0");
assert.equal(unrelated(), other);
assert.equal(json(storage.loadData().machines), json(state.data().machines));
assert(state.replace(JSON.parse(json(state.data())))); assert.equal(machine(a).meterBaseline, "0");
for (const value of ["-1", "NaN", "Infinity", Infinity, "bad"]) {
  const before = snapshot();
  assert.equal(state.saveMachine({ machineId: a, meterHours: value }), "");
  assert.equal(state.saveMaintenanceRecord({ maintenanceId: first, meterHours: value }), "");
  assert.equal(snapshot(), before);
}
for (const action of [() => state.saveMachine({ machineId: "missing", name: "missing" }),
  () => state.saveMaintenanceRecord({ maintenanceId: "missing", machineId: a }), () => state.deleteMaintenanceRecord("missing")]) {
  const before = snapshot(); assert(!action()); assert.equal(snapshot(), before);
}
const beforeCancel = snapshot(); const cancelled = { ...machine(a), meterHours: "9999" }; assert(cancelled); assert.equal(snapshot(), beforeCancel);
fail = true;
assert.equal(state.saveMachine({ machineId: a, meterHours: "9999" }), "");
assert.equal(state.saveMaintenanceRecord({ maintenanceId: first, meterHours: "9999" }), "");
assert.equal(state.deleteMaintenanceRecord(first), null);
fail = false; assert.equal(snapshot(), beforeCancel);
assert.equal(unrelated(), other);
// Legacy has no guessed baseline: lowering/deleting a history cannot lower its unknown meter.
assert(state.replace(schema.normalize({ machines: [{ machineId: "legacy", name: "Legacy", meterHours: "8120" }],
  maintenanceRecords: [{ maintenanceId: "old", machineId: "legacy", meterHours: "8120" }] })));
assert.equal(machine("legacy").meterBaseline, undefined);
assert(state.saveMachine({ machineId: "legacy", name: "Name only", meterHours: "8120" })); assert.equal(machine("legacy").meterBaseline, undefined);
assert(state.saveMaintenanceRecord({ maintenanceId: "old", meterHours: "812" })); assert.equal(machine("legacy").meterHours, "8120");
assert(state.deleteMaintenanceRecord("old")); assert.equal(machine("legacy").meterHours, "8120");
assert(state.saveMachine({ machineId: "legacy", meterHours: "800" })); assert.equal(machine("legacy").meterBaseline, "800");
const known = state.saveMaintenanceRecord({ machineId: "legacy", meterHours: "900" }); assert.equal(machine("legacy").meterHours, "900");
assert(state.deleteMaintenanceRecord(known)); assert.equal(machine("legacy").meterHours, "800");
assert(state.saveMachine({ machineId: "legacy", meterHours: "800", meterManualOverride: true })); assert.equal(machine("legacy").meterOrigin, "manual");
assert.equal(state.saveMaintenanceRecord({ maintenanceId: "old", machineId: "legacy", meterHours: "900" }), "");
const legacyInvalid = schema.normalize({ machines: [{ machineId: "invalid", name: "Old", meterHours: "unknown" }], maintenanceRecords: [{ maintenanceId: "bad", machineId: "invalid", meterHours: "bad" }] });
assert(state.replace(legacyInvalid));
assert(state.saveMaintenanceRecord({ maintenanceId: "bad", memo: "preserve unknown" })); assert.equal(machine("invalid").meterHours, "unknown");
// Bootstrap never writes or invents provenance, even if legacy histories are larger.
let writes = 0;
const boot = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  RiceOS: { utils: U, schema, storage: { loadData: () => JSON.parse(json(legacyInvalid)), saveData: v => { writes++; return v; } } } });
boot.window = boot; vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core/state.js"), "utf8"), boot);
assert.equal(writes, 0); assert.equal(boot.RiceOS.state.data().machines[0].meterBaseline, undefined);
console.log("verify_maintenance_meter_correction: PASS provenance, correction/clear/delete/move, manual/legacy, rollback, JSON, no startup writes");
