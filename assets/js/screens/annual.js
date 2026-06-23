(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  function fieldNames(ids) {
    return (ids || []).map((id) => state.field(id) && state.field(id).name).filter(Boolean).join("・");
  }

  function varietyNames(ids) {
    return (ids || []).map((id) => state.variety(id) && state.variety(id).name).filter(Boolean).join("・");
  }

  function workDap(ids, date) {
    return (ids || []).map((id) => {
      const field = state.field(id);
      const dap = U.daysAfterPlanting(field, date);
      return dap === "" || !field ? "" : `${field.name}:田植後${dap}日`;
    }).filter(Boolean).join(" / ");
  }

  function allRows() {
    const d = state.data();
    const fieldWorks = d.fieldWorks.map((w) => ({
      kind: "fieldWork",
      id: w.workId,
      date: w.date,
      season: w.season,
      name: w.workName,
      worker: w.worker || "",
      fieldIds: w.fieldIds || [],
      target: fieldNames(w.fieldIds),
      hours: w.hours || "",
      detail: [w.machine ? `機械:${w.machine}` : "", w.material ? `資材:${w.material} ${w.amount || ""}` : "", w.weather ? `天気:${w.weather}` : "", w.memo || ""].filter(Boolean).join(" / ")
    }));
    const growth = d.growthLogs.map((g) => ({
      kind: "growth",
      id: g.logId,
      date: g.date,
      season: g.season,
      name: "生育ログ",
      worker: "",
      fieldIds: [g.fieldId],
      target: fieldNames([g.fieldId]),
      hours: "",
      detail: `葉数:${g.leafCount || "-"} / 分げつ:${g.tillerCount || "-"} / 草丈:${g.plantHeightCm || "-"}cm / 葉色:${g.leafColor} / 雑草:${g.weed} / ガス:${g.gas} / 水:${g.water}${g.memo ? ` / ${g.memo}` : ""}`
    }));
    const dry = (d.dryPeriods || []).map((item) => ({
      kind: "dry",
      id: item.dryPeriodId,
      date: item.date,
      season: item.season,
      name: "中干し",
      worker: "",
      fieldIds: [item.fieldId],
      target: fieldNames([item.fieldId]),
      hours: "",
      detail: `ひび:${item.crackCm || "-"}cm / 沈み込み:${item.sinkCm || "-"}cm / 田面:${item.surface || "-"} / ガス:${item.gas || "-"}${item.memo ? ` / ${item.memo}` : ""}`
    }));
    const irrigation = (d.irrigations || []).map((item) => ({
      kind: "irrigation",
      id: item.irrigationId,
      date: item.date,
      season: item.season,
      name: "間断灌水",
      worker: "",
      fieldIds: [item.fieldId],
      target: fieldNames([item.fieldId]),
      hours: "",
      detail: `${item.status || "-"} / 開始:${item.startDate || "-"} / 終了予定:${item.endDate || "-"}${item.memo ? ` / ${item.memo}` : ""}`
    }));
    const schedules = (d.schedules || []).map((item) => ({
      kind: "schedule",
      id: item.scheduleId,
      date: item.date,
      season: item.season,
      name: item.title || item.scheduleType || "予定",
      worker: "",
      fieldIds: item.fieldIds || [],
      target: fieldNames(item.fieldIds),
      hours: "",
      detail: [item.scheduleType || "", item.status || "", item.memo || ""].filter(Boolean).join(" / ")
    }));
    const other = d.otherWorks.map((o) => ({
      kind: "other",
      id: o.otherWorkId,
      date: o.date,
      season: o.season,
      name: o.workName,
      worker: "",
      fieldIds: o.relatedFieldIds || [],
      target: varietyNames(o.varietyIds) || fieldNames(o.relatedFieldIds) || "その他",
      hours: o.hours || "",
      detail: [o.quantity ? `数量:${o.quantity}` : "", o.memo || ""].filter(Boolean).join(" / ")
    }));
    return [...fieldWorks, ...growth, ...dry, ...irrigation, ...schedules, ...other].sort((a, b) => String(a.date).localeCompare(String(b.date)));
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

  function compactFieldLabel(rows) {
    const names = Array.from(new Set(rows.flatMap((row) => (row.fieldIds || []).map((id) => state.field(id) && state.field(id).name).filter(Boolean))));
    if (!names.length) return "圃場なし";
    if (names.length <= 3) return names.join("・");
    return `${names.slice(0, 3).join("・")} ほか${names.length - 3}`;
  }

  function renderCompactRow(row) {
    const dap = ["fieldWork", "growth", "dry", "irrigation"].includes(row.kind) ? workDap(row.fieldIds, row.date) : "";
    return `
      <div class="compact-history-row ${U.attr(row.kind)}">
        <b>${U.escapeHTML(row.name)}</b>
        <span>${U.escapeHTML(row.target || "対象なし")}</span>
        ${row.worker ? `<span class="pill ok">${U.escapeHTML(row.worker)}</span>` : ""}
        ${row.hours ? `<span class="pill warn">時間 ${U.escapeHTML(row.hours)}</span>` : ""}
        ${dap ? `<span class="pill purple">${U.escapeHTML(dap)}</span>` : ""}
        ${row.detail ? `<small>${U.escapeHTML(row.detail)}</small>` : ""}
        <div class="inline-actions">
          <button class="secondary" data-annual-action="edit" data-kind="${U.attr(row.kind)}" data-id="${U.attr(row.id)}">編集</button>
          <button class="danger" data-annual-action="delete" data-kind="${U.attr(row.kind)}" data-id="${U.attr(row.id)}">削除</button>
        </div>
      </div>
    `;
  }

  function renderCompactTimeline(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = row.date || "date-none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.entries()).map(([date, items], index) => `
      <details class="day-group" ${index < 5 ? "open" : ""}>
        <summary>
          <b>${U.escapeHTML(U.fd(date) || date)}</b>
          <span class="pill info">${items.length}件</span>
          <span class="muted">${U.escapeHTML(compactFieldLabel(items))}</span>
        </summary>
        <div class="day-group-body">
          ${items.map(renderCompactRow).join("")}
        </div>
      </details>
    `).join("");
  }

  function renderDetailRow(row) {
    const dap = ["fieldWork", "growth", "dry", "irrigation"].includes(row.kind) ? workDap(row.fieldIds, row.date) : "";
    return `
      <div class="timeline-item">
        <b>${U.escapeHTML(U.fd(row.date))} ${U.escapeHTML(row.name)}</b><br>
        <span class="pill info">${U.escapeHTML(row.target || "対象なし")}</span>
        ${row.worker ? `<span class="pill ok">${U.escapeHTML(row.worker)}</span>` : ""}
        ${row.hours ? `<span class="pill warn">時間 ${U.escapeHTML(row.hours)}</span>` : ""}
        ${dap ? `<span class="pill purple">${U.escapeHTML(dap)}</span>` : ""}
        ${row.detail ? `<div>${U.escapeHTML(row.detail)}</div>` : ""}
      </div>
    `;
  }

  function renderTimeline(rows) {
    if ((U.$("annualView").value || "compact") === "compact") return renderCompactTimeline(rows);
    let currentMonth = "";
    let currentPhase = "";
    return rows.map((row) => {
      let head = "";
      const month = U.monthKey(row.date);
      const phase = row.kind === "growth" ? "4 生育管理" : S.phase(row.name);
      if (month !== currentMonth) {
        currentMonth = month;
        currentPhase = "";
        head += `<div class="timeline-month">${U.escapeHTML(month)}</div>`;
      }
      if (phase !== currentPhase) {
        currentPhase = phase;
        head += `<div class="timeline-phase">${U.escapeHTML(phase)}</div>`;
      }
      return head + renderDetailRow(row);
    }).join("");
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
      <div class="section-band">
        <div class="section-title">
          <h3>去年同時期</h3>
          <span class="muted">${U.escapeHTML(U.fd(range.start))} - ${U.escapeHTML(U.fd(range.end))}</span>
        </div>
        ${same.length ? renderCompactTimeline(same) : '<div class="empty">去年同時期の記録はありません。</div>'}
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
      { value: "irrigation", label: "間断灌水" },
      { value: "schedule", label: "予定" },
      { value: "other", label: "その他作業" }
    ], U.$("annualKind").value || "all");
    U.setOptions(U.$("annualView"), [
      { value: "compact", label: "日付で折りたたみ" },
      { value: "detail", label: "詳細一覧" }
    ], U.$("annualView").value || "compact");
  }

  function render() {
    renderOptions();
    const rows = allRows();
    const filtered = filterRows(rows);
    const timeline = filtered.length ? renderTimeline(filtered) : '<div class="empty">記録はまだありません。</div>';
    U.$("annualTimeline").innerHTML = renderLastYear(rows) + timeline;
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
