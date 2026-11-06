(function () {
  "use strict";
  const R = window.RiceOS;
  const U = R.utils;
  const H = R.herbicide;
  const state = R.state;
  const esc = U.escapeHTML;
  const attr = U.attr;
  const statuses = ["経過観察中", "良好", "一部残草", "追加対応あり"];
  const option = (value, label, selected) => `<option value="${attr(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
  let view = "list";
  let selectedId = "";
  let draft = null;
  let originalDraft = "";
  let editorOrigin = "list";
  let assignmentOrigin = "list";
  let assignmentDraft = { year: U.today().slice(0, 4), programId: "", target: "" };
  let error = "";
  let bound = false;

  function notifyNavigation() { window.dispatchEvent(new CustomEvent("riceos:navigationchange")); }
  function changeView(next) {
    view = next;
    error = "";
    renderManagement(true);
    notifyNavigation();
    if (R.app && R.app.show) R.app.show("herbicide");
  }

  function programRows() {
    return H.programs().map(p => `<article class="herbicide-program-row"><button type="button" class="hm-program-open" data-h-detail="${attr(p.programId)}"><b>${esc(p.name)}</b><small>第${esc(p.revision)}版 / ${p.steps.length}処理 / 見直し目安 ${esc(p.reviewYears || 3)}年</small></button><div class="hm-row-actions"><button type="button" class="hm-text-button" data-h-edit="${attr(p.programId)}">編集</button><button type="button" class="hm-text-button hm-danger" data-h-delete-program="${attr(p.programId)}">削除</button></div></article>`).join("") || '<p class="empty">体系はまだ登録されていません。</p>';
  }

  function readProgramForm(form) {
    const id = form.dataset.programId || "";
    const old = draft && String(draft.programId || "") === id ? draft : H.programs().find(p => p.programId === id) || {};
    return { ...old, programId: id || undefined, name: form.elements.name.value, reviewYears: form.elements.reviewYears.value === "" ? "" : Number(form.elements.reviewYears.value), steps: Array.from(form.querySelectorAll("[data-h-step]")).map(el => ({ ...(old.steps || []).find(s => s.id === el.dataset.hStep), id: el.dataset.hStep, category: el.querySelector("[data-h-category]").value, materialId: el.querySelector("[data-h-material]").value, materialName: el.querySelector("[data-h-material-name]").value, plannedTiming: el.querySelector("[data-h-timing]").value, purpose: el.querySelector("[data-h-purpose]").value })) };
  }

  function programDetail(p) {
    const assignments = H.assignments().filter(a => a.programId === p.programId).sort((a, b) => Number(b.year) - Number(a.year));
    return `<section class="hm-detail" data-h-program-detail="${attr(p.programId)}"><div class="hm-detail-heading"><h2>${esc(p.name)}</h2><p>第${esc(p.revision)}版 / 見直し目安 ${esc(p.reviewYears || 3)}年</p></div>
      <ol class="herbicide-steps">${p.steps.map(s => `<li><b>${esc(s.category)} / ${esc(s.materialName || "資材未設定")}</b><dl><div><dt>予定の時期</dt><dd>${esc(s.plannedTiming || "未定")}</dd></div><div><dt>選択理由</dt><dd>${esc(s.purpose || "未登録")}</dd></div></dl></li>`).join("")}</ol>
      <div class="hm-actions"><button type="button" class="primary" data-h-edit="${attr(p.programId)}">編集</button><button type="button" class="secondary" data-h-assign="${attr(p.programId)}">年度・圃場へ割当</button><button type="button" class="hm-text-button hm-danger" data-h-delete-program="${attr(p.programId)}">削除</button></div>
      <section class="hm-assignment-history"><h3>年度割当の履歴</h3>${assignments.map(a => `<details><summary>${esc(a.year)}年 / ${esc(state.field(a.fieldId)?.name || "圃場未登録")}<small>${esc(a.name)} / 第${esc(a.revision)}版${a.active === false ? " / 変更前" : ""}</small></summary><ol>${(a.steps || []).map(s => `<li><b>${esc(s.category)} / ${esc(s.materialName || "当時の資材名は未保存")}</b><p>${esc(s.plannedTiming || "時期未定")}</p>${s.purpose ? `<p>${esc(s.purpose)}</p>` : ""}</li>`).join("")}</ol></details>`).join("") || '<p class="muted">年度割当はまだありません。</p>'}</section></section>`;
  }

  function assignmentView() {
    const programs = H.programs();
    const targets = [...state.fieldGroups().map(g => ({ value: `group:${g.fieldGroupId}`, label: `${g.name}グループ（${state.fieldsForGroup(g.fieldGroupId).length}圃場）` })), ...state.fields().map(f => ({ value: `field:${f.fieldId}`, label: f.name }))];
    return `<section class="hm-assignment-view"><h2>年度・圃場へ割当</h2><form id="herbicideAssignmentForm" class="stack-form"><label>対象年度<input name="year" type="number" min="1900" max="2200" step="1" required value="${attr(assignmentDraft.year)}"></label><label>除草体系<select name="programId" id="herbicideAssignProgram" required>${option("", "体系を選択", assignmentDraft.programId)}${programs.map(p => option(p.programId, `${p.name} / 第${p.revision}版`, assignmentDraft.programId)).join("")}</select></label><label>対象グループ・圃場<select name="target" id="herbicideAssignTarget" required>${option("", "対象を選択", assignmentDraft.target)}${targets.map(t => option(t.value, t.label, assignmentDraft.target)).join("")}</select></label><p class="hm-error" role="alert">${esc(error)}</p><div class="form-actions"><button type="submit" class="primary">この年度に割当</button><button type="button" class="secondary" data-h-cancel-assignment>取り消す</button></div></form></section>`;
  }

  function stepEditor(step, index) {
    const materials = state.data().materials.filter((m) => m.category === "除草剤" || m.materialId === step.materialId);
    const material = materials.find((m) => m.materialId === step.materialId);
    const materialName = material ? material.formalName || material.name : step.materialName || "";
    return `<fieldset class="herbicide-step-editor" data-h-step="${attr(step.id || U.id("herbicide-step", U.today()))}"><legend>処理 ${index + 1}</legend>
      <label>区分<input data-h-category list="herbicideCategories" value="${attr(step.category || "")}" required></label>
      <label>台帳から選択<select data-h-material>${option("", "自由入力・未定", step.materialId)}${step.materialId && !material ? option(step.materialId, "保存済みの資材（台帳なし）", step.materialId) : ""}${materials.map((m) => option(m.materialId, `${m.formalName || m.name} / ${m.season}`, step.materialId)).join("")}</select></label>
      <label>除草剤名<input data-h-material-name value="${attr(materialName)}"${step.materialId ? " readonly" : ""}></label>
      <label>予定の時期<input data-h-timing value="${attr(step.plannedTiming || "")}" placeholder="例: 田植え時、雑草の発生を見て"></label>
      <label>選択理由<input data-h-purpose list="herbicidePurposes" value="${attr(step.purpose || "")}"></label>
      <button type="button" class="secondary" data-h-remove-step>この処理を外す</button></fieldset>`;
  }

  function editProgram(id) {
    const existing = id !== "" ? H.programs().find((p) => p.programId === id) : null;
    if (id !== "" && !existing) { U.toast("体系が見つかりません。画面を開き直してください。"); return; }
    editorOrigin = existing ? "detail" : "list";
    selectedId = existing ? existing.programId : "";
    draft = U.clone(existing || { name: "", reviewYears: 3, steps: [{}] });
    draft.steps = draft.steps.map(s => ({ ...s, id: s.id || U.id("herbicide-step", U.today()) }));
    originalDraft = JSON.stringify(draft);
    changeView("editor");
  }

  function renderEditor() {
    const row = draft;
    U.$("herbicideProgramEditor").innerHTML = `<form class="stack-form" id="herbicideProgramForm" data-program-id="${attr(row.programId || "")}">
      <h2>${row.programId ? "体系を編集" : "体系を作成"}</h2>
      <label>体系名<input name="name" required value="${attr(row.name)}" placeholder="例: 残草対策体系A"></label>
      <label>見直しの目安（年）<input name="reviewYears" type="number" min="1" max="20" required value="${attr(row.reviewYears === undefined ? 3 : row.reviewYears)}"></label>
      <div id="herbicideStepEditors">${row.steps.map(stepEditor).join("")}</div>
      <button type="button" class="secondary" data-h-add-step>処理を追加</button>
      <p class="hm-error" role="alert">${esc(error)}</p><div class="form-actions"><button type="submit" class="primary">体系を保存</button><button type="button" class="secondary" data-h-cancel-program>取り消す</button></div></form>`;
  }

  function renderManagement(force = false) {
    const host = U.$("herbicideManagementContent");
    if (!host) return;
    if (!force && view === "editor" && U.$("herbicideProgramForm")?.dataset.programId === String(draft && draft.programId || "")) return;
    if (!force && view === "assignment" && U.$("herbicideAssignmentForm")) return;
    const selected = H.programs().find(p => p.programId === selectedId);
    if (view === "detail" && !selected) view = "list";
    const heading = `<header class="hm-header"><div><h1>除草体系</h1><p>体系・年度割当</p></div>${view !== "list" ? '<button type="button" class="hm-text-button" data-h-back>戻る</button>' : ""}</header>`;
    const body = view === "editor" ? '<div id="herbicideProgramEditor"></div>' : view === "detail" ? programDetail(selected) : view === "assignment" ? assignmentView() : `<div class="hm-actions"><button type="button" class="primary" data-h-new>体系を作成</button><button type="button" class="secondary" data-h-assign="">年度・圃場へ割当</button></div><p class="hm-error" role="alert">${esc(error)}</p><div id="herbicideProgramList"></div>`;
    host.innerHTML = `${heading}${body}<p class="hm-label-note">処理区分は使用許可の判定ではありません。使用時期・回数は製品ラベルで確認してください。</p>`;
    const list = U.$("herbicideProgramList");
    if (list) list.innerHTML = programRows();
    if (view === "editor") renderEditor();
  }

  function cancelProgram() {
    const editor = U.$("herbicideProgramEditor");
    if (editor) editor.replaceChildren();
    draft = null;
    changeView(editorOrigin === "detail" && H.programs().some(p => p.programId === selectedId) ? "detail" : "list");
  }
  function canHandleBack() { return view !== "list"; }
  function handleBack() {
    if (view === "list") return false;
    if (view === "editor") {
      const form = U.$("herbicideProgramForm");
      if (form && form.elements) draft = readProgramForm(form);
      if (JSON.stringify(draft) !== originalDraft && !confirm("入力中の変更を取り消して戻りますか？")) return true;
      cancelProgram();
    } else if (view === "assignment") changeView(assignmentOrigin === "detail" && H.programs().some(p => p.programId === selectedId) ? "detail" : "list");
    else changeView("list");
    return true;
  }

  function observationForm(assignment, observation) {
    const row = observation || {};
    const date = row.date || (String(assignment.year) === U.today().slice(0, 4) ? U.today() : `${assignment.year}-09-01`);
    return `<form class="stack-form herbicide-observation" data-h-observation="${attr(assignment.assignmentId)}" data-observation-id="${attr(row.observationId || "")}">
      <label>観察日<input name="date" type="date" value="${attr(date)}" required></label>
      <label>効き具合<select name="status">${statuses.map((s) => option(s, s, row.status || statuses[0])).join("")}</select></label>
      <label>残った雑草<input name="weeds" value="${attr(Array.isArray(row.weeds) ? row.weeds.join("・") : row.weeds || "")}"></label>
      <label>反省点・来年へのメモ<textarea name="memo">${esc(row.memo || "")}</textarea></label>
      <button type="submit" class="primary">${row.observationId ? "観察を更新" : "経過を保存"}</button>
      <button type="button" class="secondary" data-h-cancel-observation>取り消す</button></form>`;
  }

  function renderReview(field, year) {
    const selected = H.assignments(field ? field.fieldId : undefined, year === "all" ? undefined : year).sort((a, b) => b.year - a.year || String(b.createdAt).localeCompare(String(a.createdAt)));
    return `<details class="annual-used-materials herbicide-review"><summary>除草体系・効果の振り返り</summary>
      ${!selected.length ? '<p class="muted">この対象の体系は未設定です。過去の作業記録はそのまま残っています。</p>' : selected.map((a) => {
        const usage = H.usageForAssignment(a.assignmentId);
        const observations = H.observations(a.assignmentId);
        const previous = H.assignments(a.fieldId).filter((r) => r.active !== false && r.programId === a.programId && r.year <= a.year);
        let consecutive = 0;
        for (let y = Number(a.year); previous.some((r) => Number(r.year) === y); y--) consecutive++;
        return `<details class="herbicide-assignment" data-h-assignment="${attr(a.assignmentId)}"><summary><b>${esc(a.year)}年 ${esc(state.field(a.fieldId)?.name || "圃場未登録")}</b><span>${esc(a.name)}${a.active === false ? "（変更前の計画）" : ""}</span></summary>
          <p class="muted">同名体系の選択 ${consecutive}年連続 / 第${esc(a.revision)}版${consecutive >= (a.reviewYears || 3) ? " / 設定した見直し年数に到達" : ""}</p>
          <ol class="herbicide-steps">${usage.steps.map((step) => `<li><b>${esc(step.category)} / ${esc(step.materialName || (step.materialId ? "当時の資材名は未保存" : "資材未設定"))}</b><p>計画: ${esc(step.plannedTiming || "時期未定")}</p>${step.purpose ? `<p>選択理由: ${esc(step.purpose)}</p>` : ""}
            ${step.works.length ? step.works.map((work) => `<button type="button" class="annual-material-work" data-annual-record-open-kind="fieldWork" data-annual-record-open-id="${attr(work.workId)}" data-annual-record-open-label="${attr(work.workName)}" ${!field ? `data-annual-material-field="${attr(a.fieldId)}"` : ""}><b>実績 ${esc(U.fd(work.date))} / ${esc(work.material || "名称未入力")}</b><span>${esc(work.herbicidePurpose || "使用理由未記録")}</span><span>${esc(work.memo || "")}</span></button>`).join("") : '<p class="muted">紐付けた実績なし</p>'}</li>`).join("")}</ol>
          <h4>効果の経過</h4>${observations.length ? observations.map((o) => `<details class="herbicide-observation-row"><summary>${esc(U.fd(o.date))} ${esc(o.status)}</summary><p>${esc(Array.isArray(o.weeds) ? o.weeds.join("・") : o.weeds)}</p><p class="herbicide-note">${esc(o.memo)}</p><details><summary>観察を編集</summary>${observationForm(a, o)}</details><button type="button" class="secondary" data-h-delete-observation="${attr(o.observationId)}">観察を削除</button></details>`).join("") : '<p class="muted">効果の観察は未記録</p>'}
          <details><summary>経過・反省点を追加</summary>${observationForm(a)}</details></details>`;
      }).join("")}
      <button type="button" class="secondary" data-h-open-management>体系・年度設定を開く</button></details>`;
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("input", event => {
      const form = event.target.closest("form");
      if (!form) return;
      if (form.id === "herbicideProgramForm") draft = readProgramForm(form);
      if (form.id === "herbicideAssignmentForm") assignmentDraft = { year: form.elements.year.value, programId: form.elements.programId.value, target: form.elements.target.value };
    });
    document.addEventListener("change", (event) => {
      const select = event.target.closest("[data-h-material]");
      if (!select) return;
      const input = select.closest("[data-h-step]").querySelector("[data-h-material-name]");
      const material = state.data().materials.find((m) => m.materialId === select.value);
      input.readOnly = Boolean(select.value);
      if (material) input.value = material.formalName || material.name || "";
      const form = select.closest("form");
      if (form && form.id === "herbicideProgramForm") draft = readProgramForm(form);
    });
    document.addEventListener("click", (event) => {
      const el = event.target.closest("button");
      if (!el) return;
      if (el.hasAttribute("data-h-new")) editProgram("");
      if (el.hasAttribute("data-h-edit")) editProgram(el.dataset.hEdit);
      if (el.hasAttribute("data-h-detail")) {
        if (!H.programs().some(p => p.programId === el.dataset.hDetail)) return;
        selectedId = el.dataset.hDetail;
        changeView("detail");
      }
      if (el.hasAttribute("data-h-back")) handleBack();
      if (el.hasAttribute("data-h-assign")) {
        assignmentOrigin = view === "detail" ? "detail" : "list";
        assignmentDraft = { year: U.today().slice(0, 4), programId: el.dataset.hAssign || "", target: "" };
        changeView("assignment");
      }
      if (el.hasAttribute("data-h-cancel-assignment")) handleBack();
      if (el.hasAttribute("data-h-delete-program")) {
        if (!confirm("この除草体系を削除しますか？年度割当・履歴で使用中の体系は削除できません。")) return;
        if (H.deleteProgram(el.dataset.hDeleteProgram)) {
          const form = U.$("herbicideProgramForm");
          if (form && form.dataset.programId === el.dataset.hDeleteProgram) U.$("herbicideProgramEditor").replaceChildren();
          if (selectedId === el.dataset.hDeleteProgram) { selectedId = ""; draft = null; view = "list"; }
          error = ""; renderManagement(true); notifyNavigation();
        } else { error = "削除できませんでした。年度割当や履歴で使用中の体系は残します。"; if (view === "list") renderManagement(true); else U.toast(error); }
      }
      if (el.hasAttribute("data-h-delete-observation")) {
        if (!confirm("この観察記録を削除しますか？体系・年度割当・作業履歴は残ります。")) return;
        if (H.deleteObservation(el.dataset.hDeleteObservation)) {
          const row = el.closest(".herbicide-observation-row");
          if (row) row.remove();
        }
      }
      if (el.hasAttribute("data-h-cancel-program")) cancelProgram();
      if (el.hasAttribute("data-h-add-step")) {
        const form = U.$("herbicideProgramForm");
        draft = readProgramForm(form);
        draft.steps.push({ id: U.id("herbicide-step", U.today()) });
        renderManagement(true);
      }
      if (el.hasAttribute("data-h-remove-step")) {
        el.closest("[data-h-step]").remove();
        draft = readProgramForm(U.$("herbicideProgramForm"));
      }
      if (el.hasAttribute("data-h-cancel-observation")) { el.closest("form").reset(); el.closest("details").open = false; }
      if (el.hasAttribute("data-h-open-management")) R.app.show("herbicide");
    });
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (form.id === "herbicideProgramForm") {
        event.preventDefault();
        draft = readProgramForm(form);
        const saved = H.saveProgram(draft);
        if (saved) {
          const editor = U.$("herbicideProgramEditor");
          if (editor) editor.replaceChildren();
          selectedId = saved.programId; draft = null; changeView("detail");
        } else { error = "保存できませんでした。入力内容は保持しています。"; view = "editor"; renderManagement(true); notifyNavigation(); }
      }
      if (form.id === "herbicideAssignmentForm") {
        event.preventDefault();
        assignmentDraft = { year: form.elements.year.value, programId: form.elements.programId.value, target: form.elements.target.value };
        const [kind, id] = form.elements.target.value.split(":");
        const ids = kind === "group" ? state.fieldsForGroup(id).map((f) => f.fieldId) : [id];
        const year = form.elements.year.value;
        if (!/^[1-9]\d{3}$/.test(year) || Number(year) < 1900 || Number(year) > 2200 || !["field", "group"].includes(kind) || !id || !ids.length) { error = "年度・体系・対象圃場を確認してください。"; renderManagement(true); return; }
        if (ids.some((fieldId) => H.assignmentFor(fieldId, year)) && !confirm("この年度の体系を変更しますか？変更前の計画と実績も残ります。")) return;
        const saved = H.assignProgram({ year, programId: form.elements.programId.value, fieldIds: ids });
        if (saved) { selectedId = form.elements.programId.value; changeView("detail"); }
        else { error = "年度割当を保存できませんでした。入力内容は保持しています。"; renderManagement(true); }
      }
      if (form.hasAttribute("data-h-observation")) {
        event.preventDefault();
        const a = H.assignments().find((row) => row.assignmentId === form.dataset.hObservation);
        if (a) {
          const saved = H.saveObservation({ observationId: form.dataset.observationId || undefined, assignmentId: a.assignmentId, fieldId: a.fieldId, date: form.elements.date.value, status: form.elements.status.value, weeds: form.elements.weeds.value, memo: form.elements.memo.value });
          if (saved) {
            document.querySelectorAll(".herbicide-review").forEach((el) => { el.open = true; });
            document.querySelectorAll("[data-h-assignment]").forEach((el) => { if (el.dataset.hAssignment === a.assignmentId) el.open = true; });
          }
        }
      }
    });
  }
  R.herbicideUI = { renderManagement, renderReview };
  R.screens = R.screens || {};
  R.screens.herbicide = { render: renderManagement, bind, canHandleBack, handleBack, preserveOnDataChange: true };
  R.screens.herbicideSupport = { bind };
})();
