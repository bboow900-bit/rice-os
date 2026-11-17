"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const memory = new Map(); let writes = 0, passed = 0;
const failIO = () => { throw Error("Annual sales must not write or fetch"); };
const c = vm.createContext({ console, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] }, fetch: failIO,
  localStorage: { getItem: key => memory.get(key) || null,
    setItem(key, value) { writes++; memory.set(key, String(value)); }, removeItem: failIO } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state", "harvest-ledger"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c, { filename: name + ".js" });
}
const R = c.RiceOS, S = R.state, L = R.harvestLedger;
assert(S.replace(R.schema.normalize({ varieties: [{ varietyId: "v", name: "Rice" }, { varietyId: "other", name: "Other" }],
  fields: [{ fieldId: "a", varietyId: "v" }, { fieldId: "b", varietyId: "other" }],
  varietyResults: [{ resultId: "legacy", season: 2026, varietyId: "v", salesAmount: "99999999" }],
  fieldWorks: [{ workId: "harvest-group", workName: "稲刈り", date: "2026-09-01", fieldIds: ["a", "b"], harvestReview: { yieldKg: "999999" } }] })));
c.localStorage.setItem = failIO;
const plain = value => JSON.parse(JSON.stringify(value));
const record = (shipmentId, patch = {}) => ({ shipmentId, date: "2026-10-01", season: 2026, kind: "sale", varietyId: "v", recipient: "Buyer",
  riceType: "brown", packages: [{ kg: 30, bags: 2 }], pricePer60Kg: 100, ...patch });
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function rows(records) { S.data().shipments = freeze(records); }
function read(year, ...unusedScope) {
  const before = JSON.stringify([S.data(), [...memory], writes]);
  const result = L.annualSales(year, ...unusedScope);
  assert.equal(JSON.stringify([S.data(), [...memory], writes]), before, "Pure read must preserve every record, memo, and stored byte");
  assert.deepEqual(Object.keys(result).sort(), ["pricedCount", "recordCount", "salesYen", "unpricedCount"]);
  assert.equal(result.recordCount, result.pricedCount + result.unpricedCount);
  return plain(result);
}
function test(name, run) { run(); passed++; console.log("PASS " + name); }
test("all varieties and recipients, missing/deleted varieties, group record counted once", () => {
  rows([
    record("group", { fieldIds: ["a", "b", "a"], batchFieldIds: ["a", "b", "a"], recipient: "Group buyer" }),
    record("other", { varietyId: "other", recipient: "Other buyer" }),
    record("deleted", { varietyId: "deleted-variety", recipient: "Deleted buyer" }),
    record("unclassified", { varietyId: "", recipient: "" }),
    record("white", { riceType: "white" }), record("unknown-type", { riceType: "", inventoryRiceTypeUnverified: true }),
    record("gift", { kind: "gift" }), record("household", { kind: "household" }),
    record("prior", { season: 2025 }), record("next", { season: 2027 }),
    record("shipment", { kind: "shipment", date: "2027-01-10" })
  ]);
  assert.deepEqual(read("2026"), { salesYen: 700, pricedCount: 7, unpricedCount: 0, recordCount: 7 });
  assert.deepEqual(read(2026, { fieldId: "a", varietyId: "v", recipient: "Buyer" }), read(2026));
  const varieties = S.varieties, variety = S.variety, stock = S.riceStockFor;
  S.varieties = S.variety = S.riceStockFor = failIO;
  try { assert.equal(read(2026).recordCount, 7); }
  finally { S.varieties = varieties; S.variety = variety; S.riceStockFor = stock; }
  const result = L.annualSales(2026); result.salesYen = -1;
  assert.equal(read(2026).salesYen, 700, "DTO is detached");
});
test("year filtering uses saved season, not shipment date or active crop year", () => {
  S.data().meta.activeCropYear = 2025;
  rows([record("cross-year", { date: "2027-02-01" }), record("calendar-only", { season: 2025, date: "2026-10-01" })]);
  assert.deepEqual(read(2026), { salesYen: 100, pricedCount: 1, unpricedCount: 0, recordCount: 1 });
  assert.equal(read(2025).salesYen, 100); assert.equal(read(2027).recordCount, 0);
});
test("invalid years never expand to all records", () => {
  rows([record("sale")]);
  for (const year of [undefined, null, "", "all", "2026x", " 2026 ", 2026.5, NaN, Infinity, true, [], {}, 1899, 2201]) {
    assert.deepEqual(read(year), { salesYen: 0, pricedCount: 0, unpricedCount: 0, recordCount: 0 });
  }
});
test("invalid years do not read shipment data; supported boundary years stay isolated", () => {
  const shipments = S.shipments;
  S.shipments = failIO;
  try { assert.deepEqual(read("all"), { salesYen: 0, pricedCount: 0, unpricedCount: 0, recordCount: 0 }); }
  finally { S.shipments = shipments; }
  rows([record("first-year", { season: 1900 }), record("last-year", { season: 2200 }), record("ordinary")]);
  assert.equal(read("1900").recordCount, 1); assert.equal(read(2200).recordCount, 1);
});
test("missing price or bag quantities are unpriced; zero price is priced", () => {
  const invalid = [record("missing-price", { pricePer60Kg: "" }), record("null-price", { pricePer60Kg: null }),
    record("bad-price", { pricePer60Kg: "bad" }), record("negative-price", { pricePer60Kg: -1 }),
    record("decimal-price", { pricePer60Kg: 1.5 }), record("bool-price", { pricePer60Kg: false }),
    record("empty-bags", { packages: [] }), record("missing-bags", { packages: undefined }),
    record("legacy", { packages: [], quantity: "60kg", amount: "5000" }),
    record("bad-kg", { packages: [{ kg: "30", bags: 2 }] }), record("zero-bags", { packages: [{ kg: 30, bags: 0 }] }),
    record("partial-package", { packages: [{ kg: 30, bags: 2 }, { kg: 30 }] })];
  rows([...invalid, record("zero", { pricePer60Kg: 0 }), record("zero-string", { pricePer60Kg: "0" })]);
  assert.deepEqual(read(2026), { salesYen: 0, pricedCount: 2, unpricedCount: invalid.length, recordCount: invalid.length + 2 });
});
test("round each record, never annual kg or package lines; match per-variety read", () => {
  rows([record("one", { packages: [{ kg: 30, bags: 1 }], pricePer60Kg: 1 }),
    record("two", { packages: [{ kg: 30, bags: 1 }], pricePer60Kg: "1" }),
    record("combined", { packages: [{ kg: 15, bags: 1 }, { kg: 15, bags: 1 }], pricePer60Kg: 1 })]);
  const before = JSON.stringify([S.data(), [...memory], writes]);
  assert.deepEqual(read(2026), { salesYen: 3, pricedCount: 3, unpricedCount: 0, recordCount: 3 });
  assert.equal(L.read(2026, "v").salesYen, 3);
  assert.equal(JSON.stringify([S.data(), [...memory], writes]), before);
});
test("annual sum overflow returns null while every individually priced record is counted", () => {
  const amount = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
  rows([record("first", { pricePer60Kg: amount }), record("second", { pricePer60Kg: amount }), record("zero", { pricePer60Kg: 0 })]);
  assert.deepEqual(read(2026), { salesYen: null, pricedCount: 3, unpricedCount: 0, recordCount: 3 });
  assert.equal(L.read(2026, "v").salesYen, null);
});
test("per-record money and quantity overflow return null, without changing legacy read semantics", () => {
  for (const patch of [{ packages: [{ kg: 120, bags: 1 }], pricePer60Kg: Number.MAX_SAFE_INTEGER },
    { packages: [{ kg: Number.MAX_VALUE, bags: 2 }] }]) {
    rows([record("overflow", patch)]);
    assert.deepEqual(read(2026), { salesYen: null, pricedCount: 0, unpricedCount: 1, recordCount: 1 });
    const previous = L.read(2026, "v");
    assert.equal(previous.salesYen, 0); assert.equal(previous.pricedCount, 0); assert.equal(previous.unpricedCount, 1);
    rows([record("valid"), record("overflow", patch), record("zero", { pricePer60Kg: 0 })]);
    assert.equal(read(2026).salesYen, null, "Overflow stays null after later records");
  }
});
test("gift/household and legacy result money never contributes, even with overflow", () => {
  rows([record("gift", { kind: "gift", pricePer60Kg: Number.MAX_SAFE_INTEGER, packages: [{ kg: 120, bags: 1 }] }), record("home", { kind: "household" })]);
  assert.deepEqual(read(2026), { salesYen: 0, pricedCount: 0, unpricedCount: 0, recordCount: 0 });
});
test("multiple sale records in one group remain separate transactions, never multiplied by field associations", () => {
  rows([record("first", { batchId: "group", fieldIds: ["a", "b"], pricePer60Kg: " 0 " }),
    record("second", { batchId: "group", fieldIds: ["a", "b"], pricePer60Kg: " 101 " })]);
  assert.deepEqual(read(2026), { salesYen: 101, pricedCount: 2, unpricedCount: 0, recordCount: 2 });
  const perVariety = L.read(2026, "v");
  assert.equal(perVariety.salesYen, 101); assert.equal(perVariety.pricedCount, 2);
});
console.log(`Harvest annual sales: ${passed} passed; isolated fixtures, no writes or fetches.`);
