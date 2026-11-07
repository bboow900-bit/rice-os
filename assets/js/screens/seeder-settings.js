(function () {
  "use strict";
  const R = window.RiceOS;
  const U = R.utils;
  const S = R.seederSettings;
  const state = R.state;
  const esc = U.escapeHTML;
  const attr = U.attr;
  let view = "list", selectedId = "", yearFilter = "all", draft = null, baseline = "", editorOrigin = "list", error = "", bound = false;
  const label = (rows, value) => rows.find(row => row.value === value)?.label || value || "未登録";
  const present = value => value !== "" && value !== null && value !== undefined;
  const valueText = (value, unit = "") => present(value) ? `${String(value)}${unit ? ` ${unit}` : ""}` : "未登録";
  const option = (value, text, selected) => `<option value="${attr(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(text)}</option>`;
  function profiles() { return S.profilesFor({}); }
  function notify() { window.dispatchEvent(new CustomEvent("riceos:navigationchange")); }
  function move(next) { view = next; error = ""; render(true); notify(); if (R.app && R.app.show) R.app.show("seeder-settings"); }
  function defaultYear() { return String(state.defaultCropYear ? state.defaultCropYear(U.today()) : U.today().slice(0, 4)); }
  function refOptions(collection, key, selected, empty) {
    const values = [option("", empty, selected), ...collection.map(row => option(row[key], `${row.formalName || row.name}${row.season ? ` / ${row.season}` : ""}`, selected))];
    if (selected && !collection.some(row => row[key] === selected)) values.push(option(selected, "保存済みの参照（台帳なし）", selected));
    return values.join("");
  }
  function newDraft(preset) {
    const row = { cropYear: defaultYear(), name: "", model: "", method: preset === "dense" ? "dense" : "conventional", medium: preset === "mat" ? "mat" : "soil", materialId: "", matMaterialId: "", varietyId: "", intent: "", memo: "" };
    S.fields.forEach(field => { row[field.key] = ""; });
    return row;
  }
  function openEditor(id, copy = false) {
    const source = profiles().find(row => row.profileId === id);
    if (!source) { U.toast("設定が見つかりません。"); return; }
    editorOrigin = "detail"; selectedId = source.profileId;
    draft = U.clone(source);
    if (copy) { delete draft.profileId; delete draft.createdAt; delete draft.updatedAt; draft.copiedFromProfileId = source.profileId; draft.cropYear = Number(source.cropYear) < 2200 ? String(Number(source.cropYear) + 1) : ""; }
    draft.cropYear = String(draft.cropYear ?? "");
    S.fields.forEach(field => { draft[field.key] = present(draft[field.key]) ? String(draft[field.key]) : ""; });
    baseline = JSON.stringify(draft);
    move("editor");
  }
  function readForm(form) {
    const next = { ...draft };
    for (const key of ["cropYear", "name", "model", "method", "medium", "varietyId", "materialId", "matMaterialId", "intent", "memo", ...S.fields.map(field => field.key)]) next[key] = form.elements.namedItem(key).value;
    draft = next;
  }
  function fieldInput(field) {
    return `<label>${esc(field.label)}${field.unit ? `（${esc(field.unit)}）` : ""}<input name="${attr(field.key)}" type="${field.type === "number" ? "number" : "text"}"${field.type === "number" ? ` min="0" step="${field.integer ? "1" : "any"}"` : ""} value="${attr(draft[field.key] ?? "")}"></label>`;
  }
  function modeInput(name, legend, rows) {
    return `<fieldset class="ss-mode"><legend>${esc(legend)}</legend><div>${rows.map(row => `<label><input type="radio" name="${name}" value="${attr(row.value)}"${draft[name] === row.value ? " checked" : ""} required><span>${esc(row.label)}</span></label>`).join("")}</div></fieldset>`;
  }
  function editor() {
    return `<section class="ss-editor"><h2>${draft.profileId ? "播種機設定を編集" : draft.copiedFromProfileId ? "年度を変えて複製" : "播種機設定を作成"}</h2><form id="seederProfileForm" class="stack-form">
      <div class="ss-form-grid"><label>作付年度<input name="cropYear" type="number" min="1900" max="2200" step="1" required value="${attr(draft.cropYear)}"></label><label>機械名・設定名<input name="name" required value="${attr(draft.name)}"></label><label>型式<input name="model" value="${attr(draft.model || "")}"></label><label>品種（任意）<select name="varietyId">${refOptions(state.data().varieties, "varietyId", draft.varietyId, "指定なし")}</select></label></div>
      ${modeInput("method", "播種方法", S.methods)}${modeInput("medium", "育苗床", S.media)}
      <section class="ss-input-section"><h3>播種量・厚さ</h3><div class="ss-form-grid">${S.fields.filter(field => !field.optional && field.type === "number").map(fieldInput).join("")}</div></section>
      <section class="ss-input-section"><h3>機械の調整</h3><div class="ss-form-grid">${S.fields.filter(field => !field.optional && field.type === "text").map(fieldInput).join("")}</div></section>
      <details class="ss-extra"><summary>資材・育苗箱・量り取り（任意）</summary><div class="ss-form-grid"><label>培土資材<select name="materialId">${refOptions(state.data().materials, "materialId", draft.materialId, "指定なし")}</select></label><label>マット資材<select name="matMaterialId">${refOptions(state.data().materials, "materialId", draft.matMaterialId, "指定なし")}</select></label>${S.fields.filter(field => field.optional).map(fieldInput).join("")}</div></details>
      <label>設定の意図<textarea name="intent">${esc(draft.intent || "")}</textarea></label><label>メモ<textarea name="memo">${esc(draft.memo || "")}</textarea></label><p class="ss-error" role="alert">${esc(error)}</p><div class="form-actions"><button type="submit" class="primary">${draft.profileId ? "変更を保存" : "設定を保存"}</button><button type="button" class="secondary" data-ss-cancel>取り消す</button></div></form></section>`;
  }
  function detail(row) {
    const refs = [["品種", state.data().varieties.find(r => r.varietyId === row.varietyId)?.name || (row.varietyId ? "保存済みの品種（台帳なし）" : "指定なし")], ["培土資材", state.data().materials.find(r => r.materialId === row.materialId)?.name || (row.materialId ? "保存済みの資材（台帳なし）" : "指定なし")], ["マット資材", state.data().materials.find(r => r.materialId === row.matMaterialId)?.name || (row.matMaterialId ? "保存済みの資材（台帳なし）" : "指定なし")]];
    return `<section class="ss-detail" data-ss-detail-id="${attr(row.profileId)}"><div class="ss-detail-title"><p>${esc(row.cropYear)}年度 / ${esc(label(S.methods, row.method))}・${esc(label(S.media, row.medium))}</p><h2>${esc(row.name)}</h2><p>${esc(row.model || "型式未登録")}</p></div><dl>${S.fields.map(field => `<div><dt>${esc(field.label)}</dt><dd>${esc(valueText(row[field.key], field.unit))}</dd></div>`).join("")}${refs.map(([name, value]) => `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl><section class="ss-note"><h3>設定の意図</h3><p>${esc(row.intent || "未登録")}</p><h3>メモ</h3><p>${esc(row.memo || "未登録")}</p></section><div class="ss-actions"><button type="button" class="primary" data-ss-edit="${attr(row.profileId)}">編集</button><button type="button" class="secondary" data-ss-copy="${attr(row.profileId)}">年度を変えて複製</button><button type="button" class="ss-text-button ss-danger" data-ss-delete="${attr(row.profileId)}">削除</button></div><p class="ss-error" role="alert">${esc(error)}</p></section>`;
  }
  function list(rows) {
    const years = Array.from(new Set([defaultYear(), ...rows.map(row => String(row.cropYear))])).sort((a, b) => Number(b) - Number(a));
    const filtered = rows.filter(row => yearFilter === "all" || String(row.cropYear) === yearFilter).sort((a, b) => Number(b.cropYear) - Number(a.cropYear) || a.name.localeCompare(b.name, "ja"));
    return `<div class="ss-presets"><button type="button" class="secondary" data-ss-new="conventional">慣行で作成</button><button type="button" class="secondary" data-ss-new="dense">密苗で作成</button><button type="button" class="secondary" data-ss-new="mat">マットで作成</button></div><label class="ss-year-filter">作付年度<select data-ss-year-filter>${option("all", "すべての年度", yearFilter)}${years.map(year => option(year, `${year}年度`, yearFilter)).join("")}</select></label><p class="ss-error" role="alert">${esc(error)}</p><div class="ss-list">${filtered.map(row => `<button type="button" class="ss-list-row" data-ss-open="${attr(row.profileId)}"><span><small>${esc(row.cropYear)}年度 / ${esc(row.model || "型式未登録")}</small><b>${esc(row.name)}</b><span class="ss-tags"><span>${esc(label(S.methods, row.method))}</span><span>${esc(label(S.media, row.medium))}</span></span></span><span class="ss-row-quantity">${esc(valueText(row.germinatedSeedGPerTray, "g/箱"))}<i aria-hidden="true">›</i></span></button>`).join("") || '<p class="empty">この年度の播種機設定はありません。</p>'}</div>`;
  }
  function render(force = false) {
    const root = U.$("seederSettingsRoot"); if (!root) return;
    if (!force && view === "editor" && root.querySelector("#seederProfileForm")) return;
    try {
      const rows = profiles(), selected = rows.find(row => row.profileId === selectedId);
      if (view === "detail" && !selected) view = "list";
      root.innerHTML = `<header class="ss-header"><div><img src="assets/images/light-icons/seedling-tray.png" alt="" aria-hidden="true"><h1>播種機設定</h1></div>${view !== "list" ? '<button type="button" class="ss-text-button" data-ss-back>戻る</button>' : ""}</header>${view === "editor" ? editor() : view === "detail" ? detail(selected) : list(rows)}`;
    } catch (failure) { root.innerHTML = `<header class="ss-header"><h1>播種機設定</h1></header><p class="ss-error" role="alert">${esc(failure.message)}</p>`; }
  }
  function cancel() { draft = null; move(editorOrigin === "detail" && profiles().some(row => row.profileId === selectedId) ? "detail" : "list"); }
  function canHandleBack() { return view !== "list"; }
  function handleBack() {
    if (view === "list") return false;
    if (view === "editor") {
      const form = U.$("seederProfileForm"); if (form) readForm(form);
      if (JSON.stringify(draft) !== baseline && !confirm("入力中の変更を取り消して戻りますか？")) return true;
      cancel();
    } else move("list");
    return true;
  }
  function bind() {
    const root = U.$("seederSettingsRoot"); if (!root || bound) return; bound = true;
    root.addEventListener("input", event => { if (event.target.closest("#seederProfileForm")) readForm(U.$("seederProfileForm")); });
    root.addEventListener("change", event => {
      if (event.target.hasAttribute("data-ss-year-filter")) { yearFilter = event.target.value; render(); }
      else if (event.target.closest("#seederProfileForm")) readForm(U.$("seederProfileForm"));
    });
    root.addEventListener("click", event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-ss-new")) { draft = newDraft(button.dataset.ssNew); baseline = JSON.stringify(draft); editorOrigin = "list"; selectedId = ""; move("editor"); }
      if (button.hasAttribute("data-ss-open")) { selectedId = button.dataset.ssOpen; move("detail"); }
      if (button.hasAttribute("data-ss-edit")) openEditor(button.dataset.ssEdit);
      if (button.hasAttribute("data-ss-copy")) openEditor(button.dataset.ssCopy, true);
      if (button.hasAttribute("data-ss-cancel")) cancel();
      if (button.hasAttribute("data-ss-back")) handleBack();
      if (button.hasAttribute("data-ss-delete")) {
        if (!confirm("この播種機設定を削除しますか？履歴で参照されている設定は削除できません。")) return;
        if (!S.deleteProfile(button.dataset.ssDelete)) { error = S.lastError(); render(true); return; }
        selectedId = ""; move("list");
      }
    });
    root.addEventListener("submit", event => {
      if (event.target.id !== "seederProfileForm") return;
      event.preventDefault(); readForm(event.target);
      const saved = S.saveProfile(draft);
      if (!saved) { error = S.lastError(); render(true); return; }
      selectedId = saved.profileId; draft = null; move("detail");
    });
  }
  R.screens = R.screens || {};
  R.screens.seederSettings = { render, bind, canHandleBack, handleBack, preserveOnDataChange: true };
})();
