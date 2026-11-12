(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const numeric = value => typeof value === "number" ? (Number.isFinite(value) ? value : null)
    : typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
  function parse(value, explicitUnit = "") {
    const unit = typeof explicitUnit === "string" ? explicitUnit.trim() : "";
    const direct = numeric(value);
    if (direct !== null) return {quantity:direct, unit};
    const match = typeof value === "string" && value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([^\d\s].*)$/);
    if (!match || /[\/／]/.test(match[2]) || unit && unit !== match[2].trim()) return {quantity:null, unit};
    return {quantity:numeric(match[1]), unit:match[2].trim()};
  }
  function validPackaging(p) {
    return Boolean(p && typeof p === "object" && !Array.isArray(p) && typeof p.unit === "string" && p.unit.trim() && p.unit === p.unit.trim()
      && typeof p.baseUnit === "string" && p.baseUnit.trim() && p.baseUnit === p.baseUnit.trim() && p.unit !== p.baseUnit
      && typeof p.quantity === "number" && Number.isFinite(p.quantity) && p.quantity > 0 && p.quantity <= Number.MAX_SAFE_INTEGER);
  }
  function decimalParts(value) {
    const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
    return {n:BigInt(mantissa.replace(".", "")), scale:(mantissa.split(".")[1] || "").length - Number(exponent)};
  }
  function decimalConvert(value, factor, divide) {
    const a = decimalParts(value), b = decimalParts(factor);
    if (!divide) return Number(`${a.n * b.n}e${-a.scale - b.scale}`);
    if (a.n === 0n) return value;
    const negative = a.n < 0n, numerator = negative ? -a.n : a.n;
    // Retain more than the full binary64 decimal range before the final Number conversion.
    const digits = 800 + b.n.toString().length - numerator.toString().length;
    const quotient = numerator * 10n ** BigInt(digits) / b.n;
    return Number(`${negative ? "-" : ""}${quotient}e${b.scale - a.scale - digits}`);
  }
  function convert(quantity, fromUnit, toUnit, packaging) {
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || Math.abs(quantity) > Number.MAX_SAFE_INTEGER
      || typeof fromUnit !== "string" || !fromUnit.trim() || typeof toUnit !== "string" || !toUnit.trim()) return null;
    const from = fromUnit.trim(), to = toUnit.trim();
    let result = from === to ? quantity : null;
    if (result === null && validPackaging(packaging)) {
      if (from === packaging.unit && to === packaging.baseUnit) result = decimalConvert(quantity, packaging.quantity, false);
      else if (from === packaging.baseUnit && to === packaging.unit) result = decimalConvert(quantity, packaging.quantity, true);
    }
    return result !== null && Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER ? result : null;
  }
  function usageSnapshot(material, work, previous, dateOnly) {
    const U = R.utils, old = previous && previous.materialUsageSnapshot;
    const packaging = dateOnly && old ? U.clone(old.packaging) : U.clone(material.packaging || null);
    const unit = String((dateOnly && old ? old.unit : material.unit) ?? "");
    const parsed = parse(work.amount, work.unit || work.amountUnit || "");
    const converted = convert(parsed.quantity, parsed.unit, unit, packaging);
    const quantity = converted !== null && converted >= 0 ? converted : null;
    const snapshot = {version:1, materialId:material.materialId, amount:String(work.amount ?? ""), date:work.date, quantity, unit,
      packaging, cost:null, unitCost:null, sourceAmount:null, sourceQuantity:null, sourceUnit:"",
      sourcePurchaseId:"", sourceReceiptId:"", sourceDate:"", reason:"quantity_unknown", recordedAt:U.now()};
    if (quantity === null) return snapshot;
    const candidates = [];
    (material.purchases || []).filter(p => p.deliveryMode === "manual").forEach(p => {
      (p.receipts || []).filter(r => !r.deletedAt && r.date <= work.date && r.date <= U.today()).forEach(r => candidates.push({p,r}));
    });
    if (!candidates.length) { snapshot.reason = "no_actual_receipt"; return snapshot; }
    const latest = candidates.reduce((date, c) => c.r.date > date ? c.r.date : date, "");
    const selected = candidates.filter(c => c.r.date === latest).sort((a,b) =>
      String(a.p.purchaseId).localeCompare(String(b.p.purchaseId)) || String(a.r.receiptId).localeCompare(String(b.r.receiptId)));
    const priced = selected.map(({p,r}) => {
      const amount = R.materialPurchases ? R.materialPurchases.amount(p) : null;
      const sourceQuantity = convert(quantity, unit, p.unit, p.packagingSnapshot);
      const rate = convert(1, unit, p.unit, p.packagingSnapshot);
      const cancelled = (p.cancellations || []).some(c => !c.deletedAt);
      const cost = amount !== null && sourceQuantity !== null && p.quantity > 0 ? amount / p.quantity * sourceQuantity : null;
      return {p,r,amount,rate:rate !== null && amount !== null ? amount / p.quantity * rate : null,
        cost:!cancelled && cost !== null && Number.isFinite(cost) && cost >= 0 && cost <= Number.MAX_SAFE_INTEGER ? cost : null,
        reason:cancelled ? "order_cancelled" : sourceQuantity === null ? "price_unit_unknown" : "price_unknown"};
    });
    const first = priced[0];
    Object.assign(snapshot,{sourcePurchaseId:first.p.purchaseId,sourceReceiptId:first.r.receiptId,sourceDate:first.r.date});
    if (priced.some(c => c.cost === null)) { snapshot.reason = priced.find(c => c.cost === null).reason; return snapshot; }
    if (priced.some(c => c.rate === null || !Number.isFinite(c.rate) || c.rate < 0 || c.rate > Number.MAX_SAFE_INTEGER)) { snapshot.reason = "price_unknown"; return snapshot; }
    if (priced.some(c => c.rate !== first.rate)) { snapshot.reason = "price_conflict"; return snapshot; }
    Object.assign(snapshot, {cost:first.cost, unitCost:first.rate, sourceAmount:first.amount,
      sourceQuantity:first.p.quantity, sourceUnit:first.p.unit, reason:"actual_receipt_reference"});
    return snapshot;
  }
  R.materialQuantities = {convert, parse, validPackaging, usageSnapshot};
})();
