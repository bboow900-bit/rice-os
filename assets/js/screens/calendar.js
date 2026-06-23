(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  let currentMonth = RiceOS.calendar.monthStart(U.today());
  let selectedDate = U.today();

  function markerClass(entry) {
    if (entry.kind === "schedule") return "mark-schedule";
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
      <button class="calendar-day ${today ? "today" : ""} ${inMonth ? "" : "muted-day"} ${selectedDate === date ? "selected" : ""}" data-date="${U.attr(date)}">
        <span>${d.getDate()}</span>
        <div class="day-markers">
          ${entries.slice(0, 4).map((entry) => `<i class="${markerClass(entry)}"></i>`).join("")}
          ${hasPhoto ? '<em>📷</em>' : ""}
        </div>
      </button>
    `;
  }

  function entryHtml(entry) {
    return `
      <div class="mini-card ${U.attr(entry.kind)}">
        <b>${U.escapeHTML(entry.title)}</b>
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
      </div>
    `;
  }

  function renderSelected() {
    U.$("selectedDateTitle").textContent = `${U.fd(selectedDate)} の記録`;
    const entries = RiceOS.calendar.entriesForDate(selectedDate);
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
