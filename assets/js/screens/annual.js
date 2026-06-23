(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  const KIND_META = {
    fieldWork: { label: "作業", className: "work" },
    growth: { label: "生育", className: "growth" },
    dry: { label: "中干し", className: "water" },
    irrigation: { label: "水管理", className: "water" },
    schedule: { label: "予定", className: "schedule" },
    other: { label: "その他", className: "other" }
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

  function chip(text, tone) {
    return text ? `<span class="annual-chip ${tone || ""}">${U.escapeHTML(text)}</span>` : "";
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
      const dap = dapLabels(items[0].fieldIds, date)[0] || "";
      const open = options.openAll || index < 8;
      return `
        <details class="annual-day-card" ${open ? "open" : ""}>
          <summary class="annual-day-head">
            <span class="annual-date">${U.escapeHTML(U.fd(date) || date)}</span>
            <span class="annual-day-meta">
              ${chip(`${items.length}件`, "count")}
              ${dayHours ? chip(U.formatHours(dayHours), "hours") : ""}
              ${chip(compactFieldLabel(items), "field")}
              ${dap ? chip(dap, "dap") : ""}
            </span>
          </summary>
          <div class="annual-entry-list">
            ${items.map((row) => renderEntry(row, false)).join("")}
          </div>
        </details>
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
        ${same.length ? renderDayCards(same, { openAll: true }) : '<div class="empty">去年同時期の記録はありません。</div>'}
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
      { value: "detail", label: "詳細一覧" }
    ], U.$("annualView").value || "compact");
  }

  function render() {
    renderOptions();
    const rows = allRows();
    const filtered = filterRows(rows);
    U.$("annualTimeline").innerHTML = renderSummary(filtered) + renderLastYear(rows) + renderTimeline(filtered);
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
