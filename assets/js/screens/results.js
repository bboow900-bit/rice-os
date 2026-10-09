(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let editingResult = null;

  function renderFormState() {
    const editing = Boolean(editingResult);
    U.$("editResultId").value = editing ? editingResult.resultId : "";
    U.$("resultFormHeading").textContent = editing ? "品種結果を編集" : "品種結果を登録";
    const scope = U.$("resultEditScope");
    scope.hidden = !editing;
    if (editing) {
      const variety = state.variety(editingResult.varietyId);
      const field = editingResult.fieldId && state.field(editingResult.fieldId);
      scope.textContent = `${editingResult.season}年 / ${variety && variety.name || editingResult.varietyId || "品種未設定"} / ${editingResult.fieldId ? `圃場指定: ${field && field.name || editingResult.fieldId}` : "品種集計"}`;
    }
    U.$("resultReset").textContent = editing ? "編集を取消" : "入力をクリア";
    U.$("resultSave").textContent = editing ? "変更を保存" : "品種結果を保存";
  }

  function renderVarietyOptions(selected = U.$("rVariety").value) {
    const options = state.varieties().map((v) => ({ value: v.varietyId, label: v.name }));
    if (!selected) options.unshift({ value: "", label: "品種未設定" });
    if (selected && !options.some((option) => option.value === selected)) options.push({ value: selected, label: `旧品種: ${selected}` });
    U.setOptions(U.$("rVariety"), options, selected);
  }

  function resetForm() {
    editingResult = null;
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
    renderVarietyOptions(state.varieties()[0]?.varietyId || "");
    renderFormState();
  }

  function editResult(resultId) {
    const record = state.data().varietyResults.find((row) => row.resultId === resultId);
    if (!record) { alert("この結果は見つかりません。一覧を確認してください。"); return false; }
    editingResult = U.clone(record);
    const inputs = { rSeason: "season", rVariety: "varietyId", rAreaA: "areaA", rYield: "yield", rYieldPer10a: "yieldPer10a",
      rFirstGradeRate: "firstGradeRate", rShipped: "shippedQuantity", rSales: "salesAmount", rSalesPer10a: "salesPer10a", rQuality: "quality", rReflection: "reflection" };
    Object.entries(inputs).forEach(([id,key]) => { U.$(id).value = record[key] ?? ""; });
    renderVarietyOptions(record.varietyId || "");
    renderFormState();
    const form = U.$("resultForm");
    form.querySelector("details").open = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  function renderList() {
    const rows = state.data().varietyResults.slice().sort((a, b) => Number(b.season) - Number(a.season));
    U.$("resultList").innerHTML = rows.length ? rows.map((r) => {
      const variety = state.variety(r.varietyId);
      const field = r.fieldId && state.field(r.fieldId);
      return `
        <article class="record" data-result-id="${U.attr(r.resultId)}">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(r.season)} ${U.escapeHTML(variety && variety.name || r.varietyId || "品種未設定")}</b><br>
              <span class="muted">${r.fieldId ? `圃場指定: ${U.escapeHTML(field && field.name || r.fieldId)}` : "品種集計"}</span><br>
              ${r.areaA ? `<span class="pill info">作付 ${U.escapeHTML(r.areaA)}a</span>` : ""}
              ${r.yield ? `<span class="pill ok">収量 ${U.escapeHTML(r.yield)}</span>` : ""}
              ${r.yieldPer10a ? `<span class="pill ok">10a ${U.escapeHTML(r.yieldPer10a)}</span>` : ""}
              ${r.firstGradeRate ? `<span class="pill warn">1等米率 ${U.escapeHTML(r.firstGradeRate)}</span>` : ""}
            </div>
          </div>
          <div class="record-actions"><button type="button" class="secondary" data-result-action="edit" data-id="${U.attr(r.resultId)}">編集</button><button type="button" class="danger" data-result-action="delete" data-id="${U.attr(r.resultId)}">削除</button></div>
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
    renderVarietyOptions();
    if (!U.$("rSeason").value) U.$("rSeason").value = new Date().getFullYear();
    renderList();
    renderFormState();
  }

  function bind() {
    U.$("resultForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const current = editingResult && state.data().varietyResults.find((row) => row.resultId === editingResult.resultId);
      if (editingResult && !current) { alert("編集中の結果は削除されています。新規入力へ切り替えてください。"); return; }
      const saved = state.saveResult({
        ...(editingResult || {}),
        ...(current || {}),
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
      if (!saved) return;
      resetForm();
    });
    U.$("resultForm").addEventListener("click", (event) => {
      if (event.target.closest("[data-result-reset], [data-result-new]")) resetForm();
    });
    U.$("resultList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-result-action]");
      if (!button) return;
      const id = button.dataset.id;
      const record = state.data().varietyResults.find((row) => row.resultId === id);
      if (!record) { alert("この結果は見つかりません。一覧を確認してください。"); return; }
      if (button.dataset.resultAction === "edit") { editResult(id); return; }
      if (button.dataset.resultAction !== "delete" || !confirm(`${record.season}年のこの品種結果を削除しますか？`)) return;
      if (typeof state.deleteResult !== "function") { alert("削除処理を利用できません。再読み込みしてください。"); return; }
      if (!state.deleteResult(id)) return;
      if (editingResult && editingResult.resultId === id) resetForm();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.results = { render, bind, resetForm, editResult };
})();
