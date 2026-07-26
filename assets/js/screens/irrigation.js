(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;
  let bulkFieldIds = [];

  function setBulkFields(ids) {
    bulkFieldIds = (ids || []).filter(Boolean);
  }

  function clearBulkFields() {
    bulkFieldIds = [];
  }

  function firstFieldId() {
    const field = state.activeFields()[0] || state.fields()[0];
    return field ? field.fieldId : "";
  }

  function currentField() {
    return state.field(U.$("irrigationField").value) || state.field(firstFieldId());
  }

  function cropYear(dateText) {
    return String(dateText || U.today()).slice(0, 4);
  }

  function recordYear(item) {
    const date = item && (item.date || item.startDate || item.actualEndDate || item.endDate || item.plannedStartDate);
    return date ? String(date).slice(0, 4) : "";
  }

  function isIntermittentRecord(item) {
    return (item && item.method || "間断灌水") === "間断灌水";
  }

  function latestWaterRecord(fieldId, year) {
    return (state.irrigationsFor ? state.irrigationsFor(fieldId, year) : [])
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function waterStage(field, date) {
    const year = cropYear(date);
    const planting = field && state.plantingDateForField(field.fieldId, year);
    if (!field || !planting) return { key: "waiting", label: "水管理", detail: "今年度の田植日が未登録です。" };
    const dryPeriod = (state.dryPeriodsFor ? state.dryPeriodsFor(field.fieldId, year) : [])
      .filter((item) => item.startDate || item.endDate || item.actualEndDate)
      .slice()
      .sort((a, b) => String(b.date || b.actualEndDate || b.startDate).localeCompare(String(a.date || a.actualEndDate || a.startDate)))[0] || null;
    const dryStart = dryPeriod && dryPeriod.startDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し開始"], "first", year) : "");
    const dryEnd = dryPeriod && dryPeriod.endDate || "";
    const dryActualEnd = dryPeriod && dryPeriod.actualEndDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し終了"], "first", year) : "");
    if (!dryStart) return { key: "waiting", label: "中干し", detail: "今年度の中干し期間は未登録です。" };
    if (!dryActualEnd) return { key: "drying", label: "中干し", detail: dryEnd ? `実施中: ${U.fd(dryStart)} - ${U.fd(dryEnd)}` : `実施中: 開始 ${U.fd(dryStart)} / 終了未登録` };
    const irrigation = latestWaterRecord(field.fieldId, year);
    if (!irrigation || !irrigation.startDate) return { key: "intermittent", label: "間断灌水", detail: `未記録: 中干し完了 ${U.fd(dryActualEnd)}` };
    const irrigationEnd = irrigation.actualEndDate || irrigation.endDate || "";
    const irrigationState = irrigation.actualEndDate ? "完了" : (irrigation.periodStatus || irrigation.status || "実施中");
    return { key: "intermittent", label: "間断灌水", detail: irrigationEnd ? `${irrigationState}: ${U.fd(irrigation.startDate)} - ${U.fd(irrigationEnd)}` : `${irrigationState}: 開始 ${U.fd(irrigation.startDate)} / 終了未登録` };
  }

  function renderWaterStageNavigator() {
    const el = U.$("waterStageNavigator");
    if (!el) return;
    const field = currentField();
    const stage = waterStage(field, U.$("irrigationDate").value || U.today());
    el.innerHTML = `
      <section class="water-stage-card ${U.attr(stage.key)}">
        <div class="water-stage-top"><span>水管理の現在地</span><b>${U.escapeHTML(stage.label)}</b></div>
        <p>${U.escapeHTML(field && field.name || "圃場を選択")}</p>
        <strong>${U.escapeHTML(stage.detail)}</strong>
      </section>
    `;
  }

  function setEndFromDays() {
    const start = U.$("irrigationStartDate").value;
    const days = U.number(U.$("irrigationTargetDays").value, 0);
    if (start && days > 0) {
      U.$("irrigationEndDate").value = U.dateAddDays(start, days);
    }
  }

  function setDaysFromEnd() {
    const start = U.$("irrigationStartDate").value;
    const end = U.$("irrigationEndDate").value;
    const days = U.daysBetween(start, end);
    if (days !== "" && days >= 0) U.$("irrigationTargetDays").value = String(days);
  }

  function periodStats(startDate, plannedEndDate, actualEndDate) {
    const planned = startDate && plannedEndDate ? U.daysBetween(startDate, plannedEndDate) : "";
    const actual = startDate && actualEndDate ? U.daysBetween(startDate, actualEndDate) : "";
    const diff = planned !== "" && actual !== "" ? actual - planned : "";
    return { planned, actual, diff };
  }

  function diffLabel(diff) {
    if (diff === "") return "";
    if (diff === 0) return "予定どおり";
    return diff > 0 ? `+${diff}日` : `${diff}日`;
  }

  function resetForm() {
    const field = state.field(firstFieldId());
    U.$("irrigationHeading").textContent = "間断灌水";
    U.$("editIrrigationId").value = "";
    U.$("irrigationDate").value = U.today();
    U.$("irrigationMethod").value = "間断灌水";
    U.$("irrigationField").value = field ? field.fieldId : "";
    U.$("irrigationPlannedStartDate").value = "";
    U.$("irrigationStartDate").value = field && field.intermittentStartDate || U.today();
    U.$("irrigationTargetDays").value = field && field.intermittentIntervalDays || "3";
    U.$("irrigationEndDate").value = "";
    setEndFromDays();
    U.$("irrigationActualEndDate").value = "";
    U.$("irrigationPeriodStatus").value = "実施中";
    U.$("irrigationStatus").value = "入水中";
    U.$("irrigationStartReason").value = "";
    U.$("irrigationStartTillerCount").value = "";
    U.$("irrigationStartLeafColor").value = "";
    U.$("irrigationStartSurface").value = "";
    U.$("irrigationEndSurface").value = "";
    U.$("irrigationInterruptionDays").value = "";
    U.$("irrigationObservationSummary").value = "";
    U.$("irrigationMemo").value = "";
    clearBulkFields();
    renderWaterStageNavigator();
  }

  function renderOptions() {
    const fieldValue = U.$("irrigationField").value || firstFieldId();
    // Keep legacy water records intact, but make new records and this UI interval-irrigation only.
    U.setOptions(U.$("irrigationMethod"), ["間断灌水"], "間断灌水");
    U.setOptions(U.$("irrigationField"), state.activeFields().map((field) => ({ value: field.fieldId, label: field.name })), fieldValue);
    U.setOptions(U.$("irrigationPeriodStatus"), S.WATER_PERIOD_STATUS, U.$("irrigationPeriodStatus").value || "実施中");
    U.setOptions(U.$("irrigationStatus"), ["入水中"], "入水中");
  }

  function fillEdit(item) {
    U.$("irrigationHeading").textContent = "間断灌水を編集";
    U.$("editIrrigationId").value = item.irrigationId;
    U.$("irrigationMethod").value = item.method || "間断灌水";
    U.$("irrigationField").value = item.fieldId;
    U.$("irrigationDate").value = item.date;
    U.$("irrigationPlannedStartDate").value = item.plannedStartDate || "";
    U.$("irrigationStartDate").value = item.startDate || "";
    U.$("irrigationEndDate").value = item.endDate || "";
    U.$("irrigationActualEndDate").value = item.actualEndDate || "";
    U.$("irrigationTargetDays").value = item.targetDays || "";
    U.$("irrigationPeriodStatus").value = item.periodStatus || (item.actualEndDate ? "完了" : "実施中");
    U.$("irrigationStatus").value = item.status || "入水中";
    U.$("irrigationStartReason").value = item.startReason || "";
    U.$("irrigationStartTillerCount").value = item.startTillerCount || "";
    U.$("irrigationStartLeafColor").value = item.startLeafColor || "";
    U.$("irrigationStartSurface").value = item.startSurface || "";
    U.$("irrigationEndSurface").value = item.endSurface || "";
    U.$("irrigationInterruptionDays").value = item.interruptionDays || "";
    U.$("irrigationObservationSummary").value = item.observationSummary || "";
    U.$("irrigationMemo").value = item.memo || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList() {
    const displayedYear = cropYear(U.$("irrigationDate").value || U.today());
    const rows = (state.data().irrigations || [])
      .filter((item) => recordYear(item) === displayedYear)
      .filter(isIntermittentRecord)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 60);
    U.$("irrigationList").innerHTML = rows.length ? rows.map((item) => {
      const field = state.field(item.fieldId);
      const elapsed = item.startDate ? U.daysBetween(item.startDate, item.date) : "";
      const remaining = item.endDate ? U.daysBetween(item.date, item.endDate) : "";
      const stats = periodStats(item.startDate, item.endDate, item.actualEndDate);
      const method = item.method || "間断灌水";
      return `
        <article class="record water-record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(U.fd(item.date))} ${U.escapeHTML(method)}</b><br>
              <span class="pill info">${U.escapeHTML(field && field.name || "圃場")}</span>
              <span class="pill ok">${U.escapeHTML(item.periodStatus || (item.actualEndDate ? "完了" : "実施中"))}</span>
              ${elapsed !== "" ? `<span class="pill purple">${U.escapeHTML(String(elapsed))}日目</span>` : ""}
              ${remaining !== "" ? `<span class="pill warn">終了目安まで${U.escapeHTML(String(remaining))}日</span>` : ""}
              ${stats.actual !== "" ? `<span class="pill purple">予定${U.escapeHTML(String(stats.planned))}日 / 実績${U.escapeHTML(String(stats.actual))}日 / ${U.escapeHTML(diffLabel(stats.diff))}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            <div class="metric-row">
              <span>開始 <b>${U.escapeHTML(U.fd(item.startDate) || "-")}</b></span>
              <span>終了予定 <b>${U.escapeHTML(U.fd(item.endDate) || "-")}</b></span>
              <span>実完了 <b>${U.escapeHTML(U.fd(item.actualEndDate) || "-")}</b></span>
              <span>予定日数 <b>${U.escapeHTML(item.targetDays || "-")}</b></span>
            </div>
            ${item.startReason ? `<div><b>開始理由</b> ${U.escapeHTML(item.startReason)}</div>` : ""}
            ${item.observationSummary ? `<div><b>観察</b> ${U.escapeHTML(item.observationSummary)}</div>` : ""}
            ${item.interruptionDays ? `<div><b>差し水・中断</b> ${U.escapeHTML(String(item.interruptionDays))}日</div>` : ""}
            ${item.memo ? `<div>${U.escapeHTML(item.memo)}</div>` : ""}
          </div>
          <div class="record-actions">
            <button class="secondary" data-irrigation-action="edit" data-id="${U.attr(item.irrigationId)}">編集</button>
            <button class="danger" data-irrigation-action="delete" data-id="${U.attr(item.irrigationId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : `<div class="empty">${U.escapeHTML(displayedYear)}年の間断灌水記録はまだありません。</div>`;
  }

  function render() {
    renderOptions();
    renderWaterStageNavigator();
    renderList();
  }

  function prefillDate(date, fieldId) {
    resetForm();
    U.$("irrigationDate").value = date || U.today();
    if (fieldId) U.$("irrigationField").value = fieldId;
    const field = currentField();
    if (field) {
      U.$("irrigationStartDate").value = field.intermittentStartDate || U.$("irrigationStartDate").value;
      U.$("irrigationTargetDays").value = field.intermittentIntervalDays || U.$("irrigationTargetDays").value;
      setEndFromDays();
    }
  }

  function prefillFields(date, fieldIds) {
    resetForm();
    U.$("irrigationDate").value = date || U.today();
    setBulkFields(fieldIds || []);
    if (bulkFieldIds[0]) U.$("irrigationField").value = bulkFieldIds[0];
    const field = currentField();
    if (field) {
      U.$("irrigationStartDate").value = field.intermittentStartDate || U.$("irrigationStartDate").value;
      U.$("irrigationTargetDays").value = field.intermittentIntervalDays || U.$("irrigationTargetDays").value;
      setEndFromDays();
    }
    U.toast(`${bulkFieldIds.length}圃場へ同じ水管理記録を登録します`);
  }

  function editIrrigation(irrigationId) {
    const item = (state.data().irrigations || []).find((row) => row.irrigationId === irrigationId);
    if (item && isIntermittentRecord(item)) fillEdit(item);
  }

  function bind() {
    U.$("irrigationForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const common = {
        irrigationId: U.$("editIrrigationId").value,
        method: U.$("irrigationMethod").value,
        date: U.$("irrigationDate").value,
        plannedStartDate: U.$("irrigationPlannedStartDate").value,
        startDate: U.$("irrigationStartDate").value,
        endDate: U.$("irrigationEndDate").value,
        actualEndDate: U.$("irrigationActualEndDate").value,
        targetDays: U.$("irrigationTargetDays").value,
        periodStatus: U.$("irrigationPeriodStatus").value,
        status: U.$("irrigationStatus").value,
        startReason: U.$("irrigationStartReason").value,
        startTillerCount: U.$("irrigationStartTillerCount").value,
        startLeafColor: U.$("irrigationStartLeafColor").value,
        startSurface: U.$("irrigationStartSurface").value,
        endSurface: U.$("irrigationEndSurface").value,
        interruptionDays: U.$("irrigationInterruptionDays").value,
        observationSummary: U.$("irrigationObservationSummary").value,
        memo: U.$("irrigationMemo").value
      };
      const targets = !common.irrigationId && bulkFieldIds.length > 1 ? bulkFieldIds : [U.$("irrigationField").value];
      for (const fieldId of targets) {
        const saved = state.saveIrrigation({
          ...common,
          irrigationId: targets.length > 1 ? "" : common.irrigationId,
          fieldId
        });
        if (saved === null) return;
      }
      resetForm();
    });

    U.$("irrigationList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-irrigation-action]");
      if (!button) return;
      const id = button.dataset.id;
      const item = (state.data().irrigations || []).find((row) => row.irrigationId === id);
      if (!item) return;
      if (button.dataset.irrigationAction === "delete") {
        if (confirm("この水管理記録を削除しますか？")) state.deleteIrrigation(id);
        return;
      }
      fillEdit(item);
    });

    ["irrigationStartDate", "irrigationTargetDays"].forEach((id) => U.$(id).addEventListener("change", setEndFromDays));
    U.$("irrigationEndDate").addEventListener("change", setDaysFromEnd);
    U.$("irrigationActualEndDate").addEventListener("change", () => {
      if (U.$("irrigationActualEndDate").value) U.$("irrigationPeriodStatus").value = "完了";
    });
    U.$("irrigationField").addEventListener("change", () => {
      const field = currentField();
      if (field && !U.$("editIrrigationId").value) {
        U.$("irrigationStartDate").value = field.intermittentStartDate || U.$("irrigationStartDate").value;
        U.$("irrigationTargetDays").value = field.intermittentIntervalDays || U.$("irrigationTargetDays").value;
        setEndFromDays();
      }
      renderWaterStageNavigator();
    });
    U.$("irrigationDate").addEventListener("change", () => {
      renderWaterStageNavigator();
      renderList();
    });
    document.querySelector('[data-action="reset-irrigation"]').addEventListener("click", resetForm);
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.irrigation = { render, bind, resetForm, prefillDate, prefillFields, editIrrigation };
})();
