(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let viewMode = "dashboard";
  let anchorDate = U.today();
  let filterFieldId = "all";
  let homeGroupFilter = "all";
  let expandedManagementFieldId = "";
  const heatCache = new Map();
  const heatProjectionCache = new Map();
  const waterForecastCache = new Map();

  function toLocal(dateText) {
    return U.localDate ? U.localDate(dateText) : new Date(`${dateText}T00:00:00`);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(dateText, diff) {
    const d = toLocal(dateText);
    d.setDate(d.getDate() + diff);
    return dateKey(d);
  }

  function addYears(dateText, diff) {
    const d = toLocal(dateText);
    d.setFullYear(d.getFullYear() + diff);
    return dateKey(d);
  }

  function weekStart(dateText) {
    const d = toLocal(dateText);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return dateKey(d);
  }

  function weekDates() {
    const start = weekStart(anchorDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  function monthStart() {
    return RiceOS.calendar.monthStart(anchorDate);
  }

  function monthLabel(dateText) {
    const d = toLocal(RiceOS.calendar.monthStart(dateText));
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  }

  function shortDate(dateText) {
    const d = toLocal(dateText);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function dayLabel(dateText) {
    const d = toLocal(dateText);
    return `${d.getDate()}<small>${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]}</small>`;
  }

  function fieldVariety(field) {
    const variety = field ? state.variety(field.varietyId) : null;
    return variety && variety.name || "";
  }

  function areaText(field) {
    return field && field.areaA ? `${field.areaA}a` : "面積未設定";
  }

  function fields() {
    const rows = state.activeFields().slice(0, 9);
    return filterFieldId === "all" ? rows : rows.filter((field) => field.fieldId === filterFieldId);
  }

  function fieldOptions() {
    return [
      '<option value="all">すべての圃場</option>',
      ...state.activeFields().map((field) => `<option value="${U.attr(field.fieldId)}" ${filterFieldId === field.fieldId ? "selected" : ""}>${U.escapeHTML(field.name)}</option>`)
    ].join("");
  }

  function homeGroupName(field) {
    const group = state.groupForField ? state.groupForField(field) : null;
    return group ? group.name : "未設定";
  }

  function homeGroups() {
    return state.groupedFields({ includeUnassigned: true })
      .map((group) => ({ fieldGroupId: group.fieldGroupId, name: group.unassigned ? "グループ未設定" : group.name, count: group.fields.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function entryFieldIds(entry) {
    const record = entry && entry.record || {};
    if (record.fieldIds) return record.fieldIds;
    if (record.fieldId) return [record.fieldId];
    return [];
  }

  function eventTone(entry) {
    if (entry.kind === "growth") return "growth";
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "candidate";
      if (entry.tone === "schedule-done") return "plan-done";
      return "plan";
    }
    if (entry.kind === "dry" || entry.kind === "irrigation" || entry.kind === "water") return "water";
    if (entry.kind === "photo") return "photo";
    if (entry.kind === "candidate") return "candidate";
    return "work";
  }

  function entryStatusLabel(entry) {
    if (!entry) return "";
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "超過";
      if (entry.tone === "schedule-done") return "済";
      return "予定";
    }
    if (entry.kind === "work") return "実績";
    if (entry.kind === "growth") return "生育";
    if (entry.kind === "candidate") return "確認";
    if (entry.kind === "dry" || entry.kind === "irrigation" || entry.kind === "water") return "水";
    return "";
  }

  function eventLabel(entry) {
    const title = String(entry.title || "");
    const record = entry.record || {};
    if (entry.kind === "candidate") return entry.title;
    if (entry.hasPhoto && entry.kind === "photo") return "写真追加";
    if (entry.kind === "growth") {
      return record.tillerCount ? `分げつ${record.tillerCount}本` : "生育記録";
    }
    if (entry.kind === "dry") return title.includes("終了") ? "中干し終了" : "中干し";
    if (entry.kind === "irrigation") return title || "水管理";
    if (title.includes("除草")) return "除草剤散布";
    if (title.includes("草刈")) return "草刈り";
    if (title.includes("代かき")) return "代かき";
    if (title.includes("田植")) return "田植え";
    if (title.includes("溝切")) return "溝切り";
    if (title.includes("防除")) return "防除";
    if (title.includes("追肥")) return "追肥";
    if (title.includes("収穫")) return "収穫";
    return title || "作業";
  }

  function shortEventLabel(entry) {
    const label = eventLabel(entry);
    const record = entry.record || {};
    if (label.includes("中干し")) return "中干し";
    if (label.includes("水深")) return "水深";
    if (label.includes("葉色")) return "葉色";
    if (label.includes("確認候補")) return "確認";
    if (label.includes("分げつ")) return record.tillerCount ? `分げつ${record.tillerCount}` : "生育";
    if (label.includes("除草")) return "除草";
    if (label.includes("草刈")) return "草刈";
    if (label.includes("代かき")) return "代かき";
    if (label.includes("田植")) return "田植";
    if (label.includes("写真")) return "写真";
    return label.length > 4 ? label.slice(0, 4) : label;
  }

  function eventIcon(entry) {
    const text = eventLabel(entry);
    if (entry.kind === "candidate") return "⚠";
    if (entry.kind === "growth") return "🌱";
    if (entry.kind === "photo" || entry.hasPhoto && text === "写真追加") return "📷";
    if (entry.kind === "dry" || entry.kind === "irrigation" || text.includes("水") || text.includes("溝切")) return "💧";
    if (text.includes("除草") || text.includes("防除") || text.includes("追肥")) return "🧪";
    if (text.includes("草刈")) return "🌿";
    if (text.includes("田植")) return "🌾";
    if (text.includes("収穫")) return "🚜";
    return "🚜";
  }

  function cropYear(dateText) {
    return String(dateText || U.today()).slice(0, 4);
  }

  function panicleLogForYear(fieldId, year, asOfDate) {
    return state.growthSummaryFor
      ? state.growthSummaryFor(fieldId, year, { asOfDate }).panicleLog
      : state.growthLogsFor(fieldId, year)
        .filter((log) => !asOfDate || String(log.date || "") <= String(asOfDate))
        .filter((log) => U.number(log.panicleLengthMm, 0) > 0)
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function plantingDateForYear(fieldId, year) {
    return state.plantingDateForField(fieldId, year);
  }

  function previousPanicleReference(fieldId, dateText) {
    const currentYear = Number(cropYear(dateText));
    if (!Number.isFinite(currentYear)) return null;
    const year = String(currentYear - 1);
    const log = panicleLogForYear(fieldId, year, addYears(dateText, -1));
    if (!log) return null;
    const planting = plantingDateForYear(fieldId, year);
    return { log, planting, dap: planting ? U.daysBetween(planting, log.date) : "" };
  }

  function latestWater(fieldId, year) {
    const rows = [
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(fieldId, year) : []),
      ...(state.irrigationsFor ? state.irrigationsFor(fieldId, year) : []).filter((row) => row.method !== "湿潤灌漑")
    ].filter((row) => row.date || row.startDate).sort((a, b) => String(b.date || b.startDate).localeCompare(String(a.date || a.startDate)));
    return rows[0] || null;
  }

  function normalWorksFor(fieldId, year) {
    return state.fieldWorksFor(fieldId, year)
      .filter((row) => !(state.waterEventForWorkName && state.waterEventForWorkName(row.workName)) && !(state.isMigratedWaterWork && state.isMigratedWaterWork(row, fieldId)));
  }

  function latestDecisionRecord(fieldId, year) {
    const today = U.today();
    const isActualDate = (value) => Boolean(value) && String(value).startsWith(`${year}-`) && String(value) <= today;
    const periodRecord = (row, type, startTitle, doneTitle) => {
      if (/予定|未開始/.test(String(row.status || row.periodStatus || ""))) return null;
      if (isActualDate(row.actualEndDate)) return { date: row.actualEndDate, type, title: doneTitle };
      const startDate = row.startDate || row.date || "";
      return isActualDate(startDate) ? { date: startDate, type, title: startTitle } : null;
    };
    const records = [
      ...normalWorksFor(fieldId, year).map((row) => ({ date: row.date, type: "作業", title: row.workName || "作業記録" })),
      ...state.growthLogsFor(fieldId, year).map((row) => ({ date: row.date, type: "生育", title: row.tillerCount ? `分げつ ${row.tillerCount}本` : "生育記録" })),
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(fieldId, year) : []).map((row) => periodRecord(row, "中干し", "中干し開始", "中干し完了")),
      ...(state.irrigationsFor ? state.irrigationsFor(fieldId, year) : [])
        .filter((row) => /間断/.test(String(row.method || "")))
        .map((row) => periodRecord(row, "水管理", "間断灌水開始", "間断灌水完了"))
    ];
    return records.filter((row) => row && isActualDate(row.date))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function candidatesForDate(date) {
    if (date !== U.today()) return [];
    const year = cropYear(date);
    return state.activeFields().flatMap((field) => {
      const rows = [];
      const planting = plantingDateForYear(field.fieldId, year);
      const dap = planting ? U.daysBetween(planting, date) : "";
      const periods = resolvedWaterPeriods(field.fieldId, year, date);
      const latest = (kind) => periods.filter((row) => row.kind === kind)
        .slice().sort((a, b) => String(b.startDate || b.actualEndDate || "").localeCompare(String(a.startDate || a.actualEndDate || "")))[0] || null;
      const dryRecord = latest("dry");
      const irrigationRecord = latest("intermittent");
      const dryStart = dryRecord && dryRecord.startDate || "";
      const dryEnd = dryRecord && dryRecord.actualEndDate || "";
      const irrigationStart = irrigationRecord && irrigationRecord.startDate || "";
      if (dap !== "" && dap >= 35 && dap <= 55 && !dryStart) {
        rows.push({
          kind: "candidate",
          title: "中干し確認候補",
          subtitle: `${field.name} / 田植後${dap}日`,
          record: { fieldId: field.fieldId },
          reason: "今年度の中干し開始記録がありません"
        });
      }
      const growth = latestGrowthForYear(field.fieldId, year);
      const growthAge = growth ? U.daysBetween(growth.date, date) : "";
      const importantGrowthWindow = dap !== "" && ((dap >= 35 && dap <= 60) || (dap >= 75 && dap <= 95));
      if ((!growth && importantGrowthWindow) || (growthAge !== "" && growthAge >= 10 && importantGrowthWindow)) {
        rows.push({
          kind: "candidate",
          title: "葉色確認候補",
          subtitle: field.name,
          record: { fieldId: field.fieldId },
          reason: growth ? `前回 ${U.fd(growth.date)}` : "生育記録なし"
        });
      }
      const water = latestWater(field.fieldId, year);
      const irrigationActive = Boolean(irrigationStart && !(irrigationRecord && irrigationRecord.actualEndDate));
      const waterActive = Boolean((dryStart && !dryEnd) || irrigationActive);
      if (waterActive && (!water || U.daysBetween(water.date || water.startDate, date) >= 5)) {
        rows.push({
          kind: "candidate",
          title: "水管理確認候補",
          subtitle: field.name,
          record: { fieldId: field.fieldId },
          reason: water ? `今年度の直近記録 ${U.fd(water.date || water.startDate)}` : "今年度の水管理記録がありません"
        });
      }
      return rows;
    });
  }

  function candidateGroupsForDate(date) {
    const map = new Map();
    candidatesForDate(date).forEach((entry) => {
      const fieldId = entryFieldIds(entry)[0] || "";
      if (!map.has(fieldId)) {
        const field = state.field(fieldId);
        map.set(fieldId, { field, entries: [] });
      }
      map.get(fieldId).entries.push(entry);
    });
    return Array.from(map.values());
  }

  function baseEntriesForDate(date) {
    const entries = RiceOS.calendar.entriesForDate(date).slice();
    return [...entries, ...candidatesForDate(date)];
  }

  function entriesForDate(date) {
    return baseEntriesForDate(date).filter((entry) => {
      if (filterFieldId === "all") return true;
      return entryFieldIds(entry).includes(filterFieldId);
    });
  }

  function actualEntriesForDate(date) {
    return entriesForDate(date).filter((entry) => {
      if (entry.kind === "candidate" || entry.planned) return false;
      return entry.kind !== "schedule" || scheduleDone(entry.record);
    });
  }

  function entriesForCell(date, field) {
    return entriesForDate(date).filter((entry) => entryFieldIds(entry).includes(field.fieldId));
  }

  function eventPill(entry, compact) {
    const compactClass = compact === "month" ? "compact month-compact" : (compact ? "compact" : "");
    const label = compact ? shortEventLabel(entry) : eventLabel(entry);
    const status = compact === "month" ? "" : entryStatusLabel(entry);
    return `
      <span class="farm-event-pill ${eventTone(entry)} ${compactClass}">
        <span>${eventIcon(entry)}</span>
        <b>${U.escapeHTML(label)}</b>
        ${status ? `<em>${U.escapeHTML(status)}</em>` : ""}
      </span>
    `;
  }

  function scheduleDone(record) {
    return Boolean(record && (record.completedAt || record.completedByWorkId || record.status === "実施済み" || record.status === "手動完了"));
  }

  function overdueSchedules() {
    return (state.data().schedules || [])
      .filter((schedule) => schedule.date < U.today() && !scheduleDone(schedule))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function renderOverviewCard(kind, icon, title, value, note) {
    return `
      <button type="button" class="farm-overview-card ${U.attr(kind)}" data-home-overview="${U.attr(kind)}">
        <span>${U.escapeHTML(icon)}</span>
        <b>${U.escapeHTML(title)}</b>
        <strong>${U.escapeHTML(value)}</strong>
        <small>${U.escapeHTML(note)}</small>
      </button>
    `;
  }

  function renderTodayOverview() {
    const todayEntries = actualEntriesForDate(U.today());
    const overdue = overdueSchedules();
    const candidates = candidatesForDate(U.today());
    const planted = state.activeFields().filter((field) => plantingDateForYear(field.fieldId, cropYear(U.today())));
    const todayMain = todayEntries[0] ? eventLabel(todayEntries[0]) : "予定なし";
    const overdueNote = overdue[0] ? `${U.fd(overdue[0].date)} ${overdue[0].title || overdue[0].scheduleType || "予定"}` : "遅れなし";
    const candidateNote = candidates[0] ? candidates[0].title : "大きな確認なし";
    return `
      <section class="farm-today-overview" aria-label="今日の確認">
        ${renderOverviewCard("today", "日", "今日", `${todayEntries.length}件`, todayMain)}
        ${renderOverviewCard("overdue", "!", "期限超過", `${overdue.length}件`, overdueNote)}
        ${renderOverviewCard("candidate", "?", "確認候補", `${candidates.length}件`, candidateNote)}
        ${renderOverviewCard("progress", "℃", "進捗", `${planted.length}圃場`, "積算気温を見る")}
      </section>
    `;
  }

  function latestGrowthForYear(fieldId, year) {
    return state.growthLogsFor(fieldId)
      .filter((log) => String(log.date || "").startsWith(`${year}-`))
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function previousYearHint(field, dateText) {
    const previousDate = addYears(dateText, -1);
    const work = state.fieldWorksFor(field.fieldId).find((row) => String(row.date || "") === previousDate);
    const growth = state.growthLogsFor(field.fieldId).find((row) => String(row.date || "") === previousDate);
    if (work) return `前年 ${U.fd(previousDate)}: ${work.workName || "作業記録"}`;
    if (growth) return `前年 ${U.fd(previousDate)}: 分げつ ${growth.tillerCount || "-"}本`;
    return "前年同日の記録なし";
  }

  function dashboardNeed(field, dateText) {
    const year = cropYear(dateText);
    const planting = plantingDateForYear(field.fieldId, year);
    const growth = latestGrowthForYear(field.fieldId, year);
    const candidate = candidatesForDate(dateText).find((entry) => entryFieldIds(entry).includes(field.fieldId));
    if (!planting) return { tone: "alert", label: "田植え日を記録", detail: "田植え作業を登録すると日数と進捗が使えます" };
    if (candidate) return { tone: "alert", label: candidate.title, detail: candidate.reason || "現地を確認して判断" };
    if (!growth) return { tone: "notice", label: "生育の初回記録", detail: "分げつ数か葉色だけでも残せます" };
    return { tone: "ok", label: "記録は順調", detail: `最終生育 ${U.fd(growth.date)}` };
  }

  const SEASON_STAGES = [
    { key: "planting", label: "田植え", image: 2 },
    { key: "tillering", label: "分げつ", image: 3 },
    { key: "panicle", label: "幼穂", image: 5 },
    { key: "heading", label: "出穂", image: 6 },
    { key: "ripening", label: "登熟", image: 7 },
    { key: "harvest", label: "収穫", image: 8 }
  ];

  function seasonRowsForField(fieldId, year) {
    return normalWorksFor(fieldId)
      .filter((row) => String(row.season || String(row.date || "").slice(0, 4)) === String(year));
  }

  function seasonStageForField(field, dateText) {
    if (RiceOS.agro && RiceOS.agro.seasonStageForField) return RiceOS.agro.seasonStageForField(field, dateText);
    const year = cropYear(dateText);
    const works = seasonRowsForField(field.fieldId, year);
    const growth = latestGrowthForYear(field.fieldId, year);
    const panicleLog = panicleLogForYear(field.fieldId, year, dateText);
    const growthSummary = state.growthSummaryFor ? state.growthSummaryFor(field.fieldId, year, dateText) : null;
    const planting = plantingDateForYear(field.fieldId, year);
    const hasWork = (pattern) => works.some((row) => pattern.test(String(row.workName || "")));
    const heading = Boolean(growthSummary && growthSummary.headingDate) || hasWork(/出穂/);
    const harvest = hasWork(/稲刈り|収穫/);
    const panicle = Boolean(panicleLog);
    const dap = planting ? U.daysBetween(planting, dateText) : "";
    let index = 0;
    let next = "田植え作業を残すと、来年の同時期と比べられます";
    if (planting) { index = 1; next = "分げつ数か葉色をひとつ残して、活着を見守りましょう"; }
    if (growth) { index = 2; next = "幼穂長を残すと、出穂の目安が見えてきます"; }
    if (panicle) { index = 3; next = "出穂を確認したら、実績として残しましょう"; }
    if (heading) { index = 4; next = "登熟期。水管理と葉色の様子を残しましょう"; }
    if (heading && dap !== "" && dap >= 30) { index = 5; next = "収穫日を残すと、来年の作業計画に生かせます"; }
    if (harvest) { index = 6; next = "今年の収穫を振り返り、来年へのひとことを残しましょう"; }
    return { index, current: index > 0 ? SEASON_STAGES[index - 1] : null, next, dap };
  }

  function latestFieldPhoto(fieldId, year) {
    const rows = [
      ...state.growthLogsFor(fieldId, year),
      ...normalWorksFor(fieldId, year),
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(fieldId, year) : []),
      ...(state.irrigationsFor ? state.irrigationsFor(fieldId, year) : [])
    ].filter((row) => (row.photoData || row.photo));
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function fieldMemory(field, dateText) {
    const previousDate = addYears(dateText, -1);
    const previousYear = cropYear(previousDate);
    const candidates = [
      ...normalWorksFor(field.fieldId).map((row) => ({ ...row, kind: "作業", title: row.workName, text: row.memo || "" })),
      ...state.growthLogsFor(field.fieldId).map((row) => ({ ...row, kind: "生育", title: row.tillerCount ? `分げつ ${row.tillerCount}本` : "生育記録", text: row.memo || "" })),
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(field.fieldId) : []).map((row) => ({ ...row, kind: "中干し", title: row.actualEndDate ? "中干し完了" : "中干し記録", text: row.memo || "" })),
      ...(state.irrigationsFor ? state.irrigationsFor(field.fieldId) : []).filter((row) => row.method !== "湿潤灌漑").map((row) => ({ ...row, kind: "水管理", title: row.method || "水管理記録", text: row.memo || "" }))
    ].filter((row) => String(row.season || String(row.date || "").slice(0, 4)) === previousYear && row.date);
    const samePeriod = candidates.sort((a, b) => Math.abs(U.daysBetween(a.date, previousDate)) - Math.abs(U.daysBetween(b.date, previousDate)))[0];
    if (!samePeriod) return null;
    return { ...samePeriod, date: samePeriod.date, label: `去年の今日ごろ・${samePeriod.kind}` };
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function fieldWorkDate(fieldId, year, pattern) {
    return state.fieldWorksFor(fieldId, year)
      .filter((row) => pattern.test(String(row.workName || "")) && !/予定/.test(String(row.workName || "")))
      .map((row) => row.date || "")
      .filter(Boolean)
      .sort()[0] || "";
  }

  function latestFieldWorkDate(fieldId, year, pattern) {
    return state.fieldWorksFor(fieldId, year)
      .filter((row) => pattern.test(String(row.workName || "")) && !/予定/.test(String(row.workName || "")))
      .map((row) => row.date || "")
      .filter(Boolean)
      .sort().pop() || "";
  }

  function earliestGrowthDate(fieldId, year) {
    return state.growthLogsFor(fieldId, year)
      .filter((row) => String(row.date || "").startsWith(`${year}-`) && (U.number(row.tillerCount, 0) > 0 || /分げつ/.test(String(row.observedStage || ""))))
      .map((row) => row.date || "")
      .filter(Boolean)
      .sort()[0] || "";
  }

  function managementPeriods(fieldId, year, pattern) {
    return (state.irrigationsFor ? state.irrigationsFor(fieldId, year) : [])
      .filter((row) => pattern.test(String(row.method || "")))
      .slice()
      .sort((a, b) => String(a.startDate || a.date || "").localeCompare(String(b.startDate || b.date || "")));
  }

  function resolvedWaterPeriods(fieldId, year, throughDate) {
    if (state.resolvedWaterPeriodsFor) {
      return state.resolvedWaterPeriodsFor(fieldId, { year, throughDate, includePlanned: true, forDisplay: true });
    }
    return [];
  }

  function waterRows(periods, kind) {
    return periods
      .filter((period) => period.kind === kind)
      .map((period) => ({
        date: period.startDate || period.actualEndDate || period.plannedEndDate || "",
        startDate: period.startDate || "",
        endDate: period.plannedEndDate || "",
        actualEndDate: period.actualEndDate || "",
        targetDays: period.targetDays || "",
        method: period.label || "",
        source: period.source || "",
        periodStatus: period.status || ""
      }));
  }

  function isPlannedPeriod(row) {
    return /予定|未開始|planned/i.test(String(row && (row.periodStatus || row.status) || ""));
  }

  function actualPeriodStart(row) {
    return row && !isPlannedPeriod(row) ? String(row.startDate || row.date || "") : "";
  }

  function dashboardWaterStatus(dateText, dryStart, dryActualEnd, irrigations, deeps, drains, legacyDrainDate) {
    const candidates = [];
    const add = (date, label) => {
      if (date && date <= dateText) candidates.push({ date, label, evidence: "実績" });
    };
    if (dryStart && (!dryActualEnd || dryActualEnd > dateText)) add(dryStart, "中干し中");
    if (dryActualEnd) add(dryActualEnd, "中干し完了");
    (irrigations || []).forEach((row) => {
      const start = actualPeriodStart(row);
      if (start && (!row.actualEndDate || row.actualEndDate > dateText)) add(start, "間断灌水中");
      if (!isPlannedPeriod(row) && row.actualEndDate) add(String(row.actualEndDate), "間断灌水完了");
    });
    (deeps || []).forEach((row) => {
      const start = actualPeriodStart(row);
      if (start && (!row.actualEndDate || row.actualEndDate > dateText)) add(start, "深水管理中");
      if (!isPlannedPeriod(row) && row.actualEndDate) add(String(row.actualEndDate), "深水管理完了");
    });
    (drains || []).forEach((row) => {
      const start = actualPeriodStart(row);
      if (start && (!row.actualEndDate || row.actualEndDate > dateText)) add(start, "稲刈り前の落水中");
      if (!isPlannedPeriod(row) && row.actualEndDate) add(String(row.actualEndDate), "稲刈り前の落水完了");
    });
    if (legacyDrainDate) add(legacyDrainDate, "落水済み");
    if (candidates.length) return candidates.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return { label: "中干し前", evidence: "記録待ち" };
  }

  function waterManagementForField(field, dateText) {
    if (RiceOS.agro && RiceOS.agro.managementStatus) {
      const current = RiceOS.agro.managementStatus(field, dateText);
      return {
        ...current,
        evidence: current.date ? `実績 ${U.fd(current.date)}` : "記録待ち"
      };
    }
    const year = cropYear(dateText);
    const periods = resolvedWaterPeriods(field.fieldId, year, dateText);
    const dryPeriods = waterRows(periods, "dry");
    const dry = dryPeriods.at(-1) || null;
    const dryStart = dry && dry.startDate || "";
    const dryActualEnd = dry && dry.actualEndDate || "";
    const irrigations = waterRows(periods, "intermittent");
    const deeps = waterRows(periods, "deep");
    const drains = waterRows(periods, "drain");
    return dashboardWaterStatus(dateText, dryStart, dryActualEnd, irrigations, deeps, drains, "");
  }

  function flowPercent(dateText, startDate, endDate) {
    if (!dateText || !startDate || !endDate) return 0;
    const total = Math.max(1, U.daysBetween(startDate, endDate));
    return Math.max(4, Math.min(96, clampPercent((U.daysBetween(startDate, dateText) / total) * 100)));
  }

  function flowDate(dateText) {
    return dateText ? U.fd(dateText).replace(/^\d{4}\//, "") : "-";
  }

  function renderFlowMarkers(markers, startDate, endDate) {
    const grouped = new Map();
    markers.filter((item) => item.date).forEach((item) => {
      const key = String(item.date);
      const current = grouped.get(key) || { date: item.date, labels: [], estimated: true, baseline: true };
      current.labels.push(item.label);
      current.estimated = current.estimated && Boolean(item.estimated);
      current.baseline = current.baseline && Boolean(item.baseline);
      grouped.set(key, current);
    });
    const clusters = [];
    Array.from(grouped.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((item) => {
      const at = flowPercent(item.date, startDate, endDate);
      const previous = clusters[clusters.length - 1];
      if (previous && at - previous.at < 7) {
        previous.labels.push(...item.labels);
        previous.estimated = previous.estimated && item.estimated;
        previous.baseline = previous.baseline && item.baseline;
        previous.dates.push(item.date);
        return;
      }
      clusters.push({ ...item, at, dates: [item.date] });
    });
    return clusters.map((item) => {
      const count = item.labels.length;
      const dateLabel = item.dates.length > 1 ? `${flowDate(item.dates[0])}ほか` : flowDate(item.date);
      return `<span class="home-linked-marker ${item.estimated ? "estimated" : ""} ${item.baseline ? "baseline" : ""}" title="${U.attr(`${item.labels.join("・")} ${dateLabel}${item.estimated ? "ごろ" : ""}`)}" style="--at:${U.attr(String(item.at))}%"><i${count > 1 ? ` data-count="${U.attr(String(count))}"` : ""}></i></span>`;
    }).join("");
  }

  function renderFlowChips(items) {
    const rows = items.filter((item) => item.date);
    return rows.length ? `<div class="home-linked-chips">${rows.map((item) => `<span class="${item.estimated ? "estimated" : ""} ${item.baseline ? "baseline" : ""}"><b>${U.escapeHTML(item.label)}</b><small>${U.escapeHTML(flowDate(item.date))}${item.estimated ? "ごろ" : ""}</small></span>`).join("")}</div>` : '<span class="home-linked-chips empty">実績を追加すると、ここに日付を表示します。</span>';
  }

  function renderLinkedLane(kind, title, current, period, markers, startDate, endDate, todayPercent) {
    return `
      <section class="home-linked-lane ${U.attr(kind)}">
        <div class="home-linked-lane-head"><span>${U.escapeHTML(title)}</span><b>${U.escapeHTML(current)}</b><small>${U.escapeHTML(period)}</small></div>
        <div class="home-linked-road">
          <em style="width:${U.attr(String(todayPercent))}%"></em>
          <strong title="今日" aria-label="今日の位置" style="left:${U.attr(String(todayPercent))}%"></strong>
          ${renderFlowMarkers(markers, startDate, endDate)}
        </div>
      </section>
    `;
  }

  // The stage service keeps facts and estimates separate. Home only translates
  // that evidence into a short, human-readable label; it never changes a stage.
  function homeStageEvidenceLabel(stage) {
    if (!stage || !stage.current) return "記録待ち";
    if (stage.certainty === "推定" || stage.evidenceKind === "prediction") return "推定";
    if (stage.evidenceKind === "manual-stage-observation") return "現地判断";
    if (stage.evidenceKind === "heading") return "現地観察";
    if (["panicle", "tiller"].includes(stage.evidenceKind)) return "実測";
    if (stage.evidenceKind === "harvest" || stage.evidenceSource === "work") return "作業記録";
    return stage.certainty || "記録待ち";
  }

  function annualStageIndex(stage) {
    const key = String(stage && stage.current && stage.current.key || "");
    if (["establishment", "planting"].includes(key)) return 0;
    if (["earlyTillering", "peakTillering", "maximumTillering", "tillering"].includes(key)) return 1;
    if (["panicleInitiation", "panicle"].includes(key)) return 2;
    if (["meiosis", "booting"].includes(key)) return 3;
    if (["heading", "fullHeading"].includes(key)) return 4;
    if (["ripening", "yellowRipening"].includes(key)) return 5;
    if (["maturity", "harvest"].includes(key)) return 6;
    return -1;
  }

  function renderAnnualStageRuler(stage) {
    const stages = [
      { label: "田植え", image: 2 },
      { label: "分げつ", image: 3 },
      { label: "幼穂", image: 5 },
      { label: "穂ばらみ", image: 5 },
      { label: "出穂", image: 6 },
      { label: "登熟", image: 7 },
      { label: "成熟期", image: 8 }
    ];
    const current = annualStageIndex(stage);
    return `
      <div class="home-stage-ruler" aria-label="一年の生育段階">
        ${stages.map((item, index) => `
          <div class="${index < current ? "done" : ""} ${index === current ? "current" : ""}">
            <span><img src="assets/images/rice-stages/rice-stage-${String(item.image).padStart(2, "0")}.png" alt=""></span>
            <b>${U.escapeHTML(item.label)}</b>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderLinkedSeasonFlow(field, dateText, stage) {
    const year = cropYear(dateText);
    const planting = plantingDateForYear(field.fieldId, year);
    if (!planting) return `
      <div class="home-linked-flow waiting"><b>今期の工程</b><span>田植え作業を登録すると、生育と水管理を同じ時間軸で表示します。</span></div>
    `;
    const panicle = panicleLogForYear(field.fieldId, year, dateText);
    const headingActual = actualHeadingDate(field, dateText);
    const heading = headingActual || stage.predictedHeadingDate || "";
    const harvest = fieldWorkDate(field.fieldId, year, /稲刈り|収穫/);
    const flowEnd = harvest || (heading ? addDays(heading, 48) : addDays(planting, 145));
    const todayPercent = flowPercent(dateText, planting, flowEnd);
    const growthDate = earliestGrowthDate(field.fieldId, year);
    const periods = resolvedWaterPeriods(field.fieldId, year, dateText);
    const dryPeriods = waterRows(periods, "dry");
    const dry = dryPeriods.at(-1) || null;
    const dryStart = dry && dry.startDate || "";
    const dryActualEnd = dry && dry.actualEndDate || "";
    const dryPlannedStart = dry && !dry.startDate && String(dry.date || "");
    const dryPlannedEnd = dry && dry.endDate || "";
    const irrigations = waterRows(periods, "intermittent");
    const deeps = waterRows(periods, "deep");
    const drains = waterRows(periods, "drain");
    const management = dashboardWaterStatus(dateText, dryStart, dryActualEnd, irrigations, deeps, drains, "");
    const growthMarkers = [
      { label: "田植（基準）", date: planting, baseline: true },
      { label: "分げつ", date: growthDate },
      { label: "幼穂", date: panicle && panicle.date || "" },
      { label: "出穂", date: heading, estimated: Boolean(heading && !headingActual) },
      { label: "収穫", date: harvest }
    ];
    const waterMarkers = [
      { label: "田植（基準）", date: planting, baseline: true },
      ...dryPeriods.flatMap((row) => [
        { label: "中干開始", date: actualPeriodStart(row) },
        { label: "中干完了", date: row.actualEndDate || "" }
      ]),
      { label: "中干予定", date: dryStart || dryActualEnd ? "" : (dryPlannedStart || dryPlannedEnd), estimated: Boolean(!dryStart && !dryActualEnd && (dryPlannedStart || dryPlannedEnd)) },
      ...irrigations.flatMap((row) => {
        const start = actualPeriodStart(row);
        if (!start) return [{ label: "間断予定", date: row.startDate || row.date || row.endDate || "", estimated: true }];
        return [
          { label: "間断開始", date: start },
          { label: "間断完了", date: row.actualEndDate || "" },
          { label: "間断終了予定", date: row.actualEndDate ? "" : row.endDate || "", estimated: Boolean(!row.actualEndDate && row.endDate) }
        ];
      }),
      ...deeps.flatMap((row) => {
        const start = actualPeriodStart(row);
        if (!start) return [{ label: "深水予定", date: row.startDate || row.date || row.endDate || "", estimated: true }];
        return [
          { label: "深水開始", date: start },
          { label: "深水完了", date: row.actualEndDate || "" },
          { label: "深水終了予定", date: row.actualEndDate ? "" : row.endDate || "", estimated: Boolean(!row.actualEndDate && row.endDate) }
        ];
      }),
      ...drains.flatMap((row) => {
        const start = actualPeriodStart(row);
        if (!start) return [{ label: "落水予定", date: row.startDate || row.date || row.endDate || "", estimated: true }];
        return [{ label: "落水開始", date: start }, { label: "落水完了", date: row.actualEndDate || "" }];
      }),
    ];
    return `
      <section class="home-linked-flow" aria-label="生育と水管理の今期工程">
        <div class="home-linked-flow-head"><span>今期の成長マップ</span><small>縦線は今日 / 点は実績、白点は推定</small></div>
        ${renderAnnualStageRuler(stage)}
        ${renderLinkedLane("growth", "生育", stage.current ? stage.current.label : "記録待ち", homeStageEvidenceLabel(stage), growthMarkers, planting, flowEnd, todayPercent)}
        ${renderFlowChips(growthMarkers)}
        ${renderLinkedLane("water", "水管理", management.label || "記録待ち", management.evidence || "記録待ち", waterMarkers, planting, flowEnd, todayPercent)}
        ${renderFlowChips(waterMarkers)}
      </section>
    `;
  }

  function renderDecisionFieldCard(field) {
    const date = U.today();
    const stage = seasonStageForField(field, date);
    const waterManagement = waterManagementForField(field, date);
    const criticalWater = criticalWaterWindowFor(field, date);
    const stageImage = stage.current ? `assets/images/rice-stages/rice-stage-${String(stage.current.image).padStart(2, "0")}.png` : "assets/images/rice-stages/rice-stage-01.png";
    const candidateCount = candidatesForDate(date).filter((entry) => entryFieldIds(entry).includes(field.fieldId)).length;
    const isExpanded = expandedManagementFieldId === field.fieldId;
    return `
      <article class="home-decision-card ${isExpanded ? "expanded" : ""}">
        <button type="button" class="home-decision-card-toggle" data-home-toggle-field="${U.attr(field.fieldId)}" aria-expanded="${isExpanded ? "true" : "false"}" aria-controls="home-management-${U.attr(field.fieldId)}">
        <div class="home-decision-card-head">
          <img class="stage" src="${U.attr(stageImage)}" alt="">
          <div><b>${U.escapeHTML(field.name)}</b><small>${U.escapeHTML(fieldVariety(field))} / ${U.escapeHTML(areaText(field))}${candidateCount ? ` ・ 確認${U.escapeHTML(String(candidateCount))}件` : ""}</small></div>
          <i aria-hidden="true">${isExpanded ? "⌃" : "⌄"}</i>
        </div>
          ${renderDecisionProgressGrid(field, stage, waterManagement, criticalWater, date)}
        </button>
        <div id="home-management-${U.attr(field.fieldId)}" class="home-management-compare" ${isExpanded ? "" : "hidden"}>
          ${renderManagementComparison(field, stage, date)}
          <button type="button" class="home-management-detail" data-home-open-field="${U.attr(field.fieldId)}">圃場の詳細を見る <span>›</span></button>
        </div>
      </article>
    `;
  }

  // A home card is read-only: four short facts from existing records, not a new data source.
  function renderDecisionProgressGrid(field, stage, management, focus, dateText) {
    const headingRecorded = focus && focus.mode === "postHeading";
    const panicleRecorded = focus && focus.mode === "panicle";
    const stageText = focus && focus.active
      ? focus.phase
      : (stage.current ? stage.current.label : "生育記録待ち");
    const stageCertainty = focus && focus.active
      ? (focus.mode === "panicle" ? "実測" : (focus.certainty || "推定"))
      : (stage.current ? homeStageEvidenceLabel(stage) : "");
    const headingText = headingRecorded
      ? focus.anchorLabel
      : (panicleRecorded && focus.observation ? homeHeadingCompactText(focus.observation) : "参考: 幼穂形成期の目安");
    const cells = [
      { tone: "growth", icon: "🌾", value: stageText, certainty: stageCertainty },
      { tone: "heading", icon: "◌", value: headingText },
      { tone: "water", icon: "💧", value: homeWaterCompactText(field, management, dateText) },
      { tone: "next", icon: "›", value: homeNextMilestone(focus, stage) }
    ];
    return `<div class="home-decision-progress-grid">${cells.map((cell) => `<span class="${U.attr(cell.tone)}"><i aria-hidden="true">${cell.icon}</i><b>${U.escapeHTML(cell.value)}</b>${cell.certainty ? `<em>${U.escapeHTML(cell.certainty)}</em>` : ""}</span>`).join("")}</div>`;
  }

  function homeHeadingCompactText(text) {
    const value = String(text || "");
    const dates = Array.from(value.matchAll(/(?:\d{4}\/)?(\d{1,2}\/\d{1,2})/g)).map((match) => match[1]);
    if (dates.length >= 2) return `出穂 ${dates[0]}〜${dates[1]}`;
    return value;
  }

  function homeNextMilestone(focus, stage) {
    if (focus && focus.mode === "postHeading") {
      const elapsed = U.number(String(focus.anchorLabel || "").match(/(\d+)日目/)?.[1], -1);
      if (elapsed >= 0 && elapsed < 5) return `目安: 穂揃い あと${5 - elapsed}日`;
      if (elapsed >= 5 && elapsed < 8) return `目安: 登熟期 あと${8 - elapsed}日`;
      if (elapsed >= 8 && elapsed < 26) return "目安: 登熟後期";
      if (elapsed >= 26) return "参考: 収穫前の落水時期";
    }
    if (focus && focus.mode === "panicle" && focus.observation && !/未確認/.test(focus.observation)) return "目安: 出穂時期";
    if (!stage.current) return "参考: 田植日を起点に表示";
    return stage.certainty === "推定" ? "参考: 田植日からの目安" : "参考: 現地記録を基準";
  }

  function actualManagementWorks(fieldId, year, matcher, excludeMatcher) {
    return state.fieldWorksFor(fieldId, year)
      .filter((row) => !state.isActualFieldWork || state.isActualFieldWork(row))
      .filter((row) => matcher.test(String(row.workName || "")))
      .filter((row) => !excludeMatcher || !excludeMatcher.test(String(row.workName || "")))
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  }

  function waterManagementHistory(fieldId, year, throughDate) {
    const rows = ["dry", "intermittent", "saturated", "deep", "drain"].flatMap((kind) => waterRows(resolvedWaterPeriods(fieldId, year, throughDate), kind)
      .map((row) => ({ ...row, kind })))
      .filter((row) => actualPeriodStart(row));
    return rows.sort((a, b) => String(actualPeriodStart(a)).localeCompare(String(actualPeriodStart(b))));
  }

  function waterKindLabel(kind, row) {
    if (kind === "dry") return "中干し";
    if (kind === "intermittent") return "間断灌水";
    if (kind === "saturated") return "飽水管理";
    if (kind === "deep") return "深水管理";
    if (kind === "drain") return "稲刈り前の落水";
    return row && row.method || "水管理";
  }

  function daysAfterPlanting(plantingDate, eventDate) {
    const days = plantingDate && eventDate ? U.daysBetween(plantingDate, eventDate) : "";
    return days === "" ? "" : `田植後${days}日`;
  }

  function waterPeriodText(row, dateText) {
    if (!row) return "記録なし";
    const start = actualPeriodStart(row);
    if (!start) return "開始日未記録";
    if (row.actualEndDate) return `${U.fd(start)}〜${U.fd(row.actualEndDate)} / 実績${U.daysBetween(start, row.actualEndDate)}日`;
    return `${U.fd(start)}開始 / ${U.daysBetween(start, dateText)}日目`;
  }

  function waterReferenceText(field, currentRow, history, dateText) {
    if (!currentRow) return { previousText: "前年同種の記録なし", comparison: "圃場目安未設定" };
    const currentStart = actualPeriodStart(currentRow);
    const sameKindRows = history.filter((row) => row.kind === currentRow.kind);
    const occurrence = Math.max(0, sameKindRows.findIndex((row) => row === currentRow));
    const previousYear = String(Number(cropYear(dateText)) - 1);
    const previousPlanting = plantingDateForYear(field.fieldId, previousYear);
    const previousRows = waterManagementHistory(field.fieldId, previousYear, addYears(dateText, -1)).filter((row) => row.kind === currentRow.kind);
    const previous = previousRows[occurrence] || null;
    const targetDays = U.number(currentRow.targetDays || (currentRow.kind === "dry" ? field.drainageTargetDays : currentRow.kind === "intermittent" ? field.intermittentIntervalDays : ""), 0);
    const elapsed = currentStart ? U.daysBetween(currentStart, dateText) : "";
    const referenceDays = targetDays || (previous && previous.actualEndDate ? U.daysBetween(actualPeriodStart(previous), previous.actualEndDate) : 0);
    const remaining = !currentRow.actualEndDate && elapsed !== "" && referenceDays ? Math.max(0, referenceDays - elapsed) : "";
    const previousText = previous
      ? `前年 ${daysAfterPlanting(previousPlanting, actualPeriodStart(previous)) || U.fd(actualPeriodStart(previous))}${previous.actualEndDate ? ` / ${U.daysBetween(actualPeriodStart(previous), previous.actualEndDate)}日間` : " / 終了未記録"}`
      : "前年同種の記録なし";
    const referenceLabel = currentRow.kind === "dry"
      ? "間断灌水の比較目安"
      : currentRow.kind === "deep"
        ? "深水の比較期間"
        : "実施期間の比較目安";
    const comparison = remaining === "" ? (targetDays ? `圃場目安 ${targetDays}日` : "圃場目安未設定") : `${referenceLabel}まで あと${remaining}日`;
    return { previousText, comparison };
  }

  function latestManagementWork(fieldId, year, matcher, excludeMatcher) {
    return actualManagementWorks(fieldId, year, matcher, excludeMatcher).at(-1) || null;
  }

  function managementWorkText(field, year, work, previousWork) {
    if (!work) return { current: "今年の実績なし", previous: previousWork ? `前年 ${U.fd(previousWork.date)}` : "前年記録なし" };
    const planting = plantingDateForYear(field.fieldId, year);
    const previousYear = String(Number(year) - 1);
    const previousPlanting = plantingDateForYear(field.fieldId, previousYear);
    const current = `${U.fd(work.date)} / ${daysAfterPlanting(planting, work.date) || "田植日未登録"}`;
    const previous = previousWork ? `前年 ${daysAfterPlanting(previousPlanting, previousWork.date) || U.fd(previousWork.date)}` : "前年記録なし";
    return { current, previous };
  }

  function homeWaterCompactText(field, management, dateText) {
    if (management && management.key === "overlap") return management.label || "水管理の記録を確認";
    const history = waterManagementHistory(field.fieldId, cropYear(dateText), dateText);
    const current = history.filter((row) => !row.actualEndDate).at(-1) || history.at(-1) || null;
    if (!current) return management.label || "水管理記録待ち";
    const start = actualPeriodStart(current);
    const label = waterKindLabel(current.kind, current).replace("稲刈り前の落水", "落水");
    return current.actualEndDate ? `${label} 完了` : `${label} ${U.daysBetween(start, dateText)}日目`;
  }

  function criticalWaterWindowFor(field, dateText) {
    return RiceOS.agro && RiceOS.agro.criticalWaterWindow
      ? RiceOS.agro.criticalWaterWindow(field, dateText)
      : { active: false };
  }

  function renderCriticalWaterWindow(field, dateText) {
    const focus = criticalWaterWindowFor(field, dateText);
    if (!focus.active) return "";
    return `
      <section class="critical-water-window mode-${U.attr(focus.mode)}" aria-label="幼穂確認以降の生育と水管理">
        <div class="critical-water-window-head"><span>幼穂確認からの見通し</span><b>${U.escapeHTML(focus.certainty)}</b></div>
        <strong>${U.escapeHTML(focus.phase)}</strong>
        <div class="critical-water-window-facts"><span>${U.escapeHTML(focus.anchorLabel)}</span><span>${U.escapeHTML(focus.observation)}</span></div>
        <p>${U.escapeHTML(focus.note)}</p>
      </section>
    `;
  }

  function renderManagementComparison(field, stage, dateText) {
    const year = cropYear(dateText);
    const waterHistory = waterManagementHistory(field.fieldId, year, dateText);
    const currentWater = waterHistory.filter((row) => !row.actualEndDate).at(-1) || waterHistory.at(-1) || null;
    const waterReference = waterReferenceText(field, currentWater, waterHistory, dateText);
    const managementTypes = [
      { key: "fertilizer", label: "追肥", icon: "肥", tone: "fertilizer", matcher: /追肥|穂肥/ },
      { key: "protection", label: "防除", icon: "防", tone: "protection", matcher: /防除|殺菌|殺虫/, exclude: /除草/ },
      { key: "herbicide", label: "除草剤", icon: "除", tone: "herbicide", matcher: /除草|除草剤/ }
    ];
    const previousYear = String(Number(year) - 1);
    const workRows = managementTypes.map((type) => {
      const work = latestManagementWork(field.fieldId, year, type.matcher, type.exclude);
      const previous = latestManagementWork(field.fieldId, previousYear, type.matcher, type.exclude);
      const info = managementWorkText(field, year, work, previous);
      return `<div class="home-management-row ${U.attr(type.tone)}"><span class="home-management-icon">${U.escapeHTML(type.icon)}</span><b>${U.escapeHTML(type.label)}</b><span>${U.escapeHTML(info.current)}</span><small>${U.escapeHTML(info.previous)}</small></div>`;
    }).join("");
    const focus = criticalWaterWindowFor(field, dateText);
    const stageLabel = focus.active
      ? `${focus.phase}（${focus.certainty || "推定"}）`
      : (stage.current ? `${stage.current.label}（${homeStageEvidenceLabel(stage)}）` : "生育記録待ち");
    return `
      <div class="home-management-head"><b>${U.escapeHTML(stageLabel)}の管理記録</b><small>${U.escapeHTML(focus.active ? `${focus.anchorLabel} / ${focus.observation}` : "今年実績を優先 / 比較は前年実績")}</small></div>
      <div class="home-management-row water"><span class="home-management-icon">水</span><b>${U.escapeHTML(currentWater ? waterKindLabel(currentWater.kind, currentWater) : "水管理")}</b><span>${U.escapeHTML(waterPeriodText(currentWater, dateText))}</span><small>${U.escapeHTML(`${waterReference.previousText}・${waterReference.comparison}`)}</small></div>
      ${workRows}
      <p class="home-management-guidance">地域の参考: ${U.escapeHTML(homeWaterGuidance(stageLabel))}</p>
    `;
  }

  function homeWaterGuidance(stageLabel) {
    if (/中干し/.test(stageLabel)) return "中干し後の水管理を比較する時期";
    if (/幼穂|減数|穂ばらみ/.test(stageLabel)) return "幼穂から出穂前後の水管理を比較する時期";
    if (/出穂|登熟|黄熟/.test(stageLabel)) return "出穂後・登熟期の水管理を比較する時期";
    return "生育段階に合わせて水管理の実績を残す時期";
  }

  function activeWaterCount(dateText) {
    const activeKeys = new Set(["drying", "intermittent", "saturated", "deepWater", "draining", "overlap"]);
    return state.activeFields().filter((field) => activeKeys.has(String(waterManagementForField(field, dateText).key || ""))).length;
  }

  function renderTodayPlans(dateText) {
    const plans = (state.data().schedules || []).filter((schedule) => String(schedule.date || "") === dateText && !scheduleDone(schedule));
    if (!plans.length) return "";
    return `
      <section class="home-today-plans" aria-label="今日の予定">
        <div><h3>今日の予定</h3><small>未実施の予定</small></div>
        ${plans.slice(0, 2).map((schedule) => {
          const fieldIds = (schedule.fieldIds || []).filter(Boolean);
          const field = state.field(fieldIds[0] || "");
          const title = schedule.title || schedule.scheduleType || "予定";
          const target = fieldIds.length > 1 ? `対象圃場 ${fieldIds.length}圃場` : (field ? field.name : "対象圃場を確認");
          return `<span><b>${U.escapeHTML(title)}</b><small>${U.escapeHTML(target)}</small></span>`;
        }).join("")}
        ${plans.length > 2 ? `<small class="home-today-plans-more">ほか${U.escapeHTML(String(plans.length - 2))}件</small>` : ""}
      </section>
    `;
  }

  function lastFieldActivityDate(fieldId, year) {
    const rows = [
      ...normalWorksFor(fieldId, year),
      ...state.growthLogsFor(fieldId, year),
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(fieldId, year) : []),
      ...(state.irrigationsFor ? state.irrigationsFor(fieldId, year) : []).filter((row) => row.method !== "湿潤灌漑")
    ];
    return rows.map((row) => row.date || row.startDate || row.updatedAt || "").filter(Boolean).sort().pop() || "";
  }

  function prioritizedDecisionFields(dateText, candidates, overdue) {
    const nearSchedules = (state.data().schedules || []).filter((schedule) => {
      if (scheduleDone(schedule) || !schedule.date || schedule.date < dateText) return false;
      const days = U.daysBetween(dateText, schedule.date);
      return days !== "" && days <= 7;
    });
    return state.activeFields().map((field) => {
      let score = 0;
      if (overdue.some((schedule) => (schedule.fieldIds || []).includes(field.fieldId))) score += 100;
      if (candidates.some((entry) => entryFieldIds(entry).includes(field.fieldId))) score += 70;
      if (nearSchedules.some((schedule) => (schedule.fieldIds || []).includes(field.fieldId))) score += 45;
      if (!plantingDateForYear(field.fieldId, cropYear(dateText))) score += 35;
      else if (!latestGrowthForYear(field.fieldId, cropYear(dateText))) score += 25;
      const lastDate = lastFieldActivityDate(field.fieldId, cropYear(dateText));
      const age = lastDate ? U.daysBetween(lastDate, dateText) : 999;
      if (age === "" || age >= 14) score += 20;
      return { field, score, lastDate };
    }).sort((a, b) => b.score - a.score || String(a.lastDate || "").localeCompare(String(b.lastDate || "")) || String(a.field.name).localeCompare(String(b.field.name)));
  }

  function renderDecisionDashboard() {
    const todayEntries = actualEntriesForDate(U.today());
    const candidates = candidatesForDate(U.today());
    const overdue = overdueSchedules();
    const rows = prioritizedDecisionFields(U.today(), candidates, overdue)
      .map((row) => row.field)
      .filter((field) => homeGroupFilter === "all" || field.fieldGroupId === homeGroupFilter || (!field.fieldGroupId && homeGroupFilter === ""))
      ;
    const groupOptions = [`<option value="all">すべてのグループ（${state.activeFields().length}圃場）</option>`, ...homeGroups().map((group) => `<option value="${U.attr(group.fieldGroupId)}" ${group.fieldGroupId === homeGroupFilter ? "selected" : ""}>${U.escapeHTML(group.name)}（${group.count}圃場）</option>`)].join("");
    return `
      <section class="home-decision-hero">
        <div><p>${U.escapeHTML(U.fd(U.today()))}</p><h2>おはようございます</h2><small>${U.escapeHTML(candidates.length ? `今日は${candidates.length}件の確認があります` : "今日は確認候補はありません")}</small></div>
        <button type="button" class="primary" data-home-quick-record>記録を追加</button>
      </section>
      <section class="home-decision-summary" aria-label="今日の状況">
        <div><b>${U.escapeHTML(String(candidates.length))}</b><span>確認候補</span></div>
        <div><b>${U.escapeHTML(String(overdue.length))}</b><span>期限超過</span></div>
        <div><b>${U.escapeHTML(String(todayEntries.length))}</b><span>今日の記録</span></div>
        <div><b>${U.escapeHTML(String(activeWaterCount(U.today())))}</b><span>進行中の水管理</span></div>
      </section>
      ${renderTodayPlans(U.today())}
      <section class="home-decision-section">
        <div class="home-decision-section-head"><div><h3>全圃場</h3><small>今日の状況を優先順に表示</small></div><select data-home-group-filter aria-label="圃場グループを絞り込む">${groupOptions}</select></div>
        <div class="home-decision-list">${rows.length ? rows.map(renderDecisionFieldCard).join("") : '<div class="farm-empty">このグループには圃場がありません。</div>'}</div>
      </section>
    `;
  }

  function renderHeader() {
    if (viewMode === "dashboard") {
      return `
        <header class="farm-calendar-header home-dashboard-header">
          <div><h1>ホーム</h1><p>今年の記録を、来年の判断につなげます</p></div>
        </header>
      `;
    }
    const year = toLocal(anchorDate).getFullYear();
    return `
      <header class="farm-calendar-header">
        <div>
          <h1>カレンダー</h1>
          <p>圃場ごとの作業・生育・写真をまとめて確認</p>
        </div>
        <div class="farm-calendar-actions">
          <button type="button" class="farm-year-button" data-home-today>📅 ${year}年</button>
        </div>
      </header>
      <div class="farm-view-tabs" role="tablist">
        ${["month:月表示", "week:週表示", "list:リスト", "progress:進捗"].map((item) => {
          const [key, label] = item.split(":");
          return `<button type="button" class="${viewMode === key ? "active" : ""}" data-home-view="${key}">${label}</button>`;
        }).join("")}
      </div>
      <div class="farm-filter-row">
        <select data-home-field-filter>${fieldOptions()}</select>
        <button type="button" class="farm-menu-button" data-home-filter>絞込</button>
        <button type="button" data-home-prev>‹</button>
        <button type="button" data-home-next>›</button>
      </div>
      ${renderTodayOverview()}
    `;
  }

  function renderWeekView() {
    const dates = weekDates();
    const start = dates[0];
    const end = dates[dates.length - 1];
    return `
      <section class="farm-calendar-panel">
        <div class="farm-panel-title">
          <button type="button" data-home-prev>‹</button>
          <h2>${U.escapeHTML(U.fd(start))} 〜 ${U.escapeHTML(U.fd(end))}</h2>
          <button type="button" data-home-this-week>今週</button>
        </div>
        <div class="farm-week-scroll">
          <div class="farm-week-grid" style="--day-count:${dates.length}">
            <div class="farm-week-corner">圃場</div>
            ${dates.map((date) => `<div class="farm-week-day ${date === U.today() ? "today" : ""}">${dayLabel(date)}</div>`).join("")}
            ${fields().map((field) => `
              <button type="button" class="farm-week-field" data-home-open-field="${U.attr(field.fieldId)}">
                <img src="assets/images/light-icons/rice-clump.png" alt="">
                <b>${U.escapeHTML(field.name)}</b>
                <small>${U.escapeHTML(fieldVariety(field))} / ${U.escapeHTML(areaText(field))}</small>
              </button>
              ${dates.map((date) => {
                const entries = entriesForCell(date, field).slice(0, 2);
                return `
                  <button type="button" class="farm-week-cell ${entries.length ? "has-event" : ""} ${entries.length > 1 ? "multi-event" : ""} ${date === U.today() ? "today-col" : ""}" data-home-date="${U.attr(date)}" data-home-field="${U.attr(field.fieldId)}">
                    ${entries.length ? entries.map((entry) => eventPill(entry, true)).join("") : "<span></span>"}
                  </button>
                `;
              }).join("")}
            `).join("")}
          </div>
        </div>
        <div class="farm-legend">
          <span><i class="work"></i>作業</span>
          <span><i class="growth"></i>生育</span>
          <span><i class="photo"></i>写真</span>
          <span><i class="candidate"></i>確認候補</span>
          <span><i class="water"></i>水管理</span>
        </div>
        ${renderTodaySchedule(dates[3] || U.today())}
      </section>
    `;
  }

  function renderMonthView() {
    const month = monthStart();
    const days = RiceOS.calendar.daysForMonth(month);
    return `
      <section class="farm-calendar-panel">
        <div class="farm-panel-title">
          <button type="button" data-home-prev>‹</button>
          <h2>${monthLabel(month)}</h2>
          <button type="button" data-home-today>今日</button>
        </div>
        <div class="farm-month-grid">
          ${["日", "月", "火", "水", "木", "金", "土"].map((day) => `<strong>${day}</strong>`).join("")}
          ${days.map((date) => {
            const inMonth = date.slice(0, 7) === month.slice(0, 7);
            const entries = entriesForDate(date);
            return `
              <button type="button" class="farm-month-day ${inMonth ? "" : "muted"} ${entries.length ? "has-event" : ""} ${entries.length > 1 ? "multi-event" : ""} ${date === U.today() ? "today" : ""}" data-home-date="${U.attr(date)}">
                <b>${toLocal(date).getDate()}</b>
                <span class="farm-month-events" style="--event-count:${entries.length ? 1 : 0}">
                  ${entries.slice(0, 1).map((entry) => eventPill(entry, "month")).join("")}
                </span>
                ${entries.length > 1 ? `<em class="farm-month-more">+${entries.length - 1}件</em>` : ""}
              </button>
            `;
          }).join("")}
        </div>
        ${renderCandidateCard()}
      </section>
    `;
  }

  function listEntries() {
    const start = addDays(anchorDate, -20);
    const end = addDays(anchorDate, 30);
    const rows = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      entriesForDate(date).forEach((entry) => rows.push({ date, entry }));
    }
    const grouped = [];
    const candidateMap = new Map();
    rows.forEach((row) => {
      if (row.entry.kind !== "candidate") {
        grouped.push(row);
        return;
      }
      const fieldId = entryFieldIds(row.entry)[0] || "";
      const key = `${row.date}:${fieldId}`;
      if (!candidateMap.has(key)) {
        const field = state.field(fieldId);
        const item = {
          date: row.date,
          entry: {
            kind: "candidate",
            title: row.entry.title,
            subtitle: field ? field.name : row.entry.subtitle,
            record: { fieldId },
            candidateTitles: [row.entry.title]
          }
        };
        candidateMap.set(key, item);
        grouped.push(item);
        return;
      }
      const item = candidateMap.get(key);
      if (!item.entry.candidateTitles.includes(row.entry.title)) item.entry.candidateTitles.push(row.entry.title);
      item.entry.title = `${item.entry.candidateTitles.slice(0, 2).map((title) => title.replace("確認候補", "")).join("・")}確認候補`;
      if (item.entry.candidateTitles.length > 2) item.entry.title = `確認候補 ${item.entry.candidateTitles.length}件`;
    });
    return grouped.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 36);
  }

  function renderListView() {
    const rows = listEntries();
    return `
      <section class="farm-calendar-panel farm-list-panel">
        <div class="farm-panel-title">
          <h2>${monthLabel(anchorDate)}</h2>
          <select data-home-field-filter>${fieldOptions()}</select>
        </div>
        <div class="farm-list">
          ${rows.length ? rows.map(({ date, entry }) => {
            const field = state.field(entryFieldIds(entry)[0]);
            return `
              <button type="button" class="farm-list-row ${eventTone(entry)}" data-home-date="${U.attr(date)}" data-home-field="${U.attr(field && field.fieldId || "")}">
                <time>${U.escapeHTML(shortDate(date))}<small>${U.escapeHTML(U.weekday(date))}</small></time>
                <span>${eventIcon(entry)}</span>
                <b>${U.escapeHTML(eventLabel(entry))}</b>
                <em>${U.escapeHTML(field ? `${field.name} / ${areaText(field)}` : entry.subtitle || "")}</em>
                <mark>${U.escapeHTML(entryStatusLabel(entry))}</mark>
                <i>›</i>
              </button>
            `;
          }).join("") : '<div class="farm-empty">この期間の記録はまだありません</div>'}
        </div>
      </section>
    `;
  }

  function progressPercent(current, target) {
    const c = U.number(current, 0);
    const t = U.number(target, 0);
    if (!t) return 0;
    return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
  }

  function accumulatedTempTarget(field) {
    const variety = field ? state.variety(field.varietyId) : null;
    return U.number(variety && variety.headingAccumulatedTempTarget, 1600) || 1600;
  }

  function panicleTempTarget(field) {
    const variety = field ? state.variety(field.varietyId) : null;
    return U.number(variety && variety.panicleAccumulatedTempTarget, 1000) || 1000;
  }

  function ripeningTempTarget(field) {
    const variety = field ? state.variety(field.varietyId) : null;
    return U.number(variety && variety.ripeningAccumulatedTempTarget, 1000) || 1000;
  }

  function heatCacheKey(field, planting, date) {
    const location = state.data().meta && state.data().meta.weatherLocation || {};
    return [field && field.fieldId, planting, date, location.latitude, location.longitude, location.updatedAt].join(":");
  }

  function heatPace(cached) {
    const rows = cached && Array.isArray(cached.rows) ? cached.rows : [];
    const valid = rows.filter((row) => row.tempMean !== "" && Number.isFinite(Number(row.tempMean)));
    const recent = valid.slice(-10);
    const source = recent.length ? recent : valid;
    if (!source.length) return 0;
    const total = source.reduce((sum, row) => sum + Number(row.tempMean), 0);
    return Math.round((total / source.length) * 10) / 10;
  }

  function heatEtaLabel(total, target, pace, reachedLabel, pendingLabel) {
    if (total === "" || !pace) return `${pendingLabel}: 計算中`;
    if (Number(total) >= Number(target)) return `${reachedLabel}: 到達`;
    const days = Math.max(1, Math.ceil((Number(target) - Number(total)) / pace));
    return `${pendingLabel}: あと${days}日ごろ (${U.fd(addDays(U.today(), days))})`;
  }

  function heatEtaFromProjection(total, target, rows, reachedLabel, pendingLabel) {
    if (total === "") return `${pendingLabel}: 計算中`;
    if (Number(total) >= Number(target)) return `${reachedLabel}: 到達`;
    let sum = Number(total);
    const validRows = (rows || []).filter((row) => row.tempMean !== "" && Number.isFinite(Number(row.tempMean)));
    for (const row of validRows) {
      sum += Number(row.tempMean);
      if (sum >= Number(target)) {
        const days = Math.max(1, U.daysBetween(U.today(), row.date));
        return `${pendingLabel}: あと${days}日ごろ (${U.fd(row.date)})`;
      }
    }
    const pace = heatPace({ rows: validRows });
    return heatEtaLabel(total, target, pace, reachedLabel, pendingLabel);
  }

  function renderHeatForecast(cached, total, panicleTarget, target, panicleConfirmed) {
    const pace = heatPace(cached);
    if (!cached || cached.error) return "";
    const projectionRows = cached.projectionRows || [];
    const basis = projectionRows.length ? "今年実測 + 7日予報 + 昨年同時期" : (pace ? `直近ペース ${pace}℃/日` : "気温データ確認中");
    return `
      <div class="farm-heat-forecast">
        <span>${U.escapeHTML(`予測: ${basis}`)}</span>
        ${panicleConfirmed ? "" : `<b>${U.escapeHTML(projectionRows.length ? heatEtaFromProjection(total, panicleTarget, projectionRows, "幼穂形成", "幼穂形成まで") : heatEtaLabel(total, panicleTarget, pace, "幼穂形成", "幼穂形成まで"))}</b>`}
        <b>${U.escapeHTML(projectionRows.length ? heatEtaFromProjection(total, target, projectionRows, "出穂目安", "出穂目安まで") : heatEtaLabel(total, target, pace, "出穂目安", "出穂目安まで"))}</b>
      </div>
    `;
  }

  function validTempRows(rows) {
    return (rows || [])
      .filter((row) => row && row.date && row.tempMean !== "" && Number.isFinite(Number(row.tempMean)))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function accumulatedFromRows(rows, startDate, endDate) {
    const validRows = validTempRows(rows).filter((row) => row.date >= startDate && row.date <= endDate);
    const total = validRows.reduce((sum, row) => sum + Number(row.tempMean), 0);
    return {
      count: validRows.length,
      total: Math.round(total * 10) / 10
    };
  }

  function targetDateFromRows(rows, target) {
    let sum = 0;
    for (const row of validTempRows(rows)) {
      sum += Number(row.tempMean);
      if (sum >= Number(target)) return row.date;
    }
    return "";
  }

  function actualHeadingDate(field, dateText) {
    if (!field) return "";
    const year = cropYear(dateText);
    if (state.growthSummaryFor) return state.growthSummaryFor(field.fieldId, year, dateText).headingDate;
    const observedLog = state.growthLogsFor(field.fieldId)
      .filter((row) => String(row.date || "").startsWith(`${year}-`))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .find((row) => row.headingObserved);
    if (observedLog) return observedLog.date;
    const workDate = state.fieldWorksFor(field.fieldId)
      .filter((work) => String(work.date || "").startsWith(`${year}-`) && /出穂/.test(String(work.workName || "")))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.date || "";
    if (workDate) return workDate;
    return "";
  }

  function headingDateInfo(field, cached, planting, headingTarget, dateText) {
    const actual = actualHeadingDate(field, dateText);
    if (actual) return { date: actual, source: "出穂確認", actual: true };
    const currentPanicleLog = panicleLogForYear(field.fieldId, cropYear(dateText), dateText);
    const panicle = RiceOS.agro && RiceOS.agro.panicleEstimate && currentPanicleLog
      ? RiceOS.agro.panicleEstimate(field, currentPanicleLog.panicleLengthMm, currentPanicleLog.date)
      : null;
    if (panicle && panicle.date) return { ...panicle, source: panicle.source, actual: false };
    const rows = [
      ...validTempRows(cached && cached.rows),
      ...validTempRows(cached && cached.projectionRows)
    ];
    const heatDate = targetDateFromRows(rows, headingTarget);
    if (heatDate) return { date: heatDate, source: "積算気温から推定", actual: false };
    const variety = field ? state.variety(field.varietyId) : null;
    const headingDays = varietyDayTarget(variety, "headingDaysAfterPlanting", 85);
    return planting ? { date: addDays(planting, headingDays), source: "日数目安から推定", actual: false } : { date: "", source: "", actual: false };
  }

  function ripeningStatus(total, target, heading) {
    if (!heading || !heading.date) return { label: "出穂日待ち", tone: "muted", note: "出穂確認を記録すると収穫目安を出します" };
    if (heading.date > U.today()) return { label: "出穂前", tone: "muted", note: `${U.fd(heading.date)}ごろから登熟計算` };
    if (total === "") return { label: "計算中", tone: "muted", note: "気温データを確認中" };
    const ratio = Number(total) / Math.max(1, Number(target));
    if (ratio >= 1) return { label: "収穫適期近い", tone: "ready", note: "籾水分と天気を見て現場確認" };
    if (ratio >= 0.85) return { label: "収穫確認候補", tone: "warn", note: "穂色・倒伏・天気を確認" };
    if (ratio >= 0.55) return { label: "登熟中", tone: "ok", note: "登熟の進みを継続確認" };
    return { label: "まだ早い", tone: "early", note: "登熟初期。水管理と倒伏を確認" };
  }

  function renderRipeningHeatMeter(field, cached, planting, headingTarget) {
    const date = U.today();
    const target = ripeningTempTarget(field);
    const heading = headingDateInfo(field, cached, planting, headingTarget, date);
    const availableRows = validTempRows(cached && cached.rows);
    const projectionRows = validTempRows(cached && cached.projectionRows);
    const canUseRows = heading.date && cached && !cached.error;
    const today = date;
    const actual = canUseRows && heading.date <= today ? accumulatedFromRows(availableRows, heading.date, today) : { count: 0, total: "" };
    const futureRows = canUseRows && Number(actual.total || 0) < target
      ? projectionRows.filter((row) => row.date > today && row.date >= heading.date)
      : [];
    const percent = actual.total === "" ? 0 : progressPercent(actual.total, target);
    const status = ripeningStatus(actual.total, target, heading);
    const projectedEta = futureRows.length
      ? heatEtaFromProjection(actual.total || 0, target, futureRows, "収穫目安", "収穫目安まで")
      : heatEtaLabel(actual.total || "", target, heatPace({ rows: availableRows.slice(-10) }), "収穫目安", "収穫目安まで");
    const title = !heading.date
      ? "出穂日待ち"
      : heading.date > today
        ? "出穂前"
        : actual.count
          ? `${Math.round(actual.total)}℃`
          : "取得中";
    const note = !planting
      ? "田植え作業を登録すると計算します"
      : !heading.date
        ? "出穂確認か出穂目安が必要です"
        : `${U.fd(heading.date)}から${actual.count}日分 / ${heading.source}`;
    return `
      <section class="farm-heat-meter farm-heat-meter-ripening">
        <div class="farm-heat-meter-head">
          <span>🌾</span>
          <div>
            <b>出穂後積算</b>
            <small>${U.escapeHTML(note)}</small>
          </div>
          <strong>${U.escapeHTML(title)}</strong>
        </div>
        <div class="farm-heat-bar ripening">
          <em style="width:${U.attr(String(percent))}%"></em>
        </div>
        <div class="farm-heat-forecast">
          <span>${U.escapeHTML(heading.actual ? "実測の出穂確認日を起点に計算" : "出穂日は推定です。実測を記録すると置き換わります")}</span>
          <mark class="farm-harvest-status ${U.attr(status.tone)}">${U.escapeHTML(status.label)}<small>${U.escapeHTML(status.note)}</small></mark>
          <b>${U.escapeHTML(projectedEta)}</b>
        </div>
        <div class="farm-heat-scale farm-heat-scale-two">
          <span>出穂</span>
          <span>登熟</span>
          <span>収穫目安 ${U.escapeHTML(String(target))}℃</span>
        </div>
      </section>
    `;
  }

  function renderHeatMeter(field) {
    const planting = plantingDateForYear(field.fieldId, cropYear(U.today()));
    const panicleLog = panicleLogForYear(field.fieldId, cropYear(U.today()), U.today());
    const target = accumulatedTempTarget(field);
    const panicleTarget = panicleTempTarget(field);
    const key = heatCacheKey(field, planting, U.today());
    const cached = heatCache.get(key);
    const total = cached && cached.total !== undefined ? cached.total : "";
    const count = cached && cached.count || 0;
    const percent = total === "" ? 0 : progressPercent(total, target);
    const paniclePercent = progressPercent(panicleTarget, target);
    const title = total === "" ? "積算気温を取得中" : `${Math.round(total)}℃`;
    const note = !planting
      ? "田植え作業を登録すると計算します"
      : cached && cached.error
        ? cached.error
        : count
          ? `${U.fd(planting)}から${count}日分 / 出穂目安 ${target}℃`
          : "圃場付近の天気データを確認中";
    return `
      <div class="farm-heat-stack" data-heat-field="${U.attr(field.fieldId)}">
        <section class="farm-heat-meter">
          <div class="farm-heat-meter-head">
            <span>🔥</span>
            <div>
              <b>積算気温</b>
              <small>${U.escapeHTML(note)}</small>
            </div>
            <strong>${U.escapeHTML(title)}</strong>
          </div>
          <div class="farm-heat-bar">
            ${panicleLog ? "" : `<i style="left:${U.attr(String(paniclePercent))}%"></i>`}
            <em style="width:${U.attr(String(percent))}%"></em>
          </div>
          ${renderHeatForecast(cached, total, panicleTarget, target, Boolean(panicleLog))}
          <div class="farm-heat-scale">
            <span>田植え</span>
            <span>${panicleLog ? `幼穂確認済み ${U.escapeHTML(U.fd(panicleLog.date))}` : `幼穂 ${U.escapeHTML(String(panicleTarget))}℃`}</span>
            <span>出穂 ${U.escapeHTML(String(target))}℃</span>
          </div>
        </section>
        ${renderRipeningHeatMeter(field, cached, planting, target)}
      </div>
    `;
  }

  function fieldWorksMatching(fieldId, names, year) {
    return state.fieldWorksFor(fieldId, year)
      .filter((work) => names.some((name) => String(work.workName || "").includes(name)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function latestDryPeriod(fieldId, year, throughDate) {
    return (state.dryPeriodsFor ? state.dryPeriodsFor(fieldId, year) : [])
      .filter((row) => row.startDate || row.actualEndDate || row.endDate)
      .filter((row) => !throughDate || String(row.startDate || row.date || row.actualEndDate || "") <= String(throughDate))
      .slice()
      .sort((a, b) => String(b.date || b.actualEndDate || b.startDate).localeCompare(String(a.date || a.actualEndDate || a.startDate)))[0] || null;
  }

  function dryDiffText(planned, actual) {
    if (planned === "" || actual === "") return "";
    const diff = actual - planned;
    if (diff === 0) return "予定どおり";
    return diff > 0 ? `予定より${diff}日長い` : `予定より${Math.abs(diff)}日短い`;
  }

  function latestIrrigation(fieldId, year) {
    return (state.irrigationsFor ? state.irrigationsFor(fieldId, year) : [])
      .filter((row) => /間断灌水/.test(String(row.method || "")))
      .slice()
      .sort((a, b) => String(b.date || b.startDate).localeCompare(String(a.date || a.startDate)))[0] || null;
  }

  function latestWaterPeriod(fieldId, year, throughDate) {
    return waterRows(resolvedWaterPeriods(fieldId, year, throughDate), "intermittent")
      .concat(waterRows(resolvedWaterPeriods(fieldId, year, throughDate), "saturated"))
      .concat(waterRows(resolvedWaterPeriods(fieldId, year, throughDate), "deep"))
      .concat(waterRows(resolvedWaterPeriods(fieldId, year, throughDate), "drain"))
      .filter((row) => row.startDate)
      .filter((row) => !row.actualEndDate || !throughDate || row.actualEndDate > throughDate)
      .slice()
      .sort((a, b) => String(b.startDate || b.date || "").localeCompare(String(a.startDate || a.date || "")))[0] || null;
  }

  function waterStageForField(field, dateText) {
    const date = dateText || U.today();
    const year = cropYear(date);
    const planting = plantingDateForYear(field.fieldId, year);
    if (!planting) return { key: "waiting", label: "水管理", value: "田植日未登録", percent: 0, detail: "今年度の田植日が未登録です。" };
    const periods = resolvedWaterPeriods(field.fieldId, year, date);
    const dryPeriod = waterRows(periods, "dry").at(-1) || null;
    const dryStart = dryPeriod && dryPeriod.startDate || "";
    const dryEnd = dryPeriod && dryPeriod.endDate || "";
    const dryActualEnd = dryPeriod && dryPeriod.actualEndDate || "";
    const dryTargetDays = U.number(dryPeriod && dryPeriod.targetDays, 0);
    const irrigation = latestWaterPeriod(field.fieldId, year, date);
    const dryIsCurrent = dryStart && (!dryActualEnd || String(dryActualEnd) > String(date));
    const latestIsIrrigation = irrigation && irrigation.startDate
      && (!dryStart || String(irrigation.startDate) >= String(dryStart));
    if (latestIsIrrigation) {
      const irrigationEnd = irrigation.actualEndDate || irrigation.endDate || "";
      const irrigationState = irrigation.actualEndDate ? "完了" : (irrigation.periodStatus || irrigation.status || "実施中");
      const key = /深水/.test(String(irrigation.method || "")) ? "deep" : (/飽水/.test(String(irrigation.method || "")) ? "saturated" : (/落水/.test(String(irrigation.method || "")) ? "drainage" : "intermittent"));
      return { key, label: irrigation.method || "水管理", value: irrigationState, percent: irrigation.actualEndDate ? 100 : 50, detail: irrigationEnd ? `期間 ${U.fd(irrigation.startDate)} - ${U.fd(irrigationEnd)}` : `開始 ${U.fd(irrigation.startDate)} / 終了未登録` };
    }
    if (dryIsCurrent) {
      const elapsed = U.daysBetween(dryStart, date);
      const period = dryTargetDays ? `${elapsed} / ${dryTargetDays}日` : `${elapsed}日`;
      return { key: "drying", label: "中干し", value: `実施中 ${period}`, percent: dryTargetDays ? progressPercent(elapsed, dryTargetDays) : 0, detail: dryEnd ? `開始 ${U.fd(dryStart)} / 予定終了 ${U.fd(dryEnd)}` : `開始 ${U.fd(dryStart)} / 終了未登録` };
    }
    if (dryStart) return { key: "drying", label: "中干し", value: dryActualEnd ? "完了" : "実施中", percent: dryActualEnd ? 100 : 50, detail: dryActualEnd ? `期間 ${U.fd(dryStart)} - ${U.fd(dryActualEnd)}` : `開始 ${U.fd(dryStart)} / 終了未登録` };
    return { key: "waiting", label: "水管理", value: "未記録", percent: 0, detail: "今年度の水管理期間は未登録です。" };
  }

  function renderWaterStageCard(field) {
    const stage = waterStageForField(field, U.today());
    return `
      <section class="farm-water-stage ${U.attr(stage.key)}">
        <div class="farm-water-stage-head"><span>水管理の現在地</span><b>${U.escapeHTML(stage.label)}</b></div>
        <div class="farm-water-stage-main"><strong>${U.escapeHTML(stage.value)}</strong><p>${U.escapeHTML(stage.detail)}</p></div>
        <i><em style="width:${U.attr(String(stage.percent))}%"></em></i>
      </section>
    `;
  }

  function latestProgressGrowth(fieldId, year) {
    return state.growthLogsFor(fieldId, year)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function varietyDayTarget(variety, key, fallback) {
    return U.number(variety && variety[key], fallback) || fallback;
  }

  function progressRowsForField(field) {
    const year = cropYear(U.today());
    const planting = plantingDateForYear(field.fieldId, year);
    const dap = planting ? U.daysBetween(planting, U.today()) : "";
    const dryPeriod = waterRows(resolvedWaterPeriods(field.fieldId, year, U.today()), "dry").at(-1) || null;
    const dryStart = dryPeriod && dryPeriod.startDate || "";
    const dryEnd = dryPeriod && dryPeriod.endDate || "";
    const dryActualEnd = dryPeriod && dryPeriod.actualEndDate || "";
    const dryDays = U.number(dryPeriod && dryPeriod.targetDays, 0);
    const dryPlannedDays = dryStart && dryEnd ? U.daysBetween(dryStart, dryEnd) : dryDays;
    const dryActualDays = dryStart && dryActualEnd ? U.daysBetween(dryStart, dryActualEnd) : "";
    const dryElapsed = dryStart ? U.daysBetween(dryStart, U.today()) : "";
    const herbicide = fieldWorksMatching(field.fieldId, ["除草", "除草剤"], year)[0];
    const growth = latestProgressGrowth(field.fieldId, year);
    const variety = state.variety(field.varietyId);
    const targetTillers = variety && variety.targetTillers || "";
    const herbicideDays = varietyDayTarget(variety, "herbicideDaysAfterPlanting", 7);
    const panicleDays = varietyDayTarget(variety, "panicleInitiationDaysAfterPlanting", 60);
    const headingDays = varietyDayTarget(variety, "headingDaysAfterPlanting", 85);
    const panicleTemp = variety && variety.panicleAccumulatedTempTarget || "";
    const headingTemp = variety && variety.headingAccumulatedTempTarget || "";
    const headingDate = actualHeadingDate(field, U.today());
    const currentPanicleLog = panicleLogForYear(field.fieldId, year, U.today());
    const panicle = RiceOS.agro && RiceOS.agro.panicleEstimate && currentPanicleLog
      ? RiceOS.agro.panicleEstimate(field, currentPanicleLog.panicleLengthMm, currentPanicleLog.date)
      : null;
    const previousPanicle = previousPanicleReference(field.fieldId, U.today());
    const ripeningElapsed = headingDate ? U.daysBetween(headingDate, U.today()) : "";
    const ripeningTarget = ripeningTempTarget(field);
    const waterStage = waterStageForField(field, U.today());
    const afterDrying = Boolean(dryActualEnd);
    return [
      {
        tone: "green",
        icon: "🌾",
        title: "田植え後",
        value: dap === "" ? "未登録" : `${dap}日`,
        note: planting ? `田植日 ${U.fd(planting)}` : "田植え作業を登録してください",
        percent: dap === "" ? 0 : progressPercent(dap, 120)
      },
      {
        tone: dryStart ? "water" : "amber",
        icon: "💧",
        title: "中干し",
        value: dryActualEnd ? (dryActualDays !== "" ? `完了 ${dryActualDays}日` : "完了") : (dryStart ? (dryDays ? `実施中 ${dryElapsed} / ${dryDays}日` : `実施中 ${dryElapsed}日`) : "未記録"),
        note: dryActualEnd
          ? `完了 ${U.fd(dryActualEnd)} / 予定${dryPlannedDays}日 ${dryDiffText(dryPlannedDays, dryActualDays)}`
          : (dryStart ? `開始 ${U.fd(dryStart)} / 終了未登録` : "今年度の中干し期間は未登録です"),
        percent: dryActualEnd ? 100 : (dryStart && dryDays ? progressPercent(dryElapsed, dryDays) : 0)
      },
      {
        tone: herbicide ? "green" : "orange",
        icon: "🧪",
        title: herbicide ? "除草剤散布" : "除草剤目安",
        value: herbicide ? "記録済み" : (dap === "" ? "未判定" : `${dap}日経過`),
        note: herbicide ? `${U.fd(herbicide.date)} ${herbicide.workName}` : `初期剤は田植え後${herbicideDays}日前後を目安に確認`,
        percent: herbicide ? 100 : (dap === "" ? 0 : progressPercent(dap, herbicideDays))
      },
      currentPanicleLog ? null : {
        tone: "amber",
        icon: "🌿",
        title: "幼穂形成期",
        value: previousPanicle && previousPanicle.dap !== "" ? `前年は田植後${previousPanicle.dap}日` : (dap === "" ? "未判定" : (dap >= panicleDays ? `${dap}日経過` : `あと${panicleDays - dap}日`)),
        note: previousPanicle ? `前年確認 ${U.fd(previousPanicle.log.date)} / 今年は現地で確認` : (panicleTemp ? `日数目安 ${panicleDays}日 / 積算気温目標 ${panicleTemp}` : `田植え後${panicleDays}日前後を目安に確認`),
        percent: dap === "" ? 0 : progressPercent(dap, panicleDays)
      },
      {
        tone: "green",
        icon: "🌾",
        title: headingDate ? "出穂" : "出穂目安",
        value: headingDate ? "確認済み" : (panicle && panicle.supported ? `あと約${panicle.daysToHeading}日` : (dap === "" ? "未判定" : (dap >= headingDays ? `${dap}日経過` : `あと${headingDays - dap}日`))),
        note: headingDate
          ? `出穂 ${U.fd(headingDate)}`
          : (panicle && panicle.supported ? `幼穂${panicle.lengthMm}mm / ${U.fd(panicle.date)}ごろ` : (currentPanicleLog ? `幼穂確認 ${U.fd(currentPanicleLog.date)} / 出穂確認へ` : (headingTemp ? `日数目安 ${headingDays}日 / 積算気温目標 ${headingTemp}` : `田植え後${headingDays}日前後を目安に確認`))),
        percent: headingDate ? 100 : (panicle && panicle.supported && planting ? progressPercent(dap, Math.max(1, U.daysBetween(planting, panicle.date))) : (dap === "" ? 0 : progressPercent(dap, headingDays)))
      },
      {
        tone: headingDate ? "orange" : "amber",
        icon: "🌾",
        title: "収穫目安",
        value: headingDate ? `出穂後${ripeningElapsed}日` : "出穂未確認",
        note: headingDate ? `出穂 ${U.fd(headingDate)} / 出穂後積算 ${ripeningTarget}℃目安` : "生育ログで出穂確認を入れると精度が上がります",
        percent: headingDate ? progressPercent(ripeningElapsed, 45) : 0
      },
      {
        tone: "blue",
        icon: "🌱",
        title: afterDrying ? "生育確認" : "分げつ確認",
        value: growth ? (afterDrying && currentPanicleLog ? `葉色${growth.leafColorScore || "-"}` : `分げつ${growth.tillerCount || "-"}本`) : "未入力",
        note: afterDrying ? (currentPanicleLog ? "幼穂確認済み。次は葉色・出穂を確認" : "中干し後は葉色・幼穂長を中心に確認") : (targetTillers ? `中干し前目標 ${targetTillers}` : "栽培レシピで目標設定"),
        percent: afterDrying ? (currentPanicleLog ? 78 : 55) : (growth && growth.tillerCount ? progressPercent(U.number(growth.tillerCount, 0), U.number(String(targetTillers).match(/\\d+/)?.[0], 22)) : 0)
      },
      {
        tone: "water",
        icon: "〰",
        title: waterStage.label,
        value: waterStage.value,
        note: waterStage.detail,
        percent: waterStage.percent
      }
    ].filter(Boolean);
  }

  function renderProgressRow(row) {
    return `
      <div class="farm-progress-row ${U.attr(row.tone)}">
        <span class="farm-progress-icon">${U.escapeHTML(row.icon)}</span>
        <div>
          <b>${U.escapeHTML(row.title)}</b>
          <small>${U.escapeHTML(row.note)}</small>
          <i><em style="width:${U.attr(String(row.percent))}%"></em></i>
        </div>
        <strong>${U.escapeHTML(row.value)}</strong>
      </div>
    `;
  }

  function renderProgressView() {
    const rows = fields().slice(0, 8);
    return `
      <section class="farm-calendar-panel farm-progress-panel">
        <div class="farm-panel-title farm-progress-title">
          <h2>田植えからの進捗</h2>
          <button type="button" data-home-today>今日</button>
        </div>
        <div class="farm-progress-list">
          ${rows.map((field) => `
            <article class="farm-progress-card">
              <header>
                <img src="assets/images/light-icons/rice-panicle.png" alt="">
                <div>
                  <b>${U.escapeHTML(field.name)}</b>
                  <small>${U.escapeHTML(fieldVariety(field))} / ${U.escapeHTML(areaText(field))}</small>
                </div>
              </header>
              ${renderFieldProgressSummary(field)}
              ${renderWaterStageCard(field)}
              ${renderHeatMeter(field)}
              ${progressRowsForField(field).map(renderProgressRow).join("")}
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderFieldProgressSummary(field) {
    const planting = plantingDateForYear(field.fieldId, cropYear(U.today()));
    const dap = planting ? U.daysBetween(planting, U.today()) : "";
    const candidates = candidatesForDate(U.today()).filter((entry) => entryFieldIds(entry).includes(field.fieldId));
    const next = progressRowsForField(field).find((row) => row.value && String(row.value).includes("あと"));
    return `
      <div class="farm-progress-summary">
        <span><b>${U.escapeHTML(dap === "" ? "-" : `${dap}日`)}</b><small>田植後</small></span>
        <span class="${candidates.length ? "warn" : "ok"}"><b>${U.escapeHTML(String(candidates.length))}</b><small>確認候補</small></span>
        <span><b>${U.escapeHTML(next ? next.title : "通常")}</b><small>${U.escapeHTML(next ? next.value : "大きな候補なし")}</small></span>
      </div>
    `;
  }

  function renderCandidateCard() {
    const rows = candidateGroupsForDate(U.today()).slice(0, 3);
    return `
      <section class="farm-candidate-card">
        <div>
          <h3>今日の確認候補</h3>
          <button type="button" data-home-view="list">すべて見る ›</button>
        </div>
        ${rows.length ? rows.map((group) => {
          const field = group.field;
          const planting = field ? plantingDateForYear(field.fieldId, cropYear(U.today())) : "";
          const dap = planting ? U.daysBetween(planting, U.today()) : "";
          return `
            <button type="button" class="farm-candidate-row" data-home-date="${U.attr(U.today())}" data-home-field="${U.attr(field && field.fieldId || "")}">
              <img src="assets/images/light-icons/rice-panicle.png" alt="">
              <span>
                <b>${U.escapeHTML(field && field.name || "圃場")}</b>
                <em>${U.escapeHTML(group.entries.map((entry) => entry.title.replace("確認候補", "")).join("・"))}確認候補</em>
                <small>${dap !== "" ? `田植え後${dap}日` : "田植日未登録"}・${U.escapeHTML(String(group.entries.length))}件を現場確認</small>
              </span>
              <i>›</i>
            </button>
          `;
        }).join("") : '<div class="farm-empty">今日の確認候補はありません</div>'}
      </section>
    `;
  }

  function renderTodaySchedule(date) {
    const rows = fields().map((field) => ({ field, entries: entriesForCell(date, field) })).filter((row) => row.entries.length).slice(0, 2);
    return `
      <section class="farm-today-card">
        <h3>${U.escapeHTML(shortDate(date))}（${U.escapeHTML(U.weekday(date))}）の予定</h3>
        <div class="farm-today-grid">
          ${rows.length ? rows.map((row) => `
            <div class="farm-today-field">
              <b>${U.escapeHTML(row.field.name)} <small>(${U.escapeHTML(fieldVariety(row.field))} / ${U.escapeHTML(areaText(row.field))})</small></b>
              ${row.entries.slice(0, 3).map((entry) => eventPill(entry, false)).join("")}
            </div>
          `).join("") : '<div class="farm-empty">この日の予定はまだありません</div>'}
        </div>
      </section>
    `;
  }

  function render() {
    const root = U.$("homeVisualDashboard");
    if (!root) return;
    // Home is the field-status dashboard. Date-based views live in Calendar.
    viewMode = "dashboard";
    root.innerHTML = `
      <div class="farm-calendar-home">
        ${renderHeader()}
        ${renderDecisionDashboard()}
      </div>
    `;
  }

  function heatProjectionKey(location) {
    return [U.today(), location && location.latitude, location && location.longitude].join(":");
  }

  async function fetchHeatProjection(location) {
    const key = heatProjectionKey(location);
    if (heatProjectionCache.has(key)) return heatProjectionCache.get(key);
    const promise = (async () => {
      const today = U.today();
      const rows = [];
      try {
        const forecast = await RiceOS.weather.fetchDailyRange(addDays(today, 1), addDays(today, 7), location);
        rows.push(...(forecast.rows || []).map((row) => ({ ...row, basis: "forecast" })));
      } catch (error) {
        // Forecast horizons can vary. Last year's archive still gives a seasonal estimate.
      }
      try {
        const lastYear = await RiceOS.weather.fetchDailyRange(addYears(addDays(today, 8), -1), addYears(addDays(today, 120), -1), location);
        rows.push(...(lastYear.rows || []).map((row) => ({
          ...row,
          date: addYears(row.date, 1),
          basedOnDate: row.date,
          basis: "lastYear"
        })));
      } catch (error) {
        // If archive data is unavailable, the UI falls back to the recent actual pace.
      }
      return rows
        .filter((row) => row.date > today)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    })();
    heatProjectionCache.set(key, promise);
    return promise;
  }

  function waterForecastText(rows) {
    const valid = (rows || []).filter((row) => row && row.date);
    if (!valid.length) return "天気予報を取得できませんでした";
    const rainDays = valid.filter((row) => U.number(row.precipitation, 0) >= 1).length;
    const rainTotal = valid.reduce((sum, row) => sum + U.number(row.precipitation, 0), 0);
    const hotDryDays = valid.filter((row) => U.number(row.precipitation, 0) < 1 && U.number(row.tempMean, 0) >= 28).length;
    const parts = [`直近${valid.length}日予報`];
    if (rainDays) parts.push(`雨${rainDays}日 ${Math.round(rainTotal)}mm`);
    else parts.push("まとまった雨なし");
    if (hotDryDays) parts.push(`高温少雨${hotDryDays}日`);
    return `${parts.join(" / ")}。水管理の確認材料です。`;
  }

  async function hydrateWaterStageForecasts(location) {
    const targets = Array.from(document.querySelectorAll("[data-water-stage-weather]"));
    if (!targets.length || !RiceOS.weather || !RiceOS.weather.fetchDailyRange) return;
    try {
      const loc = location || await RiceOS.weather.ensureLocation();
      const key = [U.today(), loc.latitude, loc.longitude].join(":");
      if (!waterForecastCache.has(key)) {
        waterForecastCache.set(key, RiceOS.weather.fetchDailyRange(addDays(U.today(), 1), addDays(U.today(), 7), loc));
      }
      const result = await waterForecastCache.get(key);
      const text = waterForecastText(result && result.rows);
      targets.forEach((target) => { target.textContent = text; });
    } catch (error) {
      targets.forEach((target) => { target.textContent = "天気予報は取得できないため、田面と現地天気を確認"; });
    }
  }

  async function hydrateHeatMeters() {
    if (viewMode !== "progress" || !RiceOS.weather || !RiceOS.weather.fetchDailyRange) return;
    const visibleFields = fields().slice(0, 8);
    let location = null;
    let projectionRows = [];
    for (const field of visibleFields) {
      const planting = plantingDateForYear(field.fieldId, cropYear(U.today()));
      if (!planting) continue;
      const key = heatCacheKey(field, planting, U.today());
      if (!heatCache.has(key)) {
        try {
          location = location || await RiceOS.weather.ensureLocation();
          const result = await RiceOS.weather.fetchDailyRange(planting, U.today(), location);
          projectionRows = projectionRows.length ? projectionRows : await fetchHeatProjection(location);
          result.projectionRows = projectionRows;
          heatCache.set(key, result);
        } catch (error) {
          heatCache.set(key, { error: error.message || "積算気温を取得できませんでした" });
        }
      } else {
        const cached = heatCache.get(key);
        if (cached && !cached.error && !cached.projectionRows) {
          try {
            location = location || await RiceOS.weather.ensureLocation();
            projectionRows = projectionRows.length ? projectionRows : await fetchHeatProjection(location);
            cached.projectionRows = projectionRows;
          } catch (error) {
            // Keep the accumulated value visible even if prediction loading fails.
          }
        }
      }
      const target = document.querySelector(`[data-heat-field="${CSS.escape(field.fieldId)}"]`);
      if (target) target.outerHTML = renderHeatMeter(field);
    }
    hydrateWaterStageForecasts(location);
  }

  function openDate(date, fieldId) {
    if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(date || U.today(), fieldId || "");
  }

  function bind() {
    const root = U.$("homeVisualDashboard");
    if (!root || root.dataset.boundHomeCalendar === "1") return;
    root.dataset.boundHomeCalendar = "1";
    root.addEventListener("click", (event) => {
      const overview = event.target.closest("[data-home-overview]");
      if (overview) {
        const kind = overview.dataset.homeOverview;
        if (kind === "today") {
          openDate(U.today(), filterFieldId === "all" ? "" : filterFieldId);
          return;
        }
        if (kind === "progress") {
          if (RiceOS.app) RiceOS.app.show("annual");
          return;
        }
        if (RiceOS.app) RiceOS.app.show("calendar");
        return;
      }
      const view = event.target.closest("[data-home-view]");
      if (view) {
        viewMode = view.dataset.homeView;
        render();
        return;
      }
      if (event.target.closest("[data-home-open-calendar]")) {
        if (RiceOS.app) RiceOS.app.show("calendar");
        return;
      }
      if (event.target.closest("[data-home-all-fields]")) {
        if (RiceOS.app) RiceOS.app.show("fields");
        return;
      }
      if (event.target.closest("[data-home-quick-record]")) {
        // Start from the shared target picker. A visual home filter must not
        // silently turn a single record into a group record.
        openDate(U.today(), "");
        return;
      }
      const managementToggle = event.target.closest("[data-home-toggle-field]");
      if (managementToggle) {
        const fieldId = managementToggle.dataset.homeToggleField || "";
        expandedManagementFieldId = expandedManagementFieldId === fieldId ? "" : fieldId;
        render();
        return;
      }
      const fieldCard = event.target.closest("[data-home-open-field]");
      if (fieldCard) {
        const fieldId = fieldCard.dataset.homeOpenField || "";
        if (fieldId && RiceOS.navigation && RiceOS.navigation.openField) {
          RiceOS.navigation.openField(fieldId, { originScreen: "home" });
        }
        return;
      }
      if (event.target.closest("[data-home-dashboard-list]")) {
        if (RiceOS.app) RiceOS.app.show("calendar");
        return;
      }
      if (event.target.closest("[data-home-today]")) {
        anchorDate = U.today();
        render();
        return;
      }
      if (event.target.closest("[data-home-this-week]")) {
        anchorDate = U.today();
        render();
        return;
      }
      if (event.target.closest("[data-home-prev]")) {
        anchorDate = viewMode === "month" ? RiceOS.calendar.addMonths(RiceOS.calendar.monthStart(anchorDate), -1) : addDays(anchorDate, viewMode === "week" ? -7 : -30);
        render();
        return;
      }
      if (event.target.closest("[data-home-next]")) {
        anchorDate = viewMode === "month" ? RiceOS.calendar.addMonths(RiceOS.calendar.monthStart(anchorDate), 1) : addDays(anchorDate, viewMode === "week" ? 7 : 30);
        render();
        return;
      }
      const dateButton = event.target.closest("[data-home-date]");
      if (dateButton) {
        openDate(dateButton.dataset.homeDate || U.today(), dateButton.dataset.homeField || "");
      }
    });
    root.addEventListener("change", (event) => {
      const group = event.target.closest("[data-home-group-filter]");
      if (group) {
        homeGroupFilter = group.value || "all";
        render();
        return;
      }
      const select = event.target.closest("[data-home-field-filter]");
      if (!select) return;
      filterFieldId = select.value || "all";
      render();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.home = { render, bind };
})();
