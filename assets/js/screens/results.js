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
  let millingViewYear = "all";
  let millingLedgerMode = false;
  let millingFormVisible = true;
  let issueViewYear = "all";
  let savedMillingId = "";
  let ledgerView = "milling-list", detailId = "", editorReturn = null, editorBaseline = "";
  let resultError = "";
  let millingOriginOnly = false;
  const ledgerHistory = [];

  const viewState = () => ({view:ledgerView,id:detailId});
  function syncNavigation() { if (RiceOS.app?.syncBackButton) RiceOS.app.syncBackButton(); }
  function goView(view,id = "") {
    millingOriginOnly = false;
    ledgerHistory.push(viewState()); ledgerView = view; detailId = id; render(); syncNavigation();
  }
  function startEditor(kind) {
    millingOriginOnly = false;
    if (ledgerView !== `${kind}-edit`) editorReturn = ledgerView.startsWith(`${kind}-`) ? viewState() : {view:`${kind}-list`,id:""};
    ledgerView = `${kind}-edit`; detailId = ""; syncNavigation();
  }
  function finishEditor(kind,id) {
    if (kind === "milling" && millingOriginOnly) {
      millingOriginOnly = false;
      millingDraft = null; millingOriginal = null; editorBaseline = "";
      ledgerView = "milling-list"; detailId = ""; editorReturn = null; ledgerHistory.length = 0;
      render(); syncNavigation();
      if (RiceOS.app?.back) RiceOS.app.back();
      return;
    }
    millingOriginOnly = false;
    const target = editorReturn || {view:`${kind}-list`,id:""};
    if (target.view === `${kind}-detail` && target.id === id) {
      ledgerView = target.view; detailId = id;
    } else {
      ledgerView = target.view.endsWith("-edit") ? `${kind}-list` : target.view; detailId = target.id;
      ledgerHistory.push(viewState()); ledgerView = `${kind}-detail`; detailId = id;
    }
    editorReturn = null; render(); syncNavigation();
  }
  function cancelEditor() {
    const originOnly = millingOriginOnly && ledgerView === "milling-edit";
    millingOriginOnly = false;
    const kind = ledgerView.split("-")[0], target = editorReturn || {view:`${kind}-list`,id:""};
    if (kind === "milling") resetMilling();
    if (kind === "issue") resetIssue();
    if (kind === "result") { resetForm(); resultError = ""; }
    ledgerView = target.view; detailId = target.id; editorReturn = null;
    if (originOnly) { ledgerView = "milling-list"; detailId = ""; ledgerHistory.length = 0; }
    render(); syncNavigation();
  }
  function editorValue() {
    if (ledgerView === "milling-edit") return JSON.stringify(millingDraft);
    if (ledgerView === "issue-edit") return JSON.stringify(issueDraft);
    return JSON.stringify(["rSeason","rVariety","rAreaA","rYield","rYieldPer10a","rFirstGradeRate","rShipped","rSales","rSalesPer10a","rQuality","rReflection"].map(id => U.$(id).value));
  }
  function canHandleBack() { return ledgerView.endsWith("-edit") || ledgerHistory.length > 0; }
  function handleBack() {
    if (!canHandleBack()) return false;
    if (ledgerView.endsWith("-edit")) {
      if (editorValue() !== editorBaseline && !confirm("入力中の変更を取り消して戻りますか？")) return true;
      const originOnly = millingOriginOnly && ledgerView === "milling-edit";
      cancelEditor();
      if (originOnly) return false;
    } else {
      const previous = ledgerHistory.pop(); ledgerView = previous.view; detailId = previous.id; render(); syncNavigation();
    }
    return true;
  }
  function requestBack() { if (!handleBack() && RiceOS.app?.back) RiceOS.app.back(); }
  function visible(node,show) {
    if (!node) return;
    node.hidden = !show;
    if (node.style) { if (show) node.style.removeProperty("display"); else node.style.setProperty("display","none","important"); }
  }
  function recordDetail(kind,id) {
    const record = kind === "milling" ? millingRows().find(r => r.millingId === id) : kind === "issue" ? issueRows().find(r => r.issueId === id) : state.data().varietyResults.find(r => r.resultId === id);
    if (!record) return '<p role="alert">この記録は見つかりません。一覧へ戻って確認してください。</p>';
    const variety = state.variety(record.varietyId)?.name || record.varietyId || "品種未設定";
    const kg = kind === "milling" ? quantityKg(record) : null;
    const facts = kind === "milling" ? [["実施日",record.date],["収量",kg === null || kg <= 0 ? "数量未確認" : `${numberText(kg)}kg / ${numberText(kg / 60)}俵（60kg）`],["対象",(record.fieldIds || []).length ? `${record.fieldIds.length > 1 ? "選択圃場合算" : "圃場指定"}：${record.fieldIds.map(id => state.field(id)?.name || id).join("・")}` : "品種集計"],...(record.packages || []).map(p => ["袋",`${p.kg}kg × ${p.bags}袋`]),["端数",record.looseKg === "" || record.looseKg == null ? "未登録" : `${record.looseKg}kg`],["メモ",record.memo]] : kind === "issue" ? [["日付",record.date],["理由",record.reason],["対応",record.action],["対応費用",record.costYen === "" || record.costYen == null ? "未登録" : `${numberText(Number(record.costYen))}円`],["メモ",record.memo]] : [["対象",record.fieldId ? `圃場指定：${state.field(record.fieldId)?.name || record.fieldId}` : "品種集計"],["作付面積",record.areaA],["収量",record.yield],["10aあたり収量",record.yieldPer10a],["1等米率",record.firstGradeRate],["売渡数量",record.shippedQuantity],["販売額",record.salesAmount],["10aあたり販売額",record.salesPer10a],["品質",record.quality],["反省点",record.reflection]];
    const attrs = kind === "milling" ? "data-milling-action" : kind === "issue" ? "data-shipment-issue-action" : "data-result-action";
    const failure = kind === "milling" ? millingError : kind === "issue" ? issueError : resultError;
    return `<article data-${kind === "issue" ? "shipment-issue" : kind}-detail="${U.attr(id)}"><h3>${U.escapeHTML(record.season)}年産 / ${U.escapeHTML(variety)}</h3>${kind === "result" ? '<p class="muted">従来の品種別集計・品質記録。在庫には加算しません。</p>' : ""}<dl>${facts.map(([label,value]) => `<div><dt>${U.escapeHTML(label)}</dt><dd>${U.escapeHTML(value === "" || value == null ? "未登録" : value)}</dd></div>`).join("")}</dl>${kind === "issue" ? '<p class="muted">対応費用は利益ではありません。在庫から差し引きません。</p>' : ""}<p role="alert" class="milling-warning">${U.escapeHTML(failure)}</p><div class="form-actions"><button type="button" class="primary" ${attrs}="edit" data-id="${U.attr(id)}">編集</button><button type="button" class="danger" ${attrs}="delete" data-id="${U.attr(id)}">削除</button></div></article>`;
  }
  function applyView() {
    const screen = U.$("screen-results");
    if (!screen || !document.createElement || !screen.querySelector) return;
    let nav = U.$("resultsLedgerNav");
    if (!nav) { nav = document.createElement("div"); nav.id = "resultsLedgerNav"; U.$("millingContent").before(nav); }
    const family = ledgerView.split("-")[0], list = ledgerView.endsWith("-list"), edit = ledgerView.endsWith("-edit");
    nav.innerHTML = `<div class="form-actions" role="group" aria-label="収穫台帳の表示">${[["milling","収量・在庫"],["result","従来の品種結果"],["issue","出荷対応記録"]].map(([kind,label]) => `<button type="button" class="${family === kind ? "primary" : "secondary"}" data-results-ledger="${kind}" aria-pressed="${family === kind}">${label}</button>`).join("")}</div><div class="section-title"><h3>${list ? "一覧" : edit ? "入力・編集" : "記録の詳細"}</h3>${list ? `<button type="button" class="secondary" data-results-new="${family}">＋ 新規入力</button>` : '<button type="button" class="secondary" data-results-back>戻る</button>'}</div>`;
    visible(U.$("millingContent"),family === "milling"); visible(U.$("shipmentIssuesSection"),family === "issue"); visible(U.$("legacyHarvestResults"),family === "result");
    for (const id of ["shipmentIssuesSection","legacyHarvestResults"]) { const el = U.$(id); if (el) { el.open = true; visible(el.querySelector(":scope > summary"),false); } }
    const milling = U.$("millingContent"), issues = U.$("shipmentIssuesContent");
    visible(milling.querySelector(".section-title"),false);
    visible(U.$("millingForm"),ledgerView === "milling-edit"); visible(U.$("millingStock"),false); visible(U.$("millingLedger"),ledgerView === "milling-list");
    if (U.$("millingLedgerError")) U.$("millingLedgerError").textContent = ledgerView === "milling-list" ? millingError : "";
    const listError = family === "milling" ? millingError : family === "issue" ? issueError : resultError;
    if (list && listError) nav.insertAdjacentHTML("beforeend",`<p role="alert" class="milling-warning">${U.escapeHTML(listError)}</p>`);
    const tabs = nav.querySelector('[role="group"]');
    tabs.style.setProperty("display","grid"); tabs.style.setProperty("grid-template-columns","repeat(3,minmax(0,1fr))"); tabs.style.gap = "6px";
    tabs.querySelectorAll("button").forEach(button => { button.style.minWidth = "0"; button.style.whiteSpace = "normal"; button.style.padding = "10px 6px"; button.style.fontSize = "13px"; });
    visible(U.$("resultForm"),ledgerView === "result-edit"); visible(U.$("resultList"),ledgerView !== "result-edit");
    let resultAlert = U.$("resultEditorError");
    if (!resultAlert) { resultAlert = document.createElement("p"); resultAlert.id = "resultEditorError"; resultAlert.className = "milling-warning"; resultAlert.setAttribute("role","alert"); U.$("resultForm").append(resultAlert); }
    resultAlert.textContent = resultError;
    [...issues.children].forEach(el => visible(el,ledgerView === "issue-edit" ? el.id === "shipmentIssueForm" : ledgerView === "issue-list" && el.id !== "shipmentIssueForm"));
    if (ledgerView === "issue-list") {
      const rows = issueRows().filter(row => issueViewYear === "all" || String(row.season) === issueViewYear);
      const groups = new Map();
      rows.forEach(row => { const key = `${row.season}|${row.varietyId}`; if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(row); });
      U.$("shipmentIssueCosts").innerHTML = [...groups.values()].map(group => {
        const known = group.filter(row => row.costYen !== "" && row.costYen != null && Number.isSafeInteger(Number(row.costYen)) && Number(row.costYen) >= 0);
        const sum = known.reduce((total,row) => total + Number(row.costYen),0), row = group[0];
        return `${U.escapeHTML(row.season)}年産 / ${U.escapeHTML(state.variety(row.varietyId)?.name || row.varietyId)}：参考対応費用 ${Number.isSafeInteger(sum) ? numberText(sum) : "集計範囲外"}円 / 費用未登録 ${group.length - known.length}件`;
      }).join("<br>") || "この年度の対応費用は未登録です。";
    }
    for (const [kind,host] of [["milling",milling],["issue",issues],["result",U.$("resultList")]]) {
      let detail = host.querySelector(`[data-results-detail-host="${kind}"]`);
      if (!detail) { detail = document.createElement("div"); detail.dataset.resultsDetailHost = kind; host.append(detail); }
      const show = ledgerView === `${kind}-detail`; visible(detail,show); if (show) detail.innerHTML = recordDetail(kind,detailId);
      if (kind === "result") [...host.children].forEach(el => { if (el !== detail) visible(el,ledgerView === "result-list"); });
    }
    for (const [selector,key] of [["[data-milling-id]","millingOpen"],["[data-shipment-issue-id]","shipmentIssueOpen"],["[data-result-id]","resultOpen"]]) {
      screen.querySelectorAll(selector).forEach(row => {
        if (row.querySelector(`[data-${key.replace(/[A-Z]/g,c => `-${c.toLowerCase()}`)}]`)) return;
        const button = document.createElement("button"); button.type = "button"; button.className = "secondary"; button.textContent = "詳細を見る ›";
        button.dataset[key] = row.dataset.millingId || row.dataset.shipmentIssueId || row.dataset.resultId;
        row.querySelector(".record-head")?.append(button);
      });
    }
    syncNavigation();
  }

  function newLedgerDraft() {
    const date = U.today();
    return { date,season: String(state.defaultShipmentCropYear(date)),varietyId: "",memo: "" };
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
    host.innerHTML = `<h4>${year}年産の参考在庫</h4><div class="milling-stock-values">${[["籾摺り後",stock.receivedKg],["出荷・配布・自家用",stock.dispatchedKg],["差引参考在庫",stock.remainingKg]].map(([label,kg]) => `<div><small>${label}</small><b>${numberText(kg)}kg</b><small>${typeof kg === "number" && Number.isFinite(kg) ? `${numberText(kg / 60)}俵（60kg）` : "数量未確認"}</small></div>`).join("")}</div>
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
      ${renderMillingHistory()}`;
    U.$("millingForm").hidden = !millingFormVisible;
    U.$("millingStock").hidden = !millingFormVisible;
    if (millingLedgerMode && !millingFormVisible) host.querySelector(".section-title").after(U.$("millingLedger"));
    renderMillingSummary();
    host.querySelectorAll("[data-milling-id]").forEach(row => {
      if (row.dataset.millingId === savedMillingId) row.insertAdjacentHTML("afterbegin", '<p role="status">保存しました</p>');
    });
    applyView();
  }

  function renderLedgerStock() {
    if (typeof state.riceStockFor !== "function") return "";
    const groups = new Map(millingRows().filter(row => millingViewYear === "all" || String(row.season) === millingViewYear).map(row => [`${row.season}|${row.varietyId}`,row]));
    return `<section id="millingLedgerStock"><h4>年度・品種別の参考在庫</h4><p class="muted">全圃場・全相手先・全出荷区分。白米は重量換算せず除外。</p>${[...groups.values()].map(row => {
      const stock = state.riceStockFor(Number(row.season),row.varietyId);
      if (!stock) return "";
      return `<div class="record"><b>${U.escapeHTML(row.season)}年産 / ${U.escapeHTML(state.variety(row.varietyId)?.name || row.varietyId)}</b><p>登録収量 ${numberText(stock.receivedKg)}kg / 出荷・配布・自家用 ${numberText(stock.dispatchedKg)}kg / 差引参考在庫 ${numberText(stock.remainingKg)}kg</p><p class="muted">白米除外 ${numberText(stock.whiteShipmentCount)}件 / 数量不明 ${numberText(stock.unquantifiedCount)}件 / 品種未分類 ${numberText(stock.unclassifiedCount)}件</p>${stock.remainingKg < 0 ? '<p class="milling-warning">差引がマイナスです。記録を確認してください。</p>' : ""}</div>`;
    }).join("") || '<p class="empty">この年度の収量は未登録です。</p>'}</section>`;
  }

  function renderMillingHistory() {
    const all = millingRows();
    const recordYear = row => Number.isInteger(Number(row.season)) && Number(row.season) >= 1900 && Number(row.season) <= 2200 ? String(Number(row.season)) : "unknown";
    const years = [...new Set(all.map(recordYear))];
    if (millingViewYear !== "all" && !years.includes(millingViewYear)) years.push(millingViewYear);
    years.sort((a,b) => a === "unknown" ? 1 : b === "unknown" ? -1 : Number(b) - Number(a));
    const rows = all.filter(row => millingViewYear === "all" || recordYear(row) === millingViewYear).sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const known = rows.map(quantityKg).filter(kg => kg !== null && kg > 0);
    const total = known.reduce((sum,kg) => sum + kg,0);
    const yearLabel = value => value === "unknown" ? "年度未確認" : `${value}年産`;
    return `<section id="millingLedger"><label>履歴の表示年度<select id="millingLedgerYear"><option value="all"${millingViewYear === "all" ? " selected" : ""}>全年度</option>${years.map(year => `<option value="${U.attr(year)}"${millingViewYear === year ? " selected" : ""}>${yearLabel(year)}</option>`).join("")}</select></label><p id="millingLedgerSummary">${millingViewYear === "all" ? "全年度" : yearLabel(millingViewYear)} · ${rows.length}件${known.length ? ` / 登録収量合計 ${numberText(total)}kg（${numberText(total / 60)}俵）` : ""}${rows.length > known.length ? ` / 数量未確認 ${rows.length - known.length}件` : ""}</p><p id="millingLedgerError" class="milling-warning" role="alert">${!millingFormVisible ? U.escapeHTML(millingError) : ""}</p>${renderLedgerStock()}<div id="millingList">${years.filter(year => rows.some(row => recordYear(row) === year)).map(year => `<section data-milling-year-group="${U.attr(year)}"><h4>${yearLabel(year)}</h4>${rows.filter(row => recordYear(row) === year).map(r => {
      const kg = quantityKg(r),ids = r.fieldIds || [],v = state.variety(r.varietyId);
      return `<article class="record" data-milling-id="${U.attr(r.millingId)}"><div class="record-head"><b>${U.escapeHTML(r.date)} / ${U.escapeHTML(r.season)}年産 ${U.escapeHTML(v && v.name || r.varietyId)}</b></div><div class="record-body"><p>${ids.length > 1 ? "選択圃場合算" : ids.length ? "圃場指定" : "品種集計"}${ids.length ? `：${U.escapeHTML(ids.map(id => state.field(id)?.name || id).join("・"))}` : ""}</p><b>${kg === null || kg <= 0 ? "数量未確認" : `${numberText(kg)}kg / ${numberText(kg / 60)}俵（60kg）`}</b>${r.memo ? `<p>${U.escapeHTML(r.memo)}</p>` : ""}</div><div class="record-actions"><button type="button" class="secondary" data-milling-action="edit" data-id="${U.attr(r.millingId)}">編集</button><button type="button" class="danger" data-milling-action="delete" data-id="${U.attr(r.millingId)}">削除</button></div></article>`;
    }).join("")}</section>`).join("") || '<p class="empty">この年度の籾摺り記録はありません。</p>'}</div></section>`;
  }

  function readMilling() {
    Object.assign(millingDraft,{ date: U.$("millingDate").value,season: U.$("millingSeason").value,varietyId: U.$("millingVariety").value,looseKg: U.$("millingLooseKg").value,memo: U.$("millingMemo").value,
      fieldIds: U.$$("[data-milling-field]:checked").map(el => el.dataset.millingField),packages: U.$$("[data-milling-kg]").map(el => ({ kg: el.value,bags: U.$$("[data-milling-bags]")[Number(el.dataset.millingKg)].value })) });
  }

  function editMillingRecord(id) {
    const record = millingRows().find(r => r.millingId === id);
    if (!record) { alert("この籾摺り記録は見つかりません。"); return false; }
    startEditor("milling");
    millingFormVisible = true;
    millingOriginal = U.clone(record); millingDraft = U.clone(record); millingDraft.fieldIds = (record.fieldIds || []).slice(); millingDraft.packages = U.clone(record.packages || []); millingError = "";
    renderMilling(); readMilling(); editorBaseline = editorValue(); U.$("millingForm").scrollIntoView({ block: "start",behavior: "smooth" }); return true;
  }

  function openMilling() { startEditor("milling"); millingLedgerMode = false; millingFormVisible = true; resetMilling(); readMilling(); editorBaseline = editorValue(); U.$("millingForm").scrollIntoView({ block: "start",behavior: "smooth" }); }
  function openMillingForYear(season, varietyId, opts = {}) {
    if (!RiceOS.schema.validCropYear(season) || varietyId && !state.variety(varietyId)) return false;
    const hasDraft = millingDraft && (millingOriginal || millingDraft.varietyId || millingDraft.packages.length || Number(millingDraft.looseKg) > 0 || String(millingDraft.memo || "").trim());
    if (hasDraft && !confirm("入力中の籾摺り記録があります。新しい収量入力へ切り替えますか？")) return false;
    startEditor("milling");
    millingLedgerMode = false;
    millingFormVisible = true;
    resetMilling();
    millingDraft.season = String(season);
    millingDraft.varietyId = varietyId || "";
    if (Array.isArray(opts.fieldIds)) millingDraft.fieldIds = [...new Set(opts.fieldIds)].filter(id => {
      const field = state.field(id);
      return field && (!varietyId || field.varietyId === varietyId);
    });
    const prefillDate = String(opts.date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefillDate)) {
      const parsed = new Date(`${prefillDate}T00:00:00Z`);
      if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === prefillDate) millingDraft.date = prefillDate;
    }
    millingViewYear = String(season);
    renderMilling();
    readMilling(); editorBaseline = editorValue();
    millingOriginOnly = opts.originOnly === true;
    return true;
  }
  function openMillingDetail(id) {
    if (!millingRows().some(row => row.millingId === id)) return false;
    ledgerView = "milling-list"; detailId = ""; ledgerHistory.length = 0; editorReturn = null;
    millingLedgerMode = true; millingFormVisible = false;
    goView("milling-detail", id);
    return true;
  }
  function openMillingLedger() {
    millingOriginOnly = false;
    ledgerView = "milling-list"; detailId = ""; ledgerHistory.length = 0; editorReturn = null;
    if (U.$("legacyHarvestResults")) U.$("legacyHarvestResults").open = false;
    millingLedgerMode = true; millingFormVisible = false; renderMilling();
    U.$("millingContent").scrollIntoView({ block: "start",behavior: "smooth" });
  }
  function showMillingForm() {
    startEditor("milling");
    if (U.$("legacyHarvestResults")) U.$("legacyHarvestResults").open = true;
    millingLedgerMode = false; millingFormVisible = true; renderMilling();
    readMilling(); editorBaseline = editorValue();
  }
  function openShipmentIssues() {
    ledgerView = "issue-list"; detailId = ""; ledgerHistory.length = 0; editorReturn = null;
    renderIssues();
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
    host.innerHTML = `${renderIssueFilter()}<form id="shipmentIssueForm" class="stack-form"><input id="editShipmentIssueId" type="hidden" value="${U.attr(issueOriginal && issueOriginal.issueId || "")}"><h4>${issueOriginal ? "出荷できなかった記録を編集" : "出荷できなかった記録を登録"}</h4><div class="form-grid dense"><label>日付<input id="shipmentIssueDate" type="date" value="${U.attr(d.date)}" required></label><label>年産<input id="shipmentIssueSeason" type="number" min="1900" max="2200" step="1" value="${U.attr(d.season)}" required></label><label class="wide">品種<select id="shipmentIssueVariety" required>${ledgerVarieties(d.varietyId)}</select></label></div><label>理由<input id="shipmentIssueReason" value="${U.attr(d.reason || "")}" required></label><label>対応<input id="shipmentIssueAction" value="${U.attr(d.action || "")}"></label><label>対応費用（円・任意）<input id="shipmentIssueCost" type="number" min="0" step="1" value="${U.attr(d.costYen ?? "")}"></label><label>メモ<textarea id="shipmentIssueMemo">${U.escapeHTML(d.memo || "")}</textarea></label><p id="shipmentIssueError" class="milling-warning" role="alert">${U.escapeHTML(issueError)}</p><div class="form-actions"><button type="button" class="secondary" data-shipment-issue-cancel>${issueOriginal ? "編集を取消" : "入力をクリア"}</button><button type="submit" class="primary">保存</button></div></form><p id="shipmentIssueCosts">${d.varietyId ? `${U.escapeHTML(d.season)}年産・選択品種の参考対応費用：${Number.isSafeInteger(sum) ? numberText(sum) : "集計範囲外"}円 / 費用未登録 ${costs.length - known.length}件` : "年度と品種を選択してください。"}</p><p class="muted">対応費用は利益ではありません。出荷数量・在庫からは差し引きません。</p><div id="shipmentIssueList">${rows.filter(row => issueViewYear === "all" || String(row.season) === issueViewYear).slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(r => `<article class="record" data-shipment-issue-id="${U.attr(r.issueId)}"><div class="record-head"><b>${U.escapeHTML(r.date)} / ${U.escapeHTML(r.season)}年産 ${U.escapeHTML(state.variety(r.varietyId)?.name || r.varietyId)}</b></div><div class="record-body"><p>${U.escapeHTML(r.reason)}</p>${r.action ? `<p>対応：${U.escapeHTML(r.action)}</p>` : ""}<p>対応費用：${r.costYen === "" || r.costYen == null ? "未登録" : `${numberText(Number(r.costYen))}円`}</p>${r.memo ? `<p>${U.escapeHTML(r.memo)}</p>` : ""}</div><div class="record-actions"><button type="button" class="secondary" data-shipment-issue-action="edit" data-id="${U.attr(r.issueId)}">編集</button><button type="button" class="danger" data-shipment-issue-action="delete" data-id="${U.attr(r.issueId)}">削除</button></div></article>`).join("") || '<p class="empty">記録はありません。</p>'}</div>`;
    applyView();
  }

  function renderIssueFilter() {
    const years = [...new Set(issueRows().map(row => String(row.season)))];
    if (issueViewYear !== "all" && !years.includes(issueViewYear)) years.push(issueViewYear);
    years.sort((a,b) => Number(b) - Number(a));
    return `<label>対応履歴の表示年度<select id="shipmentIssueViewYear"><option value="all"${issueViewYear === "all" ? " selected" : ""}>全年度</option>${years.map(year => `<option value="${U.attr(year)}"${issueViewYear === year ? " selected" : ""}>${U.escapeHTML(year)}年産</option>`).join("")}</select></label><p class="muted">表示年度の品種別参考対応費用です。在庫から差し引きません。</p>`;
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
    milling.addEventListener("input",event => { if (event.target.id === "millingLedgerYear") return; readMilling(); renderMillingSummary(); });
    milling.addEventListener("change",event => {
      if (event.target.id === "millingLedgerYear") { millingViewYear = event.target.value; renderMilling(); return; }
      readMilling();
      if (event.target.id === "millingVariety") { millingDraft.fieldIds = []; renderMilling(); }
      else if (event.target.matches("[data-milling-field]")) U.$("millingScope").textContent = millingDraft.fieldIds.length > 1 ? "選択圃場の合算（圃場別には分割しません）" : millingDraft.fieldIds.length ? "選択圃場の収量" : "圃場未選択：品種集計";
      renderMillingSummary();
    });
    milling.addEventListener("click",event => {
      const button = event.target.closest("button");
      if (!button) { const row = event.target.closest("[data-milling-id]"); if (row) goView("milling-detail",row.dataset.millingId); return; }
      if (button.hasAttribute("data-milling-open")) { goView("milling-detail",button.dataset.millingOpen); return; }
      if (button.hasAttribute("data-milling-new")) { startEditor("milling"); millingFormVisible = true; savedMillingId = ""; resetMilling(); if (millingLedgerMode && /^\d{4}$/.test(millingViewYear)) { millingDraft.season = millingViewYear; renderMilling(); } readMilling(); editorBaseline = editorValue(); return; }
      if (button.hasAttribute("data-milling-cancel")) { if (millingOriginOnly) requestBack(); else cancelEditor(); return; }
      if (button.hasAttribute("data-milling-add-package")) { readMilling(); millingDraft.packages.push({ kg: button.dataset.millingAddPackage,bags: "1" }); renderMilling(); return; }
      if (button.hasAttribute("data-milling-remove-package")) { readMilling(); millingDraft.packages.splice(Number(button.dataset.millingRemovePackage),1); renderMilling(); return; }
      if (button.dataset.millingAction === "edit") { editMillingRecord(button.dataset.id); return; }
      if (button.dataset.millingAction === "delete" && confirm("この籾摺り記録を削除しますか？")) {
        if (typeof state.deleteMillingRecord !== "function" || !state.deleteMillingRecord(button.dataset.id)) { millingError = "削除できませんでした。記録は変更していません。"; renderMilling(); return; }
        if (ledgerView === "milling-detail" && detailId === button.dataset.id) { const previous = ledgerHistory.pop() || {view:"milling-list",id:""}; ledgerView = previous.view; detailId = previous.id; }
        if (millingOriginal && millingOriginal.millingId === button.dataset.id) { if (millingLedgerMode) millingFormVisible = false; resetMilling(); } else renderMilling();
      }
    });
    milling.addEventListener("submit",event => {
      event.preventDefault(); readMilling();
      const current = millingOriginal && millingRows().find(r => r.millingId === millingOriginal.millingId);
      if (millingOriginal && !current) { millingError = "編集中の記録が削除されています。新規入力に切り替えてください。"; renderMilling(); return; }
      const saved = typeof state.saveMillingRecord === "function" && state.saveMillingRecord({ ...(current || {}),...millingDraft });
      if (!saved) { millingError = "保存できませんでした。入力と数量を確認してください。"; renderMilling(); return; }
      millingViewYear = String(saved.season); savedMillingId = saved.millingId;
      const scope = { season: millingDraft.season,varietyId: millingDraft.varietyId };
      if (millingLedgerMode) millingFormVisible = false;
      resetMilling(); Object.assign(millingDraft,scope); renderMilling();
      finishEditor("milling",saved.millingId);
    });
    issues.addEventListener("input",event => { if (event.target.id !== "shipmentIssueViewYear") { readIssue(); refreshIssueCosts(); } });
    issues.addEventListener("change",event => { if (event.target.id === "shipmentIssueViewYear") { issueViewYear = event.target.value; renderIssues(); return; } readIssue(); refreshIssueCosts(); });
    issues.addEventListener("click",event => {
      const button = event.target.closest("button");
      if (!button) { const row = event.target.closest("[data-shipment-issue-id]"); if (row) goView("issue-detail",row.dataset.shipmentIssueId); return; }
      if (button.hasAttribute("data-shipment-issue-open")) { goView("issue-detail",button.dataset.shipmentIssueOpen); return; }
      if (button.hasAttribute("data-shipment-issue-cancel")) { cancelEditor(); return; }
      if (button.dataset.shipmentIssueAction === "edit") {
        const r = issueRows().find(r => r.issueId === button.dataset.id); if (!r) return;
        startEditor("issue"); issueOriginal = U.clone(r); issueDraft = U.clone(r); issueError = ""; renderIssues(); readIssue(); editorBaseline = editorValue(); U.$("shipmentIssueForm").scrollIntoView({ block: "start" });
      }
      if (button.dataset.shipmentIssueAction === "delete" && confirm("この出荷できなかった記録を削除しますか？")) {
        if (typeof state.deleteShipmentIssue !== "function" || !state.deleteShipmentIssue(button.dataset.id)) { issueError = "削除できませんでした。記録は変更していません。"; renderIssues(); return; }
        if (ledgerView === "issue-detail" && detailId === button.dataset.id) { const previous = ledgerHistory.pop() || {view:"issue-list",id:""}; ledgerView = previous.view; detailId = previous.id; }
        if (issueOriginal && issueOriginal.issueId === button.dataset.id) resetIssue(); else renderIssues();
      }
    });
    issues.addEventListener("submit",event => {
      event.preventDefault(); readIssue();
      const current = issueOriginal && issueRows().find(r => r.issueId === issueOriginal.issueId);
      if (issueOriginal && !current) { issueError = "編集中の記録が削除されています。新規入力に切り替えてください。"; renderIssues(); return; }
      const saved = typeof state.saveShipmentIssue === "function" && state.saveShipmentIssue({ ...(current || {}),...issueDraft });
      if (!saved) { issueError = "保存できませんでした。入力内容を確認してください。"; renderIssues(); return; }
      issueViewYear = String(saved.season);
      const scope = { season: issueDraft.season,varietyId: issueDraft.varietyId }; resetIssue(); Object.assign(issueDraft,scope); renderIssues();
      finishEditor("issue",saved.issueId);
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
    startEditor("result");
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
    editorBaseline = editorValue(); applyView();
  }

  function editResult(resultId) {
    const record = state.data().varietyResults.find((row) => row.resultId === resultId);
    if (!record) { alert("この結果は見つかりません。一覧を確認してください。"); return false; }
    startEditor("result");
    if (U.$("legacyHarvestResults")) U.$("legacyHarvestResults").open = true;
    editingResult = U.clone(record);
    const inputs = { rSeason: "season", rVariety: "varietyId", rAreaA: "areaA", rYield: "yield", rYieldPer10a: "yieldPer10a",
      rFirstGradeRate: "firstGradeRate", rShipped: "shippedQuantity", rSales: "salesAmount", rSalesPer10a: "salesPer10a", rQuality: "quality", rReflection: "reflection" };
    Object.entries(inputs).forEach(([id,key]) => { U.$(id).value = record[key] ?? ""; });
    renderVarietyOptions(record.varietyId || "");
    renderFormState();
    const form = U.$("resultForm");
    form.querySelector("details").open = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    editorBaseline = editorValue(); applyView();
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
    applyView();
  }

  function bind() {
    if (typeof document.addEventListener === "function") document.addEventListener("click",event => {
      if (event.target.closest('[data-sheet-add="result"], [data-jump-screen="results"], .nav-item[data-screen="results"]')) showMillingForm();
    },true);
    bindLedgers();
    applyView();
    U.$("resultsLedgerNav")?.addEventListener("click",event => {
      const tab = event.target.closest("[data-results-ledger]");
      if (tab) {
        if (ledgerView === "milling-edit") readMilling();
        if (ledgerView === "issue-edit") readIssue();
        if (ledgerView.endsWith("-edit") && editorValue() !== editorBaseline && !confirm("入力中の変更を取り消して台帳を切り替えますか？")) return;
        millingOriginOnly = false;
        ledgerView = `${tab.dataset.resultsLedger}-list`; detailId = ""; ledgerHistory.length = 0; editorReturn = null; render(); return;
      }
      if (event.target.closest("[data-results-back]")) { requestBack(); return; }
      const add = event.target.closest("[data-results-new]");
      if (!add) return;
      if (add.dataset.resultsNew === "milling") { openMilling(); if (/^\d{4}$/.test(millingViewYear)) { millingDraft.season = millingViewYear; renderMilling(); readMilling(); editorBaseline = editorValue(); } }
      if (add.dataset.resultsNew === "result") resetForm();
      if (add.dataset.resultsNew === "issue") { startEditor("issue"); resetIssue(); if (/^\d{4}$/.test(issueViewYear)) { issueDraft.season = issueViewYear; renderIssues(); } readIssue(); editorBaseline = editorValue(); }
    });
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
      if (!saved) { resultError = "保存できませんでした。入力は保持しています。"; applyView(); return; }
      const id = editingResult?.resultId || state.data().varietyResults.at(-1)?.resultId;
      resetForm(); resultError = ""; finishEditor("result",id);
    });
    U.$("resultForm").addEventListener("click", (event) => {
      if (event.target.closest("[data-result-reset]")) cancelEditor();
      if (event.target.closest("[data-result-new]")) resetForm();
    });
    U.$("resultList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-result-action]");
      if (!button) { const row = event.target.closest("[data-result-id]"); if (row) goView("result-detail",row.dataset.resultId); return; }
      const id = button.dataset.id;
      const record = state.data().varietyResults.find((row) => row.resultId === id);
      if (!record) { alert("この結果は見つかりません。一覧を確認してください。"); return; }
      if (button.dataset.resultAction === "edit") { editResult(id); return; }
      if (button.dataset.resultAction !== "delete" || !confirm(`${record.season}年のこの品種結果を削除しますか？`)) return;
      if (typeof state.deleteResult !== "function") { alert("削除処理を利用できません。再読み込みしてください。"); return; }
      if (!state.deleteResult(id)) { resultError = "削除できませんでした。記録は変更していません。"; applyView(); return; }
      if (ledgerView === "result-detail" && detailId === id) { const previous = ledgerHistory.pop() || {view:"result-list",id:""}; ledgerView = previous.view; detailId = previous.id; resultError = ""; render(); }
      if (editingResult && editingResult.resultId === id) {
        const target = viewState(); resetForm(); ledgerView = target.view; detailId = target.id; editorReturn = null; render();
      }
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.results = { render, bind, resetForm, editResult, editMillingRecord, openMilling, openMillingForYear, openMillingDetail, openMillingLedger, showMillingForm, openShipmentIssues, canHandleBack, handleBack };
})();
