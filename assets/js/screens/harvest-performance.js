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
  const keyFor = varietyId => `${selectedYear}|${varietyId}`;
  const known = value => typeof value === "number" && Number.isFinite(value);
  const text = value => known(value) ? value.toLocaleString("ja-JP",{maximumFractionDigits:2}) : "未登録";
  const nameFor = id => state.variety(id)?.name || id || "品種未設定";
  function draftFor(row) {
    const key = keyFor(row.varietyId);
    const basis = row.quantityBasis;
    if (!drafts.has(key) || !dirtyDrafts.has(key)) {
      const review = state.harvestYearReviewFor(selectedYear,row.varietyId);
      drafts.set(key,{ ...(review || {}),season:selectedYear,varietyId:row.varietyId,areaA:review?.areaA ?? "",completed:row.status === "complete",memo:review?.memo || "" });
    } else if (draftBases.get(key) !== basis) {
      drafts.get(key).completed = false;
    }
    draftBases.set(key,basis);
    return drafts.get(key);
  }
  function delta(value,unit) { return known(value) ? `${value > 0 ? "+" : ""}${text(value)}${unit}` : "比較対象なし"; }
  function trendFor(varietyId) {
    const rows = state.harvestPerformanceHistory(varietyId,selectedYear,5);
    const values = rows.map(row => row.balesPer10a).filter(value => known(value) && value > 0);
    const max = Math.max(1,...values);
    return `<section class="hp-trend" aria-label="5年の収量推移"><h4>5年の俵／10a</h4>${rows.map(row => {
      const hasValue = known(row.balesPer10a) && row.balesPer10a >= 0;
      const complete = row.completed && row.status === "complete";
      return `<div class="hp-trend-row" data-hp-trend-year="${U.attr(row.season)}" data-hp-trend-status="${U.attr(row.status)}"><span>${U.escapeHTML(row.season)}年産</span><div class="hp-trend-track">${hasValue ? `<div class="hp-trend-bar${complete ? "" : " hp-trend-partial"}" style="width:${Math.min(100,row.balesPer10a / max * 100)}%"></div>` : ""}</div><span>${hasValue ? `${text(row.balesPer10a)}俵${complete ? "" : "（途中）"}` : row.recordCount ? "面積・数量未確認" : "未登録"}</span></div>`;
    }).join("")}</section>`;
  }
  function renderCard(row) {
    const key = keyFor(row.varietyId), draft = draftFor(row);
    const complete = row.completed && row.status === "complete";
    const compare = complete && row.previous?.completed && row.previous.status === "complete";
    return `<article class="hp-card" data-hp-variety="${U.attr(row.varietyId)}"><header><h3>${U.escapeHTML(nameFor(row.varietyId))}</h3><span class="hp-status" data-hp-status="${U.attr(row.status)}">${complete ? "集計完了" : row.status === "missing" ? "数量未登録・未確認" : "集計途中"}</span></header>
      <div class="hp-primary"><strong>${known(row.balesPer10a) ? text(row.balesPer10a) : known(row.areaA) ? "収量未確認" : "面積未確認"}</strong><span>俵／10a${complete ? "" : "（登録分）"}</span></div>
      ${!known(row.areaA) ? `<button type="button" class="secondary" data-hp-edit="${U.attr(row.varietyId)}">集計面積を登録</button>` : ""}
      <dl class="hp-metrics"><div><dt>${complete ? "収量" : "登録収量小計"}</dt><dd>${text(row.totalBales)}俵（60kg） / ${text(row.totalKg)}kg</dd></div><div><dt>年産・品種の集計面積</dt><dd>${known(row.areaA) ? `${text(row.areaA)}a` : "未登録"}</dd></div></dl>
      ${!known(row.totalKg) && known(row.knownKg) ? `<p class="hp-muted">数量確認済み分の小計：${text(row.knownKg)}kg（${text(row.knownKg / 60)}俵）。年産総量は未確定です。</p>` : ""}
      <p class="hp-muted">籾摺り記録 ${Number(row.recordCount) || 0}件${row.missingQuantityCount ? ` / 数量未確認 ${Number(row.missingQuantityCount)}件` : ""}</p>
      <section class="hp-delta"><h4>前年との差</h4><p>俵／10a：${compare && known(row.areaA) && row.areaA > 0 && known(row.previous.areaA) && row.previous.areaA > 0 ? delta(row.deltaBalesPer10a,"俵／10a") : "比較対象なし"}</p><p>総収量：${compare ? delta(row.deltaTotalBales,"俵") : "比較対象なし"}</p><p>面積：${compare ? delta(row.deltaAreaA,"a") : "比較対象なし"}</p></section>
      ${trendFor(row.varietyId)}${row.memo ? `<p class="hp-memo">${U.escapeHTML(row.memo)}</p>` : ""}
      <button type="button" class="secondary" data-hp-quantity="${U.attr(row.varietyId)}">籾摺り収量を記録</button>
      <details class="hp-review" data-hp-review="${U.attr(row.varietyId)}"${expanded.has(key) ? " open" : ""}><summary>面積・集計完了・メモを編集</summary><form data-hp-form="${U.attr(row.varietyId)}"><p>${selectedYear}年産 / ${U.escapeHTML(nameFor(row.varietyId))}</p><label>集計面積（a・任意）<input name="areaA" type="number" min="0" step="any" value="${U.attr(draft.areaA)}"></label><label class="hp-completed"><input name="completed" type="checkbox"${draft.completed ? " checked" : ""}>この年産・品種の集計を完了</label><label>メモ<textarea name="memo">${U.escapeHTML(draft.memo)}</textarea></label><p class="hp-error" role="alert">${U.escapeHTML(errors.get(key) || "")}</p><div class="hp-editor-actions"><button type="button" class="secondary" data-hp-cancel="${U.attr(row.varietyId)}">編集を取消</button><button type="submit" class="primary">保存</button>${row.reviewId ? `<button type="button" class="danger" data-hp-delete="${U.attr(row.varietyId)}">面積・完了確認・メモを削除</button>` : ""}</div></form></details></article>`;
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
    Object.assign(draft,{areaA:form.elements.namedItem("areaA").value,memo:form.elements.namedItem("memo").value});
    dirtyDrafts.add(key);
  }
  function bind() {
    const root = U.$("harvestPerformanceContent");
    if (!root || bound) return;
    bound = true;
    root.addEventListener("input",event => { const form = event.target.closest("[data-hp-form]"); if (form) capture(form,event.target.name === "completed"); });
    root.addEventListener("change",event => {
      if (event.target.id === "hpYear") { selectedYear = Number(event.target.value); render(); return; }
      const form = event.target.closest("[data-hp-form]"); if (form) capture(form,event.target.name === "completed");
    });
    root.addEventListener("toggle",event => {
      if (event.target.matches("[data-hp-review]")) {
        const key = keyFor(event.target.dataset.hpReview);
        if (event.target.open) expanded.add(key); else expanded.delete(key);
      }
    },true);
    root.addEventListener("click",event => {
      const button = event.target.closest("button"); if (!button) return;
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
      try { saved = state.saveHarvestYearReview({...draft,fieldIds:[]}); } catch (_) { /* Keep the draft on storage failure. */ }
      if (!saved) { errors.set(key,"保存できませんでした。面積・入力内容と保存状態を確認してください。"); expanded.add(key); render(); return; }
      drafts.delete(key); dirtyDrafts.delete(key); errors.delete(key); expanded.delete(key); render();
    });
  }
  R.screens = R.screens || {};
  R.screens.harvestPerformance = {render,bind,open,preserveOnDataChange:true};
})();
