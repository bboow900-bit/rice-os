"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.window = global;
global.document = { getElementById: () => null, querySelectorAll: () => [] };
global.alert = (message) => { throw new Error(message); };
global.dispatchEvent = () => true;
global.scrollTo = () => {};
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
const memory = new Map();
global.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
for (const file of ["utils", "schema", "storage", "state", "herbicide"]) {
  vm.runInThisContext(fs.readFileSync(`assets/js/core/${file}.js`, "utf8"));
}

const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) {
    const classes = new Set();
    nodes.set(id, {
      value: "", dataset: {}, listeners: {},
      get parentElement() { return node(`${id}:parent`); },
      closest(selector) { return node(`${id}:ancestor:${selector}`); },
      setAttribute(name, value) { this[name] = String(value); },
      classList: {
        toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name)
      },
      addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    });
  }
  return nodes.get(id);
}
const state = RiceOS.state;
const H = RiceOS.herbicide;
const fieldId = state.fields()[0].fieldId;
const card = node("field-card");
card.dataset.id = fieldId;
RiceOS.utils.$ = id => id === "fwFieldSelectionSummary" ? null : node(id);
RiceOS.utils.$$ = selector => selector === "#fwFields .select-card" ? [card]
  : selector === "#fwFields .select-card.selected" && card.classList.contains("selected") ? [card] : [];
RiceOS.utils.setOptions = (el, options, value) => { el.options = options; el.value = value; };
document.querySelector = node;
vm.runInThisContext(fs.readFileSync("assets/js/screens/field-work.js", "utf8"));
RiceOS.screens.fieldWork.bind();

async function fire(id, type, value) {
  if (value !== undefined) node(id).value = value;
  for (const handler of node(id).listeners[type] || []) await handler({ preventDefault() {} });
}
function values() {
  return ["fwMaterial", "fwMaterialId", "fwHerbicideCategory", "fwHerbicidePurpose"].map(id => node(id).value);
}

async function main() {
  state.saveMaterial({ name: "Product A", category: "\u9664\u8349\u5264" });
  state.saveMaterial({ name: "Product B", category: "\u9664\u8349\u5264" });
  const materialA = state.data().materials.find(m => m.name === "Product A").materialId;
  const materialB = state.data().materials.find(m => m.name === "Product B").materialId;
  const program = H.saveProgram({ name: "Program", steps: [
    { id: "a", category: "planned A", materialId: materialA, purpose: "planned reason A" },
    { id: "b", category: "planned B", materialId: materialB, purpose: "planned reason B" }
  ] });
  const [assignment] = H.assignProgram({ programId: program.programId, year: 2026, fieldIds: [fieldId] });
  const links = [{ fieldId, assignmentId: assignment.assignmentId, stepId: "a" }];

  for (const materialId of [materialA, "", "missing-master"]) {
    const workId = `picker-${materialId || "free"}`;
    const expected = ["Historical product name", materialId, "actual category", "actual field reason"];
    state.saveFieldWork({ workId, date: "2026-07-10", fieldIds: [fieldId], workName: "\u9664\u8349\u5264",
      material: expected[0], materialId, herbicideCategory: expected[2], herbicidePurpose: expected[3], herbicideLinks: links });
    RiceOS.screens.fieldWork.editWork(workId);
    assert.deepEqual(values(), expected, "Opening history must not apply planned values");
    await fire("fwHerbicideStep", "change", "step:b");
    assert.deepEqual(values(), ["Product B", materialB, "planned B", "planned reason B"]);
    await fire("fwHerbicideStep", "change", "saved");
    assert.deepEqual(values(), expected, "Restoring saved links must restore actual values");
    assert.equal(node("fwMaterial").dataset.autoFilled, "0");
    await fire("fwHerbicideStep", "change", "");
    await fire("fwHerbicideStep", "change", "saved");
    assert.deepEqual(values(), expected, "Unlink then restore must retain the snapshot");
    await fire("fieldWorkForm", "submit");
    const saved = state.data().fieldWorks.find(w => w.workId === workId);
    assert.deepEqual([saved.material, saved.materialId, saved.herbicideCategory, saved.herbicidePurpose], expected);
    assert.deepEqual(saved.herbicideLinks, links);
    assert.ok(H.usageForAssignment(assignment.assignmentId).steps.find(s => s.id === "a").works.some(w => w.workId === workId));
    assert.equal(H.usageForAssignment(assignment.assignmentId).steps.find(s => s.id === "b").works.some(w => w.workId === workId), false);
  }
  RiceOS.screens.fieldWork.editWork("picker-free");
  for (const id of ["fwMachine", "fwMaterial", "fwAmount", "fwWeather", "fwWeatherAutoJson", "fwHerbicideCategory", "fwHerbicidePurpose"]) node(id).value = "stale field default";
  node("fwMemo").value = "template memo";
  node("fwMemo").dataset.templateFilled = "1";
  await fire("fwTargetScope", "change", "offField");
  for (const id of ["fwMachine", "fwMaterial", "fwMaterialId", "fwAmount", "fwWeather", "fwWeatherAutoJson", "fwHerbicideCategory", "fwHerbicidePurpose", "fwMemo"]) {
    assert.equal(node(id).value, "", `${id} must not retain a field default after switching off-field`);
  }
  assert.equal(card.classList.contains("selected"), false);
  assert.equal(card["aria-pressed"], "false");
  assert.equal(node("fwFields").closest("details").hidden, true);
  await fire("fwTargetScope", "change", "field");
  assert.equal(card.classList.contains("selected"), false, "Returning to field scope must not restore stale field IDs");
  console.log("PASS herbicide picker saved restoration, actual reasons, free input, missing master, persisted review links and scope default clearing");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
