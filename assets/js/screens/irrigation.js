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

  function observedHeadingDate(fieldId) {
    return state.growthLogsFor(fieldId)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .find((log) => log.headingObserved)?.date || "";
  }

  function latestWaterRecord(fieldId) {
    return (state.data().irrigations || [])
      .filter((item) => item.fieldId === fieldId)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function waterStage(field, date) {
    const planting = field && state.plantingDateForField(field.fieldId);
    if (!field || !planting) return { key: "waiting", label: "田植え日を待機", detail: "田植え作業を登録すると、水管理の目安を表示します。" };
    const heading = observedHeadingDate(field.fieldId);
    const dap = U.daysAfterPlanting(field, date);
    if (!field.drainageStartDate) return { key: "tillering", label: "活着・分げつ期", detail: `田植後${dap}日。中干し前の水管理と分げつを現地確認。` };
    if (!field.drainageActualEndDate) return { key: "drying", label: "中干し中", detail: "ひび割れ幅・足の沈み込み・天気を見て完了時期を確認。" };
    if (!heading) return { key: "intermittent", label: "中干し後・間断灌水", detail: "走り水から間断灌水へ。土質・水持ちを見ながら現地確認。" };
    const dah = U.daysBetween(heading, date);
    if (dah <= 3) return { key: "heading", label: "出穂前後", detail: "出穂前後は水を切らさないか、圃場の状態を確認。" };
    if (dah <= 30) return { key: "filling", label: "登熟期・間断灌水", detail: `出穂後${dah}日。乾かし過ぎを避け、天気と田面を確認。` };
    return { key: "drainage", label: "落水時期の確認", detail: `出穂後${dah}日。収穫予定・田面・天気を見て落水時期を確認。` };
  }

  function renderWaterStageNavigator() {
    const el = U.$("waterStageNavigator");
    if (!el) return;
    const field = currentField();
    const stage = waterStage(field, U.$("irrigationDate").value || U.today());
    const recent = field ? latestWaterRecord(field.fieldId) : null;
    const facts = [
      field && field.soilType ? `土質 ${field.soilType}` : "土質 未設定",
      field && field.waterHolding ? `水持ち ${field.waterHolding}` : "水持ち 未設定",
      recent ? `直近 ${recent.method || "水管理"} ${U.fd(recent.date)}` : "水管理記録 なし"
    ];
    el.innerHTML = `
      <section class="water-stage-card ${U.attr(stage.key)}">
        <div class="water-stage-top"><span>水管理の現在地</span><b>${U.escapeHTML(stage.label)}</b></div>
        <p>${U.escapeHTML(field && field.name || "圃場を選択")}</p>
        <strong>${U.escapeHTML(stage.detail)}</strong>
        <div class="water-stage-facts">${facts.map((fact) => `<span>${U.escapeHTML(fact)}</span>`).join("")}</div>
        <small>目安です。実際の水管理は田面・天気・生育を見て判断してください。</small>
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
    U.$("irrigationHeading").textContent = "間断灌水/湿潤灌漑";
    U.$("editIrrigationId").value = "";
    U.$("irrigationDate").value = U.today();
    U.$("irrigationMethod").value = "間断灌水";
    U.$("irrigationField").value = field ? field.fieldId : "";
    U.$("irrigationStartDate").value = field && field.intermittentStartDate || U.today();
    U.$("irrigationTargetDays").value = field && field.intermittentIntervalDays || "3";
    U.$("irrigationEndDate").value = "";
    setEndFromDays();
    U.$("irrigationActualEndDate").value = "";
    U.$("irrigationPeriodStatus").value = "実施中";
    U.$("irrigationStatus").value = "入水中";
    U.$("irrigationMemo").value = "";
    clearBulkFields();
    renderWaterStageNavigator();
  }

  function renderOptions() {
    const fieldValue = U.$("irrigationField").value || firstFieldId();
    U.setOptions(U.$("irrigationMethod"), S.IRRIGATION_TYPES, U.$("irrigationMethod").value || "間断灌水");
    U.setOptions(U.$("irrigationField"), state.activeFields().map((field) => ({ value: field.fieldId, label: field.name })), fieldValue);
    U.setOptions(U.$("irrigationPeriodStatus"), S.WATER_PERIOD_STATUS, U.$("irrigationPeriodStatus").value || "実施中");
    U.setOptions(U.$("irrigationStatus"), S.IRRIGATION_STATUS, U.$("irrigationStatus").value || "入水中");
  }

  function fillEdit(item) {
    U.$("irrigationHeading").textContent = "間断灌水/湿潤灌漑を編集";
    U.$("editIrrigationId").value = item.irrigationId;
    U.$("irrigationMethod").value = item.method || "間断灌水";
    U.$("irrigationField").value = item.fieldId;
    U.$("irrigationDate").value = item.date;
    U.$("irrigationStartDate").value = item.startDate || "";
    U.$("irrigationEndDate").value = item.endDate || "";
    U.$("irrigationActualEndDate").value = item.actualEndDate || "";
    U.$("irrigationTargetDays").value = item.targetDays || "";
    U.$("irrigationPeriodStatus").value = item.periodStatus || (item.actualEndDate ? "完了" : "実施中");
    U.$("irrigationStatus").value = item.status || "入水中";
    U.$("irrigationMemo").value = item.memo || "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList() {
    const rows = (state.data().irrigations || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
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
              <span class="pill info">${U.escapeHTML(item.status || "-")}</span>
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
            ${item.memo ? `<div>${U.escapeHTML(item.memo)}</div>` : ""}
          </div>
          <div class="record-actions">
            <button class="secondary" data-irrigation-action="edit" data-id="${U.attr(item.irrigationId)}">編集</button>
            <button class="danger" data-irrigation-action="delete" data-id="${U.attr(item.irrigationId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">水管理の記録はまだありません。</div>';
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
    if (item) fillEdit(item);
  }

  function bind() {
    U.$("irrigationForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const common = {
        irrigationId: U.$("editIrrigationId").value,
        method: U.$("irrigationMethod").value,
        date: U.$("irrigationDate").value,
        startDate: U.$("irrigationStartDate").value,
        endDate: U.$("irrigationEndDate").value,
        actualEndDate: U.$("irrigationActualEndDate").value,
        targetDays: U.$("irrigationTargetDays").value,
        periodStatus: U.$("irrigationPeriodStatus").value,
        status: U.$("irrigationStatus").value,
        memo: U.$("irrigationMemo").value
      };
      const targets = !common.irrigationId && bulkFieldIds.length > 1 ? bulkFieldIds : [U.$("irrigationField").value];
      targets.forEach((fieldId) => state.saveIrrigation({
        ...common,
        irrigationId: targets.length > 1 ? "" : common.irrigationId,
        fieldId
      }));
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
    U.$("irrigationDate").addEventListener("change", renderWaterStageNavigator);
    document.querySelector('[data-action="reset-irrigation"]').addEventListener("click", resetForm);
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.irrigation = { render, bind, resetForm, prefillDate, prefillFields, editIrrigation };
})();
