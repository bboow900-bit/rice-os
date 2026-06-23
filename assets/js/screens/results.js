(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  function resetForm() {
    U.$("rSeason").value = new Date().getFullYear();
    if (state.varieties()[0]) U.$("rVariety").value = state.varieties()[0].varietyId;
    U.$("rAreaA").value = "";
    U.$("rYield").value = "";
    U.$("rYieldPer10a").value = "";
    U.$("rFirstGradeRate").value = "";
    U.$("rShipped").value = "";
    U.$("rSales").value = "";
    U.$("rSalesPer10a").value = "";
    U.$("rQuality").value = "";
    U.$("rReflection").value = "";
  }

  function renderList() {
    const rows = state.data().varietyResults.slice().sort((a, b) => Number(b.season) - Number(a.season));
    U.$("resultList").innerHTML = rows.length ? rows.map((r) => {
      const variety = state.variety(r.varietyId);
      return `
        <article class="record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(r.season)} ${U.escapeHTML(variety && variety.name || "品種未設定")}</b><br>
              ${r.areaA ? `<span class="pill info">作付 ${U.escapeHTML(r.areaA)}a</span>` : ""}
              ${r.yield ? `<span class="pill ok">収量 ${U.escapeHTML(r.yield)}</span>` : ""}
              ${r.yieldPer10a ? `<span class="pill ok">10a ${U.escapeHTML(r.yieldPer10a)}</span>` : ""}
              ${r.firstGradeRate ? `<span class="pill warn">1等米率 ${U.escapeHTML(r.firstGradeRate)}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            <div class="metric-row">
              <span>売渡 <b>${U.escapeHTML(r.shippedQuantity || "-")}</b></span>
              <span>販売額 <b>${U.escapeHTML(r.salesAmount || "-")}</b></span>
              <span>10a販売額 <b>${U.escapeHTML(r.salesPer10a || "-")}</b></span>
            </div>
            ${r.quality ? `<div>品質: ${U.escapeHTML(r.quality)}</div>` : ""}
            ${r.reflection ? `<div>${U.escapeHTML(r.reflection)}</div>` : ""}
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">品種結果はまだありません。</div>';
  }

  function render() {
    U.setOptions(U.$("rVariety"), state.varieties().map((v) => ({ value: v.varietyId, label: v.name })), U.$("rVariety").value);
    if (!U.$("rSeason").value) U.$("rSeason").value = new Date().getFullYear();
    renderList();
  }

  function bind() {
    U.$("resultForm").addEventListener("submit", (event) => {
      event.preventDefault();
      state.saveResult({
        season: U.$("rSeason").value,
        varietyId: U.$("rVariety").value,
        areaA: U.$("rAreaA").value,
        yield: U.$("rYield").value,
        yieldPer10a: U.$("rYieldPer10a").value,
        firstGradeRate: U.$("rFirstGradeRate").value,
        shippedQuantity: U.$("rShipped").value,
        salesAmount: U.$("rSales").value,
        salesPer10a: U.$("rSalesPer10a").value,
        quality: U.$("rQuality").value,
        reflection: U.$("rReflection").value
      });
      resetForm();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.results = { render, bind, resetForm };
})();
