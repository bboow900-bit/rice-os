(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let bulkFieldIds = [];

  const FLOW = [
    { key: "dry", label: "中干し", tone: "dry" },
    { key: "intermittentEarly", label: "間断灌水", tone: "intermittent" },
    { key: "deep", label: "深水管理", tone: "deep" },
    { key: "intermittentLate", label: "間断灌水", tone: "intermittent" },
    { key: "drain", label: "落水", tone: "drain" }
  ];

  function cropYear(date) {
    return String(date || U.today()).slice(0, 4);
  }

  function firstFieldId() {
    const field = state.activeFields()[0] || state.fields()[0];
    return field ? field.fieldId : "";
  }

  function groupName(field) {
    return String(field && (field.fieldGroupId || field.district) || "").trim().replace(/グループ$/, "");
  }

  function groups() {
    const map = new Map();
    state.activeFields().forEach((field) => {
      const name = groupName(field);
      if (!name) return;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(field);
    });
    return Array.from(map.entries()).map(([name, fields]) => ({ name, fields }));
  }

  function targetFields() {
    if (bulkFieldIds.length) {
      const ids = new Set(bulkFieldIds);
      return state.activeFields().filter((field) => ids.has(field.fieldId));
    }
    const selected = state.field(U.$("waterField").value);
    if (U.$("waterTargetMode").value !== "group") return selected ? [selected] : [];
    const group = groups().find((item) => item.name === U.$("waterGroup").value);
    return group ? group.fields : [];
  }

  function targetLabel() {
    if (bulkFieldIds.length) {
      const fields = targetFields();
      return fields.length > 1 ? `${fields[0].name}ほか` : fields[0]?.name || "圃場";
    }
    if (U.$("waterTargetMode").value === "group") return `${U.$("waterGroup").value || "圃場"}グループ`;
    return state.field(U.$("waterField").value)?.name || "圃場";
  }

  function irrigationRows(fieldId, date) {
    const year = cropYear(date);
    return state.irrigationsFor(fieldId, year)
      .filter((item) => /間断灌水|深水管理/.test(String(item.method || "")))
      .filter((item) => String(item.startDate || item.date || "") <= String(date))
      .slice()
      .sort((a, b) => String(a.startDate || a.date).localeCompare(String(b.startDate || b.date)));
  }

  function dryRows(fieldId, date) {
    return state.dryPeriodsFor(fieldId, cropYear(date))
      .filter((item) => String(item.startDate || item.date || "") <= String(date))
      .slice().sort((a, b) => String(a.startDate || a.date).localeCompare(String(b.startDate || b.date)));
  }

  function activeRow(rows, method, date) {
    return rows.filter((item) => item.method === method && item.startDate && (!item.actualEndDate || String(item.actualEndDate) > String(date))).at(-1) || null;
  }

  function waterState(field, date) {
    const dry = dryRows(field.fieldId, date).filter((item) => item.startDate).at(-1) || null;
    const irrigation = irrigationRows(field.fieldId, date);
    const deep = activeRow(irrigation, "深水管理", date);
    const intermittent = activeRow(irrigation, "間断灌水", date);
    if (deep) return { key: "deep", label: "深水管理中", item: deep };
    if (intermittent) return { key: "intermittent", label: "間断灌水中", item: intermittent };
    if (dry && (!dry.actualEndDate || String(dry.actualEndDate) > String(date))) return { key: "dry", label: "中干し中", item: dry };
    if (dry && dry.actualEndDate && String(dry.actualEndDate) <= String(date)) return { key: "afterDry", label: "中干し完了", item: dry };
    return { key: "waiting", label: "水管理を記録", item: null };
  }

  function currentStage(field, date) {
    const result = RiceOS.agro && RiceOS.agro.seasonStageForField ? RiceOS.agro.seasonStageForField(field, date) : null;
    return result && result.current ? result.current.label : "生育記録待ち";
  }

  function panicleHeadingFacts(field, date) {
    const year = cropYear(date);
    const logs = state.growthLogsFor(field.fieldId, year);
    const panicle = logs.filter((row) => U.number(row.panicleLengthMm, 0) > 0).at(-1);
    const heading = logs.filter((row) => row.headingObserved).at(-1);
    return [panicle ? `幼穂 ${panicle.panicleLengthMm}mm` : "", heading ? `出穂 ${U.fd(heading.date)}` : ""].filter(Boolean);
  }

  function renderOptions() {
    U.setOptions(U.$("waterField"), state.activeFields().map((field) => ({ value: field.fieldId, label: field.name })), U.$("waterField").value || firstFieldId());
    const list = groups();
    U.setOptions(U.$("waterGroup"), list.map((group) => ({ value: group.name, label: `${group.name}グループ (${group.fields.length}圃場)` })), U.$("waterGroup").value || list[0]?.name || "");
    const groupMode = U.$("waterTargetMode").value === "group";
    U.$("waterGroupLabel").classList.toggle("hidden", !groupMode);
    U.$("waterFieldLabel").classList.toggle("hidden", groupMode);
    const fields = targetFields();
    U.$("waterTargetNotice").textContent = fields.length
      ? `${targetLabel()}の${fields.length}圃場へ、同じ日付で水管理を記録します。`
      : "圃場または圃場グループを選択してください。";
  }

  function renderFlowChart() {
    const fields = targetFields();
    const date = U.$("waterDate").value || U.today();
    const states = fields.map((field) => waterState(field, date));
    const current = states.length && states.every((state) => state.key === states[0].key) ? states[0].key : "mixed";
    const stage = fields[0] ? currentStage(fields[0], date) : "生育記録待ち";
    const facts = fields[0] ? panicleHeadingFacts(fields[0], date) : [];
    U.$("waterFlowChart").innerHTML = `
      <section class="water-flow-card ${U.attr(current)}">
        <div class="water-flow-head"><div><span>生育 × 水管理</span><b>${U.escapeHTML(targetLabel())}</b></div><strong>${U.escapeHTML(stage)}</strong></div>
        <div class="water-crop-road"><span>田植え</span><span>分げつ</span><span>幼穂</span><span>穂ばらみ</span><span>出穂</span><span>登熟</span></div>
        <div class="water-flow-road">${FLOW.map((step) => `<span class="${U.attr(step.key)} ${current === step.key || (step.key.startsWith("intermittent") && current === "intermittent") ? "current" : ""}"><i></i><b>${U.escapeHTML(step.label)}</b></span>`).join("")}</div>
        <div class="water-flow-facts"><span>現在: ${U.escapeHTML(current === "mixed" ? "圃場ごとに異なります" : states[0]?.label || "未記録")}</span>${facts.map((fact) => `<span>${U.escapeHTML(fact)}</span>`).join("")}</div>
      </section>
    `;
  }

  function button(action, label, tone, enabled) {
    const note = enabled ? `${U.fd(U.$("waterDate").value || U.today())}で記録` : "対象となる期間がありません";
    return `<button type="button" class="water-action ${U.attr(tone)}" data-water-action="${U.attr(action)}" ${enabled ? "" : "disabled"}><b>${U.escapeHTML(label)}</b><small>${U.escapeHTML(note)}</small></button>`;
  }

  function eligibleFields(action) {
    const date = U.$("waterDate").value || U.today();
    return targetFields().filter((field) => {
      const stateRow = waterState(field, date);
      if (action === "dry-start") return stateRow.key === "waiting";
      if (action === "dry-end") return stateRow.key === "dry";
      if (action === "intermittent-start") return ["waiting", "afterDry"].includes(stateRow.key);
      if (action === "deep-start") return stateRow.key === "intermittent";
      if (action === "deep-end") return stateRow.key === "deep";
      if (action === "drain") return stateRow.key === "intermittent";
      return false;
    });
  }

  function renderActions() {
    const states = targetFields().map((field) => waterState(field, U.$("waterDate").value || U.today()));
    const key = states.length && states.every((state) => state.key === states[0].key) ? states[0].key : "mixed";
    const actions = key === "dry"
      ? [["dry-end", "中干しを終了", "dry"]]
      : key === "deep"
        ? [["deep-end", "深水管理を終了", "deep"]]
        : key === "intermittent"
          ? [["deep-start", "深水管理を開始", "deep"], ["drain", "落水を記録", "drain"]]
          : key === "afterDry"
            ? [["intermittent-start", "間断灌水を開始", "intermittent"]]
            : [["dry-start", "中干しを開始", "dry"], ["intermittent-start", "間断灌水を開始", "intermittent"]];
    U.$("waterActionGrid").innerHTML = actions.map(([action, label, tone]) => button(action, label, tone, eligibleFields(action).length > 0)).join("");
  }

  function irrigationRecord(field, method, startDate, endDate, memo) {
    const targetDays = method === "間断灌水" ? String(field.intermittentIntervalDays || "") : "";
    return {
      method,
      date: startDate,
      fieldId: field.fieldId,
      startDate,
      endDate: endDate || "",
      actualEndDate: "",
      targetDays,
      periodStatus: "実施中",
      status: method === "深水管理" ? "入水中" : "入水中",
      memo: memo || ""
    };
  }

  function confirmAction(action, fields) {
    const labels = { "dry-start": "中干しを開始", "dry-end": "中干しを終了", "intermittent-start": "間断灌水を開始", "deep-start": "深水管理を開始", "deep-end": "深水管理を終了", drain: "落水を記録" };
    return confirm(`${targetLabel()}の${fields.length}圃場へ、${U.fd(U.$("waterDate").value || U.today())}に${labels[action]}を記録します。`);
  }

  function recordAction(action) {
    const date = U.$("waterDate").value || U.today();
    const fields = eligibleFields(action);
    if (!fields.length || !confirmAction(action, fields)) return;
    if (action === "dry-start") {
      const records = fields.map((field) => ({ fieldId: field.fieldId, date, startDate: date, targetDays: String(field.drainageTargetDays || ""), status: "実施中", memo: "" }));
      state.saveDryPeriodsBatch(records, `${targetLabel()}の中干しを開始しました`);
    } else if (action === "dry-end") {
      const records = fields.map((field) => {
        const active = waterState(field, date).item;
        return { ...active, date: active.date || active.startDate, actualEndDate: date, status: "完了" };
      });
      state.saveDryPeriodsBatch(records, `${targetLabel()}の中干しを終了しました。間断灌水を開始しました`);
    } else if (action === "intermittent-start") {
      const records = fields.map((field) => irrigationRecord(field, "間断灌水", date, "", ""));
      state.saveIrrigationsBatch(records, `${targetLabel()}の間断灌水を開始しました`);
    } else if (action === "deep-start") {
      const records = [];
      fields.forEach((field) => {
        const active = waterState(field, date).item;
        records.push({ ...active, date: active.date || active.startDate, actualEndDate: date, periodStatus: "完了", status: "落水中" });
        records.push(irrigationRecord(field, "深水管理", date, "", "穂ばらみ・出穂期の深水管理"));
      });
      state.saveIrrigationsBatch(records, `${targetLabel()}の深水管理を開始しました`);
    } else if (action === "deep-end") {
      const records = [];
      fields.forEach((field) => {
        const active = waterState(field, date).item;
        records.push({ ...active, date: active.date || active.startDate, actualEndDate: date, periodStatus: "完了", status: "落水中" });
        records.push(irrigationRecord(field, "間断灌水", date, "", "深水管理終了後の間断灌水"));
      });
      state.saveIrrigationsBatch(records, `${targetLabel()}の深水管理を終了し、間断灌水へ戻しました`);
    } else if (action === "drain") {
      const records = fields.map((field) => {
        const active = waterState(field, date).item;
        return { ...active, date: active.date || active.startDate, actualEndDate: date, periodStatus: "完了", status: "落水中", memo: active.memo || "稲刈り前の落水" };
      });
      state.saveIrrigationsBatch(records, `${targetLabel()}の落水を記録しました`);
    }
    resetEdit();
    render();
  }

  function allHistory() {
    const ids = new Set(targetFields().map((field) => field.fieldId));
    const year = cropYear(U.$("waterDate").value || U.today());
    const dry = state.data().dryPeriods.filter((item) => ids.has(item.fieldId) && String(item.season) === year)
      .map((item) => ({ ...item, source: "dry", label: "中干し", tone: "dry" }));
    const irrigation = state.data().irrigations.filter((item) => ids.has(item.fieldId) && String(item.season) === year && /間断灌水|深水管理|湿潤灌漑/.test(item.method || ""))
      .map((item) => ({
        ...item,
        source: "irrigation",
        label: item.method === "湿潤灌漑" ? "湿潤灌漑（旧記録）" : item.method,
        tone: item.method === "深水管理" ? "deep" : (item.method === "湿潤灌漑" ? "legacy" : "intermittent")
      }));
    return [...dry, ...irrigation].sort((a, b) => String(b.startDate || b.date).localeCompare(String(a.startDate || a.date)));
  }

  function renderHistory() {
    const rows = allHistory();
    U.$("waterHistory").innerHTML = `
      <section class="water-history-head"><div><h3>水管理の履歴</h3><small>開始日と終了日を編集できます</small></div><span>${rows.length}件</span></section>
      <div class="water-history-list">${rows.length ? rows.map((item) => {
        const field = state.field(item.fieldId);
        const end = item.actualEndDate || "";
        const days = item.startDate && end ? U.daysBetween(item.startDate, end) : "";
        return `<article class="water-history-card ${U.attr(item.tone)}"><div><span>${U.escapeHTML(item.label)}</span><b>${U.escapeHTML(field?.name || "圃場")}</b><small>${U.escapeHTML(U.fd(item.startDate || item.date))} - ${U.escapeHTML(end ? U.fd(end) : "実施中")}${days !== "" ? ` / ${days}日` : ""}</small></div><button type="button" data-water-edit="${U.attr(item.source)}" data-id="${U.attr(item.source === "dry" ? item.dryPeriodId : item.irrigationId)}">編集</button></article>`;
      }).join("") : '<div class="empty">今年の水管理はまだありません。</div>'}</div>
    `;
  }

  function resetEdit() {
    U.$("waterEditId").value = "";
    U.$("waterEditType").value = "";
    U.$("waterEditStart").value = "";
    U.$("waterEditEnd").value = "";
    U.$("waterEditMemo").value = "";
    U.$("waterEditSection").open = false;
  }

  function fillEdit(type, id) {
    const item = type === "dry" ? state.data().dryPeriods.find((row) => row.dryPeriodId === id) : state.data().irrigations.find((row) => row.irrigationId === id);
    if (!item) return;
    U.$("waterEditType").value = type;
    U.$("waterEditId").value = id;
    U.$("waterEditStart").value = item.startDate || item.date || "";
    U.$("waterEditEnd").value = item.actualEndDate || "";
    U.$("waterEditMemo").value = item.memo || "";
    U.$("waterEditSection").open = true;
    U.$("waterEditSection").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetForm() {
    const field = state.field(firstFieldId());
    U.$("waterDate").value = U.today();
    U.$("waterTargetMode").value = "field";
    U.$("waterField").value = field?.fieldId || "";
    bulkFieldIds = [];
    resetEdit();
    render();
  }

  function render() {
    renderOptions();
    renderFlowChart();
    const fields = targetFields();
    const states = fields.map((field) => waterState(field, U.$("waterDate").value || U.today()));
    const stateLabel = states.length && states.every((item) => item.key === states[0].key) ? states[0].label : "圃場ごとに状態が異なります";
    U.$("waterCurrentStatus").innerHTML = `<div class="water-current-card"><span>現在の水管理</span><b>${U.escapeHTML(stateLabel)}</b><small>現地で実施した開始・終了だけを残します</small></div>`;
    renderActions();
    renderHistory();
  }

  function prefillDate(date, fieldId) {
    bulkFieldIds = [];
    U.$("waterDate").value = date || U.today();
    U.$("waterTargetMode").value = "field";
    if (fieldId) U.$("waterField").value = fieldId;
    render();
  }

  function prefillFields(date, fieldIds) {
    bulkFieldIds = (fieldIds || []).filter(Boolean);
    U.$("waterDate").value = date || U.today();
    const matchingGroup = groups().find((group) => group.fields.length === bulkFieldIds.length && group.fields.every((field) => bulkFieldIds.includes(field.fieldId)));
    if (matchingGroup) {
      bulkFieldIds = [];
      U.$("waterTargetMode").value = "group";
      U.$("waterGroup").value = matchingGroup.name;
    } else {
      U.$("waterTargetMode").value = "field";
      if (bulkFieldIds[0]) U.$("waterField").value = bulkFieldIds[0];
    }
    render();
  }

  function bind() {
    ["waterTargetMode", "waterField", "waterGroup"].forEach((id) => U.$(id).addEventListener("change", () => { bulkFieldIds = []; render(); }));
    U.$("waterDate").addEventListener("change", render);
    U.$("waterActionGrid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-water-action]");
      if (button && !button.disabled) recordAction(button.dataset.waterAction);
    });
    U.$("waterHistory").addEventListener("click", (event) => {
      const button = event.target.closest("[data-water-edit]");
      if (button) fillEdit(button.dataset.waterEdit, button.dataset.id);
    });
    U.$("waterEditForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const type = U.$("waterEditType").value;
      const id = U.$("waterEditId").value;
      const item = type === "dry" ? state.data().dryPeriods.find((row) => row.dryPeriodId === id) : state.data().irrigations.find((row) => row.irrigationId === id);
      if (!item) return;
      const record = { ...item, date: item.date || U.$("waterEditStart").value, startDate: U.$("waterEditStart").value, actualEndDate: U.$("waterEditEnd").value, status: U.$("waterEditEnd").value ? "完了" : "実施中", periodStatus: U.$("waterEditEnd").value ? "完了" : "実施中", memo: U.$("waterEditMemo").value };
      const saved = type === "dry" ? state.saveDryPeriod(record) : state.saveIrrigation(record);
      if (saved !== null) { resetEdit(); render(); }
    });
    document.querySelector('[data-action="reset-irrigation"]').addEventListener("click", resetForm);
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.irrigation = { render, bind, resetForm, prefillDate, prefillFields, editIrrigation: (id) => fillEdit("irrigation", id) };
})();
