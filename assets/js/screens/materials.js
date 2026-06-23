(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  function resetForm() {
    U.$("mSeason").value = new Date().getFullYear();
    U.$("mCategory").value = "肥料";
    U.$("mName").value = "";
    U.$("mDeliveryDate").value = "";
    U.$("mOrdered").value = "";
    U.$("mUsed").value = "";
    U.$("mRemaining").value = "";
    U.$("mMemo").value = "";
  }

  function renderList() {
    const rows = state.data().materials.slice().sort((a, b) => Number(b.season) - Number(a.season) || String(b.deliveryDate).localeCompare(String(a.deliveryDate)));
    U.$("materialList").innerHTML = rows.length ? rows.map((m) => `
      <article class="record">
        <div class="record-head">
          <div>
            <b>${U.escapeHTML(m.season)} ${U.escapeHTML(m.category)}：${U.escapeHTML(m.name || "名称未入力")}</b><br>
            ${m.deliveryDate ? `<span class="pill info">納品 ${U.escapeHTML(U.fd(m.deliveryDate))}</span>` : ""}
            ${m.remaining ? `<span class="pill warn">残量 ${U.escapeHTML(m.remaining)}</span>` : ""}
          </div>
        </div>
        <div class="record-body">
          <span class="pill ok">注文 ${U.escapeHTML(m.ordered || "-")}</span>
          <span class="pill info">使用 ${U.escapeHTML(m.used || "-")}</span>
          ${m.nextYearMemo ? `<div>${U.escapeHTML(m.nextYearMemo)}</div>` : ""}
        </div>
      </article>
    `).join("") : '<div class="empty">資材記録はまだありません。</div>';
  }

  function render() {
    U.setOptions(U.$("mCategory"), S.MATERIAL_CATEGORIES, U.$("mCategory").value || "肥料");
    if (!U.$("mSeason").value) U.$("mSeason").value = new Date().getFullYear();
    renderList();
  }

  function bind() {
    U.$("materialForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!U.$("mName").value.trim()) {
        alert("資材名を入力してください。");
        return;
      }
      state.saveMaterial({
        season: U.$("mSeason").value,
        category: U.$("mCategory").value,
        name: U.$("mName").value,
        deliveryDate: U.$("mDeliveryDate").value,
        ordered: U.$("mOrdered").value,
        used: U.$("mUsed").value,
        remaining: U.$("mRemaining").value,
        nextYearMemo: U.$("mMemo").value
      });
      resetForm();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.materials = { render, bind, resetForm };
})();
