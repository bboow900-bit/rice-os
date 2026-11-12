"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const pack = { unit: "袋", quantity: 20, baseUnit: "kg" };
const snap = (materialId, quantity, cost, unit = "kg") => ({ version: 1, materialId, amount: "recorded", date: "2025-06-01", quantity, unit, cost, packaging: pack, sourcePurchaseId: "p", sourceReceiptId: "r", sourceDate: "2025-05-01", reason: cost === null ? "price_unknown" : "", recordedAt: "2025-06-01T00:00:00Z" });
const purchase = (purchaseId, season, quantity, unit = "kg", extra = {}) => ({ purchaseId, season, quantity, unit, date: "2026-01-01", unitPrice: "", totalAmount: "", deliveryMode: "manual", expectedDeliveryDate: "", receipts: [], ...extra });
let data = freeze({ materials: [
  { materialId: "m1", name: "Same", unit: "kg", packaging: { ...pack, quantity: 99 }, purchases: [
    purchase("old", 2025, 100, "kg", { totalAmount: 123 }),
    purchase("pack", 2026, 2, "袋", { packagingSnapshot: pack, totalAmount: 400, receipts: [{ receiptId: "r", date: "2026-01-02", quantity: 1, unit: "袋" }] }),
    purchase("zero", 2026, 1, "kg", { totalAmount: 0 }),
    purchase("unknown", 2026, 1, "kg", { packagingSnapshot: null }),
    { purchaseId: "legacy", season: 2026, date: "2026-01-01", quantity: 50, unit: "kg", unitPrice: "", totalAmount: "" }
  ] },
  { materialId: "m2", name: "Same", unit: "kg", purchases: [purchase("other", 2026, 1, "kg", { totalAmount: 50 })] }
], fieldWorks: [
  { workId: "snapshot", materialId: "m1", cropYear: 2025, date: "2024-12-01", workName: "追肥", amount: "999袋", fieldIds: ["a", "b"], materialUsageSnapshot: snap("m1", 10, 100) },
  { workId: "old", materialId: "m1", cropYear: 2025, date: "2025-06-02", workName: "追肥", amount: "2kg" },
  { workId: "zero", materialId: "m1", cropYear: 2025, date: "2025-06-03", workName: "追肥", amount: "0kg", materialUsageSnapshot: snap("m1", 0, 0) },
  { workId: "future-season", materialId: "m1", cropYear: 2026, date: "2025-06-02", workName: "追肥", amount: "7kg", materialUsageSnapshot: snap("m1", 7, null) },
  { workId: "plan", materialId: "m1", cropYear: 2025, workName: "追肥計画", amount: "100kg" },
  { workId: "planned", materialId: "m1", cropYear: 2025, workName: "追肥", status: "予定", amount: "100kg" },
  { workId: "other", materialId: "m2", cropYear: 2025, workName: "追肥", amount: "3kg", materialUsageSnapshot: snap("m2", 3, 30) },
  { workId: "name-only", material: "Same", cropYear: 2025, workName: "追肥", amount: "50kg" }
] });
const original = data;
let writes = 0, fail = false, sequence = 0, stock = { quantity: 5, unit: "kg", exact: true };
const conversionCalls = [];
const forbidden = () => { throw Error("No projection writes/fetch"); };
const context = vm.createContext({ console, fetch: forbidden, localStorage: { setItem: forbidden, removeItem: forbidden } });
context.window = context;
context.RiceOS = { utils: { clone, today: () => "2026-11-09", now: () => "2026-11-09T01:00:00Z", id: () => `plan-${++sequence}` }, state: {
  data: () => data, cropYearForRecord: work => work.cropYear || Number(String(work.date).slice(0, 4)),
  isActualFieldWork: work => work.status !== "予定",
  saveMaterial(record) {
    writes++;
    if (fail) return null;
    data = clone(data);
    const material = data.materials.find(row => row.materialId === record.materialId);
    Object.assign(material, clone(record));
    return data;
  }
}, materialStock: { summary: () => clone(stock) }, materialQuantities: {
  parse(value, explicitUnit) {
    const match = String(value).match(/^([0-9]+(?:\.[0-9]+)?)\s*(kg|袋)?$/);
    if (!match || match[2] && explicitUnit && match[2] !== explicitUnit) return { quantity: null, unit: explicitUnit };
    return { quantity: Number(match[1]), unit: explicitUnit || match[2] || "" };
  },
  convert(quantity, from, to, packaging) {
    conversionCalls.push(clone({ quantity, from, to, packaging: packaging || null }));
    if (from === to) return quantity;
    if (packaging && from === packaging.unit && to === packaging.baseUnit) return quantity * packaging.quantity;
    return null;
  }
} };
const load = name => vm.runInContext(fs.readFileSync(path.join(__dirname, `../assets/js/core/${name}.js`), "utf8"), context, { filename: name });
load("material-purchases"); load("material-planning");
const R = context.RiceOS, P = R.materialPlanning;
let costs = P.annualCosts("m1", 2026);
assert.equal(costs.purchaseCost, 400); assert.equal(costs.purchaseCount, 4); assert.equal(costs.unpricedPurchases, 2);
assert.equal(costs.usageCost, null); assert.equal(costs.usageCount, 1); assert.equal(costs.unpricedUses, 1);
costs = P.annualCosts("m1", 2025);
assert.equal(costs.usageCost, 100); assert.equal(costs.usageCount, 3); assert.equal(costs.unpricedUses, 1);
assert.equal(costs.usageRows.find(row => row.work.workId === "snapshot").quantity, 10);
assert.equal(costs.usageRows.find(row => row.work.workId === "old").reason, "historical_cost_unknown");
assert.equal(P.annualCosts("", 2025).usageCost, 130);
assert.equal(P.annualCosts("", 2026).purchaseCost, 450);
assert.equal(P.annualCosts("missing", 2026).purchaseCount, 0);
assert.equal(P.annualCosts("missing", 2026).usageCost, 0);
let plan = P.planning("m1", 2026);
assert.equal(plan.previousUsage, 12); assert.equal(plan.unknownUses, 0);
assert.equal(plan.previousUsageCount, 3);
assert.equal(plan.stock, 5); assert.equal(plan.pending, 122); assert.equal(plan.secured, 127); assert.equal(plan.plan, null);
assert.equal(conversionCalls.find(call => call.from === "袋").packaging.quantity, 20);
assert.equal(P.planning("missing", 2026).reason, "material_not_found");
assert.equal(writes, 0);
assert.equal(data, original);
function changed(change) { data = clone(original); change(data); freeze(data); }
changed(d => d.fieldWorks = []);
assert.equal(P.planning("m1", 2026).previousUsageCount, 0);
assert.equal(P.planning("m1", 2026).previousUsage, 0);
changed(d => d.fieldWorks = d.fieldWorks.filter(work => work.workId === "zero"));
assert.equal(P.planning("m1", 2026).previousUsageCount, 1);
assert.equal(P.planning("m1", 2026).previousUsage, 0);
changed(d => {
  d.materials[0].purchases.push(
    purchase("next-year", 2027, 3, "袋", { packagingSnapshot: pack, receipts: [{ receiptId: "next-r", date: "2026-01-02", quantity: 1, unit: "袋" }], cancellations: [{ cancellationId: "next-c", date: "2026-01-03", quantity: 1, unit: "袋" }] }),
    purchase("old-delivered", 2024, 4, "袋", { packagingSnapshot: null, receipts: [{ receiptId: "done", date: "2024-01-02", quantity: 4, unit: "袋" }] }),
    purchase("old-cancelled", 2024, 5, "袋", { packagingSnapshot: null, cancellations: [{ cancellationId: "cancel", date: "2024-01-03", quantity: 5, unit: "袋" }] })
  );
  d.materials[0].purchasePlans = [2026, 2027].map(season => ({ planId: `plan-${season}`, season, quantity: season, unit: "kg" }));
});
const crossYearData = data, crossYearBefore = JSON.stringify(data);
for (const year of [2025, 2026, 2027]) {
  const projected = P.planning("m1", year);
  assert.equal(projected.pending, 142); assert.equal(projected.secured, 147);
  assert.equal(projected.previousYear, year - 1);
  assert.equal(projected.previousUsage, year === 2025 ? 0 : year === 2026 ? 12 : 7);
  assert.equal(projected.plan && projected.plan.season, year === 2025 ? null : year);
}
const detached = P.planning("m1", 2026);
detached.material.purchases[0].quantity = 999;
detached.plan.quantity = 999;
assert.equal(data, crossYearData); assert.equal(JSON.stringify(data), crossYearBefore); assert.equal(writes, 0);
changed(d => d.materials[0].purchases.push(purchase("old-unknown", 2024, 1, "袋", { packagingSnapshot: null })));
assert.equal(P.planning("m1", 2026).pending, null); assert.equal(P.planning("m1", 2026).secured, null);
assert.equal(P.planning("m1", 2026).reason, "pending_unknown");
changed(d => d.materials[0].purchases.push(purchase("future-unknown", 2027, 1, "袋", { packagingSnapshot: null })));
assert.equal(P.planning("m1", 2026).pending, null); assert.equal(P.planning("m1", 2026).secured, null);
changed(d => d.fieldWorks.push({ workId: "mismatch", materialId: "m1", cropYear: 2025, workName: "追肥", amount: "1袋" }));
assert.equal(P.planning("m1", 2026).previousUsage, null); assert.equal(P.planning("m1", 2026).unknownUses, 1);
changed(d => d.fieldWorks.push({ workId: "unknown-snapshot", materialId: "m1", cropYear: 2025, workName: "追肥", materialUsageSnapshot: snap("m1", null, null) }));
assert.equal(P.planning("m1", 2026).unknownUses, 1);
changed(d => d.materials[0].purchases[1].packagingSnapshot = null);
assert.equal(P.planning("m1", 2026).pending, null); assert.equal(P.planning("m1", 2026).secured, null);
changed(d => delete d.materials[0].purchases[1].packagingSnapshot);
assert.equal(P.planning("m1", 2026).pending, null);
data = original;
stock = { quantity: null, unit: "kg", exact: false };
assert.equal(P.planning("m1", 2026).stock, null); assert.equal(P.planning("m1", 2026).secured, null);
stock = { quantity: -5, unit: "kg", exact: true };
assert.equal(P.planning("m1", 2026).stock, -5); assert.equal(P.planning("m1", 2026).secured, 117);
stock = { quantity: 5, unit: "袋", exact: true };
assert.equal(P.planning("m1", 2026).stock, null);
stock = { quantity: Number.MAX_SAFE_INTEGER, unit: "kg", exact: true };
assert.equal(P.planning("m1", 2026).secured, null);
changed(d => d.materials[0].purchases = [purchase("huge", 2026, 1, "kg", { totalAmount: Number.MAX_SAFE_INTEGER }), purchase("more", 2026, 1, "kg", { totalAmount: 1 })]);
assert.equal(P.annualCosts("m1", 2026).purchaseCost, null);
changed(d => d.fieldWorks = [1, 2].map(n => ({ workId: `huge-${n}`, materialId: "m1", cropYear: 2025, workName: "追肥", materialUsageSnapshot: snap("m1", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) })));
assert.equal(P.annualCosts("m1", 2025).usageCost, null); assert.equal(P.planning("m1", 2026).previousUsage, null);
data = clone(original); stock = { quantity: 5, unit: "kg", exact: true };
const saved = P.savePlan("m1", { season: 2027, quantity: 0, unit: "kg", memo: "explicit zero" });
assert(saved); assert.equal(saved.quantity, 0); assert.equal(data.materials[0].purchasePlans.length, 1);
const updated = P.savePlan("m1", { season: "2027", quantity: "0.3", unit: "kg", memo: "updated" });
assert.equal(updated.planId, saved.planId); assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.quantity, 0.3);
assert.equal(P.planning("m1", 2027).plan.planId, saved.planId);
saved.memo = "external mutation"; assert.equal(data.materials[0].purchasePlans[0].memo, "updated");
for (const input of [
  { season: 1899, quantity: 1, unit: "kg" }, { season: 2201, quantity: 1, unit: "kg" },
  { season: 2027.5, quantity: 1, unit: "kg" }, { season: 2027, quantity: -1, unit: "kg" },
  { season: 2027, quantity: "", unit: "kg" }, { season: 2027, quantity: true, unit: "kg" },
  { season: 2027, quantity: Infinity, unit: "kg" }, { season: 2027, quantity: 1, unit: "袋" },
  { season: 2027, quantity: 1, unit: "kg", planId: "not-existing" }
]) { const before = JSON.stringify(data), count = writes; assert.equal(P.savePlan("m1", input), null); assert(P.lastError); assert.equal(JSON.stringify(data), before); assert.equal(writes, count); }
fail = true;
let before = JSON.stringify(data);
assert.equal(P.savePlan("m1", { season: 2028, quantity: 1, unit: "kg" }), null); assert(P.lastError); assert.equal(JSON.stringify(data), before);
fail = false;
data.materials[0].purchasePlans.push({ ...updated, planId: "duplicate" });
before = JSON.stringify(data);
assert.equal(P.savePlan("m1", { season: 2027, quantity: 1, unit: "kg" }), null);
assert.equal(JSON.stringify(data), before); assert.equal(P.planning("m1", 2027).reason, "duplicate_plan_season");
console.log("PASS material planning: all-season pending with partial receipts/cancellations, year-scoped usage/plans, read-only detached projections, exact IDs/seasons, group once, immutable usage snapshots, old price unknown, known zero/partial totals, overflow, historical packaging conversion, unknown stock/pending, stable plans, validation/duplicate/failure safety; quantities contract stub, real purchases core");
