(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let bulkFieldIds = [];
  let focusedTypeKey = "";

  const ROAD = [
    { key: "establishment", label: "移植・活着", water: "deep", waterLabel: "深水" },
    { key: "tillering", label: "有効分げつ", water: "shallow", waterLabel: "浅水" },
    { key: "maximumTillering", label: "無効分げつ", water: "dry", waterLabel: "中干し" },
    { key: "panicle", label: "幼穂形成", water: "intermittent", waterLabel: "間断" },
    { key: "booting", label: "穂ばらみ", water: "deep", waterLabel: "深水" },
    { key: "heading", label: "出穂", water: "deep", waterLabel: "深水" },
    { key: "ripening", label: "登熟・収穫前", water: "intermittent", waterLabel: "間断・落水" }
  ];

  const WATER_TYPES = [
    { key: "dry", label: "中干し", source: "dry", tone: "dry", icon: "☀", target: (field) => field.drainageTargetDays || "" },
    { key: "intermittent", label: "間断灌水", source: "irrigation", method: "間断灌水", tone: "intermittent", icon: "〰", target: (field) => field.intermittentIntervalDays || "" },
    { key: "deep", label: "深水管理", source: "irrigation", method: "深水管理", tone: "deep", icon: "≋", target: () => "" },
    { key: "drain", label: "稲刈り前の落水", source: "irrigation", method: "稲刈り前の落水", tone: "drain", icon: "⌇", target: () => "" }
  ];

  function cropYear(date) {
    return String(date || U.today()).slice(0, 4);
  }

  function firstFieldId() {
    const field = state.activeFields()[0] || state.fields()[0];
    return field ? field.fieldId : "";
  }

  function groupName(field) {
    const group = state.groupForField ? state.groupForField(field) : null;
    return group ? group.name : "";
  }

  function groups() {
    return state.groupedFields({ includeUnassigned: false });
  }

  function targetFields() {
    if (bulkFieldIds.length) {
      const ids = new Set(bulkFieldIds);
      return state.activeFields().filter((field) => ids.has(field.fieldId));
    }
    const selected = state.field(U.$("waterField").value);
    if (U.$("waterTargetMode").value !== "group") return selected ? [selected] : [];
    const group = groups().find((item) => item.fieldGroupId === U.$("waterGroup").value);
    return group ? group.fields : [];
  }

  function targetLabel() {
    if (bulkFieldIds.length) {
      const fields = targetFields();
      return fields.length > 1 ? `${fields[0].name}ほか` : fields[0]?.name || "圃場";
    }
    if (U.$("waterTargetMode").value === "group") return `${state.fieldGroup(U.$("waterGroup").value)?.name || "圃場"}グループ`;
    return state.field(U.$("waterField").value)?.name || "圃場";
  }

  function irrigationRows(fieldId, date) {
    const year = cropYear(date);
    return state.irrigationsFor(fieldId, year)
      .filter((item) => /間断灌水|深水管理|稲刈り前の落水|落水/.test(String(item.method || "")))
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
    return rows.filter((item) => !/予定|未開始/.test(String(item.periodStatus || item.status || ""))
      && (!method || item.method === method) && item.startDate && (!item.actualEndDate || String(item.actualEndDate) > String(date))).at(-1) || null;
  }

  function typeForKey(key) {
    return WATER_TYPES.find((item) => item.key === key) || null;
  }

  function typeRows(field, type, date) {
    if (type.source === "dry") return dryRows(field.fieldId, date);
    return irrigationRows(field.fieldId, date).filter((item) => item.method === type.method || (type.key === "drain" && item.method === "落水"));
  }

  function activePeriod(field, type, date) {
    const rows = typeRows(field, type, date);
    if (type.source === "dry") return rows.filter((item) => !/予定|未開始/.test(String(item.periodStatus || item.status || ""))
      && item.startDate && (!item.actualEndDate || String(item.actualEndDate) > String(date))).at(-1) || null;
    return activeRow(rows, type.method, date) || (type.key === "drain" ? activeRow(rows, "落水", date) : null);
  }

  function waterState(field, date) {
    const active = WATER_TYPES.map((type) => ({ type, item: activePeriod(field, type, date) }))
      .filter((row) => row.item)
      .sort((a, b) => String(a.item.startDate || a.item.date).localeCompare(String(b.item.startDate || b.item.date)));
    if (active.length) {
      const latest = active.at(-1);
      return { key: latest.type.key, label: `${latest.type.label}中`, item: latest.item };
    }
    return { key: "waiting", label: "水管理を記録", item: null };
  }

  function currentStage(field, date) {
    const result = RiceOS.agro && RiceOS.agro.seasonStageForField ? RiceOS.agro.seasonStageForField(field, date) : null;
    return result && result.current ? {
      key: result.current.key || "",
      label: result.current.label,
      certainty: result.certainty || "推定",
      image: result.current.image || 1
    } : { key: "", label: "生育記録待ち", certainty: "記録待ち", image: 1 };
  }

  function roadIndex(stageKey) {
    if (/establishment/.test(stageKey)) return 0;
    if (/earlyTillering|peakTillering/.test(stageKey)) return 1;
    if (/maximumTillering/.test(stageKey)) return 2;
    if (/panicleInitiation|meiosis/.test(stageKey)) return 3;
    if (/booting/.test(stageKey)) return 4;
    if (/heading|fullHeading/.test(stageKey)) return 5;
    if (/ripening|yellowRipening|maturity/.test(stageKey)) return 6;
    return -1;
  }

  function waterDays(stateRow, date) {
    const item = stateRow && stateRow.item;
    if (!item || !item.startDate) return "記録待ち";
    if (item.actualEndDate && String(item.actualEndDate) <= String(date)) {
      const days = U.daysBetween(item.startDate, item.actualEndDate);
      const afterDays = U.daysBetween(item.actualEndDate, date);
      if (days === "") return "完了";
      return afterDays > 0 ? `実績 ${days}日 / 完了から ${afterDays}日` : `実績 ${days}日`;
    }
    const days = U.daysBetween(item.startDate, date);
    return days === "" ? "開始日" : `開始から ${days}日`;
  }

  function currentWaterRoadIndex(stageIndex, waterKey) {
    if (waterKey === "dry") return 2;
    if (waterKey === "deep") return stageIndex >= 5 ? 5 : 4;
    if (waterKey === "intermittent") return stageIndex >= 6 ? 6 : 3;
    if (waterKey === "afterDry") return 3;
    return -1;
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
    U.setOptions(U.$("waterGroup"), list.map((group) => ({ value: group.fieldGroupId, label: `${group.name}グループ (${group.fields.length}圃場)` })), U.$("waterGroup").value || list[0]?.fieldGroupId || "");
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
    const stageRows = fields.map((field) => currentStage(field, date));
    const stageMatches = stageRows.length && stageRows.every((item) => item.key === stageRows[0].key);
    const stage = stageMatches ? stageRows[0] : {
      key: "",
      label: fields.length > 1 ? "圃場ごとに生育段階が異なります" : "生育記録待ち",
      certainty: fields.length > 1 ? "個別確認" : "記録待ち",
      image: fields.length > 1 ? 4 : 1
    };
    const stageIndex = roadIndex(stage.key);
    const activeState = current === "mixed" ? null : states[0];
    const waterIndex = stageMatches ? currentWaterRoadIndex(stageIndex, current) : -1;
    const facts = fields[0] ? panicleHeadingFacts(fields[0], date) : [];
    U.$("waterFlowChart").innerHTML = `
      <section class="water-flow-card ${U.attr(current)}">
        <div class="water-flow-head"><div><span>今年の水管理工程</span><b>${U.escapeHTML(targetLabel())}</b></div><strong>${U.escapeHTML(stage.certainty)}</strong></div>
        <div class="water-now-summary">
          <img src="assets/images/rice-stages/rice-paddy-tile-${String(stage.image).padStart(2, "0")}.png" alt="">
          <div><span>いまここ</span><b>${U.escapeHTML(stage.label)}</b><small>${U.escapeHTML(current === "mixed" ? "圃場ごとに水管理の状態が異なります" : `${activeState?.label || "水管理を記録"} ・ ${waterDays(activeState, date)}`)}</small></div>
        </div>
        <div class="water-road-caption"><span>生育の流れ</span><small>現在地を緑の目印で表示</small></div>
        <div class="water-stage-road">${ROAD.map((step, index) => `<span class="${index === stageIndex ? "current" : ""}"><i>${index === stageIndex ? "●" : ""}</i><b>${U.escapeHTML(step.label)}</b></span>`).join("")}</div>
        <div class="water-road-caption"><span>水管理の目安</span><small>色帯は工程の目安、濃色は実績</small></div>
        <div class="water-flow-road image-style">${ROAD.map((step, index) => `<span class="${U.attr(step.water)} ${index === waterIndex ? "actual" : ""}"><i>${index === waterIndex ? "●" : ""}</i><b>${U.escapeHTML(step.waterLabel)}</b></span>`).join("")}</div>
        <div class="water-flow-facts"><span>${U.escapeHTML(current === "mixed" ? "実績は圃場ごとに確認" : waterDays(activeState, date))}</span>${facts.slice(0, 1).map((fact) => `<span>${U.escapeHTML(fact)}</span>`).join("")}</div>
      </section>
    `;
  }

  function typeActiveFields(type, date) {
    return targetFields().filter((field) => activePeriod(field, type, date));
  }

  function typePeriodSummary(type, date) {
    const fields = targetFields();
    const active = typeActiveFields(type, date);
    const rows = fields.flatMap((field) => typeRows(field, type, date).map((item) => ({ field, item })));
    const latest = rows.slice().sort((a, b) => String(b.item.startDate || b.item.date).localeCompare(String(a.item.startDate || a.item.date)))[0] || null;
    return { fields, active, rows, latest };
  }

  function stageText(field, date) {
    if (!field || !date) return "生育記録待ち";
    const stage = currentStage(field, date);
    return `${stage.label} (${stage.certainty})`;
  }

  function periodDays(item, date) {
    if (!item || !item.startDate) return "";
    const end = item.actualEndDate || date;
    const days = U.daysBetween(item.startDate, end);
    return days === "" ? "" : `${days}日`;
  }

  function renderTypeCard(type) {
    const date = U.$("waterDate").value || U.today();
    const summary = typePeriodSummary(type, date);
    const activeCount = summary.active.length;
    const isGroup = summary.fields.length > 1;
    const latest = summary.latest;
    const latestItem = latest && latest.item;
    const startLabel = latestItem ? U.fd(latestItem.startDate || latestItem.date) : "まだ記録なし";
    const finished = latestItem && latestItem.actualEndDate;
    const status = activeCount ? "実施中" : (finished ? "完了" : "未開始");
    const targetDays = latestItem && latestItem.targetDays || (summary.fields.length === 1 ? type.target(summary.fields[0]) : "");
    const activeItem = summary.active[0] && activePeriod(summary.active[0], type, date);
    const stageField = activeItem && summary.active[0] ? summary.active[0] : latest && latest.field;
    const stage = activeItem && stageField ? stageText(stageField, activeItem.startDate) : (latest ? stageText(latest.field, latestItem.startDate || latestItem.date) : "");
    const startEnabled = summary.fields.length > activeCount;
    const endEnabled = activeCount > 0;
    const countNote = isGroup ? `${activeCount}/${summary.fields.length}圃場が実施中` : "";
    return `
      <article class="water-period-card ${U.attr(type.tone)} ${focusedTypeKey === type.key ? "focus" : ""}" data-water-type-card="${U.attr(type.key)}">
        <div class="water-period-card-head"><span class="water-period-icon" aria-hidden="true">${U.escapeHTML(type.icon)}</span><div><b>${U.escapeHTML(type.label)}</b><small>${U.escapeHTML(countNote || (activeCount ? `開始 ${startLabel}` : (finished ? `完了 ${U.fd(latestItem.actualEndDate)}` : "期間を記録")))}</small></div><strong class="water-period-status ${activeCount ? "active" : (finished ? "done" : "waiting")}">${U.escapeHTML(status)}</strong></div>
        <div class="water-period-facts">
          <span>最新 ${U.escapeHTML(startLabel)}</span>
          ${activeItem ? `<span>経過 ${U.escapeHTML(periodDays(activeItem, date))}</span>` : (finished ? `<span>実績 ${U.escapeHTML(periodDays(latestItem, latestItem.actualEndDate))}</span>` : "")}
          ${targetDays ? `<span>目安 ${U.escapeHTML(String(targetDays))}日</span>` : ""}
        </div>
        ${stage ? `<p class="water-period-stage"><span>${isGroup ? `代表: ${stageField.name}` : "生育との重なり"}</span><b>${U.escapeHTML(stage)}</b></p>` : ""}
        <div class="water-period-actions">
          <button type="button" class="secondary" data-water-action="${U.attr(`${type.key}-start`)}" ${startEnabled ? "" : "disabled"}>${finished ? "もう一度開始" : "開始を記録"}</button>
          <button type="button" class="primary" data-water-action="${U.attr(`${type.key}-end`)}" ${endEnabled ? "" : "disabled"}>終了を記録</button>
        </div>
        ${summary.rows.length > 1 ? `<small class="water-period-history-note">過去を含めて ${isGroup ? `合計${summary.rows.length}件` : `${summary.rows.length}回`}</small>` : ""}
      </article>`;
  }

  function renderActions() {
    U.$("waterActionGrid").innerHTML = WATER_TYPES.map(renderTypeCard).join("");
  }

  function irrigationRecord(field, method, startDate, endDate, memo) {
    const type = WATER_TYPES.find((item) => item.method === method);
    const targetDays = type ? String(type.target(field) || "") : "";
    return {
      method,
      date: startDate,
      fieldId: field.fieldId,
      startDate,
      endDate: endDate || "",
      actualEndDate: "",
      targetDays,
      periodStatus: "実施中",
      status: method === "稲刈り前の落水" ? "落水中" : "入水中",
      memo: memo || ""
    };
  }

  function recordAction(action) {
    const date = U.$("waterDate").value || U.today();
    const [key, mode] = String(action || "").split("-");
    const type = typeForKey(key);
    if (!type || !mode) return;
    const fields = targetFields().filter((field) => mode === "start" ? !activePeriod(field, type, date) : Boolean(activePeriod(field, type, date)));
    if (!fields.length) return;
    const verb = mode === "start" ? "開始" : "終了";
    if (!confirm(`${targetLabel()}の${fields.length}圃場へ、${U.fd(date)}に${type.label}の${verb}を記録します。`)) return;
    if (mode === "start") {
      const batchId = fields.length > 1 ? U.id("water-batch", date) : "";
      const batchFieldIds = fields.map((field) => field.fieldId);
      if (type.source === "dry") {
        state.saveDryPeriodsBatch(fields.map((field) => ({ fieldId: field.fieldId, batchId, batchFieldIds, date, startDate: date, targetDays: String(type.target(field) || ""), status: "実施中", memo: "" })), `${targetLabel()}の中干しを開始しました`);
      } else {
        state.saveIrrigationsBatch(fields.map((field) => ({ ...irrigationRecord(field, type.method, date, "", ""), batchId, batchFieldIds })), `${targetLabel()}の${type.label}を開始しました`);
      }
    } else {
      const records = fields.map((field) => {
        const active = activePeriod(field, type, date);
        return { ...active, date: active.date || active.startDate, actualEndDate: date, status: "完了", periodStatus: "完了" };
      });
      const saved = type.source === "dry" ? state.saveDryPeriodsBatch(records, `${targetLabel()}の中干しを終了しました`) : state.saveIrrigationsBatch(records, `${targetLabel()}の${type.label}を終了しました`);
      if (saved === null) return;
    }
    resetEdit();
    render();
  }

  function allHistory() {
    const ids = new Set(targetFields().map((field) => field.fieldId));
    const year = cropYear(U.$("waterDate").value || U.today());
    const dry = state.data().dryPeriods.filter((item) => ids.has(item.fieldId) && String(item.season) === year)
      .map((item) => ({ ...item, source: "dry", label: "中干し", tone: "dry" }));
    const irrigation = state.data().irrigations.filter((item) => ids.has(item.fieldId) && String(item.season) === year && /間断灌水|深水管理|稲刈り前の落水|落水|湿潤灌漑/.test(item.method || ""))
      .map((item) => ({
        ...item,
        source: "irrigation",
        label: item.method === "湿潤灌漑" ? "湿潤灌漑（旧記録）" : item.method,
        tone: item.method === "深水管理" ? "deep" : (item.method === "稲刈り前の落水" || item.method === "落水" ? "drain" : (item.method === "湿潤灌漑" ? "legacy" : "intermittent"))
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
        const start = item.startDate || item.date || "";
        const startStage = stageText(field, start);
        const endStage = end ? stageText(field, end) : "";
        return `<article class="water-history-card ${U.attr(item.tone)}"><div><span>${U.escapeHTML(item.label)}</span><b>${U.escapeHTML(field?.name || "圃場")}</b><small>${U.escapeHTML(U.fd(start))} - ${U.escapeHTML(end ? U.fd(end) : "実施中")}${days !== "" ? ` / ${days}日` : ""}</small><em>${U.escapeHTML(`開始時: ${startStage}${endStage ? ` → 完了時: ${endStage}` : ""}`)}</em></div><button type="button" data-water-edit="${U.attr(item.source)}" data-id="${U.attr(item.source === "dry" ? item.dryPeriodId : item.irrigationId)}">編集</button></article>`;
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
    focusedTypeKey = "";
    resetEdit();
    render();
  }

  function render() {
    renderOptions();
    renderFlowChart();
    const fields = targetFields();
    const states = fields.map((field) => waterState(field, U.$("waterDate").value || U.today()));
    const stateLabel = states.length && states.every((item) => item.key === states[0].key) ? states[0].label : "圃場ごとに状態が異なります";
    U.$("waterCurrentStatus").innerHTML = "";
    renderActions();
    renderHistory();
  }

  function prefillDate(date, fieldId, typeKey) {
    bulkFieldIds = [];
    U.$("waterDate").value = date || U.today();
    U.$("waterTargetMode").value = "field";
    if (fieldId) U.$("waterField").value = fieldId;
    focusedTypeKey = typeForKey(typeKey) ? typeKey : "";
    render();
    if (focusedTypeKey) {
      setTimeout(() => document.querySelector(`[data-water-type-card="${U.attr(focusedTypeKey)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    }
  }

  function prefillFields(date, fieldIds, typeKey) {
    bulkFieldIds = (fieldIds || []).filter(Boolean);
    U.$("waterDate").value = date || U.today();
    const matchingGroup = groups().find((group) => group.fields.length === bulkFieldIds.length && group.fields.every((field) => bulkFieldIds.includes(field.fieldId)));
    if (matchingGroup) {
      bulkFieldIds = [];
      U.$("waterTargetMode").value = "group";
      U.$("waterGroup").value = matchingGroup.fieldGroupId;
    } else {
      U.$("waterTargetMode").value = "field";
      if (bulkFieldIds[0]) U.$("waterField").value = bulkFieldIds[0];
    }
    focusedTypeKey = typeForKey(typeKey) ? typeKey : "";
    render();
    if (focusedTypeKey) {
      setTimeout(() => document.querySelector(`[data-water-type-card="${U.attr(focusedTypeKey)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
    }
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
