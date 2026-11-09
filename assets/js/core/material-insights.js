(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils;
  const clone = value => U.clone(value);
  const hasId = value => typeof value === "string" && value.length > 0;
  const materials = () => R.state.data().materials || [];
  const materialFor = id => hasId(id) ? materials().find(row => row.materialId === id) : undefined;
  const purchasesFor = id => R.materialPurchases.records(id);

  function previousPurchases(materialId, year) {
    if (!materialFor(materialId) || !/^\d{4}$/.test(String(year))) return [];
    const previousYear = Number(year) - 1;
    return clone(purchasesFor(materialId).filter(row => String(row.season) === String(previousYear))
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))));
  }

  function pendingPurchases({ year = "all", category = "all", status = "all" } = {}) {
    const today = U.today();
    const result = [];
    materials().filter(material => hasId(material.materialId) && (category === "all" || material.category === category)).forEach(material => {
      purchasesFor(material.materialId).forEach(row => {
        if (row.deliveryMode !== "manual" || year !== "all" && String(row.season) !== String(year)) return;
        const delivery = R.materialPurchases.deliverySummary(row, today);
        if (!(delivery.pending > 0)) return;
        const rowStatus = row.expectedDeliveryDate && row.expectedDeliveryDate < today ? "overdue"
          : delivery.received > 0 ? "partial" : "waiting";
        if (status === "all" || status === rowStatus) result.push({ material, row, delivery, status: rowStatus });
      });
    });
    const rank = { overdue: 0, partial: 1, waiting: 2 };
    const compareDate = (a, b) => !a !== !b ? (a ? -1 : 1) : String(a || "").localeCompare(String(b || ""));
    result.sort((a, b) => rank[a.status] - rank[b.status]
      || compareDate(a.row.expectedDeliveryDate, b.row.expectedDeliveryDate)
      || compareDate(a.row.date, b.row.date)
      || a.material.materialId.localeCompare(b.material.materialId)
      || String(a.row.purchaseId || "").localeCompare(String(b.row.purchaseId || "")));
    return clone(result);
  }

  function stockEvidence(materialId) {
    const summary = R.materialStock.summary(materialId);
    const material = materialFor(materialId);
    const purchases = material ? purchasesFor(materialId) : [];
    const works = (R.state.data().fieldWorks || []).filter(work => hasId(materialId) && work.materialId === materialId);
    const entries = (summary.ledger || []).map(entry => {
      let source = {};
      if (entry.kind === "purchase" && hasId(entry.id)) {
        // Match actual IDs, not a guessed split: IDs may themselves contain the delimiter.
        const matches = purchases.flatMap(purchase => {
          if (!hasId(purchase.purchaseId)) return [];
          const sources = purchase.purchaseId === entry.id ? [{ purchaseId: purchase.purchaseId, sourceStableId: purchase.purchaseId }] : [];
          (purchase.receipts || []).filter(receipt => !receipt.deletedAt && hasId(receipt.receiptId)).forEach(receipt => {
            if (`${purchase.purchaseId}:receipt:${receipt.receiptId}` === entry.id) sources.push({ purchaseId: purchase.purchaseId, receiptId: receipt.receiptId, sourceStableId: entry.id });
          });
          return sources;
        });
        if (matches.length === 1) source = matches[0];
      } else if (entry.kind === "usage" && hasId(entry.id)) {
        const matches = works.filter(work => work.workId === entry.id);
        if (matches.length === 1) source = { workId: matches[0].workId, sourceStableId: matches[0].workId };
      }
      return { ...entry, ...source };
    });
    if (summary.stocktake) {
      const row = summary.stocktake;
      entries.unshift({ ...row, kind: "stocktake", included: true, reason: "stocktake_baseline",
        ...(hasId(row.stocktakeId) ? { id: row.stocktakeId, stocktakeId: row.stocktakeId, sourceStableId: row.stocktakeId } : {}) });
    }
    return clone({ summary, entries });
  }

  R.materialInsights = { previousPurchases, pendingPurchases, stockEvidence };
})();
