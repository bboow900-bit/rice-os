(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  const KIND_META = {
    fieldWork: { label: "作業", className: "work", icon: "作" },
    growth: { label: "生育", className: "growth", icon: "生" },
    dry: { label: "中干し", className: "water", icon: "水" },
    irrigation: { label: "水管理", className: "water", icon: "水" },
    schedule: { label: "予定", className: "schedule", icon: "予" },
    other: { label: "その他", className: "other", icon: "他" }
  };

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function fieldNameList(ids) {
    return unique((ids || []).map((id) => state.field(id) && state.field(id).name));
  }

  function fieldLabel(ids) {
    const names = fieldNameList(ids);
    if (!names.length) return "対象なし";
    if (names.length <= 2) return names.join("・");
    return `${names.slice(0, 2).join("・")} ほか${names.length - 2}`;
  }

  function varietyNames(ids) {
    return unique((ids || []).map((id) => state.variety(id) && state.variety(id).name)).join("・");
  }

  function dapLabels(ids, date) {
    return (ids || []).map((id) => {
      const field = state.field(id);
      const dap = U.daysAfterPlanting(field, date);
      return dap === "" || !field ? "" : `${field.name} 田植後${dap}日`;
    }).filter(Boolean);
  }

  function periodStats(item) {
    const planned = item.startDate && item.endDate ? U.daysBetween(item.startDate, item.endDate) : "";
    const actual = item.startDate && item.actualEndDate ? U.daysBetween(item.startDate, item.actualEndDate) : "";
    const diff = planned !== "" && actual !== "" ? actual - planned : "";
    return { planned, actual, diff };
  }

  function diffText(diff) {
    if (diff === "") return "";
    if (diff === 0) return "予定どおり";
    return `${diff > 0 ? "+" : ""}${diff}日`;
  }

  function periodParts(item) {
    const stats = periodStats(item);
    return [
      item.startDate ? `開始 ${U.fd(item.startDate)}` : "",
      item.endDate ? `完了予定 ${U.fd(item.endDate)}` : "",
      item.actualEndDate ? `実完了 ${U.fd(item.actualEndDate)}` : "",
      stats.planned !== "" ? `予定${stats.planned}日` : "",
      stats.actual !== "" ? `実績${stats.actual}日` : "",
      stats.diff !== "" ? diffText(stats.diff) : ""
    ].filter(Boolean);
  }

  function compactParts(parts, max = 4) {
    const clean = (parts || []).filter(Boolean);
    if (clean.length <= max) return clean;
    return [...clean.slice(0, max), `ほか${clean.length - max}`];
  }

  function makeRow(kind, item, values) {
    const meta = KIND_META[kind] || KIND_META.other;
    return {
      kind,
      kindLabel: meta.label,
      kindClass: meta.className,
      kindIcon: meta.icon,
      id: values.id,
      date: values.date || "",
      season: values.season || U.season(values.date),
      title: values.title || "",
      worker: values.worker || "",
      fieldIds: values.fieldIds || [],
      target: values.target || fieldLabel(values.fieldIds),
      hours: values.hours || "",
      status: values.status || "",
      detailParts: values.detailParts || [],
      photoData: values.photoData || "",
      raw: item
    };
  }

  function allRows() {
    const d = state.data();
    const fieldWorks = d.fieldWorks.map((w) => makeRow("fieldWork", w, {
      id: w.workId,
      date: w.date,
      season: w.season,
      title: w.workName,
      worker: w.worker || "",
      fieldIds: w.fieldIds || [],
      hours: w.hours || "",
      photoData: w.photoData || "",
      detailParts: [
        w.machine ? `機械 ${w.machine}` : "",
        w.material ? `資材 ${w.material} ${w.amount || ""}` : "",
        w.weather ? `天気 ${w.weather}` : "",
        w.memo || ""
      ]
    }));
    const growth = d.growthLogs.map((g) => makeRow("growth", g, {
      id: g.logId,
      date: g.date,
      season: g.season,
      title: "生育ログ",
      fieldIds: [g.fieldId],
      photoData: g.photoData || "",
      detailParts: [
        `葉数 ${g.leafCount || "-"}`,
        `分げつ ${g.tillerCount || "-"}`,
        `草丈 ${g.plantHeightCm || "-"}cm`,
        `葉色 ${g.leafColor || "-"}`,
        `雑草 ${g.weed || "-"}`,
        `ガス ${g.gas || "-"}`,
        `水 ${g.water || "-"}`,
        g.memo || ""
      ]
    }));
    const dry = (d.dryPeriods || []).map((item) => makeRow("dry", item, {
      id: item.dryPeriodId,
      date: item.date,
      season: item.season,
      title: "中干し",
      fieldIds: [item.fieldId],
      status: item.status || (item.actualEndDate ? "完了" : "実施中"),
      photoData: item.photoData || "",
      detailParts: [
        item.status ? `状態 ${item.status}` : "",
        ...periodParts(item),
        item.crackCm ? `ひび ${item.crackCm}cm` : "",
        item.sinkCm ? `沈み込み ${item.sinkCm}cm` : "",
        item.surface ? `田面 ${item.surface}` : "",
        item.gas ? `ガス ${item.gas}` : "",
        item.memo || ""
      ]
    }));
    const irrigation = (d.irrigations || []).map((item) => makeRow("irrigation", item, {
      id: item.irrigationId,
      date: item.date,
      season: item.season,
      title: item.method || "間断灌水",
      fieldIds: [item.fieldId],
      status: item.periodStatus || (item.actualEndDate ? "完了" : "実施中"),
      detailParts: [
        item.periodStatus ? `状態 ${item.periodStatus}` : "",
        item.status ? `水状態 ${item.status}` : "",
        ...periodParts(item),
        item.memo || ""
      ]
    }));
    const schedules = (d.schedules || []).map((item) => makeRow("schedule", item, {
      id: item.scheduleId,
      date: item.date,
      season: item.season,
      title: item.title || item.scheduleType || "予定",
      fieldIds: item.fieldIds || [],
      status: item.status || "",
      detailParts: [item.scheduleType || "", item.status || "", item.memo || ""]
    }));
    const other = d.otherWorks.map((o) => makeRow("other", o, {
      id: o.otherWorkId,
      date: o.date,
      season: o.season,
      title: o.workName,
      fieldIds: o.relatedFieldIds || [],
      target: varietyNames(o.varietyIds) || fieldLabel(o.relatedFieldIds),
      hours: o.hours || "",
      detailParts: [o.quantity ? `数量 ${o.quantity}` : "", o.memo || ""]
    }));
    return [...fieldWorks, ...growth, ...dry, ...irrigation, ...schedules, ...other]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)));
  }

  function filterRows(rows) {
    const year = U.$("annualYear").value || String(new Date().getFullYear());
    const fieldId = U.$("annualField").value || "all";
    const kind = U.$("annualKind").value || "all";
    return rows.filter((row) => {
      const yearOk = year === "all" || String(row.season) === String(year);
      const fieldOk = fieldId === "all" || (row.fieldIds || []).includes(fieldId);
      const kindOk = kind === "all" || row.kind === kind;
      return yearOk && fieldOk && kindOk;
    });
  }

  function totalHours(rows) {
    return rows.reduce((sum, row) => sum + U.parseWorkHours(row.hours), 0);
  }

  function roundHours(value) {
    return Math.round(U.number(value, 0) * 10) / 10;
  }

  function monthValue(dateText) {
    const d = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(d.getTime())) return { key: "none", label: "日付未設定" };
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${d.getMonth() + 1}月`
    };
  }

  function statItem(map, key, label) {
    if (!map.has(key)) {
      map.set(key, { key, label, count: 0, hours: 0, lastDate: "", growth: 0, work: 0, water: 0 });
    }
    return map.get(key);
  }

  function fieldStats(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const ids = unique(row.fieldIds || []);
      if (!ids.length) return;
      const perFieldHours = U.parseWorkHours(row.hours) / ids.length;
      ids.forEach((fieldId) => {
        const field = state.field(fieldId);
        const item = statItem(map, fieldId, field && field.name || "圃場未設定");
        item.count += 1;
        item.hours += perFieldHours;
        item.growth += row.kind === "growth" ? 1 : 0;
        item.work += row.kind === "fieldWork" || row.kind === "other" ? 1 : 0;
        item.water += row.kind === "dry" || row.kind === "irrigation" ? 1 : 0;
        if (!item.lastDate || String(row.date).localeCompare(String(item.lastDate)) > 0) item.lastDate = row.date;
      });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.hours - a.hours || a.label.localeCompare(b.label));
  }

  function workTypeStats(rows) {
    const map = new Map();
    rows.filter((row) => row.kind === "fieldWork" || row.kind === "other").forEach((row) => {
      const item = statItem(map, row.title || "作業未設定", row.title || "作業未設定");
      item.count += 1;
      item.hours += U.parseWorkHours(row.hours);
      if (!item.lastDate || String(row.date).localeCompare(String(item.lastDate)) > 0) item.lastDate = row.date;
    });
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours || b.count - a.count || a.label.localeCompare(b.label));
  }

  function monthStats(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const month = monthValue(row.date);
      const item = statItem(map, month.key, month.label);
      item.count += 1;
      item.hours += U.parseWorkHours(row.hours);
      item.growth += row.kind === "growth" ? 1 : 0;
      item.work += row.kind === "fieldWork" || row.kind === "other" ? 1 : 0;
      item.water += row.kind === "dry" || row.kind === "irrigation" ? 1 : 0;
    });
    return Array.from(map.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }

  function summaryCard(label, value, tone) {
    return `
      <div class="annual-summary-card ${tone || ""}">
        <span>${U.escapeHTML(label)}</span>
        <b>${U.escapeHTML(value)}</b>
      </div>
    `;
  }

  function renderSummary(rows) {
    const fields = unique(rows.flatMap((row) => row.fieldIds || []));
    const waterCount = rows.filter((row) => row.kind === "dry" || row.kind === "irrigation").length;
    const growthCount = rows.filter((row) => row.kind === "growth").length;
    return `
      <div class="annual-summary-grid">
        ${summaryCard("記録", `${rows.length}件`, "green")}
        ${summaryCard("作業時間", U.formatHours(totalHours(rows)), "amber")}
        ${summaryCard("対象圃場", `${fields.length}圃場`, "blue")}
        ${summaryCard("水管理 / 生育", `${waterCount} / ${growthCount}`, "purple")}
      </div>
    `;
  }

  function statRow(item, max, options = {}) {
    const ratio = max ? Math.max(8, Math.round((options.metric(item) / max) * 100)) : 8;
    return `
      <div class="annual-stat-row">
        <div>
          <b>${U.escapeHTML(item.label)}</b>
          <span>${U.escapeHTML(options.sub(item))}</span>
        </div>
        <i><span style="width:${U.attr(String(ratio))}%"></span></i>
        <em>${U.escapeHTML(options.value(item))}</em>
      </div>
    `;
  }

  function renderStatList(items, options) {
    if (!items.length) return `<div class="empty">${U.escapeHTML(options.empty)}</div>`;
    const max = Math.max(...items.map(options.metric), 0);
    return items.slice(0, options.limit || 5).map((item) => statRow(item, max, options)).join("");
  }

  function renderAnalysis(rows) {
    if (!rows.length) return "";
    const fields = fieldStats(rows);
    const works = workTypeStats(rows);
    const months = monthStats(rows);
    const workRows = rows.filter((row) => row.kind === "fieldWork" || row.kind === "other");
    const workHours = totalHours(workRows);
    const activeDays = unique(workRows.map((row) => row.date)).length;
    const topWork = works[0];
    return `
      <div class="annual-analysis-board">
        <section class="annual-analysis-card">
          <div class="section-title compact">
            <h3>圃場別</h3>
            <span class="muted">記録が多い順</span>
          </div>
          ${renderStatList(fields, {
            empty: "圃場別の記録はありません。",
            metric: (item) => item.count,
            value: (item) => `${item.count}件`,
            sub: (item) => `${U.formatHours(item.hours)} / 生育${item.growth} / 水${item.water}`,
            limit: 5
          })}
        </section>
        <section class="annual-analysis-card">
          <div class="section-title compact">
            <h3>作業別</h3>
            <span class="muted">時間が多い順</span>
          </div>
          ${renderStatList(works, {
            empty: "作業時間つきの記録はありません。",
            metric: (item) => item.hours || item.count,
            value: (item) => item.hours ? U.formatHours(item.hours) : `${item.count}回`,
            sub: (item) => `${item.count}回${item.lastDate ? ` / 最新 ${U.fd(item.lastDate)}` : ""}`,
            limit: 5
          })}
        </section>
        <section class="annual-analysis-card cost">
          <div class="section-title compact">
            <h3>作業コスト</h3>
            <span class="muted">年度内の目安</span>
          </div>
          <div class="annual-cost-grid">
            <span><b>${U.escapeHTML(U.formatHours(workHours))}</b><small>総作業時間</small></span>
            <span><b>${U.escapeHTML(String(activeDays))}日</b><small>作業日数</small></span>
            <span><b>${U.escapeHTML(activeDays ? U.formatHours(roundHours(workHours / activeDays)) : "0時間")}</b><small>1日平均</small></span>
            <span><b>${U.escapeHTML(topWork ? topWork.label : "-")}</b><small>最多時間</small></span>
          </div>
        </section>
        <section class="annual-analysis-card wide">
          <div class="section-title compact">
            <h3>月別の流れ</h3>
            <span class="muted">件数 / 作業時間</span>
          </div>
          <div class="annual-month-flow">
            ${renderStatList(months, {
              empty: "月別の記録はありません。",
              metric: (item) => item.count,
              value: (item) => `${item.count}件`,
              sub: (item) => `${U.formatHours(item.hours)} / 作業${item.work} / 生育${item.growth} / 水${item.water}`,
              limit: 12
            })}
          </div>
        </section>
      </div>
    `;
  }

  function chip(text, tone) {
    return text ? `<span class="annual-chip ${tone || ""}">${U.escapeHTML(text)}</span>` : "";
  }

  function dateBlock(date) {
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
      return { main: date || "未設定", sub: "" };
    }
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return {
      main: `${d.getMonth() + 1}/${d.getDate()}`,
      sub: `${d.getFullYear()}(${weekdays[d.getDay()]})`
    };
  }

  function renderDapChips(row) {
    const labels = dapLabels(row.fieldIds, row.date);
    if (!labels.length) return "";
    const shown = labels.slice(0, 2).map((label) => chip(label, "dap")).join("");
    const extra = labels.length > 2 ? chip(`ほか${labels.length - 2}`, "muted") : "";
    return shown + extra;
  }

  function renderEntry(row, showDate) {
    const detail = compactParts(row.detailParts, showDate ? 6 : 5).join(" / ");
    return `
      <article class="annual-entry annual-${U.attr(row.kindClass)}">
        <div class="annual-entry-main">
          <span class="annual-kind-icon">${U.escapeHTML(row.kindIcon || row.kindLabel.slice(0, 1))}</span>
          <span class="kind-badge">${U.escapeHTML(row.kindLabel)}</span>
          <div class="annual-entry-title">
            <b>${showDate ? `${U.escapeHTML(U.fd(row.date))} ` : ""}${U.escapeHTML(row.title)}</b>
            <span>${U.escapeHTML(row.target || "対象なし")}</span>
          </div>
          ${row.photoData ? `<img class="annual-thumb" src="${U.attr(row.photoData)}" alt="">` : ""}
        </div>
        <div class="annual-chip-row">
          ${row.worker ? chip(row.worker, "worker") : ""}
          ${row.hours ? chip(`時間 ${row.hours}`, "hours") : ""}
          ${row.status ? chip(row.status, row.status === "完了" ? "done" : "status") : ""}
          ${renderDapChips(row)}
        </div>
        ${detail ? `<div class="annual-detail">${U.escapeHTML(detail)}</div>` : ""}
        <div class="inline-actions">
          <button class="secondary" data-annual-action="edit" data-kind="${U.attr(row.kind)}" data-id="${U.attr(row.id)}">編集</button>
          <button class="danger" data-annual-action="delete" data-kind="${U.attr(row.kind)}" data-id="${U.attr(row.id)}">削除</button>
        </div>
      </article>
    `;
  }

  function groupRowsByDate(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = row.date || "日付未設定";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.entries());
  }

  function compactFieldLabel(rows) {
    const names = unique(rows.flatMap((row) => fieldNameList(row.fieldIds)));
    if (!names.length) return "対象なし";
    if (names.length <= 2) return names.join("・");
    return `${names.slice(0, 2).join("・")} ほか${names.length - 2}`;
  }

  function renderDayCards(rows, options = {}) {
    return groupRowsByDate(rows).map(([date, items], index) => {
      const dayHours = totalHours(items);
      const dap = dapLabels(items.flatMap((item) => item.fieldIds), date)[0] || "";
      const parts = dateBlock(date);
      const kinds = unique(items.map((item) => item.kindLabel)).slice(0, 3).join("・");
      return `
        <article class="annual-day-card ${options.compact ? "compact" : ""}">
          <div class="annual-day-head">
            <div class="annual-date-block">
              <span class="annual-date-main">${U.escapeHTML(parts.main)}</span>
              <span class="annual-date-sub">${U.escapeHTML(parts.sub)}</span>
            </div>
            <div class="annual-day-overview">
              <b>${U.escapeHTML(kinds || "記録")}</b>
              <span>${U.escapeHTML(compactFieldLabel(items))}</span>
            </div>
            <div class="annual-day-meta">
              ${chip(`${items.length}件`, "count")}
              ${dayHours ? chip(U.formatHours(dayHours), "hours") : ""}
              ${dap ? chip(dap, "dap") : ""}
            </div>
          </div>
          <div class="annual-entry-list">
            ${items.map((row) => renderEntry(row, false)).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function groupRowsByField(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const ids = unique(row.fieldIds || []);
      const keys = ids.length ? ids : ["__none"];
      keys.forEach((fieldId) => {
        if (!groups.has(fieldId)) groups.set(fieldId, []);
        groups.get(fieldId).push(row);
      });
    });
    return Array.from(groups.entries()).sort(([aId, aRows], [bId, bRows]) => {
      const aName = aId === "__none" ? "対象なし" : (state.field(aId) && state.field(aId).name || "");
      const bName = bId === "__none" ? "対象なし" : (state.field(bId) && state.field(bId).name || "");
      return aName.localeCompare(bName) || bRows.length - aRows.length;
    });
  }

  function renderFieldCards(rows) {
    return groupRowsByField(rows).map(([fieldId, items]) => {
      const field = fieldId === "__none" ? null : state.field(fieldId);
      const sorted = items.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const stats = {
        hours: totalHours(items),
        growth: items.filter((row) => row.kind === "growth").length,
        water: items.filter((row) => row.kind === "dry" || row.kind === "irrigation").length,
        work: items.filter((row) => row.kind === "fieldWork" || row.kind === "other").length
      };
      return `
        <article class="annual-field-card">
          <div class="annual-field-head">
            <div>
              <b>${U.escapeHTML(field && field.name || "対象なし")}</b>
              <span>${U.escapeHTML(field && field.areaA ? `${field.areaA}a` : "")}</span>
            </div>
            <div class="annual-field-metrics">
              ${chip(`${items.length}件`, "count")}
              ${stats.hours ? chip(U.formatHours(stats.hours), "hours") : ""}
              ${chip(`作業${stats.work}`, "field")}
              ${chip(`生育${stats.growth}`, "dap")}
              ${chip(`水${stats.water}`, "status")}
            </div>
          </div>
          <div class="annual-entry-list field-view">
            ${sorted.slice(0, 12).map((row) => renderEntry(row, true)).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderDetailTimeline(rows) {
    let currentMonth = "";
    let currentPhase = "";
    return rows.map((row) => {
      let head = "";
      const month = U.monthKey(row.date);
      const phase = row.kind === "growth" ? "4 生育管理" : S.phase(row.title);
      if (month !== currentMonth) {
        currentMonth = month;
        currentPhase = "";
        head += `<div class="timeline-month">${U.escapeHTML(month)}</div>`;
      }
      if (phase !== currentPhase) {
        currentPhase = phase;
        head += `<div class="timeline-phase">${U.escapeHTML(phase)}</div>`;
      }
      return head + renderEntry(row, true);
    }).join("");
  }

  function renderTimeline(rows) {
    if (!rows.length) return '<div class="empty">記録はまだありません。</div>';
    if ((U.$("annualView").value || "compact") === "field") return renderFieldCards(rows);
    if ((U.$("annualView").value || "compact") === "detail") return renderDetailTimeline(rows);
    return renderDayCards(rows);
  }

  function renderLastYear(rows) {
    if (!U.$("showLastYear").checked) return "";
    const range = U.lastYearSamePeriod(U.today(), 14);
    const fieldId = U.$("annualField").value || "all";
    const same = rows.filter((row) => {
      const fieldOk = fieldId === "all" || (row.fieldIds || []).includes(fieldId);
      return fieldOk && U.inDateRange(row.date, range.start, range.end);
    });
    return `
      <div class="annual-lastyear-panel">
        <div class="section-title compact">
          <h3>去年同時期</h3>
          <span class="muted">${U.escapeHTML(U.fd(range.start))} - ${U.escapeHTML(U.fd(range.end))}</span>
        </div>
        ${same.length ? renderDayCards(same, { compact: true }) : '<div class="empty">去年同時期の記録はありません。</div>'}
      </div>
    `;
  }

  function renderOptions() {
    const years = new Set([String(new Date().getFullYear())]);
    allRows().forEach((row) => years.add(String(row.season)));
    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    U.setOptions(U.$("annualYear"), [{ value: "all", label: "すべて" }, ...sorted.map((year) => ({ value: year, label: year }))], U.$("annualYear").value || String(new Date().getFullYear()));
    U.setOptions(U.$("annualField"), [{ value: "all", label: "全圃場" }, ...state.fields().map((field) => ({ value: field.fieldId, label: field.name }))], U.$("annualField").value || "all");
    U.setOptions(U.$("annualKind"), [
      { value: "all", label: "すべて" },
      { value: "fieldWork", label: "圃場作業" },
      { value: "growth", label: "生育ログ" },
      { value: "dry", label: "中干し" },
      { value: "irrigation", label: "水管理" },
      { value: "schedule", label: "予定" },
      { value: "other", label: "その他作業" }
    ], U.$("annualKind").value || "all");
    U.setOptions(U.$("annualView"), [
      { value: "compact", label: "日付カード" },
      { value: "field", label: "圃場別" },
      { value: "detail", label: "詳細一覧" }
    ], U.$("annualView").value || "compact");
  }

  function render() {
    renderOptions();
    const rows = allRows();
    const filtered = filterRows(rows);
    U.$("annualTimeline").innerHTML = renderSummary(filtered) + renderAnalysis(filtered) + renderLastYear(rows) + renderTimeline(filtered);
  }

  function editRow(kind, id) {
    if (kind === "fieldWork" && RiceOS.screens.fieldWork && RiceOS.screens.fieldWork.editWork) {
      RiceOS.app.show("field-work");
      RiceOS.screens.fieldWork.editWork(id);
      return;
    }
    if (kind === "growth" && RiceOS.screens.growth && RiceOS.screens.growth.editLog) {
      RiceOS.app.show("growth");
      RiceOS.screens.growth.editLog(id);
      return;
    }
    if (kind === "dry" && RiceOS.screens.dryPeriod && RiceOS.screens.dryPeriod.editDry) {
      RiceOS.app.show("dry-period");
      RiceOS.screens.dryPeriod.editDry(id);
      return;
    }
    if (kind === "irrigation" && RiceOS.screens.irrigation && RiceOS.screens.irrigation.editIrrigation) {
      RiceOS.app.show("irrigation");
      RiceOS.screens.irrigation.editIrrigation(id);
      return;
    }
    if (kind === "schedule") {
      const item = (state.data().schedules || []).find((row) => row.scheduleId === id);
      if (!item) return;
      const title = prompt("予定名", item.title || "");
      if (title === null) return;
      const memo = prompt("メモ", item.memo || "");
      if (memo === null) return;
      state.saveSchedule({ ...item, title, memo });
    }
  }

  function deleteRow(kind, id) {
    const ok = confirm("この記録を削除しますか？");
    if (!ok) return;
    if (kind === "fieldWork") state.deleteFieldWork(id);
    if (kind === "growth") state.deleteGrowthLog(id);
    if (kind === "dry") state.deleteDryPeriod(id);
    if (kind === "irrigation") state.deleteIrrigation(id);
    if (kind === "schedule") state.deleteSchedule(id);
    if (kind === "other") state.deleteOtherWork(id);
  }

  function bind() {
    ["annualYear", "annualField", "annualKind", "annualView", "showLastYear"].forEach((id) => U.$(id).addEventListener("change", render));
    U.$("annualTimeline").addEventListener("click", (event) => {
      const button = event.target.closest("[data-annual-action]");
      if (!button) return;
      if (button.dataset.annualAction === "edit") editRow(button.dataset.kind, button.dataset.id);
      if (button.dataset.annualAction === "delete") deleteRow(button.dataset.kind, button.dataset.id);
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.annual = { render, bind };
})();
