(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils;
  let error = "";
  const clone = value => JSON.parse(JSON.stringify(value));
  const numeric = value => typeof value === "number" ? (Number.isFinite(value) ? value : null)
    : typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : null;
  // Sum the stored numbers' decimal representations without binary accumulation error.
  function decimalSum(values) {
    const parts = values.map(value => {
      const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
      const decimals = (mantissa.split(".")[1] || "").length;
      return { integer: BigInt(mantissa.replace(".", "")), scale: decimals - Number(exponent) };
    });
    const scale = parts.reduce((max, part) => Math.max(max, part.scale), 0);
    const total = parts.reduce((sum, part) => sum + part.integer * 10n ** BigInt(scale - part.scale), 0n);
    return Number(`${total}e${-scale}`);
  }
  function validDate(value) {
    const time = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + "T00:00:00Z") : NaN;
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function materialFor(value) {
    const material = typeof value === "object" && value ? value : (R.state.data().materials || []).find(m => m.materialId === value);
    if (!material) throw new Error("資材が見つかりません。台帳を開き直してください。");
    return material;
  }
  function usageAmount(work) {
    const explicit = typeof work.unit === "string" && work.unit.trim() || typeof work.amountUnit === "string" && work.amountUnit.trim() || "";
    const direct = numeric(work.amount);
    if (direct !== null) return { quantity: direct, unit: explicit };
    if (typeof work.amount !== "string") return { quantity: null, unit: explicit };
    const match = work.amount.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([^\d\s].*)$/);
    if (!match || /[\/／]/.test(match[2]) || explicit && explicit !== match[2].trim()) return { quantity: null, unit: explicit };
    return { quantity: numeric(match[1]), unit: match[2].trim() };
  }
  function transactions(material) {
    const purchases = (Array.isArray(material.purchases) ? material.purchases : []).flatMap(p => p.deliveryMode === "manual"
      ? (p.receipts || []).filter(r => !r.deletedAt).map(r => ({kind:"purchase", id:p.purchaseId + ":receipt:" + r.receiptId, date:r.date, quantity:numeric(r.quantity), unit:r.unit}))
      : [{ kind: "purchase", id: p.purchaseId, date: p.date, quantity: numeric(p.quantity), unit: typeof p.unit === "string" ? p.unit.trim() : "" }]);
    const usage = (R.state.data().fieldWorks || []).filter(w => w.materialId === material.materialId && material.materialId && R.state.isActualFieldWork(w) && !/計画/.test(String(w.workName || "")))
      .map(w => ({ kind: "usage", id: w.workId, date: w.date, ...usageAmount(w) }));
    return purchases.concat(usage);
  }
  function prepareStocktake(value, input, asOf = U.today()) {
    return buildStocktake(value, input, asOf);
  }
  function buildStocktake(value, input, asOf, previousSnapshot) {
    const material = materialFor(value);
    const quantity = numeric(input.quantity);
    const unit = typeof input.unit === "string" ? input.unit.trim() : "";
    if (!validDate(asOf) || !validDate(input.date) || input.date > asOf || quantity === null || quantity < 0 || quantity > Number.MAX_SAFE_INTEGER || !unit) throw new Error("在庫確認の日付・数量・単位を確認してください。未来の日付は指定できません。");
    if (material.unit && material.unit.trim() !== unit) throw new Error("在庫確認の単位を資材の登録単位と一致させてください。");
    const snapshot = previousSnapshot ? clone(previousSnapshot) : { purchases: [], usage: [] };
    if (!previousSnapshot) transactions(material).filter(t => validDate(t.date) && t.date <= input.date).forEach(t => {
      if (typeof t.id !== "string" || !t.id) throw new Error("確認日以前の購入・使用履歴にIDがありません。元の履歴を確認してください。");
      const snapshotQuantity = Number.isFinite(t.quantity) && t.quantity >= 0 && t.quantity <= Number.MAX_SAFE_INTEGER ? t.quantity : null;
      snapshot[t.kind === "purchase" ? "purchases" : "usage"].push({ id: t.id, date: t.date, quantity: snapshotQuantity, unit: t.unit });
    });
    const maxSequence = (Array.isArray(material.stocktakes) ? material.stocktakes : []).reduce((max, row) =>
      Number.isSafeInteger(row.sequence) && row.sequence >= 0 ? Math.max(max, row.sequence) : max, 0);
    if (maxSequence === Number.MAX_SAFE_INTEGER) throw new Error("在庫確認の履歴番号が上限に達しました。履歴を確認してください。");
    const previous = summary(material, input.date);
    const previousQuantity = previous.quantity;
    const adjustment = previous.exact && previous.unit === unit ? decimalSum([quantity, -previousQuantity]) : null;
    return { stocktakeId: U.id("stocktake", input.date), date: input.date, quantity, unit, memo: String(input.memo || ""), createdAt: U.now(), sequence: maxSequence + 1, snapshot, previousQuantity, adjustment };
  }
  function summary(id, asOf = U.today()) {
    const material = materialFor(id);
    const warnings = [], ledger = [];
    const warn = (code, row) => warnings.push({ code, ...(row ? { kind: row.kind, id: row.id, date: row.date, unit: row.unit } : {}) });
    const anchors = Array.isArray(material.stocktakes) ? material.stocktakes : [];
    let stocktake = null;
    const eligible = anchors.filter(row => {
      if (row.deletedAt || !validDate(row.date) || row.date > asOf) return;
      if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity < 0 || !row.unit || !row.snapshot || !Array.isArray(row.snapshot.purchases) || !Array.isArray(row.snapshot.usage)) { warn("invalid_stocktake"); return; }
      return true;
    });
    const superseded = new Set(eligible.map(row => row.supersedesId).filter(Boolean));
    const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    eligible.filter(row => !superseded.has(row.stocktakeId)).forEach(row => {
      const compare = stocktake && (compareText(row.date, stocktake.date)
        || compareText(String(row.createdAt || ""), String(stocktake.createdAt || ""))
        || compareText(Number.isSafeInteger(row.sequence) && row.sequence >= 0 ? row.sequence : 0,
          Number.isSafeInteger(stocktake.sequence) && stocktake.sequence >= 0 ? stocktake.sequence : 0)
        || compareText(String(row.stocktakeId || ""), String(stocktake.stocktakeId || "")));
      if (!stocktake || compare > 0) stocktake = row;
    });
    if (!validDate(asOf)) warn("invalid_as_of");
    if (!stocktake) warn("no_stocktake");
    if (material.stocktakes !== undefined && !Array.isArray(material.stocktakes)) warn("invalid_stocktakes");
    if (material.purchases !== undefined && !Array.isArray(material.purchases)) warn("invalid_purchases");
    const unit = stocktake ? stocktake.unit : material.unit || "";
    const purchaseQuantities = [], usageQuantities = [];
    const seen = new Set();
    transactions(material).forEach(t => {
      let reason = "included";
      if (stocktake && stocktake.snapshot[t.kind === "purchase" ? "purchases" : "usage"].some(s => s.id === t.id)) reason = "stocktake_snapshot";
      else if (!validDate(t.date)) { reason = "invalid_date"; warn(reason, t); }
      else if (t.date > asOf) reason = "future";
      else if (!stocktake) reason = "no_stocktake";
      else if (t.date < stocktake.date) reason = "before_stocktake";
      else if (!t.id || seen.has(t.kind + ":" + t.id)) { reason = "invalid_transaction_id"; warn(reason, t); }
      else if (t.quantity === null || t.quantity < 0 || t.quantity > Number.MAX_SAFE_INTEGER) { reason = "unknown_quantity"; warn(reason, t); }
      else if (!t.unit || t.unit !== unit) { reason = "unknown_or_mismatched_unit"; warn(reason, t); }
      seen.add(t.kind + ":" + t.id);
      const included = reason === "included";
      if (included) (t.kind === "purchase" ? purchaseQuantities : usageQuantities).push(t.quantity);
      ledger.push({ ...t, included, reason });
    });
    const purchased = decimalSum(purchaseQuantities), used = decimalSum(usageQuantities);
    let quantity = stocktake ? decimalSum([stocktake.quantity, ...purchaseQuantities, ...usageQuantities.map(q => -q)]) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || Math.abs(quantity) > Number.MAX_SAFE_INTEGER)) warn("quantity_overflow");
    if (quantity !== null && quantity < 0) warn("negative_stock");
    const exact = Boolean(stocktake) && !warnings.some(w => w.code !== "negative_stock");
    if (!exact) quantity = null;
    return clone({ quantity, unit, stocktake, purchased, used, warnings, ledger, exact });
  }
  function persist(id, change) {
    error = "";
    try {
      const material = materialFor(id);
      const rows = clone(material.stocktakes || []);
      const row = change(material, rows);
      const result = R.state.saveMaterial({ ...material, stocktakes: rows });
      if (result === false || result === null || result === undefined) {
        const failure = typeof R.state.lastSaveError === "function" ? R.state.lastSaveError() : null;
        throw new Error(failure && failure.message || failure || "資材を保存できませんでした。保存先を確認して再度お試しください。");
      }
      return clone(row);
    } catch (e) { error = e.message; return null; }
  }
  function saveStocktake(id, input) {
    return persist(id, (material, rows) => { const row = prepareStocktake(material, input); rows.push(row); return row; });
  }
  function editStocktake(id, stocktakeId, input) {
    return persist(id, (material, rows) => {
      const previous = rows.find(r => r.stocktakeId === stocktakeId && !r.deletedAt);
      if (!previous) throw new Error("在庫確認の履歴が見つかりません。台帳を開き直してください。");
      const row = { ...buildStocktake(material, input, U.today(), input.date === previous.date ? previous.snapshot : null), supersedesId: stocktakeId };
      row.previousQuantity = previous.quantity;
      row.adjustment = previous.unit === row.unit ? decimalSum([row.quantity, -previous.quantity]) : null;
      rows.push(row); return row;
    });
  }
  function deleteStocktake(id, stocktakeId) {
    return persist(id, (material, rows) => {
      const row = rows.find(r => r.stocktakeId === stocktakeId && !r.deletedAt);
      if (!row) throw new Error("在庫確認の履歴が見つかりません。台帳を開き直してください。");
      row.deletedAt = U.now(); return row;
    });
  }
  R.materialStock = { summary, prepareStocktake, saveStocktake, editStocktake, deleteStocktake, lastError: () => error };
})();
