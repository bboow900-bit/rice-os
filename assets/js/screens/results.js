(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let editingResult = null;
  let millingDraft = null;
  let issueDraft = null;
  let millingOriginal = null;
  let issueOriginal = null;
  let millingError = "";
  let issueError = "";

  function newLedgerDraft() {
    return { date: U.today(),season: U.today().slice(0, 4),varietyId: "",memo: "" };
  }

  function resetMilling() {
    millingOriginal = null;
    millingDraft = { ...newLedgerDraft(),fieldIds: [],packages: [],looseKg: "" };
    millingError = "";
    renderMilling();
  }

  function resetIssue() {
    issueOriginal = null;
    issueDraft = { ...newLedgerDraft(),reason: "",action: "",costYen: "" };
    issueError = "";
    renderIssues();
  }

  function ledgerVarieties(selected) {
    const rows = state.varieties().map(v => ({ value: v.varietyId,label: v.name }));
    if (selected && !rows.some(v => v.value === selected)) rows.push({ value: selected,label: `旧品種: ${selected}` });
    return [{ value: "",label: "品種を選択" },...rows].map(v => `<option value="${U.attr(v.value)}"${v.value === selected ? " selected" : ""}>${U.escapeHTML(v.label)}</option>`).join("");
  }

  function millingRows() {
    return typeof state.millingRecordsFor === "function" ? state.millingRecordsFor({}) : [];
  }

  function issueRows() {
    return typeof state.shipmentIssuesFor === "function" ? state.shipmentIssuesFor({}) : [];
  }

  function numberText(value) {
    return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: 2 }) : "未確認";
  }

  function quantityKg(draft) {
    let total = draft.looseKg === "" || draft.looseKg == null ? 0 : Number(draft.looseKg);
    if (!Number.isFinite(total) || total < 0) return null;
    for (const row of draft.packages || []) {
      const kg = Number(row.kg),bags = Number(row.bags);
      if (!Number.isFinite(kg) || kg <= 0 || !Number.isSafeInteger(bags) || bags <= 0) return null;
      total += kg * bags;
    }
    return Number.isFinite(total) ? total : null;
  }

  function renderMillingSummary() {
    const total = quantityKg(millingDraft);
    const quantity = U.$("millingTotal");
    if (quantity) quantity.textContent = total === null ? "数量を確認してください" : `${numberText(total)}kg / ${numberText(total / 60)}俵（60kg）`;
    const host = U.$("millingStock");
    if (!host) return;
    const year = Number(millingDraft.season);
    if (!millingDraft.varietyId || !Number.isInteger(year) || year < 1900 || year > 2200 || typeof state.riceStockFor !== "function") {
      host.innerHTML = '<p class="muted">年度と品種を選択すると参考在庫を表示します。</p>';
      return;
    }
    const stock = state.riceStockFor(year,millingDraft.varietyId);
    if (!stock) { host.innerHTML = '<p class="muted">参考在庫を確認できません。</p>'; return; }
    host.innerHTML = `<h4>${year}年産の参考在庫</h4><div class="milling-stock-values">${[["籾摺り後",stock.receivedKg],["出荷済み玄米",stock.dispatchedKg],["差引参考在庫",stock.remainingKg]].map(([label,kg]) => `<div><small>${label}</small><b>${numberText(kg)}kg</b><small>${typeof kg === "number" && Number.isFinite(kg) ? `${numberText(kg / 60)}俵（60kg）` : "数量未確認"}</small></div>`).join("")}</div>
      ${stock.remainingKg < 0 ? '<p class="milling-warning">差引がマイナスです。収量・出荷の記録を確認してください。</p>' : ""}
      <p class="muted">白米出荷 ${numberText(stock.whiteShipmentCount)}件は重量換算せず除外。数量不明 ${numberText(stock.unquantifiedCount)}件・品種未分類 ${numberText(stock.unclassifiedCount)}件は集計対象外。</p>`;
  }

  function renderMilling() {
    const host = U.$("millingContent");
    if (!host) return;
    if (!millingDraft) millingDraft = { ...newLedgerDraft(),fieldIds: [],packages: [],looseKg: "" };
    const d = millingDraft;
    const fields = state.activeFields().filter(f => f.varietyId === d.varietyId);
    (d.fieldIds || []).forEach(id => { if (!fields.some(f => f.fieldId === id)) fields.push(state.field(id) || { fieldId: id,name: id }); });
    host.innerHTML = `<div class="section-title"><h3>籾摺り後の収量</h3><button type="button" class="secondary" data-milling-new>新規入力</button></div>
      <form id="millingForm" class="stack-form"><input id="editMillingId" type="hidden" value="${U.attr(millingOriginal && millingOriginal.millingId || "")}">
      <h4>${millingOriginal ? "籾摺り記録を編集" : "籾摺り収量を登録"}</h4>
      <div class="form-grid dense"><label>実施日<input id="millingDate" type="date" value="${U.attr(d.date)}" required></label><label>年産<input id="millingSeason" type="number" min="1900" max="2200" step="1" value="${U.attr(d.season)}" required></label><label class="wide">品種<select id="millingVariety" required>${ledgerVarieties(d.varietyId)}</select></label></div>
      <fieldset class="milling-fields"><legend>圃場（任意）</legend>${fields.map(f => `<label><input type="checkbox" data-milling-field="${U.attr(f.fieldId)}"${d.fieldIds.includes(f.fieldId) ? " checked" : ""}>${U.escapeHTML(f.name)}</label>`).join("") || '<p class="muted">品種を選択してください。</p>'}<small id="millingScope">${d.fieldIds.length > 1 ? "選択圃場の合算（圃場別には分割しません）" : d.fieldIds.length ? "選択圃場の収量" : "圃場未選択：品種集計"}</small></fieldset>
      <div class="milling-package-presets">${[30,10,60].map(kg => `<button class="secondary" type="button" data-milling-add-package="${kg}">+ ${kg}kg袋</button>`).join("")}</div>
      <div id="millingPackages">${d.packages.map((p,i) => `<div class="milling-package-row"><label>1袋のkg<input type="number" min="0.01" step="any" data-milling-kg="${i}" value="${U.attr(p.kg)}" required></label><label>袋数<input type="number" min="1" step="1" data-milling-bags="${i}" value="${U.attr(p.bags)}" required></label><button type="button" class="secondary" data-milling-remove-package="${i}" aria-label="この袋を除く">×</button></div>`).join("")}</div>
      <label>袋に入れていない端数（kg）<input id="millingLooseKg" type="number" min="0" step="any" value="${U.attr(d.looseKg ?? "")}"></label>
      <output id="millingTotal" class="milling-total"></output><label>メモ<textarea id="millingMemo">${U.escapeHTML(d.memo || "")}</textarea></label>
      <p id="millingError" class="milling-warning" role="alert">${U.escapeHTML(millingError)}</p>
      <div class="form-actions"><button type="button" class="secondary" data-milling-cancel>${millingOriginal ? "編集を取消" : "入力をクリア"}</button><button type="submit" class="primary">${millingOriginal ? "変更を保存" : "籾摺り収量を保存"}</button></div></form>
      <section id="millingStock" class="milling-stock"></section>
      <div id="millingList">${millingRows().slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(r => {
        const kg = quantityKg(r),ids = r.fieldIds || [],v = state.variety(r.varietyId);
        return `<article class="record" data-milling-id="${U.attr(r.millingId)}"><div class="record-head"><b>${U.escapeHTML(r.date)} / ${U.escapeHTML(r.season)}年産 ${U.escapeHTML(v && v.name || r.varietyId)}</b></div><div class="record-body"><p>${ids.length > 1 ? "選択圃場合算" : ids.length ? "圃場指定" : "品種集計"}${ids.length ? `：${U.escapeHTML(ids.map(id => state.field(id)?.name || id).join("・"))}` : ""}</p><b>${kg === null || kg <= 0 ? "数量未確認" : `${numberText(kg)}kg / ${numberText(kg / 60)}俵（60kg）`}</b>${r.memo ? `<p>${U.escapeHTML(r.memo)}</p>` : ""}</div><div class="record-actions"><button type="button" class="secondary" data-milling-action="edit" data-id="${U.attr(r.millingId)}">編集</button><button type="button" class="danger" data-milling-action="delete" data-id="${U.attr(r.millingId)}">削除</button></div></article>`;
      }).join("") || '<p class="empty">籾摺り後の収量は未登録です。</p>'}</div>`;
    renderMillingSummary();
  }

  function readMilling() {
    Object.assign(millingDraft,{ date: U.$("millingDate").value,season: U.$("millingSeason").value,varietyId: U.$("millingVariety").value,looseKg: U.$("millingLooseKg").value,memo: U.$("millingMemo").value,
      fieldIds: U.$$("[data-milling-field]:checked").map(el => el.dataset.millingField),packages: U.$$("[data-milling-kg]").map(el => ({ kg: el.value,bags: U.$$("[data-milling-bags]")[Number(el.dataset.millingKg)].value })) });
  }

  function editMillingRecord(id) {
    const record = millingRows().find(r => r.millingId === id);
    if (!record) { alert("この籾摺り記録は見つかりません。"); return false; }
    millingOriginal = U.clone(record); millingDraft = U.clone(record); millingDraft.fieldIds = (record.fieldIds || []).slice(); millingDraft.packages = U.clone(record.packages || []); millingError = "";
    renderMilling(); U.$("millingForm").scrollIntoView({ block: "start",behavior: "smooth" }); return true;
  }

  function openMilling() { resetMilling(); U.$("millingForm").scrollIntoView({ block: "start",behavior: "smooth" }); }
  function openShipmentIssues() {
    const section = U.$("shipmentIssuesSection");
    if (!section) return;
    section.open = true;
    section.scrollIntoView({ block: "start",behavior: "smooth" });
  }

  function renderIssues() {
    const host = U.$("shipmentIssuesContent"); if (!host) return;
    if (!issueDraft) issueDraft = { ...newLedgerDraft(),reason: "",action: "",costYen: "" };
    const d = issueDraft,rows = issueRows();
    const costs = rows.filter(r => Number(r.season) === Number(d.season) && r.varietyId === d.varietyId);
    const known = costs.filter(r => r.costYen !== "" && r.costYen != null && Number.isSafeInteger(Number(r.costYen)) && Number(r.costYen) >= 0);
    const sum = known.reduce((n,r) => n + Number(r.costYen),0);
    host.innerHTML = `<form id="shipmentIssueForm" class="stack-form"><input id="editShipmentIssueId" type="hidden" value="${U.attr(issueOriginal && issueOriginal.issueId || "")}"><h4>${issueOriginal ? "出荷できなかった記録を編集" : "出荷できなかった記録を登録"}</h4><div class="form-grid dense"><label>日付<input id="shipmentIssueDate" type="date" value="${U.attr(d.date)}" required></label><label>年産<input id="shipmentIssueSeason" type="number" min="1900" max="2200" step="1" value="${U.attr(d.season)}" required></label><label class="wide">品種<select id="shipmentIssueVariety" required>${ledgerVarieties(d.varietyId)}</select></label></div><label>理由<input id="shipmentIssueReason" value="${U.attr(d.reason || "")}" required></label><label>対応<input id="shipmentIssueAction" value="${U.attr(d.action || "")}"></label><label>対応費用（円・任意）<input id="shipmentIssueCost" type="number" min="0" step="1" value="${U.attr(d.costYen ?? "")}"></label><label>メモ<textarea id="shipmentIssueMemo">${U.escapeHTML(d.memo || "")}</textarea></label><p id="shipmentIssueError" class="milling-warning" role="alert">${U.escapeHTML(issueError)}</p><div class="form-actions"><button type="button" class="secondary" data-shipment-issue-cancel>${issueOriginal ? "編集を取消" : "入力をクリア"}</button><button type="submit" class="primary">保存</button></div></form><p id="shipmentIssueCosts">${d.varietyId ? `${U.escapeHTML(d.season)}年産・選択品種の参考対応費用：${Number.isSafeInteger(sum) ? numberText(sum) : "集計範囲外"}円 / 費用未登録 ${costs.length - known.length}件` : "年度と品種を選択してください。"}</p><p class="muted">対応費用は利益ではありません。出荷数量・在庫からは差し引きません。</p><div id="shipmentIssueList">${rows.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(r => `<article class="record" data-shipment-issue-id="${U.attr(r.issueId)}"><div class="record-head"><b>${U.escapeHTML(r.date)} / ${U.escapeHTML(r.season)}年産 ${U.escapeHTML(state.variety(r.varietyId)?.name || r.varietyId)}</b></div><div class="record-body"><p>${U.escapeHTML(r.reason)}</p>${r.action ? `<p>対応：${U.escapeHTML(r.action)}</p>` : ""}<p>対応費用：${r.costYen === "" || r.costYen == null ? "未登録" : `${numberText(Number(r.costYen))}円`}</p>${r.memo ? `<p>${U.escapeHTML(r.memo)}</p>` : ""}</div><div class="record-actions"><button type="button" class="secondary" data-shipment-issue-action="edit" data-id="${U.attr(r.issueId)}">編集</button><button type="button" class="danger" data-shipment-issue-action="delete" data-id="${U.attr(r.issueId)}">削除</button></div></article>`).join("") || '<p class="empty">記録はありません。</p>'}</div>`;
  }

  function readIssue() {
    Object.assign(issueDraft,{ date: U.$("shipmentIssueDate").value,season: U.$("shipmentIssueSeason").value,varietyId: U.$("shipmentIssueVariety").value,reason: U.$("shipmentIssueReason").value,action: U.$("shipmentIssueAction").value,costYen: U.$("shipmentIssueCost").value,memo: U.$("shipmentIssueMemo").value });
  }

  function refreshIssueCosts() {
    const rows = issueRows().filter(r => Number(r.season) === Number(issueDraft.season) && r.varietyId === issueDraft.varietyId);
    const known = rows.filter(r => r.costYen !== "" && r.costYen != null && Number.isSafeInteger(Number(r.costYen)) && Number(r.costYen) >= 0);
    const sum = known.reduce((total,r) => total + Number(r.costYen),0);
    U.$("shipmentIssueCosts").textContent = issueDraft.varietyId ? `${issueDraft.season}年産・選択品種の参考対応費用：${Number.isSafeInteger(sum) ? numberText(sum) : "集計範囲外"}円 / 費用未登録 ${rows.length - known.length}件` : "年度と品種を選択してください。";
  }

  function bindLedgers() {
    const milling = U.$("millingContent"),issues = U.$("shipmentIssuesContent");
    if (!milling || !issues) return;
    milling.addEventListener("input",() => { readMilling(); renderMillingSummary(); });
    milling.addEventListener("change",event => {
      readMilling();
      if (event.target.id === "millingVariety") { millingDraft.fieldIds = []; renderMilling(); }
      else if (event.target.matches("[data-milling-field]")) U.$("millingScope").textContent = millingDraft.fieldIds.length > 1 ? "選択圃場の合算（圃場別には分割しません）" : millingDraft.fieldIds.length ? "選択圃場の収量" : "圃場未選択：品種集計";
      renderMillingSummary();
    });
    milling.addEventListener("click",event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-milling-new") || button.hasAttribute("data-milling-cancel")) { resetMilling(); return; }
      if (button.hasAttribute("data-milling-add-package")) { readMilling(); millingDraft.packages.push({ kg: button.dataset.millingAddPackage,bags: "1" }); renderMilling(); return; }
      if (button.hasAttribute("data-milling-remove-package")) { readMilling(); millingDraft.packages.splice(Number(button.dataset.millingRemovePackage),1); renderMilling(); return; }
      if (button.dataset.millingAction === "edit") { editMillingRecord(button.dataset.id); return; }
      if (button.dataset.millingAction === "delete" && confirm("この籾摺り記録を削除しますか？")) {
        if (typeof state.deleteMillingRecord !== "function" || !state.deleteMillingRecord(button.dataset.id)) { millingError = "削除できませんでした。記録は変更していません。"; renderMilling(); return; }
        if (millingOriginal && millingOriginal.millingId === button.dataset.id) resetMilling(); else renderMilling();
      }
    });
    milling.addEventListener("submit",event => {
      event.preventDefault(); readMilling();
      const current = millingOriginal && millingRows().find(r => r.millingId === millingOriginal.millingId);
      if (millingOriginal && !current) { millingError = "編集中の記録が削除されています。新規入力に切り替えてください。"; renderMilling(); return; }
      if (typeof state.saveMillingRecord !== "function" || !state.saveMillingRecord({ ...(current || {}),...millingDraft })) { millingError = "保存できませんでした。入力と数量を確認してください。"; renderMilling(); return; }
      const scope = { season: millingDraft.season,varietyId: millingDraft.varietyId };
      resetMilling(); Object.assign(millingDraft,scope); renderMilling();
    });
    issues.addEventListener("input",() => { readIssue(); refreshIssueCosts(); });
    issues.addEventListener("change",() => { readIssue(); refreshIssueCosts(); });
    issues.addEventListener("click",event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-shipment-issue-cancel")) { resetIssue(); return; }
      if (button.dataset.shipmentIssueAction === "edit") {
        const r = issueRows().find(r => r.issueId === button.dataset.id); if (!r) return;
        issueOriginal = U.clone(r); issueDraft = U.clone(r); issueError = ""; renderIssues(); U.$("shipmentIssueForm").scrollIntoView({ block: "start" });
      }
      if (button.dataset.shipmentIssueAction === "delete" && confirm("この出荷できなかった記録を削除しますか？")) {
        if (typeof state.deleteShipmentIssue !== "function" || !state.deleteShipmentIssue(button.dataset.id)) { issueError = "削除できませんでした。記録は変更していません。"; renderIssues(); return; }
        if (issueOriginal && issueOriginal.issueId === button.dataset.id) resetIssue(); else renderIssues();
      }
    });
    issues.addEventListener("submit",event => {
      event.preventDefault(); readIssue();
      const current = issueOriginal && issueRows().find(r => r.issueId === issueOriginal.issueId);
      if (issueOriginal && !current) { issueError = "編集中の記録が削除されています。新規入力に切り替えてください。"; renderIssues(); return; }
      if (typeof state.saveShipmentIssue !== "function" || !state.saveShipmentIssue({ ...(current || {}),...issueDraft })) { issueError = "保存できませんでした。入力内容を確認してください。"; renderIssues(); return; }
      const scope = { season: issueDraft.season,varietyId: issueDraft.varietyId }; resetIssue(); Object.assign(issueDraft,scope); renderIssues();
    });
  }

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
    renderMilling();
    renderIssues();
  }

  function bind() {
    bindLedgers();
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
  RiceOS.screens.results = { render, bind, resetForm, editResult, editMillingRecord, openMilling, openShipmentIssues };
})();
