"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const plain = value => JSON.parse(JSON.stringify(value));

function environment() {
  const memory = new Map(), control = { failKey: null }, downloads = [];
  const context = vm.createContext({ Blob, console, alert() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent() {}, localStorage: {
      getItem: key => memory.get(key) ?? null,
      setItem(key, value) { if (control.failKey === key) throw Error("Injected storage failure"); memory.set(key, String(value)); },
      removeItem: key => memory.delete(key)
    } });
  context.window = context;
  for (const name of ["utils", "schema", "storage", "state", "material-stock"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/core", name + ".js"), "utf8"), context, { filename: name + ".js" });
  }
  const R = context.RiceOS;
  let sequence = 0;
  R.utils.today = () => "2026-11-08";
  R.utils.now = () => "2026-11-08T12:00:00Z";
  R.utils.id = prefix => prefix + "_qa_" + ++sequence;
  R.utils.download = (...args) => downloads.push(args);
  return { R, memory, control, downloads };
}

const { R, memory, control, downloads } = environment();
const S = R.state, stock = R.materialStock, schema = R.schema, storage = R.storage;
const input = extra => ({ date: "2026-11-01", quantity: "0", unit: "kg", memo: "count", ...extra });
const purchase = (id, quantity) => ({ purchaseId: id, date: "2026-11-02", season: 2026, quantity, unit: "kg", futurePurchase: { keep: true } });
const material = () => S.data().materials.find(row => row.materialId === id);
const raw = () => memory.get(schema.STORE_KEY);
const snapshot = () => ({ cache: plain(S.data()), raw: raw(), quantity: stock.summary(id).quantity });
function unchanged(before) {
  assert.deepEqual(plain(S.data()), before.cache);
  assert.equal(raw(), before.raw);
  assert.equal(stock.summary(id).quantity, before.quantity);
}

// New master and its initial physical count are one real state/storage mutation.
const record = { materialId: "", name: "QA stock", unit: "kg", remaining: "999", futureMaterial: { keep: true } };
const beforePrepare = raw();
const row = stock.prepareStocktake(record, input());
row.futureStocktake = { keep: true };
row.snapshot.futureSnapshot = { keep: true };
row.snapshot.usage.push({ id: "historic-work", date: row.date, quantity: null, unit: "", futureEntry: { keep: true } });
assert.equal(raw(), beforePrepare);
assert.equal(S.data().materials.length, 0);
assert.ok(S.saveMaterial({ ...record, stocktakes: [row] }));
const id = S.data().materials[0].materialId;
assert.ok(id);
assert.equal(stock.summary(id).quantity, 0);
assert.equal(stock.summary(id).exact, true);
assert.equal(material().remaining, "999");

assert.ok(S.saveMaterial({ materialId: id, purchases: [purchase("p1", 2)] }));
assert.equal(stock.summary(id).quantity, 2);
const exported = storage.exportJson(S.data());
assert.equal(downloads.length, 1);
const json = downloads[0][1];
assert.deepEqual(JSON.parse(json), plain(exported));
assert.equal(storage.inspectJsonText(json, S.data()).ok, true);
assert.deepEqual(plain(schema.normalize(JSON.parse(json)).materials), plain(S.data().materials));
assert.ok(S.replace(JSON.parse(json)));
assert.deepEqual(plain(material().stocktakes[0]), plain(row));
assert.deepEqual(plain(material().futureMaterial), { keep: true });
assert.deepEqual(plain(material().purchases[0].futurePurchase), { keep: true });
const importedEnvironment = environment();
importedEnvironment.R.storage.importJsonText(json);
assert.deepEqual(plain(importedEnvironment.R.storage.loadData().materials), plain(S.data().materials));

const current = plain(S.data());
const incoming = { materials: [{ ...plain(material()), name: "Must not overwrite", remaining: "888",
  purchases: [purchase("p1", 99), purchase("p2", 3)],
  stocktakes: [{ ...plain(row), quantity: 99 }, { ...plain(row), stocktakeId: "s2", quantity: 4 }]
}, { materialId: "new-master", name: "Incoming master", unit: "kg", stocktakes: [{ ...plain(row), stocktakeId: "new-s" }] }] };
const inputsBefore = JSON.stringify([current, incoming]), memoryBefore = JSON.stringify([...memory]);
const merged = storage.mergeData(current, incoming);
assert.equal(JSON.stringify([current, incoming]), inputsBefore);
assert.equal(JSON.stringify([...memory]), memoryBefore);
const result = merged.data.materials.find(m => m.materialId === id);
assert.equal(result.name, material().name);
assert.equal(result.remaining, "999");
assert.deepEqual(plain(result.futureMaterial), { keep: true });
assert.deepEqual(plain(result.stocktakes.map(r => r.stocktakeId)), [row.stocktakeId, "s2"]);
assert.deepEqual(plain(result.stocktakes[0]), plain(row));
assert.deepEqual(plain(result.purchases.map(r => r.purchaseId)), ["p1", "p2"]);
assert.deepEqual(plain(result.purchases[0]), plain(material().purchases[0]));
assert.equal(merged.data.materials.find(m => m.materialId === "new-master").stocktakes[0].stocktakeId, "new-s");
assert.deepEqual(plain(storage.mergeData(merged.data, incoming).data), plain(merged.data));
assert.ok(S.replace(merged.data));
assert.deepEqual(plain(schema.normalize(JSON.parse(JSON.stringify(S.data()))).materials), plain(S.data().materials));

// Each rejection must leave both the committed JSON and state cache untouched.
const badRows = [null, { ...row, stocktakeId: "" }, { ...row, date: "2026-02-30" },
  { ...row, quantity: -1 }, { ...row, quantity: NaN }, { ...row, quantity: Infinity },
  { ...row, quantity: "0" }, { ...row, quantity: Number.MAX_SAFE_INTEGER + 1 },
  { ...row, unit: " " }, { ...row, createdAt: "bad" }, { ...row, deletedAt: "bad" },
  { ...row, supersedesId: "" }, { ...row, snapshot: null },
  { ...row, snapshot: { purchases: [], usage: null } }];
const entry = { id: "w", date: row.date, quantity: null, unit: "" };
for (const badEntry of [null, { ...entry, id: "" }, { ...entry, date: "2026-11-02" },
  { ...entry, quantity: -1 }, { ...entry, quantity: "0" }, { ...entry, unit: null }]) {
  badRows.push({ ...row, snapshot: { purchases: [], usage: [badEntry] } });
}
badRows.push({ ...row, snapshot: { purchases: [entry, entry], usage: [] } });
badRows.push({ ...row, snapshot: { purchases: [], usage: [entry, entry] } });
const badLists = [null, {}, ...badRows.map(r => [r]), [row, row]];
for (const stocktakes of badLists) {
  const before = snapshot();
  const candidate = plain(S.data());
  candidate.materials.find(m => m.materialId === id).stocktakes = stocktakes;
  assert.throws(() => schema.normalize(candidate));
  assert.equal(S.saveMaterial({ materialId: id, stocktakes }), null);
  assert.equal(S.replace(candidate), null);
  assert.throws(() => storage.mergeData(S.data(), candidate));
  unchanged(before);
}
for (const quantity of ["", "bad", -1, Infinity, true]) {
  const before = snapshot();
  assert.throws(() => stock.prepareStocktake(record, input({ quantity })));
  unchanged(before);
}
let before = snapshot();
assert.equal(S.saveMaterial({ materialId: id, unit: "g" }), null);
unchanged(before);
assert.ok(S.saveMaterial({ name: "Stocktake only", unit: "kg", stocktakes: [{ ...plain(row), stocktakeId: "only" }] }));
const only = S.data().materials.find(m => m.name === "Stocktake only");
assert.equal(only.purchases, undefined);
before = snapshot();
assert.equal(S.deleteMaterial(only.materialId), null);
unchanged(before);

for (const key of [schema.BACKUP_KEY, schema.STORE_KEY]) {
  before = snapshot();
  control.failKey = key;
  assert.equal(stock.saveStocktake(id, input({ quantity: 7 })), null);
  assert.ok(stock.lastError());
  unchanged(before);
  assert.equal(stock.editStocktake(id, row.stocktakeId, input({ quantity: 8 })), null);
  unchanged(before);
  assert.equal(stock.deleteStocktake(id, row.stocktakeId), null);
  unchanged(before);
  const initial = stock.prepareStocktake(record, input());
  assert.equal(S.saveMaterial({ ...record, name: "Failed new master", stocktakes: [initial] }), null);
  unchanged(before);
  control.failKey = null;
}
assert.equal(stock.saveStocktake(id, input({ quantity: 7 }))?.quantity, 7);

// Valid schema alone must not authorize rewriting committed stocktake history.
function rejectHistoryChange(change) {
  const before = snapshot();
  const rows = plain(material().stocktakes);
  change(rows);
  assert.doesNotThrow(() => schema.normalize({ materials: [{ ...plain(material()), stocktakes: rows }] }));
  assert.equal(S.saveMaterial({ materialId: id, stocktakes: rows }), null);
  assert.match(S.lastSaveError().message, /上書き/);
  unchanged(before);
}
rejectHistoryChange(rows => { rows.length = 0; });
rejectHistoryChange(rows => { rows.splice(0, 1); });
for (const [key, value] of Object.entries({ quantity: 123, memo: "overwrite", createdAt: "2026-11-07T00:00:00Z", stocktakeId: "replacement-id" })) {
  rejectHistoryChange(rows => { rows[0][key] = value; });
}
rejectHistoryChange(rows => {
  rows[0].date = "2026-11-02";
  for (const entries of [rows[0].snapshot.purchases, rows[0].snapshot.usage]) entries.forEach(entry => { entry.date = rows[0].date; });
});
rejectHistoryChange(rows => { rows[0].snapshot.usage[0].quantity = 3; });
rejectHistoryChange(rows => { rows[0].futureStocktake.keep = false; });
rejectHistoryChange(rows => { delete rows[0].futureStocktake; });

const historyBeforeEdit = plain(material().stocktakes);
const correction = stock.editStocktake(id, row.stocktakeId, input({ quantity: 8 }));
assert.ok(correction);
assert.notEqual(correction.stocktakeId, row.stocktakeId);
assert.equal(correction.supersedesId, row.stocktakeId);
assert.deepEqual(plain(material().stocktakes.slice(0, -1)), historyBeforeEdit);
assert.deepEqual(plain(material().stocktakes.at(-1)), plain(correction));
const historyBeforeCancel = plain(material().stocktakes);
const cancelled = stock.deleteStocktake(id, correction.stocktakeId);
assert.ok(cancelled?.deletedAt);
const expectedCancellation = historyBeforeCancel.map(r => r.stocktakeId === correction.stocktakeId ? { ...r, deletedAt: cancelled.deletedAt } : r);
assert.deepEqual(plain(material().stocktakes), expectedCancellation);
rejectHistoryChange(rows => { delete rows.find(r => r.stocktakeId === correction.stocktakeId).deletedAt; });
rejectHistoryChange(rows => { rows.find(r => r.stocktakeId === correction.stocktakeId).deletedAt = "2026-11-08T13:00:00Z"; });
rejectHistoryChange(rows => { rows.splice(rows.findIndex(r => r.stocktakeId === correction.stocktakeId), 1); });
before = snapshot();
assert.equal(stock.deleteStocktake(id, correction.stocktakeId), null);
unchanged(before);
assert.ok(S.saveMaterial({ materialId: id, name: "Rename without history payload" }));
assert.deepEqual(plain(material().stocktakes), expectedCancellation);
assert.ok(S.saveMaterial({ materialId: id, stocktakes: plain(material().stocktakes) }));
const legacyRow = plain(row);
delete legacyRow.sequence;
for (const candidateRow of [legacyRow, { ...legacyRow, sequence: 0 }, { ...legacyRow, sequence: Number.MAX_SAFE_INTEGER }]) {
  const normalized = schema.normalize({ materials: [{ name: "Schema contract", unit: " kg ", stocktakes: [candidateRow] }] });
  assert.deepEqual(plain(normalized.materials[0].stocktakes[0]), candidateRow);
}
const invalidContracts = [
  ...[-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "0", null, true].map(sequence => ({ ...legacyRow, sequence })),
  { ...legacyRow, unit: "g" },
  { ...legacyRow, supersedesId: legacyRow.stocktakeId }
];
for (const invalidRow of invalidContracts) {
  const before = snapshot();
  const candidate = { materials: [{ name: "Invalid schema contract", unit: "kg", stocktakes: [invalidRow] }] };
  assert.throws(() => schema.normalize(candidate));
  assert.equal(S.saveMaterial(candidate.materials[0]), null);
  assert.equal(S.replace(candidate), null);
  assert.throws(() => storage.mergeData(S.data(), candidate));
  unchanged(before);
}
for (const omitted of [{ stocktakes: undefined }, { purchases: undefined }, { stocktakes: undefined, purchases: undefined }]) {
  const before = snapshot();
  const histories = plain({ stocktakes: material().stocktakes, purchases: material().purchases });
  assert.ok(S.saveMaterial({ materialId: id, ...omitted }));
  assert.deepEqual(plain({ stocktakes: material().stocktakes, purchases: material().purchases }), histories);
  assert.equal(stock.summary(id).quantity, before.quantity);
  const committed = JSON.parse(raw()).materials.find(m => m.materialId === id);
  assert.deepEqual({ stocktakes: committed.stocktakes, purchases: committed.purchases }, histories);
}

// Snapshot provenance may predate its anchor, but must never postdate it.
const pastSnapshot = { ...plain(legacyRow), stocktakeId: "past-snapshot", snapshot: {
  purchases: [{ id: "past-p", date: "2026-10-30", quantity: 2, unit: "kg", futureEntry: { keep: true } }],
  usage: [{ id: "past-w", date: "2025-12-31", quantity: null, unit: "" }]
} };
const pastMaterial = { materialId: "past-master", name: "Past snapshot", unit: "kg", stocktakes: [pastSnapshot] };
assert.deepEqual(plain(schema.normalize({ materials: [pastMaterial] }).materials[0].stocktakes[0]), pastSnapshot);
assert.ok(S.saveMaterial({ ...pastMaterial, materialId: "" }));
pastMaterial.materialId = S.data().materials.find(m => m.name === pastMaterial.name).materialId;
const pastJson = JSON.stringify(S.data());
assert.equal(storage.inspectJsonText(pastJson, S.data()).ok, true);
assert.ok(S.replace(JSON.parse(pastJson)));
assert.deepEqual(plain(S.data().materials.find(m => m.materialId === pastMaterial.materialId).stocktakes[0]), pastSnapshot);
const pastMerged = storage.mergeData(S.data(), { materials: [pastMaterial] });
assert.deepEqual(plain(pastMerged.data.materials), plain(S.data().materials));
for (const key of ["purchases", "usage"]) {
  const before = snapshot();
  const futureSnapshot = plain(pastSnapshot);
  futureSnapshot.snapshot[key][0].date = "2026-11-02";
  const candidate = { materials: [{ ...pastMaterial, stocktakes: [futureSnapshot] }] };
  assert.throws(() => schema.normalize(candidate));
  assert.equal(S.saveMaterial(candidate.materials[0]), null);
  assert.equal(S.replace(candidate), null);
  assert.throws(() => storage.mergeData(S.data(), candidate));
  assert.equal(storage.inspectJsonText(JSON.stringify(candidate), S.data()).ok, false);
  unchanged(before);
}
console.log("PASS real VM material stock/storage: atomic initial count, zero, JSON export/import, independent merge IDs, existing priority, idempotence, unknown fields, invalid rows/snapshots, guards, failed-write rollback, immutable history, append correction, irreversible tombstone, optional safe sequence, strict unit, no self-supersession, undefined omission, past snapshot compatibility and future rejection");
