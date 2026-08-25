(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  let currentMonth = RiceOS.calendar.monthStart(U.today());
  let selectedDate = U.today();

  function scheduleDone(record) {
    return Boolean(record && (record.completedAt || record.completedByWorkId || record.status === "実施済み" || record.status === "手動完了"));
  }

  function entryStatusLabel(entry) {
    if (entry.planned) return "予定";
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "超過";
      if (entry.tone === "schedule-done") return "済";
      return "予定";
    }
    if (entry.kind === "work") return "実績";
    if (entry.kind === "growth") return "生育";
    if (entry.kind === "dry" || entry.kind === "irrigation") return "水管理";
    return "";
  }

  function markerClass(entry) {
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "mark-schedule-overdue";
      if (entry.tone === "schedule-done") return "mark-schedule-done";
      return "mark-schedule";
    }
    if (entry.kind === "growth") return "mark-growth";
    if (entry.kind === "work") return "mark-work";
    return "mark-water";
  }

  function renderDay(date) {
    const d = new Date(`${date}T00:00:00`);
    const today = date === U.today();
    const inMonth = date.slice(0, 7) === currentMonth.slice(0, 7);
    const entries = RiceOS.calendar.entriesForDate(date);
    const hasPhoto = entries.some((entry) => entry.hasPhoto);
    return `
      <button class="calendar-day ${today ? "today" : ""} ${inMonth ? "" : "muted-day"} ${entries.length ? "has-entries" : ""} ${selectedDate === date ? "selected" : ""}" data-date="${U.attr(date)}">
        <span class="day-number">${d.getDate()}</span>
        <div class="day-markers">
          ${entries.slice(0, 4).map((entry) => `<i class="${markerClass(entry)}"></i>`).join("")}
          ${hasPhoto ? '<em>写</em>' : ""}
        </div>
        ${entries.length ? `<strong class="entry-count">${entries.length}件</strong>` : ""}
      </button>
    `;
  }

  function entryHtml(entry) {
    const id = RiceOS.recordActions ? RiceOS.recordActions.idFor(entry.kind, entry.record) : "";
    const toneClass = entry.tone || "";
    const canCompleteSchedule = entry.kind === "schedule" && id && !scheduleDone(entry.record);
    const fieldId = entry.record && (entry.record.fieldId || (entry.record.fieldIds || [])[0]) || "";
    const fieldIds = entry.record && (entry.record.batchFieldIds || entry.record.fieldIds || (fieldId ? [fieldId] : [])) || [];
    const targetFields = fieldIds.map((id) => RiceOS.state.field(id)).filter(Boolean);
    const groupIds = [...new Set(targetFields.map((field) => RiceOS.state.groupForField(field)?.fieldGroupId || "").filter(Boolean))];
    const groupId = fieldIds.length > 1 && groupIds.length === 1 ? groupIds[0] : "";
    const groupName = groupId ? RiceOS.state.fieldGroup(groupId)?.name || "" : "";
    return `
      <div class="mini-card ${U.attr(entry.kind)} ${U.attr(toneClass)}">
        <b>${U.escapeHTML(entry.title)}</b>
        ${entryStatusLabel(entry) ? `<em class="mini-status ${U.attr(entry.tone || entry.kind)}">${U.escapeHTML(entryStatusLabel(entry))}</em>` : ""}
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
        ${id ? `
          <div class="record-actions mini-actions">
            ${groupName ? `<button class="secondary" type="button" data-calendar-open-group="${U.attr(groupId)}">${U.escapeHTML(groupName)}グループを見る</button>` : ""}
            ${!groupName && fieldIds.length === 1 ? `<button class="secondary" type="button" data-calendar-open-field="${U.attr(fieldId)}">圃場を見る</button>` : ""}
            ${!groupName && fieldIds.length > 1 ? '<button class="secondary" type="button" data-calendar-open-group="">対象圃場を見る</button>' : ""}
            ${canCompleteSchedule ? `<button class="primary" type="button" data-calendar-action="complete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">実施を記録</button>` : ""}
            <button class="secondary" type="button" data-calendar-action="edit" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">編集</button>
            <button class="danger" type="button" data-calendar-action="delete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">削除</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  function findEntry(kind, id) {
    return RiceOS.calendar.entriesForDate(selectedDate).find((entry) => {
      return RiceOS.recordActions && RiceOS.recordActions.idFor(entry.kind, entry.record) === id && entry.kind === kind;
    });
  }

  function renderSelected() {
    U.$("selectedDateTitle").textContent = `${U.fd(selectedDate)} の記録`;
    const entries = RiceOS.calendar.entriesForDate(selectedDate);
    const meta = U.$("selectedDateMeta");
    if (meta) {
      meta.textContent = entries.length ? `${entries.length}件を確認中` : "この日に記録を追加できます";
    }
    const target = U.$("selectedDateEntries");
    if (!target) return;
    const plans = entries.filter((entry) => entry.planned || (entry.kind === "schedule" && !scheduleDone(entry.record)));
    const actuals = entries.filter((entry) => !(entry.planned || (entry.kind === "schedule" && !scheduleDone(entry.record))));
    target.innerHTML = `
      ${plans.length ? `<section class="calendar-entry-group plan"><h4>予定 <span>${plans.length}件</span></h4>${plans.map(entryHtml).join("")}</section>` : ""}
      ${actuals.length ? `<section class="calendar-entry-group actual"><h4>実績 <span>${actuals.length}件</span></h4>${actuals.map(entryHtml).join("")}</section>` : ""}
      ${entries.length ? "" : '<p class="calendar-empty-day">この日の予定・実績はまだありません。</p>'}
    `;
  }

  function render() {
    U.$("calendarTitle").textContent = RiceOS.calendar.monthLabel(currentMonth);
    U.$("calendarGrid").innerHTML = `
      ${["日", "月", "火", "水", "木", "金", "土"].map((d) => `<div class="calendar-week">${d}</div>`).join("")}
      ${RiceOS.calendar.daysForMonth(currentMonth).map(renderDay).join("")}
    `;
    renderSelected();
  }

  function focusDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
    currentMonth = RiceOS.calendar.monthStart(date);
    selectedDate = date;
    render();
  }

  function bind() {
    U.$("calendarGrid").addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      if (!day) return;
      selectedDate = day.dataset.date;
      render();
    });
    const openSelected = U.$("selectedDateSummary");
    if (openSelected) openSelected.addEventListener("click", (event) => {
      const action = event.target.closest("[data-calendar-action]");
      if (action) {
        const entry = findEntry(action.dataset.kind, action.dataset.id);
        if (!entry) return;
        if (action.dataset.calendarAction === "complete" && entry.kind === "schedule") {
          if (entry.record.recordKind === "water" && RiceOS.bottomSheet && RiceOS.bottomSheet.openScheduleCompletion) {
            RiceOS.bottomSheet.openScheduleCompletion(entry.record);
            return;
          }
          RiceOS.state.completeSchedule(action.dataset.id);
          render();
          return;
        }
        if (action.dataset.calendarAction === "edit" && RiceOS.recordActions) {
          RiceOS.recordActions.edit(entry.kind, entry.record, { originScreen: "calendar" });
          return;
        }
        if (action.dataset.calendarAction === "delete" && RiceOS.recordActions) {
          RiceOS.recordActions.remove(entry.kind, entry.record);
          render();
          return;
        }
      }
      const fieldButton = event.target.closest("[data-calendar-open-field]");
      if (fieldButton) {
        const fieldId = fieldButton.dataset.calendarOpenField;
        if (fieldId && RiceOS.navigation && RiceOS.navigation.openField) {
          RiceOS.navigation.openField(fieldId, { originScreen: "calendar" });
          return;
        }
      }
      const groupButton = event.target.closest("[data-calendar-open-group]");
      if (groupButton && RiceOS.screens.fields && RiceOS.screens.fields.openGroup) {
        if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
        if (RiceOS.app) RiceOS.app.show("fields");
        RiceOS.screens.fields.openGroup(groupButton.dataset.calendarOpenGroup || "");
        return;
      }
      if (!event.target.closest("[data-calendar-open-selected]")) return;
      if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(selectedDate);
    });
    document.querySelectorAll("[data-calendar-move]").forEach((button) => {
      button.addEventListener("click", () => {
        currentMonth = RiceOS.calendar.addMonths(currentMonth, Number(button.dataset.calendarMove));
        render();
      });
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.calendar = { render, bind, focusDate };
})();
