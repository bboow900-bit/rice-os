"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), match => match[1].split("?")[0]);
const dependencies = ["utils", "state", "material-purchases", "material-stock", "material-insights"].map(name => `assets/js/core/${name}.js`);
let previousIndex = -1;
for (const asset of dependencies.concat("assets/js/screens/materials.js")) {
  const index = scripts.indexOf(asset);
  assert(index > previousIndex, `Asset must load once in dependency order: ${asset}`);
  assert.equal(scripts.filter(script => script === asset).length, 1);
  assert(fs.existsSync(path.join(root, asset)), `Asset must exist: ${asset}`);
  previousIndex = index;
}
assert(worker.includes("./assets/js/core/material-insights.js?v=${APP_VERSION}"), "SW must register the insights core asset");
const materialsUI = fs.readFileSync(path.join(root, "assets/js/screens/materials.js"), "utf8");
assert(/entries\.filter\(row => row\.kind !== "stocktake"\)/.test(materialsUI), "UI ledger must exclude the baseline entry");
assert(materialsUI.includes("data-evidence-stocktake"), "UI must provide a separate stocktake baseline button");
const clone = value => JSON.parse(JSON.stringify(value));
const data = { materials: [
  { materialId: "m1", name: "Same name", category: "fertilizer", unit: "kg", purchases: [
    { purchaseId: "old-late", season: 2025, date: "2025-12-20", quantity: 1, unit: "kg" },
    { purchaseId: "old-early", season: 2025, date: "2024-11-10", quantity: 1, unit: "kg" },
    { purchaseId: "wait", season: 2026, date: "2025-12-31", quantity: 0.3, unit: "kg", deliveryMode: "manual", expectedDeliveryDate: "2026-11-09", receipts: [] },
    { purchaseId: "part", season: 2026, date: "2026-01-02", quantity: 0.3, unit: "kg", deliveryMode: "manual", receipts: [{ receiptId: "r1", date: "2026-01-03", quantity: 0.1, unit: "kg" }] },
    { purchaseId: "late", season: 2026, date: "2026-01-02", quantity: 2, unit: "kg", deliveryMode: "manual", expectedDeliveryDate: "2026-11-08", receipts: [{ receiptId: "r2", date: "2026-01-03", quantity: 1, unit: "kg" }] },
    { purchaseId: "done", season: 2026, date: "2026-01-02", quantity: 1, unit: "kg", deliveryMode: "manual", receipts: [{ receiptId: "r3", date: "2026-01-03", quantity: 1, unit: "kg" }] },
    { purchaseId: "legacy", season: 2026, date: "2026-12-01", quantity: 9, unit: "kg" },
    { purchaseId: "id:receipt:inside", season: 2026, date: "2026-01-02", quantity: 1, unit: "kg", deliveryMode: "manual", receipts: [{ receiptId: "r:receipt:inside", date: "2026-01-03", quantity: 1, unit: "kg" }] }
  ], stocktakes: [{ stocktakeId: "s1", date: "2026-01-01", quantity: 10, unit: "kg", sequence: 1, snapshot: { purchases: [], usage: [] } }] },
  { materialId: "m2", name: "Same name", category: "herbicide", purchases: [
    { purchaseId: "other", season: 2025, date: "2025-01-01", quantity: 10, unit: "kg", deliveryMode: "manual", receipts: [] }
  ] }
], fieldWorks: [
  { workId: "w1", materialId: "m1", date: "2026-02-01", amount: 0.2, unit: "kg", status: "完了" },
  { workId: "foreign", materialId: "m2", date: "2026-02-01", amount: 2, unit: "kg", status: "完了" }
] };
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
freeze(data);
const before = JSON.stringify(data);
let writes = 0;
const forbidden = () => { writes++; throw Error("Projection must not write or fetch"); };
const context = vm.createContext({ console, fetch: forbidden, localStorage: { setItem: forbidden, removeItem: forbidden } });
context.window = context;
context.RiceOS = { utils: { clone, today: () => "2026-11-09" }, state: {
  data: () => data, saveMaterial: forbidden, isActualFieldWork: work => work.status === "完了"
} };
const load = name => vm.runInContext(fs.readFileSync(path.join(__dirname, `../assets/js/core/${name}.js`), "utf8"), context, { filename: name });
load("material-purchases"); load("material-stock"); load("material-insights");
const R = context.RiceOS, insights = R.materialInsights;
assert.deepEqual(insights.previousPurchases("m1", 2026).map(row => row.purchaseId), ["old-early", "old-late"]);
assert.equal(insights.previousPurchases("missing", 2026).length, 0);
assert.equal(insights.previousPurchases("", 2026).length, 0);
assert.equal(insights.previousPurchases("m1", "all").length, 0);
const pending = insights.pendingPurchases({ year: "2026", category: "fertilizer", status: "all" });
assert.deepEqual(pending.map(item => [item.row.purchaseId, item.status]), [["late", "overdue"], ["part", "partial"], ["wait", "waiting"]]);
assert.equal(pending.find(item => item.status === "partial").delivery.pending, 0.2);
assert.deepEqual(insights.pendingPurchases({ year: 2026, status: "overdue" }).map(item => item.row.purchaseId), ["late"]);
assert.deepEqual(insights.pendingPurchases({ year: "2025", category: "all", status: "waiting" }).map(item => item.row.purchaseId), ["other"]);
assert.equal(insights.pendingPurchases().length, 4);
assert.equal(insights.pendingPurchases({ category: "herbicide" })[0].material.materialId, "m2");
assert.equal(insights.pendingPurchases({ status: "partial" })[0].row.purchaseId, "part");
const evidence = insights.stockEvidence("m1");
assert.deepEqual(evidence.summary, clone(R.materialStock.summary("m1")));
assert.equal(evidence.entries.length, evidence.summary.ledger.length + 1);
assert.equal(evidence.entries[0].stocktakeId, "s1");
assert.equal(evidence.entries[0].sourceStableId, "s1");
assert.equal(evidence.entries[0].kind, "stocktake");
assert.equal(evidence.entries.filter(entry => entry.kind === "stocktake").length, 1);
assert.equal(evidence.entries.filter(entry => entry.kind !== "stocktake").length, evidence.summary.ledger.length);
const receipt = evidence.entries.find(entry => entry.id === "part:receipt:r1");
assert.equal(receipt.purchaseId, "part"); assert.equal(receipt.receiptId, "r1"); assert.equal(receipt.sourceStableId, "part:receipt:r1");
assert.equal(evidence.entries.find(entry => entry.id === "w1").workId, "w1");
assert.equal(evidence.entries.find(entry => entry.id === "old-early").purchaseId, "old-early");
assert.equal(evidence.entries.find(entry => entry.id === "id:receipt:inside:receipt:r:receipt:inside").receiptId, "r:receipt:inside");
assert(!evidence.entries.some(entry => entry.id === "foreign"));
for (const entry of evidence.summary.ledger) {
  const projected = evidence.entries.find(row => row.kind === entry.kind && row.id === entry.id);
  for (const key of Object.keys(entry)) assert.deepEqual(projected[key], entry[key]);
}
// The delivery API owns cancellation and decimals, including future cancellation support.
const originalDelivery = R.materialPurchases.deliverySummary;
R.materialPurchases.deliverySummary = row => freeze({ received: 0.1, cancelled: row.purchaseId === "wait" ? 0.2 : 0.075, pending: row.purchaseId === "wait" ? 0 : 0.125, legacy: false });
const cancelled = insights.pendingPurchases({ year: 2026 });
assert(!cancelled.some(item => item.row.purchaseId === "wait"));
assert.equal(cancelled[0].delivery.pending, 0.125);
assert.equal(cancelled[0].delivery.cancelled, 0.075);
R.materialPurchases.deliverySummary = originalDelivery;
const originalSummary = R.materialStock.summary;
const unusual = freeze({ quantity: null, exact: false, warnings: [{ code: "unknown_quantity" }], stocktake: null, ledger: [
  { kind: "purchase", id: "not-real:receipt:nope", quantity: null, included: false, reason: "unknown_quantity" },
  { kind: "usage", id: "foreign", included: false, reason: "unknown_or_mismatched_unit" },
  { kind: "purchase", included: false, reason: "invalid_transaction_id" }
] });
R.materialStock.summary = () => unusual;
const unknown = insights.stockEvidence("m1");
assert.deepEqual(unknown.summary, unusual);
assert(unknown.entries.every(entry => !("sourceStableId" in entry) && !("purchaseId" in entry) && !("workId" in entry)));
R.materialStock.summary = originalSummary;
const originalRecords = R.materialPurchases.records;
R.materialPurchases.records = () => [{ purchaseId: "duplicate" }, { purchaseId: "duplicate" }];
R.materialStock.summary = () => ({ ledger: [{ kind: "purchase", id: "duplicate", included: false, reason: "invalid_transaction_id" }], stocktake: null });
assert.equal("sourceStableId" in insights.stockEvidence("m1").entries[0], false);
R.materialPurchases.records = originalRecords;
R.materialStock.summary = originalSummary;
const sortRows = freeze([
  { purchaseId: "waiting-unknown", date: "2026-01-01", expectedDeliveryDate: "", received: 0 },
  { purchaseId: "partial-unknown", date: "2026-01-01", received: 1 },
  { purchaseId: "waiting-date", date: "2026-10-01", expectedDeliveryDate: "2026-11-10", received: 0 },
  { purchaseId: "partial-date", date: "2026-10-01", expectedDeliveryDate: "2026-11-20", received: 1 },
  { purchaseId: "late-b", date: "2026-01-02", expectedDeliveryDate: "2026-11-08", received: 1 },
  { purchaseId: "late-a", date: "2026-01-01", expectedDeliveryDate: "2026-11-08", received: 0 },
  { purchaseId: "late-earlier", date: "2026-10-01", expectedDeliveryDate: "2026-11-07", received: 0 },
  { purchaseId: "waiting-tie-b", date: "2026-10-02", expectedDeliveryDate: "2026-11-10", received: 0 },
  { purchaseId: "waiting-tie-a", date: "2026-10-02", expectedDeliveryDate: "2026-11-10", received: 0 }
].map(row => ({ ...row, season: 2026, deliveryMode: "manual" })));
const sortBefore = JSON.stringify(sortRows);
R.materialPurchases.records = id => id === "m1" ? sortRows : [];
R.materialPurchases.deliverySummary = row => ({ received: row.received, pending: 1 });
const sortedIds = () => insights.pendingPurchases({ year: 2026 }).map(item => item.row.purchaseId);
const expectedOrder = ["late-earlier", "late-a", "late-b", "partial-date", "partial-unknown", "waiting-date", "waiting-tie-a", "waiting-tie-b", "waiting-unknown"];
assert.deepEqual(sortedIds(), expectedOrder);
assert.deepEqual(sortedIds(), expectedOrder, "Repeated projections retain order");
R.materialPurchases.records = id => id === "m1" ? sortRows.slice().reverse() : [];
assert.deepEqual(sortedIds(), expectedOrder, "Exact date ties resolve by stable IDs, not source array order");
assert.deepEqual(insights.pendingPurchases({ status: "waiting" }).map(item => item.row.purchaseId), expectedOrder.slice(5));
assert.equal(JSON.stringify(sortRows), sortBefore);
R.materialPurchases.records = originalRecords;
R.materialPurchases.deliverySummary = originalDelivery;
pending[0].material.name = "changed"; receipt.quantity = 999; evidence.summary.stocktake.quantity = 999;
assert.equal(JSON.stringify(data), before);
assert.equal(writes, 0);
assert.equal(insights.stockEvidence("m1").summary.stocktake.quantity, 10);
console.log("PASS material insights: asset/core load order, SW registration, UI baseline separation, exact IDs, prior season/date order, manual pending/status filters, delegated decimals/cancellations, stock ledger/source IDs, unknown provenance, no mutation/write/fetch");
