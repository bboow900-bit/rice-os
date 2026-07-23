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

  function riceSvg(stage, cls) {
    const normalized = ["seedling", "tillering", "panicle", "mature"].includes(stage) ? stage : "panicle";
    const showPanicle = normalized === "panicle" || normalized === "mature";
    const showTillers = normalized !== "seedling";
    const mature = normalized === "mature";
    const grain = mature ? "#e8b83c" : "#f6d05a";
    const grainStroke = mature ? "#b98522" : "#d29a24";
    const leafA = mature ? "#6ca553" : "#63a866";
    const leafB = mature ? "#82b34f" : "#78ba61";
    return `
      <svg class="${cls} rice-stage-${normalized}" viewBox="0 0 96 96" aria-hidden="true">
        <ellipse cx="47" cy="82" rx="27" ry="6" fill="#eadc9d" opacity=".55"/>
        <path d="M47 82C47 65 49 48 51 28" fill="none" stroke="#4b8b55" stroke-width="5.2" stroke-linecap="round"/>
        <path d="M48 78C40 62 29 53 15 50C23 65 34 75 48 78Z" fill="${leafA}"/>
        <path d="M50 76C60 61 72 52 84 51C76 66 65 75 50 76Z" fill="${leafB}"/>
        ${showTillers ? `
          <path d="M46 70C42 55 35 45 24 39C28 55 36 66 46 70Z" fill="#5b9f61"/>
          <path d="M52 67C62 53 71 44 83 39C80 55 69 65 52 67Z" fill="#70b65d"/>
          <path d="M48 80C44 67 38 59 29 55C31 68 38 76 48 80Z" fill="#72b45e"/>
        ` : `
          <path d="M47 75C43 64 37 58 28 55C31 66 38 73 47 75Z" fill="#73b965"/>
        `}
        ${showPanicle ? `
          <g fill="none" stroke="${grainStroke}" stroke-width="3.3" stroke-linecap="round">
            <path d="M51 28C40 17 27 16 15 23"/>
            <path d="M51 33C39 24 26 24 14 33"/>
            <path d="M50 39C38 34 27 37 17 47"/>
            <path d="M52 29C61 20 73 20 84 29"/>
            <path d="M52 35C62 31 72 34 81 43"/>
          </g>
          <g fill="${grain}" stroke="${grainStroke}" stroke-width=".8">
            <ellipse cx="17" cy="23" rx="4.1" ry="2.3" transform="rotate(-25 17 23)"/>
            <ellipse cx="25" cy="20" rx="4.1" ry="2.3" transform="rotate(-12 25 20)"/>
            <ellipse cx="34" cy="21" rx="4.1" ry="2.3" transform="rotate(4 34 21)"/>
            <ellipse cx="43" cy="24" rx="4.1" ry="2.3" transform="rotate(18 43 24)"/>
            <ellipse cx="15" cy="33" rx="4" ry="2.25" transform="rotate(-26 15 33)"/>
            <ellipse cx="24" cy="29" rx="4" ry="2.25" transform="rotate(-12 24 29)"/>
            <ellipse cx="34" cy="30" rx="4" ry="2.25" transform="rotate(5 34 30)"/>
            <ellipse cx="43" cy="33" rx="4" ry="2.25" transform="rotate(18 43 33)"/>
            <ellipse cx="18" cy="46" rx="3.8" ry="2.2" transform="rotate(-34 18 46)"/>
            <ellipse cx="27" cy="40" rx="3.8" ry="2.2" transform="rotate(-20 27 40)"/>
            <ellipse cx="37" cy="38" rx="3.8" ry="2.2" transform="rotate(-4 37 38)"/>
            <ellipse cx="46" cy="39" rx="3.8" ry="2.2" transform="rotate(11 46 39)"/>
            <ellipse cx="62" cy="27" rx="3.9" ry="2.25" transform="rotate(-17 62 27)"/>
            <ellipse cx="71" cy="25" rx="3.9" ry="2.25" transform="rotate(2 71 25)"/>
            <ellipse cx="80" cy="29" rx="3.9" ry="2.25" transform="rotate(20 80 29)"/>
            <ellipse cx="63" cy="35" rx="3.7" ry="2.15" transform="rotate(1 63 35)"/>
            <ellipse cx="72" cy="38" rx="3.7" ry="2.15" transform="rotate(18 72 38)"/>
            <ellipse cx="80" cy="43" rx="3.7" ry="2.15" transform="rotate(31 80 43)"/>
          </g>
        ` : ""}
      </svg>
    `;
  }

  function iconSvg(name, className) {
    const cls = `svg-icon ${className || ""}`.trim();
    const iconName = String(name || "");
    if (iconName === "rice" || iconName.startsWith("rice-")) {
      return riceSvg(iconName === "rice" ? "panicle" : iconName.slice(5), cls);
    }
    const icons = {
      rice: `
        <svg class="${cls}" viewBox="0 0 96 96" aria-hidden="true">
          <ellipse cx="47" cy="82" rx="27" ry="6" fill="#eadc9d" opacity=".55"/>
          <path d="M47 82C47 65 49 48 51 28" fill="none" stroke="#4b8b55" stroke-width="5.2" stroke-linecap="round"/>
          <path d="M48 78C40 62 29 53 15 50C23 65 34 75 48 78Z" fill="#63a866"/>
          <path d="M50 76C60 61 72 52 84 51C76 66 65 75 50 76Z" fill="#78ba61"/>
          <path d="M46 70C42 55 35 45 24 39C28 55 36 66 46 70Z" fill="#5b9f61"/>
          <path d="M52 67C62 53 71 44 83 39C80 55 69 65 52 67Z" fill="#70b65d"/>

          <g fill="none" stroke="#d6a229" stroke-width="3.3" stroke-linecap="round">
            <path d="M51 28C40 17 27 16 15 23"/>
            <path d="M51 33C39 24 26 24 14 33"/>
            <path d="M50 39C38 34 27 37 17 47"/>
            <path d="M52 29C61 20 73 20 84 29"/>
            <path d="M52 35C62 31 72 34 81 43"/>
          </g>

          <g fill="#f6d05a" stroke="#d29a24" stroke-width=".8">
            <ellipse cx="17" cy="23" rx="4.1" ry="2.3" transform="rotate(-25 17 23)"/>
            <ellipse cx="25" cy="20" rx="4.1" ry="2.3" transform="rotate(-12 25 20)"/>
            <ellipse cx="34" cy="21" rx="4.1" ry="2.3" transform="rotate(4 34 21)"/>
            <ellipse cx="43" cy="24" rx="4.1" ry="2.3" transform="rotate(18 43 24)"/>
            <ellipse cx="15" cy="33" rx="4" ry="2.25" transform="rotate(-26 15 33)"/>
            <ellipse cx="24" cy="29" rx="4" ry="2.25" transform="rotate(-12 24 29)"/>
            <ellipse cx="34" cy="30" rx="4" ry="2.25" transform="rotate(5 34 30)"/>
            <ellipse cx="43" cy="33" rx="4" ry="2.25" transform="rotate(18 43 33)"/>
            <ellipse cx="18" cy="46" rx="3.8" ry="2.2" transform="rotate(-34 18 46)"/>
            <ellipse cx="27" cy="40" rx="3.8" ry="2.2" transform="rotate(-20 27 40)"/>
            <ellipse cx="37" cy="38" rx="3.8" ry="2.2" transform="rotate(-4 37 38)"/>
            <ellipse cx="46" cy="39" rx="3.8" ry="2.2" transform="rotate(11 46 39)"/>
            <ellipse cx="62" cy="27" rx="3.9" ry="2.25" transform="rotate(-17 62 27)"/>
            <ellipse cx="71" cy="25" rx="3.9" ry="2.25" transform="rotate(2 71 25)"/>
            <ellipse cx="80" cy="29" rx="3.9" ry="2.25" transform="rotate(20 80 29)"/>
            <ellipse cx="63" cy="35" rx="3.7" ry="2.15" transform="rotate(1 63 35)"/>
            <ellipse cx="72" cy="38" rx="3.7" ry="2.15" transform="rotate(18 72 38)"/>
            <ellipse cx="80" cy="43" rx="3.7" ry="2.15" transform="rotate(31 80 43)"/>
          </g>
        </svg>`,
      karte: `
        <svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M9 4v16M7 8h1M7 12h1M7 16h1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>`,
      growthTab: `
        <svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="4" width="14" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
      workTab: `
        <svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="7" width="16" height="12" rx="2" fill="none" stroke="#d94832" stroke-width="2"/>
          <path d="M9 7V5h6v2M4 12h16" fill="none" stroke="#d94832" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
      photoTab: `
        <svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="16.5" cy="9" r="1.6" fill="currentColor"/>
          <path d="M6.5 17l4.4-4.4 3.1 3.1 2.1-2.1 3.2 3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
      tractor: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M13 35h23l6 8h8v8H13Z" fill="#e85a2d" stroke="#7f261b" stroke-width="2" stroke-linejoin="round"/>
          <path d="M21 24h15v11H18Z" fill="#f08a2e" stroke="#7f261b" stroke-width="2" stroke-linejoin="round"/>
          <path d="M39 22h5v19" fill="none" stroke="#7f261b" stroke-width="3" stroke-linecap="round"/>
          <circle cx="23" cy="51" r="9" fill="#28352b"/>
          <circle cx="23" cy="51" r="4" fill="#f6d37b"/>
          <circle cx="48" cy="51" r="6" fill="#28352b"/>
          <circle cx="48" cy="51" r="2.5" fill="#f6d37b"/>
        </svg>`,
      planter: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <rect x="13" y="23" width="36" height="20" rx="3" fill="#eaf4e5" stroke="#3c8746" stroke-width="3"/>
          <path d="M17 28h28M17 34h28M17 40h28" stroke="#3c8746" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M20 19h22l5 4H15Z" fill="#88c777" stroke="#3c8746" stroke-width="2"/>
          <circle cx="18" cy="48" r="5" fill="#27352b"/>
          <circle cx="46" cy="48" r="5" fill="#27352b"/>
          <path d="M22 54c4-3 8-3 12 0M34 54c4-3 8-3 12 0" fill="none" stroke="#62a66d" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
      sprayer: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M27 14h10v8H27Z" fill="#e9f4e6" stroke="#26332a" stroke-width="2.5"/>
          <rect x="20" y="22" width="24" height="30" rx="8" fill="#6fcb56" stroke="#2d7b3b" stroke-width="3"/>
          <path d="M25 29h14M24 44h16" stroke="#2d7b3b" stroke-width="2" stroke-linecap="round"/>
          <circle cx="32" cy="37" r="4" fill="#f05a3a"/>
          <path d="M44 28h10M54 28l4-4M54 28l4 4" fill="none" stroke="#26332a" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
      water: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M11 42c10 8 32 8 42 0" fill="none" stroke="#55aee7" stroke-width="5" stroke-linecap="round"/>
          <path d="M14 49c9 5 27 5 36 0" fill="none" stroke="#8cccf1" stroke-width="3" stroke-linecap="round"/>
          <path d="M23 12c-4 7-8 11-8 16a8 8 0 0 0 16 0c0-5-4-9-8-16Z" fill="#5fb6ee"/>
          <path d="M42 15c-3 5-6 9-6 13a6 6 0 0 0 12 0c0-4-3-8-6-13Z" fill="#7fc8f2"/>
        </svg>`,
      fertilizer: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M20 13h24l4 42H16Z" fill="#d99a32" stroke="#8b4d1f" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M22 13h20v9H22Z" fill="#f3cf78"/>
          <rect x="22" y="29" width="20" height="15" rx="2" fill="#fff0bd"/>
          <text x="32" y="40" text-anchor="middle" font-size="10" font-weight="700" fill="#9b3328">肥料</text>
        </svg>`,
      harvest: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M14 34h31l7 10v8H14Z" fill="#e2b43d" stroke="#7c4a19" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M22 22h18v12H19Z" fill="#efcf67" stroke="#7c4a19" stroke-width="2.5"/>
          <circle cx="23" cy="52" r="7" fill="#28352b"/>
          <circle cx="48" cy="52" r="5" fill="#28352b"/>
          <path d="M46 20c4 2 8 6 10 12" fill="none" stroke="#e2b43d" stroke-width="4" stroke-linecap="round"/>
        </svg>`,
      other: `
        <svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
          <rect x="17" y="16" width="30" height="34" rx="5" fill="#ecefe8" stroke="#6d786f" stroke-width="3"/>
          <path d="M24 27h16M24 35h16M24 43h11" stroke="#6d786f" stroke-width="3" stroke-linecap="round"/>
        </svg>`
    };
    return icons[name] || icons.other;
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
    const text = String(value || "");
    const match = text.match(/^(.*?)(件|時間|圃場)$/);
    const main = match ? match[1] : text;
    const unit = match ? match[2] : "";
    return `
      <div class="annual-summary-card ${tone || ""}">
        <span>${U.escapeHTML(label)}</span>
        <b><strong>${U.escapeHTML(main)}</strong>${unit ? `<small>${U.escapeHTML(unit)}</small>` : ""}</b>
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
    const planting = firstDate(fieldYearRows(field.fieldId, yearValue()), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
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

  function latestGrowthForField(fieldId) {
    return (state.growthLogsFor ? state.growthLogsFor(fieldId) : [])
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function riceStageNumberForField(field) {
    const latest = latestGrowthForField(field.fieldId);
    const planting = firstDate(fieldYearRows(field.fieldId, yearValue()), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
    const baseDate = latest && latest.date || U.today();
    const dap = planting ? U.daysBetween(planting, baseDate) : "";
    const tillers = latest ? U.number(latest.tillerCount, 0) : 0;
    const height = latest ? U.number(latest.plantHeightCm, 0) : 0;
    const leaf = latest ? U.number(latest.leafCount, 0) : 0;
    if (!latest && !planting) return 1;
    const signal = Math.max(
      dap === "" ? 0 : U.number(dap, 0),
      height >= 95 ? 115 : height >= 82 ? 96 : height >= 70 ? 80 : height >= 58 ? 66 : height >= 45 ? 52 : height >= 32 ? 38 : height >= 18 ? 22 : 0,
      tillers >= 24 ? 64 : tillers >= 20 ? 54 : tillers >= 16 ? 44 : tillers >= 11 ? 32 : tillers >= 6 ? 20 : 0,
      leaf >= 8 ? 68 : leaf >= 7 ? 54 : leaf >= 6 ? 42 : leaf >= 5 ? 31 : leaf >= 4 ? 20 : 0
    );
    if (signal < 14) return 1;
    if (signal < 26) return 2;
    if (signal < 40) return 3;
    if (signal < 55) return 4;
    if (signal < 70) return 5;
    if (signal < 88) return 6;
    if (signal < 108) return 7;
    return 8;
  }

  function riceStageAsset(stageNumber) {
    const num = Math.max(1, Math.min(8, Number(stageNumber) || 1));
    return `assets/images/rice-stages/rice-paddy-tile-${String(num).padStart(2, "0")}.png`;
  }

  function riceStageImage(stageNumber, className) {
    const num = Math.max(1, Math.min(8, Number(stageNumber) || 1));
    return `<img class="${U.attr(className || "annual-rice-img")}" src="${U.attr(riceStageAsset(num))}" alt="" loading="lazy" data-rice-stage="${U.attr(String(num))}">`;
  }

  function annualPickerRiceAsset(stageNumber) {
    const num = Math.max(1, Math.min(8, Number(stageNumber) || 1));
    return `assets/images/rice-stages/rice-card-clump-${String(num).padStart(2, "0")}.png`;
  }

  function annualPickerRiceImage(stageNumber) {
    const num = Math.max(1, Math.min(8, Number(stageNumber) || 1));
    return `<img class="annual-rice-img annual-picker-rice-img" src="${U.attr(annualPickerRiceAsset(num))}" alt="" loading="lazy" data-rice-stage="${U.attr(String(num))}">`;
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
    const riceStage = riceStageNumberForField(field);
    const district = field.district ? ` / ${U.escapeHTML(field.district)}` : "";
    return `
      <button type="button" class="annual-field-pick-card status-${U.attr(status.tone)}" data-annual-open-field="${U.attr(field.fieldId)}">
        <span class="annual-field-plant stage-${U.attr(String(riceStage).padStart(2, "0"))}" aria-hidden="true">${annualPickerRiceImage(riceStage)}</span>
        <div class="annual-field-pick-main">
          <div class="annual-field-pick-head">
            <div>
              <b>${U.escapeHTML(field.name)}</b>
              <em>${U.escapeHTML(varietyName(field))}</em>
            </div>
            <strong>${U.escapeHTML(field.areaA ? `${field.areaA}a` : "面積未設定")}</strong>
          </div>
          <small>最終更新：${U.escapeHTML(last)}${district}</small>
          <div class="annual-field-pick-metrics">
            <span class="growth"><i aria-hidden="true"></i>生育 ${U.escapeHTML(String(stats.growth))}件</span>
            <span class="water"><i aria-hidden="true"></i>水管理 ${U.escapeHTML(String(stats.water))}件</span>
            <span class="work"><i aria-hidden="true"></i>作業 ${U.escapeHTML(String(stats.work))}件</span>
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
          </div>
          <div class="annual-filter-row annual-picker-controls">
            <label class="annual-search-label" aria-label="圃場検索">
              <input id="annualSearch" placeholder="圃場名・品種で検索" value="${U.attr(annualSearchValue)}">
            </label>
            <button type="button" class="annual-filter-button" aria-label="絞り込み" title="絞り込み">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16l-6.5 7.2v4.6l-3 1.6v-6.2L4 6z"></path></svg>
            </button>
            <label class="annual-sort-button" aria-label="並び替え">
              <select id="annualSort"></select>
              <span>並び替え ›</span>
            </label>
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

  function fieldSelect(field, key, label, values) {
    return `
      <label>${U.escapeHTML(label)}
        <select data-annual-field-edit="${U.attr(key)}">${optionTags(values, field[key])}</select>
      </label>
    `;
  }

  function karteSourceRow(label, date, sourceText, emptyText) {
    return `
      <div class="annual-karte-source-row">
        <span>${U.escapeHTML(label)}</span>
        <b>${date ? U.escapeHTML(U.fd(date)) : U.escapeHTML(emptyText || "未登録")}</b>
        <small>${date ? U.escapeHTML(sourceText || "作業記録から自動取得") : "田植え作業を登録してください"}</small>
      </div>
    `;
  }

  function optionTags(values, selected) {
    return values.map((value) => `<option value="${U.attr(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${U.escapeHTML(value || "未設定")}</option>`).join("");
  }

  function renderKarteTab(field) {
    const variety = state.variety(field.varietyId);
    const planting = firstDate(fieldYearRows(field.fieldId, yearValue()), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
    const dryStart = state.workDateForField ? state.workDateForField(field.fieldId, "中干し開始") : "";
    const dryEnd = state.workDateForField ? state.workDateForField(field.fieldId, "中干し終了") : "";
    const intermittentStart = state.workDateForField ? state.workDateForField(field.fieldId, "間断灌水開始") : "";
    const wetStart = state.workDateForField ? state.workDateForField(field.fieldId, "湿潤灌漑開始") : "";
    const riceStage = riceStageNumberForField(field);
    const panicle = RiceOS.agro && RiceOS.agro.latestPanicleEstimate
      ? RiceOS.agro.latestPanicleEstimate(field)
      : null;
    return `
      <div class="annual-field-detail-grid">
        <section class="annual-field-detail-card annual-karte-card">
          <div class="section-title compact annual-card-title">
            <h3>圃場カルテ</h3>
            <span class="annual-card-rice stage-${U.attr(String(riceStage).padStart(2, "0"))}" aria-hidden="true">${annualPickerRiceImage(riceStage)}</span>
          </div>
          <div class="form-grid dense annual-edit-grid">
            <label>品種<select data-annual-field-edit="varietyId">${state.varieties().map((v) => `<option value="${U.attr(v.varietyId)}" ${v.varietyId === field.varietyId ? "selected" : ""}>${U.escapeHTML(v.name)}</option>`).join("")}</select></label>
            ${fieldInput(field, "areaA", "面積(a)", "number")}
            ${fieldInput(field, "district", "地区")}
            ${karteSourceRow("田植日", planting, "作業記録から自動取得")}
            ${fieldSelect(field, "waterHolding", "水持ち", ["", "良い", "やや良い", "普通", "やや悪い", "悪い"])}
            ${fieldSelect(field, "soilType", "土質", ["", "砂質", "壌土", "粘土質", "中間", "その他"])}
            ${fieldSelect(field, "ditchRequired", "溝切り要否", ["", "必要", "不要", "圃場による"])}
          </div>
          <label class="annual-wide-label">固定メモ
            <textarea data-annual-field-edit="fixedMemo">${U.escapeHTML(field.fixedMemo || "")}</textarea>
          </label>
        </section>
        <section class="annual-field-detail-card annual-target-card">
          <div class="section-title compact">
            <h3>中干し・水管理目標</h3>
          </div>
          <div class="annual-kv-list">
            ${targetLine("目標分げつ数", variety && variety.targetTillers)}
            ${targetLine("目標ひび割れ幅", field.targetCrackCm ? `${field.targetCrackCm}cm` : "")}
            ${targetLine("目標沈み込み", field.targetSinkCm ? `${field.targetSinkCm}cm` : "")}
            ${targetLine("中干し目安日数", field.drainageTargetDays ? `${field.drainageTargetDays}日` : "")}
            ${targetLine("間断灌水目安日数", field.intermittentIntervalDays ? `${field.intermittentIntervalDays}日` : "")}
            ${targetLine("湿潤灌漑目安日数", field.wetIrrigationTargetDays ? `${field.wetIrrigationTargetDays}日` : "")}
          </div>
          <div class="form-grid dense annual-edit-grid">
            ${fieldInput(field, "targetCrackCm", "ひび割れ幅(cm)")}
            ${fieldInput(field, "targetSinkCm", "沈み込み(cm)")}
            ${fieldInput(field, "drainageTargetDays", "中干し目安日数", "number")}
            ${fieldInput(field, "intermittentIntervalDays", "間断灌水目安日数", "number")}
            ${fieldInput(field, "wetIrrigationTargetDays", "湿潤灌漑目安日数", "number")}
          </div>
        </section>
        <section class="annual-field-detail-card annual-target-card annual-panicle-card">
          <div class="section-title compact">
            <h3>幼穂・出穂予測</h3>
          </div>
          <div class="annual-kv-list">
            ${targetLine("幼穂長", panicle ? `${panicle.lengthMm}mm (${U.fd(panicle.observedDate)})` : "未入力")}
            ${targetLine("出穂まで", panicle ? `あと約${panicle.daysToHeading}日` : "幼穂長を記録してください")}
            ${targetLine("出穂目安", panicle ? `${U.fd(panicle.date)}ごろ` : "-")}
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
          <span class="annual-kind-icon ${row.kind === "fieldWork" ? "annual-work-icon" : ""}">${row.kind === "fieldWork" ? iconSvg(workIconClass(row.title), "annual-entry-svg") : U.escapeHTML(row.kindIcon || row.kindLabel.slice(0, 1))}</span>
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
      ["karte", "karte", "カルテ"],
      ["growth", "growthTab", "生育記録"],
      ["work", "workTab", "作業記録"],
      ["photos", "photoTab", "写真"]
    ];
    return `
      <div class="annual-field-tabs">
        ${tabs.map(([id, icon, label]) => `<button type="button" class="${selectedTab === id ? "active" : ""}" data-annual-tab="${U.attr(id)}">${iconSvg(icon, "annual-tab-svg")}<span>${U.escapeHTML(label)}</span></button>`).join("")}
      </div>
      <div class="annual-field-tab-body">
        ${selectedTab === "growth" ? renderGrowthTab(field) : ""}
        ${selectedTab === "work" ? renderWorkTab(field) : ""}
        ${selectedTab === "photos" ? renderPhotoTab(field) : ""}
        ${selectedTab === "karte" ? renderKarteTab(field) : ""}
      </div>
    `;
  }

  function fieldYearRows(fieldId, year) {
    return allRows().filter((row) => (row.fieldIds || []).includes(fieldId) && String(row.season || String(row.date || "").slice(0, 4)) === String(year));
  }

  function firstDate(rows, test) {
    return rows.filter(test).map((row) => row.date).filter(Boolean).sort()[0] || "";
  }

  function fieldYearSnapshot(field, year) {
    const rows = fieldYearRows(field.fieldId, year);
    const works = rows.filter((row) => row.kind === "fieldWork");
    const growth = rows.filter((row) => row.kind === "growth");
    const dry = rows.filter((row) => row.kind === "dry");
    const water = rows.filter((row) => row.kind === "irrigation");
    const planting = firstDate(works, (row) => /田植/.test(String(row.title || "")));
    const heading = firstDate(growth, (row) => Boolean(row.record && row.record.headingObserved)) || firstDate(works, (row) => /出穂/.test(String(row.title || "")));
    const harvest = firstDate(works, (row) => /収穫|稲刈/.test(String(row.title || "")));
    const materialRows = works.filter((row) => String(row.record && row.record.material || "").trim());
    return {
      year,
      planting,
      trays: field.seedlingBoxes || "",
      dry: dry.length ? `${dry.length}件` : "",
      water: water.length ? `${water.length}件` : "",
      heading,
      growth: growth.length ? `${growth.length}件` : "",
      workHours: totalHours(works),
      materials: materialRows.length ? `${materialRows.length}件` : "",
      harvest,
      photos: rows.filter((row) => row.photoData || row.photo).length,
      memo: rows.map((row) => row.record && row.record.memo).find(Boolean) || ""
    };
  }

  function snapshotText(value, suffix) {
    if (value === "" || value === null || typeof value === "undefined" || value === 0) return "未記録";
    return suffix ? `${value}${suffix}` : String(value);
  }

  function renderYearCompare(field) {
    const currentYear = yearValue() === "all" ? String(new Date().getFullYear()) : String(yearValue());
    const previousYear = String(Number(currentYear) - 1);
    const current = fieldYearSnapshot(field, currentYear);
    const previous = fieldYearSnapshot(field, previousYear);
    const rows = [
      ["田植え日", snapshotText(current.planting), snapshotText(previous.planting)],
      ["苗箱数", snapshotText(current.trays, "箱"), snapshotText(previous.trays, "箱")],
      ["中干し", snapshotText(current.dry), snapshotText(previous.dry)],
      ["水管理", snapshotText(current.water), snapshotText(previous.water)],
      ["出穂日", snapshotText(current.heading), snapshotText(previous.heading)],
      ["生育記録", snapshotText(current.growth), snapshotText(previous.growth)],
      ["作業時間", current.workHours ? U.formatHours(current.workHours) : "未記録", previous.workHours ? U.formatHours(previous.workHours) : "未記録"],
      ["資材使用", snapshotText(current.materials), snapshotText(previous.materials)],
      ["収穫日", snapshotText(current.harvest), snapshotText(previous.harvest)],
      ["写真", current.photos ? `${current.photos}枚` : "未記録", previous.photos ? `${previous.photos}枚` : "未記録"]
    ];
    const missing = rows.filter((row) => row[1] === "未記録").map((row) => row[0]);
    return `
      <section class="annual-compare-card">
        <div class="annual-compare-head"><div><span>来年につなぐ比較</span><h3>${U.escapeHTML(currentYear)}年と${U.escapeHTML(previousYear)}年</h3></div><small>${U.escapeHTML(field.name)} / ${U.escapeHTML(varietyName(field))}</small></div>
        <div class="annual-compare-table"><div class="annual-compare-row annual-compare-label"><b>比較項目</b><b>${U.escapeHTML(currentYear)}年</b><b>${U.escapeHTML(previousYear)}年</b></div>${rows.map((row) => `<div class="annual-compare-row"><span>${U.escapeHTML(row[0])}</span><b class="${row[1] === "未記録" ? "missing" : ""}">${U.escapeHTML(row[1])}</b><b class="${row[2] === "未記録" ? "missing" : ""}">${U.escapeHTML(row[2])}</b></div>`).join("")}</div>
        ${missing.length ? `<div class="annual-compare-check"><b>翌年比較のため、今年はここを残す</b><span>${U.escapeHTML(missing.join(" / "))}</span></div>` : '<div class="annual-compare-check complete"><b>比較に必要な基本記録がそろっています</b><span>来年の判断材料として使えます</span></div>'}
        <label class="annual-carryover-note"><span>来年に引き継ぐメモ</span><textarea data-annual-field-edit="nextSeasonMemo" placeholder="例: この圃場は中干しを早めに始める。穂肥量は葉色を見て控えめに。">${U.escapeHTML(field.nextSeasonMemo || "")}</textarea><small>圃場マスターに保存され、年度をまたいで確認できます。</small></label>
      </section>
    `;
  }

  function renderFieldDetail(field) {
    const planting = firstDate(fieldYearRows(field.fieldId, yearValue()), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
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
        ${renderYearCompare(field)}
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

  function openField(fieldId) {
    selectedFieldId = fieldId || "";
    selectedTab = "karte";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
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
  RiceOS.screens.annual = { render, bind, openField };
})();
