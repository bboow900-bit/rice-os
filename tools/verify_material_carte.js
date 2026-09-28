"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, { value: "", textContent: "", innerHTML: "", handlers: {},
    addEventListener(type, fn) { this.handlers[type] = fn; }, focus() {}, scrollIntoView() {} });
  return nodes.get(id);
};
global.window = global;
global.document = { getElementById: node, querySelectorAll: () => [] };
global.alert = () => {};
global.dispatchEvent = () => true;
global.CustomEvent = class {};
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
const memory = new Map();
global.localStorage = { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
for (const file of ["core/utils", "core/schema", "core/storage", "core/state", "core/herbicide", "screens/materials"]) {
  vm.runInThisContext(fs.readFileSync(`assets/js/${file}.js`, "utf8"));
}
RiceOS.utils.setOptions = () => {};
const state = RiceOS.state;
const screen = RiceOS.screens.materials;
screen.bind();
screen.resetForm();
node("mName").value = "Test product";
node("mSeason").value = "2026";
node("mCategory").value = "防除剤";
const submit = () => node("materialForm").handlers.submit({ preventDefault() {} });
const before = JSON.stringify(state.data());
for (const url of ["javascript:alert(1)", "data:text/html,test", "//example.com", "https://user:pass@example.com", "https://user@example.com", "https://", "relative"]) {
  node("mProductUrl").value = url;
  submit();
  assert.equal(JSON.stringify(state.data()), before);
}
node("mProductUrl").value = " https://example.com/product?q=1&b=2 ";
submit();
const material = state.data().materials.find((m) => m.name === "Test product");
assert.equal(material.productUrl, "https://example.com/product?q=1&b=2");
assert.equal(node("mProductUrl").value, "");
const edit = () => node("materialList").handlers.click({ target: { closest: (selector) => selector === "[data-material-edit]" ? { dataset: { materialEdit: material.materialId } } : null } });
edit();
assert.equal(node("mProductUrl").value, material.productUrl);
node("mProductUrl").value = "http://example.com/changed";
submit();
assert.equal(state.data().materials.find((m) => m.materialId === material.materialId).productUrl, "http://example.com/changed");
edit();
const saved = JSON.stringify(state.data());
node("mProductUrl").value = "https://example.com/cancelled";
node("cancelMaterialEdit").handlers.click();
assert.equal(JSON.stringify(state.data()), saved);
assert.equal(node("mProductUrl").value, "");

const fieldId = state.fields()[0].fieldId;
state.saveFieldWork({ workId: "w", date: "2026-06-10", fieldIds: [fieldId], workName: "除草剤", materialId: material.materialId, material: material.name, amount: "2kg", herbicidePurpose: "purpose-marker", memo: "<script>memo-marker</script>" });
state.saveFieldWork({ workId: "old", date: "2025-06-10", fieldIds: [fieldId], workName: "除草剤", materialId: material.materialId, material: material.name, memo: "OLD-MARKER" });
state.saveFieldWork({ workId: "unlinked", date: "2026-06-10", fieldIds: [fieldId], workName: "除草剤", material: material.name, memo: "UNLINKED-MARKER" });
state.mutate((d) => {
  d.meta.herbicideAssignments = ["used", "unused", "wrong-step"].map((id) => ({ assignmentId: id, fieldId, year: 2026, name: `program-${id}`, steps: [{ id: "step", materialId: id === "wrong-step" ? "other" : material.materialId }] }));
  d.meta.herbicideObservations = ["used", "unused", "wrong-step"].map((id) => ({ observationId: id, assignmentId: id, fieldId, date: "2026-07-01", status: `status-${id}`, memo: `observation-${id}` }));
  const work = d.fieldWorks.find((w) => w.workId === "w");
  work.herbicideLinks = ["used", "used", "wrong-step"].map((assignmentId) => ({ assignmentId, fieldId, stepId: "step" }));
});
const html = () => { screen.render(); return node("materialList").innerHTML; };
let output = html();
assert.match(output, /material-carte-work/);
assert.match(output, /purpose-marker/);
assert.match(output, /&lt;script&gt;memo-marker/);
assert.match(output, /関連する体系の観察/);
assert.match(output, /program-used/);
assert.match(output, /2kg/);
assert.match(output, /農薬登録情報（公式）/);
assert.equal((output.match(/observation-used/g) || []).length, 1);
for (const marker of ["OLD-MARKER", "UNLINKED-MARKER", "observation-unused", "observation-wrong-step", "製品情報は未取得"]) assert.ok(!output.includes(marker));
for (const value of ["javascript:alert(1)", "https://user:pass@example.com", { url: "https://example.com" }]) {
  state.mutate((d) => { d.materials.find((m) => m.materialId === material.materialId).productUrl = value; });
  assert.ok(!html().includes("メーカー登録URL"));
}
delete RiceOS.herbicide;
assert.match(html(), /関連する観察記録はありません/);
state.mutate((d) => { d.fieldWorks = []; });
assert.match(html(), /この年度の関連する使用実績はありません/);
console.log("PASS material carte: URL save/edit/cancel/import safety, season/ID matching, assignment observations, deduplication, optional herbicide module and empty states");
