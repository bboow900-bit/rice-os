"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const nodes = new Map();
const cards = new Map();
const memory = new Map();
let failWrites = false;
let confirmation = true;
let onSaved = null;

function element(id) {
  if (!nodes.has(id)) {
    const classes = new Set();
    let html = "";
    nodes.set(id, {
      value: "", textContent: "", dataset: {}, handlers: {},
      classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key),
        contains: (key) => classes.has(key), toggle(key, on) {
          if (on === undefined) on = !classes.has(key);
          if (on) classes.add(key); else classes.delete(key);
        } },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      scrollIntoView() {}, focus() {},
      set innerHTML(value) {
        html = value;
        if (["owFields", "owVarieties"].includes(id)) {
          cards.set(id, [...value.matchAll(/data-id="([^"]+)"/g)].map((match) => {
            let selected = false;
            return { dataset: { id: match[1] }, classList: {
              toggle(key, on) { selected = on === undefined ? !selected : on; },
              contains: () => selected
            } };
          }));
        }
      },
      get innerHTML() { return html; }
    });
  }
  return nodes.get(id);
}
function selectAll(selector) {
  const match = selector.match(/^#(owFields|owVarieties) \.select-card(\.selected)?$/);
  if (!match) return [];
  const rows = cards.get(match[1]) || [];
  return match[2] ? rows.filter((row) => row.classList.contains("selected")) : rows;
}
const context = vm.createContext({
  console, alert() {}, confirm: () => confirmation,
  dispatchEvent(event) { if (event.type === "riceos:datachange" && onSaved) onSaved(); },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
  document: { getElementById: element, querySelectorAll: selectAll,
    querySelector: (selector) => element(selector) },
  navigator: {}, localStorage: {
    getItem: (key) => memory.get(key) ?? null,
    setItem(key, value) { if (failWrites) throw new Error("Injected failure"); memory.set(key, String(value)); },
    removeItem: (key) => memory.delete(key)
  }
});
context.window = context;
context.scrollTo = () => {};
for (const file of ["utils", "schema", "storage", "state"]) {
  vm.runInContext(source(`assets/js/core/${file}.js`), context);
}
const { state, schema, utils: U } = context.RiceOS;
U.setOptions = (el, options, value) => { el.value = value; };
const dataSnapshot = () => JSON.stringify(state.data());
const storeSnapshot = () => JSON.stringify([...memory]);
function resetData() {
  assert(state.replace(schema.normalize({
    varieties: [{ varietyId: "v", name: "Variety" }],
    fields: [{ fieldId: "a", name: "A" }, { fieldId: "b", name: "B" },
      { fieldId: "retired", name: "Retired", status: "終了" }],
    otherWorks: ["old", "other"].map((otherWorkId) => ({ otherWorkId,
      date: "2026-03-01", workName: "種籾注文", varietyIds: ["v", "missing-variety"], relatedFieldIds: ["a", "retired"] })),
    fieldWorks: ["work", "other-work"].map((workId) => ({ workId,
      date: "2026-06-01", workName: "草刈り", fieldIds: ["a"] })),
    growthLogs: ["growth", "other-growth"].map((logId) => ({ logId,
      date: "2026-06-01", fieldId: "a", tillerCount: "12" }))
  })));
}
const selectedIds = (id) => selectAll(`#${id} .select-card.selected`).map((row) => row.dataset.id).sort();
vm.runInContext(source("assets/js/screens/other-work.js"), context);
const otherWork = context.RiceOS.screens.otherWork;
otherWork.bind();
resetData();
otherWork.render();
otherWork.editWork("old");
const before = dataSnapshot();
otherWork.render();
otherWork.render();
assert.equal(dataSnapshot(), before);
assert.deepEqual(selectedIds("owFields"), ["a", "retired"]);
assert.deepEqual(selectedIds("owVarieties"), ["missing-variety", "v"]);
element("owMemo").value = "Unsaved edit";
cards.get("owFields").find((row) => row.dataset.id === "a").classList.toggle("selected", false);
cards.get("owFields").find((row) => row.dataset.id === "b").classList.toggle("selected", true);
otherWork.render();
assert.deepEqual(selectedIds("owFields"), ["b", "retired"]);
assert.equal(element("owMemo").value, "Unsaved edit");
element("otherWorkForm").handlers.submit({ preventDefault() {} });
assert.deepEqual(Array.from(state.data().otherWorks.find((row) => row.otherWorkId === "old").relatedFieldIds).sort(), ["b", "retired"]);
assert.deepEqual(Array.from(state.data().otherWorks.find((row) => row.otherWorkId === "old").varietyIds).sort(), ["missing-variety", "v"]);
cards.get("owFields").find((row) => row.dataset.id === "b").classList.toggle("selected", true);
cards.get("owVarieties").find((row) => row.dataset.id === "v").classList.toggle("selected", true);
element("owMemo").value = "Unsaved new";
otherWork.render();
assert.equal(element("editOtherWorkId").value, "");
assert.deepEqual(selectedIds("owFields"), ["b"]);
assert.deepEqual(selectedIds("owVarieties"), ["v"]);
assert.equal(element("owMemo").value, "Unsaved new");
assert(!cards.get("owVarieties").some((row) => row.dataset.id === "missing-variety"));

function extractFunction(code, name) {
  const match = code.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`));
  assert(match, name);
  return match[0];
}
function installListHandler(file, hostId) {
  const code = source(file);
  const start = code.indexOf(`    U.$("${hostId}").addEventListener("click", (event) => {`);
  const stop = code.indexOf("\n    });", start);
  assert(start >= 0 && stop > start, hostId);
  // Use the production reset and list listener, with only unrelated rendering stubbed.
  const script = `(function () { const U = RiceOS.utils; const state = RiceOS.state;
    let workFormSession = 0, sourceScheduleId = '', headingSaveApproved = false, pendingScheduleId = '';
    function noop() {}
    const setTargetScope = noop, setWorker = noop, loadHerbicideWork = noop,
      loadHarvestReview = noop, renderMaterialPicker = noop, setSelectedFieldIds = noop,
      clearBulkFields = noop, closeHeadingConfirm = noop, renderChoiceControls = noop,
      renderPanicleEntryState = noop, renderPanicleTargets = noop, renderPaniclePanel = noop,
      renderTargetPanel = noop, invalidateWorkWeather = noop;
    ${extractFunction(code, "resetForm")}
    ${code.slice(start, stop + "\n    });".length)}
  })();`;
  vm.runInContext(script, context);
}
installListHandler("assets/js/screens/field-work.js", "fieldWorkList");
installListHandler("assets/js/screens/growth.js", "growthTimeline");

for (const config of [
  { host: "otherWorkList", selector: "[data-other-action]", action: "otherAction", edit: "editOtherWorkId", memo: "owMemo", id: "old", other: "other", collection: "otherWorks", key: "otherWorkId" },
  { host: "fieldWorkList", selector: "[data-work-action]", action: "workAction", edit: "editFieldWorkId", memo: "fwMemo", id: "work", other: "other-work", collection: "fieldWorks", key: "workId" },
  { host: "growthTimeline", selector: "[data-growth-action]", action: "growthAction", edit: "editGrowthId", memo: "gMemo", id: "growth", other: "other-growth", collection: "growthLogs", key: "logId" }
]) {
  function click(id) {
    element(config.host).handlers.click({ target: { closest: (selector) => selector === config.selector
      ? { dataset: { [config.action]: "delete", id } } : null } });
  }
  resetData();
  element(config.edit).value = config.id;
  element(config.memo).value = "Keep this draft";
  let beforeData = dataSnapshot(), beforeStore = storeSnapshot();
  confirmation = false;
  click(config.id);
  assert.equal(dataSnapshot(), beforeData);
  assert.equal(storeSnapshot(), beforeStore);
  assert.equal(element(config.edit).value, config.id);
  assert.equal(element(config.memo).value, "Keep this draft");
  confirmation = true;
  failWrites = true;
  try { click(config.id); } finally { failWrites = false; }
  assert.equal(dataSnapshot(), beforeData);
  assert.equal(storeSnapshot(), beforeStore);
  assert.equal(element(config.edit).value, config.id);
  assert.equal(element(config.memo).value, "Keep this draft");
  click(config.other);
  assert.equal(element(config.edit).value, config.id);
  assert.equal(element(config.memo).value, "Keep this draft");
  assert(state.data()[config.collection].some((row) => row[config.key] === config.id));
  let notifications = 0;
  onSaved = () => {
    notifications += 1;
    otherWork.render();
    assert.equal(element(config.edit).value, config.id, "Save notification renders before the deletion listener resets");
  };
  click(config.id);
  onSaved = null;
  assert.equal(notifications, 1);
  assert(!state.data()[config.collection].some((row) => row[config.key] === config.id));
  assert.equal(element(config.edit).value, "");
  assert.equal(element(config.memo).value, "");
  console.log(`PASS ${config.host}: cancel/failure/unrelated preserve draft; same-ID successful delete resets`);
}
console.log("PASS old other-work edit/new selections survive rerender without writes, including archived targets");
