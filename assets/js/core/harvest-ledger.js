(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const state = R.state;

  function scopes() {
    const data = state.data();
    const rows = [...(data.millingRecords || []), ...(data.shipments || []), ...(data.varietyResults || []), ...(data.shipmentIssues || [])];
    return {
      seasons: [...new Set([Number(R.utils.today().slice(0, 4)), ...rows.map(row => Number(row.season)).filter(year => R.schema.validCropYear(year))])].sort((a, b) => b - a),
      varieties: [...new Set([...state.varieties().map(row => row.varietyId), ...rows.map(row => row.varietyId).filter(Boolean)])].map(id => ({ varietyId: id, name: (state.variety(id) || {}).name || "保存済みの品種" }))
    };
  }
  function packageKg(row) {
    if (!Array.isArray(row.packages) || !row.packages.length) return null;
    let kg = 0;
    for (const item of row.packages) {
      if (!item || typeof item.kg !== "number" || !Number.isFinite(item.kg) || item.kg <= 0 || !Number.isSafeInteger(item.bags) || item.bags <= 0) return null;
      kg += item.kg * item.bags;
    }
    return Number.isFinite(kg) ? kg : null;
  }
  function read(season, varietyId) {
    const valid = R.schema.validCropYear(season) && Boolean(varietyId);
    const stock = state.riceStockFor(season, varietyId);
    const shipments = valid ? state.shipments().filter(row => row.season === Number(season) && row.varietyId === varietyId) : [];
    const milling = valid ? state.millingRecordsFor({ season, varietyId }) : [];
    const legacy = valid ? (state.data().varietyResults || []).filter(row => row.season === Number(season) && row.varietyId === varietyId) : [];
    const totals = { outgoingKg: 0, giftKg: 0, householdKg: 0, salesYen: 0, pricedCount: 0, unpricedCount: 0 };
    const add = (key, value, integer) => {
      if (totals[key] === null) return;
      const sum = totals[key] + value;
      totals[key] = Number.isFinite(sum) && (!integer || Number.isSafeInteger(sum)) ? sum : null;
    };
    shipments.forEach(row => {
      const kg = packageKg(row);
      // Match riceStockFor's brown-rice eligibility; never convert white rice.
      if (kg !== null && row.riceType === "brown" && !row.inventoryRiceTypeUnverified && ["shipment", "sale", "gift", "household"].includes(row.kind)) add(row.kind === "household" ? "householdKg" : row.kind === "gift" ? "giftKg" : "outgoingKg", kg);
      if (!["shipment", "sale"].includes(row.kind)) return;
      const price = row.pricePer60Kg;
      const amount = kg === null ? null : Math.round(kg * Number(price) / 60);
      if (kg !== null && price !== null && price !== undefined && /^\d+$/.test(String(price).trim()) && Number.isSafeInteger(Number(price)) && Number.isSafeInteger(amount)) {
        add("salesYen", amount, true); totals.pricedCount++;
      } else totals.unpricedCount++;
    });
    const history = [...shipments.map(row => ({ type: "shipment", id: row.shipmentId, date: row.date, label: row.kind === "household" ? "自家用" : row.recipient || "相手先未設定", kg: packageKg(row), kind: row.kind })),
      ...milling.map(row => ({ type: "milling", id: row.millingId, date: row.date, label: "収量", kg: state.millingRecordTotals(row).kg }))]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
    return { season: Number(season), varietyId, stock, ...totals,
      performance: valid ? state.harvestPerformanceFor(season).find(row => row.varietyId === varietyId) || null : null,
      legacyCount: legacy.length, history };
  }
  R.harvestLedger = { read, scopes };
})();
