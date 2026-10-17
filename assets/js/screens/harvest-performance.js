(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils, state = R.state;
  let selectedYear = Number(U.today().slice(0,4));
  let bound = false;
  const drafts = new Map();
  const expanded = new Set();
  const errors = new Map();
  const draftBases = new Map();
  const dirtyDrafts = new Set();
  const openSections = new Set();
  const notices = new Map();
  const keyFor = varietyId => `${selectedYear}|${varietyId}`;
  const known = value => typeof value === "number" && Number.isFinite(value);
  const text = value => known(value) ? value.toLocaleString("ja-JP",{maximumFractionDigits:2}) : "未登録";
  const nameFor = id => state.variety(id)?.name || id || "品種未設定";
  function draftFor(row) {
    const key = keyFor(row.varietyId);
    const basis = JSON.stringify([row.quantityBasis,row.areaBasis || [row.areaMode,row.areaSource,row.areaA,row.areaSnapshot]]);
    if (!drafts.has(key) || !dirtyDrafts.has(key)) {
      const review = state.harvestYearReviewFor(selectedYear,row.varietyId);
      drafts.set(key,{ ...(review || {}),season:selectedYear,varietyId:row.varietyId,areaMode:review?.areaMode || "auto",areaA:review?.areaA ?? "",completed:row.status === "complete",memo:review?.memo || "",conditions:review?.conditions || "",plans:{continue:"",change:"",undecided:"",...review?.plans},evidenceRefs:U.clone(review?.evidenceRefs || []),followUpOutcome:review?.followUpOutcome || "",followUpMemo:review?.followUpMemo || "",targetBalesPer10a:review?.targetBalesPer10a || 10 });
    } else if (draftBases.get(key) !== basis) {
      drafts.get(key).completed = false;
    }
    draftBases.set(key,basis);
    return drafts.get(key);
  }
  function delta(value,unit) { return known(value) ? `${value > 0 ? "+" : ""}${text(value)}${unit}` : "比較対象なし"; }
  function goalFor(row) {
    if (!known(row.balesPer10a)) return '<p class="hp-reflection-note">面積と収量が揃うと目標比を表示します。</p>';
    const target = known(row.targetBalesPer10a) && row.targetBalesPer10a > 0 ? row.targetBalesPer10a : 10;
    const percent = row.balesPer10a / target * 100;
    const tier = percent > 100 ? "exceeded" : percent === 100 ? "achieved" : percent >= 80 ? "near" : "growing";
    return `<section class="hp-goal" data-tier="${tier}"><p>目標 ${text(target)}俵／10a${row.status === "complete" ? "" : "・暫定"}</p><div class="hp-goal-track"><div class="hp-goal-fill" style="width:${Math.max(0,Math.min(100,percent))}%"></div></div><p class="hp-goal-metric"><strong>${text(percent)}%</strong>${percent > 100 ? `・目標超過（目標＋${text(row.balesPer10a - target)}俵／10a）` : percent === 100 ? "・目標達成" : `・目標まであと${text(target - row.balesPer10a)}俵／10a`}</p><small>収量目標の達成率</small></section>`;
  }
  function trendFor(varietyId) {
    const rows = state.harvestPerformanceHistory(varietyId,selectedYear,5);
    const values = rows.map(row => row.balesPer10a).filter(value => known(value) && value > 0);
    const max = Math.max(1,...values);
    return `<section class="hp-trend" aria-label="5年の収量推移"><h4>5年の俵／10a</h4>${rows.map(row => {
      const hasValue = known(row.balesPer10a) && row.balesPer10a >= 0;
      const complete = row.completed && row.status === "complete";
      return `<button type="button" class="hp-trend-row" data-hp-trend-select="${U.attr(row.season)}" data-hp-trend-year="${U.attr(row.season)}" data-hp-trend-status="${U.attr(row.status)}" aria-label="${U.attr(row.season)}年産の成績とメモを表示"><span>${U.escapeHTML(row.season)}年産</span><span class="hp-trend-track">${hasValue ? `<span class="hp-trend-bar${complete ? "" : " hp-trend-partial"}" style="width:${Math.min(100,row.balesPer10a / max * 100)}%"></span>` : ""}</span><span>${hasValue ? `${text(row.balesPer10a)}俵${complete ? "" : "（途中）"}` : row.recordCount ? "面積・数量未確認" : "未登録"}</span></button>`;
    }).join("")}</section>`;
  }
  function evidenceFor(id) {
    return typeof state.harvestReviewEvidenceFor === "function" ? state.harvestReviewEvidenceFor(selectedYear,id) : [];
  }
  function sectionOpen(id,section) { return openSections.has(`${keyFor(id)}|${section}`) ? " open" : ""; }
  function areaFor(row) {
    const labels = {planting:"田植え実績の対象圃場",milling:"籾摺り実績の対象圃場","selected-fields":"選択圃場","saved-snapshot":"保存済み面積",manual:"手入力","current-fields-unconfirmed":"現圃場の候補（未確認）",missing:"面積未登録"};
    return `<details class="hp-facts"><summary>面積の出典：${U.escapeHTML(labels[row.areaSource] || "保存済み面積")}</summary><p>${known(row.areaA) ? `${text(row.areaA)}a` : "面積未確認"} / ${Number(row.areaFieldCount) || (row.fieldIds || []).length}圃場</p>${(row.areaSnapshot || []).map(field => `<p>${U.escapeHTML(field.name || field.fieldId)}：${known(field.areaA) ? `${text(field.areaA)}a` : "面積未登録"}</p>`).join("")}</details>`;
  }
  function historyFor(row) {
    const rows = evidenceFor(row.varietyId);
    const fields = [...new Set([...(row.fieldIds || []),...(row.areaSnapshot || []).map(item => item.fieldId),...rows.flatMap(item => item.fieldIds || [])])];
    return `<details class="hp-journey" data-hp-section="history" data-hp-section-variety="${U.attr(row.varietyId)}"${sectionOpen(row.varietyId,"history")}><summary>履歴・実績根拠</summary>${trendFor(row.varietyId)}<div class="hp-evidence-list">${rows.map((item,index) => `<div class="hp-evidence-item" data-hp-evidence-row="${U.attr(item.id)}"><b>${U.escapeHTML(item.date)} ${U.escapeHTML(item.label)}</b>${item.detail ? `<p>${U.escapeHTML(item.detail)}</p>` : ""}${(item.kind === "milling" && !(item.fieldIds || []).length || (item.fieldIds || []).some(id => state.field(id))) ? `<button type="button" class="secondary hp-source-button" data-hp-source-variety="${U.attr(row.varietyId)}" data-hp-source-index="${index}">実績詳細を見る</button>` : '<span class="hp-reflection-note">圃場紐付けなし・詳細遷移対象外</span>'}</div>`).join("") || '<p class="hp-reflection-note">この年産・品種に紐づく実績はまだありません。</p>'}</div><div class="hp-plan-grid">${fields.filter(id => state.field(id)).map(id => `<button type="button" class="secondary hp-source-button" data-hp-field="${U.attr(id)}">${U.escapeHTML(state.field(id).name)}の年間記録</button>`).join("") || '<p class="hp-reflection-note">原記録に対象圃場の登録がありません。</p>'}</div></details>`;
  }
  function referencesFor(row,draft) {
    const rows = evidenceFor(row.varietyId);
    const refs = draft.evidenceRefs || [];
    const missing = refs.filter(ref => !rows.some(item => item.kind === ref.kind && item.id === ref.id));
    return `<fieldset class="hp-evidence-list"><legend>評価の根拠に選ぶ実績</legend>${[...rows,...missing.map(ref => ({...ref,label:"参照先が見つからない記録",date:""}))].map(item => `<label class="hp-completed"><input type="checkbox" data-hp-ref-kind="${U.attr(item.kind)}" data-hp-ref-id="${U.attr(item.id)}"${refs.some(ref => ref.kind === item.kind && ref.id === item.id) ? " checked" : ""}><span>${U.escapeHTML(item.date)} ${U.escapeHTML(item.label)}</span></label>`).join("") || '<p class="hp-reflection-note">選択できる実績はありません。</p>'}</fieldset>`;
  }
  function plansFor(row,draft) {
    const categories = {continue:"続ける",change:"変える",undecided:"保留・未決定"};
    const previous = row.previousPlans;
    return `<details class="hp-journey" data-hp-section="plans" data-hp-section-variety="${U.attr(row.varietyId)}"${sectionOpen(row.varietyId,"plans")}><summary>来年方針</summary>${previous && Object.values(previous).some(Boolean) ? `<section class="hp-plan-item"><h4>${selectedYear - 1}年産で立てた方針</h4>${Object.entries(categories).map(([key,label]) => previous[key] ? `<p>${label}：${U.escapeHTML(previous[key])}</p>` : "").join("")}<label>今年の振り返り<select name="followUpOutcome"><option value="">未評価</option>${[["improved","改善した"],["same","変わらない"],["uncertain","判断できない"]].map(([value,label]) => `<option value="${value}"${draft.followUpOutcome === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><label>振り返りメモ<textarea name="followUpMemo">${U.escapeHTML(draft.followUpMemo)}</textarea></label><p class="hp-reflection-note">記録した結果の振り返りです。方針による因果関係は判断しません。</p></section>` : '<p class="hp-reflection-note">前年に保存した方針はありません。</p><input type="hidden" name="followUpOutcome" value=""><input type="hidden" name="followUpMemo" value="">'}<div class="hp-plan-grid">${Object.entries(categories).map(([key,label]) => `<div class="hp-plan-item"><label>${label}<textarea name="plan_${key}">${U.escapeHTML(draft.plans[key])}</textarea></label>${row.reviewId && row.plans?.[key] ? `<button type="button" class="secondary" data-hp-send-variety="${U.attr(row.varietyId)}" data-hp-send-category="${key}">${selectedYear + 1}年の来年メモへ送る</button>` : ""}</div>`).join("")}</div><p class="hp-reflection-note">方針は「保存」で確定します。来年メモへの送信は別操作です。</p><p role="status">${U.escapeHTML(notices.get(keyFor(row.varietyId)) || "")}</p></details>`;
  }
  function renderCard(row) {
    const key = keyFor(row.varietyId), draft = draftFor(row);
    const complete = row.completed && row.status === "complete";
    const compare = complete && row.previous?.completed && row.previous.status === "complete";
    return `<article class="hp-card" data-hp-variety="${U.attr(row.varietyId)}"><header><h3>${U.escapeHTML(nameFor(row.varietyId))}</h3><span class="hp-status" data-hp-status="${U.attr(row.status)}">${complete ? "集計完了" : row.status === "missing" ? "数量未登録・未確認" : "集計途中"}</span></header>
      <h4 class="hp-section-title">成果</h4><div class="hp-primary"><strong>${known(row.balesPer10a) ? text(row.balesPer10a) : known(row.areaA) ? "収量未確認" : "面積未確認"}</strong><span>俵／10a${complete ? "" : "（登録分）"}</span></div>
      ${goalFor(row)}
      ${!known(row.areaA) ? `<button type="button" class="secondary" data-hp-edit="${U.attr(row.varietyId)}">集計面積を登録</button>` : ""}
      <dl class="hp-metrics"><div><dt>${complete ? "収量" : "登録収量小計"}</dt><dd>${text(row.totalBales)}俵（60kg） / ${text(row.totalKg)}kg</dd></div><div><dt>年産・品種の集計面積</dt><dd>${known(row.areaA) ? `${text(row.areaA)}a` : "未登録"}</dd></div></dl>
      ${areaFor(row)}
      ${!known(row.totalKg) && known(row.knownKg) ? `<p class="hp-muted">数量確認済み分の小計：${text(row.knownKg)}kg（${text(row.knownKg / 60)}俵）。年産総量は未確定です。</p>` : ""}
      <p class="hp-muted">籾摺り記録 ${Number(row.recordCount) || 0}件${row.missingQuantityCount ? ` / 数量未確認 ${Number(row.missingQuantityCount)}件` : ""}</p>
      <section class="hp-delta"><h4>前年との差</h4><p>俵／10a：${compare && known(row.areaA) && row.areaA > 0 && known(row.previous.areaA) && row.previous.areaA > 0 ? delta(row.deltaBalesPer10a,"俵／10a") : "比較対象なし"}</p><p>総収量：${compare ? delta(row.deltaTotalBales,"俵") : "比較対象なし"}</p><p>面積：${compare ? delta(row.deltaAreaA,"a") : "比較対象なし"}</p></section>
      ${historyFor(row)}${row.memo ? `<p class="hp-memo">${U.escapeHTML(row.memo)}</p>` : ""}
      <button type="button" class="secondary" data-hp-quantity="${U.attr(row.varietyId)}">籾摺り収量を記録</button>
      <form data-hp-form="${U.attr(row.varietyId)}"><details class="hp-review" data-hp-review="${U.attr(row.varietyId)}"${expanded.has(key) ? " open" : ""}><summary>評価・集計確認</summary><p>${selectedYear}年産 / ${U.escapeHTML(nameFor(row.varietyId))}</p><details class="hp-facts" data-hp-manual-area${draft.areaMode === "manual" || !known(row.areaA) ? " open" : ""}><summary>面積を手入力で変更</summary><label>面積方式<select name="areaMode"><option value="auto"${draft.areaMode === "auto" ? " selected" : ""}>実績の対象圃場から自動集計</option><option value="manual"${draft.areaMode === "manual" ? " selected" : ""}>手入力</option></select></label><label>集計面積（a・任意）<input name="areaA" type="number" min="0" step="any" value="${U.attr(draft.areaA)}"></label></details><label class="hp-completed"><input name="completed" type="checkbox"${draft.completed ? " checked" : ""}>この年産・品種の集計を完了</label><label>評価・メモ<textarea name="memo">${U.escapeHTML(draft.memo)}</textarea></label><label>今年の条件・気づき<textarea name="conditions">${U.escapeHTML(draft.conditions)}</textarea></label>${referencesFor(row,draft)}</details>${plansFor(row,draft)}<p class="hp-error" role="alert">${U.escapeHTML(errors.get(key) || "")}</p><div class="hp-editor-actions"><button type="button" class="secondary" data-hp-cancel="${U.attr(row.varietyId)}">編集を取消</button><button type="submit" class="primary">保存</button>${row.reviewId ? `<button type="button" class="danger" data-hp-delete="${U.attr(row.varietyId)}">面積・完了確認・メモを削除</button>` : ""}</div></form></article>`;
  }
  function render() {
    const root = U.$("harvestPerformanceContent");
    if (!root) return;
    const available = typeof state.harvestPerformanceFor === "function";
    const rows = available ? state.harvestPerformanceFor(selectedYear) : [];
    const currentYear = Number(U.today().slice(0,4));
    const years = [...new Set([selectedYear,...Array.from({length:5},(_,i) => currentYear-i),...(state.millingRecordsFor ? state.millingRecordsFor({}) : []).map(row => Number(row.season)),...(state.data().harvestYearReviews || []).map(row => Number(row.season))])].filter(year => Number.isInteger(year) && year >= 1900 && year <= 2200).sort((a,b) => b-a);
    root.innerHTML = `<div class="screen-head"><h2>年産別の収穫成績</h2></div><div class="hp-toolbar"><label>年産<select id="hpYear">${years.map(year => `<option value="${year}"${year === selectedYear ? " selected" : ""}>${year}年産</option>`).join("")}</select></label><label>収量を追加する品種<select id="hpAddVariety">${state.varieties().map(row => `<option value="${U.attr(row.varietyId)}">${U.escapeHTML(row.name)}</option>`).join("")}</select></label><button type="button" class="secondary" data-hp-quantity=""${state.varieties().length ? "" : " disabled"}>籾摺り収量を追加</button></div><p class="hp-muted">籾摺り後の登録収量。従来の品種別集計は加算しません。面積はこの年産・品種の保存値です。</p>${rows.map(renderCard).join("") || `<p class="hp-empty">${available ? "この年産の収穫成績はまだ登録されていません。" : "収穫成績を読み込めませんでした。"}</p>`}`;
  }
  function open(year) {
    const value = Number(year);
    if (Number.isInteger(value) && value >= 1900 && value <= 2200) selectedYear = value;
    render();
  }
  function capture(form, completionTouched) {
    const id = form.dataset.hpForm, key = keyFor(id), before = draftBases.get(key);
    const row = state.harvestPerformanceFor(selectedYear).find(item => item.varietyId === id);
    if (!row) return;
    const draft = draftFor(row), checkbox = form.elements.namedItem("completed");
    if (completionTouched && before === draftBases.get(key)) draft.completed = checkbox.checked;
    checkbox.checked = draft.completed;
    Object.assign(draft,{areaA:form.elements.namedItem("areaA").value,areaMode:form.elements.namedItem("areaMode").value,memo:form.elements.namedItem("memo").value,conditions:form.elements.namedItem("conditions").value,plans:Object.fromEntries(["continue","change","undecided"].map(category => [category,form.elements.namedItem(`plan_${category}`).value])),followUpOutcome:form.elements.namedItem("followUpOutcome").value,followUpMemo:form.elements.namedItem("followUpMemo").value,evidenceRefs:[...form.querySelectorAll("[data-hp-ref-id]:checked")].map(input => ({kind:input.dataset.hpRefKind,id:input.dataset.hpRefId}))});
    dirtyDrafts.add(key);
  }
  function bind() {
    const root = U.$("harvestPerformanceContent");
    if (!root || bound) return;
    bound = true;
    root.addEventListener("input",event => { const form = event.target.closest("[data-hp-form]"); if (form) { if (event.target.name === "areaA") form.elements.namedItem("areaMode").value = "manual"; capture(form,event.target.name === "completed"); } });
    root.addEventListener("change",event => {
      if (event.target.id === "hpYear") { selectedYear = Number(event.target.value); render(); return; }
      const form = event.target.closest("[data-hp-form]"); if (form) capture(form,event.target.name === "completed");
    });
    root.addEventListener("toggle",event => {
      if (event.target.matches("[data-hp-review]")) {
        const key = keyFor(event.target.dataset.hpReview);
        if (event.target.open) expanded.add(key); else expanded.delete(key);
      }
      if (event.target.matches("[data-hp-section]")) {
        const key = `${keyFor(event.target.dataset.hpSectionVariety)}|${event.target.dataset.hpSection}`;
        if (event.target.open) openSections.add(key); else openSections.delete(key);
      }
    },true);
    root.addEventListener("click",event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-hp-trend-select")) { selectedYear = Number(button.dataset.hpTrendSelect); render(); return; }
      if (button.hasAttribute("data-hp-source-index")) {
        const item = evidenceFor(button.dataset.hpSourceVariety)[Number(button.dataset.hpSourceIndex)];
        const fieldId = item?.fieldIds?.find(id => state.field(id));
        if (item && R.screens.annual.openPerformanceEvidence(item.kind,item.id,fieldId || "",selectedYear)) R.app.openInput("annual","harvest-performance",{nested:true});
        return;
      }
      if (button.hasAttribute("data-hp-field")) {
        if (R.navigation?.openField) R.navigation.openField(button.dataset.hpField,{originScreen:"harvest-performance",destination:"annual-history",season:selectedYear,tab:"karte",returnAnnualYear:U.$("annualYear")?.value});
        return;
      }
      if (button.hasAttribute("data-hp-send-category")) {
        const id = button.dataset.hpSendVariety, key = keyFor(id), category = button.dataset.hpSendCategory;
        const review = state.harvestYearReviewFor(selectedYear,id);
        if (dirtyDrafts.has(key)) { errors.set(key,"編集中の評価・方針を先に保存してください。"); render(); return; }
        if (!review?.plans?.[category] || !confirm(`${selectedYear + 1}年の来年メモへこの方針を送りますか？`)) return;
        let saved = null;
        try { saved = state.saveHarvestNextSeasonIdea({reviewId:review.reviewId,category,text:review.plans[category],reason:review.memo,evidenceRefs:review.evidenceRefs || []}); } catch (_) { /* Keep the saved review on failure. */ }
        if (saved) { notices.set(key,"来年メモへ送りました。同じ区分の再送は同じメモを更新します。"); errors.delete(key); }
        else errors.set(key,"来年メモへ送信できませんでした。保存内容を確認してください。");
        render(); return;
      }
      if (button.hasAttribute("data-hp-quantity")) {
        if (R.screens.results?.openMillingForYear(selectedYear,button.dataset.hpQuantity || U.$("hpAddVariety").value)) R.app.openInput("results","harvest-performance",{nested:true});
        return;
      }
      if (button.hasAttribute("data-hp-cancel")) {
        const key = keyFor(button.dataset.hpCancel); drafts.delete(key); dirtyDrafts.delete(key); errors.delete(key); expanded.delete(key); render();
      }
      if (button.hasAttribute("data-hp-edit")) {
        expanded.add(keyFor(button.dataset.hpEdit)); render();
        [...root.querySelectorAll("[data-hp-review]")].find(el => el.dataset.hpReview === button.dataset.hpEdit)?.scrollIntoView({block:"center",behavior:"smooth"});
      }
      if (button.hasAttribute("data-hp-delete")) {
        const id = button.dataset.hpDelete, key = keyFor(id), review = state.harvestYearReviewFor(selectedYear,id);
        if (!review || !confirm("この年産・品種の面積・完了確認・メモを削除しますか？籾摺り収量は削除しません。")) return;
        let saved = null;
        try { saved = state.deleteHarvestYearReview(review.reviewId); } catch (_) { /* Keep the editor on failure. */ }
        if (!saved) { errors.set(key,"削除できませんでした。記録は変更していません。"); expanded.add(key); render(); return; }
        drafts.delete(key); dirtyDrafts.delete(key); errors.delete(key); expanded.delete(key); render();
      }
    });
    root.addEventListener("submit",event => {
      const form = event.target.closest("[data-hp-form]"); if (!form) return;
      event.preventDefault(); capture(form);
      const key = keyFor(form.dataset.hpForm), draft = drafts.get(key);
      let saved = null;
      try { saved = state.saveHarvestYearReview({...draft}); } catch (_) { /* Keep the draft on storage failure. */ }
      if (!saved) { errors.set(key,"保存できませんでした。面積・入力内容と保存状態を確認してください。"); expanded.add(key); render(); return; }
      drafts.delete(key); dirtyDrafts.delete(key); errors.delete(key); expanded.delete(key); render();
    });
  }
  R.screens = R.screens || {};
  R.screens.harvestPerformance = {render,bind,open,preserveOnDataChange:true};
})();
