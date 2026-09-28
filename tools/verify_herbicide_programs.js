"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const memory = new Map();
global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [] };
global.alert = () => {};
global.dispatchEvent = () => true;
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
global.localStorage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
for (const file of ["utils", "schema", "storage", "state", "herbicide"]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, `assets/js/core/${file}.js`), "utf8"), { filename: file });
}
const state = RiceOS.state;
const H = RiceOS.herbicide;
const fields = state.activeFields().slice(0, 2).map((field) => field.fieldId);
const groupId = state.addFieldGroup("Herbicide test group");
fields.forEach((fieldId) => assert.ok(state.updateField(fieldId, { fieldGroupId: groupId })));
assert.ok(state.saveMaterial({ name: "Short name", formalName: "Original formal name", registrationNumber: "12345", category: "除草剤" }));
const materialId = state.data().materials.at(-1).materialId;
const program = H.saveProgram({ name: "Test program", steps: [{ id: "step-a", category: "Custom category", materialId, plannedTiming: "Recorded timing", purpose: "Recorded purpose" }] });
assert.ok(program);
assert.equal(program.revision, 1);
assert.equal(program.reviewYears, 3);
for (const patch of [{ steps: [] }, { steps: [{ category: " " }] }, { steps: [{ category: "Custom", materialId: "missing" }] }, ...[0, 21, 1.5, "bad", null, true].map((reviewYears) => ({ reviewYears }))]) {
  const before = JSON.stringify(state.data());
  assert.equal(H.saveProgram({ ...program, ...patch }), null);
  assert.equal(JSON.stringify(state.data()), before);
}
const assigned = H.assignProgram({ programId: program.programId, year: 2026, fieldGroupId: groupId, fieldIds: [fields[0]] });
assert.equal(assigned.length, 2);
assert.deepEqual(assigned.map((item) => item.fieldId).sort(), [...fields].sort());
assert.notEqual(assigned[0].assignmentId, assigned[1].assignmentId);
const original = H.assignmentFor(fields[0], 2026);
assert.equal(original.steps[0].category, "Custom category");
assert.equal(original.reviewYears, 3);
assert.equal(original.steps[0].materialName, "Original formal name");
assert.equal(original.steps[0].registrationNumber, "12345");
assert.ok(state.saveMaterial({ materialId, name: "Renamed", formalName: "Renamed formal", registrationNumber: "67890" }));
assert.equal(H.assignmentFor(fields[0], 2026).steps[0].materialName, "Original formal name");
assert.equal(H.assignmentFor(fields[0], 2026).steps[0].registrationNumber, "12345");
assert.ok(state.saveMaterial({ materialId, formalName: "" }));
const fallback = H.assignProgram({ programId: program.programId, year: 2027, fieldIds: [fields[0]] })[0];
assert.equal(fallback.steps[0].materialName, "Renamed");
assert.equal(fallback.steps[0].registrationNumber, "67890");
for (const years of [1, 20]) {
  const bounded = H.saveProgram({ name: `Review ${years}`, reviewYears: years, steps: [{ category: "Custom" }] });
  assert.equal(bounded.reviewYears, years);
  assert.equal(H.assignProgram({ programId: bounded.programId, year: 2028 + years, fieldIds: [fields[0]] })[0].reviewYears, years);
}
const materials = state.data().materials;
state.data().materials = materials.filter((item) => item.materialId !== materialId);
const beforeMissingMaterial = JSON.stringify(state.data());
assert.equal(H.assignProgram({ programId: program.programId, year: 2026, fieldIds: fields }), null);
assert.equal(JSON.stringify(state.data()), beforeMissingMaterial);
state.data().materials = materials;
assigned[0].steps[0].purpose = "External mutation";
assert.equal(H.assignmentFor(fields[0], 2026).steps[0].purpose, "Recorded purpose");
assert.ok(state.updateField(fields[1], { fieldGroupId: "" }));
assert.ok(H.assignmentFor(fields[1], 2026));
const updated = H.saveProgram({ programId: program.programId, name: "Changed template", steps: [{ id: "step-b", category: "Another custom category" }] });
assert.equal(updated.revision, 2);
assert.equal(H.assignmentFor(fields[0], 2026).name, "Test program");
assert.equal(H.assignmentFor(fields[0], 2026).steps[0].id, "step-a");
const replaced = H.assignProgram({ programId: program.programId, year: "2026", fieldIds: [fields[0]] })[0];
assert.equal(H.assignmentFor(fields[0], 2026).assignmentId, replaced.assignmentId);
assert.equal(H.assignments(fields[0], 2026).length, 2);
assert.equal(H.assignments(fields[0], 2026)[0].active, false);
assert.equal(H.assignments(fields[0], 2026)[0].supersededBy, replaced.assignmentId);
assert.equal(H.assignments(fields[0], 2026)[0].steps[0].id, "step-a");
assert.equal(H.assignmentFor(fields[1], 2026).assignmentId, assigned[1].assignmentId);
assert.equal(H.assignmentFor(fields[0], 2025), null);
assert.equal(H.assignProgram({ programId: program.programId, year: "all", fieldIds: fields }), null);
assert.equal(H.assignProgram({ programId: program.programId, year: 2026, fieldIds: ["not-a-field"] }), null);

