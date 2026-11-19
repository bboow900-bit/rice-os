(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils;
  const text = value => typeof value === "string" ? value : "";
  const array = value => Array.isArray(value) ? value : [];
  const esc = value => U.escapeHTML(String(value ?? ""));
  const attr = value => U.attr(String(value ?? ""));
  const art = "assets/images/material-review/materials-rice.png";
  const resultArt = "assets/images/material-review/rice-weeds.png";
  const statuses = ["経過観察中", "良好", "一部残草", "追加対応あり"];
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function actualWork(work, fieldId) {
    return work && R.state.isActualFieldWork(work) && array(work.fieldIds).includes(fieldId)
      && validDate(work.date) && work.date <= U.today();
  }
  function workDTO(work) {
    return { workId: text(work.workId), date: text(work.date), title: text(work.workName), materialName: text(work.material), year: String(R.state.cropYearForRecord(work)) };
  }
  function programDTO(assignment, fieldId) {
    const usage = R.herbicide.usageForAssignment(assignment.assignmentId);
    const steps = array(assignment.steps).map(step => {
      const matched = array(usage && usage.steps).find(item => item.id === step.id);
      const seen = new Set();
      const works = array(matched && matched.works).filter(work => actualWork(work, fieldId)
        && !seen.has(work.workId) && seen.add(work.workId)).map(workDTO);
      return { id: text(step.id), category: text(step.category), materialName: text(step.materialName),
        plannedTiming: text(step.plannedTiming), purpose: text(step.purpose), recorded: works.length > 0, works };
    });
    const recordedCount = steps.filter(step => step.recorded).length;
    return { assignmentId: text(assignment.assignmentId), name: text(assignment.name), active: assignment.active !== false, year: String(assignment.year),
      steps, recordedCount, unrecordedCount: steps.length - recordedCount };
  }

  // Detached, plain-text DTO. No master-name substitution, auto-linking, or quantity allocation.
  function describe(field, year) {
    const fieldId = text(field && field.fieldId);
    const valid = Boolean(fieldId && R.schema.validCropYear(year) && R.state.field(fieldId));
    const empty = { valid, fieldId, fieldName: text(field && field.name), year: R.schema.validCropYear(year) ? String(year) : "",
      currentProgram: null, previousPrograms: [], latestObservation: null, observations: [], materials: [], materialCount: 0, memo: "" };
    if (!valid) return empty;
    const assignments = R.herbicide.assignments(fieldId, year).filter(item => item.fieldId === fieldId && String(item.year) === String(year));
    const current = assignments.filter(item => item.active !== false).at(-1) || null;
    const observations = assignments.flatMap(assignment => R.herbicide.observations(assignment.assignmentId)
      .filter(item => item.fieldId === fieldId && item.assignmentId === assignment.assignmentId && validDate(item.date)
        && item.date.slice(0, 4) === String(year))
      .map(item => ({ assignmentId: text(assignment.assignmentId), assignmentName: text(assignment.name), assignmentActive: assignment.active !== false,
        observationId: text(item.observationId), date: text(item.date), status: text(item.status),
        weeds: Array.isArray(item.weeds) ? item.weeds.filter(weed => typeof weed === "string").join("・") : text(item.weeds),
        weedsRaw: Array.isArray(item.weeds) ? item.weeds.slice() : text(item.weeds), memo: text(item.memo) })))
      .sort((a, b) => b.date.localeCompare(a.date));
    const materials = R.state.materialUsageForYear(year, { cropYear: true }).map(group => {
      const seen = new Set();
      const works = array(group.works).filter(work => actualWork(work, fieldId) && String(R.state.cropYearForRecord(work)) === String(year)
        && !seen.has(work.workId) && seen.add(work.workId));
      const savedNames = [...new Set(works.map(work => text(work.material)).filter(Boolean))];
      return { key: text(group.key), materialId: text(group.materialId), name: text(works[0] && works[0].material) || text(group.name), savedNames,
        masterAvailable: Boolean(group.materialId && array(R.state.data().materials).some(item => item.materialId === group.materialId)),
        usageDates: [...new Set(works.map(work => work.date))].sort(), count: works.length,
        categories: [...new Set(works.map(work => text(work.herbicideCategory) || text(work.workName)).filter(Boolean))], works: works.map(workDTO) };
    }).filter(group => group.count > 0);
    const latestObservation = observations[0] || null;
    return { ...empty, currentProgram: current ? programDTO(current, fieldId) : null,
      previousPrograms: assignments.filter(item => item.active === false).map(item => programDTO(item, fieldId)),
      latestObservation, observations, materials, materialCount: materials.length, memo: latestObservation ? latestObservation.memo : "" };
  }
  const arrow = '<span class="mr-chevron" aria-hidden="true">›</span>';
  const emptyContext = () => '<section class="mr-empty" role="status">対象の圃場と年産を選択してください。</section>';
  function renderEntry(field, year) {
    const model = describe(field, year);
    if (!model.valid) return emptyContext();
    return `<section class="mr-entry" aria-label="資材・除草の振り返り">
      <button type="button" class="mr-entry-title" data-mr-open><h3>資材・除草の振り返り</h3>${arrow}</button>
      <div class="mr-entry-body"><img class="mr-entry-art" src="${art}" width="280" height="260" alt="">
        <dl class="mr-entry-facts"><div><dt>今年の体系</dt><dd>${esc(model.currentProgram ? model.currentProgram.name || "体系名未記録" : "未設定")}</dd></div>
          <div><dt>使用資材</dt><dd>${model.materialCount ? `${model.materialCount}<small>種類</small>` : "実績未記録"}</dd></div>
          <div><dt>最新の効果確認</dt><dd>${esc(model.latestObservation ? model.latestObservation.status || "評価未記録" : "観察未記録")}${model.latestObservation && !model.latestObservation.assignmentActive ? `<small class="mr-observation-source">変更前の計画：${esc(model.latestObservation.assignmentName || "体系名未記録")}</small>` : ""}</dd></div></dl></div>
      <div class="mr-entry-memo"><b>来年へのメモ</b><span>${esc(model.memo || "メモ未記録")}</span></div>
      <button type="button" class="mr-entry-open" data-mr-open>詳しく見る ${arrow}</button>
    </section>`;
  }
  function programStrip(program) {
    if (!program) return '<p class="mr-empty">この年産の除草体系は未設定です。</p>';
    return `<p class="mr-program-name">${esc(program.name || "体系名未記録")}</p><ol class="mr-step-strip">${program.steps.map(step => `<li class="mr-step${step.recorded ? " mr-step-recorded" : ""}" aria-label="${attr(step.category || "区分未記録")}：${step.recorded ? "実績記録あり" : "実績未記録"}"><span class="mr-step-mark" aria-hidden="true">${step.recorded ? "✓" : "○"}</span><span>${esc(step.category || "区分未記録")}<small>${step.recorded ? "実績記録あり" : "実績未記録"}</small></span></li>`).join("")}</ol>
      <div class="mr-program-footer"><span>実績記録あり <b>${program.recordedCount}</b>工程 ／ 実績未記録 <b>${program.unrecordedCount}</b>工程</span><button type="button" class="mr-text-button" data-mr-tab="program">計画と使用記録を見る ${arrow}</button></div>`;
  }
  function editButton(assignmentId, observationId, label) {
    return assignmentId ? `<button type="button" class="mr-edit" data-mr-edit-observation="${attr(assignmentId)}" data-observation-id="${attr(observationId)}"><span aria-hidden="true">✎</span> ${esc(label)}</button>` : "";
  }
  function newButton(program) {
    return program ? `<button type="button" class="mr-edit" data-mr-new-observation="${attr(program.assignmentId)}">＋ 効果確認を追加</button>` : "";
  }
  const managementButton = () => '<button type="button" class="mr-text-button" data-mr-management>体系・年度設定を開く ' + arrow + '</button>';
  function history(model) {
    if (!model.observations.length) return "";
    return `<details class="mr-history"><summary>これまでの効果確認 <span>${model.observations.length}件</span></summary>${model.observations.map(item => `<article class="mr-history-row"><h4>${esc(U.fd(item.date))} / ${esc(item.status || "評価未記録")}</h4><p class="mr-history-program">${esc(item.assignmentName || "体系名未記録")}${item.assignmentActive ? "" : "（変更前の計画）"}</p><p>${esc(item.weeds || "雑草名未記録")}</p>${item.memo ? `<p class="mr-note">${esc(item.memo)}</p>` : ""}<div class="mr-history-actions">${editButton(item.assignmentId, item.observationId, "編集")}<button type="button" class="mr-delete" data-mr-delete-observation="${attr(item.observationId)}">削除</button></div></article>`).join("")}</details>`;
  }
  function renderResult(model) {
    const latest = model.latestObservation;
    const assignmentId = latest ? latest.assignmentId : model.currentProgram && model.currentProgram.assignmentId || "";
    return `<section class="mr-result"><h3 class="mr-section-title">今年の除草を振り返る</h3><div class="mr-result-hero" data-observed="${Boolean(latest)}"><div><p class="mr-observed-date">${latest ? `${esc(U.fd(latest.date))}に記録した評価` : "効果確認はまだ記録されていません"}</p><h4 class="mr-result-status">${esc(latest ? latest.status || "評価未記録" : "観察未記録")}</h4>${latest && !latest.assignmentActive ? `<p class="mr-history-program">変更前の計画：${esc(latest.assignmentName)}</p>` : ""}</div>${latest ? `<img class="mr-result-art" src="${resultArt}" width="360" height="250" alt="">` : ""}</div>
        <dl class="mr-observation-facts"><div><dt>観察日</dt><dd>${latest ? esc(U.fd(latest.date)) : "未記録"}</dd></div><div><dt>確認した雑草</dt><dd>${esc(latest && latest.weeds || "未記録")}</dd></div></dl></section>
        <section class="mr-memo"><h3 class="mr-section-title">来年に引き継ぐこと</h3><p class="mr-note">${esc(model.memo || "評価・メモはまだ記録されていません。")}</p>${editButton(assignmentId, latest && latest.observationId || "", latest ? "評価・メモを編集" : "評価・メモを記録")}${!assignmentId ? '<p class="mr-empty">この年産の除草体系は未設定です。</p>' : ""}</section>
        <div class="mr-observation-actions">${newButton(model.currentProgram)}${!model.currentProgram ? managementButton() : ""}</div>
        <section class="mr-program"><h3 class="mr-section-title">体系と実績</h3>${programStrip(model.currentProgram)}</section>
        <button type="button" class="mr-material-entry" data-mr-tab="materials"><img src="${art}" width="120" height="100" alt=""><span>使用した資材 <strong>${model.materialCount}</strong>種類</span>${arrow}</button>
        ${history(model)}`;
  }
  function workButtons(works) {
    return `<div class="mr-work-list">${works.map(work => `<button type="button" class="mr-work-link" data-annual-record-open-kind="fieldWork" data-annual-record-open-id="${attr(work.workId)}" data-annual-record-open-label="${attr(work.title)}"><span><small>${esc(work.year)}年産 / ${esc(U.fd(work.date))}</small><b>${esc(work.title || "作業記録")}</b>${work.materialName ? `<span>${esc(work.materialName)}</span>` : ""}</span>${arrow}</button>`).join("")}</div>`;
  }
  function plan(model, program) {
    const observations = model.observations.filter(item => item.assignmentId === program.assignmentId);
    return `<section class="mr-plan${program.active ? "" : " mr-plan-previous"}"><div class="mr-plan-heading"><p>${esc(program.year)}年産${program.active ? " / 現在の計画" : " / 変更前の計画"}</p><h3>${esc(program.name || "体系名未記録")}</h3></div>
      <ol class="mr-plan-steps">${program.steps.map((step, index) => `<li class="mr-plan-step"><h4><span class="mr-plan-number">${index + 1}</span>${esc(step.category || "区分未記録")}</h4><dl class="mr-plan-facts"><div><dt>計画の資材</dt><dd>${esc(step.materialName || "当時の資材名は未保存")}</dd></div><div><dt>使用予定時期</dt><dd>${esc(step.plannedTiming || "未記録")}</dd></div><div><dt>選んだ理由</dt><dd>${esc(step.purpose || "未記録")}</dd></div></dl>
        <p class="mr-step-status${step.recorded ? " mr-step-status-recorded" : ""}">${step.recorded ? `紐付いた実績 ${step.works.length}件` : "実績未記録"}</p>${workButtons(step.works)}</li>`).join("") || '<li class="mr-empty">計画の工程は未記録です。</li>'}</ol>
      <div class="mr-observation-actions">${newButton(program)}</div>${history({ ...model, observations })}</section>`;
  }
  function renderProgram(model) {
    return `<section class="mr-program-view"><h3 class="mr-section-title">体系と実績</h3><div class="mr-program-management">${managementButton()}</div>
      ${model.currentProgram ? plan(model, model.currentProgram) : '<p class="mr-empty">この年産の除草体系は未設定です。</p>'}
      ${model.previousPrograms.length ? `<details class="mr-previous-programs"><summary>変更前の計画 <span>${model.previousPrograms.length}件</span></summary>${model.previousPrograms.map(program => plan(model, program)).join("")}</details>` : ""}</section>`;
  }
  function renderMaterials(model) {
    return `<section class="mr-materials-view"><h3 class="mr-section-title">使用資材</h3><p class="mr-materials-count">${esc(model.year)}年産 / ${model.materialCount}種類</p>
      ${model.materials.map(group => `<details class="mr-material-group"><summary><span><b>${esc(group.name || "名称未記録")}</b><small>${esc(group.categories.join("・") || "区分未記録")} / 使用記録 ${group.count}件</small></span><span class="mr-disclosure-mark" aria-hidden="true">＋</span></summary>
        <dl class="mr-plan-facts"><div><dt>使用日</dt><dd>${group.usageDates.map(date => esc(U.fd(date))).join("、")}</dd></div><div><dt>作業の区分</dt><dd>${esc(group.categories.join("・") || "未記録")}</dd></div></dl>
        ${group.savedNames.length > 1 ? `<p class="mr-material-names">使用時の資材名：${esc(group.savedNames.join(" / "))}</p>` : ""}${workButtons(group.works)}
        ${group.masterAvailable ? `<button type="button" class="mr-text-button" data-mr-material-master="${attr(group.materialId)}">現在の資材情報 ${arrow}</button>` : '<p class="mr-empty">現在の資材マスターとの紐付けはありません。</p>'}</details>`).join("") || '<p class="mr-empty">この圃場・年産の資材使用実績は未記録です。</p>'}</section>`;
  }
  function renderEditor(model, editor) {
    const programs = [model.currentProgram, ...model.previousPrograms].filter(Boolean);
    const program = programs.find(item => item.assignmentId === editor.assignmentId);
    const observation = editor.observationId ? model.observations.find(item => item.observationId === editor.observationId && item.assignmentId === editor.assignmentId) : null;
    if (!program || editor.observationId && !observation) return '<section class="mr-editor"><p class="mr-form-error" role="alert">この圃場・年産の観察対象を確認できません。</p><button type="button" class="mr-edit" data-mr-cancel-editor>戻る</button></section>';
    const value = key => editor[key] !== undefined ? editor[key] : observation ? observation[key] : "";
    const status = text(value("status"));
    const weeds = Array.isArray(value("weeds")) ? value("weeds").join("・") : text(value("weeds"));
    const choices = statuses.includes(status) || !status ? statuses : [status, ...statuses];
    return `<section class="mr-editor"><h3 class="mr-section-title">${observation ? "効果確認・メモを編集" : "効果確認を記録"}</h3><p class="mr-editor-program">${esc(program.name || "体系名未記録")}${program.active ? "" : "（変更前の計画）"}</p>
      <form class="mr-observation-form" data-mr-observation-form data-assignment-id="${attr(program.assignmentId)}" data-observation-id="${attr(observation && observation.observationId || "")}" data-field-id="${attr(model.fieldId)}" data-year="${attr(model.year)}">
        <label>観察日<input name="date" type="date" value="${attr(value("date"))}" min="${attr(model.year)}-01-01" max="${attr(model.year)}-12-31" required></label>
        <label>効果の確認<select name="status" required><option value=""${!status ? " selected" : ""}>評価を選択</option>${choices.map(choice => `<option value="${attr(choice)}"${choice === status ? " selected" : ""}>${esc(choice)}</option>`).join("")}</select></label>
        <label>確認した雑草<input name="weeds" type="text" value="${attr(weeds)}"></label>
        <label>来年に引き継ぐメモ<textarea name="memo" rows="6">${esc(value("memo"))}</textarea></label>
        ${editor.error ? `<p class="mr-form-error" role="alert">${esc(editor.error)}</p>` : ""}
        <div class="mr-editor-actions"><button type="button" class="mr-edit" data-mr-cancel-editor>キャンセル</button><button type="submit" class="mr-primary">保存</button></div>
      </form></section>`;
  }
  function renderDetail(field, year, options = {}) {
    const model = describe(field, year);
    if (!model.valid) return emptyContext();
    const opts = options && typeof options === "object" ? options : {};
    const editor = opts.editor && typeof opts.editor === "object" ? opts.editor : null;
    const tab = ["result", "program", "materials"].includes(opts.tab) ? opts.tab : "result";
    const heading = editor ? "効果確認・メモ" : "資材・除草の振り返り";
    const content = editor ? renderEditor(model, editor) : tab === "program" ? renderProgram(model) : tab === "materials" ? renderMaterials(model) : renderResult(model);
    return `<div class="mr-detail" data-mr-view="${editor ? "editor" : tab}" data-field-id="${attr(model.fieldId)}" data-year="${attr(model.year)}">
      <header class="mr-header"><button type="button" class="mr-back" ${editor ? "data-mr-cancel-editor" : "data-mr-back"} aria-label="${editor ? "評価・メモへ戻る" : "一年の流れへ戻る"}" title="${editor ? "評価・メモへ戻る" : "一年の流れへ戻る"}">←</button><div class="mr-heading"><p>${esc(model.year)}年産　${esc(model.fieldName)}</p><h2>${heading}</h2></div><img class="mr-header-art" src="${art}" width="160" height="140" alt=""></header>
      ${editor ? "" : `<nav class="mr-tabs" aria-label="振り返りの表示">${[["result", "除草の結果"], ["program", "体系と実績"], ["materials", "使用資材"]].map(([id, label]) => `<button type="button" class="mr-tab${tab === id ? " mr-tab-active" : ""}" data-mr-tab="${id}"${tab === id ? ' aria-current="page"' : ""}>${label}</button>`).join("")}</nav>`}
      <div class="mr-content">${content}</div></div>`;
  }
  R.materialReview = { describe, renderEntry, renderDetail };
})();
