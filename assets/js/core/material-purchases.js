(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils, state = R.state;
  let error = "";
  const blank = value => value == null || typeof value === "string" && !value.trim();
  function number(value) {
    if (!["string", "number"].includes(typeof value) || blank(value)) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`), year = Number(value.slice(0, 4));
    return year >= 1900 && year <= 2200 && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function material(id) { return state.data().materials.find(row => row.materialId === id); }
  function read(id) {
    const row = material(id);
    if (!row) throw Error("資材が見つかりません。台帳を開き直してください。");
    if (row.purchases !== undefined && !Array.isArray(row.purchases)) throw Error("購入履歴の形式を確認できないため更新できません。");
    return row.purchases || [];
  }
  function subtotal(row) {
    const price = number(row?.unitPrice), quantity = number(row?.quantity);
    if (price == null || !Number.isSafeInteger(price) || price < 0 || quantity == null || quantity <= 0) return null;
    const total = price * quantity;
    return Number.isSafeInteger(total) && total >= 0 ? total : null;
  }
  function amount(row) {
    if (!blank(row?.totalAmount)) {
      const total = number(row.totalAmount);
      return total != null && Number.isSafeInteger(total) && total >= 0 ? total : null;
    }
    return subtotal(row);
  }
  function records(id, options = {}) {
    try {
      const rows = read(id);
      return U.clone(rows.filter(row => row && typeof row === "object" && (!options.season || String(row.season || String(row.date || "").slice(0, 4)) === String(options.season))));
    } catch (_) { return []; }
  }
  function savePurchase(id, input) {
    error = "";
    try {
      const rows = read(id), record = input || {};
      const matches = record.purchaseId ? rows.filter(row => row?.purchaseId === record.purchaseId) : [];
      if (record.purchaseId && matches.length !== 1) throw Error("購入記録が見つからないか重複しています。履歴を開き直してください。");
      if (!validDate(record.date)) throw Error("実在する購入日を入力してください。");
      const season = number(record.season), quantity = number(record.quantity);
      if (!Number.isInteger(season) || season < 1900 || season > 2200) throw Error("年度は1900〜2200の整数で入力してください。");
      if (quantity == null || quantity <= 0 || quantity > Number.MAX_SAFE_INTEGER) throw Error("数量は正の数値で入力してください。");
      if (typeof record.unit !== "string" || !record.unit.trim()) throw Error("数量の単位を入力してください。");
      const money = (value, label) => {
        if (blank(value)) return "";
        const result = number(value);
        if (result == null || !Number.isSafeInteger(result) || result < 0) throw Error(`${label}は0以上の安全な整数円で入力してください。`);
        return result;
      };
      const unitPrice = money(record.unitPrice, "税込単価"), totalAmount = money(record.totalAmount, "税込総額");
      if (unitPrice !== "" && subtotal({unitPrice, quantity}) == null) throw Error("単価×数量が整数円の安全な範囲に収まるよう入力してください。");
      const previous = matches[0] || {};
      const saved = {...previous, purchaseId:previous.purchaseId || U.id("purchase", record.date), date:record.date, season, supplier:String(record.supplier || "").trim(), quantity, unit:record.unit.trim(), unitPrice, totalAmount, memo:String(record.memo || ""), createdAt:previous.createdAt || U.now(), updatedAt:U.now()};
      const next = rows.slice(), index = previous.purchaseId ? rows.indexOf(previous) : -1;
      if (index >= 0) next[index] = saved; else next.push(saved);
      if (!state.saveMaterial({materialId:id, purchases:next})) throw Error(state.lastError || "購入履歴を保存できませんでした。入力は保持しています。");
      return U.clone(saved);
    } catch (e) { error = e.message || "購入履歴を保存できませんでした。"; return null; }
  }
  function deletePurchase(id, purchaseId) {
    error = "";
    try {
      const rows = read(id);
      if (!purchaseId || rows.filter(row => row?.purchaseId === purchaseId).length !== 1) throw Error("購入記録が見つからないか重複しています。");
      if (!state.saveMaterial({materialId:id, purchases:rows.filter(row => row?.purchaseId !== purchaseId)})) throw Error(state.lastError || "購入記録を削除できませんでした。");
      return true;
    } catch (e) { error = e.message || "購入記録を削除できませんでした。"; return false; }
  }
  R.materialPurchases = {records, savePurchase, deletePurchase, subtotal, amount, get lastError() { return error; }};
})();
