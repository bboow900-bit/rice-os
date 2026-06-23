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
      return dap === "" ? "" : `${field.name}:田植後${dap}日`;
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
      fieldIds: w.fieldIds || [],
      target: fieldNames(w.fieldIds),
      hours: w.hours || "",
      detail: [w.material ? `資材:${w.material} ${w.amount || ""}` : "", w.memo || ""].filter(Boolean).join(" / ")
    }));
    const growth = d.growthLogs.map((g) => ({
      kind: "growth",
      id: g.logId,
      date: g.date,
      season: g.season,
      name: "生育ログ",
      fieldIds: [g.fieldId],
      target: fieldNames([g.fieldId]),
      hours: "",
      detail: `葉色:${g.leafColor} / 雑草:${g.weed} / ガス:${g.gas} / 水:${g.water}${g.memo ? ` / ${g.memo}` : ""}`
    }));
    const other = d.otherWorks.map((o) => ({
      kind: "other",
      id: o.otherWorkId,
      date: o.date,
      season: o.season,
      name: o.workName,
      fieldIds: o.relatedFieldIds || [],
      target: varietyNames(o.varietyIds) || fieldNames(o.relatedFieldIds) || "その他",
      hours: o.hours || "",
      detail: [o.quantity ? `数量:${o.quantity}` : "", o.memo || ""].filter(Boolean).join(" / ")
    }));
    return [...fieldWorks, ...growth, ...other].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function filterRows(rows) {
    const year = U.$("annualYear").value || String(new Date().getFullYear());
    const fieldId = U.$("annualField").value || "all";
    return rows.filter((row) => {
      const yearOk = year === "all" || String(row.season) === String(year);
      const fieldOk = fieldId === "all" || (row.fieldIds || []).includes(fieldId);
      return yearOk && fieldOk;
    });
  }

  function renderRow(row) {
    const dap = row.kind === "fieldWork" || row.kind === "growth" ? workDap(row.fieldIds, row.date) : "";
    if (row.kind === "growth") {
      return `
        <div class="timeline-item growth">
          <b>${U.escapeHTML(U.fd(row.date))} 生育ログ</b>
          <span class="pill info">${U.escapeHTML(row.target)}</span>
          ${dap ? `<span class="pill warn">${U.escapeHTML(dap)}</span>` : ""}
          <br><span class="muted">${U.escapeHTML(row.detail)}</span>
        </div>
      `;
    }
    return `
      <div class="timeline-item">
        <b>${U.escapeHTML(U.fd(row.date))} ${U.escapeHTML(row.name)}</b><br>
        <span class="pill info">${U.escapeHTML(row.target || "対象なし")}</span>
        ${row.hours ? `<span class="pill warn">時間 ${U.escapeHTML(row.hours)}</span>` : ""}
        ${dap ? `<span class="pill purple">${U.escapeHTML(dap)}</span>` : ""}
        ${row.detail ? `<div>${U.escapeHTML(row.detail)}</div>` : ""}
      </div>
    `;
  }

  function renderTimeline(rows) {
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
      return head + renderRow(row);
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
        ${same.length ? same.map(renderRow).join("") : '<div class="empty">去年同時期の記録はありません。</div>'}
      </div>
    `;
  }

  function renderOptions() {
    const years = new Set([String(new Date().getFullYear())]);
    allRows().forEach((row) => years.add(String(row.season)));
    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    U.setOptions(U.$("annualYear"), [{ value: "all", label: "すべて" }, ...sorted.map((year) => ({ value: year, label: year }))], U.$("annualYear").value || String(new Date().getFullYear()));
    U.setOptions(U.$("annualField"), [{ value: "all", label: "全圃場" }, ...state.fields().map((field) => ({ value: field.fieldId, label: field.name }))], U.$("annualField").value || "all");
  }

  function render() {
    renderOptions();
    const rows = allRows();
    const filtered = filterRows(rows);
    const timeline = filtered.length ? renderTimeline(filtered) : '<div class="empty">記録はまだありません。</div>';
    U.$("annualTimeline").innerHTML = renderLastYear(rows) + timeline;
  }

  function bind() {
    ["annualYear", "annualField", "showLastYear"].forEach((id) => U.$(id).addEventListener("change", render));
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.annual = { render, bind };
})();
