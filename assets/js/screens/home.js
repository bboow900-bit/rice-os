(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let viewMode = "week";
  let anchorDate = U.today();
  let filterFieldId = "all";
  const heatCache = new Map();
  const heatProjectionCache = new Map();

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
      const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
      const dap = planting ? U.daysBetween(planting, date) : "";
      const dryStart = state.workDateForField ? state.workDateForField(field.fieldId, ["中干し開始"], "first") : "";
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
      if (!growth || U.daysBetween(growth.date, date) >= 7) {
        rows.push({
          kind: "candidate",
          title: "葉色確認候補",
          subtitle: field.name,
          record: { fieldId: field.fieldId },
          reason: growth ? `前回 ${U.fd(growth.date)}` : "生育記録なし"
        });
      }
      const water = latestWater(field.fieldId);
      if (dap !== "" && dap >= 25 && (!water || U.daysBetween(water.date || water.startDate, date) >= 5)) {
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
    const planted = state.activeFields().filter((field) => state.plantingDateForField && state.plantingDateForField(field.fieldId));
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

  function renderHeader() {
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

  function renderHeatForecast(cached, total, panicleTarget, target) {
    const pace = heatPace(cached);
    if (!cached || cached.error) return "";
    const projectionRows = cached.projectionRows || [];
    const basis = projectionRows.length ? "今年実測 + 7日予報 + 昨年同時期" : (pace ? `直近ペース ${pace}℃/日` : "気温データ確認中");
    return `
      <div class="farm-heat-forecast">
        <span>${U.escapeHTML(`予測: ${basis}`)}</span>
        <b>${U.escapeHTML(projectionRows.length ? heatEtaFromProjection(total, panicleTarget, projectionRows, "幼穂形成", "幼穂形成まで") : heatEtaLabel(total, panicleTarget, pace, "幼穂形成", "幼穂形成まで"))}</b>
        <b>${U.escapeHTML(projectionRows.length ? heatEtaFromProjection(total, target, projectionRows, "出穂目安", "出穂目安まで") : heatEtaLabel(total, target, pace, "出穂目安", "出穂目安まで"))}</b>
      </div>
    `;
  }

  function renderHeatMeter(field) {
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
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
      <section class="farm-heat-meter" data-heat-field="${U.attr(field.fieldId)}">
        <div class="farm-heat-meter-head">
          <span>🔥</span>
          <div>
            <b>積算気温</b>
            <small>${U.escapeHTML(note)}</small>
          </div>
          <strong>${U.escapeHTML(title)}</strong>
        </div>
        <div class="farm-heat-bar">
          <i style="left:${U.attr(String(paniclePercent))}%"></i>
          <em style="width:${U.attr(String(percent))}%"></em>
        </div>
        ${renderHeatForecast(cached, total, panicleTarget, target)}
        <div class="farm-heat-scale">
          <span>田植え</span>
          <span>幼穂 ${U.escapeHTML(String(panicleTarget))}℃</span>
          <span>出穂 ${U.escapeHTML(String(target))}℃</span>
        </div>
      </section>
    `;
  }

  function fieldWorksMatching(fieldId, names) {
    return state.fieldWorksFor(fieldId)
      .filter((work) => names.some((name) => String(work.workName || "").includes(name)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
    const dap = planting ? U.daysBetween(planting, U.today()) : "";
    const dryStart = field.drainageStartDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["中干し開始"], "first") : "");
    const dryDays = U.number(field.drainageTargetDays, 7) || 7;
    const dryElapsed = dryStart ? U.daysBetween(dryStart, U.today()) : "";
    const irrigationStart = field.intermittentStartDate || (state.workDateForField ? state.workDateForField(field.fieldId, ["間断灌水開始", "湿潤灌漑開始"], "first") : "");
    const irrigationDays = U.number(field.intermittentIntervalDays, 3) || 3;
    const irrigationElapsed = irrigationStart ? U.daysBetween(irrigationStart, U.today()) : "";
    const herbicide = fieldWorksMatching(field.fieldId, ["除草", "除草剤"])[0];
    const growth = latestProgressGrowth(field.fieldId);
    const variety = state.variety(field.varietyId);
    const targetTillers = variety && variety.targetTillers || "";
    const herbicideDays = varietyDayTarget(variety, "herbicideDaysAfterPlanting", 7);
    const panicleDays = varietyDayTarget(variety, "panicleInitiationDaysAfterPlanting", 60);
    const headingDays = varietyDayTarget(variety, "headingDaysAfterPlanting", 85);
    const panicleTemp = variety && variety.panicleAccumulatedTempTarget || "";
    const headingTemp = variety && variety.headingAccumulatedTempTarget || "";
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
        title: dryStart ? "中干し進捗" : "中干し目安",
        value: dryStart ? `${dryElapsed} / ${dryDays}日` : (dap === "" ? "未判定" : `${dap}日経過`),
        note: dryStart ? `開始 ${U.fd(dryStart)}` : "田植え後42日前後を目安に現場確認",
        percent: dryStart ? progressPercent(dryElapsed, dryDays) : (dap === "" ? 0 : progressPercent(dap, 42))
      },
      {
        tone: herbicide ? "green" : "orange",
        icon: "🧪",
        title: herbicide ? "除草剤散布" : "除草剤目安",
        value: herbicide ? "記録済み" : (dap === "" ? "未判定" : `${dap}日経過`),
        note: herbicide ? `${U.fd(herbicide.date)} ${herbicide.workName}` : `初期剤は田植え後${herbicideDays}日前後を目安に確認`,
        percent: herbicide ? 100 : (dap === "" ? 0 : progressPercent(dap, herbicideDays))
      },
      {
        tone: "amber",
        icon: "🌿",
        title: "幼穂形成期",
        value: dap === "" ? "未判定" : (dap >= panicleDays ? `${dap}日経過` : `あと${panicleDays - dap}日`),
        note: panicleTemp ? `日数目安 ${panicleDays}日 / 積算気温目標 ${panicleTemp}` : `田植え後${panicleDays}日前後を目安に確認`,
        percent: dap === "" ? 0 : progressPercent(dap, panicleDays)
      },
      {
        tone: "green",
        icon: "🌾",
        title: "出穂目安",
        value: dap === "" ? "未判定" : (dap >= headingDays ? `${dap}日経過` : `あと${headingDays - dap}日`),
        note: headingTemp ? `日数目安 ${headingDays}日 / 積算気温目標 ${headingTemp}` : `田植え後${headingDays}日前後を目安に確認`,
        percent: dap === "" ? 0 : progressPercent(dap, headingDays)
      },
      {
        tone: "blue",
        icon: "🌱",
        title: "生育確認",
        value: growth ? `分げつ${growth.tillerCount || "-"}本` : "未入力",
        note: targetTillers ? `目標 ${targetTillers}` : "栽培レシピで目標設定",
        percent: growth && growth.tillerCount ? progressPercent(U.number(growth.tillerCount, 0), U.number(String(targetTillers).match(/\\d+/)?.[0], 22)) : 0
      },
      {
        tone: "water",
        icon: "〰",
        title: "間断/湿潤",
        value: irrigationStart ? `${irrigationElapsed} / ${irrigationDays}日` : "開始未登録",
        note: irrigationStart ? `開始 ${U.fd(irrigationStart)}` : "中干し後に開始日を登録",
        percent: irrigationStart ? progressPercent(irrigationElapsed % irrigationDays || irrigationDays, irrigationDays) : 0
      }
    ];
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
              ${renderHeatMeter(field)}
              ${progressRowsForField(field).map(renderProgressRow).join("")}
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderFieldProgressSummary(field) {
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
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
          const planting = field && state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
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

  async function hydrateHeatMeters() {
    if (viewMode !== "progress" || !RiceOS.weather || !RiceOS.weather.fetchDailyRange) return;
    const visibleFields = fields().slice(0, 8);
    let location = null;
    let projectionRows = [];
    for (const field of visibleFields) {
      const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
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
