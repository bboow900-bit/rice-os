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
    U.$("rGrade").value = "";
    U.$("rSales").value = "";
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
              ${r.areaA ? `<span class="pill info">面積 ${U.escapeHTML(r.areaA)}a</span>` : ""}
              ${r.yield ? `<span class="pill ok">収量 ${U.escapeHTML(r.yield)}</span>` : ""}
              ${r.grade ? `<span class="pill warn">等級 ${U.escapeHTML(r.grade)}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            ${r.salesAmount ? `<div>販売額: ${U.escapeHTML(r.salesAmount)}</div>` : ""}
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
        grade: U.$("rGrade").value,
        salesAmount: U.$("rSales").value,
        quality: U.$("rQuality").value,
        reflection: U.$("rReflection").value
      });
      resetForm();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.results = { render, bind, resetForm };
})();
