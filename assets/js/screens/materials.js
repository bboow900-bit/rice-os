(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {}, U = R.utils, S = R.schema, state = R.state;
  let view = "list", mode = "materials", year = "all", category = "all";
  let materialId = "", purchaseId = "", purchaseScope = "", bound = false;
  let purchaseDraft = null, materialOriginal = "", purchaseOriginal = "";
  let materialError = "", purchaseError = "", listError = "";
  let stockDraft = null, stockOriginal = "", stockError = "";
  let receiptDraft = null, receiptOriginal = "";
  let cancellationDraft = null, cancellationOriginal = "", pendingStatus = "all";
  let planYear = "", costYear = "", planDraft = null, planOriginal = "", planError = "";
  const history = [];
  const inputs = {mSeason:"season",mCategory:"category",mName:"name",mFormalName:"formalName",mFormulation:"formulation",mUnit:"unit",mRegistrationNumber:"registrationNumber",mProductUrl:"productUrl",mCarryover:"carryover",mOrdered:"ordered",mUsed:"used",mRemaining:"remaining",mMemo:"nextYearMemo"};
  const purchaseKeys = ["date","season","supplier","quantity","unit","unitPrice","totalAmount","expectedDeliveryDate","memo"];
  const material = id => state.data().materials.find(row => row.materialId === id);
  const money = value => typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("ja-JP")}円` : "価格未記録";
  const errorText = fallback => state.lastError?.message || String(state.lastError || fallback);
  function snapshot() { return {view,materialId,purchaseId,purchaseScope,scrollY:window.scrollY || 0}; }
  function notify() { if (window.dispatchEvent) window.dispatchEvent(new CustomEvent("riceos:navigationchange")); }
  function move(next, values = {}) {
    history.push(snapshot()); view = next;
    if (values.materialId !== undefined) materialId = values.materialId;
    if (values.purchaseId !== undefined) purchaseId = values.purchaseId;
    if (values.purchaseScope !== undefined) purchaseScope = values.purchaseScope;
    listError = ""; render(); notify();
    if (typeof window.scrollTo === "function") window.scrollTo({top:0,behavior:"instant"});
  }
  function restorePrevious() {
    const previous = history.pop() || {view:"list",materialId:"",purchaseId:"",purchaseScope:""};
    ({view,materialId,purchaseId,purchaseScope} = previous); render(); notify();
    if (typeof window.scrollTo === "function") window.scrollTo({top:previous.scrollY || 0,behavior:"instant"});
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
  function values() {
    const base = Object.fromEntries(Object.entries(inputs).map(([id,key]) => [key,U.$(id).value]));
    const unit = U.$("mPackUnit")?.value?.trim() || "", quantity = U.$("mPackQuantity")?.value || "", baseUnit = U.$("mPackBaseUnit")?.value?.trim() || "";
    return {...base,packaging:unit || quantity || baseUnit ? {unit,quantity:Number(quantity),baseUnit} : null};
  }
  function initialStockValues() { return {date:U.$("mStockDate").value,quantity:U.$("mStockQuantity").value,memo:U.$("mStockMemo").value}; }
  function materialDraftState() { return {...values(),initialStock:initialStockValues()}; }
  function clearFields() {
    U.$("editMaterialId").value = "";
    Object.keys(inputs).forEach(id => { U.$(id).value = ""; });
    U.$("mSeason").value = U.today().slice(0,4);
    U.setOptions(U.$("mCategory"),S.MATERIAL_CATEGORIES,"肥料");
    U.$("mCategory").value = "肥料";
    U.$("saveMaterialButton").textContent = "資材を保存";
    U.$("mStockDate").value = U.today(); U.$("mStockQuantity").value = ""; U.$("mStockMemo").value = "";
    U.$("materialInitialStock").hidden = false; U.$("mUnit").readOnly = false;
    ["mPackUnit","mPackQuantity","mPackBaseUnit"].forEach(id => { if (U.$(id)) U.$(id).value = ""; });
    materialError = "";
  }
  function resetForm() {
    clearFields(); view = "list"; history.length = 0; materialId = ""; purchaseId = ""; purchaseScope = "";
    purchaseDraft = null; purchaseError = ""; listError = ""; stockDraft = null; stockError = ""; receiptDraft = null; cancellationDraft = null; planDraft = null; planError = ""; render(); notify();
  }
  function editMaterial(id) {
    const row = id ? material(id) : null;
    if (id && !row) return false;
    clearFields();
    if (row) {
      U.$("editMaterialId").value = id;
      U.setOptions(U.$("mCategory"),[...new Set([...S.MATERIAL_CATEGORIES,row.category])],row.category);
      Object.entries(inputs).forEach(([node,key]) => { U.$(node).value = row[key] ?? ""; });
      if (U.$("mPackUnit")) U.$("mPackUnit").value = row.packaging?.unit || "";
      if (U.$("mPackQuantity")) U.$("mPackQuantity").value = row.packaging?.quantity ?? "";
      if (U.$("mPackBaseUnit")) U.$("mPackBaseUnit").value = row.packaging?.baseUnit || "";
      U.$("saveMaterialButton").textContent = "資材を更新";
      const hasStock = Array.isArray(row.stocktakes) && row.stocktakes.length > 0;
      U.$("materialInitialStock").hidden = hasStock; U.$("mUnit").readOnly = hasStock || (row.purchases || []).some(p => p.receipts?.length);
    }
    materialOriginal = JSON.stringify(materialDraftState());
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
  function materialYears(m) {
    return [...new Set([m.season,...(m.purchases || []).map(row => row.season),...(m.stocktakes || []).map(row => String(row.date).slice(0,4)),...state.data().fieldWorks.filter(row => row.materialId === m.materialId && state.isActualFieldWork(row)).map(row => state.cropYearForRecord(row))].filter(Boolean).map(String))];
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
    purchaseDraft = row ? {...row,materialId:mid} : {materialId:mid || "",date:U.today(),season:year === "all" ? U.today().slice(0,4) : year,supplier:"",quantity:"",unit:m?.packaging?.unit || m?.unit || "",unitPrice:"",totalAmount:"",expectedDeliveryDate:"",memo:""};
    purchaseKeys.forEach(key => { purchaseDraft[key] = String(purchaseDraft[key] ?? ""); });
    purchaseError = ""; purchaseOriginal = JSON.stringify(purchaseDraft);
    move("purchase-edit",{materialId:mid || "",purchaseId:id || ""}); return true;
  }
  function filters(purchases) {
    const data = state.data().materials;
    const years = [...new Set((purchases ? allPurchases().map(item => item.row.season) : data.flatMap(materialYears)).map(String))].sort().reverse();
    if (year !== "all" && !years.includes(year)) years.unshift(year);
    const categories = [...new Set([...S.MATERIAL_CATEGORIES,...data.map(m => m.category),...(category === "all" ? [] : [category])])];
    return `<div class="ml-filters"><label>年度<select id="mpViewYear"><option value="all"${year === "all" ? " selected" : ""}>全年度</option>${years.map(y => `<option value="${U.attr(y)}"${y === year ? " selected" : ""}>${U.escapeHTML(y)}年度</option>`).join("")}</select></label><label>分類<select id="materialsCategoryFilter"><option value="all">すべての分類</option>${categories.map(c => `<option value="${U.attr(c)}"${c === category ? " selected" : ""}>${U.escapeHTML(c)}</option>`).join("")}</select></label></div>`;
  }
  function materialDetail(m) {
    const url = safeProductUrl(m.productUrl);
    const summary = R.materialStock.summary(m.materialId);
    const stock = summary.quantity === null ? (summary.stocktake ? "集計保留" : "在庫未登録") : `${stockNumber(summary.quantity)} ${summary.unit}`;
    const legacy = [["前年繰越",m.carryover],["今年購入（旧欄）",m.ordered],["使用数（手入力）",m.used],["在庫（手入力）",m.remaining]];
    const warnings = summary.warnings.filter(w => w.code !== "no_stocktake");
    return `<article class="ml-detail" data-material-detail="${U.attr(m.materialId)}"><h3>${U.escapeHTML(m.name || "名称未入力")}</h3><p>${U.escapeHTML(m.season)}年度 / ${U.escapeHTML(m.category)}</p>
      <section class="ms-current" aria-label="現在庫"><span>現在庫</span><button type="button" class="ms-number" data-stock-evidence aria-label="現在庫の計算根拠を見る"><strong data-material-stock-quantity>${U.escapeHTML(stock)}</strong><small>計算根拠を見る ›</small></button>
        ${supplySummary(m,summary)}
        ${summary.stocktake ? `<small>確認 ${U.escapeHTML(summary.stocktake.date)}：${U.escapeHTML(stockNumber(summary.stocktake.quantity))} ${U.escapeHTML(summary.unit)}</small><p>確認後の入庫・旧購入 ＋${U.escapeHTML(stockNumber(summary.purchased))} / 使用 −${U.escapeHTML(stockNumber(summary.used))} ${U.escapeHTML(summary.unit)}</p>` : '<p>現物を確認した在庫数は、まだ登録されていません。</p>'}
        ${warnings.length ? `<div class="ms-warning" role="status">${warnings.map(w => U.escapeHTML(stockWarning(w))).join("<br>")}${warnings.some(w => w.kind === "usage") ? '<button type="button" class="secondary" data-stock-evidence>該当する使用記録を確認・修正</button>' : ""}</div>` : ""}
        <div class="ml-actions"><button type="button" class="primary" data-ms-new="${U.attr(m.materialId)}">${summary.stocktake ? "在庫を合わせる" : "現在の在庫を登録"}</button><button type="button" class="secondary" data-ms-purchase="${U.attr(m.materialId)}">購入を追加</button></div>
      </section>
      <section class="mp-resources"><h4>費用と翌年の準備</h4>${m.packaging ? `<p>購入規格：1${U.escapeHTML(m.packaging.unit)} ＝ ${U.escapeHTML(stockNumber(m.packaging.quantity))}${U.escapeHTML(m.packaging.baseUnit)}</p>` : '<p class="muted">購入規格は未登録です。異なる単位を自動換算しません。</p>'}<div class="ml-actions"><button type="button" class="secondary" data-material-costs="${U.attr(m.materialId)}">購入費と使用費</button><button type="button" class="secondary" data-material-preparation>翌年の購入準備</button></div></section>
      <details class="ms-section" open><summary>製品情報</summary><dl>${[["正式名称",m.formalName],["剤型・規格",m.formulation],["管理単位",m.unit]].map(([label,value]) => `<div><dt>${label}</dt><dd>${U.escapeHTML(value === "" || value == null ? "未記録" : value)}</dd></div>`).join("")}</dl>${m.registrationNumber || ["除草剤","防除剤","殺虫殺菌剤"].includes(m.category) ? `<p>登録番号 ${U.escapeHTML(m.registrationNumber || "未登録")}</p>` : ""}<div class="material-reference-links">${["除草剤","防除剤","殺虫殺菌剤"].includes(m.category) ? '<a href="https://pesticide.maff.go.jp/" target="_blank" rel="noopener noreferrer">農薬登録情報（公式）</a>' : ""}${url ? `<a href="${U.attr(url)}" target="_blank" rel="noopener noreferrer">メーカー登録URL</a>` : ""}</div>${m.nextYearMemo ? `<p>${U.escapeHTML(m.nextYearMemo)}</p>` : ""}<button type="button" class="secondary" data-material-edit="${U.attr(m.materialId)}">製品情報を編集</button></details>
      ${previousPurchases(m)}
      ${stockHistory(m,summary)}
      <details class="ms-section"><summary>旧台帳の入力値（現在庫には加算しません）</summary><dl>${legacy.map(([label,value]) => `<div><dt>${label}</dt><dd>${U.escapeHTML(value === "" || value == null ? "未記録" : value)}</dd></div>`).join("")}</dl></details>
      <div class="ml-actions"><button type="button" class="secondary" data-material-purchases="${U.attr(m.materialId)}">購入履歴を一覧で見る</button><button type="button" class="secondary" data-material-delete="${U.attr(m.materialId)}">資材を削除</button></div>${usageCarte(m)}</article>`;
  }
  function stockNumber(value) { return Number.isFinite(Number(value)) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER ? Number(value).toLocaleString("ja-JP",{maximumFractionDigits:20}) : "数量確認"; }
  function selectedSeason() { return year === "all" ? U.today().slice(0,4) : year; }
  function referenceMoney(value) { return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("ja-JP",{maximumFractionDigits:2})}円` : "未算出"; }
  function seasonSelect(id,value,extra = []) {
    const current = Number(U.today().slice(0,4));
    const years = [...new Set([current - 1,current,current + 1,current + 2,current + 3,Number(value),...extra.map(Number)].filter(v => Number.isInteger(v) && v >= 1900 && v <= 2200))].sort((a,b) => b - a);
    return `<label class="mi-pending-filter">対象年度<select id="${id}">${years.map(y => `<option value="${y}"${String(y) === String(value) ? " selected" : ""}>${y}年度</option>`).join("")}</select></label>`;
  }
  function costReason(reason) {
    return ({historical_cost_unknown:"過去の単価を保存していない記録",quantity_unknown:"使用量・換算規格を確認できません",no_actual_receipt:"使用日以前の入庫実績がありません",order_cancelled:"注文取消があり金額の確認が必要です",price_unit_unknown:"単価の単位を換算できません",price_unknown:"購入価格が未記録です",price_conflict:"同日の参考単価が一致していません",actual_receipt_reference:"使用日以前の入庫に基づく参考額",invalid_usage_snapshot:"保存した費用根拠を確認できません"})[reason] || "参考額の根拠が不足しています";
  }
  function costsView() {
    const service = R.materialPlanning;
    if (!service) return '<p role="alert">費用の集計機能を読み込めませんでした。</p>';
    const y = costYear || selectedSeason(), result = service.annualCosts(materialId,y);
    const extra = state.data().materials.flatMap(m => (m.purchases || []).map(p => p.season)).concat(state.data().fieldWorks.map(w => state.cropYearForRecord(w)));
    return `<article class="mp-costs"><h3>${materialId ? U.escapeHTML(material(materialId)?.name || "資材未確認") : "全資材"}の費用</h3>${seasonSelect("materialCostYear",y,extra)}<div class="mp-cost-totals"><section><span>購入費（購入年度）</span><strong>${referenceMoney(result.purchaseCost)}</strong><small>${result.purchaseCount}件${result.unpricedPurchases ? ` / 価格未記録 ${result.unpricedPurchases}件を除く判明分` : ""}</small></section><section><span>使用費（栽培年度・参考額）</span><strong>${referenceMoney(result.usageCost)}</strong><small>${result.usageCount}件${result.unpricedUses ? ` / 未算出 ${result.unpricedUses}件を除く判明分` : ""}</small></section></div><details class="ms-section"><summary>費用の集計方法・注意点</summary><p class="ms-note">購入した年と使った年は別です。台帳に紐づく資材のみを集計します。使用費は記録保存時の入庫・単価の参考値で、会計上の原価評価ではありません。過去の単価が不明な記録は0円にしません。注文取消による返金は購入記録の金額で確認します。</p></details><h4>使用記録と費用の根拠</h4>${result.usageRows.map(row => {
      const w = row.work, snapshot = w.materialUsageSnapshot;
      const m = material(w.materialId), source = snapshot?.sourcePurchaseId && (m?.purchases || []).find(p => p.purchaseId === snapshot.sourcePurchaseId);
      return `<button type="button" class="ms-history-open" data-stock-work="${U.attr(w.workId)}"><span><b>${U.escapeHTML(U.fd(w.date))} / ${U.escapeHTML(w.workName || "作業")}</b><small>${U.escapeHTML(m?.name || w.material || "資材未確認")} / ${U.escapeHTML((w.fieldIds || []).map(id => state.field(id)?.name || "圃場未確認").join("・") || "圃場外")}</small><small>使用量 ${row.quantity === null ? U.escapeHTML(String(w.amount ?? "未記録")) : U.escapeHTML(`${stockNumber(row.quantity)} ${row.unit}`)} / ${referenceMoney(row.cost)}</small><small>${U.escapeHTML(costReason(row.reason))}</small>${typeof snapshot?.unitCost === "number" ? `<small>保存時の参考単価 ${referenceMoney(snapshot.unitCost)} / ${U.escapeHTML(snapshot.unit)}</small>` : ""}${source ? `<small>参照入庫 ${U.escapeHTML(snapshot.sourceDate)} / ${U.escapeHTML(source.supplier || "購入先未記録")}</small>` : ""}</span><span aria-hidden="true">›</span></button>`;
    }).join("") || '<p class="empty">この年度の資材使用記録はありません。</p>'}</article>`;
  }
  function preparationView() {
    if (!R.materialPlanning) return '<p role="alert">購入準備の機能を読み込めませんでした。</p>';
    const y = planYear || String(Number(selectedSeason()) + 1);
    const rows = state.data().materials.filter(m => category === "all" || m.category === category);
    const extra = state.data().materials.flatMap(m => (m.purchasePlans || []).map(p => p.season));
    return `<article class="mp-preparation">${seasonSelect("materialPlanYear",y,extra)}<p>${U.escapeHTML(category === "all" ? "全資材" : category)} / 未納品は年度をまたぐ注文も含めた現在値です。</p>${rows.map(m => {
      const p = R.materialPlanning.planning(m.materialId,y), count = value => value === null ? "未確認" : `${stockNumber(value)} ${U.escapeHTML(p.unit)}`;
      return `<section class="mp-preparation-row" data-material-plan="${U.attr(m.materialId)}"><h4>${U.escapeHTML(m.name)}</h4><dl><div><dt>${p.previousYear}年度の使用量</dt><dd>${p.previousUsageCount === 0 ? "記録なし" : count(p.previousUsage)}${p.unknownUses ? `（数量不明 ${p.unknownUses}件）` : ""}</dd></div><div><dt>現在庫</dt><dd>${count(p.stock)}</dd></div><div><dt>未納品数</dt><dd>${count(p.pending)}</dd></div><div><dt>確保予定数</dt><dd>${count(p.secured)}</dd></div><div><dt>${U.escapeHTML(y)}年度の購入予定</dt><dd>${p.plan ? `${U.escapeHTML(stockNumber(p.plan.quantity))} ${U.escapeHTML(p.plan.unit)}` : "未設定"}</dd></div></dl>${p.plan?.memo ? `<p>${U.escapeHTML(p.plan.memo)}</p>` : ""}<button type="button" class="secondary" data-plan-edit="${U.attr(m.materialId)}">${p.plan ? "購入予定を編集" : "購入予定量を決める"}</button></section>`;
    }).join("") || '<p class="empty">対象の資材がありません。</p>'}<p class="ms-note">前年の使用量は比較材料です。作付面積や使い方に合わせて購入予定量を決めます。保存しても発注・入庫・在庫の加算は行いません。</p></article>`;
  }
  function editPlan(mid) {
    const y = planYear || String(Number(selectedSeason()) + 1), m = material(mid);
    if (!m) return;
    const p = R.materialPlanning.planning(mid,y);
    const changedUnit = Boolean(p.plan && p.plan.unit !== m.unit);
    planDraft = {...(p.plan || {}),season:Number(y),quantity:p.plan && !changedUnit ? String(p.plan.quantity) : "",unit:m.unit,memo:p.plan?.memo || "",unitWarning:changedUnit ? `以前の計画は${p.plan.quantity} ${p.plan.unit}です。管理単位が変わったため、新しい単位で数量を入力してください。` : ""};
    planOriginal = JSON.stringify(planDraft); planError = ""; move("plan-edit",{materialId:mid});
  }
  function capturePlan() {
    const form = U.$("materialPlanForm");
    if (form && planDraft) ["quantity","memo"].forEach(key => { planDraft[key] = form.elements.namedItem(key).value; });
  }
  function planForm() {
    const d = planDraft;
    if (!d) return "";
    return `<form id="materialPlanForm" class="mp-form"><h3>${U.escapeHTML(material(materialId)?.name || "資材未確認")}</h3><p>${d.season}年度の購入予定</p>${d.unitWarning ? `<p class="ms-warning">${U.escapeHTML(d.unitWarning)}</p>` : ""}<label>自分で決める購入予定量（${U.escapeHTML(d.unit || "管理単位未登録")}）<input name="quantity" type="number" min="0" step="any" required value="${U.attr(d.quantity)}"></label><label>判断メモ<textarea name="memo">${U.escapeHTML(d.memo)}</textarea></label><p class="ms-note">0も登録できます。購入履歴・在庫には加算しません。</p><div class="mp-actions"><button type="button" class="secondary" data-plan-cancel>戻る</button><button type="submit" class="primary">購入予定を保存</button></div></form>`;
  }
  function purchasePendingInStockUnit(row,m) {
    const value = R.materialPurchases.deliverySummary(row).pending;
    return R.materialQuantities ? R.materialQuantities.convert(value,row.unit,m.unit,row.packagingSnapshot) : row.unit === m.unit ? value : null;
  }
  function supplySummary(m,stock) {
    const purchases = R.materialPurchases.records(m.materialId);
    const current = purchases.filter(row => row.deliveryMode === "manual");
    const remaining = current.filter(row => R.materialPurchases.deliverySummary(row).pending > 0).map(row => purchasePendingInStockUnit(row,m));
    const comparable = remaining.every(value => value !== null);
    const pending = comparable ? R.materialPurchases.quantitySum(remaining) : 0;
    const combined = stock.quantity !== null && comparable ? R.materialPurchases.quantitySum([stock.quantity,pending]) : null;
    const total = combined !== null && Number.isFinite(combined) && Math.abs(combined) <= Number.MAX_SAFE_INTEGER ? combined : null;
    const y = year === "all" ? U.today().slice(0,4) : year;
    const annual = purchases.filter(row => String(row.season) === String(y));
    const units = [...new Set(annual.map(row => row.unit))];
    const purchased = units.map(unit => `${stockNumber(R.materialPurchases.quantitySum(annual.filter(row => row.unit === unit).map(row => Number(row.quantity))))} ${unit}`).join(" / ") || "0";
    return `<span class="ms-supply" data-material-supply><span>現在庫 ＋ 未納品数 ＝ 確保予定数</span><b>${U.escapeHTML(stock.quantity === null ? "在庫未確定" : stockNumber(stock.quantity))} ＋ ${U.escapeHTML(comparable && Number.isFinite(pending) ? stockNumber(pending) : "単位・数量確認")} ＝ ${U.escapeHTML(total === null ? "未確定" : `${stockNumber(total)} ${m.unit}`)}</b><small>${U.escapeHTML(y)}年度購入：${U.escapeHTML(purchased)}（現在庫には再加算しません）</small>${purchases.some(row => row.deliveryMode !== "manual") ? '<small>旧購入は従来の在庫計算を維持しています。未納品数には含めません。</small>' : ""}</span>`;
  }
  function deliveryLabel(row) {
    if (row.deliveryMode !== "manual") return "旧購入・納品未確認（従来の在庫計算を維持）";
    const d = R.materialPurchases.deliverySummary(row);
    return `${d.pending > 0 ? `未納品 ${stockNumber(d.pending)} ${row.unit}` : d.cancelled > 0 ? "注文残なし" : "納品済み"}${d.cancelled > 0 ? ` / 注文取消 ${stockNumber(d.cancelled)} ${row.unit}` : ""} / 納品予定：${row.expectedDeliveryDate || "未定"}`;
  }
  function statusBadge(m) {
    const stock = R.materialStock.summary(m.materialId);
    const pendingRows = R.materialPurchases.records(m.materialId).filter(row => row.deliveryMode === "manual" && R.materialPurchases.deliverySummary(row).pending > 0);
    const pending = pendingRows.length > 0;
    const uncertain = stock.quantity === null || stock.quantity < 0 || pendingRows.some(row => purchasePendingInStockUnit(row,m) === null);
    return `<span class="mi-badges">${uncertain ? '<small class="mi-badge warning">確認が必要</small>' : `<small class="mi-badge">${stock.quantity > 0 ? "在庫あり" : "在庫なし"}</small>`}${pending ? '<small class="mi-badge water">納品待ち</small>' : ""}</span>`;
  }
  function previousPurchases(m) {
    const y = Number(year === "all" ? U.today().slice(0,4) : year);
    const rows = R.materialInsights?.previousPurchases(m.materialId,y) || [];
    return `<details class="ms-section mi-previous"><summary>${y - 1}年度の購入と比較</summary>${rows.map(row => `<button type="button" class="ms-history-open" data-mp-open="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}"><span><b>${U.escapeHTML(row.date)} / ${U.escapeHTML(row.supplier || "購入先未記録")}</b><small>${U.escapeHTML(stockNumber(row.quantity))} ${U.escapeHTML(row.unit)} / ${money(R.materialPurchases.amount(row))}</small><small>${U.escapeHTML(deliveryLabel(row))}</small></span><span aria-hidden="true">›</span></button>`).join("") || `<p class="muted">この資材の${y - 1}年度の購入記録はありません。同名の別資材は自動で混ぜません。</p>`}</details>`;
  }
  function pendingList() {
    const rows = R.materialInsights?.pendingPurchases({year,category,status:pendingStatus}) || [];
    const labels = {waiting:"納品待ち",partial:"一部納品",overdue:"予定日超過"};
    return `<section class="mi-pending" aria-label="未納品一覧"><p>${rows.length}件の未納品注文${year !== "all" ? ` / ${U.escapeHTML(year)}年度の注文` : " / 年度をまたぐ注文を含む"}</p>${rows.map(({material:m,row,delivery:d,status}) => `<article class="mi-order"><span class="mi-badge ${status === "overdue" ? "warning" : "water"}">${labels[status]}</span><button type="button" class="ml-open" data-mp-open="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}"><b>${U.escapeHTML(m.name)}</b><small>${U.escapeHTML(row.supplier || "購入先未記録")} / 注文 ${U.escapeHTML(row.date)}</small><strong>未納品 ${U.escapeHTML(stockNumber(d.pending))} ${U.escapeHTML(row.unit)}</strong><small>納品済 ${U.escapeHTML(stockNumber(d.received))} / 注文取消 ${U.escapeHTML(stockNumber(d.cancelled || 0))} ${U.escapeHTML(row.unit)}</small><small>納品予定：${U.escapeHTML(row.expectedDeliveryDate || "未定")}</small><span aria-hidden="true">›</span></button><div class="ml-actions"><button type="button" class="primary" data-pending-receive="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}">入庫を登録</button><button type="button" class="secondary" data-pending-cancel="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}">未納品分を取消</button></div></article>`).join("") || '<p class="empty">条件に合う未納品注文はありません。</p>'}<p class="ms-note">旧購入は納品状況を断定できないため、この一覧には含めません。</p></section>`;
  }
  function evidenceView(m) {
    if (!m || !R.materialInsights) return '<p>在庫の根拠を取得できません。</p>';
    const {summary:s,entries} = R.materialInsights.stockEvidence(m.materialId);
    const uncertainUsage = s.warnings.some(w => w.kind === "usage");
    const entryRows = entries.filter(row => row.kind !== "stocktake").map(row => {
      const work = row.workId && state.data().fieldWorks.find(w => w.workId === row.workId);
      const label = row.kind === "usage" ? work?.workName || "使用記録" : row.receiptId ? "入庫" : "旧購入";
      const source = row.workId ? `data-stock-work="${U.attr(row.workId)}"` : row.purchaseId ? `data-mp-open="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}"` : "";
      const text = row.kind === "usage" ? String(work?.amount ?? "数量未記録") : row.quantity === null ? "数量未記録" : `${stockNumber(row.quantity)} ${row.unit}`;
      return `<${source ? "button type=\"button\"" : "div"} class="ms-history-open mi-evidence-row" ${source}><span><b>${U.escapeHTML(row.date || "日付未確認")} / ${U.escapeHTML(label)}</b><small>${U.escapeHTML(text)}</small><small>${U.escapeHTML(stockLedgerLabel(row))}</small></span>${source ? '<span aria-hidden="true">›</span>' : ""}</${source ? "button" : "div"}>`;
    }).join("");
    return `<article class="mi-evidence"><h3>${U.escapeHTML(m.name)}の在庫内訳</h3><p class="mi-equation">確認在庫 ${s.stocktake ? U.escapeHTML(stockNumber(s.stocktake.quantity)) : "未登録"} ＋ 入庫・旧購入 ${U.escapeHTML(stockNumber(s.purchased))} − 使用${uncertainUsage ? "（数量確認済み分）" : ""} ${U.escapeHTML(stockNumber(s.used))} ＝ ${s.quantity === null ? "集計保留" : U.escapeHTML(`${stockNumber(s.quantity)} ${s.unit}`)}</p>${s.warnings.length ? `<div class="ms-warning">${s.warnings.map(w => U.escapeHTML(stockWarning(w))).join("<br>")}</div>` : ""}${s.stocktake ? `<button type="button" class="ms-history-open" data-evidence-stocktake><span><b>基準の在庫確認 ${U.escapeHTML(s.stocktake.date)}</b><small>${U.escapeHTML(stockNumber(s.stocktake.quantity))} ${U.escapeHTML(s.unit)}</small></span><span aria-hidden="true">›</span></button>` : '<button type="button" class="primary" data-ms-new="' + U.attr(m.materialId) + '">現在の在庫を登録</button>'}<h4>入庫・使用の記録</h4>${entryRows || '<p>関連する入庫・使用記録はありません。</p>'}<p class="ms-note">在庫確認に含まれる記録は再加減算しません。数量・単位が不明な記録は、元の記録から確認できます。</p></article>`;
  }
  function editCancellation() {
    const row = R.materialPurchases.records(materialId).find(p => p.purchaseId === purchaseId);
    if (!row) return;
    cancellationDraft = {date:U.today(),quantity:String(R.materialPurchases.deliverySummary(row).pending),reason:"",unit:row.unit};
    cancellationOriginal = JSON.stringify(cancellationDraft); purchaseError = ""; move("cancellation-edit");
  }
  function captureCancellation() {
    const form = U.$("materialCancellationForm");
    if (form && cancellationDraft) ["date","quantity","reason"].forEach(key => { cancellationDraft[key] = form.elements.namedItem(key).value; });
  }
  function cancellationForm() {
    const d = cancellationDraft;
    if (!d) return "";
    return `<form id="materialCancellationForm" class="mp-form"><h3>${U.escapeHTML(material(materialId)?.name)}の未納品分を取消</h3><label>取消日<input type="date" name="date" required max="${U.attr(U.today())}" value="${U.attr(d.date)}"></label><label>取消数（${U.escapeHTML(d.unit)}）<input type="number" name="quantity" min="0" step="any" required value="${U.attr(d.quantity)}"></label><label>取消理由<textarea name="reason" required>${U.escapeHTML(d.reason)}</textarea></label><p class="ms-note">元の注文数と入庫履歴は残します。請求・返金額は自動変更しません。必要に応じて購入記録の金額を確認してください。</p><div class="mp-actions"><button type="button" class="secondary" data-cancellation-back>戻る</button><button type="submit" class="primary">注文取消を保存</button></div></form>`;
  }
  function cancellationHistory(row) {
    if (row.deliveryMode !== "manual") return "";
    const d = R.materialPurchases.deliverySummary(row);
    return `<section class="ms-section mi-cancellations"><h4>未納品分の注文取消</h4>${d.pending > 0 ? '<button type="button" class="secondary" data-cancellation-new>未納品分を取り消す</button>' : ""}${(row.cancellations || []).map(c => `<div class="ms-history-row"><b>${U.escapeHTML(c.date)} / ${U.escapeHTML(stockNumber(c.quantity))} ${U.escapeHTML(row.unit)}</b><small>${c.deletedAt ? "取消を取り消し済み" : "注文取消済み"}</small><p>${U.escapeHTML(c.reason)}</p>${!c.deletedAt ? `<button type="button" class="secondary" data-cancellation-undo="${U.attr(c.cancellationId)}">注文取消を取り消す</button>` : ""}</div>`).join("")}${d.cancelled > 0 ? '<p class="ms-warning">注文取消分も登録金額に含まれる場合があります。請求・返金額を確認し、必要なら購入記録の金額を編集してください。</p>' : ""}</section>`;
  }
  function purchaseTotals(rows) {
    const groups = new Map();
    rows.forEach(({row}) => {
      const key = String(row.season), group = groups.get(key) || {total:0,unknown:0,count:0,cancelled:0};
      const amount = R.materialPurchases.amount(row);
      if (amount === null) group.unknown++; else group.total += amount;
      if (R.materialPurchases.deliverySummary(row).cancelled > 0) group.cancelled++;
      group.count++; groups.set(key,group);
    });
    return `<section class="mp-year-totals" aria-label="年度別購入費用">${[...groups].sort((a,b) => b[0].localeCompare(a[0])).map(([y,g]) => `<div><span>${U.escapeHTML(y)}年度の購入費用</span><strong>${Number.isSafeInteger(g.total) ? money(g.total) : "集計可能範囲を超えています"}</strong><small>${g.count}件${g.unknown ? ` / 価格未記録 ${g.unknown}件（合計に含めません）` : ""}</small>${g.cancelled ? `<small class="mi-finance-note">注文取消あり ${g.cancelled}件。登録金額をそのまま集計しています。請求・返金に合わせた金額編集の確認が必要です。</small>` : ""}</div>`).join("")}</section>`;
  }
  function captureReceipt() {
    const form = U.$("materialReceiptForm");
    if (form && receiptDraft) ["date","quantity","memo"].forEach(key => { receiptDraft[key] = form.elements.namedItem(key).value; });
  }
  function editReceipt(id = "") {
    const row = R.materialPurchases.records(materialId).find(item => item.purchaseId === purchaseId);
    if (!row) return;
    const receipt = id && (row.receipts || []).find(item => item.receiptId === id && !item.deletedAt);
    receiptDraft = {receiptId:id,date:receipt?.date || U.today(),quantity:String(receipt?.quantity ?? R.materialPurchases.deliverySummary(row).pending),unit:row.unit,memo:receipt?.memo || ""};
    receiptOriginal = JSON.stringify(receiptDraft); purchaseError = ""; move("receipt-edit");
  }
  function receiptForm() {
    const d = receiptDraft;
    if (!d) return "";
    return `<form id="materialReceiptForm" class="mp-form"><h3>${U.escapeHTML(material(materialId)?.name)}の納品・入庫</h3><label>実際の納品日<input name="date" type="date" required max="${U.attr(U.today())}" value="${U.attr(d.date)}"></label><label>入庫数（${U.escapeHTML(d.unit)}）<input name="quantity" type="number" min="0" step="any" required value="${U.attr(d.quantity)}"></label><label>メモ（任意）<textarea name="memo">${U.escapeHTML(d.memo)}</textarea></label><div class="mp-actions"><button type="button" class="secondary" data-receipt-cancel>取消</button><button type="submit" class="primary">入庫を保存</button></div></form>`;
  }
  function stockWarning(w) {
    const labels = {negative_stock:"在庫がマイナスです。購入・使用・確認数をご確認ください。",unknown_quantity:"使用量の総量を確認できない記録があります。",unknown_or_mismatched_unit:"単位が一致しない記録があります。袋とkgなどは換算していません。",invalid_transaction_id:"履歴IDが不明または重複しています。",invalid_date:"日付を確認できない履歴があります。",invalid_stocktake:"在庫確認履歴を確認してください。",quantity_overflow:"数量が計算可能な範囲を超えています。"};
    return `${w.date ? `${w.date}：` : ""}${labels[w.code] || "履歴を確認できないため在庫の集計を保留しています。"}`;
  }
  function stockHistory(m,summary) {
    const purchases = R.materialPurchases.records(m.materialId).slice().sort((a,b) => b.date.localeCompare(a.date));
    const rows = summary.ledger.filter(row => row.kind === "usage").sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const checks = (m.stocktakes || []).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)) || Number(b.sequence || 0) - Number(a.sequence || 0) || String(b.stocktakeId).localeCompare(String(a.stocktakeId)));
    const superseded = new Set(checks.filter(row => !row.deletedAt).map(row => row.supersedesId).filter(Boolean));
    return `<details class="ms-section"><summary>購入履歴 ${purchases.length}件</summary>${purchases.map(row => `<button type="button" class="ms-history-open" data-mp-open="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}"><span><b>${U.escapeHTML(row.date)} / ＋${U.escapeHTML(stockNumber(row.quantity))} ${U.escapeHTML(row.unit)}</b><small>${U.escapeHTML(row.supplier || "購入先未記録")} / ${money(R.materialPurchases.amount(row))}</small><small>${U.escapeHTML(stockLedgerLabel(summary.ledger.find(item => item.kind === "purchase" && item.id === row.purchaseId)))}</small></span><span aria-hidden="true">›</span></button>`).join("") || '<p>購入履歴はありません。</p>'}</details>
      <details class="ms-section"><summary>使用履歴 ${rows.length}件</summary>${rows.map(row => { const work = state.data().fieldWorks.find(w => w.workId === row.id); return `<div class="ms-history-row"><b>${U.escapeHTML(row.date)} / ${U.escapeHTML(work?.workName || "作業")}</b><span>${U.escapeHTML(String(work?.amount || "使用量未記録"))}</span><small>${U.escapeHTML(row.included ? "現在庫に反映済み" : ["before_stocktake","stocktake_snapshot"].includes(row.reason) ? "確認在庫に含む" : row.reason === "future" ? "未来日のため未反映" : "数量・単位の確認が必要")}</small></div>`; }).join("") || '<p>この資材に紐づく使用履歴はありません。</p>'}</details>
      <details class="ms-section" data-ms-history><summary>在庫確認履歴 ${checks.length}件</summary>${checks.map(row => stocktakeRow(row,summary.stocktake?.stocktakeId,superseded)).join("") || '<p>在庫確認履歴はありません。</p>'}</details>`;
  }
  function stocktakeRow(row,currentId,superseded) {
    const change = typeof row.previousQuantity === "number" && typeof row.adjustment === "number"
      ? `<small>${row.supersedesId ? "訂正前の確認" : "計算上"} ${U.escapeHTML(stockNumber(row.previousQuantity))} → ${U.escapeHTML(stockNumber(row.quantity))} ${U.escapeHTML(row.unit)}（差 ${row.adjustment > 0 ? "+" : ""}${U.escapeHTML(stockNumber(row.adjustment))}）</small>` : "";
    return `<div class="ms-history-row" data-ms-stocktake="${U.attr(row.stocktakeId)}"><b>${U.escapeHTML(row.date)} / ${U.escapeHTML(stockNumber(row.quantity))} ${U.escapeHTML(row.unit)}</b><small>${row.deletedAt ? "取消済み" : superseded.has(row.stocktakeId) ? "訂正前" : row.stocktakeId === currentId ? "現在庫の基準" : "以前の確認"}</small>${change}${row.memo ? `<p>${U.escapeHTML(row.memo)}</p>` : ""}${!row.deletedAt && !superseded.has(row.stocktakeId) ? `<div class="ml-actions"><button type="button" class="secondary" data-ms-correct="${U.attr(row.stocktakeId)}">訂正</button><button type="button" class="secondary" data-ms-delete="${U.attr(row.stocktakeId)}">取り消す</button></div>` : ""}</div>`;
  }
  function stockLedgerLabel(row) {
    if (row?.included) return "現在庫に反映済み";
    if (["before_stocktake","stocktake_snapshot"].includes(row?.reason)) return "確認在庫に含む（再加算なし）";
    if (row?.reason === "no_stocktake") return "在庫確認未登録";
    if (row?.reason === "future") return "未来日のため未反映";
    return "数量・単位の確認が必要";
  }
  function captureStock() {
    const form = U.$("materialStockForm");
    if (!form || !stockDraft) return;
    ["date","quantity","memo"].forEach(key => { stockDraft[key] = form.elements.namedItem(key).value; });
  }
  function editStock(mid,id = "") {
    const m = material(mid), row = id && (m?.stocktakes || []).find(item => item.stocktakeId === id && !item.deletedAt);
    if (!m || id && !row) return;
    if (!m.unit.trim()) { editMaterial(mid); U.$("mUnit").focus(); return; }
    stockDraft = {stocktakeId:id,date:row?.date || U.today(),quantity:row ? String(row.quantity) : "",unit:m.unit || "",memo:row?.memo || ""};
    stockOriginal = JSON.stringify(stockDraft); stockError = ""; move("stock-edit",{materialId:mid});
  }
  function stockForm(m) {
    const d = stockDraft;
    if (!d || !m) return "";
    const summary = R.materialStock.summary(m.materialId);
    return `<form id="materialStockForm" class="ms-form"><h3>${U.escapeHTML(m.name)}</h3><p>計算上の現在庫：${summary.quantity === null ? "未確定" : `${U.escapeHTML(stockNumber(summary.quantity))} ${U.escapeHTML(summary.unit)}`}</p><label>確認日<input type="date" name="date" required max="${U.attr(U.today())}" value="${U.attr(d.date)}"></label><label>現物を数えた在庫（${U.escapeHTML(d.unit || "管理単位未登録")}）<input type="number" name="quantity" min="0" step="any" inputmode="decimal" required value="${U.attr(d.quantity)}"></label><label>理由・確認メモ（任意）<textarea name="memo">${U.escapeHTML(d.memo)}</textarea></label><p class="ms-note">確認日以前の登録済み入庫・使用は確認数に含みます。同じ日の確認後に追加した入庫・使用は、そこから加減算します。購入予定だけでは在庫は増えません。旧購入は従来の計算を維持します。</p><div class="ml-actions"><button type="button" class="secondary" data-ms-cancel>取消</button><button type="submit" class="primary">在庫確認を保存</button></div></form>`;
  }
  function purchaseDetail(row,m) {
    const receiptRows = (row.receipts || []).map(r => `<div class="ms-history-row"><b>${U.escapeHTML(r.date)} / ${U.escapeHTML(stockNumber(r.quantity))} ${U.escapeHTML(r.unit)}</b><small>${r.deletedAt ? "取消済み" : "入庫登録済み"}</small>${r.memo ? `<p>${U.escapeHTML(r.memo)}</p>` : ""}${!r.deletedAt ? `<div class="ml-actions"><button type="button" class="secondary" data-receipt-edit="${U.attr(r.receiptId)}">編集</button><button type="button" class="secondary" data-receipt-delete="${U.attr(r.receiptId)}">取り消す</button></div>` : ""}</div>`).join("");
    const delivery = `<section class="ms-section"><h4>納品・入庫</h4><p>${U.escapeHTML(deliveryLabel(row))}</p>${row.deliveryMode === "manual" ? `${R.materialPurchases.deliverySummary(row).pending > 0 ? '<button type="button" class="primary" data-receipt-new>納品・入庫を登録</button>' : ""}${receiptRows}` : ""}</section>`;
    return `<article class="mp-detail" data-mp-detail="${U.attr(row.purchaseId)}"><h3>${U.escapeHTML(m.name)}の購入記録</h3><dl>${[["購入日",row.date],["年度",row.season],["分類",m.category],["仕入先",row.supplier || "未記録"],["数量",`${row.quantity} ${row.unit}`],["納品予定日",row.expectedDeliveryDate || "未定"],["税込単価",money(row.unitPrice)],["単価×数量",money(R.materialPurchases.subtotal(row))],[row.totalAmount !== "" && row.totalAmount != null ? "税込実額" : "記録金額",money(R.materialPurchases.amount(row))]].map(([label,value]) => `<div><dt>${label}</dt><dd>${U.escapeHTML(value)}</dd></div>`).join("")}</dl>${row.memo ? `<p>${U.escapeHTML(row.memo)}</p>` : ""}${delivery}<div class="mp-actions"><button type="button" class="primary" data-mp-edit="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}">編集</button><button type="button" class="secondary" data-mp-delete="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}">削除</button></div></article>`;
  }
  function purchaseForm() {
    const draft = purchaseDraft;
    if (!draft) return "";
    return `<form id="materialPurchaseForm" class="mp-form"><h3>${draft.purchaseId ? "購入記録を編集" : "購入記録を追加"}</h3>${draft.purchaseId ? `<p>${U.escapeHTML(material(draft.materialId)?.name || "資材が見つかりません")}</p>` : `<label>資材<select name="materialId" required><option value="">保存済みの資材を選択</option>${state.data().materials.map(m => `<option value="${U.attr(m.materialId)}"${m.materialId === draft.materialId ? " selected" : ""}>${U.escapeHTML(m.name)} / ${U.escapeHTML(m.category)}</option>`).join("")}</select></label>`}<div class="mp-grid">${[["date","購入日","date","required"],["season","年度","number",'min="1900" max="2200" step="1" required'],["supplier","仕入先","text",""],["expectedDeliveryDate","納品予定日（空欄は未定）","date",""],["quantity","数量","number",'min="0" step="any" required'],["unit","単位","text","required"],["unitPrice","税込単価（円・任意）","number",'min="0" step="1"'],["totalAmount","税込総額（実額・任意）","number",'min="0" step="1"']].map(([name,label,type,attrs]) => `<label>${label}<input name="${name}" id="mp-${name}" type="${type}" ${attrs} value="${U.attr(draft[name] ?? "")}"></label>`).join("")}</div><label>メモ<textarea name="memo">${U.escapeHTML(draft.memo || "")}</textarea></label><p class="ms-note">購入の保存では入庫しません。実際に届いたら購入詳細から納品・入庫を登録します。</p><p id="mpSubtotal" class="mp-subtotal">単価×数量：${money(R.materialPurchases.subtotal(draft))} ／ 記録金額：${money(R.materialPurchases.amount(draft))}</p><div class="mp-actions"><button type="button" class="secondary" data-mp-cancel>取消</button><button type="submit" class="primary">購入記録を保存</button></div></form>`;
  }
  function setHidden(node, hidden) { if (node) node.hidden = hidden; }
  function render() {
    const form = U.$("materialForm"), list = U.$("materialList"), purchases = U.$("materialPurchases"), stockEditor = U.$("materialStockEditor");
    if (!form || !list) return;
    let host = U.$("materialsLedgerHost");
    if (!host && document.createElement) { host = document.createElement("div"); host.id = "materialsLedgerHost"; form.before(host); }
    const categories = [...new Set([...S.MATERIAL_CATEGORIES,U.$("mCategory").value].filter(Boolean))];
    U.setOptions(U.$("mCategory"),categories,U.$("mCategory").value || "肥料");
    const m = material(materialId), cross = view === "list" && mode !== "materials", pending = cross && mode === "pending";
    setHidden(form,view !== "material-edit"); setHidden(list,!["list","material-detail","stock-evidence","cost-summary","plan-list","plan-edit"].includes(view) || cross);
    setHidden(purchases,!(cross || view.startsWith("purchase-") || ["receipt-edit","cancellation-edit"].includes(view)));
    setHidden(stockEditor,view !== "stock-edit");
    if (stockEditor) stockEditor.innerHTML = view === "stock-edit" ? stockForm(m) : "";
    const title = {"stock-evidence":"在庫の計算根拠","stock-edit":"在庫を合わせる","material-detail":"資材の詳細","material-edit":U.$("editMaterialId").value ? "資材を編集" : "資材を追加","purchase-list":m ? `${m.name}の購入履歴` : "購入履歴","purchase-detail":"購入記録の詳細","purchase-edit":purchaseId ? "購入記録を編集" : "購入記録を追加"}[view] || "資材と購入の台帳";
    if (host) host.innerHTML = `<div class="ml-heading"><h3>${U.escapeHTML(title)}</h3>${view !== "list" ? '<button type="button" class="secondary" data-material-back>戻る</button>' : ""}</div>${view === "list" ? `<div class="ml-modes" role="group" aria-label="台帳の表示"><button type="button" data-material-mode="materials" aria-pressed="${mode === "materials"}">資材一覧</button><button type="button" data-material-mode="purchases" aria-pressed="${mode === "purchases"}">購入履歴</button></div>${filters(cross)}<div class="ml-actions"><button type="button" class="primary" ${cross ? "data-mp-new" : "data-material-new"}>＋ ${cross ? "購入を追加" : "資材を追加"}</button></div>` : view === "purchase-list" ? `${filters(true)}<button type="button" class="primary" data-mp-new>＋ 購入を追加</button>` : ""}<p class="ml-error" role="alert">${U.escapeHTML(view === "material-edit" ? materialError : view === "stock-edit" ? stockError : view.startsWith("purchase-") ? purchaseError : listError)}</p>`;
    if (view === "list" && host) {
      host.querySelector?.(".ml-modes")?.insertAdjacentHTML("beforeend",`<button type="button" data-material-mode="pending" aria-pressed="${pending}">納品待ち</button>`);
      if (pending) host.insertAdjacentHTML?.("beforeend",`<label class="mi-pending-filter">納品状況<select id="materialPendingStatus">${[["all","すべて"],["waiting","納品待ち"],["partial","一部納品"],["overdue","予定日超過"]].map(([value,label]) => `<option value="${value}"${pendingStatus === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>`);
      host.insertAdjacentHTML?.("beforeend",'<div class="ml-actions mp-insight-links"><button type="button" class="secondary" data-material-costs="">購入費と使用費</button><button type="button" class="secondary" data-material-preparation>翌年の購入準備</button></div>');
    }
    if (["cost-summary","plan-list","plan-edit"].includes(view) && host) {
      const heading = host.querySelector?.("h3"), alert = host.querySelector?.('[role="alert"]');
      if (heading) heading.textContent = view === "cost-summary" ? "購入費と使用費" : view === "plan-edit" ? "購入予定を編集" : "翌年の購入準備";
      if (alert) alert.textContent = planError;
    }
    if (view === "list" && !cross) {
      const rows = state.data().materials.filter(row => (year === "all" || materialYears(row).includes(year)) && (category === "all" || row.category === category)).slice().sort((a,b) => Number(b.season)-Number(a.season));
      list.innerHTML = rows.map(row => { const s = R.materialStock.summary(row.materialId); return `<article class="ml-row" data-material-row="${U.attr(row.materialId)}"><button type="button" class="ml-open" data-material-open="${U.attr(row.materialId)}"><b>${U.escapeHTML(row.name || "名称未入力")}</b><small>${U.escapeHTML(row.season)}年度 / ${U.escapeHTML(row.category)}</small><strong>在庫：${U.escapeHTML(s.quantity === null ? s.stocktake ? "集計保留" : "未登録" : `${stockNumber(s.quantity)} ${s.unit}`)}</strong><span aria-hidden="true">›</span></button><button type="button" class="secondary" data-material-purchases="${U.attr(row.materialId)}">購入履歴</button></article>`; }).join("") || '<p class="empty">条件に合う資材はありません。</p>';
    } else if (view === "material-detail") list.innerHTML = m ? materialDetail(m) : '<p role="alert">この資材は見つかりません。戻って一覧を確認してください。</p>';
    else if (view === "stock-evidence") list.innerHTML = evidenceView(m);
    else if (view === "cost-summary") list.innerHTML = costsView();
    else if (view === "plan-list") list.innerHTML = preparationView();
    else if (view === "plan-edit") list.innerHTML = planForm();
    else list.innerHTML = "";
    if (view === "list" && !cross) list.querySelectorAll?.("[data-material-row]").forEach(node => {
      const row = material(node.dataset.materialRow), button = node.querySelector(".ml-open");
      if (row && button) button.insertAdjacentHTML("beforeend",statusBadge(row) + supplySummary(row,R.materialStock.summary(row.materialId)));
    });
    if (view === "material-detail" && m) list.querySelectorAll?.(".ms-history-open[data-mp-open]").forEach(node => {
      if (node.closest(".mi-previous")) return;
      const row = R.materialPurchases.records(m.materialId).find(item => item.purchaseId === node.dataset.mpOpen);
      if (!row) return;
      const title = node.querySelector("b"), status = node.querySelector("small:last-child");
      if (title) title.textContent = `${row.date} / 購入 ${stockNumber(row.quantity)} ${row.unit}`;
      if (status) status.textContent = deliveryLabel(row);
    });
    if (["receipt-edit","cancellation-edit"].includes(view) && host) {
      const heading = host.querySelector("h3"), alert = host.querySelector('[role="alert"]');
      if (heading) heading.textContent = view === "receipt-edit" ? "納品・入庫を登録" : "未納品分の注文取消";
      if (alert) alert.textContent = purchaseError;
    }
    if (!purchases) return;
    if (pending) purchases.innerHTML = pendingList();
    else if (cross || view === "purchase-list") {
      const rows = allPurchases().filter(item => (!purchaseScope || cross || item.material.materialId === purchaseScope) && (year === "all" || String(item.row.season) === year) && (category === "all" || item.material.category === category)).sort((a,b) => String(b.row.date).localeCompare(String(a.row.date)));
      purchases.innerHTML = `<div class="mp-history">${rows.map(({row,material:m}) => `<article class="mp-record" data-mp-record="${U.attr(row.purchaseId)}"><button type="button" class="ml-open" data-mp-open="${U.attr(row.purchaseId)}" data-mp-material="${U.attr(m.materialId)}"><b>${U.escapeHTML(m.name)}</b><small>${U.escapeHTML(row.date)} / ${U.escapeHTML(row.season)}年度 / ${U.escapeHTML(m.category)}</small><small>${U.escapeHTML(row.supplier || "仕入先未記録")} / ${U.escapeHTML(row.quantity)} ${U.escapeHTML(row.unit)}</small><strong>${money(R.materialPurchases.amount(row))}</strong><span aria-hidden="true">›</span></button></article>`).join("") || '<p class="empty">条件に合う購入記録はありません。</p>'}</div>`;
    } else if (view === "purchase-detail") {
      const row = m && R.materialPurchases?.records(materialId).find(item => item.purchaseId === purchaseId);
      purchases.innerHTML = row ? purchaseDetail(row,m) : '<p role="alert">この購入記録は見つかりません。戻って履歴を確認してください。</p>';
      if (row) purchases.querySelector?.(".mp-detail")?.insertAdjacentHTML("beforeend",cancellationHistory(row));
    } else if (view === "purchase-edit") {
      purchases.innerHTML = purchaseForm();
      if (purchaseDraft?.purchaseId && purchaseDraft.deliveryMode !== "manual") {
        const note = purchases.querySelector?.(".ms-note");
        if (note) note.textContent = "この旧購入は従来の在庫計算を維持します。数量・日付を変更すると、在庫確認後の集計も再計算されます。";
      }
    }
    else if (view === "receipt-edit") purchases.innerHTML = receiptForm();
    else if (view === "cancellation-edit") purchases.innerHTML = cancellationForm();
    else purchases.innerHTML = "";
    if (cross && !pending || view === "purchase-list") {
      const rows = allPurchases().filter(item => (!purchaseScope || cross || item.material.materialId === purchaseScope) && (year === "all" || String(item.row.season) === year) && (category === "all" || item.material.category === category));
      purchases.insertAdjacentHTML?.("afterbegin",purchaseTotals(rows));
      purchases.querySelectorAll?.("[data-mp-record]").forEach(node => {
        const mid = node.querySelector("[data-mp-material]")?.dataset.mpMaterial;
        const item = rows.find(item => item.row.purchaseId === node.dataset.mpRecord && item.material.materialId === mid);
        if (item) node.querySelector(".ml-open")?.insertAdjacentHTML("beforeend",`<small class="mp-delivery-status">${U.escapeHTML(deliveryLabel(item.row))}</small>`);
      });
    }
  }
  function cancelEditor() {
    if (view === "material-edit") clearFields();
    if (view === "purchase-edit") { purchaseDraft = null; purchaseError = ""; }
    if (view === "stock-edit") { stockDraft = null; stockError = ""; }
    if (view === "receipt-edit") { receiptDraft = null; purchaseError = ""; }
    if (view === "cancellation-edit") { cancellationDraft = null; purchaseError = ""; }
    if (view === "plan-edit") { planDraft = null; planError = ""; }
    restorePrevious();
  }
  function canHandleBack() { return view !== "list"; }
  function handleBack() {
    if (!canHandleBack()) return false;
    if (view === "purchase-edit") capturePurchase();
    if (view === "stock-edit") captureStock();
    if (view === "plan-edit") {
      capturePlan();
      if (JSON.stringify(planDraft) !== planOriginal && !confirm("入力中の変更を取り消して戻りますか？")) return true;
      cancelEditor(); return true;
    }
    if (view === "cancellation-edit") {
      captureCancellation();
      if (JSON.stringify(cancellationDraft) !== cancellationOriginal && !confirm("入力中の変更を取り消して戻りますか？")) return true;
      cancelEditor(); return true;
    }
    if (view === "receipt-edit") {
      captureReceipt();
      if (JSON.stringify(receiptDraft) !== receiptOriginal && !confirm("入力中の変更を取り消して戻りますか？")) return true;
      cancelEditor(); return true;
    }
    const dirty = view === "material-edit" ? JSON.stringify(materialDraftState()) !== materialOriginal : view === "purchase-edit" ? JSON.stringify(purchaseDraft) !== purchaseOriginal : view === "stock-edit" ? JSON.stringify(stockDraft) !== stockOriginal : false;
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
    const costButton = match("[data-material-costs]");
    if (costButton) { costYear = selectedSeason(); planError = ""; move("cost-summary",{materialId:costButton.dataset.materialCosts}); return; }
    if (match("[data-material-preparation]")) { planYear = String(Number(selectedSeason()) + 1); planError = ""; move("plan-list",{materialId:""}); return; }
    const planEdit = match("[data-plan-edit]");
    if (planEdit) { editPlan(planEdit.dataset.planEdit); return; }
    if (match("[data-plan-cancel]")) { handleBack(); return; }
    if (match("[data-stock-evidence]")) { move("stock-evidence"); return; }
    if (match("[data-evidence-stocktake]")) {
      restorePrevious();
      const details = U.$("materialList")?.querySelector?.("[data-ms-history]");
      if (details) { details.open = true; details.scrollIntoView({block:"center"}); }
      return;
    }
    const sourceWork = match("[data-stock-work]");
    if (sourceWork) {
      const work = state.data().fieldWorks.find(w => w.workId === sourceWork.dataset.stockWork);
      if (!work || materialId && work.materialId !== materialId) { listError = "使用記録が見つかりません。"; render(); return; }
      R.app.openInput("field-work","materials",{nested:true});
      R.screens.fieldWork.editWork(work.workId);
      document.querySelector('#screen-field-work [data-work-mode-select="detail"]')?.click();
      U.$("fwAmount")?.focus();
      U.$("fwAmount")?.scrollIntoView({block:"center"});
      return;
    }
    const pendingAction = match("[data-pending-receive],[data-pending-cancel]");
    if (pendingAction) {
      move("purchase-detail",{materialId:pendingAction.dataset.mpMaterial,purchaseId:pendingAction.dataset.pendingReceive || pendingAction.dataset.pendingCancel});
      if (pendingAction.dataset.pendingReceive) editReceipt(); else editCancellation();
      return;
    }
    if (match("[data-cancellation-new]")) { editCancellation(); return; }
    if (match("[data-cancellation-back]")) { handleBack(); return; }
    const cancellationUndo = match("[data-cancellation-undo]");
    if (cancellationUndo && confirm("この注文取消を取り消して、未納品数へ戻しますか？")) {
      purchaseError = R.materialPurchases.deleteCancellation(materialId,purchaseId,cancellationUndo.dataset.cancellationUndo) ? "" : R.materialPurchases.lastError;
      render(); return;
    }
    if (match("[data-receipt-new]")) { editReceipt(); return; }
    const receiptEdit = match("[data-receipt-edit]");
    if (receiptEdit) { editReceipt(receiptEdit.dataset.receiptEdit); return; }
    if (match("[data-receipt-cancel]")) { handleBack(); return; }
    const receiptDelete = match("[data-receipt-delete]");
    if (receiptDelete && confirm("この入庫を取り消しますか？取消履歴は残ります。")) {
      purchaseError = R.materialPurchases.deleteReceipt(materialId,purchaseId,receiptDelete.dataset.receiptDelete) ? "" : R.materialPurchases.lastError;
      render(); return;
    }
    const tab = match("[data-material-mode]");
    if (tab) { mode = tab.dataset.materialMode; render(); return; }
    if (match("[data-material-new]")) { editMaterial(""); return; }
    const stockNew = match("[data-ms-new]");
    if (stockNew) { editStock(stockNew.dataset.msNew); return; }
    const stockCorrect = match("[data-ms-correct]");
    if (stockCorrect) { editStock(materialId,stockCorrect.dataset.msCorrect); return; }
    if (match("[data-ms-cancel]")) { handleBack(); return; }
    const stockDelete = match("[data-ms-delete]");
    if (stockDelete && confirm("この在庫確認を取り消しますか？履歴は残り、以前の在庫確認を基準に再計算します。")) {
      if (!R.materialStock.deleteStocktake(materialId,stockDelete.dataset.msDelete)) listError = R.materialStock.lastError();
      render(); return;
    }
    const stockPurchase = match("[data-ms-purchase]");
    if (stockPurchase) { editPurchase("",stockPurchase.dataset.msPurchase); return; }
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
    ["materialsLedgerHost","materialList","materialPurchases","materialStockEditor"].forEach(id => U.$(id)?.addEventListener("click",click));
    U.$("materialList")?.addEventListener("input",capturePlan);
    U.$("materialList")?.addEventListener("change",event => {
      if (event.target.id === "materialCostYear") { costYear = event.target.value; render(); }
      if (event.target.id === "materialPlanYear") { planYear = event.target.value; render(); }
    });
    U.$("materialList")?.addEventListener("submit",event => {
      if (event.target.id !== "materialPlanForm") return;
      event.preventDefault(); capturePlan();
      const saved = R.materialPlanning.savePlan(materialId,planDraft);
      if (!saved) { planError = R.materialPlanning.lastError; render(); return; }
      planDraft = null; planError = ""; finishEdit("plan-list","");
    });
    U.$("materialStockEditor")?.addEventListener("input",captureStock);
    U.$("materialStockEditor")?.addEventListener("submit",event => {
      if (event.target.id !== "materialStockForm") return;
      event.preventDefault(); captureStock();
      const saved = stockDraft.stocktakeId ? R.materialStock.editStocktake(materialId,stockDraft.stocktakeId,stockDraft) : R.materialStock.saveStocktake(materialId,stockDraft);
      if (!saved) { stockError = R.materialStock.lastError(); render(); return; }
      stockDraft = null; stockError = ""; finishEdit("material-detail",materialId);
    });
    U.$("materialsLedgerHost")?.addEventListener("change",event => {
      if (event.target.id === "mpViewYear") year = event.target.value;
      if (event.target.id === "materialsCategoryFilter") category = event.target.value;
      if (event.target.id === "materialPendingStatus") pendingStatus = event.target.value;
      render();
    });
    U.$("cancelMaterialEdit").addEventListener("click",cancelEditor);
    const host = U.$("materialPurchases");
    host?.addEventListener("input",() => {
      captureCancellation();
      captureReceipt();
      capturePurchase();
      const summary = U.$("mpSubtotal");
      if (summary && purchaseDraft) summary.textContent = `単価×数量：${money(R.materialPurchases.subtotal(purchaseDraft))} ／ 記録金額：${money(R.materialPurchases.amount(purchaseDraft))}`;
    });
    host?.addEventListener("change",event => {
      capturePurchase();
      if (event.target.name === "materialId" && purchaseDraft && !purchaseDraft.unit) { const m = material(purchaseDraft.materialId); purchaseDraft.unit = m?.packaging?.unit || m?.unit || ""; render(); }
    });
    host?.addEventListener("submit",event => {
      if (event.target.id === "materialCancellationForm") {
        event.preventDefault(); captureCancellation();
        if (!R.materialPurchases.saveCancellation(materialId,purchaseId,cancellationDraft)) { purchaseError = R.materialPurchases.lastError; render(); return; }
        cancellationDraft = null; purchaseError = ""; finishEdit("purchase-detail",materialId,purchaseId); return;
      }
      if (event.target.id === "materialReceiptForm") {
        event.preventDefault(); captureReceipt();
        if (!R.materialPurchases.saveReceipt(materialId,purchaseId,receiptDraft)) { purchaseError = R.materialPurchases.lastError; render(); return; }
        receiptDraft = null; purchaseError = ""; finishEdit("purchase-detail",materialId,purchaseId); return;
      }
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
      let stocktakes;
      const initial = initialStockValues();
      if (!U.$("materialInitialStock").hidden && initial.quantity.trim() !== "") {
        try {
          const base = {...material(id),...record,materialId:id};
          stocktakes = [...(base.stocktakes || []),R.materialStock.prepareStocktake(base,{...initial,unit:record.unit})];
        } catch (error) { materialError = error.message; render(); return; }
      } else if (!U.$("materialInitialStock").hidden && initial.memo.trim()) {
        materialError = "在庫確認メモを残す場合は、確認した在庫数も入力してください。"; render(); return;
      }
      const saved = state.saveMaterial({...record,materialId:id,registrationNumber:record.registrationNumber.trim(),productUrl,...(stocktakes ? {stocktakes} : {})});
      if (!saved) { materialError = errorText("資材を保存できませんでした。入力は保持しています。"); render(); return; }
      const mid = id || state.data().materials.find(m => !before.has(m.materialId))?.materialId;
      clearFields(); if (mid) finishEdit("material-detail",mid); else render();
    });
  }
  R.screens = R.screens || {};
  R.screens.materials = {render,bind,resetForm,openPurchases,canHandleBack,handleBack};
})();
