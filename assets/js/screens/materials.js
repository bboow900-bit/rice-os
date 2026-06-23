(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  function firstNumber(value) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function unitText(value) {
    return String(value || "").replace(/-?\d+(?:[,.]\d+)?/g, "").trim();
  }

  function autoUsage(material) {
    const name = String(material.name || "").trim();
    if (!name) return { text: "", number: null };
    const rows = state.data().fieldWorks.filter((work) => String(work.material || "").includes(name));
    if (!rows.length) return { text: "", number: null };
    const nums = rows.map((work) => firstNumber(work.amount)).filter((n) => n !== null);
    const unit = unitText(rows[0].amount || "");
    const text = rows.map((work) => `${U.fd(work.date)} ${work.amount || "使用"}`).join(" / ");
    if (nums.length === rows.length) return { text, number: nums.reduce((sum, n) => sum + n, 0), unit };
    return { text, number: null, unit };
  }

  function calculatedRemaining(material) {
    if (String(material.remaining || "").trim()) return material.remaining;
    const carryover = firstNumber(material.carryover);
    const ordered = firstNumber(material.ordered);
    const manualUsed = firstNumber(material.used);
    const usage = autoUsage(material);
    const used = manualUsed !== null ? manualUsed : usage.number;
    if (carryover === null && ordered === null) return "";
    if (used === null) return "";
    const value = (carryover || 0) + (ordered || 0) - used;
    const unit = unitText(material.ordered || material.carryover || material.used || "") || usage.unit || "";
    return `${Math.round(value * 100) / 100}${unit}`;
  }

  function resetForm() {
    U.$("mSeason").value = new Date().getFullYear();
    U.$("mCategory").value = "肥料";
    U.$("mName").value = "";
    U.$("mDeliveryDate").value = "";
    U.$("mCarryover").value = "";
    U.$("mOrdered").value = "";
    U.$("mUsed").value = "";
    U.$("mRemaining").value = "";
    U.$("mMemo").value = "";
  }

  function renderList() {
    const rows = state.data().materials.slice().sort((a, b) => Number(b.season) - Number(a.season) || String(b.deliveryDate).localeCompare(String(a.deliveryDate)));
    U.$("materialList").innerHTML = rows.length ? rows.map((m) => {
      const usage = autoUsage(m);
      const remaining = calculatedRemaining(m);
      return `
        <article class="record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(m.season)} ${U.escapeHTML(m.category)}・${U.escapeHTML(m.name || "名称未入力")}</b><br>
              ${m.deliveryDate ? `<span class="pill info">納品 ${U.escapeHTML(U.fd(m.deliveryDate))}</span>` : ""}
              ${remaining ? `<span class="pill warn">在庫 ${U.escapeHTML(remaining)}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            <div class="metric-row">
              <span>前年繰越 <b>${U.escapeHTML(m.carryover || "-")}</b></span>
              <span>今年購入 <b>${U.escapeHTML(m.ordered || "-")}</b></span>
              <span>使用数 <b>${U.escapeHTML(m.used || (usage.number !== null ? String(usage.number) : "-"))}</b></span>
            </div>
            ${usage.text ? `<div class="muted">作業入力から: ${U.escapeHTML(usage.text)}</div>` : ""}
            ${m.nextYearMemo ? `<div>${U.escapeHTML(m.nextYearMemo)}</div>` : ""}
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">資材台帳はまだありません。</div>';
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
        carryover: U.$("mCarryover").value,
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
