(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {}, U = R.utils, S = R.schema, state = R.state;
  let view = "list", mode = "materials", year = "all", category = "all";
  let materialId = "", purchaseId = "", purchaseScope = "", bound = false;
  let purchaseDraft = null, materialOriginal = "", purchaseOriginal = "";
  let materialError = "", purchaseError = "", listError = "";
  const history = [];
  const inputs = {mSeason:"season",mCategory:"category",mName:"name",mFormalName:"formalName",mFormulation:"formulation",mUnit:"unit",mRegistrationNumber:"registrationNumber",mProductUrl:"productUrl",mDeliveryDate:"deliveryDate",mCarryover:"carryover",mOrdered:"ordered",mUsed:"used",mRemaining:"remaining",mMemo:"nextYearMemo"};
  const purchaseKeys = ["date","season","supplier","quantity","unit","unitPrice","totalAmount","memo"];
  const material = id => state.data().materials.find(row => row.materialId === id);
  const money = value => typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("ja-JP")}円` : "価格未記録";
  const errorText = fallback => state.lastError?.message || String(state.lastError || fallback);
  function snapshot() { return {view,materialId,purchaseId,purchaseScope}; }
  function notify() { if (window.dispatchEvent) window.dispatchEvent(new CustomEvent("riceos:navigationchange")); }
  function move(next, values = {}) {
    history.push(snapshot()); view = next;
    if (values.materialId !== undefined) materialId = values.materialId;
    if (values.purchaseId !== undefined) purchaseId = values.purchaseId;
    if (values.purchaseScope !== undefined) purchaseScope = values.purchaseScope;
    listError = ""; render(); notify();
  }
  function restorePrevious() {
    const previous = history.pop() || {view:"list",materialId:"",purchaseId:"",purchaseScope:""};
    ({view,materialId,purchaseId,purchaseScope} = previous); render(); notify();
  }
  function safeProductUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return "";
    try { const url = new URL(value.trim()); return ["http:","https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; }
    catch (_) { return ""; }
  }
  function usageCarte(m) {
    const group = state.materialUsageForYear(m.season).find(row => row.materialId === m.materialId);
    const works = group ? group.works.filter(work => work.materialId === m.materialId && String(work.date).slice(0,4) === String(m.season)) : [];
    const fieldName = id => state.field(id)?.name || id;
    const H = R.herbicide, observations = new Map();
    if (H?.assignments && H?.observations) {
      const assignments = H.assignments(undefined,m.season);
      works.forEach(work => (Array.isArray(work.herbicideLinks) ? work.herbicideLinks : []).forEach(link => {
        if (!Array.isArray(work.fieldIds) || !work.fieldIds.includes(link.fieldId)) return;
        const assignment = assignments.find(a => a.assignmentId === link.assignmentId && a.fieldId === link.fieldId && String(a.year) === String(m.season) && Array.isArray(a.steps) && a.steps.some(step => step?.id === link.stepId && step.materialId === m.materialId));
        if (assignment) H.observations(assignment.assignmentId).forEach(o => {
          if (o.observationId && o.assignmentId === assignment.assignmentId && o.fieldId === assignment.fieldId && String(o.date).slice(0,4) === String(m.season)) observations.set(o.observationId,{...o,assignmentName:assignment.name});
        });
      }));
    }
    return `<details class="material-carte"><summary>使用カルテ</summary>${works.map(work => `<article class="material-carte-work"><b>${U.escapeHTML(U.fd(work.date))}</b><div>対象圃場: ${U.escapeHTML((work.fieldIds || []).map(fieldName).join("・") || "未記録")}</div><div>量: ${U.escapeHTML(work.amount || "未記録")}</div>${work.herbicidePurpose ? `<div>目的: ${U.escapeHTML(work.herbicidePurpose)}</div>` : ""}${work.memo ? `<div>${U.escapeHTML(work.memo)}</div>` : ""}</article>`).join("") || '<p class="muted">この年度の関連する使用実績はありません。</p>'}<h4>関連する体系の観察</h4>${[...observations.values()].sort((a,b) => String(a.date).localeCompare(String(b.date))).map(o => `<article class="material-carte-observation"><b>${U.escapeHTML(U.fd(o.date))} ${U.escapeHTML(o.status)}</b><div>${U.escapeHTML(fieldName(o.fieldId))} / ${U.escapeHTML(o.assignmentName || "体系名未記録")}</div><div>${U.escapeHTML(Array.isArray(o.weeds) ? o.weeds.join("・") : o.weeds || "")}</div>${o.memo ? `<div>${U.escapeHTML(o.memo)}</div>` : ""}</article>`).join("") || '<p class="muted">関連する観察記録はありません。</p>'}</details>`;
  }
  function values() { return Object.fromEntries(Object.entries(inputs).map(([id,key]) => [key,U.$(id).value])); }
  function clearFields() {
    U.$("editMaterialId").value = "";
    Object.keys(inputs).forEach(id => { U.$(id).value = ""; });
    U.$("mSeason").value = U.today().slice(0,4);
    U.setOptions(U.$("mCategory"),S.MATERIAL_CATEGORIES,"肥料");
    U.$("mCategory").value = "肥料";
    U.$("saveMaterialButton").textContent = "資材を保存";
    materialError = "";
  }
  function resetForm() {
    clearFields(); view = "list"; history.length = 0; materialId = ""; purchaseId = ""; purchaseScope = "";
    purchaseDraft = null; purchaseError = ""; listError = ""; render(); notify();
  }
  function editMaterial(id) {
    const row = id ? material(id) : null;
    if (id && !row) return false;
    clearFields();
    if (row) {
      U.$("editMaterialId").value = id;
      U.setOptions(U.$("mCategory"),[...new Set([...S.MATERIAL_CATEGORIES,row.category])],row.category);
      Object.entries(inputs).forEach(([node,key]) => { U.$(node).value = row[key] ?? ""; });
      U.$("saveMaterialButton").textContent = "資材を更新";
    }
    materialOriginal = JSON.stringify(values());
    move("material-edit",{materialId:id || ""}); return true;
  }
  function openPurchases(id) {
    if (!material(id)) return false;
    move("purchase-list",{materialId:id,purchaseScope:id,purchaseId:""}); return true;
  }
  function allPurchases() {
    if (!R.materialPurchases) return [];
    return state.data().materials.flatMap(m => R.materialPurchases.records(m.materialId).map(row => ({material:m,row})));
  }
  function capturePurchase() {
    const form = U.$("materialPurchaseForm");
    if (!form || !purchaseDraft) return;
    purchaseKeys.forEach(key => { purchaseDraft[key] = form.elements.namedItem(key).value; });
    const select = form.elements.namedItem("materialId");
    if (select) purchaseDraft.materialId = select.value;
  }
  function editPurchase(id, mid) {
    const row = id ? R.materialPurchases.records(mid).find(item => item.purchaseId === id) : null;
    if (id && !row) return false;
    const m = material(mid);
    purchaseDraft = row ? {...row,materialId:mid} : {materialId:mid || "",date:U.today(),season:year === "all" ? U.today().slice(0,4) : year,supplier:"",quantity:"",unit:m?.unit || "",unitPrice:"",totalAmount:"",memo:""};
    purchaseKeys.forEach(key => { purchaseDraft[key] = String(purchaseDraft[key] ?? ""); });
    purchaseError = ""; purchaseOriginal = JSON.stringify(purchaseDraft);
    move("purchase-edit",{materialId:mid || "",purchaseId:id || ""}); return true;
  }
  function filters(purchases) {
    const data = state.data().materials;
    const years = [...new Set((purchases ? allPurchases().map(item => item.row.season) : data.map(m => m.season)).map(String))].sort().reverse();
    if (year !== "all" && !years.includes(year)) years.unshift(year);
    const categories = [...new Set([...S.MATERIAL_CATEGORIES,...data.map(m => m.category),...(category === "all" ? [] : [category])])];
    return `<div class="ml-filters"><label>年度<select id="mpViewYear"><option value="all"${year === "all" ? " selected" : ""}>全年度</option>${years.map(y => `<option value="${U.attr(y)}"${y === year ? " selected" : ""}>${U.escapeHTML(y)}年度</option>`).join("")}</select></label><label>分類<select id="materialsCategoryFilter"><option value="all">すべての分類</option>${categories.map(c => `<option value="${U.attr(c)}"${c === category ? " selected" : ""}>${U.escapeHTML(c)}</option>`).join("")}</select></label></div>`;
  }
  function materialDetail(m) {
    const url = safeProductUrl(m.productUrl);
    return `<article class="ml-detail" data-material-detail="${U.attr(m.materialId)}"><h3>${U.escapeHTML(m.name || "名称未入力")}</h3><p>${U.escapeHTML(m.season)}年度 / ${U.escapeHTML(m.category)}</p><dl>${[["正式名称",m.formalName],["剤型・規格",m.formulation],["管理単位",m.unit],["納品日",m.deliveryDate],["前年繰越",m.carryover],["今年購入（旧欄）",m.ordered],["使用数（手入力）",m.used],["在庫（手入力）",m.remaining]].map(([label,value]) => `<div><dt>${label}</dt><dd>${U.escapeHTML(value === "" || value == null ? "未記録" : value)}</dd></div>`).join("")}</dl>${m.registrationNumber || ["除草剤","防除剤","殺虫殺菌剤"].includes(m.category) ? `<p>登録番号 ${U.escapeHTML(m.registrationNumber || "未登録")}</p>` : ""}<div class="material-reference-links">${["除草剤","防除剤","殺虫殺菌剤"].includes(m.category) ? '<a href="https://pesticide.maff.go.jp/" target="_blank" rel="noopener noreferrer">農薬登録情報（公式）</a>' : ""}${url ? `<a href="${U.attr(url)}" target="_blank" rel="noopener noreferrer">メーカー登録URL</a>` : ""}</div>${m.nextYearMemo ? `<p>${U.escapeHTML(m.nextYearMemo)}</p>` : ""}<div class="ml-actions"><button type="button" class="primary" data-material-edit="${U.attr(m.materialId)}">編集</button><button type="button" class="secondary" data-material-purchases="${U.attr(m.materialId)}">購入履歴</button><button type="button" class="secondary" data-material-delete="${U.attr(m.materialId)}">削除</button></div>${usageCarte(m)}</article>`;
  }
  function purchaseDetail(row,m) {
    return `<article class="mp-detail" data-mp-detail="${U.attr(row.purchaseId)}"><h3>${U.escapeHTML(m.name)}の購入記録</h3><dl>${[["購入日",row.date],["年度",row.season],["分類",m.category],["仕入先",row.supplier || "未記録"],["数量",`${row.quantity} ${row.unit}`],["税込単価",money(row.unitPrice)],["単価×数量",money(R.materialPurchases.subtotal(row))],[row.totalAmount !== "" && row.totalAmount != null ? "税込実額" : "記録金額",money(R.materialPurchases.amount(row))]].map(([label,value]) => `<div><dt>${label}</dt><dd>${U.escapeHTML(value)}</dd></div>`).join("")}</dl>${row.memo ? `<p>${U.escapeHTML(row.memo)}</p>` : ""}<div class="mp-actions"><button type="button" class="primary" data-mp-edit="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}">編集</button><button type="button" class="secondary" data-mp-delete="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}">削除</button></div></article>`;
  }
  function purchaseForm() {
    const draft = purchaseDraft;
    if (!draft) return "";
    return `<form id="materialPurchaseForm" class="mp-form"><h3>${draft.purchaseId ? "購入記録を編集" : "購入記録を追加"}</h3>${draft.purchaseId ? `<p>${U.escapeHTML(material(draft.materialId)?.name || "資材が見つかりません")}</p>` : `<label>資材<select name="materialId" required><option value="">保存済みの資材を選択</option>${state.data().materials.map(m => `<option value="${U.attr(m.materialId)}"${m.materialId === draft.materialId ? " selected" : ""}>${U.escapeHTML(m.name)} / ${U.escapeHTML(m.category)}</option>`).join("")}</select></label>`}<div class="mp-grid">${[["date","購入日","date","required"],["season","年度","number",'min="1900" max="2200" step="1" required'],["supplier","仕入先","text",""],["quantity","数量","number",'min="0" step="any" required'],["unit","単位","text","required"],["unitPrice","税込単価（円・任意）","number",'min="0" step="1"'],["totalAmount","税込総額（実額・任意）","number",'min="0" step="1"']].map(([name,label,type,attrs]) => `<label>${label}<input name="${name}" id="mp-${name}" type="${type}" ${attrs} value="${U.attr(draft[name] ?? "")}"></label>`).join("")}</div><label>メモ<textarea name="memo">${U.escapeHTML(draft.memo || "")}</textarea></label><p id="mpSubtotal" class="mp-subtotal">単価×数量：${money(R.materialPurchases.subtotal(draft))} ／ 記録金額：${money(R.materialPurchases.amount(draft))}</p><div class="mp-actions"><button type="button" class="secondary" data-mp-cancel>取消</button><button type="submit" class="primary">購入記録を保存</button></div></form>`;
  }
  function setHidden(node, hidden) { if (node) node.hidden = hidden; }
  function render() {
    const form = U.$("materialForm"), list = U.$("materialList"), purchases = U.$("materialPurchases");
    if (!form || !list) return;
    let host = U.$("materialsLedgerHost");
    if (!host && document.createElement) { host = document.createElement("div"); host.id = "materialsLedgerHost"; form.before(host); }
    const categories = [...new Set([...S.MATERIAL_CATEGORIES,U.$("mCategory").value].filter(Boolean))];
    U.setOptions(U.$("mCategory"),categories,U.$("mCategory").value || "肥料");
    const m = material(materialId), cross = view === "list" && mode === "purchases";
    setHidden(form,view !== "material-edit"); setHidden(list,!["list","material-detail"].includes(view) || cross);
    setHidden(purchases,!(cross || view.startsWith("purchase-")));
    const title = {"material-detail":"資材の詳細","material-edit":U.$("editMaterialId").value ? "資材を編集" : "資材を追加","purchase-list":m ? `${m.name}の購入履歴` : "購入履歴","purchase-detail":"購入記録の詳細","purchase-edit":purchaseId ? "購入記録を編集" : "購入記録を追加"}[view] || "資材と購入の台帳";
    if (host) host.innerHTML = `<div class="ml-heading"><h3>${U.escapeHTML(title)}</h3>${view !== "list" ? '<button type="button" class="secondary" data-material-back>戻る</button>' : ""}</div>${view === "list" ? `<div class="ml-modes" role="group" aria-label="台帳の表示"><button type="button" data-material-mode="materials" aria-pressed="${mode === "materials"}">資材一覧</button><button type="button" data-material-mode="purchases" aria-pressed="${mode === "purchases"}">購入履歴</button></div>${filters(cross)}<div class="ml-actions"><button type="button" class="primary" ${cross ? "data-mp-new" : "data-material-new"}>＋ ${cross ? "購入を追加" : "資材を追加"}</button></div>` : view === "purchase-list" ? `${filters(true)}<button type="button" class="primary" data-mp-new>＋ 購入を追加</button>` : ""}<p class="ml-error" role="alert">${U.escapeHTML(view === "material-edit" ? materialError : view.startsWith("purchase-") ? purchaseError : listError)}</p>`;
    if (view === "list" && !cross) {
      const rows = state.data().materials.filter(row => (year === "all" || String(row.season) === year) && (category === "all" || row.category === category)).slice().sort((a,b) => Number(b.season)-Number(a.season));
      list.innerHTML = rows.map(row => `<article class="ml-row" data-material-row="${U.attr(row.materialId)}"><button type="button" class="ml-open" data-material-open="${U.attr(row.materialId)}"><b>${U.escapeHTML(row.name || "名称未入力")}</b><small>${U.escapeHTML(row.season)}年度 / ${U.escapeHTML(row.category)}</small><span aria-hidden="true">›</span></button><button type="button" class="secondary" data-material-purchases="${U.attr(row.materialId)}">購入履歴</button></article>`).join("") || '<p class="empty">条件に合う資材はありません。</p>';
    } else if (view === "material-detail") list.innerHTML = m ? materialDetail(m) : '<p role="alert">この資材は見つかりません。戻って一覧を確認してください。</p>';
    else list.innerHTML = "";
    if (!purchases) return;
    if (cross || view === "purchase-list") {
      const rows = allPurchases().filter(item => (!purchaseScope || cross || item.material.materialId === purchaseScope) && (year === "all" || String(item.row.season) === year) && (category === "all" || item.material.category === category)).sort((a,b) => String(b.row.date).localeCompare(String(a.row.date)));
      purchases.innerHTML = `<div class="mp-history">${rows.map(({row,material:m}) => `<article class="mp-record" data-mp-record="${U.attr(row.purchaseId)}"><button type="button" class="ml-open" data-mp-open="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}"><b>${U.escapeHTML(m.name)}</b><small>${U.escapeHTML(row.date)} / ${U.escapeHTML(row.season)}年度 / ${U.escapeHTML(m.category)}</small><small>${U.escapeHTML(row.supplier || "仕入先未記録")} / ${U.escapeHTML(row.quantity)} ${U.escapeHTML(row.unit)}</small><strong>${money(R.materialPurchases.amount(row))}</strong><span aria-hidden="true">›</span></button></article>`).join("") || '<p class="empty">条件に合う購入記録はありません。</p>'}</div>`;
    } else if (view === "purchase-detail") {
      const row = m && R.materialPurchases?.records(materialId).find(item => item.purchaseId === purchaseId);
      purchases.innerHTML = row ? purchaseDetail(row,m) : '<p role="alert">この購入記録は見つかりません。戻って履歴を確認してください。</p>';
    } else if (view === "purchase-edit") purchases.innerHTML = purchaseForm();
    else purchases.innerHTML = "";
  }
  function cancelEditor() {
    if (view === "material-edit") clearFields();
    if (view === "purchase-edit") { purchaseDraft = null; purchaseError = ""; }
    restorePrevious();
  }
  function canHandleBack() { return view !== "list"; }
  function handleBack() {
    if (!canHandleBack()) return false;
    if (view === "purchase-edit") capturePurchase();
    const dirty = view === "material-edit" ? JSON.stringify(values()) !== materialOriginal : view === "purchase-edit" ? JSON.stringify(purchaseDraft) !== purchaseOriginal : false;
    if (dirty && !confirm("入力中の変更を取り消して戻りますか？")) return true;
    if (view.endsWith("-edit")) cancelEditor(); else restorePrevious();
    return true;
  }
  function finishEdit(next, mid, pid = "") {
    if (history.at(-1)?.view === next && history.at(-1)?.materialId === mid) history.pop();
    view = next; materialId = mid; purchaseId = pid; render(); notify();
  }
  function click(event) {
    const target = event.target;
    const match = selector => target.closest(selector);
    if (match("[data-material-back]")) { handleBack(); return; }
    const tab = match("[data-material-mode]");
    if (tab) { mode = tab.dataset.materialMode; render(); return; }
    if (match("[data-material-new]")) { editMaterial(""); return; }
    const open = match("[data-material-open]");
    if (open) { move("material-detail",{materialId:open.dataset.materialOpen}); return; }
    const edit = match("[data-material-edit]");
    if (edit) { editMaterial(edit.dataset.materialEdit); return; }
    const purchase = match("[data-material-purchases]");
    if (purchase) { openPurchases(purchase.dataset.materialPurchases); return; }
    const del = match("[data-material-delete]");
    if (del) {
      const m = material(del.dataset.materialDelete);
      if (!m || !confirm(`資材「${m.name}」を削除しますか？この操作は取り消せません。`)) return;
      if (state.deleteMaterial(m.materialId)) {
        if (U.$("editMaterialId").value === m.materialId) clearFields();
        view = "list"; history.length = 0; listError = "";
      }
      else listError = errorText("資材を削除できませんでした。");
      render(); notify(); return;
    }
    const pOpen = match("[data-mp-open]");
    if (pOpen) { move("purchase-detail",{materialId:pOpen.dataset.mpMaterial,purchaseId:pOpen.dataset.mpOpen}); return; }
    if (match("[data-mp-new]")) { editPurchase("",view === "purchase-list" ? purchaseScope : ""); return; }
    const pEdit = match("[data-mp-edit]");
    if (pEdit) { editPurchase(pEdit.dataset.mpEdit,pEdit.dataset.mpMaterial); return; }
    if (match("[data-mp-cancel]")) { cancelEditor(); return; }
    const pDelete = match("[data-mp-delete]");
    if (pDelete && confirm("この購入記録を削除しますか？")) {
      if (R.materialPurchases.deletePurchase(pDelete.dataset.mpMaterial,pDelete.dataset.mpDelete)) { purchaseError = ""; restorePrevious(); }
      else { purchaseError = R.materialPurchases.lastError; render(); }
    }
  }
  function bind() {
    if (bound) return;
    bound = true;
    render();
    ["materialsLedgerHost","materialList","materialPurchases"].forEach(id => U.$(id)?.addEventListener("click",click));
    U.$("materialsLedgerHost")?.addEventListener("change",event => {
      if (event.target.id === "mpViewYear") year = event.target.value;
      if (event.target.id === "materialsCategoryFilter") category = event.target.value;
      render();
    });
    U.$("cancelMaterialEdit").addEventListener("click",cancelEditor);
    const host = U.$("materialPurchases");
    host?.addEventListener("input",() => {
      capturePurchase();
      const summary = U.$("mpSubtotal");
      if (summary && purchaseDraft) summary.textContent = `単価×数量：${money(R.materialPurchases.subtotal(purchaseDraft))} ／ 記録金額：${money(R.materialPurchases.amount(purchaseDraft))}`;
    });
    host?.addEventListener("change",event => {
      capturePurchase();
      if (event.target.name === "materialId" && purchaseDraft && !purchaseDraft.unit) { purchaseDraft.unit = material(purchaseDraft.materialId)?.unit || ""; render(); }
    });
    host?.addEventListener("submit",event => {
      if (event.target.id !== "materialPurchaseForm") return;
      event.preventDefault(); capturePurchase();
      const mid = purchaseDraft.materialId;
      const saved = R.materialPurchases.savePurchase(mid,purchaseDraft);
      if (!saved) { purchaseError = R.materialPurchases.lastError; render(); return; }
      purchaseDraft = null; purchaseError = ""; year = String(saved.season);
      finishEdit("purchase-detail",mid,saved.purchaseId);
    });
    U.$("materialForm").addEventListener("submit",event => {
      event.preventDefault();
      const record = values(), id = U.$("editMaterialId").value;
      if (!record.name.trim()) { materialError = "資材名を入力してください。"; render(); return; }
      const productUrl = safeProductUrl(record.productUrl);
      if (record.productUrl.trim() && !productUrl) { materialError = "メーカー登録URLは、ユーザー名・パスワードを含まないhttpまたはhttpsのURLを入力してください。"; render(); U.$("mProductUrl").focus(); return; }
      const before = new Set(state.data().materials.map(m => m.materialId));
      const saved = state.saveMaterial({...record,materialId:id,registrationNumber:record.registrationNumber.trim(),productUrl});
      if (!saved) { materialError = errorText("資材を保存できませんでした。入力は保持しています。"); render(); return; }
      const mid = id || state.data().materials.find(m => !before.has(m.materialId))?.materialId;
      clearFields(); if (mid) finishEdit("material-detail",mid); else render();
    });
  }
  R.screens = R.screens || {};
  R.screens.materials = {render,bind,resetForm,openPurchases,canHandleBack,handleBack};
})();
