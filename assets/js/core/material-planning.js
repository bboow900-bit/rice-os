(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils;
  let error = "";
  const validNumber = value => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  const validQuantity = value => validNumber(value) && value >= 0;
  const validSeason = value => /^\d{4}$/.test(String(value)) && Number(value) >= 1900 && Number(value) <= 2200;
  const materialFor = id => typeof id === "string" && id ? (R.state.data().materials || []).find(row => row.materialId === id) : null;
  const purchasesFor = material => R.materialPurchases.records(material.materialId);
  function total(values) {
    if (values.some(value => !validNumber(value))) return null;
    const result = R.materialPurchases.quantitySum(values);
    return validNumber(result) ? result : null;
  }
  function knownTotal(values) {
    const known = values.filter(validQuantity);
    return values.length && !known.length ? null : total(known);
  }
  function actualWorks(ids, season) {
    return (R.state.data().fieldWorks || []).filter(work => ids.has(work.materialId)
      && R.state.isActualFieldWork(work) && !/計画/.test(String(work.workName || ""))
      && String(R.state.cropYearForRecord(work)) === String(season));
  }
  function usage(work) {
    const snapshot = work.materialUsageSnapshot;
    if (snapshot !== undefined) {
      if (!snapshot || snapshot.version !== 1 || snapshot.materialId !== work.materialId) {
        return { work, quantity: null, unit: "", cost: null, reason: "invalid_usage_snapshot" };
      }
      const quantity = snapshot.unit && validQuantity(snapshot.quantity) ? snapshot.quantity : null;
      const cost = validQuantity(snapshot.cost) ? snapshot.cost : null;
      return { work, quantity, unit: snapshot.unit || "", cost,
        reason: snapshot.reason || (cost === null ? "snapshot_cost_unknown" : "") };
    }
    const explicitUnit = typeof work.unit === "string" && work.unit.trim() || typeof work.amountUnit === "string" && work.amountUnit.trim() || "";
    const parsed = R.materialQuantities.parse(work.amount, explicitUnit);
    return { work, quantity: parsed && validQuantity(parsed.quantity) ? parsed.quantity : null,
      unit: parsed && parsed.unit || "", cost: null, reason: "historical_cost_unknown" };
  }
  function annualCosts(materialId, season) {
    const materials = (R.state.data().materials || []).filter(material => material.materialId && (materialId === "" || material.materialId === materialId));
    const purchases = materials.flatMap(material => purchasesFor(material).filter(row => String(row.season) === String(season)));
    const costs = purchases.map(row => R.materialPurchases.amount(row));
    const usageRows = actualWorks(new Set(materials.map(material => material.materialId)), season).map(usage);
    return U.clone({ purchaseCost: knownTotal(costs), unpricedPurchases: costs.filter(cost => !validQuantity(cost)).length,
      purchaseCount: purchases.length, usageCost: knownTotal(usageRows.map(row => row.cost)),
      unpricedUses: usageRows.filter(row => row.cost === null).length, usageCount: usageRows.length, usageRows });
  }
  function planning(materialId, season) {
    const material = materialFor(materialId);
    const result = { material: material || null, season: Number(season), previousYear: Number(season) - 1,
      previousUsage: null, previousUsageCount: 0, unknownUses: 0, stock: null, pending: null, secured: null,
      unit: material && material.unit || "", plan: null };
    if (!material || !validSeason(season)) return U.clone({ ...result, reason: !material ? "material_not_found" : "invalid_season" });
    const uses = actualWorks(new Set([materialId]), result.previousYear).map(usage);
    result.previousUsageCount = uses.length;
    const quantities = uses.map(row => row.unit === result.unit && validQuantity(row.quantity) ? row.quantity : null);
    result.unknownUses = quantities.filter(value => value === null).length;
    result.previousUsage = result.unknownUses ? null : total(quantities);
    const stock = R.materialStock.summary(materialId);
    result.stock = stock.unit === result.unit && validNumber(stock.quantity) ? stock.quantity : null;
    const pending = purchasesFor(material).filter(row => row.deliveryMode === "manual").map(row => {
      const delivery = R.materialPurchases.deliverySummary(row);
      if (!validQuantity(delivery.pending)) return null;
      if (delivery.pending === 0) return 0;
      const converted = R.materialQuantities.convert(delivery.pending, row.unit, result.unit, row.packagingSnapshot);
      return validQuantity(converted) ? converted : null;
    });
    result.pending = pending.some(value => value === null) ? null : total(pending);
    result.secured = result.stock === null || result.pending === null ? null : total([result.stock, result.pending]);
    const plans = (material.purchasePlans || []).filter(row => String(row.season) === String(season));
    result.plan = plans.length === 1 ? plans[0] : null;
    if (plans.length > 1) result.reason = "duplicate_plan_season";
    else if (result.unknownUses) result.reason = "previous_usage_unknown";
    else if (result.stock === null) result.reason = "stock_unknown";
    else if (result.pending === null) result.reason = "pending_unknown";
    else if (result.previousUsage === null || result.secured === null) result.reason = "quantity_overflow";
    return U.clone(result);
  }
  function savePlan(materialId, input) {
    error = "";
    try {
      const material = materialFor(materialId), record = input || {};
      if (!material) throw Error("資材が見つかりません。");
      if (!validSeason(record.season)) throw Error("年度は1900〜2200の整数で入力してください。");
      if (!["number", "string"].includes(typeof record.quantity) || String(record.quantity).trim() === "" || !validQuantity(Number(record.quantity))) throw Error("計画数量は0以上の安全な数値で入力してください。");
      const unit = typeof record.unit === "string" ? record.unit.trim() : "";
      if (!unit || unit !== String(material.unit || "").trim()) throw Error("計画の単位を資材の管理単位に合わせてください。");
      if (material.purchasePlans !== undefined && !Array.isArray(material.purchasePlans)) throw Error("購入計画の形式を確認してください。");
      const plans = material.purchasePlans || [], matches = plans.filter(row => String(row.season) === String(record.season));
      if (matches.length > 1) throw Error("同じ年度の購入計画が重複しています。");
      const previous = matches[0];
      if (previous && (typeof previous.planId !== "string" || !previous.planId || plans.filter(row => row.planId === previous.planId).length !== 1)) throw Error("既存の購入計画IDを確認してください。");
      if (record.planId !== undefined && (!previous || record.planId !== previous.planId)) throw Error("購入計画が見つかりません。開き直してください。");
      const now = U.now();
      const saved = { ...previous, planId: previous ? previous.planId : U.id("purchase-plan", U.today()),
        season: Number(record.season), quantity: Number(record.quantity), unit, memo: String(record.memo || ""),
        createdAt: previous ? previous.createdAt : now, updatedAt: now };
      if (!saved.planId || plans.some(row => row !== previous && row.planId === saved.planId)) throw Error("購入計画IDが重複しています。");
      const next = previous ? plans.map(row => row === previous ? saved : row) : [...plans, saved];
      if (!R.state.saveMaterial({ materialId, purchasePlans: U.clone(next) })) throw Error("購入計画を保存できませんでした。");
      return U.clone(saved);
    } catch (e) { error = e.message || "購入計画を保存できませんでした。"; return null; }
  }
  R.materialPlanning = { annualCosts, planning, savePlan, get lastError() { return error; } };
})();
