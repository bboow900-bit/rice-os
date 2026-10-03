"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const date = "2027-01-15";
const plain = (value) => JSON.parse(JSON.stringify(value));
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const context = vm.createContext({
  localStorage: {
    getItem() { throw new Error("Calendar must not access storage"); },
    setItem() { throw new Error("Calendar must not write storage"); }
  }
});
context.window = context;
for (const file of ["utils", "calendar"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, `../assets/js/core/${file}.js`), "utf8"), context);
}

const data = freeze({
  schedules: [{ scheduleId: "schedule", date, title: "Existing plan", fieldIds: ["field"] }],
  fieldWorks: [{ workId: "work", date, workName: "Existing work", fieldIds: ["field"] }],
  otherWorks: [{ otherWorkId: "other", date, workName: "Existing office work" }],
  growthLogs: [{ logId: "growth", date, fieldId: "field" }],
  shipmentPrices: [{ priceId: "master", season: 2026, recipient: "Buyer", pricePer60Kg: 30000 }],
  shipments: [
    { shipmentId: "shipment", date, season: 2026, kind: "shipment", recipient: " Buyer ", riceType: "brown",
      packages: [{ kg: 30, bags: 3 }, { kg: 10, bags: 2 }], pricePer60Kg: 24000, memo: "Delivery note" },
    { shipmentId: "sale", date, season: 2025, kind: "sale", recipient: "Shop", riceType: "white", packages: [{ kg: 2.5, bags: 2, unitPrice: 1000 }], amount: "PRICE_MUST_NOT_APPEAR" },
    { shipmentId: "gift", date, season: 2026, kind: "gift", recipient: "Family", riceType: "white", packages: [{ kg: 5, bags: 1 }], pricePer60Kg: 0 },
    { shipmentId: "legacy", date, season: 2024, quantity: "Old handwritten quantity", memo: "Original note", packages: [] },
    { shipmentId: "unknown", date, season: "", recipient: "Unknown", riceType: "unknown", packages: [{ kg: "", bags: "" }] },
    { shipmentId: "long", date, season: 2026, memo: "Long note ".repeat(30) },
    { shipmentId: "wrong-date", date: "2026-01-15", season: 2027, recipient: "Wrong date" }
  ]
});
const field = freeze({ fieldId: "field", name: "Existing field" });
const period = freeze({ kind: "dry", source: "direct", label: "Dry period", startDate: date, actualEndDate: "", plannedEndDate: "" });
const state = {
  data: () => data,
  field: (id) => id === field.fieldId ? field : null,
  activeFields: () => [field],
  resolvedWaterPeriodsFor: () => [period]
};
context.RiceOS.state = state;
const calendar = context.RiceOS.calendar;
const before = JSON.stringify(data);
const recentBefore = plain(calendar.recentEntries(100));
const entries = calendar.entriesForDate(date);
const shipments = entries.filter((row) => row.kind === "shipment");
assert.equal(shipments.length, 6);
assert.deepEqual(plain(shipments.map((row) => row.record.shipmentId)), data.shipments.slice(0, 6).map((row) => row.shipmentId));
shipments.forEach((entry, i) => {
  assert.equal(entry.tone, "shipment");
  assert.strictEqual(entry.record, data.shipments[i], "Preserve original object identity and shipment ID for routing");
});
assert.equal(shipments[0].title, "\u51fa\u8377");
assert.equal(shipments[0].subtitle, "Buyer / 2026\u5e74\u7523 / \u7384\u7c73 / 30kg\u00d73\u888b\u30fb10kg\u00d72\u888b");
assert.equal(shipments[0].memo, "Delivery note");
assert.equal(shipments[1].title, "\u8ca9\u58f2");
assert.match(shipments[1].subtitle, /2025\u5e74\u7523/);
assert.match(shipments[1].subtitle, /\u767d\u7c73/);
assert.match(shipments[1].subtitle, /2\.5kg\u00d72\u888b/);
assert.equal(shipments[2].title, "\u304a\u3059\u305d\u5206\u3051");
assert.equal(shipments[3].subtitle, "2024\u5e74\u7523");
assert.equal(shipments[3].memo, "Old handwritten quantity / Original note");
assert.equal(shipments[4].subtitle, "Unknown");
assert.equal(shipments[4].subtitle.includes("0kg"), false);
assert.equal(shipments[4].subtitle.includes("0\u888b"), false);
assert.ok(shipments[5].memo.length <= 81, "Memo preview must stay short");
assert.ok(shipments[5].memo.endsWith("\u2026"));
assert.equal(shipments.some((row) => row.record.shipmentId === "wrong-date"), false);
shipments.forEach((entry) => assert.doesNotMatch(`${entry.subtitle} ${entry.memo}`, /24000|30000|PRICE_MUST_NOT_APPEAR/));
console.log("PASS shipment/sale/gift entries use actual date, crop year, rice labels and known package sizes; legacy quantity stays unknown");

assert.deepEqual(plain(entries.filter((row) => row.kind !== "shipment").map((row) => row.kind)), ["schedule", "work", "other", "growth", "dry"]);
assert.strictEqual(entries.find((row) => row.kind === "schedule").record, data.schedules[0]);
assert.strictEqual(entries.find((row) => row.kind === "work").record, data.fieldWorks[0]);
assert.strictEqual(entries.find((row) => row.kind === "dry").record, period);
assert.deepEqual(plain(calendar.entriesForDate(date)), plain(entries), "Repeated reads must not append duplicates");
assert.equal(calendar.entriesForDate("2026-01-15").filter((row) => row.kind === "shipment").length, 1);
assert.equal(JSON.stringify(data), before);
assert.deepEqual(plain(calendar.recentEntries(100)), recentBefore);
assert.equal(calendar.recentEntries(100).some((row) => row.kind === "shipment"), false);
console.log("PASS existing entries and recentEntries preserved; no storage access, mutations, schedule changes or duplicate appends");

for (const packages of [undefined, null, [], [{ kg: 0, bags: 1 }], [{ kg: 30, bags: 0 }], [{ kg: 30, bags: 1.5 }], [{ kg: true, bags: 1 }], [{ kg: 30, bags: null }], [{ kg: 30, bags: 1 }, { kg: "", bags: 1 }]]) {
  const row = freeze({ shipmentId: "unknown-packages", date, quantity: "Legacy quantity", packages });
  context.RiceOS.state = { ...state, data: () => ({ ...data, shipments: [row] }) };
  const entry = calendar.entriesForDate(date).find((entry) => entry.kind === "shipment");
  assert.equal(entry.subtitle, "");
  assert.equal(entry.memo, "Legacy quantity");
  assert.strictEqual(entry.record, row);
}
context.RiceOS.state = { ...state, data: () => ({ ...data, shipments: undefined }) };
assert.equal(calendar.entriesForDate(date).some((row) => row.kind === "shipment"), false);
console.log("PASS missing shipments/default packages and invalid/partial bag data never fabricate zero or complete quantities");
