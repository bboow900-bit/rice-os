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
    return `
      <div class="mini-card ${U.attr(entry.kind)} ${U.attr(toneClass)}">
        <b>${U.escapeHTML(entry.title)}</b>
        ${entryStatusLabel(entry) ? `<em class="mini-status ${U.attr(entry.tone || entry.kind)}">${U.escapeHTML(entryStatusLabel(entry))}</em>` : ""}
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
        ${id ? `
          <div class="record-actions mini-actions">
            ${canCompleteSchedule ? `<button class="primary" type="button" data-calendar-action="complete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">実施済み</button>` : ""}
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
    const field = RiceOS.state.activeFields()[0] || RiceOS.state.fields()[0] || null;
    const progress = field && RiceOS.agro ? RiceOS.agro.progress(field, selectedDate) : null;
    if (U.$("selectedDateProgress")) {
      U.$("selectedDateProgress").innerHTML = progress ? `
        <span>${U.escapeHTML(field.name)}</span>
        <b>${U.escapeHTML(progress.dap === "" ? "田植日未設定" : `田植後 ${progress.dap}日`)}</b>
        <b>積算気温 ${U.escapeHTML(progress.tempText)}</b>
      ` : "";
    }
    U.$("selectedDateEntries").innerHTML = entries.length ? entries.map(entryHtml).join("") : '<div class="empty">この日の記録はまだありません。</div>';
  }

  function render() {
    U.$("calendarTitle").textContent = RiceOS.calendar.monthLabel(currentMonth);
    U.$("calendarGrid").innerHTML = `
      ${["日", "月", "火", "水", "木", "金", "土"].map((d) => `<div class="calendar-week">${d}</div>`).join("")}
      ${RiceOS.calendar.daysForMonth(currentMonth).map(renderDay).join("")}
    `;
    renderSelected();
  }

  function bind() {
    U.$("calendarGrid").addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      if (!day) return;
      selectedDate = day.dataset.date;
      render();
      if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(selectedDate);
    });
    U.$("selectedDateEntries").addEventListener("click", (event) => {
      const button = event.target.closest("[data-calendar-action]");
      if (!button || !RiceOS.recordActions) return;
      const entry = findEntry(button.dataset.kind, button.dataset.id);
      if (!entry) return;
      if (button.dataset.calendarAction === "complete" && entry.kind === "schedule") {
        if (String(entry.record.title || entry.record.scheduleType || "").includes("追肥") && RiceOS.screens.fertilizer) {
          RiceOS.screens.fertilizer.open(entry.record, render);
          return;
        }
        RiceOS.state.completeSchedule(entry.record.scheduleId);
        render();
        return;
      }
      if (button.dataset.calendarAction === "edit") {
        RiceOS.recordActions.edit(entry.kind, entry.record);
        render();
      }
      if (button.dataset.calendarAction === "delete") {
        if (RiceOS.recordActions.remove(entry.kind, entry.record)) render();
      }
    });
    document.querySelectorAll("[data-calendar-move]").forEach((button) => {
      button.addEventListener("click", () => {
        currentMonth = RiceOS.calendar.addMonths(currentMonth, Number(button.dataset.calendarMove));
        render();
      });
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.calendar = { render, bind };
})();
