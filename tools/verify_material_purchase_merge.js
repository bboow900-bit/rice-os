"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const memory = new Map();
const c = vm.createContext({ console, navigator: {}, document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) } });
c.window = c;
for (const name of ["utils", "schema", "storage"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/js/core", `${name}.js`), "utf8"), c);
const R = c.RiceOS;
R.utils.now = () => "2026-11-06T00:00:00Z";
const plain = value => JSON.parse(JSON.stringify(value));
const purchase = (id, quantity) => ({ purchaseId: id, date: "2026-11-01", season: 2026, quantity, unit: "bag", unitPrice: 0, totalAmount: "", memo: id });
const current = R.schema.normalize({ materials: [
  { materialId: "m", name: "Existing", remaining: "9", custom: { keep: true }, purchases: [purchase("p1", 1)] },
  { materialId: "legacy", name: "Legacy" }
], shipments: [{ shipmentId: "s", recipient: "Existing" }], meta: { custom: { keep: true } } });
const incoming = R.schema.normalize({ materials: [
  { materialId: "m", name: "Incoming", remaining: "99", purchases: [purchase("p1", 99), purchase("p2", 2)] },
  { materialId: "new", name: "New", purchases: [purchase("p3", 3)] }
], shipments: [{ shipmentId: "s", recipient: "Incoming" }, { shipmentId: "s2", recipient: "New" }], meta: { custom: { keep: false } } });
const before = JSON.stringify([current, incoming, [...memory]]);
const result = R.storage.mergeData(current, incoming);
assert.equal(JSON.stringify([current, incoming, [...memory]]), before);
const merged = result.data.materials.find(row => row.materialId === "m");
const base = current.materials.find(row => row.materialId === "m");
assert.deepEqual(plain(merged.purchases.map(row => row.purchaseId)), ["p1", "p2"]);
assert.deepEqual(plain(merged.purchases[0]), plain(base.purchases[0]));
assert.deepEqual(plain(merged.purchases[1]), plain(incoming.materials[0].purchases.find(row => row.purchaseId === "p2")));
const withoutPurchases = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "purchases"));
assert.deepEqual(plain(withoutPurchases(merged)), plain(withoutPurchases(base)));
assert.deepEqual(plain(result.data.meta.custom), plain(current.meta.custom));
assert.deepEqual(plain(result.data.shipments[0]), plain(current.shipments[0]));
assert.equal(result.data.shipments.length, 2);
assert.equal(result.added.materials, 1); assert.equal(result.skipped.materials, 1);
assert.equal(result.data.materials.find(row => row.materialId === "new").purchases[0].purchaseId, "p3");
const repeat = R.storage.mergeData(result.data, incoming);
assert.deepEqual(plain(repeat.data.materials), plain(result.data.materials));
const noIncomingHistory = R.storage.mergeData(current, { materials: [{ materialId: "m", name: "Ignored" }] });
assert.deepEqual(plain(noIncomingHistory.data.materials), plain(current.materials));
const emptyIncomingHistory = R.storage.mergeData(current, { materials: [{ materialId: "m", purchases: [] }] });
assert.deepEqual(plain(emptyIncomingHistory.data.materials), plain(current.materials));
const legacyMerge = R.storage.mergeData(current, { materials: [{ materialId: "legacy", purchases: [purchase("p4", 4)] }] });
assert.equal(legacyMerge.data.materials.find(row => row.materialId === "legacy").purchases[0].purchaseId, "p4");
assert.deepEqual(plain(R.schema.normalize(plain(result.data)).materials), plain(result.data.materials));
assert.throws(() => R.storage.mergeData(current, { materials: [{ materialId: "m", purchases: [purchase("duplicate", 1), purchase("duplicate", 2)] }] }));
// Merge has no deletion tombstones: an old JSON can restore a locally deleted purchase.
// Use replacement only with an explicit full-data restore decision, not as a merge deletion.
const deleted = plain(result.data);
deleted.materials.find(row => row.materialId === "m").purchases = [];
const recovered = R.storage.mergeData(deleted, result.data);
assert.deepEqual(plain(recovered.data.materials.find(row => row.materialId === "m").purchases), plain(merged.purchases));
console.log("material purchase merge PASS: existing priority, additions, repeat, legacy, isolation, JSON, deletion recovery");
