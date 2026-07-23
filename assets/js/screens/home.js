(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let viewMode = "dashboard";
  let anchorDate = U.today();
  let filterFieldId = "all";
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

  function latestGrowth(fieldId) {
    return state.growthLogsFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function cropYear(dateText) {
    return String(dateText || U.today()).slice(0, 4);
  }

  function panicleLogForYear(fieldId, year) {
    return state.growthLogsFor(fieldId)
      .filter((log) => String(log.date || "").startsWith(`${year}-`) && U.number(log.panicleLengthMm, 0) > 0)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
  }

  function plantingDateForYear(fieldId, year) {
    return state.fieldWorksFor(fieldId)
      .filter((work) => String(work.date || "").startsWith(`${year}-`) && /田植/.test(String(work.workName || "")))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.date || "";
  }

  function previousPanicleReference(fieldId, dateText) {
    const currentYear = Number(cropYear(dateText));
    if (!Number.isFinite(currentYear)) return null;
    const year = String(currentYear - 1);
    const log = panicleLogForYear(fieldId, year);
    if (!log) return null;
    const planting = plantingDateForYear(fieldId, year);
    return { log, planting, dap: planting ? U.daysBetween(planting, log.date) : "" };
  }

  function latestWater(fieldId) {
    const rows = [
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(fieldId) : []),
      ...(state.irrigationsFor ? state.irrigationsFor(fieldId) : [])
    ].filter((row) => row.date || row.startDate).sort((a, b) => String(b.date || b.startDate).localeCompare(String(a.date || a.startDate)));
    return rows[0] || null;
  }

  function candidatesForDate(date) {
    if (date !== U.today()) return [];
    return state.activeFields().flatMap((field) => {
      const rows = [];
      const planting = plantingDateForYear(field.fieldId, cropYear(date));
      const dap = planting ? U.daysBetween(planting, date) : "";
      const dryStart = field.drainageStartDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し開始"], "first") : "");
      const dryEnd = field.drainageActualEndDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し終了"], "first") : "");
      const irrigationStart = field.intermittentStartDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["間断灌水開始", "湿潤灌漑開始"], "first") : "");
      if (dap !== "" && dap >= 35 && dap <= 55 && !dryStart) {
        rows.push({
          kind: "candidate",
          title: "中干し確認候補",
          subtitle: `${field.name} / 田植後${dap}日`,
          record: { fieldId: field.fieldId },
          reason: "田植え後日数から現場確認の候補です"
        });
      }
      const growth = latestGrowth(field.fieldId);
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
      const water = latestWater(field.fieldId);
      const waterActive = Boolean((dryStart && !dryEnd) || irrigationStart);
      if (waterActive && (!water || U.daysBetween(water.date || water.startDate, date) >= 5)) {
        rows.push({
          kind: "candidate",
          title: "水深確認候補",
          subtitle: field.name,
          record: { fieldId: field.fieldId },
          reason: water ? `前回 ${U.fd(water.date || water.startDate)}` : "水管理記録なし"
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
    const todayEntries = entriesForDate(U.today()).filter((entry) => entry.kind !== "candidate");
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
    return state.fieldWorksFor(fieldId)
      .filter((row) => String(row.season || String(row.date || "").slice(0, 4)) === String(year));
  }

  function seasonStageForField(field, dateText) {
    const year = cropYear(dateText);
    const works = seasonRowsForField(field.fieldId, year);
    const growth = latestGrowthForYear(field.fieldId, year);
    const panicleLog = panicleLogForYear(field.fieldId, year);
    const headingLog = state.growthLogsFor(field.fieldId).find((row) => String(row.date || "").startsWith(`${year}-`) && row.headingObserved);
    const planting = plantingDateForYear(field.fieldId, year);
    const hasWork = (pattern) => works.some((row) => pattern.test(String(row.workName || "")));
    const heading = Boolean(headingLog) || hasWork(/出穂/);
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
      ...state.growthLogsFor(fieldId),
      ...state.fieldWorksFor(fieldId),
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(fieldId) : []),
      ...(state.irrigationsFor ? state.irrigationsFor(fieldId) : [])
    ].filter((row) => String(row.season || String(row.date || "").slice(0, 4)) === String(year) && (row.photoData || row.photo));
    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function fieldMemory(field, dateText) {
    const previousDate = addYears(dateText, -1);
    const previousYear = cropYear(previousDate);
    const candidates = [
      ...state.fieldWorksFor(field.fieldId).map((row) => ({ ...row, kind: "作業", title: row.workName, text: row.memo || "" })),
      ...state.growthLogsFor(field.fieldId).map((row) => ({ ...row, kind: "生育", title: row.tillerCount ? `分げつ ${row.tillerCount}本` : "生育記録", text: row.memo || "" })),
      ...(state.dryPeriodsFor ? state.dryPeriodsFor(field.fieldId) : []).map((row) => ({ ...row, kind: "中干し", title: row.actualEndDate ? "中干し完了" : "中干し記録", text: row.memo || "" })),
      ...(state.irrigationsFor ? state.irrigationsFor(field.fieldId) : []).map((row) => ({ ...row, kind: "水管理", title: row.method || "水管理記録", text: row.memo || "" }))
    ].filter((row) => String(row.season || String(row.date || "").slice(0, 4)) === previousYear && row.date);
    const samePeriod = candidates.sort((a, b) => Math.abs(U.daysBetween(a.date, previousDate)) - Math.abs(U.daysBetween(b.date, previousDate)))[0];
    if (!samePeriod) return null;
    return { ...samePeriod, date: samePeriod.date, label: `去年の今日ごろ・${samePeriod.kind}` };
  }

  function renderSeasonTrack(stage) {
    return `
      <div class="home-season-track" aria-label="季節ステージ">
        ${SEASON_STAGES.map((item, index) => `<span class="${index + 1 < stage.index ? "done" : ""} ${index + 1 === stage.index ? "current" : ""}"><i></i><b>${U.escapeHTML(item.label)}</b></span>`).join("")}
      </div>
    `;
  }

  function renderDecisionFieldCard(field) {
    const date = U.today();
    const planting = plantingDateForYear(field.fieldId, cropYear(date));
    const dap = planting ? U.daysBetween(planting, date) : "";
    const growth = latestGrowthForYear(field.fieldId, cropYear(date));
    const water = waterStageForField(field, date);
    const need = dashboardNeed(field, date);
    const stage = seasonStageForField(field, date);
    const photo = latestFieldPhoto(field.fieldId, cropYear(date));
    const memory = fieldMemory(field, date);
    const note = String(field.yearMemo || field.nextSeasonMemo || field.fixedMemo || (growth && growth.memo) || "").trim();
    const stageImage = stage.current ? `assets/images/rice-stages/rice-stage-${String(stage.current.image).padStart(2, "0")}.png` : "assets/images/rice-stages/rice-stage-01.png";
    const stageKey = stage.current ? stage.current.key : "waiting";
    return `
      <article class="home-decision-card ${U.attr(need.tone)} stage-${U.attr(stageKey)}" data-home-open-field="${U.attr(field.fieldId)}">
        <div class="home-decision-card-head">
          <img class="${photo && photo.photoData ? "photo" : "stage"}" src="${U.attr(photo && photo.photoData || stageImage)}" alt="">
          <div><b>${U.escapeHTML(field.name)}</b><small>${U.escapeHTML(fieldVariety(field))} / ${U.escapeHTML(areaText(field))}</small></div>
          <strong>${U.escapeHTML(dap === "" ? "田植え未登録" : `田植後 ${dap}日`)}</strong>
        </div>
        ${note ? `<p class="home-field-story"><b>今年のひとこと</b><span>${U.escapeHTML(note)}</span></p>` : ""}
        <div class="home-season-focus stage-${U.attr(stageKey)}">
          <img src="${U.attr(stageImage)}" alt="">
          <div><small>今年のステージ</small><b>${U.escapeHTML(stage.current ? stage.current.label : "記録待ち")}</b></div>
          <span>${U.escapeHTML(stage.current ? "現在地" : "次の一歩")}</span>
        </div>
        <div class="home-season-title"><span>${U.escapeHTML(stage.current ? `次に残す：${stage.next}` : stage.next)}</span></div>
        ${renderSeasonTrack(stage)}
        <div class="home-decision-status"><span>${U.escapeHTML(need.label)}</span><small>${U.escapeHTML(need.detail)}</small></div>
        <div class="home-decision-facts">
          <span><b>水管理</b>${U.escapeHTML(water.label)}</span>
          <span><b>生育</b>${U.escapeHTML(growth ? `葉色 ${growth.leafColor || "-"} / 分げつ ${growth.tillerCount || "-"}` : "未入力")}</span>
        </div>
        ${memory ? `<div class="home-field-memory"><img src="${U.attr(memory.photoData || stageImage)}" alt=""><span><b>${U.escapeHTML(memory.label)}</b><small>${U.escapeHTML(U.fd(memory.date))} / ${U.escapeHTML(memory.title || "記録")}${memory.text ? ` / ${U.escapeHTML(memory.text)}` : ""}</small></span></div>` : `<p class="home-field-memory-empty">${U.escapeHTML(previousYearHint(field, date))}</p>`}
      </article>
    `;
  }

  function renderDecisionDashboard() {
    const todayEntries = entriesForDate(U.today()).filter((entry) => entry.kind !== "candidate");
    const candidates = candidatesForDate(U.today());
    const overdue = overdueSchedules();
    const rows = fields();
    return `
      <section class="home-decision-hero">
        <div><p>今日・今週の判断</p><h2>田んぼの今を、先に見る</h2><small>${U.escapeHTML(U.fd(U.today()))} / ${U.escapeHTML(todayEntries.length ? `今日の記録 ${todayEntries.length}件` : "今日の記録はありません")}</small></div>
        <button type="button" class="primary" data-home-quick-record>記録を追加</button>
      </section>
      <section class="home-decision-summary">
        <button type="button" data-home-dashboard-list="candidate"><b>${U.escapeHTML(String(candidates.length))}</b><span>確認候補</span></button>
        <button type="button" data-home-dashboard-list="overdue"><b>${U.escapeHTML(String(overdue.length))}</b><span>期限超過</span></button>
        <button type="button" data-home-dashboard-list="today"><b>${U.escapeHTML(String(todayEntries.length))}</b><span>今日の記録</span></button>
      </section>
      <section class="home-decision-section">
        <div class="home-decision-section-head"><div><h3>圃場ごとの判断</h3><small>気になる圃場から記録へ進めます</small></div><button type="button" data-home-open-calendar>カレンダー</button></div>
        <div class="home-decision-list">${rows.length ? rows.map(renderDecisionFieldCard).join("") : '<div class="farm-empty">圃場を登録すると、ここに判断カードを表示します。</div>'}</div>
      </section>
    `;
  }

  function renderHeader() {
    if (viewMode === "dashboard") {
      return `
        <header class="farm-calendar-header home-dashboard-header">
          <div><h1>ホーム</h1><p>今年の記録を、来年の判断につなげます</p></div>
          <div class="farm-calendar-actions"><button type="button" class="farm-year-button" data-home-open-calendar>カレンダー</button></div>
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
    const log = state.growthLogsFor(field.fieldId)
      .filter((row) => String(row.date || "").startsWith(`${year}-`))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .find((row) => String(row.memo || "").includes("出穂"));
    return log && log.date || "";
  }

  function headingDateInfo(field, cached, planting, headingTarget) {
    const actual = actualHeadingDate(field);
    if (actual) return { date: actual, source: "出穂確認", actual: true };
    const currentPanicleLog = panicleLogForYear(field.fieldId, cropYear(U.today()));
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
    const target = ripeningTempTarget(field);
    const heading = headingDateInfo(field, cached, planting, headingTarget);
    const availableRows = validTempRows(cached && cached.rows);
    const projectionRows = validTempRows(cached && cached.projectionRows);
    const canUseRows = heading.date && cached && !cached.error;
    const today = U.today();
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
    const panicleLog = panicleLogForYear(field.fieldId, cropYear(U.today()));
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

  function fieldWorksMatching(fieldId, names) {
    return state.fieldWorksFor(fieldId)
      .filter((work) => names.some((name) => String(work.workName || "").includes(name)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function latestDryPeriod(fieldId) {
    return (state.dryPeriodsFor ? state.dryPeriodsFor(fieldId) : [])
      .filter((row) => row.startDate || row.actualEndDate || row.endDate)
      .slice()
      .sort((a, b) => String(b.date || b.actualEndDate || b.startDate).localeCompare(String(a.date || a.actualEndDate || a.startDate)))[0] || null;
  }

  function dryDiffText(planned, actual) {
    if (planned === "" || actual === "") return "";
    const diff = actual - planned;
    if (diff === 0) return "予定どおり";
    return diff > 0 ? `予定より${diff}日長い` : `予定より${Math.abs(diff)}日短い`;
  }

  function latestIrrigation(fieldId) {
    return (state.irrigationsFor ? state.irrigationsFor(fieldId) : [])
      .slice()
      .sort((a, b) => String(b.date || b.startDate).localeCompare(String(a.date || a.startDate)))[0] || null;
  }

  function waterStageForField(field, dateText) {
    const date = dateText || U.today();
    const planting = plantingDateForYear(field.fieldId, cropYear(date));
    if (!planting) return { key: "waiting", label: "田植え日を待機", value: "未登録", percent: 0, detail: "田植え作業を登録すると、水管理の段階を表示します。" };
    const dryPeriod = latestDryPeriod(field.fieldId);
    const dryStart = dryPeriod && dryPeriod.startDate || field.drainageStartDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し開始"], "first") : "");
    const dryEnd = dryPeriod && dryPeriod.endDate || field.drainagePlannedEndDate || "";
    const dryActualEnd = dryPeriod && dryPeriod.actualEndDate || field.drainageActualEndDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し終了"], "first") : "");
    const dryTargetDays = U.number(dryPeriod && dryPeriod.targetDays || field.drainageTargetDays, 7) || 7;
    const dap = U.daysBetween(planting, date);
    const heading = actualHeadingDate(field, date);
    const irrigation = latestIrrigation(field.fieldId);
    if (!dryStart) return { key: "tillering", label: "活着・分げつ期", value: `田植後${dap}日`, percent: progressPercent(dap, 42), detail: "中干し前の水管理と分げつを、田面を見ながら確認。" };
    if (!dryActualEnd) {
      const elapsed = U.daysBetween(dryStart, date);
      return { key: "drying", label: "中干し中", value: `${elapsed} / ${dryTargetDays}日`, percent: progressPercent(elapsed, dryTargetDays), detail: dryEnd ? `完了予定 ${U.fd(dryEnd)}。ひび割れ・沈み込み・天気を現地確認。` : "ひび割れ・沈み込み・天気を見て完了時期を確認。" };
    }
    if (!heading) {
      const method = irrigation && irrigation.method || "間断灌水";
      const target = U.number(irrigation && irrigation.targetDays || field.intermittentIntervalDays, 3) || 3;
      const elapsed = irrigation && irrigation.startDate ? U.daysBetween(irrigation.startDate, date) : "";
      return { key: "intermittent", label: "中干し後・水管理", value: irrigation ? method : "開始を確認", percent: elapsed === "" ? 52 : progressPercent(elapsed % target || target, target), detail: irrigation ? `${method} ${irrigation.status || ""}。土質・水持ちを見ながら現地確認。` : "走り水から間断灌水への移行を、田面を見ながら確認。" };
    }
    const afterHeading = U.daysBetween(heading, date);
    if (afterHeading <= 3) return { key: "heading", label: "出穂前後", value: `出穂後${afterHeading}日`, percent: 70, detail: "出穂前後は水を切らさないか、圃場の状態を確認。" };
    if (afterHeading <= 30) return { key: "filling", label: "登熟期・水管理", value: `出穂後${afterHeading}日`, percent: progressPercent(afterHeading, 30), detail: "乾かし過ぎを避け、天気と田面を見ながら間断灌水を確認。" };
    return { key: "drainage", label: "落水時期の確認", value: `出穂後${afterHeading}日`, percent: 100, detail: "収穫予定・田面・天気を見ながら落水時期を確認。" };
  }

  function renderWaterStageCard(field) {
    const stage = waterStageForField(field);
    const irrigation = latestIrrigation(field.fieldId);
    const facts = [
      field.soilType ? `土質 ${field.soilType}` : "土質 未設定",
      field.waterHolding ? `水持ち ${field.waterHolding}` : "水持ち 未設定",
      irrigation ? `直近 ${irrigation.method || "水管理"}` : "水管理記録 なし"
    ];
    return `
      <section class="farm-water-stage ${U.attr(stage.key)}">
        <div class="farm-water-stage-head"><span>水管理の現在地</span><b>${U.escapeHTML(stage.label)}</b></div>
        <div class="farm-water-stage-main"><strong>${U.escapeHTML(stage.value)}</strong><p>${U.escapeHTML(stage.detail)}</p></div>
        <i><em style="width:${U.attr(String(stage.percent))}%"></em></i>
        <div class="farm-water-stage-facts">${facts.map((fact) => `<span>${U.escapeHTML(fact)}</span>`).join("")}</div>
        <small data-water-stage-weather="${U.attr(field.fieldId)}">直近の天気予報を確認中</small>
      </section>
    `;
  }

  function latestProgressGrowth(fieldId) {
    return state.growthLogsFor(fieldId)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function varietyDayTarget(variety, key, fallback) {
    return U.number(variety && variety[key], fallback) || fallback;
  }

  function progressRowsForField(field) {
    const planting = plantingDateForYear(field.fieldId, cropYear(U.today()));
    const dap = planting ? U.daysBetween(planting, U.today()) : "";
    const dryPeriod = latestDryPeriod(field.fieldId);
    const dryStart = dryPeriod && dryPeriod.startDate || field.drainageStartDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し開始"], "first") : "");
    const dryEnd = dryPeriod && dryPeriod.endDate || field.drainagePlannedEndDate || "";
    const dryActualEnd = dryPeriod && dryPeriod.actualEndDate || field.drainageActualEndDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し終了"], "first") : "");
    const dryDays = U.number(dryPeriod && dryPeriod.targetDays || field.drainageTargetDays, 7) || 7;
    const dryPlannedDays = dryStart && dryEnd ? U.daysBetween(dryStart, dryEnd) : dryDays;
    const dryActualDays = dryStart && dryActualEnd ? U.daysBetween(dryStart, dryActualEnd) : "";
    const dryElapsed = dryStart ? U.daysBetween(dryStart, U.today()) : "";
    const herbicide = fieldWorksMatching(field.fieldId, ["除草", "除草剤"])[0];
    const growth = latestProgressGrowth(field.fieldId);
    const variety = state.variety(field.varietyId);
    const targetTillers = variety && variety.targetTillers || "";
    const herbicideDays = varietyDayTarget(variety, "herbicideDaysAfterPlanting", 7);
    const panicleDays = varietyDayTarget(variety, "panicleInitiationDaysAfterPlanting", 60);
    const headingDays = varietyDayTarget(variety, "headingDaysAfterPlanting", 85);
    const panicleTemp = variety && variety.panicleAccumulatedTempTarget || "";
    const headingTemp = variety && variety.headingAccumulatedTempTarget || "";
    const headingDate = actualHeadingDate(field);
    const currentPanicleLog = panicleLogForYear(field.fieldId, cropYear(U.today()));
    const panicle = RiceOS.agro && RiceOS.agro.panicleEstimate && currentPanicleLog
      ? RiceOS.agro.panicleEstimate(field, currentPanicleLog.panicleLengthMm, currentPanicleLog.date)
      : null;
    const previousPanicle = previousPanicleReference(field.fieldId, U.today());
    const ripeningElapsed = headingDate ? U.daysBetween(headingDate, U.today()) : "";
    const ripeningTarget = ripeningTempTarget(field);
    const waterStage = waterStageForField(field);
    const afterDrying = Boolean(dryStart);
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
        title: dryActualEnd ? "中干し完了" : (dryStart ? "中干し進捗" : "中干し目安"),
        value: dryActualEnd ? (dryActualDays !== "" ? `実績${dryActualDays}日` : "完了") : (dryStart ? `${dryElapsed} / ${dryDays}日` : (dap === "" ? "未判定" : `${dap}日経過`)),
        note: dryActualEnd
          ? `完了 ${U.fd(dryActualEnd)} / 予定${dryPlannedDays}日 ${dryDiffText(dryPlannedDays, dryActualDays)}`
          : (dryStart ? `開始 ${U.fd(dryStart)}` : "田植え後42日前後を目安に現場確認"),
        percent: dryActualEnd ? 100 : (dryStart ? progressPercent(dryElapsed, dryDays) : (dap === "" ? 0 : progressPercent(dap, 42)))
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
    root.innerHTML = `
      <div class="farm-calendar-home">
        ${renderHeader()}
        ${viewMode === "dashboard" ? renderDecisionDashboard() : ""}
        ${viewMode === "week" ? renderWeekView() : ""}
        ${viewMode === "month" ? renderMonthView() : ""}
        ${viewMode === "list" ? renderListView() : ""}
        ${viewMode === "progress" ? renderProgressView() : ""}
        <button type="button" class="farm-calendar-fab" data-home-date="${U.attr(U.today())}" aria-label="記録を追加">＋</button>
      </div>
    `;
    if (viewMode === "progress") setTimeout(hydrateHeatMeters, 50);
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
          viewMode = "progress";
          render();
          return;
        }
        viewMode = "list";
        anchorDate = U.today();
        render();
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
      if (event.target.closest("[data-home-quick-record]")) {
        openDate(U.today(), filterFieldId === "all" ? "" : filterFieldId);
        return;
      }
      if (event.target.closest("[data-home-dashboard-list]")) {
        viewMode = "list";
        anchorDate = U.today();
        render();
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
      const fieldButton = event.target.closest("[data-home-open-field]");
      if (fieldButton && RiceOS.app) {
        RiceOS.app.show("fields");
        return;
      }
      const dateButton = event.target.closest("[data-home-date]");
      if (dateButton) {
        openDate(dateButton.dataset.homeDate || U.today(), dateButton.dataset.homeField || "");
      }
    });
    root.addEventListener("change", (event) => {
      const select = event.target.closest("[data-home-field-filter]");
      if (!select) return;
      filterFieldId = select.value || "all";
      render();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.home = { render, bind };
})();
