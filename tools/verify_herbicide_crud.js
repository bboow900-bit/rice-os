"use strict";

// Actual modules and delegated UI handlers with isolated storage, no farm data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
const nodes = new Map();
const handlers = {};
let approved = false;
let failWrites = false;
let removed = 0;
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: "", value: "", children: [],
    replaceChildren() { this.innerHTML = ""; }, dataset: {} });
  return nodes.get(id);
}
const context = vm.createContext({
  console, alert() {}, confirm: () => approved, CustomEvent: class {}, dispatchEvent() {},
  document: { getElementById: node, querySelectorAll: () => [],
    addEventListener(type, handler) { (handlers[type] ||= []).push(handler); } },
  localStorage: { getItem: key => memory.get(key) || null,
    setItem(key, value) { if (failWrites) throw new Error("Injected failure"); memory.set(key, String(value)); },
    removeItem: key => memory.delete(key) }
});
context.window = context;
for (const file of ["core/utils", "core/schema", "core/storage", "core/state", "core/herbicide", "screens/herbicide"]) {
  const filename = path.resolve(__dirname, `../assets/js/${file}.js`);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}
const R = context.RiceOS;
const H = R.herbicide;
const state = R.state;
R.utils.toast = () => {};
R.utils.setOptions = () => {};
R.screens.herbicideSupport.bind();
const snapshot = () => JSON.stringify(state.data());
function noop(action, returnsNull = true) {
  const before = snapshot();
  const stored = JSON.stringify([...memory]);
  const result = action();
  if (returnsNull) assert.equal(result, null);
  assert.equal(snapshot(), before);
  assert.equal(JSON.stringify([...memory]), stored);
}
function click(attribute, key, id) {
  const button = { dataset: { [key]: id }, hasAttribute: name => name === attribute,
    closest: selector => selector === ".herbicide-observation-row" ? { remove() { removed++; } } : null };
  handlers.click.forEach(handler => handler({ target: { closest: () => button } }));
}
function submit(form) {
  handlers.submit.forEach(handler => handler({ target: form, preventDefault() {} }));
}
const program = H.saveProgram({ name: "Used", steps: [{ id: "step", category: "Test" }] });
assert(program);
const fieldId = state.activeFields()[0].fieldId;
const assignment = H.assignProgram({ programId: program.programId, year: 2026, fieldIds: [fieldId] })[0];
assert(state.saveFieldWork({ date: "2026-06-01", workName: "\u9664\u8349\u5264", fieldIds: [fieldId],
  herbicideLinks: [{ fieldId, assignmentId: assignment.assignmentId, stepId: "step" }] }));
const observation = H.saveObservation({ assignmentId: assignment.assignmentId, fieldId, date: "2026-07-01", status: "Observed", memo: "Before" });
const second = H.saveObservation({ assignmentId: assignment.assignmentId, fieldId, date: "2026-07-02", status: "Observed" });
const protectedHistory = () => JSON.stringify({ assignments: H.assignments(), works: state.data().fieldWorks });
const history = protectedHistory();
const created = program.createdAt;
assert(H.saveProgram({ programId: program.programId, name: "Edited" }));
assert.equal(H.programs().length, 1);
assert.equal(H.programs()[0].programId, program.programId);
assert.equal(H.programs()[0].createdAt, created);
assert.equal(protectedHistory(), history);
assert(H.saveObservation({ observationId: observation.observationId, memo: "Edited" }));
assert.equal(H.observations().length, 2);
assert.equal(H.observations()[0].createdAt, observation.createdAt);
assert.equal(protectedHistory(), history);
noop(() => H.saveProgram({ programId: "missing", name: "Not new", steps: [{ category: "Test" }] }));
noop(() => H.saveObservation({ ...observation, observationId: "missing" }));
noop(() => H.deleteProgram(program.programId));
noop(() => H.deleteProgram("missing"));
noop(() => H.deleteObservation("missing"));

// Even a superseded assignment with no current use protects its template.
const replacement = H.saveProgram({ name: "Replacement", steps: [{ category: "Test" }] });
assert(H.assignProgram({ programId: replacement.programId, year: 2026, fieldIds: [fieldId] }));
assert.equal(H.assignments().find(a => a.assignmentId === assignment.assignmentId).active, false);
noop(() => H.deleteProgram(program.programId));

