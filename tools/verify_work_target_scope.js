"use strict";

// In-memory core regression only; never accesses browser/user storage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const date = "2026-09-20";
const plain = (value) => JSON.parse(JSON.stringify(value));
const planting = "\u7530\u690d\u3048";
const harvest = "\u7a32\u5208\u308a";
const herbicide = "\u9664\u8349\u5264";
const water = "\u4e2d\u5e72\u3057\u958b\u59cb";

function fixture(extra = {}) {
  const memory = new Map();
  const events = [];
  const context = vm.createContext({
    Blob,
    alert() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent: (event) => events.push(event.detail),
    localStorage: {
      getItem: (key) => memory.has(key) ? memory.get(key) : null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key)
    }
  });
  context.window = context;
  const load = (name) => vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../assets/js/core/${name}.js`), "utf8"), context);
  load("utils");
  load("schema");
  const S = context.RiceOS.schema;
  memory.set(S.STORE_KEY, JSON.stringify(S.normalize({
    appVersion: S.APP_VERSION,
    fields: [{ fieldId: "f1", name: "Field one" }, { fieldId: "f2", name: "Field two" }],
    otherWorks: [{ otherWorkId: "other", date, workName: "Office" }],
    ...extra
  })));
  load("storage");
  load("state");
  return { S, state: context.RiceOS.state, memory, events };
}

function unchangedFailure(f, operation) {
  const before = plain(f.state.data());
  const persisted = Array.from(f.memory);
  const eventCount = f.events.length;
  assert.equal(operation(), null);
  assert.ok(f.state.lastSaveError());
  assert.deepEqual(plain(f.state.data()), before);
  assert.deepEqual(Array.from(f.memory), persisted);
  assert.equal(f.events.length, eventCount);
}

function assertOffField(row, work = true) {
  assert.equal(row.targetScope, "offField");
  for (const key of ["fieldIds", "batchFieldIds", "orphanedFieldIds"]) assert.deepEqual(plain(row[key]), [], key);
  assert.equal(row.batchId, "");
  if (!work) return;
  for (const key of ["herbicideLinks", "harvestSnapshots", "waterMigrationLinks"]) assert.deepEqual(plain(row[key]), [], key);
  assert.deepEqual(plain(row.fieldAllocatedHours), {});
  assert.deepEqual(plain(row.growthSnapshots), {});
  assert.equal(row.timeAccounting, "single");
}

const stale = {
  targetScope: "offField", fieldIds: ["f1", "gone"], fieldId: "f2",
  batchId: "old-batch", batchFieldIds: ["f1", "f2"], orphanedFieldIds: ["gone"],
  fieldAllocatedHours: { f1: 2 }, timeAccounting: "shared", growthSnapshots: { f1: {} },
  herbicideLinks: [{ fieldId: "f1", assignmentId: "missing", stepId: "missing" }],
  harvestSnapshots: [{ fieldId: "f1", harvestDate: date }],
  waterMigrationLinks: [{ fieldId: "f1", kind: "dry", legacyKey: "old", periodId: "dry" }]
};

{
  const f = fixture({ fieldWorks: [{ ...stale, workId: "import", date }], schedules: [{ ...stale, scheduleId: "import", date }] });
  assertOffField(f.state.data().fieldWorks[0]);
  assertOffField(f.state.data().schedules[0], false);
  const roundtrip = f.S.normalize(plain(f.state.data()));
  assertOffField(roundtrip.fieldWorks[0]);
  assertOffField(roundtrip.schedules[0], false);
  assert.equal(roundtrip.otherWorks.length, 1);
  assert.equal(roundtrip.otherWorks[0].otherWorkId, "other");
  console.log("PASS scope normalization, stale IDs, JSON roundtrip, otherWorks retained");
}

{
  const f = fixture();
  for (const save of [f.state.saveFieldWork, f.state.saveSchedule]) {
    for (const fieldIds of [[], ["gone"], ["f1", "gone"], "f1"]) {
      unchangedFailure(f, () => save({ date, fieldIds }));
    }
    assert.ok(save({ date, fieldIds: ["f1"], targetScope: "field" }));
  }
  console.log("PASS new field records reject missing/stale/mixed/invalid targets atomically");
}

{
  const f = fixture();
  const fields = plain(f.state.data().fields);
  const other = plain(f.state.data().otherWorks);
  for (const workName of [planting, harvest, herbicide, water]) {
    assert.ok(f.state.saveFieldWork({ ...stale, workId: workName, workName, date }));
    assertOffField(f.state.data().fieldWorks.find((w) => w.workId === workName));
    assert.deepEqual(plain(f.state.data().fields), fields);
    assert.deepEqual(plain(f.state.data().dryPeriods), []);
    assert.deepEqual(plain(f.state.data().irrigations), []);
    assert.equal(f.events.at(-1).message, "\u4f5c\u696d\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002");
  }
  assert.deepEqual(plain(f.state.data().otherWorks), other);
  assert.equal(f.state.isActualFieldWork({ targetScope: "offField", date, workName: planting }), false);
  const persisted = JSON.parse(f.memory.get(f.S.STORE_KEY));
  persisted.fieldWorks.forEach((w) => assertOffField(w));
  console.log("PASS offField named agronomy/water work has no field side effects or misleading feedback");
}

{
  const f = fixture();
  assert.ok(f.state.saveFieldWork({ date, workId: "switch", fieldIds: ["f1"], workName: "Office" }));
  assert.ok(f.state.saveFieldWork({ ...stale, date, workId: "switch", workName: "Office" }));
  assertOffField(f.state.data().fieldWorks[0]);
  assert.ok(f.state.saveFieldWork({ date, workId: "switch", fieldIds: ["f2"], workName: "Office" }));
  assertOffField(f.state.data().fieldWorks[0]);
  unchangedFailure(f, () => f.state.saveFieldWork({ date, workId: "switch", targetScope: "field", fieldIds: [] }));
  assert.ok(f.state.saveFieldWork({ date, workId: "switch", targetScope: "field", fieldIds: ["f2"] }));
  assert.deepEqual(plain(f.state.data().fieldWorks[0].fieldIds), ["f2"]);
  for (const workName of [planting, water, "\u4e2d\u5e72\u5b8c\u4e86", "\u51fa\u7a42\u78ba\u8a8d"]) {
    assert.ok(f.state.saveFieldWork({ date, workId: workName, fieldIds: ["f1"], workName, legacyWaterRecord: true }));
    unchangedFailure(f, () => f.state.saveFieldWork({ ...stale, date, workId: workName, workName: "Office" }));
  }
  console.log("PASS work scope switches, inherited scope, safe rejection of linked agronomic switches");
}

const schedules = () => [
  { scheduleId: "field", date, fieldIds: ["f1"], title: "Office" },
  { scheduleId: "global", date, fieldIds: [], title: "Office" },
  { scheduleId: "off", date, targetScope: "offField", fieldIds: ["f1"], title: "Office" }
];
{
  const f = fixture({ schedules: schedules() });
  const schedule = (id) => f.state.data().schedules.find((s) => s.scheduleId === id);
  assert.ok(f.state.saveFieldWork({ date, workId: "off-work", targetScope: "offField", fieldIds: ["f1"], workName: "Office", sourceScheduleId: "global" }));
  assert.equal(schedule("field").completedByWorkId, "");
  assert.equal(schedule("global").completedByWorkId, "");
  assert.equal(schedule("off").completedByWorkId, "off-work");
  assert.equal(f.state.data().fieldWorks[0].sourceScheduleId, "");
  assert.ok(f.state.saveFieldWork({ date, workId: "field-work", fieldIds: ["f1"], workName: "Office", sourceScheduleId: "off" }));
  assert.equal(schedule("field").completedByWorkId, "field-work");
  assert.equal(schedule("global").completedByWorkId, "field-work");
  assert.equal(schedule("off").completedByWorkId, "off-work");
  assert.equal(f.state.data().fieldWorks[1].sourceScheduleId, "");
  assert.ok(f.state.saveFieldWork({ date, workId: "field-work", targetScope: "offField", workName: "Office" }));
  assert.equal(schedule("field").completedByWorkId, "");
  assert.equal(schedule("global").completedByWorkId, "");
  console.log("PASS automatic/explicit schedule scope isolation and reopening after scope switch");
}

{
  const f = fixture({ schedules: schedules() });
  assert.ok(f.state.saveFieldWork({ date, workId: "explicit", targetScope: "offField", workName: "Office", sourceScheduleId: "off" }));
  assert.equal(f.state.data().fieldWorks[0].sourceScheduleId, "off");
  assert.equal(f.state.data().schedules.find((s) => s.scheduleId === "off").completedByWorkId, "explicit");
  unchangedFailure(f, () => f.state.saveFertilizerCompletion({ scheduleId: "off", date }));
  unchangedFailure(f, () => f.state.saveFertilizerCompletion({ scheduleId: "field", date, targetScope: "offField" }));
  console.log("PASS compatible explicit schedule link and fertilizer scope guard");
}

{
  const f = fixture({ fieldWorks: [{ workId: "legacy", date, fieldIds: [] }], schedules: schedules() });
  assert.equal(f.state.data().fieldWorks[0].targetScope, "field");
  assert.ok(f.state.saveFieldWork({ workId: "legacy", date, fieldIds: [], workName: "Office" }));
  assert.equal(f.state.data().schedules.find((s) => s.scheduleId === "global").completedByWorkId, "legacy");
  assert.equal(f.state.data().schedules.find((s) => s.scheduleId === "off").completedByWorkId, "");
  assert.ok(f.state.saveSchedule({ scheduleId: "global", date, fieldIds: [] }));
  assert.ok(f.state.saveSchedule({ ...stale, scheduleId: "field", date }));
  assertOffField(f.state.data().schedules.find((s) => s.scheduleId === "field"), false);
  assert.ok(f.state.saveSchedule({ scheduleId: "field", date, fieldIds: ["f1"] }));
  assertOffField(f.state.data().schedules.find((s) => s.scheduleId === "field"), false);
  unchangedFailure(f, () => f.state.saveSchedule({ scheduleId: "field", date, targetScope: "field", fieldIds: [] }));
  assert.ok(f.state.saveSchedule({ scheduleId: "field", date, targetScope: "field", fieldIds: ["f1"] }));
  console.log("PASS legacy blank field records/global schedules and schedule scope switches");
}

{
  const f = fixture({ schedules: schedules(), fieldWorks: [
    { workId: "linked-herbicide", date, fieldIds: ["f1"], workName: herbicide, herbicideLinks: stale.herbicideLinks },
    { workId: "linked-harvest", date, fieldIds: ["f1"], workName: harvest, harvestSnapshots: stale.harvestSnapshots }
  ] });
  for (const workId of ["linked-herbicide", "linked-harvest"]) {
    assert.ok(f.state.saveFieldWork({ workId, date, targetScope: "offField", workName: "Office" }));
    assertOffField(f.state.data().fieldWorks.find((w) => w.workId === workId));
  }
  assert.ok(f.state.saveFieldWork({ date, workId: "source", fieldIds: ["f1"], workName: "Office", sourceScheduleId: "field" }));
  const completed = plain(f.state.data().schedules.find((s) => s.scheduleId === "field"));
  assert.equal(completed.completedByWorkId, "source");
  assert.ok(f.state.saveSchedule({ ...completed, targetScope: "offField" }));
  const switched = f.state.data().schedules.find((s) => s.scheduleId === "field");
  assertOffField(switched, false);
  assert.equal(switched.completedByWorkId, "");
  assert.equal(switched.completedAt, "");
  assert.equal(f.state.data().fieldWorks.find((w) => w.workId === "source").sourceScheduleId, "");
  assert.ok(f.state.saveSchedule({ date, scheduleId: "off-water", targetScope: "offField", title: water,
    fieldIds: ["f1"], recordKind: "water", waterKind: "dry", waterPhase: "start" }));
  assert.ok(f.state.saveDryPeriod({ date, fieldId: "f1", startDate: date, sourceScheduleId: "off-water", sourceSchedulePhase: "start" }));
  assert.equal(f.state.data().schedules.find((s) => s.scheduleId === "off-water").completedByWaterPeriodId, "");
  console.log("PASS clearing inherited herbicide/harvest links, schedule completion links, water scope isolation");
}
