(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let selectedFieldId = "";
  let selectedTab = "karte";
  let annualSearchValue = "";
  let annualSortValue = "updated";

  const KIND_META = {
    fieldWork: { label: "作業", className: "work", icon: "作" },
    growth: { label: "生育", className: "growth", icon: "生" },
    dry: { label: "中干し", className: "water", icon: "水" },
    irrigation: { label: "水管理", className: "water", icon: "水" },
    schedule: { label: "予定", className: "schedule", icon: "予" },
    other: { label: "その他", className: "other", icon: "他" }
  };

  const WORK_ICONS = [
    [/代かき|耕起|基肥|元肥/, "🚜"],
    [/田植え|補植/, "🌱"],
    [/除草|散布/, "🧴"],
    [/溝切り/, "〰"],
    [/中干し|落水|入水|間断|湿潤/, "💧"],
    [/防除/, "噴"],
    [/草刈り/, "刈"],
    [/追肥|肥料/, "肥"],
    [/稲刈り|収穫/, "🌾"]
  ];

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

  function varietyName(field) {
    const variety = field && state.variety(field.varietyId);
    return variety && variety.name || "品種未設定";
  }

  function workIcon(name) {
    const found = WORK_ICONS.find(([pattern]) => pattern.test(String(name || "")));
    return found ? found[1] : "作";
  }

  function workIconClass(name) {
    const text = String(name || "");
    if (/田植え|補植/.test(text)) return "planter";
    if (/除草|散布|防除/.test(text)) return "sprayer";
    if (/溝切り|中干し|落水|入水|間断|湿潤/.test(text)) return "water";
    if (/肥料|基肥|元肥|追肥/.test(text)) return "fertilizer";
    if (/稲刈り|収穫/.test(text)) return "harvest";
    if (/代かき|耕起|草刈り/.test(text)) return "tractor";
    return "other";
  }

  function makeRow(kind, item, values) {
    const meta = KIND_META[kind] || KIND_META.other;
    return {
      kind,
      kindLabel: meta.label,
      kindClass: meta.className,
      kindIcon: values.kindIcon || meta.icon,
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
      photo: values.photo || "",
      raw: item
    };
  }

  function periodParts(item) {
    const planned = item.startDate && item.endDate ? U.daysBetween(item.startDate, item.endDate) : "";
    const actual = item.startDate && item.actualEndDate ? U.daysBetween(item.startDate, item.actualEndDate) : "";
    return [
      item.startDate ? `開始 ${U.fd(item.startDate)}` : "",
      item.endDate ? `予定 ${U.fd(item.endDate)}` : "",
      item.actualEndDate ? `完了 ${U.fd(item.actualEndDate)}` : "",
      planned !== "" ? `予定${planned}日` : "",
      actual !== "" ? `実績${actual}日` : ""
    ].filter(Boolean);
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
      kindIcon: workIcon(w.workName),
      photoData: w.photoData || "",
      photo: w.photo || "",
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
      title: "生育記録",
      fieldIds: [g.fieldId],
      photoData: g.photoData || "",
      photo: g.photo || "",
      detailParts: [
        `分げつ ${g.tillerCount || "-"}`,
        `葉色 ${g.leafColor || "-"}`,
        `草丈 ${g.plantHeightCm || "-"}cm`,
        `葉数 ${g.leafCount || "-"}`,
        `雑草 ${g.weed || "-"}`,
        `ガス ${g.gas || "-"}`,
        g.memo || ""
      ]
    }));
    const dry = (d.dryPeriods || []).map((item) => makeRow("dry", item, {
      id: item.dryPeriodId,
      date: item.date,
      season: item.season,
      title: "中干し観察",
      fieldIds: [item.fieldId],
      status: item.status || (item.actualEndDate ? "完了" : "実施中"),
      photoData: item.photoData || "",
      photo: item.photo || "",
      detailParts: [
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
      title: item.method || "水管理",
      fieldIds: [item.fieldId],
      status: item.periodStatus || (item.actualEndDate ? "完了" : "実施中"),
      detailParts: [
        item.status ? `状態 ${item.status}` : "",
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
      detailParts: [item.scheduleType || "", item.memo || ""]
    }));
    const other = (d.otherWorks || []).map((o) => makeRow("other", o, {
      id: o.otherWorkId,
      date: o.date,
      season: o.season,
      title: o.workName,
      fieldIds: o.relatedFieldIds || [],
      hours: o.hours || "",
      detailParts: [o.quantity ? `数量 ${o.quantity}` : "", o.memo || ""]
    }));
    return [...fieldWorks, ...growth, ...dry, ...irrigation, ...schedules, ...other]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)));
  }

  function yearValue() {
    return U.$("annualYear") && U.$("annualYear").value || String(new Date().getFullYear());
  }

  function rowsForYear(rows) {
    const year = yearValue();
    return rows.filter((row) => year === "all" || String(row.season) === String(year));
  }

  function rowsForField(rows, fieldId) {
    return rows.filter((row) => (row.fieldIds || []).includes(fieldId));
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
    const workCount = rows.filter((row) => row.kind === "fieldWork").length;
    const waterCount = rows.filter((row) => row.kind === "dry" || row.kind === "irrigation").length;
    const growthCount = rows.filter((row) => row.kind === "growth").length;
    return `
      <section class="annual-summary-board">
        <div>
          <b>${U.escapeHTML(yearValue() === "all" ? "全年度のサマリー" : `${yearValue()}年のサマリー`)}</b>
          <span>1月1日〜12月31日</span>
        </div>
        <div class="annual-summary-grid">
          ${summaryCard("記録件数", `${rows.length}件`, "green")}
          ${summaryCard("作業時間", U.formatHours(totalHours(rows)), "amber")}
          ${summaryCard("対象圃場数", `${fields.length}圃場`, "blue")}
          ${summaryCard("生育記録数", `${growthCount}件`, "purple")}
          ${summaryCard("水管理記録数", `${waterCount}件`, "blue")}
          ${summaryCard("作業記録数", `${workCount}件`, "amber")}
        </div>
      </section>
    `;
  }

  function maxDate(values) {
    return (values || []).filter(Boolean).sort().pop() || "";
  }

  function fieldRows(fieldId) {
    return rowsForField(rowsForYear(allRows()), fieldId);
  }

  function latestDateForField(fieldId) {
    return maxDate(fieldRows(fieldId).map((row) => row.date));
  }

  function fieldStatus(field, stats) {
    if (!stats.total) return { label: "記録なし", tone: "muted" };
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
    const dap = planting ? U.daysBetween(planting, U.today()) : "";
    const dryStart = state.workDateForField ? state.workDateForField(field.fieldId, "中干し開始") : "";
    if (dap !== "" && dap >= 30 && dap <= 50 && !dryStart) return { label: "中干し候補", tone: "warn" };
    if (!stats.growth) return { label: "生育記録未入力", tone: "warn" };
    const lastDays = stats.lastDate ? U.daysBetween(stats.lastDate, U.today()) : "";
    if (lastDays !== "" && lastDays <= 14) return { label: "順調", tone: "ok" };
    return { label: "要確認", tone: "warn" };
  }

  function fieldStats(field) {
    const rows = fieldRows(field.fieldId);
    return {
      rows,
      total: rows.length,
      work: rows.filter((row) => row.kind === "fieldWork").length,
      growth: rows.filter((row) => row.kind === "growth").length,
      water: rows.filter((row) => row.kind === "dry" || row.kind === "irrigation").length,
      photos: rows.filter((row) => row.photoData || row.photo).length,
      lastDate: maxDate(rows.map((row) => row.date))
    };
  }

  function filteredFields() {
    const query = String(U.$("annualSearch") ? U.$("annualSearch").value : annualSearchValue).trim().toLowerCase();
    const sort = U.$("annualSort") ? U.$("annualSort").value : annualSortValue;
    const items = state.fields().map((field) => {
      const stats = fieldStats(field);
      const status = fieldStatus(field, stats);
      return { field, stats, status };
    }).filter(({ field }) => {
      if (!query) return true;
      const haystack = [
        field.name,
        field.district,
        varietyName(field)
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
    return items.sort((a, b) => {
      if (sort === "name") return a.field.name.localeCompare(b.field.name);
      if (sort === "area") return U.number(b.field.areaA) - U.number(a.field.areaA) || a.field.name.localeCompare(b.field.name);
      if (sort === "variety") return varietyName(a.field).localeCompare(varietyName(b.field)) || a.field.name.localeCompare(b.field.name);
      if (sort === "status") return a.status.label.localeCompare(b.status.label) || a.field.name.localeCompare(b.field.name);
      return String(b.stats.lastDate).localeCompare(String(a.stats.lastDate)) || a.field.name.localeCompare(b.field.name);
    });
  }

  function renderFieldPickerCard(item) {
    const { field, stats, status } = item;
    const last = stats.lastDate ? U.fd(stats.lastDate) : "記録なし";
    return `
      <button type="button" class="annual-field-pick-card status-${U.attr(status.tone)}" data-annual-open-field="${U.attr(field.fieldId)}">
        <div class="annual-field-plant" aria-hidden="true"><span></span></div>
        <div class="annual-field-pick-main">
          <div class="annual-field-pick-head">
            <div>
              <b>${U.escapeHTML(field.name)}</b>
              <em>${U.escapeHTML(varietyName(field))}</em>
            </div>
            <strong>${U.escapeHTML(field.areaA ? `${field.areaA}a` : "面積未設定")}</strong>
          </div>
          <small>最終更新：${U.escapeHTML(last)}${field.district ? ` / ${U.escapeHTML(field.district)}` : ""}</small>
          <div class="annual-field-pick-metrics">
            <span class="growth">生育 ${U.escapeHTML(String(stats.growth))}件</span>
            <span class="water">水管理 ${U.escapeHTML(String(stats.water))}件</span>
            <span class="work">作業 ${U.escapeHTML(String(stats.work))}件</span>
          </div>
        </div>
        <span class="annual-status-badge ${U.attr(status.tone)}">${U.escapeHTML(status.label)}</span>
      </button>
    `;
  }

  function renderTop(rows) {
    const fields = filteredFields();
    return `
      <div class="annual-v2-top">
        ${renderSummary(rows)}
        <section class="annual-field-picker">
          <div class="section-title compact">
            <h3>圃場一覧</h3>
            <span class="muted">圃場を選ぶと履歴へ移動</span>
          </div>
          <div class="filter-row annual-filter-row annual-picker-controls">
            <label class="compact-label annual-search-label">検索<input id="annualSearch" placeholder="圃場名・品種で検索" value="${U.attr(annualSearchValue)}"></label>
            <label class="compact-label">並び替え<select id="annualSort"></select></label>
          </div>
          <div class="annual-field-pick-grid">
            ${fields.length ? fields.map(renderFieldPickerCard).join("") : '<div class="empty">条件に合う圃場がありません。</div>'}
          </div>
        </section>
        ${renderAnnualFab()}
      </div>
    `;
  }

  function sourceLine(label, date, sourceText, emptyText) {
    return `
      <div class="annual-kv-row">
        <span>${U.escapeHTML(label)}</span>
        <b>${date ? U.escapeHTML(U.fd(date)) : U.escapeHTML(emptyText || "未登録")}</b>
        <small>${date ? U.escapeHTML(sourceText || "作業記録") : "作業記録を登録してください"}</small>
      </div>
    `;
  }

  function targetLine(label, value) {
    return `
      <div class="annual-kv-row">
        <span>${U.escapeHTML(label)}</span>
        <b>${U.escapeHTML(value || "未設定")}</b>
      </div>
    `;
  }

  function fieldInput(field, key, label, type) {
    return `
      <label>${U.escapeHTML(label)}
        <input type="${U.attr(type || "text")}" data-annual-field-edit="${U.attr(key)}" value="${U.attr(field[key] || "")}">
      </label>
    `;
  }

  function optionTags(values, selected) {
    return values.map((value) => `<option value="${U.attr(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${U.escapeHTML(value || "未設定")}</option>`).join("");
  }

  function renderKarteTab(field) {
    const variety = state.variety(field.varietyId);
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
    const dryStart = state.workDateForField ? state.workDateForField(field.fieldId, "中干し開始") : "";
    const dryEnd = state.workDateForField ? state.workDateForField(field.fieldId, "中干し終了") : "";
    const intermittentStart = state.workDateForField ? state.workDateForField(field.fieldId, "間断灌水開始") : "";
    const wetStart = state.workDateForField ? state.workDateForField(field.fieldId, "湿潤灌漑開始") : "";
    return `
      <div class="annual-field-detail-grid">
        <section class="annual-field-detail-card annual-karte-card">
          <div class="section-title compact annual-card-title">
            <h3>圃場カルテ</h3>
            <span class="annual-card-rice" aria-hidden="true"></span>
          </div>
          <div class="form-grid dense annual-edit-grid">
            ${fieldInput(field, "name", "圃場名")}
            ${fieldInput(field, "district", "地区")}
            <label>品種<select data-annual-field-edit="varietyId">${state.varieties().map((v) => `<option value="${U.attr(v.varietyId)}" ${v.varietyId === field.varietyId ? "selected" : ""}>${U.escapeHTML(v.name)}</option>`).join("")}</select></label>
            ${fieldInput(field, "areaA", "面積(a)", "number")}
            <label>状態<select data-annual-field-edit="status">${optionTags(["使用中", "休耕", "終了"], field.status)}</select></label>
            <label>土質<select data-annual-field-edit="soilType">${optionTags(["", "砂質", "粘土質", "中間", "その他"], field.soilType)}</select></label>
            <label>水持ち<select data-annual-field-edit="waterHolding">${optionTags(["", "良い", "普通", "悪い"], field.waterHolding)}</select></label>
            <label>排水性<select data-annual-field-edit="drainage">${optionTags(["", "良い", "普通", "悪い"], field.drainage)}</select></label>
          </div>
          <label class="annual-wide-label">固定メモ
            <textarea data-annual-field-edit="fixedMemo">${U.escapeHTML(field.fixedMemo || "")}</textarea>
          </label>
        </section>
        <section class="annual-field-detail-card annual-target-card">
          <div class="section-title compact">
            <h3>作業記録からの基準日</h3>
            <span class="muted">日付はカルテで直接編集しません</span>
          </div>
          <div class="annual-kv-list">
            ${sourceLine("田植日", planting, "作業記録: 田植え")}
            ${sourceLine("中干し開始", dryStart, "作業記録: 中干し開始")}
            ${sourceLine("中干し終了", dryEnd, "作業記録: 中干し終了")}
            ${sourceLine("間断灌水開始", intermittentStart, "作業記録: 間断灌水開始")}
            ${sourceLine("湿潤灌漑開始", wetStart, "作業記録: 湿潤灌漑開始")}
          </div>
        </section>
        <section class="annual-field-detail-card annual-target-card">
          <div class="section-title compact">
            <h3>中干し・水管理目標</h3>
            <span class="muted">判断枠だけ用意</span>
          </div>
          <div class="annual-kv-list">
            ${targetLine("目標分げつ数", variety && variety.targetTillers)}
            ${targetLine("目標ひび割れ幅", field.targetCrackCm ? `${field.targetCrackCm}cm` : "")}
            ${targetLine("目標沈み込み", field.targetSinkCm ? `${field.targetSinkCm}cm` : "")}
          </div>
          <div class="form-grid dense annual-edit-grid">
            ${fieldInput(field, "targetCrackCm", "ひび割れ幅(cm)")}
            ${fieldInput(field, "targetSinkCm", "沈み込み(cm)")}
            ${fieldInput(field, "drainageTargetDays", "中干し目安日数", "number")}
            ${fieldInput(field, "intermittentIntervalDays", "間断灌水目安日数", "number")}
            ${fieldInput(field, "wetIrrigationTargetDays", "湿潤灌漑目安日数", "number")}
          </div>
        </section>
      </div>
    `;
  }

  function photosForField(fieldId) {
    return [
      ...state.growthLogsFor(fieldId).map((row) => ({ date: row.date, title: "生育", photoData: row.photoData, photo: row.photo })),
      ...state.fieldWorksFor(fieldId).map((row) => ({ date: row.date, title: row.workName || "作業", photoData: row.photoData, photo: row.photo })),
      ...state.dryPeriodsFor(fieldId).map((row) => ({ date: row.date, title: "中干し", photoData: row.photoData, photo: row.photo }))
    ].filter((row) => row.photoData || row.photo).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function dryByDate(fieldId) {
    const map = new Map();
    state.dryPeriodsFor(fieldId).forEach((row) => {
      if (!map.has(row.date)) map.set(row.date, []);
      map.get(row.date).push(row);
    });
    return map;
  }

  function renderGrowthTab(field) {
    const dryMap = dryByDate(field.fieldId);
    const growthRows = state.growthLogsFor(field.fieldId);
    const dates = unique([
      ...growthRows.map((row) => row.date),
      ...state.dryPeriodsFor(field.fieldId).map((row) => row.date)
    ]).sort((a, b) => String(b).localeCompare(String(a)));
    if (!dates.length) return '<div class="empty">生育記録はまだありません。</div>';
    return `
      <div class="annual-growth-list">
        ${dates.map((date) => {
          const growth = growthRows.filter((row) => row.date === date)[0] || null;
          const dry = (dryMap.get(date) || [])[0] || null;
          const photo = growth && growth.photoData || dry && dry.photoData || "";
          return `
            <article class="annual-growth-row">
              <div>
                <b>${U.escapeHTML(U.fd(date))}</b>
                <span>田植後 ${U.escapeHTML(String(U.daysAfterPlanting(field, date) || "-"))}日</span>
              </div>
              <dl>
                <div><dt>分げつ</dt><dd>${U.escapeHTML(growth && growth.tillerCount || "-")}</dd></div>
                <div><dt>葉色</dt><dd>${U.escapeHTML(growth && growth.leafColor || "-")}</dd></div>
                <div><dt>草丈</dt><dd>${U.escapeHTML(growth && growth.plantHeightCm ? `${growth.plantHeightCm}cm` : "-")}</dd></div>
                <div><dt>ひび</dt><dd>${U.escapeHTML(dry && dry.crackCm ? `${dry.crackCm}cm` : "-")}</dd></div>
                <div><dt>沈み</dt><dd>${U.escapeHTML(dry && dry.sinkCm ? `${dry.sinkCm}cm` : "-")}</dd></div>
              </dl>
              ${photo ? `<img src="${U.attr(photo)}" alt="">` : '<span class="annual-photo-empty">写真なし</span>'}
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function chip(text, tone) {
    return text ? `<span class="annual-chip ${tone || ""}">${U.escapeHTML(text)}</span>` : "";
  }

  function compactParts(parts, max = 5) {
    const clean = (parts || []).filter(Boolean);
    if (clean.length <= max) return clean;
    return [...clean.slice(0, max), `ほか${clean.length - max}`];
  }

  function renderEntry(row, showDate) {
    const detail = compactParts(row.detailParts).join(" / ");
    return `
      <article class="annual-entry annual-${U.attr(row.kindClass)} annual-work-card">
        <div class="annual-entry-main annual-work-main">
          <span class="annual-kind-icon ${row.kind === "fieldWork" ? `annual-work-icon annual-work-icon-${U.attr(workIconClass(row.title))}` : ""}">${U.escapeHTML(row.kindIcon || row.kindLabel.slice(0, 1))}</span>
          <div class="annual-entry-title">
            <time>${showDate ? U.escapeHTML(U.fd(row.date)) : ""}</time>
            <b>${U.escapeHTML(row.title)}</b>
            <span>${U.escapeHTML(detail || row.target || "対象なし")}</span>
          </div>
          ${row.photoData ? `<img class="annual-thumb" src="${U.attr(row.photoData)}" alt="">` : ""}
          <button type="button" class="annual-work-more" aria-label="操作">…</button>
        </div>
        <div class="annual-chip-row">
          ${row.worker ? chip(row.worker, "worker") : ""}
          ${row.hours ? chip(`時間 ${row.hours}`, "hours") : ""}
          ${row.status ? chip(row.status, row.status === "完了" ? "done" : "status") : ""}
          ${chip(`田植後 ${U.daysAfterPlanting(state.field((row.fieldIds || [])[0]), row.date) || "-"}日`, "dap")}
        </div>
        <div class="inline-actions annual-work-actions">
          <button class="secondary" data-annual-action="edit" data-kind="${U.attr(row.kind)}" data-id="${U.attr(row.id)}">編集</button>
          <button class="danger" data-annual-action="delete" data-kind="${U.attr(row.kind)}" data-id="${U.attr(row.id)}">削除</button>
        </div>
      </article>
    `;
  }

  function renderWorkTab(field) {
    const rows = rowsForField(rowsForYear(allRows()), field.fieldId)
      .filter((row) => row.kind === "fieldWork")
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!rows.length) return '<div class="empty">作業記録はまだありません。</div>';
    return `<div class="annual-entry-list field-view">${rows.map((row) => renderEntry(row, true)).join("")}</div>`;
  }

  function renderPhotoTab(field) {
    const photos = photosForField(field.fieldId);
    if (!photos.length) return '<div class="empty">写真はまだありません。</div>';
    return `
      <div class="annual-photo-compare-grid">
        ${photos.map((photo) => `
          <article>
            ${photo.photoData ? `<img src="${U.attr(photo.photoData)}" alt="">` : `<div>${U.escapeHTML(photo.photo || "写真メモ")}</div>`}
            <b>${U.escapeHTML(photo.title)}</b>
            <span>${U.escapeHTML(U.fd(photo.date))}</span>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderTabs(field) {
    const tabs = [
      ["karte", "カルテ"],
      ["growth", "生育記録"],
      ["work", "作業記録"],
      ["photos", "写真"]
    ];
    return `
      <div class="annual-field-tabs">
        ${tabs.map(([id, label]) => `<button type="button" class="${selectedTab === id ? "active" : ""}" data-annual-tab="${U.attr(id)}">${U.escapeHTML(label)}</button>`).join("")}
      </div>
      <div class="annual-field-tab-body">
        ${selectedTab === "growth" ? renderGrowthTab(field) : ""}
        ${selectedTab === "work" ? renderWorkTab(field) : ""}
        ${selectedTab === "photos" ? renderPhotoTab(field) : ""}
        ${selectedTab === "karte" ? renderKarteTab(field) : ""}
      </div>
    `;
  }

  function renderFieldDetail(field) {
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
    return `
      <div class="annual-field-detail">
        <div class="annual-detail-head">
          <button type="button" class="annual-detail-back" data-annual-back aria-label="戻る">‹</button>
          <div>
            <span>圃場履歴</span>
            <h2>${U.escapeHTML(field.name)}</h2>
            <p>${U.escapeHTML(varietyName(field))} / ${U.escapeHTML(field.areaA ? `${field.areaA}a` : "面積未設定")}${planting ? ` / 田植後${U.escapeHTML(String(U.daysAfterPlanting(field, U.today())))}日` : ""}</p>
          </div>
          <button type="button" class="annual-detail-menu" aria-label="メニュー">…</button>
        </div>
        ${renderTabs(field)}
        ${renderAnnualFab(field.fieldId)}
      </div>
    `;
  }

  function renderAnnualFab(fieldId) {
    return `
      <button type="button" class="annual-fab" data-annual-fab="${U.attr(fieldId || "")}" aria-label="記録を追加">+</button>
    `;
  }

  function renderOptions() {
    const years = new Set([String(new Date().getFullYear())]);
    allRows().forEach((row) => years.add(String(row.season)));
    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    U.setOptions(U.$("annualYear"), [{ value: "all", label: "全年度" }, ...sorted.map((year) => ({ value: year, label: `${year}年` }))], yearValue());
    renderSortOptions();
  }

  function renderSortOptions() {
    if (!U.$("annualSort")) return;
    U.setOptions(U.$("annualSort"), [
      { value: "updated", label: "更新日順" },
      { value: "name", label: "圃場名順" },
      { value: "area", label: "面積順" },
      { value: "variety", label: "品種順" },
      { value: "status", label: "ステータス順" }
    ], annualSortValue);
  }

  function render() {
    renderOptions();
    const field = selectedFieldId && state.field(selectedFieldId);
    const rows = rowsForYear(allRows());
    const screen = U.$("screen-annual");
    if (screen) screen.classList.toggle("annual-detail-mode", Boolean(field));
    U.$("annualTimeline").innerHTML = field ? renderFieldDetail(field) : renderTop(rows);
    renderSortOptions();
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

  function openAdd(fieldId) {
    const targetFieldId = fieldId || selectedFieldId || (state.activeFields()[0] && state.activeFields()[0].fieldId) || "";
    if (RiceOS.bottomSheet) {
      RiceOS.bottomSheet.open(U.today(), targetFieldId);
      return;
    }
    RiceOS.app.show("field-work");
    if (targetFieldId && RiceOS.screens.fieldWork) RiceOS.screens.fieldWork.prefillDate(U.today(), targetFieldId);
  }

  function bind() {
    const year = U.$("annualYear");
    if (year) year.addEventListener("change", render);
    U.$("annualTimeline").addEventListener("click", (event) => {
      const open = event.target.closest("[data-annual-open-field]");
      if (open) {
        selectedFieldId = open.dataset.annualOpenField;
        selectedTab = "karte";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (event.target.closest("[data-annual-back]")) {
        selectedFieldId = "";
        selectedTab = "karte";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const tab = event.target.closest("[data-annual-tab]");
      if (tab) {
        selectedTab = tab.dataset.annualTab;
        render();
        return;
      }
      const fab = event.target.closest("[data-annual-fab]");
      if (fab) {
        openAdd(fab.dataset.annualFab);
        return;
      }
      const action = event.target.closest("[data-annual-action]");
      if (action) {
        if (action.dataset.annualAction === "edit") editRow(action.dataset.kind, action.dataset.id);
        if (action.dataset.annualAction === "delete") deleteRow(action.dataset.kind, action.dataset.id);
      }
    });
    U.$("annualTimeline").addEventListener("input", (event) => {
      if (event.target && event.target.id === "annualSearch") {
        annualSearchValue = event.target.value;
        render();
      }
    });
    U.$("annualTimeline").addEventListener("change", (event) => {
      if (event.target && event.target.id === "annualSort") {
        annualSortValue = event.target.value || "updated";
        render();
        return;
      }
      const el = event.target.closest("[data-annual-field-edit]");
      if (!el || !selectedFieldId) return;
      const key = el.dataset.annualFieldEdit;
      let value = el.value;
      if (["areaA"].includes(key)) value = U.number(value, 0);
      state.updateField(selectedFieldId, { [key]: value });
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.annual = { render, bind };
})();