// Stale edit buttons must not open a new-record form.
node("herbicideProgramEditor").innerHTML = "draft";
for (const id of ["missing", undefined, null]) {
  click("data-h-edit", "hEdit", id);
  assert.equal(node("herbicideProgramEditor").innerHTML, "draft");
}
click("data-h-new", "hNew", "");
assert(node("herbicideProgramEditor").innerHTML.includes('data-program-id=""'));
click("data-h-edit", "hEdit", program.programId);
assert(node("herbicideProgramEditor").innerHTML.includes(`data-program-id="${program.programId}"`));
const review = R.herbicideUI.renderReview(state.field(fieldId), 2026);
assert(review.includes(`data-observation-id="${observation.observationId}"`));
assert(review.includes(`data-h-delete-observation="${observation.observationId}"`));
const observationForm = {
  dataset: { observationId: observation.observationId, hObservation: assignment.assignmentId },
  hasAttribute: name => name === "data-h-observation",
  elements: Object.fromEntries(Object.entries({ date: "2026-07-01", status: "Edited in form", weeds: "weed", memo: "UI edit" }).map(([key, value]) => [key, { value }]))
};
submit(observationForm);
assert.equal(H.observations().length, 2);
assert.equal(H.observations()[0].observationId, observation.observationId);
assert.equal(H.observations()[0].memo, "UI edit");
noop(() => submit({ ...observationForm, dataset: { ...observationForm.dataset, observationId: "missing" } }), false);
const stepNodes = program.steps.map(step => ({ dataset: { hStep: step.id }, querySelector: selector => ({ value: ({ "[data-h-category]": step.category })[selector] || "" }) }));
const programForm = { id: "herbicideProgramForm", dataset: { programId: program.programId },
  elements: { name: { value: "UI edited" }, reviewYears: { value: "3" } },
  hasAttribute: () => false, querySelectorAll: () => stepNodes };
submit(programForm);
assert.equal(H.programs().filter(p => p.programId === program.programId).length, 1);
assert.equal(H.programs().find(p => p.programId === program.programId).name, "UI edited");
noop(() => submit({ ...programForm, dataset: { programId: "missing" } }), false);
R.herbicideUI.renderManagement();
assert(node("herbicideProgramList").innerHTML.includes(`data-h-delete-program="${program.programId}"`));

const unused = H.saveProgram({ name: "Unused", steps: [{ category: "Test" }] });
// Imported references outside annual assignments must also prevent deletion.
for (const reference of [{ programId: unused.programId }, { nested: { programIds: [unused.programId] } }]) {
  state.data().meta.importedHerbicideHistory = reference;
  noop(() => H.deleteProgram(unused.programId));
  delete state.data().meta.importedHerbicideHistory;
}
noop(() => click("data-h-delete-program", "hDeleteProgram", unused.programId), false);
noop(() => click("data-h-delete-observation", "hDeleteObservation", observation.observationId), false);
assert.equal(removed, 0);
approved = true;
noop(() => click("data-h-delete-program", "hDeleteProgram", program.programId), false);
failWrites = true;
noop(() => click("data-h-delete-program", "hDeleteProgram", unused.programId), false);
noop(() => click("data-h-delete-observation", "hDeleteObservation", observation.observationId), false);
assert.equal(removed, 0);
failWrites = false;
const beforeDelete = protectedHistory();
click("data-h-delete-program", "hDeleteProgram", unused.programId);
assert(!H.programs().some(p => p.programId === unused.programId));
click("data-h-delete-observation", "hDeleteObservation", observation.observationId);
assert.equal(removed, 1);
assert.equal(H.observations().length, 1);
assert.equal(H.observations()[0].observationId, second.observationId);
assert.equal(protectedHistory(), beforeDelete);
noop(() => H.deleteProgram(unused.programId));
noop(() => H.deleteObservation(observation.observationId));
noop(() => submit(observationForm), false);
for (const key of ["herbicidePrograms", "herbicideAssignments", "herbicideObservations"]) {
  assert.equal(JSON.stringify(R.storage.loadData().meta[key]), JSON.stringify(state.data().meta[key]));
}
console.log("PASS herbicide CRUD: stable IDs, historical protection, stale edits, confirmed deletion, cancellation, rollback and persistence");