const observation = H.saveObservation({ date: "2026-07-01", assignmentId: original.assignmentId, fieldId: fields[0], status: "Observed", weeds: ["Recorded weed"], memo: "Original memo" });
assert.ok(observation, "Historical assignment remains observable");
assert.ok(H.saveObservation({ observationId: observation.observationId, memo: "Updated memo" }));
assert.equal(H.observations(original.assignmentId).length, 1);
assert.equal(H.observations(original.assignmentId)[0].memo, "Updated memo");
assert.equal(H.observations(replaced.assignmentId).length, 0);
const beforeInvalid = JSON.stringify(state.data());
for (const patch of [{ date: "2025-07-01" }, { date: "2026-02-30" }, { fieldId: fields[1] }, { status: "" }, { assignmentId: "missing" }, { weeds: {} }]) {
  assert.equal(H.saveObservation({ ...observation, ...patch }), null);
  assert.equal(JSON.stringify(state.data()), beforeInvalid, "Invalid observation must be a no-op");
}
assert.equal(H.saveObservation({ ...observation, assignmentId: replaced.assignmentId }), null, "Observation cannot be silently moved to a replacement");
const restored = RiceOS.schema.normalize(JSON.parse(JSON.stringify(state.data())));
assert.deepEqual(restored.meta.herbicideAssignments, state.data().meta.herbicideAssignments);
assert.deepEqual(restored.meta.herbicideObservations, state.data().meta.herbicideObservations);
assert.deepEqual(restored.meta.herbicidePrograms, state.data().meta.herbicidePrograms);
assert.deepEqual(RiceOS.storage.loadData().meta.herbicideAssignments, state.data().meta.herbicideAssignments);

// Aggregate fixtures exercise read-only matching independently of the work editor.
const work = { workId: "group-work", workName: "除草剤", date: "2026-07-02", fieldIds: fields, material: "Historical name", amount: "1kg/10a", herbicideLinks: [
  { fieldId: fields[0], assignmentId: original.assignmentId, stepId: "step-a" },
  { fieldId: fields[1], assignmentId: assigned[1].assignmentId, stepId: "step-a" }
], pesticideSnapshot: { source: "Recorded source" }, herbicideCategory: "Custom category", herbicidePurpose: "Recorded purpose" };
state.data().fieldWorks.push(work,
  { ...work, workId: "non-herbicide", workName: "追肥" },
  { ...work, workId: "wrong-year", date: "2025-07-02" },
  { ...work, workId: "wrong-field", fieldIds: [] },
  { ...work, workId: "name-only", herbicideLinks: [] },
  { ...work, workId: "wrong-step", herbicideLinks: [{ fieldId: fields[0], assignmentId: original.assignmentId, stepId: "step-b" }] },
  { ...work, workId: "wrong-link-field", herbicideLinks: [{ fieldId: fields[1], assignmentId: original.assignmentId, stepId: "step-a" }] });
const usage = H.usageForAssignment(original.assignmentId);
assert.deepEqual(usage.works.map((item) => item.workId), ["group-work"]);
assert.equal(usage.steps[0].works.length, 1);
assert.equal(usage.works[0].amount, "1kg/10a");
assert.equal(usage.works[0].pesticideSnapshot.source, "Recorded source");
assert.equal(H.usageForAssignment(assigned[1].assignmentId).works.length, 1);
assert.equal(H.usageForAssignment(replaced.assignmentId).works.length, 0);
usage.steps[0].works[0].material = "External mutation";
assert.equal(work.material, "Historical name");
assert.equal(H.usageForAssignment("missing"), null);
delete work.fieldIds;
assert.equal(H.usageForAssignment(original.assignmentId).works.length, 0);
assert.equal(H.usageForAssignment(assigned[1].assignmentId).works.length, 0);

