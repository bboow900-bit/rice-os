"use strict";

// Real modules, isolated VM and fake storage: never touches browser records.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let failWrites = false;
const context = vm.createContext({
  console, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: {
    getItem: key => memory.get(key) || null,
    setItem(key, value) {
      if (failWrites) throw new Error("Injected storage failure");
      memory.set(key, String(value));
    },
    removeItem: key => memory.delete(key)
  }
});
context.window = context;
function load(name) {
  const filename = path.resolve(__dirname, `../assets/js/core/${name}.js`);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
}
for (const name of ["utils", "schema", "storage", "state", "agro"]) load(name);
const { state, schema, utils, storage } = context.RiceOS;
const varietyId = state.varieties().find(v => v.name.includes("\u30b3\u30b7\u30d2\u30ab\u30ea")).varietyId;
function reset(extra = {}) {
  assert(state.replace(schema.normalize({
    fields: ["a", "b"].map(fieldId => ({ fieldId, name: fieldId, varietyId })),
    ...extra
  })));
}
const log = id => state.data().growthLogs.find(g => g.logId === id);
const candidate = id => state.data().confirmationCandidates.find(c => c.basisData.recordId === id);
function save(id, patch = {}) {
  assert(state.saveGrowthLog({ logId: id, fieldId: "a", date: "2026-07-01", ...log(id), ...patch }));
}
function actual(id, target) {
  const c = candidate(id);
  assert.equal(c.actualRecordId, target);
  assert.equal(c.actualDifferenceDays, target ? utils.daysBetween(c.periodStart, log(target).date) : "");
  if (c.status !== "dismissed") assert.equal(c.status, target ? "confirmed" : "active");
}
const snapshot = () => JSON.stringify(state.data());
function noop(action) {
  const before = snapshot();
  const persisted = JSON.stringify([...memory]);
  assert.equal(action(), null);
  assert.equal(snapshot(), before);
  assert.equal(JSON.stringify([...memory]), persisted);
}

reset();
save("p", { panicleLengthMm: "2" });
save("other", { fieldId: "b", panicleLengthMm: "5" });
const otherCandidate = JSON.stringify(candidate("other"));
const otherLog = JSON.stringify(log("other"));
save("p", { panicleLengthMm: "" });
assert.equal(candidate("p"), undefined);
assert(log("p"));
assert.equal(JSON.stringify(candidate("other")), otherCandidate);
assert.equal(JSON.stringify(log("other")), otherLog);

save("p", { panicleLengthMm: "2" });
const unrelated = { ...candidate("p"), candidateId: "unrelated", candidateType: "harvest" };
state.data().confirmationCandidates.push(unrelated);
const unrelatedBefore = JSON.stringify(unrelated);
save("p", { panicleLengthMm: "" });
assert.equal(JSON.stringify(state.data().confirmationCandidates.find(c => c.candidateId === "unrelated")), unrelatedBefore);
assert.equal(state.data().confirmationCandidates.some(c => c.candidateType === "heading" && c.basisData.recordId === "p"), false);
assert(state.replace({ ...state.data(), confirmationCandidates: state.data().confirmationCandidates.filter(c => c.candidateId !== "unrelated") }));

save("p", { panicleLengthMm: "2" });
const identity = candidate("p").candidateId;
const created = candidate("p").createdAt;
save("h", { fieldId: "b", date: "2027-07-25", headingObserved: true });
save("p", { fieldId: "b", date: "2027-07-02", panicleLengthMm: "5" });
assert.equal(candidate("p").candidateId, identity);
assert.equal(candidate("p").createdAt, created);
assert.equal(candidate("p").fieldId, "b");
assert.equal(candidate("p").season, 2027);
assert.equal(state.data().confirmationCandidates.filter(c => c.basisData.recordId === "p").length, 1);
actual("p", "h");
save("p", { date: "2027-07-04" });
actual("p", "h");
save("h", { date: "2027-07-26" });
actual("p", "h");
save("h", { headingObserved: false, observedStage: "heading", stageConfirmed: true });
actual("p", "");
save("h", { headingObserved: true });
save("h", { fieldId: "a" });
actual("p", "");
save("h", { fieldId: "b" });
actual("p", "h");
save("h", { date: "2028-07-26" });
actual("p", "");

reset();
save("p", { panicleLengthMm: "2", headingObserved: true });
actual("p", "p");
save("p", { headingObserved: false });
actual("p", "");
const unsupported = state.varieties().find(v => !v.name.includes("\u30b3\u30b7\u30d2\u30ab\u30ea"));
assert(unsupported);
assert(state.updateField("b", { varietyId: unsupported.varietyId }));
save("p", { fieldId: "b" });
assert.equal(candidate("p"), undefined);
assert.equal(log("p").panicleLengthMm, "2");

