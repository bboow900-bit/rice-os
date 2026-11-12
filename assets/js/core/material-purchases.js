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
  function deliverySummary(purchase, asOf = U.today()) {
    const legacy = purchase.deliveryMode === undefined;
    const received = legacy ? (purchase.date <= asOf ? number(purchase.quantity) || 0 : 0)
      : sum((purchase.receipts || []).filter(r => !r.deletedAt && r.date <= asOf).map(r => r.quantity));
    const cancelled = legacy ? 0 : sum((purchase.cancellations || []).filter(r => !r.deletedAt && r.date <= asOf).map(r => r.quantity));
    return {received, pending:sum([number(purchase.quantity) || 0, -received, -cancelled]), legacy, cancelled};
  }
  function sum(values) {
    const parts = values.map(value => {
      const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
      return {value:BigInt(mantissa.replace(".", "")), scale:(mantissa.split(".")[1] || "").length - Number(exponent)};
    });
    const scale = parts.reduce((n, p) => Math.max(n, p.scale), 0);
    return Number(`${parts.reduce((n, p) => n + p.value * 10n ** BigInt(scale - p.scale), 0n)}e${-scale}`);
  }
  function saveReceipt(id, purchaseId, input) {
    error = "";
    try {
      const rows = read(id), matches = rows.filter(p => p.purchaseId === purchaseId), record = input || {};
      if (matches.length !== 1 || matches[0].deliveryMode !== "manual") throw Error("手動入庫の購入記録を選択してください。");
      const purchase = matches[0], receipts = purchase.receipts || [];
      const previous = record.receiptId ? receipts.find(r => r.receiptId === record.receiptId && !r.deletedAt) : null;
      if (record.receiptId && !previous) throw Error("入庫履歴が見つかりません。");
      const quantity = number(record.quantity), unit = typeof record.unit === "string" ? record.unit.trim() : "";
      if (!validDate(record.date) || record.date > U.today()) throw Error("実在する入庫日を入力してください。未来入庫はできません。");
      const masterUnit = String(material(id).unit || "").trim();
      const converted = R.materialQuantities ? R.materialQuantities.convert(quantity, unit, masterUnit, purchase.packagingSnapshot) : unit === masterUnit ? quantity : null;
      if (quantity === null || quantity <= 0 || quantity > Number.MAX_SAFE_INTEGER || unit !== purchase.unit || converted === null) throw Error("入庫数量と購入時・資材登録の単位を確認してください。");
      if (sum([...receipts.filter(r => !r.deletedAt && r !== previous).map(r => r.quantity), ...(purchase.cancellations || []).filter(r => !r.deletedAt).map(r => r.quantity), quantity]) > purchase.quantity) throw Error("入庫数と注文取消数の合計が購入数量を超えています。");
      const saved = {...previous, receiptId:previous?.receiptId || U.id("receipt", record.date), date:record.date, quantity, unit, memo:String(record.memo || ""), createdAt:previous?.createdAt || U.now()};
      const nextReceipts = previous ? receipts.map(r => r === previous ? saved : r) : [...receipts, saved];
      if (!state.saveMaterial({materialId:id, purchases:rows.map(p => p === purchase ? {...p, receipts:nextReceipts} : p)})) throw Error(state.lastError || "入庫を保存できませんでした。");
      return U.clone(saved);
    } catch (e) { error = e.message; return null; }
  }
  function deleteReceipt(id, purchaseId, receiptId) {
    error = "";
    try {
      const rows = read(id), matches = rows.filter(p => p.purchaseId === purchaseId);
      const purchase = matches.length === 1 && matches[0];
      const receipt = purchase && purchase.deliveryMode === "manual" && purchase.receipts.find(r => r.receiptId === receiptId && !r.deletedAt);
      if (!receipt) throw Error("入庫履歴が見つかりません。");
      if (!state.saveMaterial({materialId:id, purchases:rows.map(p => p === purchase ? {...p, receipts:p.receipts.map(r => r === receipt ? {...r, deletedAt:U.now()} : r)} : p)})) throw Error(state.lastError || "入庫を削除できませんでした。");
      return true;
    } catch (e) { error = e.message; return false; }
  }
  function saveCancellation(id, purchaseId, input) {
    error = "";
    try {
      const rows = read(id), matches = rows.filter(p => p.purchaseId === purchaseId), record = input || {};
      if (matches.length !== 1 || matches[0].deliveryMode !== "manual") throw Error("手動入庫の購入記録を選択してください。");
      const purchase = matches[0], cancellations = purchase.cancellations || [];
      const previous = record.cancellationId ? cancellations.find(r => r.cancellationId === record.cancellationId && !r.deletedAt) : null;
      if (record.cancellationId && !previous) throw Error("注文取消履歴が見つかりません。");
      const quantity = number(record.quantity), reason = typeof record.reason === "string" ? record.reason.trim() : "";
      if (!validDate(record.date) || record.date > U.today()) throw Error("実在する注文取消日を入力してください。未来日は指定できません。");
      if (quantity === null || quantity <= 0 || quantity > Number.MAX_SAFE_INTEGER || !reason) throw Error("正の取消数量と取消理由を入力してください。");
      const committed = [...(purchase.receipts || []).filter(r => !r.deletedAt), ...cancellations.filter(r => !r.deletedAt && r !== previous)];
      if (sum([...committed.map(r => r.quantity), quantity]) > purchase.quantity) throw Error("未納品数を超える注文取消はできません。");
      const saved = {...previous, cancellationId:previous?.cancellationId || U.id("cancellation", record.date), date:record.date, quantity, reason, createdAt:previous?.createdAt || U.now()};
      const next = previous ? cancellations.map(r => r === previous ? saved : r) : [...cancellations, saved];
      if (!state.saveMaterial({materialId:id, purchases:rows.map(p => p === purchase ? {...p, cancellations:next} : p)})) throw Error(state.lastError || "注文取消を保存できませんでした。");
      return U.clone(saved);
    } catch (e) { error = e.message; return null; }
  }
  function deleteCancellation(id, purchaseId, cancellationId) {
    error = "";
    try {
      const rows = read(id), matches = rows.filter(p => p.purchaseId === purchaseId);
      const purchase = matches.length === 1 && matches[0];
      const cancellation = purchase && purchase.deliveryMode === "manual" && (purchase.cancellations || []).find(r => r.cancellationId === cancellationId && !r.deletedAt);
      if (!cancellation) throw Error("注文取消履歴が見つかりません。");
      if (!state.saveMaterial({materialId:id, purchases:rows.map(p => p === purchase ? {...p, cancellations:p.cancellations.map(r => r === cancellation ? {...r, deletedAt:U.now()} : r)} : p)})) throw Error(state.lastError || "注文取消を取り消せませんでした。");
      return true;
    } catch (e) { error = e.message; return false; }
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
      const expectedDeliveryDate = record.expectedDeliveryDate ?? previous.expectedDeliveryDate ?? "";
      if (expectedDeliveryDate !== "" && !validDate(expectedDeliveryDate)) throw Error("納品予定日を確認してください。未定の場合は空欄にしてください。");
      if ((previous.receipts?.length || previous.cancellations?.length) && (quantity < previous.quantity || record.unit.trim() !== previous.unit)) throw Error("納品・注文取消履歴のある購入の数量縮小・単位変更はできません。");
      const saved = {...previous, purchaseId:previous.purchaseId || U.id("purchase", record.date), date:record.date, season, supplier:String(record.supplier || "").trim(), quantity, unit:record.unit.trim(), unitPrice, totalAmount, memo:String(record.memo || ""), createdAt:previous.createdAt || U.now(), updatedAt:U.now()};
      if (!previous.purchaseId) Object.assign(saved, {deliveryMode:"manual", expectedDeliveryDate, receipts:[], packagingSnapshot:U.clone(material(id).packaging || null)});
      else saved.expectedDeliveryDate = expectedDeliveryDate;
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
      const purchase = rows.find(row => row.purchaseId === purchaseId);
      if (purchase.receipts?.length || purchase.cancellations?.length) throw Error("納品・注文取消履歴のある購入は削除できません。");
      if (!state.saveMaterial({materialId:id, purchases:rows.filter(row => row?.purchaseId !== purchaseId)})) throw Error(state.lastError || "購入記録を削除できませんでした。");
      return true;
    } catch (e) { error = e.message || "購入記録を削除できませんでした。"; return false; }
  }
  R.materialPurchases = {records, savePurchase, deletePurchase, saveReceipt, deleteReceipt, saveCancellation, deleteCancellation, deliverySummary, quantitySum:sum, subtotal, amount, get lastError() { return error; }};
})();
