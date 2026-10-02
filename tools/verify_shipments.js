"use strict";

// The ledger runs only against isolated memory, never browser/user storage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const plain = (value) => JSON.parse(JSON.stringify(value));
const date = "2027-01-15";

function fixture(extra = {}) {
  const memory = new Map();
  const events = [];
  const control = { failWrites: false, writes: 0, download: null };
  const context = vm.createContext({
    Blob,
    alert() {},
    CustomEvent: class { constructor(type, init) { this.detail = init.detail; } },
    dispatchEvent: (event) => events.push(event.detail),
    localStorage: {
      getItem: (key) => memory.has(key) ? memory.get(key) : null,
      setItem(key, value) {
        control.writes += 1;
        if (control.failWrites) throw new Error("Storage unavailable");
        memory.set(key, String(value));
      }
    }
  });
  context.window = context;
  const load = (file) => vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../assets/js/core/${file}.js`), "utf8"), context);
  load("utils");
  load("schema");
  const S = context.RiceOS.schema;
  memory.set(S.STORE_KEY, JSON.stringify(S.normalize({
    appVersion: S.APP_VERSION,
    fields: [{ fieldId: "field", name: "Existing field", plantingDate: "2026-05-01" }],
    fieldWorks: [{ workId: "work", date: "2026-09-20", fieldIds: ["field"], workName: "Existing harvest", hours: "2" }],
    varietyResults: [{ resultId: "result", season: 2026, yield: "300", shippedQuantity: "150", salesAmount: "12345" }],
    otherWorks: [{ otherWorkId: "other", date: "2026-09-20", workName: "Existing office work" }],
    meta: { customLedgerMetadata: { keep: "unchanged" } },
    ...extra
  })));
  load("storage");
  load("state");
  context.RiceOS.utils.download = (filename, raw, mime) => { control.download = { filename, raw, mime }; };
  return { S, state: context.RiceOS.state, storage: context.RiceOS.storage, memory, events, control };
}

const valid = (extra = {}) => ({
  date, season: 2026, kind: "shipment", recipient: "  Rice buyer  ",
  varietyId: "", riceType: "brown", packages: [{ kg: 30, bags: 2 }, { kg: 5, bags: 1 }],
  memo: "Stored crop from the previous year", ...extra
});

{
  const f = fixture();
  const legacy = f.S.normalizeShipment({shipmentId: "zero-legacy", quantity: 0, amount: 0});
  assert.equal(legacy.quantity, "0");
  assert.equal(legacy.amount, "0");
  const incoming = f.S.normalize({shipments: [valid({shipmentId: "merge-shipment", pricePer60Kg: 24000})],
    shipmentPrices: [{priceId: "merge-price", season: 2026, recipient: "Rice buyer", pricePer60Kg: 24000}]});
  const merged = f.storage.mergeData(f.state.data(), incoming);
  assert.equal(merged.added.shipments, 1);
  assert.equal(merged.added.shipmentPrices, 1);
  assert.equal(merged.data.shipments.find(row => row.shipmentId === "merge-shipment").pricePer60Kg, 24000);
  assert.equal(merged.data.shipmentPrices.find(row => row.priceId === "merge-price").pricePer60Kg, 24000);
  const repeated = f.storage.mergeData(merged.data, incoming);
  assert.equal(repeated.added.shipments, 0);
  assert.equal(repeated.added.shipmentPrices, 0);
  assert.deepEqual(plain(repeated.data.fieldWorks), plain(f.state.data().fieldWorks));
  console.log("PASS merge import includes shipment/rate collections, duplicate IDs skipped, legacy numeric zeros preserved");
}

function unchanged(f, operation) {
  const before = plain(f.state.data());
  const storedBefore = Array.from(f.memory);
  const writes = f.control.writes;
  const events = f.events.length;
  assert.equal(operation(), null);
  assert.deepEqual(plain(f.state.data()), before);
  assert.deepEqual(Array.from(f.memory), storedBefore);
  assert.equal(f.control.writes, writes);
  assert.equal(f.events.length, events);
}

function unrelated(data) {
  const result = plain(data);
  delete result.shipments;
  // Ordinary persistence updates these bookkeeping timestamps.
  delete result.meta.updatedAt;
  delete result.meta.lastBackupAt;
  return result;
}

{
  const f = fixture();
  for (const shipments of [undefined, null, {}, "bad", 1]) {
    assert.deepEqual(plain(f.S.normalize({ shipments }).shipments), []);
  }
  assert.deepEqual(plain(f.S.emptyData().shipments), []);
  const old = { shipmentId: "legacy", date: "2026-10-01", season: 2026, quantity: "10 bags", amount: "12345", memo: "Original handwritten quantity", custom: { keep: true }, createdAt: "original", updatedAt: "original" };
  const normalized = f.S.normalize({ shipments: [old, { ...old, shipmentId: "legacy-second" }] });
  assert.equal(normalized.shipments.length, 2);
  const legacy = plain(normalized.shipments[0]);
  for (const [key, value] of Object.entries(old)) assert.deepEqual(legacy[key], value, key);
  assert.deepEqual(legacy.packages, []);
  assert.equal(legacy.recipient, "");
  assert.equal(Object.hasOwn(legacy, "totalKg"), false, "Legacy quantity must never be guessed into bag totals");
  assert.equal(Object.hasOwn(legacy, "totalBags"), false);
  assert.equal(legacy.kind, "shipment");
  assert.equal(legacy.riceType, "brown");
  assert.deepEqual(plain(f.S.normalize(JSON.parse(JSON.stringify(normalized))).shipments), plain(normalized.shipments));
  assert.doesNotThrow(() => f.S.normalize({ shipments: [null, false, "bad", { shipmentId: "broken", packages: [null, "bad", { kg: -1, bags: 0 }] }] }));
  console.log("PASS safe defaults, legacy shipment retention and unknown fields");
}

{
  const f = fixture();
  const original = unrelated(f.state.data());
  const saved = f.state.saveShipment(valid({ custom: { future: true }, packages: [{ kg: "30", bags: "2", label: "Large bag" }, { kg: "2.5", bags: 3 }] }));
  assert.ok(saved && saved.shipmentId);
  assert.equal(saved.date, date);
  assert.equal(saved.season, 2026, "Crop year must remain independent of delivery date");
  assert.equal(saved.recipient, "Rice buyer");
  assert.equal(saved.varietyId, "");
  assert.deepEqual(plain(saved.packages), [{ kg: 30, bags: 2, label: "Large bag" }, { kg: 2.5, bags: 3 }]);
  assert.equal(f.state.shipments().length, 1);
  assert.deepEqual(unrelated(f.state.data()), original, "No agronomy/results/other-record mutations");
  const id = saved.shipmentId;
  const createdAt = saved.createdAt;
  const edited = f.state.saveShipment({ shipmentId: id, recipient: "  Renamed buyer ", kind: "sale", riceType: "white", createdAt: "forged", updatedAt: "forged", memo: "Edited" });
  assert.equal(edited.shipmentId, id);
  assert.equal(edited.createdAt, createdAt);
  assert.notEqual(edited.updatedAt, "forged");
  assert.equal(edited.recipient, "Renamed buyer");
  assert.equal(edited.kind, "sale");
  assert.equal(edited.riceType, "white");
  assert.equal(edited.season, 2026);
  assert.deepEqual(plain(edited.packages), plain(saved.packages));
  assert.deepEqual(plain(edited.custom), { future: true });
  assert.equal(f.state.shipments().length, 1);
  saved.packages[0].bags = 999;
  edited.custom.future = false;
  const retrieved = f.state.shipments();
  retrieved[0].packages[0].kg = 999;
  retrieved.pop();
  assert.equal(f.state.shipments()[0].packages[0].kg, 30);
  assert.equal(f.state.shipments()[0].packages[0].bags, 2);
  assert.equal(f.state.shipments()[0].custom.future, true);
  const gift = f.state.saveShipment(valid({ kind: "gift", riceType: "white", recipient: "Family" }));
  assert.ok(gift);
  assert.notEqual(gift.shipmentId, id);
  assert.deepEqual(unrelated(f.state.data()), original);
  const exported = f.storage.exportJson(f.state.data());
  const imported = f.S.normalize(JSON.parse(f.control.download.raw));
  assert.deepEqual(plain(imported.shipments), plain(f.state.shipments()));
  assert.deepEqual(plain(exported.shipments), plain(f.state.shipments()));
  assert.deepEqual(plain(imported.meta.customLedgerMetadata), plain(f.state.data().meta.customLedgerMetadata));
  assert.deepEqual(plain(f.storage.loadData().shipments), plain(f.state.shipments()));
  unchanged(f, () => f.state.deleteShipment("unknown"));
  assert.ok(f.state.deleteShipment(id));
  assert.deepEqual(plain(f.state.shipments().map((row) => row.shipmentId)), [gift.shipmentId]);
  unchanged(f, () => f.state.deleteShipment(id));
  assert.ok(f.state.deleteShipment(gift.shipmentId));
  assert.deepEqual(plain(f.state.shipments()), []);
  assert.deepEqual(unrelated(f.state.data()), original);
  console.log("PASS create/edit/gift/read isolation, JSON export/load roundtrip, delete and unrelated-data preservation");
}

{
  const f = fixture();
  const saved = f.state.saveShipment(valid());
  const invalid = [
    ...[undefined, null, "", "2026-02-30", "2026-13-01", "2026-01-00", "2026-1-01", [date], "bad"].map((date) => ({ date })),
    ...[undefined, null, "", " ", 0, 2026.5, "2026.0", "1e3", true, [2026], {}].map((season) => ({ season })),
    ...[undefined, null, "", " \t\n", 1, {}].map((recipient) => ({ recipient })),
    ...[undefined, null, "", "other", true].map((kind) => ({ kind })),
    ...[undefined, null, "", "other", true].map((riceType) => ({ riceType })),
    ...[undefined, null, {}, [], [null], ["bad"]].map((packages) => ({ packages })),
    ...[0, -1, NaN, Infinity, -Infinity, "", " ", "bad", "1e309", null, true, {}, []].map((kg) => ({ packages: [{ kg, bags: 1 }] })),
    ...[0, -1, 1.5, NaN, Infinity, "", " ", "1.5", "bad", null, true, {}, [], Number.MAX_SAFE_INTEGER + 1].map((bags) => ({ packages: [{ kg: 30, bags }] })),
    { packages: [{ kg: 30, bags: 1 }, { kg: 0, bags: 1 }] }
  ];
  for (const patch of invalid) {
    unchanged(f, () => f.state.saveShipment(valid(patch)));
    assert.ok(f.state.lastSaveError());
    unchanged(f, () => f.state.saveShipment({ ...valid(patch), shipmentId: saved.shipmentId }));
  }
  unchanged(f, () => f.state.saveShipment({}));
  assert.ok(f.state.saveShipment(valid({ date: "2028-02-29", season: "2026", packages: [{ kg: 0.25, bags: 1 }] })));
  assert.equal(f.state.lastSaveError(), null);
  console.log(`PASS ${invalid.length * 2 + 1} invalid create/edit no-ops and valid leap-day/fractional-weight recovery`);
}

{
  const f = fixture({ shipments: [{ shipmentId: "legacy", date, season: 2026, quantity: "10 bags", amount: "12345", memo: "Legacy handwritten amount", custom: { keep: true } }] });
  const legacy = plain(f.state.shipments()[0]);
  f.storage.exportJson(f.state.data());
  const legacyExport = JSON.parse(f.control.download.raw).shipments[0];
  assert.deepEqual(legacyExport, legacy);
  assert.deepEqual(plain(f.S.normalize(JSON.parse(f.control.download.raw)).shipments[0]), legacy);
  assert.equal(legacyExport.shipmentId, "legacy");
  assert.equal(legacyExport.quantity, "10 bags");
  assert.equal(legacyExport.amount, "12345");
  assert.equal(legacyExport.memo, "Legacy handwritten amount");
  assert.equal(legacyExport.recipient, "");
  assert.deepEqual(legacyExport.packages, []);
  assert.equal(Object.hasOwn(legacyExport, "totalKg"), false);
  assert.equal(Object.hasOwn(legacyExport, "totalBags"), false);
  unchanged(f, () => f.state.saveShipment({ shipmentId: "legacy", memo: "Incomplete edit" }));
  const edited = f.state.saveShipment(valid({ shipmentId: "legacy" }));
  assert.equal(edited.quantity, "10 bags");
  assert.equal(edited.amount, "12345");
  assert.deepEqual(plain(edited.custom), { keep: true });
  const before = plain(f.state.data());
  const stored = Array.from(f.memory);
  f.control.failWrites = true;
  assert.equal(f.state.saveShipment(valid()), null);
  assert.equal(f.state.saveShipment({ shipmentId: "legacy", recipient: "Failed edit" }), null);
  assert.equal(f.state.deleteShipment("legacy"), null);
  assert.deepEqual(plain(f.state.data()), before);
  assert.deepEqual(Array.from(f.memory), stored);
  assert.ok(f.state.lastSaveError());
  console.log("PASS legacy edit retention and storage-failure rollback for create/edit/delete");
}

{
  const old = { shipmentId: "unpriced", date, season: 2026, quantity: "old quantity", amount: "old amount", memo: "Old memo", packages: [{ kg: 30, bags: 3, unitPrice: "6000", custom: "keep" }] };
  const f = fixture({ shipments: [old] });
  assert.deepEqual(plain(f.state.shipmentPrices()), []);
  assert.equal(f.state.shipments()[0].pricePer60Kg, "");
  assert.deepEqual(plain(f.state.shipments()[0].packages), old.packages);
  const legacy = plain(f.state.shipments()[0]);
  const master = f.state.saveShipmentPrice({ season: "2026", recipient: "  Rice buyer  ", pricePer60Kg: "24000", custom: "keep" });
  assert.ok(master);
  assert.equal(master.recipient, "Rice buyer");
  const packages = [{ kg: 30, bags: 3, unitPrice: 6000 }, { kg: 10, bags: 2, unitPrice: 2500 }];
  const saved = f.state.saveShipment(valid({ kind: "sale", packages, pricePer60Kg: master.pricePer60Kg }));
  assert.equal(saved.pricePer60Kg, 24000);
  assert.deepEqual(plain(saved.packages), packages);
  const totalKg = saved.packages.reduce((sum, row) => sum + row.kg * row.bags, 0);
  assert.equal(totalKg, 110);
  assert.equal(totalKg / 60 * saved.pricePer60Kg, 44000);
  const beforeRateEdit = plain(f.state.shipments());
  assert.ok(f.state.saveShipmentPrice({ season: 2026, recipient: "Rice buyer", pricePer60Kg: 30000 }));
  assert.deepEqual(plain(f.state.shipments()), beforeRateEdit);
  const edited = f.state.saveShipment({ shipmentId: saved.shipmentId, memo: "Historical rate retained" });
  assert.equal(edited.pricePer60Kg, 24000);
  assert.equal(edited.createdAt, saved.createdAt);
  assert.equal(f.state.saveShipment(valid()).pricePer60Kg, "", "Shipment save must not implicitly apply a master rate");
  assert.equal(f.state.shipmentPrices().length, 1, "Shipment save must not implicitly save master rates");
  assert.equal(f.state.saveShipment(valid({ kind: "gift", pricePer60Kg: 0 })).pricePer60Kg, 0);
  f.storage.exportJson(f.state.data());
  const exported = JSON.parse(f.control.download.raw);
  const imported = f.S.normalize(exported);
  assert.deepEqual(plain(imported.shipments), plain(f.state.shipments()));
  assert.deepEqual(plain(imported.shipmentPrices), plain(f.state.shipmentPrices()));
  assert.deepEqual(exported.shipments.find((row) => row.shipmentId === "unpriced"), legacy);
  assert.equal(Object.hasOwn(saved, "revenue"), false);
  assert.ok(f.state.deleteShipmentPrice(master.priceId));
  assert.deepEqual(plain(f.state.shipments()), plain(imported.shipments));
  console.log("PASS legacy per-bag data retained; 24,000 yen/60kg snapshot gives 44,000 yen for 110kg and survives master edit/delete/export");
}

{
  const f = fixture();
  const original = unrelated(f.state.data());
  const rate = f.state.saveShipmentPrice({ season: 2026, recipient: " Buyer ", pricePer60Kg: 24000, custom: { keep: true } });
  const updated = f.state.saveShipmentPrice({ season: "2026", recipient: "Buyer", pricePer60Kg: 25000, createdAt: "forged" });
  assert.equal(updated.priceId, rate.priceId);
  assert.equal(updated.createdAt, rate.createdAt);
  assert.deepEqual(plain(updated.custom), { keep: true });
  assert.equal(f.state.shipmentPrices().length, 1);
  const otherYear = f.state.saveShipmentPrice({ season: 2025, recipient: "Buyer", pricePer60Kg: 20000 });
  const otherRecipient = f.state.saveShipmentPrice({ season: 2026, recipient: "buyer", pricePer60Kg: 0 });
  assert.equal(f.state.shipmentPrices().length, 3, "Recipient equality is exact after trimming; crop years are distinct");
  const moved = f.state.saveShipmentPrice({ priceId: otherYear.priceId, season: 2024 });
  assert.equal(moved.priceId, otherYear.priceId);
  assert.equal(moved.pricePer60Kg, 20000);
  unchanged(f, () => f.state.saveShipmentPrice({ priceId: moved.priceId, season: 2026, recipient: "Buyer" }));
  const copied = f.state.shipmentPrices();
  copied[0].pricePer60Kg = 999;
  assert.equal(f.state.shipmentPrices()[0].pricePer60Kg, 25000);
  f.storage.exportJson(f.state.data());
  assert.deepEqual(plain(f.storage.loadData().shipmentPrices), plain(f.state.shipmentPrices()));
  assert.deepEqual(plain(f.S.normalize(JSON.parse(f.control.download.raw)).shipmentPrices), plain(f.state.shipmentPrices()));
  unchanged(f, () => f.state.deleteShipmentPrice("unknown"));
  assert.ok(f.state.deleteShipmentPrice(otherRecipient.priceId));
  assert.ok(f.state.deleteShipmentPrice(moved.priceId));
  assert.ok(f.state.deleteShipmentPrice(rate.priceId));
  unchanged(f, () => f.state.deleteShipmentPrice(rate.priceId));
  assert.deepEqual(plain(f.state.shipmentPrices()), []);
  assert.deepEqual(unrelated(f.state.data()), original);
  for (const shipmentPrices of [undefined, null, {}, "bad"]) assert.deepEqual(plain(f.S.normalize({ shipmentPrices }).shipmentPrices), []);
  assert.deepEqual(plain(f.S.emptyData().shipmentPrices), []);
  assert.equal(f.S.normalize({ shipmentPrices: [rate, { ...rate, priceId: "duplicate", recipient: " Buyer " }] }).shipmentPrices.length, 1);
  console.log("PASS rate CRUD, exact trimmed recipient/year upsert, ID/date retention, collision no-op, copies and old-backup defaults");
}

{
  const f = fixture();
  const rate = f.state.saveShipmentPrice({ season: 2026, recipient: "Buyer", pricePer60Kg: 24000 });
  const shipment = f.state.saveShipment(valid({ pricePer60Kg: 24000 }));
  for (const pricePer60Kg of [-1, 0.5, NaN, Infinity, "bad", true, false, {}, [], [24000], Number.MAX_SAFE_INTEGER + 1]) {
    unchanged(f, () => f.state.saveShipment(valid({ pricePer60Kg })));
    unchanged(f, () => f.state.saveShipment({ shipmentId: shipment.shipmentId, pricePer60Kg }));
    unchanged(f, () => f.state.saveShipmentPrice({ season: 2026, recipient: "Buyer", pricePer60Kg }));
    assert.ok(f.state.lastSaveError());
  }
  for (const patch of [{ season: "" }, { season: 2026.5 }, { season: [] }, { recipient: " " }, { recipient: null }, { pricePer60Kg: "" }]) {
    unchanged(f, () => f.state.saveShipmentPrice({ season: 2026, recipient: "Buyer", pricePer60Kg: 24000, ...patch }));
  }
  for (const pricePer60Kg of [undefined, null, "", " ", 0, "0", "24000"]) {
    const saved = f.state.saveShipment(valid({ pricePer60Kg }));
    assert.ok(saved);
    assert.equal(saved.pricePer60Kg, pricePer60Kg == null || String(pricePer60Kg).trim() === "" ? "" : Number(pricePer60Kg));
  }
  const before = plain(f.state.data());
  const stored = Array.from(f.memory);
  f.control.failWrites = true;
  assert.equal(f.state.saveShipmentPrice({ season: 2027, recipient: "New", pricePer60Kg: 30000 }), null);
  assert.equal(f.state.saveShipmentPrice({ priceId: rate.priceId, pricePer60Kg: 30000 }), null);
  assert.equal(f.state.deleteShipmentPrice(rate.priceId), null);
  assert.deepEqual(plain(f.state.data()), before);
  assert.deepEqual(Array.from(f.memory), stored);
  console.log("PASS invalid master/snapshot no-ops, optional blank versus zero, and rate storage-failure rollback");
}