// Imported nonheading candidates may share growth record links. Neither saving
// nor deleting those records owns their status, evidence, or actual links.
for (const mode of ["withdraw", "redate", "move", "clear", "delete"]) {
  reset();
  save("p", { panicleLengthMm: "2", headingObserved: true });
  const draft = JSON.parse(snapshot());
  const base = candidate("p");
  draft.confirmationCandidates.push(
    { ...base, candidateId: "imported-harvest", candidateType: "harvest", basisData: { recordId: "other-source" }, actualRecordId: "p", actualDifferenceDays: 37 },
    { ...base, candidateId: "imported-fertilizer", candidateType: "fertilizer", status: "dismissed", basisData: { recordId: "p" }, actualRecordId: "", actualDifferenceDays: "" }
  );
  assert(state.replace(draft));
  const nonheading = data => JSON.stringify(data.confirmationCandidates.filter(c => c.candidateType !== "heading"));
  const before = nonheading(state.data());
  assert.equal(JSON.parse(before).length, 2);
  if (mode === "delete") assert(state.deleteGrowthLog("p"));
  else save("p", mode === "withdraw" ? { headingObserved: false }
    : mode === "redate" ? { date: "2026-07-03" }
      : mode === "move" ? { fieldId: "b" } : { panicleLengthMm: "" });
  assert.equal(nonheading(state.data()), before, `${mode}: nonheading candidates changed`);
  assert.equal(nonheading(storage.loadData()), before, `${mode}: persisted nonheading candidates changed`);
}

// Imported history can contain multiple explicit observations; corrections and
// deletion use the same fallback and must leave every other source log intact.
for (const mode of ["withdraw", "move", "year", "delete"]) {
  reset();
  save("p", { panicleLengthMm: "2" });
  save("h", { headingObserved: true, date: "2026-07-25" });
  const draft = JSON.parse(snapshot());
  draft.growthLogs.push({ ...log("h"), logId: "fallback", date: "2026-07-23" });
  assert(state.replace(draft));
  const fallback = JSON.stringify(log("fallback"));
  if (mode === "delete") assert(state.deleteGrowthLog("h"));
  else save("h", mode === "withdraw" ? { headingObserved: false }
    : mode === "move" ? { fieldId: "b" } : { date: "2027-07-25" });
  actual("p", "fallback");
  assert.equal(JSON.stringify(log("fallback")), fallback);
}

reset();
save("p", { panicleLengthMm: "2" });
candidate("p").status = "dismissed";
save("p", { date: "2026-07-03" });
assert.equal(candidate("p").status, "dismissed");
save("h", { headingObserved: true });
assert.equal(candidate("p").status, "dismissed");
actual("p", "h");
save("h", { headingObserved: false });
assert.equal(candidate("p").status, "dismissed");
actual("p", "");

// A partial selection in a batch leaves unselected records/candidates unchanged.
save("other", { fieldId: "b", panicleLengthMm: "5" });
const untouched = JSON.stringify({ log: log("other"), candidate: candidate("other") });
assert(state.saveGrowthLogsBatch([null, { ...log("p"), panicleLengthMm: "" }, { ...log("h"), headingObserved: true }]));
assert.equal(candidate("p"), undefined);
assert.equal(JSON.stringify({ log: log("other"), candidate: candidate("other") }), untouched);
noop(() => state.saveGrowthLogsBatch([]));
noop(() => state.saveGrowthLogsBatch([{ ...log("other"), panicleLengthMm: "" }, { fieldId: "missing" }]));
noop(() => state.saveGrowthLog({ fieldId: "a", date: "2026-07-02", headingObserved: true }));
failWrites = true;
noop(() => state.saveGrowthLogsBatch([{ ...log("other"), panicleLengthMm: "" }, { ...log("h"), headingObserved: false }]));
failWrites = false;
assert(state.lastSaveError());
assert(state.saveGrowthLog({ ...log("other"), date: "2026-07-04" }));
const persisted = JSON.stringify(storage.loadData().confirmationCandidates);
assert.equal(persisted, JSON.stringify(state.data().confirmationCandidates));
load("state");
assert.equal(JSON.stringify(context.RiceOS.state.data().confirmationCandidates), persisted);
console.log("PASS growth candidate corrections: clearing, moving, redating, fallback, dismissal, batch, rollback and persistence");