const current = RiceOS.utils.clone(state.data());
const incoming = RiceOS.utils.clone(current);
const collections = { herbicidePrograms: "programId", herbicideAssignments: "assignmentId", herbicideObservations: "observationId" };
for (const [key, idKey] of Object.entries(collections)) {
  incoming.meta[key][0].name = "Must not overwrite";
  incoming.meta[key].push({ ...incoming.meta[key][0], [idKey]: `incoming-${key}` });
}
const merged = RiceOS.storage.mergeData(current, incoming);
for (const key of Object.keys(collections)) {
  const expected = [...current.meta[key], incoming.meta[key].at(-1)];
  assert.equal(merged.data.meta[key].length, expected.length);
  expected.forEach((row, index) => {
    for (const [property, value] of Object.entries(row)) {
      assert.deepEqual(merged.data.meta[key][index][property], value, `Merge retains ${key}.${property}`);
    }
  });
  assert.equal(merged.added[key], 1);
  assert.equal(RiceOS.storage.mergeData(merged.data, incoming).added[key], 0);
}
for (const key of Object.keys(collections)) {
  const saved = state.data().meta[key];
  for (const invalid of [null, {}, "corrupt", [null], ["corrupt"], [[]],
    ...(key === "herbicideObservations" ? [] : [[{}], [{ steps: null }], [{ steps: {} }], [{ steps: [null] }]])]) {
    state.data().meta[key] = invalid;
    const before = JSON.stringify(state.data());
    const read = { herbicidePrograms: H.programs, herbicideAssignments: H.assignments, herbicideObservations: H.observations }[key];
    assert.deepEqual(read(), []);
    assert.doesNotThrow(() => H.assignmentFor(fields[0], 2026));
    assert.doesNotThrow(() => H.usageForAssignment(original.assignmentId));
    assert.equal(H.saveProgram({ name: "Blocked", steps: [{ category: "Custom" }] }), null);
    assert.equal(H.assignProgram({ programId: program.programId, year: 2026, fieldIds: fields }), null);
    assert.equal(H.saveObservation(observation), null);
    assert.equal(JSON.stringify(state.data()), before, "Corrupt collections must not be overwritten");
  }
  state.data().meta[key] = saved;
}
const legacyAssignment = state.data().meta.herbicideAssignments.find((item) => item.assignmentId === original.assignmentId);
delete legacyAssignment.steps[0].materialName;
delete legacyAssignment.steps[0].registrationNumber;
const beforeLegacyRead = JSON.stringify(state.data());
assert.equal(H.assignmentFor(fields[1], 2026).steps[0].materialName, "Original formal name");
assert.equal(H.assignments(fields[0], 2026)[0].steps[0].materialName, undefined);
assert.equal(H.usageForAssignment(original.assignmentId).steps[0].materialName, undefined);
assert.equal(H.usageForAssignment(original.assignmentId).steps[0].registrationNumber, undefined);
assert.equal(JSON.stringify(state.data()), beforeLegacyRead, "Legacy reads must not invent historical master snapshots");
const oldBackup = RiceOS.utils.clone(state.data());
oldBackup.meta.herbicideAssignments = [ { ...original, active: true } ];
const newBackup = RiceOS.utils.clone(oldBackup);
newBackup.meta.herbicideAssignments = [{ ...original, active: false, supersededBy: replaced.assignmentId }, replaced];
const beforeMerge = JSON.stringify(oldBackup);
const reconciled = RiceOS.storage.mergeData(oldBackup, newBackup).data.meta.herbicideAssignments;
assert.equal(reconciled.filter(row => row.active !== false).length, 1);
assert.equal(reconciled.find(row => row.active !== false).assignmentId, replaced.assignmentId);
assert.equal(JSON.stringify(oldBackup), beforeMerge, "Merge does not modify the source backup");
assert.throws(() => RiceOS.schema.normalize({ ...oldBackup, meta: { herbicidePrograms: [null] } }));
assert.throws(() => RiceOS.schema.normalize({ ...oldBackup, meta: { herbicideAssignments: {} } }));
const linkedSave = { workId: "state-linked", date: "2026-06-10", workName: "除草剤", fieldIds: fields, herbicideLinks: assigned.map(a => ({ fieldId: a.fieldId, assignmentId: a.assignmentId, stepId: a.steps[0].id })), herbicideCategory: "初期剤", herbicidePurpose: "Recorded reason" };
assert.ok(state.saveFieldWork(linkedSave));
assert.equal(state.data().fieldWorks.find(row => row.workId === linkedSave.workId).herbicideLinks.length, 2);
assert.equal(state.saveFieldWork({ ...linkedSave, date: "2025-06-10" }), null);
assert.equal(state.data().fieldWorks.find(row => row.workId === linkedSave.workId).date, linkedSave.date);
assert.ok(state.saveFieldWork({ ...linkedSave, fieldIds: [fields[0]] }));
assert.equal(state.data().fieldWorks.find(row => row.workId === linkedSave.workId).herbicideLinks.length, 1);
assert.ok(state.saveFieldWork({ ...linkedSave, workName: "草刈り" }));
assert.equal(state.data().fieldWorks.find(row => row.workId === linkedSave.workId).herbicideLinks.length, 0);
console.log("PASS herbicide programs: group snapshots, revisions, replacement history, observation validation, persistence and exact work links");
