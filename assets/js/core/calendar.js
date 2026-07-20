(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  function state() {
    return RiceOS.state;
  }

  function monthStart(dateText) {
    const d = U.localDate ? U.localDate(dateText) : new Date(`${dateText}T00:00:00`);
    if (!d || Number.isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function addMonths(monthText, diff) {
    const d = new Date(`${monthText || monthStart(U.today())}T00:00:00`);
    d.setMonth(d.getMonth() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }

  function monthLabel(monthText) {
    const d = new Date(`${monthText}T00:00:00`);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  function daysForMonth(monthText) {
    const first = new Date(`${monthText}T00:00:00`);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const days = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return days;
  }

  function fieldNames(ids) {
    return (ids || []).map((id) => state().field(id) && state().field(id).name).filter(Boolean).join("・");
  }

  function fieldName(id) {
    return state().field(id) && state().field(id).name || "";
  }

  function isScheduleDone(schedule) {
    return Boolean(schedule && (schedule.completedAt || schedule.completedByWorkId || schedule.status === "実施済み" || schedule.status === "手動完了"));
  }

  function scheduleDisplayStatus(schedule) {
    if (isScheduleDone(schedule)) return schedule.status || "実施済み";
    if (schedule && schedule.date < U.today()) return "期限超過";
    return schedule && schedule.status || "予定";
  }

  function scheduleCompletionMemo(schedule) {
    if (!schedule || !isScheduleDone(schedule)) return "";
    if (schedule.completionReason) return schedule.completionReason;
    if (schedule.completedByWorkId) {
      const work = (state().data().fieldWorks || []).find((item) => item.workId === schedule.completedByWorkId);
      if (work) return `${work.workName || "作業"} ${U.fd(work.date)} の記録により完了`;
    }
    if (schedule.completedManuallyAt) return "手動で実施済みにしました";
    return "実施済み";
  }

  function entriesForDate(date) {
    const d = state().data();
    const entries = [];
    (d.schedules || []).filter((x) => x.date === date).forEach((x) => {
      const displayStatus = scheduleDisplayStatus(x);
      entries.push({
        kind: "schedule",
        tone: displayStatus === "期限超過" ? "schedule-overdue" : (isScheduleDone(x) ? "schedule-done" : "schedule"),
        title: x.title || x.scheduleType || "予定",
        subtitle: fieldNames(x.fieldIds),
        memo: [displayStatus, scheduleCompletionMemo(x), x.memo || ""].filter(Boolean).join(" / "),
        record: x
      });
    });
    d.fieldWorks.filter((x) => x.date === date).forEach((x) => {
      entries.push({
        kind: "work",
        tone: "work",
        title: x.workName,
        subtitle: fieldNames(x.fieldIds),
        memo: [x.worker ? `作業者:${x.worker}` : "", x.hours ? `時間:${x.hours}` : "", x.material || ""].filter(Boolean).join(" / "),
        record: x
      });
    });
    d.growthLogs.filter((x) => x.date === date).forEach((x) => {
      entries.push({
        kind: "growth",
        tone: "growth",
        title: "生育ログ",
        subtitle: fieldName(x.fieldId),
        memo: [`葉数:${x.leafCount || "-"}`, `分げつ:${x.tillerCount || "-"}`, `草丈:${x.plantHeightCm || "-"}`, `幼穂:${x.panicleLengthMm ? `${x.panicleLengthMm}mm` : "-"}`, `葉色:${x.leafColor || "-"}`].join(" / "),
        hasPhoto: Boolean(x.photoData || x.photo),
        record: x
      });
    });
    (d.dryPeriods || []).filter((x) => x.date === date || x.startDate === date || x.endDate === date || x.actualEndDate === date).forEach((x) => {
      entries.push({
        kind: "dry",
        tone: "water",
        title: "中干し",
        subtitle: fieldName(x.fieldId),
        memo: [`ひび:${x.crackCm || "-"}cm`, `沈み:${x.sinkCm || "-"}cm`, x.surface || ""].filter(Boolean).join(" / "),
        hasPhoto: Boolean(x.photoData || x.photo),
        record: x
      });
    });
    (d.irrigations || []).filter((x) => x.date === date || x.startDate === date || x.endDate === date || x.actualEndDate === date).forEach((x) => {
      entries.push({
        kind: "irrigation",
        tone: "water",
        title: x.method || "間断灌水",
        subtitle: fieldName(x.fieldId),
        memo: [x.periodStatus || "", x.status || ""].filter(Boolean).join(" / "),
        record: x
      });
    });
    return entries;
  }

  function recentEntries(limit) {
    const d = state().data();
    const entries = [
      ...d.fieldWorks.map((x) => ({ date: x.date, title: x.workName, subtitle: fieldNames(x.fieldIds), kind: "work", record: x })),
      ...d.growthLogs.map((x) => ({ date: x.date, title: "生育ログ", subtitle: fieldName(x.fieldId), kind: "growth", hasPhoto: Boolean(x.photoData || x.photo), record: x })),
      ...(d.dryPeriods || []).map((x) => ({ date: x.date, title: "中干し", subtitle: fieldName(x.fieldId), kind: "water", hasPhoto: Boolean(x.photoData || x.photo), record: x })),
      ...(d.irrigations || []).map((x) => ({ date: x.date, title: x.method || "間断灌水", subtitle: fieldName(x.fieldId), kind: "water", record: x }))
    ];
    return entries.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit || 6);
  }

  function upcomingSchedules(limit) {
    const today = U.today();
    return (state().data().schedules || [])
      .filter((x) => x.date >= today && !isScheduleDone(x))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, limit || 6);
  }

  function lastYearSamePeriod(rangeDays) {
    const range = U.lastYearSamePeriod(U.today(), rangeDays || 10);
    const d = state().data();
    const rows = [
      ...d.fieldWorks.filter((x) => U.inDateRange(x.date, range.start, range.end)).map((x) => ({ date: x.date, title: x.workName, subtitle: fieldNames(x.fieldIds), kind: "work" })),
      ...d.growthLogs.filter((x) => U.inDateRange(x.date, range.start, range.end)).map((x) => ({ date: x.date, title: "生育ログ", subtitle: fieldName(x.fieldId), kind: "growth", hasPhoto: Boolean(x.photoData || x.photo) }))
    ];
    return { range, rows: rows.sort((a, b) => String(a.date).localeCompare(String(b.date))) };
  }

  function photoCompare(fieldId) {
    const thisYear = state().data().growthLogs
      .filter((x) => (!fieldId || x.fieldId === fieldId) && (x.photoData || x.photo))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const range = U.lastYearSamePeriod(thisYear ? thisYear.date : U.today(), 14);
    const lastYear = state().data().growthLogs
      .filter((x) => (!fieldId || x.fieldId === fieldId) && (x.photoData || x.photo) && U.inDateRange(x.date, range.start, range.end))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return { thisYear, lastYear };
  }

  RiceOS.calendar = {
    monthStart,
    addMonths,
    monthLabel,
    daysForMonth,
    entriesForDate,
    recentEntries,
    upcomingSchedules,
    lastYearSamePeriod,
    photoCompare,
    fieldNames,
    fieldName
  };
})();
