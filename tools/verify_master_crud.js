"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
global.window = global;
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, { value: "", textContent: "", innerHTML: "", handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, scrollIntoView() {}, focus() {} });
  return nodes.get(id);
}
global.document = { getElementById: node, querySelectorAll: () => [] };
let message = "";
global.alert = text => { message = text; };
global.dispatchEvent = () => true;
global.CustomEvent = class {};
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
const memory = new Map();
global.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
for (const file of ["core/utils", "core/schema", "core/storage", "core/state", "screens/materials", "screens/recipes"]) vm.runInThisContext(fs.readFileSync(`assets/js/${file}.js`, "utf8"));
const state = RiceOS.state;
const snapshot = () => JSON.stringify(state.data());
function blocked(action, pattern) {
  const before = snapshot();
  const storedBefore = JSON.stringify([...memory]);
  message = "";
  assert.equal(action(), null);
  assert.match(message, pattern);
  assert.equal(snapshot(), before);
  assert.equal(JSON.stringify([...memory]), storedBefore);
}
for (const name of [undefined, null, "", " \t\n", "\u3000"]) {
  blocked(() => state.saveMaterial({ name }), /資材名/);
}
blocked(() => state.saveMaterial({}), /資材名/);
state.saveMaterial({ name: "Test material", season: 2026, ordered: "3 bags", productUrl: "https://example.com/product", registrationNumber: "12345" });
const id = state.data().materials.at(-1).materialId;
for (const name of ["", " \t\n", "\u3000", null]) {
  blocked(() => state.saveMaterial({ materialId: id, name }), /資材名/);
}
state.saveMaterial({ materialId: id, name: "Renamed" });
assert.equal(state.data().materials.at(-1).ordered, "3 bags");
assert.equal(state.data().materials.at(-1).productUrl, "https://example.com/product");
assert.equal(state.data().materials.at(-1).registrationNumber, "12345");
state.saveMaterial({ materialId: id, productUrl: "", registrationNumber: "" });
assert.equal(state.data().materials.at(-1).name, "Renamed");
assert.equal(RiceOS.storage.loadData().materials.find(m => m.materialId === id).name, "Renamed");
assert.equal(state.data().materials.at(-1).productUrl, "");
assert.equal(state.data().materials.at(-1).registrationNumber, "");
for (const [collection, record] of [
  ["fieldWorks", { workId: "old", date: "2020-01-01", materialId: id, material: "Original" }],
  ["herbicidePrograms", { steps: [{ materialId: id }] }],
  ["herbicideAssignments", { history: [{ steps: [{ materialId: id }] }] }]
]) {
  const previous = state.data()[collection];
  state.data()[collection] = [record];
  blocked(() => state.deleteMaterial(id), /参照/);
  if (previous === undefined) delete state.data()[collection];
  else state.data()[collection] = previous;
}
RiceOS.screens.materials.bind();
RiceOS.screens.recipes.bind();
const click = (element, selector, dataset) => node(element).handlers.click({ target: { closest: query => query === selector ? { dataset } : null } });
RiceOS.utils.setOptions = (element, options, value) => { element.value = value; };
click("materialList", "[data-material-edit]", { materialEdit: id });
assert.equal(node("editMaterialId").value, id);
assert.equal(node("mName").value, "Renamed");
node("mName").value = "Edited through form";
node("materialForm").handlers.submit({ preventDefault() {} });
assert.equal(state.data().materials.find(m => m.materialId === id).name, "Edited through form");
assert.equal(state.data().materials.find(m => m.materialId === id).ordered, "3 bags");
let confirmation = false;
global.confirm = () => confirmation;
node("editMaterialId").value = id;
node("mName").value = "Unsaved draft";
let before = snapshot();
click("materialList", "[data-material-delete]", { materialDelete: id });
assert.equal(snapshot(), before);
assert.equal(node("mName").value, "Unsaved draft");
confirmation = true;
state.data().fieldWorks.push({ workId: "blocked", materialId: id });
click("materialList", "[data-material-delete]", { materialDelete: id });
assert.equal(node("mName").value, "Unsaved draft");
state.data().fieldWorks.pop();
click("materialList", "[data-material-delete]", { materialDelete: id });
assert.equal(state.data().materials.some(m => m.materialId === id), false);
assert.equal(node("editMaterialId").value, "");
blocked(() => state.deleteMaterial(id), /見つかりません/);
const varietyId = state.addVariety("Custom variety");
node("recipeList").handlers.change({ target: { closest: () => ({ dataset: { varietyId, recipeField: "name" }, value: "Edited variety" }) } });
assert.equal(state.variety(varietyId).name, "Edited variety");
blocked(() => state.updateVariety(varietyId, { name: " " }), /品種名/);
for (const record of [{ varietyId }, { varietyIds: [varietyId] }, { nested: { varietyId } }]) {
  state.data().referenceTest = [record];
  blocked(() => state.deleteVariety(varietyId), /参照/);
  delete state.data().referenceTest;
}
confirmation = false;
before = snapshot();
click("recipeList", "[data-variety-delete]", { varietyDelete: varietyId });
assert.equal(snapshot(), before);
confirmation = true;
click("recipeList", "[data-variety-delete]", { varietyDelete: varietyId });
assert.equal(state.variety(varietyId), undefined);
assert.equal(RiceOS.storage.loadData().varieties.some(v => v.varietyId === varietyId), false);
blocked(() => state.deleteVariety(RiceOS.schema.DEFAULT_VARIETIES[0].varietyId), /標準品種/);
console.log("PASS master edits, nested and historical reference guards, confirmed deletes, cancellation and form preservation");
