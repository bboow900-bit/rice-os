(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  function card(row) {
    return `
      <div class="mini-card ${U.attr(row.kind || "")}">
        <b>${U.escapeHTML(row.title || "")}</b>
        <span>${U.escapeHTML(row.subtitle || "")}</span>
        ${row.date ? `<small>${U.escapeHTML(U.fd(row.date))}</small>` : ""}
        ${row.memo ? `<small>${U.escapeHTML(row.memo)}</small>` : ""}
        ${row.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
      </div>
    `;
  }

  function renderKpis() {
    const area = state.fields().reduce((sum, field) => sum + U.number(field.areaA), 0);
    U.$("homeKpis").innerHTML = [
      ["管理面積", `${Math.round(area * 10) / 10}a`, "ok"],
      ["圃場数", `${state.fields().length}枚`, "info"],
      ["品種数", `${state.varieties().length}品種`, "purple"]
    ].map(([label, value, tone]) => `
      <div class="kpi">
        <div class="label">${U.escapeHTML(label)}</div>
        <div class="value"><span class="pill ${tone}">${U.escapeHTML(value)}</span></div>
      </div>
    `).join("");
  }

  function renderSchedule() {
    const rows = RiceOS.calendar.upcomingSchedules(6).map((schedule) => ({
      title: schedule.title || schedule.scheduleType,
      subtitle: RiceOS.calendar.fieldNames(schedule.fieldIds),
      date: schedule.date,
      memo: schedule.memo || schedule.status,
      kind: "schedule"
    }));
    U.$("homeScheduleCount").textContent = rows.length ? `${rows.length}件` : "";
    U.$("todaySchedule").innerHTML = rows.length ? rows.map(card).join("") : '<div class="empty">今日以降の予定はまだありません。</div>';
  }

  function renderRecent() {
    const rows = RiceOS.calendar.recentEntries(6);
    U.$("recentActivity").innerHTML = rows.length ? rows.map(card).join("") : '<div class="empty">最近の記録はまだありません。</div>';
  }

  function renderLastYear() {
    const result = RiceOS.calendar.lastYearSamePeriod(10);
    U.$("homeLastYearRange").textContent = `${U.fd(result.range.start)} - ${U.fd(result.range.end)}`;
    U.$("lastYearSame").innerHTML = result.rows.length ? result.rows.slice(0, 6).map(card).join("") : '<div class="empty">去年同時期の記録はありません。</div>';
  }

  function renderPhotoCompare() {
    const comparison = RiceOS.calendar.photoCompare();
    function photoBlock(label, log) {
      if (!log) return `<div class="photo-slot empty-slot"><b>${label}</b><span>写真なし</span></div>`;
      const field = state.field(log.fieldId);
      return `
        <div class="photo-slot">
          <b>${label}</b>
          ${log.photoData ? `<img src="${U.attr(log.photoData)}" alt="">` : ""}
          <span>${U.escapeHTML(U.fd(log.date))} ${U.escapeHTML(field && field.name || "")}</span>
        </div>
      `;
    }
    U.$("homePhotoCompare").innerHTML = photoBlock("今年", comparison.thisYear) + '<div class="compare-arrow">↓</div>' + photoBlock("去年", comparison.lastYear);
  }

  function render() {
    renderKpis();
    renderSchedule();
    renderRecent();
    renderLastYear();
    renderPhotoCompare();
  }

  function bind() {}

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.home = { render, bind };
})();
