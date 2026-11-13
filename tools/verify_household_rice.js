"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const memory = new Map(); let writes = 0, fail = false;
const host = { innerHTML: "" };
const c = vm.createContext({ console, Blob, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: id => id === "harvestLedgerContent" ? host : null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k, v) { if (fail) throw Error("failure"); writes++; memory.set(k, String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
const load = name => vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js", name), "utf8"), c);
for (const name of ["utils", "schema", "storage", "state", "harvest-ledger"]) load(`core/${name}.js`);
const R = c.RiceOS, S = R.state, L = R.harvestLedger;
R.utils.today = () => "2026-10-20"; R.utils.now = () => "2026-10-20T00:00:00Z";
const raw = () => JSON.stringify([S.data(), [...memory], writes]);
const plain = value => JSON.parse(JSON.stringify(value));
const reject = fn => { const before = raw(); assert.equal(fn(), null); assert.equal(raw(), before); };
assert(S.replace(R.schema.normalize({ varieties: [{ varietyId: "v", name: "Rice" }, { varietyId: "x", name: "Other" }],
  fields: [{ fieldId: "a", varietyId: "v", areaA: 100 }], fieldWorks: [{ workId: "work", date: "2026-09-01", fieldIds: ["a"], workName: "Existing" }],
  varietyResults: [{ resultId: "legacy", season: 2026, varietyId: "v", yield: "99999", salesAmount: "99999", custom: "keep" }],
  shipments: [{ shipmentId: "legacy-ship", date: "2026-10-01", season: 2025, recipient: "Family", kind: "gift", quantity: "handwritten", amount: "123", custom: { keep: true } }], meta: { custom: "keep" } })));
const old = JSON.stringify([S.data().fieldWorks, S.data().varietyResults, S.shipments()[0]]);
assert(S.saveMillingRecord({ season: 2026, varietyId: "v", date: "2026-10-01", fieldIds: ["a"], packages: [{ kg: 30, bags: 100 }], looseKg: 0 }));
const performance = JSON.stringify(S.harvestPerformanceFor(2026));
const input = { date: "2027-01-05", season: 2026, varietyId: "v", kind: "household", recipient: "自家用", riceType: "brown", packages: [{ kg: 30, bags: 4 }], pricePer60Kg: "", custom: { keep: true } };
const household = S.saveShipment(input); assert(household); assert.equal(household.kind, "household");
assert.equal(household.pricePer60Kg, ""); assert.equal(L.read(2026, "v").householdKg, 120);
assert.equal(S.riceStockFor(2026, "v").receivedKg, 3000); assert.equal(S.riceStockFor(2026, "v").dispatchedKg, 120);
assert.equal(S.riceStockFor(2026, "v").remainingKg, 2880); assert.equal(L.read(2026, "v").giftKg, 0);
assert.equal(L.read(2026, "v").outgoingKg, 0); assert.equal(L.read(2026, "v").pricedCount, 0); assert.equal(L.read(2026, "v").unpricedCount, 0);
assert.equal(S.cropYearClosureFor(2026).counts.shipments, 0); reject(() => S.closeCropYear(2026));
assert.equal(S.cropYearSettlementFor(2026).quantity.dispatchedKg, 120); assert.equal(S.cropYearSettlementFor(2026).sales.amountYen, null);
for (const varietyId of ["", " ", null, undefined, 0, {}]) reject(() => S.saveShipment({ ...input, varietyId }));
const anonymous = S.saveShipment({ ...input, recipient: "", packages: [{ kg: 30, bags: 1 }] }); assert(anonymous);
assert.equal(L.read(2026, "v").history.find(row => row.id === anonymous.shipmentId).label, "自家用"); assert(S.deleteShipment(anonymous.shipmentId));
const rateKept = S.saveShipment({ shipmentId: household.shipmentId, pricePer60Kg: 24000, grade: "old grade", destinationName: "old destination" }); assert(rateKept);
assert.equal(rateKept.pricePer60Kg, 24000); assert.equal(L.read(2026, "v").pricedCount, 0); assert.equal(L.read(2026, "v").salesYen, 0);
assert.equal(S.cropYearSettlementFor(2026).sales.pricedCount, 0);
assert(S.saveShipment({ shipmentId: household.shipmentId, pricePer60Kg: "", memo: "edited" }));
assert.equal(S.shipments().find(row => row.shipmentId === household.shipmentId).grade, "old grade");
assert.equal(S.riceStockFor(2026, "v").remainingKg, 2880);
const gift = S.saveShipment({ ...input, kind: "gift", recipient: "Friend", packages: [{ kg: 30, bags: 2 }] }); assert(gift);
const sale = S.saveShipment({ ...input, kind: "sale", recipient: "Buyer", packages: [{ kg: 30, bags: 10 }], pricePer60Kg: 24000 }); assert(sale);
assert.equal(L.read(2026, "v").householdKg, 120); assert.equal(L.read(2026, "v").giftKg, 60); assert.equal(L.read(2026, "v").outgoingKg, 300);
assert.equal(L.read(2026, "v").salesYen, 120000); assert.equal(L.read(2026, "v").unpricedCount, 0);
assert.equal(S.cropYearClosureFor(2026).shipmentsCount, 2);
assert(S.closeCropYear(2026)); const fingerprint = S.cropYearSettlementFor(2026).fingerprint;
assert.equal(S.cropYearClosureFor(2026).settlementChanged, false);
assert(S.saveShipment({ shipmentId: household.shipmentId, packages: [{ kg: 30, bags: 5 }] }));
assert.notEqual(S.cropYearSettlementFor(2026).fingerprint, fingerprint); assert.equal(S.cropYearClosureFor(2026).settlementChanged, true);
assert.equal(S.cropYearSettlementFor(2026).quantity.remainingKg, 2490); assert.equal(S.cropYearSettlementFor(2026).sales.amountYen, 120000);
assert(S.saveShipment({ ...input, riceType: "white" }));
assert.equal(S.riceStockFor(2026, "v").remainingKg, 2490); assert.equal(S.riceStockFor(2026, "v").whiteShipmentCount, 1);
assert(S.saveShipment({ ...input, season: 2025 })); assert(S.saveShipment({ ...input, varietyId: "x" }));
assert.equal(L.read(2025, "v").householdKg, 120); assert.equal(L.read(2026, "x").householdKg, 120);
assert.equal(L.read(2027, "v").householdKg, 0); assert.equal(S.riceStockFor(2026, "v").remainingKg, 2490);
assert.equal(JSON.stringify(S.harvestPerformanceFor(2026)), performance);
assert.equal(JSON.stringify([S.data().fieldWorks, S.data().varietyResults, S.shipments()[0]]), old);
const beforeRead = raw(); const copy = L.read(2026, "v"); copy.stock.remainingKg = 999; copy.history.pop(); L.scopes();
load("screens/harvest-ledger.js"); R.screens.harvestLedger.setScope({ season: 2026, varietyId: "v" });
assert.match(host.innerHTML, /<dt>自家用<\/dt><dd data-harvest-ledger-household><strong>2\.5<\/strong>/);
assert.match(host.innerHTML, /お米の行き先を登録/); assert.equal(raw(), beforeRead);
fail = true; reject(() => S.saveShipment({ ...input, memo: "fail" })); reject(() => S.deleteShipment(household.shipmentId)); fail = false;
const all = plain(S.data()); let exported;
R.utils.download = (filename, text) => { exported = JSON.parse(text); }; R.storage.exportJson(S.data());
assert.deepEqual(exported.shipments, all.shipments); assert.deepEqual(plain(R.schema.normalize(exported).shipments), all.shipments);
const imported = R.storage.importJsonText(JSON.stringify(exported)); assert(imported); assert.deepEqual(plain(imported.shipments), all.shipments);
const merge = R.storage.mergeData(all, exported); assert.equal(merge.added.shipments, 0); assert.deepEqual(plain(merge.data.shipments), all.shipments);
assert(S.replace(all)); assert.deepEqual(plain(S.shipments()), all.shipments);
// Non-strict imported household records remain readable but never invent an allocation.
assert(S.replace({ ...all, shipments: [...all.shipments, { shipmentId: "unknown-household", ...input, varietyId: "", custom: "legacy" },
  { shipmentId: "bad-household", ...input, packages: [{ kg: 30, bags: "bad" }] },
  { shipmentId: "unknown-type", ...input, riceType: "unknown" }] }));
const stock = S.riceStockFor(2026, "v"); assert.equal(stock.remainingKg, 2490); assert.equal(stock.unclassifiedCount, 1); assert.equal(stock.unquantifiedCount, 2);
assert.equal(S.cropYearSettlementFor(2026).quantity.dispatchedKg, null);
assert.equal(S.shipments().find(row => row.shipmentId === "unknown-household").kind, "household");
assert.equal(S.shipments().find(row => row.shipmentId === "unknown-household").custom, "legacy");
assert(S.replace(all)); const previous = S.riceStockFor(2026, "v").remainingKg; assert(S.deleteShipment(household.shipmentId));
assert.equal(S.riceStockFor(2026, "v").remainingKg, previous + 150); assert.equal(L.read(2026, "v").householdKg, 0);
console.log("household rice PASS: normalization, legacy preservation, stock, separate gift/sales, edits/delete, white/invalid exclusions, cross-year, yield, closure gate/fingerprint, JSON import/export/merge, rollback and read-only UI");
