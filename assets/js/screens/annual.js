(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let selectedFieldId = "";
  let selectedTab = "karte";
  let annualSearchValue = "";
  let annualSortValue = "updated";
  let seasonNoteDraft = null;
  let waterEditDraft = null;
  let reviewView = "overview";
  let compareFilter = "work";
  let timelineActionRecord = null;
  let recordDetail = null;
  let expandedFlowRecord = "";
  let timelineLongPressTimer = null;
  let timelinePointerStart = null;
  let suppressTimelineOpenUntil = 0;

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
    if (/溝切り|中干し|落水|入水|間断|飽水|湿潤/.test(text)) return "water";
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

  function completedWaterSchedule(item) {
    return Boolean(item && item.recordKind === "water" && (item.completedAt || item.completedByWaterPeriodId || item.completionLink));
  }

  function allRows() {
    const d = state.data();
    // 専用の水管理期間として残る記録は、作業一覧との重複を避ける。
    const fieldWorks = d.fieldWorks
      .filter((w) => !(state.waterEventForWorkName && state.waterEventForWorkName(w.workName)) && !(state.isMigratedWaterWork && state.isMigratedWaterWork(w)))
      .flatMap((w) => {
      const visibleFieldIds = (w.fieldIds || []).filter((fieldId) => !(state.isMigratedWaterWork && state.isMigratedWaterWork(w, fieldId)));
      if (!visibleFieldIds.length) return [];
      return [makeRow("fieldWork", w, {
      id: w.workId,
      date: w.date,
      season: w.season,
      title: w.workName,
      worker: w.worker || "",
      fieldIds: visibleFieldIds,
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
      })];
      });
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
    const irrigation = (d.irrigations || [])
      .filter((item) => /間断|飽水|深水|湿潤|稲刈り前の落水|^落水$/.test(String(item.method || "")))
      .map((item) => makeRow("irrigation", item, {
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
    // A completed water schedule is represented by its direct period above.
    // Keep the schedule stored for audit/editing, but do not duplicate it in the annual actual timeline.
    const schedules = (d.schedules || []).filter((item) => !completedWaterSchedule(item)).map((item) => makeRow("schedule", item, {
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

  function hoursForField(row, fieldId) {
    const record = row && row.raw || {};
    const allocated = record.fieldAllocatedHours && record.fieldAllocatedHours[fieldId];
    if (allocated !== undefined && allocated !== "") return U.parseWorkHours(allocated);
    const ids = record.batchFieldIds && record.batchFieldIds.length ? record.batchFieldIds : (row.fieldIds || []);
    const total = U.parseWorkHours(record.totalHours || row.hours);
    if (record.timeAccounting === "shared" && ids.length > 1) return total / ids.length;
    return total;
  }

  function totalHoursForField(rows, fieldId) {
    return rows.reduce((sum, row) => sum + hoursForField(row, fieldId), 0);
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
    // Water history is read through the common resolver so older work records
    // and direct water entries use the same counting rule as field detail.
    const selectedYear = yearValue() === "all" ? undefined : yearValue();
    const waterCount = state.resolvedWaterPeriodsFor
      ? state.fields().reduce((sum, field) => sum + state.resolvedWaterPeriodsFor(field.fieldId, {
        year: selectedYear,
        includePlanned: false,
        forDisplay: false
      }).length, 0)
      : rows.filter((row) => row.kind === "dry" || row.kind === "irrigation").length;
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

  function stageAsOfDateForField(fieldId) {
    const selectedYear = yearValue();
    const currentYear = String(new Date().getFullYear());
    if (selectedYear === "all" || String(selectedYear) === currentYear) return U.today();

    const latestRecordDate = maxDate(fieldYearRows(fieldId, selectedYear)
      .filter((row) => row.kind !== "schedule" && !/(?:予定|確認候補)/.test(String(row.title || "")))
      .map((row) => row.date));
    return latestRecordDate || `${selectedYear}-12-31`;
  }

  function fieldStatus(field, stats) {
    if (!stats.total) return { label: "記録なし", tone: "muted", action: "work" };
    const planting = firstDate(fieldYearRows(field.fieldId, yearValue()), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
    const asOfDate = stageAsOfDateForField(field.fieldId);
    const dap = planting ? U.daysBetween(planting, asOfDate) : "";
    const dryStart = state.resolvedWaterPeriodsFor
      ? state.resolvedWaterPeriodsFor(field.fieldId, { year: yearValue() === "all" ? undefined : yearValue(), throughDate: asOfDate, forDisplay: true })
        .filter((row) => row.kind === "dry").map((row) => row.startDate).filter(Boolean).sort()[0] || ""
      : "";
    if (dap !== "" && dap >= 30 && dap <= 50 && !dryStart) {
      return { label: "中干し候補", tone: "warn", action: "dry" };
    }
    if (!stats.growth) return { label: "生育未入力", tone: "warn", action: "growth" };
    const lastDays = stats.lastDate ? U.daysBetween(stats.lastDate, asOfDate) : "";
    if (lastDays !== "" && lastDays <= 14) {
      return { label: "順調", tone: "ok" };
    }
    return { label: "記録更新", tone: "warn", action: "growth" };
  }

  function fieldStats(field) {
    const rows = fieldRows(field.fieldId);
    const actualRows = rows.filter((row) => row.kind !== "schedule" && !/(?:予定|確認候補)/.test(String(row.title || "")));
    const resolvedWater = state.resolvedWaterPeriodsFor
      ? state.resolvedWaterPeriodsFor(field.fieldId, { year: yearValue() === "all" ? undefined : yearValue(), includePlanned: true, forDisplay: true })
      : [];
    return {
      rows,
      total: actualRows.length,
      work: actualRows.filter((row) => row.kind === "fieldWork").length,
      growth: actualRows.filter((row) => row.kind === "growth").length,
      water: resolvedWater.length,
      photos: rows.filter((row) => row.photoData || row.photo).length,
      lastDate: maxDate(actualRows.map((row) => row.date))
    };
  }

  function latestGrowthForField(fieldId) {
    return fieldRows(fieldId)
      .filter((row) => row.kind === "growth")
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function workDateForAnnualYear(fieldId, names, mode) {
    const matched = fieldRows(fieldId)
      .filter((row) => row.kind === "fieldWork" && (Array.isArray(names) ? names : [names]).some((name) => String(row.title || "").includes(name)))
      .map((row) => row.date)
      .filter(Boolean)
      .sort();
    return mode === "last" ? matched[matched.length - 1] || "" : matched[0] || "";
  }

  function annualStageForField(field) {
    if (!RiceOS.agro || !RiceOS.agro.seasonStageForField) return null;
    return RiceOS.agro.seasonStageForField(field, stageAsOfDateForField(field.fieldId));
  }

  function annualGrowthSummary(field, year, stage, plantingDate, asOfDate) {
    const latest = state.growthLogsFor(field.fieldId, year)
      .filter((row) => row.date && row.date <= asOfDate)
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
    const dap = plantingDate ? U.daysBetween(plantingDate, asOfDate) : "";
    const detail = latest
      ? `最新 ${U.fd(latest.date)} / ${stage && stage.certainty || "記録あり"}`
      : plantingDate ? `${stage && stage.certainty || "記録待ち"} / 田植後${dap}日`
      : stage && stage.certainty || "記録待ち";
    return { detail };
  }

  function annualWaterSummary(field, year, asOfDate, management) {
    const periods = state.resolvedWaterPeriodsFor
      ? state.resolvedWaterPeriodsFor(field.fieldId, { year, includePlanned: false, forDisplay: true })
      : [];
    const valid = periods.filter((period) => (period.startDate || period.actualEndDate)
      && !/予定/.test(String(period.status || ""))
      && !/予定/.test(String(period.raw && (period.raw.status || period.raw.periodStatus) || "")));
    const active = valid.filter((period) => period.startDate && period.startDate <= asOfDate && (!period.actualEndDate || period.actualEndDate > asOfDate))
      .slice().sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || null;
    const completedByAsOf = valid.filter((period) => isTimelineDate(period.startDate)
      && isTimelineDate(period.actualEndDate)
      && period.actualEndDate >= period.startDate
      && period.actualEndDate <= asOfDate);
    const latest = active || completedByAsOf.slice().sort((a, b) => String(b.actualEndDate || b.startDate || "").localeCompare(String(a.actualEndDate || a.startDate || "")))[0] || null;
    if (!latest) return { label: management && management.label || "中干し未実施", detail: "水管理の記録待ち" };
    const start = latest.startDate || "";
    const end = latest.actualEndDate || "";
    const days = start && end ? U.daysBetween(start, end) : "";
    const activeLabel = active ? `${latest.label}中` : `${latest.label}完了`;
    const detail = start && end
      ? `${U.fd(start)}〜${U.fd(end)}${days === "" || days < 0 ? "" : ` / ${days}日`}`
      : start ? `${U.fd(start)}開始 / 継続中` : `${U.fd(end)}完了`;
    return { label: active ? activeLabel : management && management.label || activeLabel, detail };
  }

  function renderYearFlowStatusOverview(stage, stageImage, growth, water) {
    return `
      <section class="annual-status-overview annual-year-flow-status" aria-label="一年の流れの生育と水管理">
        <button type="button" class="annual-status-summary growth stage-${U.attr(stage && stage.current && stage.current.key || "waiting")}" data-annual-tab="growth">
          <span class="annual-status-summary-image">${annualPickerRiceImage(stageImage)}</span>
          <div><small>生育記録</small><b>${U.escapeHTML(stage && stage.current && stage.current.label || "記録待ち")}</b><p>${U.escapeHTML(growth.detail)}</p></div>
        </button>
        <button type="button" class="annual-status-summary water" data-annual-tab="water">
          <span class="annual-status-summary-icon" aria-hidden="true">💧</span>
          <div><small>水管理</small><b>${U.escapeHTML(water.label)}</b><p>${U.escapeHTML(water.detail)}</p></div>
        </button>
      </section>
    `;
  }

  function riceStageNumberForField(field) {
    const stage = annualStageForField(field);
    if (stage) return stage.image;
    const latest = latestGrowthForField(field.fieldId);
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId, reviewYearValue()) : firstDate(fieldYearRows(field.fieldId, yearValue()), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
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
    const stage = annualStageForField(field);
    const riceStage = riceStageNumberForField(field);
    const district = field.district ? ` / ${U.escapeHTML(field.district)}` : "";
    const statusBadge = status.action
      ? `<button type="button" class="annual-status-badge ${U.attr(status.tone)} action" data-annual-status-action="${U.attr(status.action)}" data-annual-status-field="${U.attr(field.fieldId)}"><b>${U.escapeHTML(status.label)}</b><small>入力へ</small></button>`
      : `<span class="annual-status-badge ${U.attr(status.tone)}">${U.escapeHTML(status.label)}</span>`;
    return `
      <article class="annual-field-pick-card status-${U.attr(status.tone)}">
        <button type="button" class="annual-field-pick-open" data-annual-open-field="${U.attr(field.fieldId)}" aria-label="${U.attr(field.name)}の圃場履歴を開く">
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
          <small class="annual-field-stage">現在：${U.escapeHTML(stage && stage.current ? stage.current.label : "記録待ち")} / ${U.escapeHTML(stage && stage.certainty || "記録待ち")}</small>
          <div class="annual-field-pick-metrics">
            <span class="growth"><i aria-hidden="true"></i>生育 ${U.escapeHTML(String(stats.growth))}件</span>
            <span class="water"><i aria-hidden="true"></i>水管理 ${U.escapeHTML(String(stats.water))}件</span>
            <span class="work"><i aria-hidden="true"></i>作業 ${U.escapeHTML(String(stats.work))}件</span>
          </div>
          </div>
        </button>
        ${statusBadge}
      </article>
    `;
  }

  function renderTop(rows) {
    const fields = filteredFields();
    return `
      <div class="annual-v2-top">
        <section class="annual-field-picker">
          <div class="section-title compact">
            <h3>圃場から振り返る</h3>
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
        ${renderSummary(rows)}
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

  function latestPanicleLogForYear(fieldId, year) {
    const targetYear = year && year !== "all" ? String(year) : "";
    return state.growthSummaryFor
      ? state.growthSummaryFor(fieldId, targetYear || undefined).panicleLog
      : state.growthLogsFor(fieldId, targetYear || undefined)
        .filter((row) => U.number(row.panicleLengthMm, 0) > 0)
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function dryCompletionForYear(fieldId, year) {
    if (!state.resolvedWaterPeriodsFor) return "";
    return state.resolvedWaterPeriodsFor(fieldId, { year, includePlanned: true, forDisplay: true })
      .filter((row) => row.kind === "dry")
      .map((row) => row.actualEndDate)
      .filter(Boolean)
      .sort()
      .pop() || "";
  }

  function renderKarteTab(field) {
    const variety = state.variety(field.varietyId);
    const detailYear = reviewYearValue();
    const planting = state.plantingDateForField
      ? state.plantingDateForField(field.fieldId, detailYear)
      : firstDate(fieldYearRows(field.fieldId, detailYear), (row) => row.kind === "fieldWork" && /^田植え$/.test(String(row.title || "")));
    const riceStage = riceStageNumberForField(field);
    const panicleLog = latestPanicleLogForYear(field.fieldId, yearValue());
    const growthSummary = state.growthSummaryFor ? state.growthSummaryFor(field.fieldId, yearValue()) : null;
    const headingDate = growthSummary && growthSummary.headingDate || "";
    const dryCompleted = dryCompletionForYear(field.fieldId, yearValue());
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
            ${targetLine("中干し完了日", dryCompleted || "未記録")}
          </div>
          <div class="form-grid dense annual-edit-grid">
            ${fieldInput(field, "targetCrackCm", "ひび割れ幅(cm)")}
            ${fieldInput(field, "targetSinkCm", "沈み込み(cm)")}
            ${fieldInput(field, "drainageTargetDays", "中干し目安日数", "number")}
            ${fieldInput(field, "intermittentIntervalDays", "間断灌水目安日数", "number")}
          </div>
        </section>
        <section class="annual-field-detail-card annual-target-card annual-panicle-card">
          <div class="section-title compact">
            <h3>幼穂・出穂の実測</h3>
          </div>
          <div class="annual-kv-list">
            ${targetLine("最新の幼穂確認", panicleLog ? `${panicleLog.panicleLengthMm}mm（${U.fd(panicleLog.date)} 実測）` : "未記録")}
            ${targetLine("出穂日", headingDate ? `${U.fd(headingDate)}（実測）` : "未記録")}
            ${targetLine("記録の扱い", "この画面では実測のみを表示")}
          </div>
        </section>
      </div>
    `;
  }

  function photosForField(fieldId, year) {
    const targetYear = year && year !== "all" ? String(year) : undefined;
    return [
      ...state.growthLogsFor(fieldId, targetYear).map((row) => ({ date: row.date, title: "生育", photoData: row.photoData, photo: row.photo })),
      // Migrated water work is hidden from the work list to avoid duplicate
      // timeline rows, but its photos stay visible in the annual photo record.
      ...state.fieldWorksFor(fieldId, targetYear).filter((row) => !(state.waterEventForWorkName && state.waterEventForWorkName(row.workName))).map((row) => ({ date: row.date, title: row.workName || "作業", photoData: row.photoData, photo: row.photo })),
      ...state.dryPeriodsFor(fieldId, targetYear).map((row) => ({ date: row.date, title: "中干し", photoData: row.photoData, photo: row.photo }))
    ].filter((row) => row.photoData || row.photo).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function calendarDistance(dateA, dateB) {
    const a = String(dateA || "").slice(5);
    const b = String(dateB || "").slice(5);
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    return Math.abs(new Date(`2000-${a}T00:00:00`).getTime() - new Date(`2000-${b}T00:00:00`).getTime());
  }

  function plantingDateForPhotoComparison(fieldId, year) {
    if (state.plantingDateForField) return state.plantingDateForField(fieldId, year);
    return firstDate(fieldYearRows(fieldId, year), (row) => row.kind === "fieldWork" && /田植/.test(String(row.title || "")));
  }

  function photoComparisonForAnnual(field) {
    const currentYear = reviewYearValue();
    const previousYear = String(Number(currentYear) - 1);
    const current = photosForField(field.fieldId, currentYear).find((photo) => photo.photoData) || null;
    const previousPhotos = photosForField(field.fieldId, previousYear).filter((photo) => photo.photoData);
    if (!current) return { currentYear, previousYear, current: null, previous: null, label: "今年の写真がありません" };
    if (!previousPhotos.length) return { currentYear, previousYear, current, previous: null, label: "前年の写真がありません" };
    const currentPlanting = plantingDateForPhotoComparison(field.fieldId, currentYear);
    const previousPlanting = plantingDateForPhotoComparison(field.fieldId, previousYear);
    if (currentPlanting && previousPlanting) {
      const currentDap = U.daysBetween(currentPlanting, current.date);
      const previous = previousPhotos.slice().sort((a, b) => Math.abs(U.daysBetween(previousPlanting, a.date) - currentDap) - Math.abs(U.daysBetween(previousPlanting, b.date) - currentDap))[0];
      return { currentYear, previousYear, current, previous, label: `田植後 ${currentDap}日 / 前年 ${U.daysBetween(previousPlanting, previous.date)}日で比較` };
    }
    const previous = previousPhotos.slice().sort((a, b) => calendarDistance(a.date, current.date) - calendarDistance(b.date, current.date))[0];
    return { currentYear, previousYear, current, previous, label: "同じ暦日の近傍で比較" };
  }

  function renderAnnualPhotoComparison(field) {
    const comparison = photoComparisonForAnnual(field);
    const card = (year, photo, current) => photo ? `<figure><img src="${U.attr(photo.photoData)}" alt="${U.attr(`${year}年 ${photo.title}`)}"><figcaption><b>${U.escapeHTML(current ? "今年" : "前年")}</b><span>${U.escapeHTML(U.fd(photo.date))} / ${U.escapeHTML(photo.title)}</span></figcaption></figure>` : `<div class="annual-photo-compare-empty"><b>${U.escapeHTML(current ? "今年" : "前年")}</b><span>${U.escapeHTML(current ? "写真未登録" : "前年写真なし")}</span></div>`;
    return `<section class="annual-photo-period-compare"><div class="annual-photo-period-compare-head"><div><span>写真比較</span><b>${U.escapeHTML(comparison.label)}</b></div><small>${U.escapeHTML(comparison.currentYear)}年 / ${U.escapeHTML(comparison.previousYear)}年</small></div><div class="annual-photo-period-compare-grid">${card(comparison.currentYear, comparison.current, true)}${card(comparison.previousYear, comparison.previous, false)}</div></section>`;
  }

  function dryByDate(fieldId, year) {
    const map = new Map();
    const targetYear = year && year !== "all" ? String(year) : undefined;
    const periods = state.resolvedWaterPeriodsFor
      ? state.resolvedWaterPeriodsFor(fieldId, { year: targetYear, includePlanned: true, forDisplay: true }).filter((row) => row.kind === "dry")
      : [];
    periods.forEach((period) => {
      [period.startDate, period.actualEndDate].filter(Boolean).forEach((date) => {
        if (!map.has(date)) map.set(date, []);
        map.get(date).push({ ...(period.raw || {}), date, startDate: period.startDate, actualEndDate: period.actualEndDate });
      });
    });
    return map;
  }

  function renderGrowthTab(field) {
    const selectedYear = yearValue();
    const targetYear = selectedYear === "all" ? undefined : String(selectedYear);
    const dryMap = dryByDate(field.fieldId, targetYear);
    const growthRows = state.growthLogsFor(field.fieldId, targetYear);
    const dates = unique([
      ...growthRows.map((row) => row.date),
      ...Array.from(dryMap.keys())
    ]).sort((a, b) => String(b).localeCompare(String(a)));
    if (!dates.length) return '<div class="empty">生育記録はまだありません。</div>';
    return `
      <div class="annual-growth-list">
        ${dates.map((date) => {
          const sameDayGrowth = growthRows.filter((row) => row.date === date);
          // 幼穂・出穂を別々に登録しても、同日の生育カードで見落とさない。
          const growth = sameDayGrowth.reduce((merged, row) => ({
            ...merged,
            leafCount: row.leafCount || merged.leafCount,
            tillerCount: row.tillerCount || merged.tillerCount,
            plantHeightCm: row.plantHeightCm || merged.plantHeightCm,
            leafColor: row.leafColor && row.leafColor !== "-" ? row.leafColor : merged.leafColor,
            panicleLengthMm: row.panicleLengthMm || merged.panicleLengthMm,
            headingObserved: Boolean(merged.headingObserved || row.headingObserved),
            photoData: row.photoData || merged.photoData
          }), {
            leafCount: "",
            tillerCount: "",
            plantHeightCm: "",
            leafColor: "",
            panicleLengthMm: "",
            headingObserved: false,
            photoData: ""
          });
          const dry = (dryMap.get(date) || [])[0] || null;
          const photo = growth.photoData || dry && dry.photoData || "";
          return `
            <article class="annual-growth-row">
              <div>
                <b>${U.escapeHTML(U.fd(date))}</b>
                <span>田植後 ${U.escapeHTML(String(U.daysAfterPlanting(field, date) || "-"))}日</span>
              </div>
              <dl>
                <div><dt>分げつ</dt><dd>${U.escapeHTML(growth.tillerCount || "-")}</dd></div>
                <div><dt>葉色</dt><dd>${U.escapeHTML(growth.leafColor || "-")}</dd></div>
                <div><dt>草丈</dt><dd>${U.escapeHTML(growth.plantHeightCm ? `${growth.plantHeightCm}cm` : "-")}</dd></div>
                <div><dt>幼穂</dt><dd>${U.escapeHTML(growth.panicleLengthMm ? `${growth.panicleLengthMm}mm` : "-")}</dd></div>
                <div><dt>出穂</dt><dd>${U.escapeHTML(growth.headingObserved ? "確認" : "-")}</dd></div>
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
    const rows = state.fieldWorksFor(field.fieldId, yearValue() === "all" ? undefined : yearValue())
      .filter((row) => !(state.waterEventForWorkName && state.waterEventForWorkName(row.workName))
        && !(state.isMigratedWaterWork && state.isMigratedWaterWork(row, field.fieldId)))
      .map((row) => makeRow("fieldWork", row, {
        id: row.workId, date: row.date, season: row.season, title: row.workName,
        worker: row.worker || "", fieldIds: [field.fieldId], hours: row.hours || "",
        kindIcon: workIcon(row.workName), photoData: row.photoData || "", photo: row.photo || "",
        detailParts: [row.machine ? `機械 ${row.machine}` : "", row.material ? `資材 ${row.material} ${row.amount || ""}` : "", row.memo || ""].filter(Boolean)
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!rows.length) return '<div class="empty">作業記録はまだありません。</div>';
    return `<div class="annual-entry-list field-view">${rows.map((row) => renderEntry(row, true)).join("")}</div>`;
  }

  function waterPeriodDays(startDate, endDate) {
    if (!startDate || !endDate) return "";
    const days = U.daysBetween(startDate, endDate);
    return days === "" || days < 0 ? "" : days;
  }

  function periodCoversWaterMovements(record, startDate, endDate) {
    const movements = Array.isArray(record && record.waterMovements) ? record.waterMovements : [];
    return movements.filter((movement) => movement && movement.startDate).every((movement) => {
      if (String(movement.startDate) < String(startDate)) return false;
      return !endDate || !movement.endDate || String(movement.endDate) <= String(endDate);
    });
  }

  function waterPeriodLabel(method) {
    const text = String(method || "");
    if (/中干し/.test(text)) return "中干し";
    if (/間断/.test(text)) return "間断灌水";
    if (/飽水/.test(text)) return "飽水管理";
    if (/深水/.test(text)) return "深水管理";
    if (/稲刈り前.*落水|^落水$/.test(text)) return "稲刈り前の落水";
    if (/湿潤/.test(text)) return "湿潤灌漑（旧記録）";
    return "";
  }

  function waterPeriodTone(label) {
    if (/中干し/.test(label)) return "dry";
    if (/間断/.test(label)) return "intermittent";
    if (/飽水/.test(label)) return "saturated";
    if (/深水/.test(label)) return "deep";
    if (/落水/.test(label)) return "drain";
    if (/湿潤/.test(label)) return "legacy";
    return "water";
  }

  function waterPeriodsForField(field) {
    const selectedYear = yearValue();
    const year = selectedYear === "all" ? undefined : String(selectedYear);
    const resolved = state.resolvedWaterPeriodsFor
      ? state.resolvedWaterPeriodsFor(field.fieldId, { year, includePlanned: true, forDisplay: true })
      : [];
    return resolved
      .map((period) => ({
        id: period.periodId,
        label: period.label,
        tone: waterPeriodTone(period.label),
        startDate: period.startDate || "",
        plannedEndDate: period.plannedEndDate || "",
        actualEndDate: period.actualEndDate || "",
        targetDays: period.targetDays || "",
        status: period.status || "",
        waterMovements: Array.isArray(period.raw && period.raw.waterMovements) ? period.raw.waterMovements.slice() : [],
        memo: period.raw && period.raw.memo || "",
        sourceType: period.source || "",
        editKind: period.source === "legacy-work" ? "fieldWork" : (period.kind === "dry" ? "dry" : "irrigation"),
        editId: period.source === "legacy-work" ? (period.sourceWorkIds || [])[0] || "" : period.directId || "",
        sourceWorkIds: Array.isArray(period.sourceWorkIds) ? period.sourceWorkIds.slice() : [],
        source: period.source === "legacy-work" ? "作業記録から反映" : (period.source === "mixed" ? "作業・水管理記録を統合" : "水管理記録")
      }))
      .map((period) => ({
        ...period,
        sequence: resolved.filter((other) => other.label === period.label
          && String(other.startDate || other.actualEndDate || "") <= String(period.startDate || period.actualEndDate || "")).length
      }))
      .sort((a, b) => String(b.startDate || b.actualEndDate).localeCompare(String(a.startDate || a.actualEndDate)));
  }

  function legacyWaterReviewRowsForField(field) {
    const selectedYear = yearValue();
    const year = selectedYear === "all" ? undefined : String(selectedYear);
    const rows = state.legacyWaterReviewFor ? state.legacyWaterReviewFor(field.fieldId, { year }) : [];
    return rows.map((period) => ({
      legacyKey: period.legacyKey || "",
      kind: period.kind || "",
      label: period.label || "水管理",
      startDate: period.startDate || "",
      actualEndDate: period.actualEndDate || "",
      status: period.status || "",
      migrated: Boolean(period.migrated),
      sourceWorkIds: Array.isArray(period.sourceWorkIds) ? period.sourceWorkIds.slice() : []
    })).sort((a, b) => String(b.startDate || b.actualEndDate).localeCompare(String(a.startDate || a.actualEndDate)));
  }

  function renderWaterPeriod(period) {
    const plannedDays = Number(period.targetDays) || waterPeriodDays(period.startDate, period.plannedEndDate);
    // 完了は実終了日のみで確定する。表示用の状態文言では実績を補わない。
    const hasStart = isTimelineDate(period.startDate);
    const hasEnd = isTimelineDate(period.actualEndDate);
    const dateOrderInvalid = hasStart && hasEnd && period.actualEndDate < period.startDate;
    const completed = hasStart && hasEnd && !dateOrderInvalid;
    const active = hasStart && period.startDate <= U.today() && String(yearValue()) === String(new Date().getFullYear());
    const displayEnd = completed ? period.actualEndDate : (active ? U.today() : "");
    const elapsedDays = waterPeriodDays(period.startDate, displayEnd);
    const actualDays = completed ? waterPeriodDays(period.startDate, period.actualEndDate) : "";
    const progressDays = actualDays !== "" ? actualDays : elapsedDays;
    const progress = plannedDays ? Math.max(0, Math.min(100, Math.round((Number(progressDays || 0) / Number(plannedDays)) * 100))) : 0;
    const subtitle = dateOrderInvalid ? "日付要確認" : completed ? "完了" : (period.startDate > U.today() ? "開始前" : (active ? "継続中" : (period.startDate ? "終了日未記録" : "開始日を記録してください")));
    const heading = `${period.label}${period.sequence > 1 ? ` ${period.sequence}回目` : ""}`;
    const actionLabel = "編集";
    const supportsMovements = period.tone === "intermittent" || period.tone === "saturated";
    const movementLabel = (movement) => {
      if (period.tone === "saturated") return movement.phase === "drain" ? "自然落水" : "給水・飽水";
      return movement.phase === "drain" ? "落水" : "入水";
    };
    const movements = (period.waterMovements || []).filter((movement) => movement && movement.startDate)
      .slice().sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const movementHistory = supportsMovements && movements.length ? `<details class="annual-water-movements">
      <summary>期間内の水の動き <b>${movements.length}区間</b></summary>
      <div>${movements.map((movement) => {
        const rawDays = movement.endDate ? waterPeriodDays(movement.startDate, movement.endDate) : "";
        const days = rawDays === "" ? "" : Number(rawDays) + 1;
        return `<p><b>${U.escapeHTML(movementLabel(movement))}</b><span>${U.escapeHTML(U.fd(movement.startDate))} ${movement.endDate ? `- ${U.escapeHTML(U.fd(movement.endDate))}` : "- 継続中"}${days !== "" ? ` / ${days}日` : ""}</span></p>`;
      }).join("")}</div>
    </details>` : "";
    return `
      <article class="annual-water-period annual-water-period-${U.attr(period.tone)}">
        <div class="annual-water-period-head">
          <span class="annual-water-period-icon">${iconSvg("water", "annual-water-svg")}</span>
          <div><b>${U.escapeHTML(heading)}</b><small>${U.escapeHTML(subtitle)}${period.source ? ` / ${U.escapeHTML(period.source)}` : ""}</small></div>
          <strong>${actualDays !== "" ? `実績 ${actualDays}日` : (plannedDays ? `目安 ${plannedDays}日` : "期間確認")}</strong>
        </div>
        <div class="annual-water-period-dates">
          <span><small>開始</small><b>${U.escapeHTML(period.startDate ? U.fd(period.startDate) : "未記録")}</b></span>
          <span><small>予定終了</small><b>${U.escapeHTML(period.plannedEndDate ? U.fd(period.plannedEndDate) : "未設定")}</b></span>
          <span><small>実績終了</small><b>${U.escapeHTML(completed ? U.fd(period.actualEndDate) : (dateOrderInvalid ? "日付要確認" : (period.actualEndDate ? "日付要確認" : (active ? "継続中" : "未記録"))))}</b></span>
        </div>
        ${plannedDays ? `<div class="annual-water-period-progress"><i><em style="width:${progress}%"></em></i><span>予定 ${plannedDays}日${progressDays !== "" ? ` / ${completed ? "実績" : "経過"} ${progressDays}日` : ""}</span></div>` : ""}
        ${movementHistory}
        ${period.memo ? `<p class="annual-water-period-memo">${U.escapeHTML(period.memo)}</p>` : ""}
        ${period.editId ? `<div class="annual-water-period-actions"><button type="button" class="secondary" data-annual-water-edit="${U.attr(period.editKind)}" data-id="${U.attr(period.editId)}">${actionLabel}</button><button type="button" class="danger" data-annual-water-delete="${U.attr(period.editKind)}" data-id="${U.attr(period.editId)}">削除</button></div>` : ""}
      </article>
    `;
  }

  function renderLegacyWaterReviewRow(period) {
    const dates = period.startDate && period.actualEndDate
      ? `${U.fd(period.startDate)} - ${U.fd(period.actualEndDate)}`
      : (period.startDate ? `${U.fd(period.startDate)} 開始` : `${U.fd(period.actualEndDate)} 終了記録`);
    const canImport = Boolean(period.startDate && period.actualEndDate && !period.migrated);
    return `
      <article class="annual-water-review ${period.migrated ? "migrated" : ""}">
        <div><span>${U.escapeHTML(period.label)}</span><b>${U.escapeHTML(dates)}</b><small>旧作業記録 ${U.escapeHTML(String(period.sourceWorkIds.length))}件</small></div>
        <div class="annual-water-review-actions">
          ${period.migrated ? '<em>取込済み（元作業は保持）</em>' : (canImport ? `<button type="button" class="primary" data-annual-water-import="${U.attr(period.legacyKey)}">水管理へ取り込む</button>` : `<button type="button" class="secondary" data-annual-water-continue="${U.attr(period.legacyKey)}">水管理で続き入力</button>`)}
        </div>
      </article>
    `;
  }

  function waterRecord(kind, id) {
    if (kind === "dry") return state.data().dryPeriods.find((row) => row.dryPeriodId === id) || null;
    if (kind === "irrigation") return state.data().irrigations.find((row) => row.irrigationId === id) || null;
    return null;
  }

  function renderWaterEditor(field) {
    if (!waterEditDraft) return "";
    const record = waterRecord(waterEditDraft.kind, waterEditDraft.id);
    if (!record || record.fieldId !== field.fieldId) return "";
    const label = waterEditDraft.kind === "dry" ? "中干し" : (record.method || "水管理");
    return `
      <section class="annual-water-editor" data-annual-water-editor>
        <div><span>振り返りから編集</span><h3>${U.escapeHTML(label)}</h3><small>${U.escapeHTML(field.name)}の記録を修正します</small></div>
        <form data-annual-water-edit-form class="annual-season-note-editor">
          <input type="hidden" name="kind" value="${U.attr(waterEditDraft.kind)}"><input type="hidden" name="id" value="${U.attr(waterEditDraft.id)}">
          <div class="form-grid dense"><label>開始日<input name="startDate" type="date" value="${U.attr(record.startDate || record.date || "")}" required></label><label>終了日<input name="actualEndDate" type="date" value="${U.attr(record.actualEndDate || "")}"></label></div>
          <label>メモ<textarea name="memo">${U.escapeHTML(record.memo || "")}</textarea></label>
          <div class="annual-water-editor-actions"><button type="button" class="secondary" data-annual-water-cancel>キャンセル</button><button type="submit" class="primary">変更を保存</button><button type="button" class="danger" data-annual-water-editor-delete="${U.attr(waterEditDraft.kind)}" data-id="${U.attr(waterEditDraft.id)}">この水管理記録を削除</button></div>
        </form>
      </section>
    `;
  }

  function renderWaterTab(field) {
    // A future resolver can mark a direct record as "mixed" after an explicit
    // legacy link. It remains an editable water record, never a hidden row.
    const directPeriods = waterPeriodsForField(field).filter((period) => period.sourceType !== "legacy-work");
    const legacyPeriods = legacyWaterReviewRowsForField(field).filter((period) => !period.migrated);
    if (!directPeriods.length && !legacyPeriods.length) return '<div class="empty">中干し・間断灌水・飽水管理・深水管理・稲刈り前の落水を記録すると、期間をここで振り返れます。</div>';
    return `${renderWaterEditor(field)}
      <section class="annual-water-periods"><div class="annual-water-periods-heading"><div><span>水管理として登録済み</span><h3>開始日と終了日を管理</h3></div><small>${directPeriods.length}件</small></div>${directPeriods.length ? directPeriods.map(renderWaterPeriod).join("") : '<div class="empty compact">水管理として登録済みの期間はありません。</div>'}</section>
      ${legacyPeriods.length ? `<section class="annual-water-review-list"><div class="annual-water-periods-heading"><div><span>照合待ち</span><h3>旧作業記録から見つかった水管理</h3></div><small>${legacyPeriods.length}件</small></div><p class="annual-water-review-note">元の作業記録は残したまま、水管理へ取り込めます。</p>${legacyPeriods.map(renderLegacyWaterReviewRow).join("")}</section>` : ""}`;
  }

  function renderPhotoTab(field) {
    const photos = photosForField(field.fieldId, yearValue());
    return `
      ${renderAnnualPhotoComparison(field)}
      ${photos.length ? `<div class="annual-photo-compare-grid">
          ${photos.map((photo) => `
            <article>
              ${photo.photoData ? `<img src="${U.attr(photo.photoData)}" alt="">` : `<div>${U.escapeHTML(photo.photo || "写真メモ")}</div>`}
              <b>${U.escapeHTML(photo.title)}</b>
              <span>${U.escapeHTML(U.fd(photo.date))}</span>
            </article>
          `).join("")}
        </div>` : '<div class="empty">写真はまだありません。</div>'}
    `;
  }

  function renderTabs(field) {
    const tabs = [
      ["karte", "karte", "カルテ"],
      ["growth", "growthTab", "生育記録"],
      ["work", "workTab", "作業記録"],
      ["water", "water", "水管理"],
      ["photos", "photoTab", "写真"]
    ];
    return `
      <div class="annual-field-tabs">
        ${tabs.map(([id, icon, label]) => `<button type="button" class="${selectedTab === id ? "active" : ""}" data-annual-tab="${U.attr(id)}">${iconSvg(icon, "annual-tab-svg")}<span>${U.escapeHTML(label)}</span></button>`).join("")}
      </div>
      <div class="annual-field-tab-body">
        ${selectedTab === "growth" ? renderGrowthTab(field) : ""}
        ${selectedTab === "work" ? renderWorkTab(field) : ""}
        ${selectedTab === "water" ? renderWaterTab(field) : ""}
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

  function periodSnapshot(items) {
    const rows = items.map((row) => row.raw || row)
      .filter((row) => row.startDate || row.actualEndDate)
      .slice()
      .sort((a, b) => String(a.startDate || a.date).localeCompare(String(b.startDate || b.date)));
    if (!rows.length) return { text: "", days: "", startDate: "", endDate: "" };
    const first = rows[0];
    const startDate = first.startDate || first.date || "";
    const endDate = first.actualEndDate || "";
    const validEnd = isTimelineDate(startDate) && isTimelineDate(endDate) && endDate >= startDate;
    const days = validEnd ? U.daysBetween(startDate, endDate) : "";
    const isCurrent = isTimelineDate(startDate) && startDate.slice(0, 4) === String(new Date().getFullYear()) && startDate <= U.today();
    const text = validEnd
      ? `${U.fd(startDate)}〜${U.fd(endDate)}${days === "" ? "" : ` (${days}日)`}`
      : endDate ? `${U.fd(startDate)} → 日付要確認`
        : `${U.fd(startDate)} → ${startDate > U.today() ? "開始前" : (isCurrent ? "継続中" : "終了日未記録")}`;
    return {
      text,
      days,
      startDate,
      endDate
    };
  }

  function waterPeriodSnapshot(rows, pattern) {
    return periodSnapshot(rows.filter((row) => pattern.test(String(row.raw && row.raw.method || row.title || ""))));
  }

  function resolvedPeriodSnapshot(fieldId, year, kind) {
    if (!state.resolvedWaterPeriodsFor) return { text: "", days: "", startDate: "", endDate: "" };
    const rows = state.resolvedWaterPeriodsFor(fieldId, { year, includePlanned: true, forDisplay: true })
      .filter((row) => row.kind === kind)
      .map((row) => ({ startDate: row.startDate, actualEndDate: row.actualEndDate }));
    return periodSnapshot(rows);
  }

  function fieldYearSnapshot(field, year) {
    const rows = fieldYearRows(field.fieldId, year);
    const works = rows.filter((row) => row.kind === "fieldWork");
    const growth = rows.filter((row) => row.kind === "growth");
    const planting = firstDate(works, (row) => /田植/.test(String(row.title || "")));
    const growthSummary = state.growthSummaryFor ? state.growthSummaryFor(field.fieldId, year) : null;
    const heading = growthSummary && growthSummary.headingDate
      || firstDate(growth, (row) => Boolean(row.raw && row.raw.headingObserved));
    const harvest = firstDate(works, (row) => /収穫|稲刈/.test(String(row.title || "")));
    const materialRows = works.filter((row) => String(row.raw && row.raw.material || "").trim());
    const panicle = growthSummary && growthSummary.panicleLog
      || growth.map((row) => row.raw).filter((row) => U.number(row && row.panicleLengthMm, 0) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
    const dryPeriod = resolvedPeriodSnapshot(field.fieldId, year, "dry");
    const intermittent = resolvedPeriodSnapshot(field.fieldId, year, "intermittent");
    const deepWater = resolvedPeriodSnapshot(field.fieldId, year, "deep");
    const resultRows = (state.data().varietyResults || []).filter((row) => String(row.season) === String(year) && row.varietyId === field.varietyId);
    const result = resultRows.find((row) => row.fieldId === field.fieldId) || resultRows.find((row) => !row.fieldId) || null;
    const resultScope = result && result.fieldId ? "" : (result ? "（品種集計）" : "");
    return {
      year,
      planting,
      trays: field.seedlingBoxes || "",
      dry: dryPeriod.text,
      dryDays: dryPeriod.days,
      intermittent: intermittent.text,
      deepWater: deepWater.text,
      heading,
      panicle: panicle ? `${U.fd(panicle.date)} / ${panicle.panicleLengthMm}mm` : "",
      workHours: totalHoursForField(works, field.fieldId),
      materials: materialRows.length ? unique(materialRows.map((row) => row.raw.material)).join("・") : "",
      harvest,
      photos: rows.filter((row) => row.photoData || row.photo).length,
      yield: result && result.yield ? `${result.yield}${resultScope}` : "",
      yieldPer10a: result && result.yieldPer10a ? `${result.yieldPer10a}${resultScope}` : "",
      quality: result && (result.quality || result.grade) ? `${result.quality || result.grade}${resultScope}` : "",
      memo: rows.map((row) => row.raw && row.raw.memo).find(Boolean) || ""
    };
  }

  function snapshotText(value, suffix) {
    if (value === "" || value === null || typeof value === "undefined" || value === 0) return "未記録";
    return suffix ? `${value}${suffix}` : String(value);
  }

  function reviewYearValue() {
    return yearValue() === "all" ? String(new Date().getFullYear()) : String(yearValue());
  }

  function seasonNotesForReview(fieldId) {
    if (!state.seasonNotesForField) return [];
    return (state.seasonNotesForField(fieldId, reviewYearValue()) || []).slice()
      .sort((a, b) => String(b.date || b.updatedAt || "").localeCompare(String(a.date || a.updatedAt || "")));
  }

  function seasonNoteId(note) {
    return String(note && (note.noteId || note.seasonNoteId || note.id) || "");
  }

  function defaultSeasonNoteDate(year) {
    const today = U.today();
    return String(today).startsWith(`${year}-`) ? today : `${year}-01-01`;
  }

  function renderSeasonNotes(field) {
    const year = reviewYearValue();
    const notes = seasonNotesForReview(field.fieldId);
    const draft = seasonNoteDraft && seasonNoteDraft.fieldId === field.fieldId && String(seasonNoteDraft.year) === year ? seasonNoteDraft : null;
    return `
      <section class="annual-season-notes" aria-label="${U.escapeHTML(year)}年の気づき">
        <div class="annual-season-notes-head"><div><span>${U.escapeHTML(year)}年の記録</span><h3>今年の気づき</h3></div><button type="button" class="secondary" data-season-note-add="${U.attr(field.fieldId)}">追加</button></div>
        ${draft ? `<div class="annual-season-note-editor" data-season-note-editor="${U.attr(field.fieldId)}"><label>日付<input type="date" data-season-note-date value="${U.attr(draft.date || defaultSeasonNoteDate(year))}"></label><label>気づき<textarea data-season-note-memo placeholder="例: この時期は水持ちが良く、落水を急がなかった。">${U.escapeHTML(draft.memo || "")}</textarea></label><div><button type="button" class="secondary" data-season-note-cancel>閉じる</button><button type="button" class="primary" data-season-note-save="${U.attr(field.fieldId)}" data-season-note-id="${U.attr(draft.noteId || "")}">保存</button></div></div>` : ""}
        <div class="annual-season-note-list">
          ${notes.length ? notes.map((note) => `<article><time>${U.escapeHTML(note.date ? U.fd(note.date) : "日付未登録")}</time><p>${U.escapeHTML(note.text || note.memo || note.note || "")}</p><div><button type="button" data-season-note-edit="${U.attr(seasonNoteId(note))}">編集</button><button type="button" class="danger" data-season-note-delete="${U.attr(seasonNoteId(note))}">削除</button></div></article>`).join("") : '<p class="annual-season-note-empty">今年の気づきを残すと、翌年の比較で思い出せます。</p>'}
        </div>
      </section>
    `;
  }

  function isTimelineDate(value) {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(`${text}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(text.slice(0, 4)) && date.getMonth() + 1 === Number(text.slice(5, 7)) && date.getDate() === Number(text.slice(8, 10));
  }

  function timelineDays(startDate, endDate) {
    if (!isTimelineDate(startDate) || !isTimelineDate(endDate)) return "";
    const days = Number(U.daysBetween(startDate, endDate));
    return Number.isFinite(days) && days >= 0 ? days : "";
  }

  function timelineDateParts(value, includeYear) {
    if (!isTimelineDate(value)) return { text: "", day: "", weekday: "" };
    const date = new Date(`${value}T00:00:00`);
    const prefix = includeYear ? `${date.getFullYear()}/` : "";
    const day = `${prefix}${date.getMonth() + 1}/${date.getDate()}`;
    const weekday = `（${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}）`;
    return { text: `${day}${weekday}`, day, weekday };
  }

  function timelineWorkEntry(row) {
    const name = String(row.workName || "作業記録");
    const isHarvest = /収穫|稲刈り/.test(name) && !/落水/.test(name);
    return {
      id: row.workId,
      editKind: "fieldWork",
      date: String(row.date || ""),
      label: name,
      category: isHarvest ? "収穫" : "農作業",
      tone: isHarvest ? "harvest" : "work",
      lane: "work",
      detail: String(row.material || row.machine || "作業記録")
    };
  }

  function timelineWaterEntry(period) {
    const startDate = isTimelineDate(period.startDate) ? period.startDate : "";
    const endDate = isTimelineDate(period.actualEndDate) ? period.actualEndDate : "";
    const date = startDate || endDate;
    if (!date) return null;
    const validEnd = !startDate || !endDate || endDate >= startDate;
    const isCurrentYear = startDate && Number(startDate.slice(0, 4)) === new Date().getFullYear() && startDate <= U.today();
    const sameDayCompletion = startDate && endDate && validEnd && startDate === endDate;
    const range = startDate && endDate && validEnd
      ? `${timelineDateParts(startDate).text}開始 → ${timelineDateParts(endDate).text}完了`
      : startDate && endDate ? `${timelineDateParts(startDate).text}開始 → 終了日を確認`
      : startDate ? `${timelineDateParts(startDate).text}開始 → ${isCurrentYear ? "継続中" : "終了日未記録"}` : `${timelineDateParts(endDate).text}完了`;
    const days = validEnd ? timelineDays(startDate, endDate) : "";
    const legacyIds = period.sourceWorkIds || [];
    const endOnly = !startDate && Boolean(endDate);
    const periodLineEndDate = sameDayCompletion ? "" : startDate && endDate && validEnd
      ? endDate
      : startDate && isCurrentYear ? U.today() : "";
    return {
      id: period.directId || legacyIds[0] || period.periodId || "",
      editId: period.directId || period.legacyKey || legacyIds[0] || period.periodId || "",
      // Legacy water periods always return to the water review. Even a period
      // made from a single original work must not bypass its dedicated warning
      // and accidentally be treated like an ordinary farm-work deletion.
      editKind: period.directId ? (period.kind === "dry" ? "dry" : "irrigation") : "waterReview",
      date,
      label: endOnly ? `${String(period.label || "水管理")} 終了記録` : sameDayCompletion ? `${String(period.label || "水管理")} 当日完了` : String(period.label || "水管理"),
      category: "水管理",
      tone: "water",
      lane: "water",
      detail: endOnly ? `${timelineDateParts(endDate).text}終了 / 開始日未記録` : sameDayCompletion ? `${timelineDateParts(startDate).text} 当日完了` : range,
      days: "",
      periodDays: days,
      periodRole: endOnly ? "orphan-end" : "start",
      periodStartDate: startDate,
      periodEndDate: validEnd ? endDate : "",
      periodLineEndDate
    };
  }

  function waterRoleRank(entry) {
    return ({ end: 0, "end-marker": 0, "orphan-end": 1, start: 2, current: 3 })[entry.periodRole] ?? 4;
  }

  function isObservedHeading(row) {
    return Boolean(row && row.headingObserved);
  }

  function observedGrowthFact(row, fallbackHeading) {
    const heading = Boolean(fallbackHeading || isObservedHeading(row));
    const panicleLengthMm = U.number(row && row.panicleLengthMm, 0);
    const manualStage = row && row.stageConfirmed && String(row.observedStage || "");
    if (!heading && panicleLengthMm <= 0 && !manualStage) return null;
    if (heading) {
      return {
        date: String(row && row.date || ""),
        kind: "heading",
        label: "出穂確認",
        detail: "出穂を確認（実測）",
        stageFact: "記録時の段階: 出穂期"
      };
    }
    if (manualStage && panicleLengthMm <= 0) {
      const stage = ((RiceOS.agro && RiceOS.agro.SEASON_STAGES) || [])
        .find((item) => String(item.key || "") === manualStage);
      const stageName = stage ? stage.label : String(manualStage);
      return {
        date: String(row && row.date || ""),
        kind: "manual-stage",
        label: "現場ステージ",
        detail: `現地判断: ${stageName}`,
        stageFact: "現地判断（実測ではありません）"
      };
    }
    return {
      date: String(row && row.date || ""),
      kind: "panicle",
      label: "幼穂確認",
      detail: `幼穂 ${panicleLengthMm}mm（実測）`,
      // 1〜2mm は幼穂形成期の実測目安として扱い、それ以外は
      // 観察値だけを残す。将来の生育を年表から推定しないための線引き。
      stageFact: panicleLengthMm <= 2 ? "記録時の段階: 幼穂形成期" : "記録時の観察: 幼穂長を実測"
    };
  }

  function renderExpandableFlowCard(field, entry) {
    const id = String(entry.editId || entry.id || "");
    const key = `${entry.editKind}:${id}`;
    const expanded = expandedFlowRecord === key;
    const target = annualRecordTarget(field, entry.editKind, id);
    const row = target && target.row || {};
    const facts = [];
    if (entry.days !== "" && entry.days != null) facts.push(`期間 ${entry.days}日間`);
    if (entry.editKind === "fieldWork") {
      if (row.machine) facts.push(`機械 ${row.machine}`);
      if (row.material) facts.push(`資材 ${row.material}`);
      if (row.worker) facts.push(`作業者 ${row.worker}`);
    } else if (entry.editKind === "growth") {
      if (U.number(row.panicleLengthMm, 0) > 0) facts.push(`幼穂 ${row.panicleLengthMm}mm`);
      else if (row.headingObserved) facts.push("出穂確認（現地観察）");
      else if (row.stageConfirmed && row.observedStage) facts.push("現場ステージを記録");
      if (row.leafColor && row.leafColor !== "-") facts.push(`葉色 ${row.leafColor}`);
    } else if (entry.tone === "water") {
      const start = row.startDate || row.date || "";
      const end = row.actualEndDate || "";
      if (start) facts.push(`開始 ${U.fd(start)}`);
      if (end) facts.push(`完了 ${U.fd(end)}`);
    }
    const memo = String(row.memo || row.observationSummary || "").trim();
    return `<article class="annual-year-flow-entry ${U.attr(entry.tone)}${entry.milestone ? " milestone" : ""}${expanded ? " expanded" : ""}"><div class="annual-year-flow-main"><button type="button" class="annual-year-flow-open" data-annual-record-open-kind="${U.attr(entry.editKind)}" data-annual-record-open-id="${U.attr(id)}" data-annual-record-open-label="${U.attr(entry.label)}"><span class="annual-year-flow-title"><em>${U.escapeHTML(entry.milestone ? "節目" : entry.category || "記録")}</em><b>${U.escapeHTML(entry.label)}</b><strong aria-hidden="true">›</strong></span><span class="annual-year-flow-detail">${U.escapeHTML(entry.detail)}</span>${entry.stageFact ? `<span class="annual-year-flow-stage-fact">${U.escapeHTML(entry.stageFact)}</span>` : ""}${entry.days !== "" && entry.days != null ? `<span class="annual-year-flow-days">${U.escapeHTML(String(entry.days))}日間</span>` : ""}</button><button type="button" class="annual-year-flow-menu" aria-label="${U.escapeHTML(entry.label)}の編集・削除" title="編集・削除" data-annual-flow-menu-kind="${U.attr(entry.editKind)}" data-annual-flow-menu-id="${U.attr(id)}" data-annual-flow-menu-label="${U.attr(entry.label)}">⋮</button></div><button type="button" class="annual-year-flow-summary-toggle" data-annual-flow-summary="${U.attr(key)}" aria-expanded="${expanded ? "true" : "false"}">${expanded ? "要約を閉じる" : "要約を表示"}</button>${expanded ? `<div class="annual-year-flow-summary"><div class="annual-year-flow-summary-metrics">${facts.slice(0, 4).map((fact) => `<span>${U.escapeHTML(fact)}</span>`).join("") || "<span>要約できる補足情報はありません</span>"}</div>${memo ? `<p>${U.escapeHTML(memo)}</p>` : ""}</div>` : ""}</article>`;
  }

  function fieldYearTimeline(field, year) {
    const sources = state.timelineEntriesForField
      ? state.timelineEntriesForField(field.fieldId, { year, includePlanned: false })
      : { works: [], headingWorks: [], growth: [], waterPeriods: [], others: [] };
    const { works, headingWorks, growth, waterPeriods, others } = sources;
    const entries = works.map(timelineWorkEntry);

    const waterEntries = waterPeriods
      .filter((period) => !/予定/.test(String(period.status || "")) && !/予定/.test(String(period.sourceStatus || "")))
      .map(timelineWaterEntry).filter(Boolean);
    waterEntries.forEach((entry) => {
      if (entry.periodStartDate && entry.periodEndDate && entry.periodEndDate > entry.periodStartDate) {
        entry.days = entry.periodDays;
      }
      if (entry.periodStartDate && !entry.periodEndDate && entry.periodLineEndDate && entry.periodLineEndDate > entry.periodStartDate) {
        entry.days = timelineDays(entry.periodStartDate, entry.periodLineEndDate);
      }
      entries.push(entry);
      // 期間の完了日は、カードではなく帯の終点として置く。開始カードに
      // 開始・完了・日数を集約することで、同じ水管理を二度読ませない。
      if (entry.periodStartDate && entry.periodEndDate && entry.periodEndDate > entry.periodStartDate) {
        entries.push({
          ...entry,
          id: `${entry.editId}:end-marker`,
          date: entry.periodEndDate,
          label: `${entry.label} 完了`,
          detail: `${timelineDateParts(entry.periodEndDate).text}完了 / 実績${entry.periodDays}日`,
          days: "",
          periodRole: "end-marker",
          isWaterMarker: true
        });
      }
      if (entry.periodStartDate && !entry.periodEndDate && entry.periodLineEndDate && entry.periodLineEndDate > entry.periodStartDate) {
        const elapsed = timelineDays(entry.periodStartDate, entry.periodLineEndDate);
        entries.push({
          ...entry,
          id: `${entry.editId}:current-marker`,
          date: entry.periodLineEndDate,
          label: `${entry.label} 継続中`,
          detail: `${timelineDateParts(entry.periodLineEndDate).text}時点 / 継続${elapsed}日`,
          days: "",
          periodRole: "current",
          isWaterMarker: true
        });
      }
    });
    const growthFacts = growth
      .map((row) => ({ row, fact: observedGrowthFact(row) }))
      .filter((item) => item.fact);
    growthFacts.forEach(({ row, fact }) => entries.push({
      id: row.logId,
      editKind: "growth",
      date: fact.date,
      label: fact.label,
      category: fact.kind === "manual-stage" ? "現場判定" : "生育実測",
      tone: "growth",
      lane: "growth",
      detail: fact.detail,
      stageFact: fact.stageFact,
      milestone: fact.kind
    }));
    others.forEach((row) => entries.push({
      id: row.otherWorkId,
      editKind: "other",
      date: String(row.date || ""),
      label: String(row.workName || "その他の記録"),
      category: "その他",
      tone: "other",
      lane: "work",
      detail: row.quantity ? `数量 ${row.quantity}` : "その他の記録"
    }));

    return entries
      .filter((entry) => isTimelineDate(entry.date) && entry.id)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.lane === "water" && b.lane === "water" ? waterRoleRank(a) - waterRoleRank(b) : 0) || String(a.category).localeCompare(String(b.category)) || String(a.label).localeCompare(String(b.label)));
  }

  function renderYearFlow(field) {
    const year = reviewYearValue();
    const entries = fieldYearTimeline(field, year);
    const planting = entries.find((entry) => /田植/.test(entry.label))?.date || "";
    const harvest = entries.find((entry) => entry.category === "収穫")?.date || "";
    const seasonLength = timelineDays(planting, harvest);
    const seasonText = planting
      ? `${timelineDateParts(planting, true).text} → ${harvest ? `${timelineDateParts(harvest, true).text}${seasonLength !== "" ? ` / ${seasonLength}日` : ""}` : "収穫記録待ち"}`
      : "田植え記録待ち";
    const timelineEntries = entries.filter((entry) => !entry.isWaterMarker);
    const flowCard = (entry) => `<div class="annual-year-flow-entry ${U.attr(entry.tone)}${entry.milestone ? " milestone" : ""}"><button type="button" class="annual-year-flow-open" data-annual-record-open-kind="${U.attr(entry.editKind)}" data-annual-record-open-id="${U.attr(entry.editId || entry.id)}" data-annual-record-open-label="${U.attr(entry.label)}"><span class="annual-year-flow-title"><em>${U.escapeHTML(entry.milestone ? "実測" : entry.category || "記録")}</em><b>${U.escapeHTML(entry.label)}</b><strong aria-hidden="true">〉</strong></span><span class="annual-year-flow-detail">${U.escapeHTML(entry.detail)}</span>${entry.stageFact ? `<span class="annual-year-flow-stage-fact">${U.escapeHTML(entry.stageFact)}</span>` : ""}${entry.days !== "" && entry.days != null ? `<span class="annual-year-flow-days">${U.escapeHTML(String(entry.days))}日間</span>` : ""}</button><button type="button" class="annual-year-flow-menu" aria-label="${U.escapeHTML(entry.label)}の操作" title="編集・削除" data-annual-flow-menu-kind="${U.attr(entry.editKind)}" data-annual-flow-menu-id="${U.attr(entry.editId || entry.id)}" data-annual-flow-menu-label="${U.attr(entry.label)}">⋮</button></div>`;
    const items = timelineEntries.map((entry, index) => {
      const date = timelineDateParts(entry.date);
      const isRepeatedDate = index > 0 && timelineEntries[index - 1].date === entry.date;
      const tone = entry.tone === "water" ? "water" : entry.tone === "growth" ? "growth" : entry.tone === "harvest" ? "harvest" : entry.tone === "other" ? "other" : "work";
      return `<li class="annual-year-flow-single-row ${U.attr(tone)}${isRepeatedDate ? " repeat" : ""}"><time datetime="${U.attr(entry.date)}"${isRepeatedDate ? ' class="annual-year-flow-repeat" aria-hidden="true"' : ""}><span>${U.escapeHTML(date.day)}</span><small>${U.escapeHTML(date.weekday)}</small></time><span class="annual-year-flow-rail" aria-hidden="true"><i></i></span>${renderExpandableFlowCard(field, entry)}</li>`;
    }).join("");
    return `
      <section class="annual-year-flow" aria-label="${U.escapeHTML(year)}年の一年の流れ">
        <div class="annual-year-flow-head"><div><span>${U.escapeHTML(year)}年の記録</span><h3>一年の流れ</h3></div><small>実績のみ</small></div>
        <p class="annual-year-flow-season">${U.escapeHTML(seasonText)}</p>
        ${items ? `<ol class="annual-year-flow-single">${items}</ol>` : '<p class="annual-year-flow-empty">田植え・水管理・出穂・収穫などの実績を残すと、ここに一年の流れが並びます。</p>'}
      </section>
    `;
  }

  function renderEndSeasonReflection(field, snapshot) {
    const latestNote = seasonNotesForReview(field.fieldId)[0] || null;
    const carryover = String(field.nextSeasonMemo || "").trim();
    const noteStatus = latestNote
      ? `今年の気づき ${latestNote.date ? U.fd(latestNote.date) : "記録あり"}`
      : carryover ? "来年に引き継ぐメモあり" : "今年の気づき・来年メモは未記録";
    if (!snapshot.harvest) {
      return `<div class="annual-compare-check"><b>収穫後にここで振り返る</b><span>収穫日が記録されると、この年の実績と引き継ぎメモをまとめて確認できます。</span></div>`;
    }
    const facts = [
      `収穫 ${snapshot.harvest}`,
      snapshot.yield ? `収量 ${snapshot.yield}` : "収量 未記録",
      snapshot.quality ? `品質 ${snapshot.quality}` : "品質 未記録",
      snapshot.panicle ? `幼穂確認 ${snapshot.panicle}` : "幼穂確認 未記録",
      snapshot.heading ? `出穂日 ${U.fd(snapshot.heading)}` : "出穂日 未記録",
      snapshot.workHours ? `作業時間 ${U.formatHours(snapshot.workHours)}` : "作業時間 未記録",
      noteStatus
    ];
    return `<div class="annual-compare-check complete"><b>収穫後の振り返り</b><span>${U.escapeHTML(facts.join(" / "))}</span><button type="button" class="secondary" data-annual-reflection-focus>気づき・来年メモへ</button></div>`;
  }

  function compareRecordCard(entry, year, field) {
    if (!entry) return `<div class="annual-compare-record empty"><span>${U.escapeHTML(year)}年</span><b>記録なし</b><small>今年残すと、来年ここで比べられます</small></div>`;
    const date = timelineDateParts(entry.date);
    const days = entry.days !== "" && entry.days != null ? `${entry.days}日間` : "";
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId, year) : "";
    const dap = planting && entry.date ? timelineDays(planting, entry.date) : "";
    const endDap = planting && entry.periodEndDate ? timelineDays(planting, entry.periodEndDate) : "";
    const timing = entry.tone === "water" && endDap !== ""
      ? `${year}年 / ${date.text}${dap !== "" ? ` / 開始: 田植後${dap}日` : ""} / 完了: 田植後${endDap}日`
      : `${year}年 / ${date.text}${dap !== "" ? ` / 田植後${dap}日` : ""}`;
    return `<button type="button" class="annual-compare-record ${U.attr(entry.tone || "work")}" data-annual-record-open-kind="${U.attr(entry.editKind)}" data-annual-record-open-id="${U.attr(entry.editId || entry.id)}" data-annual-record-open-label="${U.attr(entry.label)}"><span>${U.escapeHTML(timing)}</span><b>${U.escapeHTML(entry.label)}</b><small>${U.escapeHTML(entry.detail || "記録あり")}${days ? ` / ${U.escapeHTML(days)}` : ""}</small><strong aria-hidden="true">〉</strong></button>`;
  }

  function milestoneEntry(entries, pattern) {
    return entries.find((entry) => !entry.isWaterMarker && pattern.test(`${entry.category || ""} ${entry.label || ""}`)) || null;
  }

  function compareEntriesForFilter(field, year, filter) {
    const entries = fieldYearTimeline(field, year)
      .filter((entry) => !entry.isWaterMarker)
      .filter((entry) => String(year) !== String(new Date().getFullYear()) || entry.date <= U.today());
    if (filter === "work") return entries.filter((entry) => entry.lane === "work" && entry.tone !== "harvest" && !/田植/.test(String(entry.label || "")));
    if (filter === "water") return entries.filter((entry) => entry.tone === "water");
    if (filter === "growth") return entries.filter((entry) => entry.tone === "growth");
    if (filter === "harvest") return entries.filter((entry) => entry.tone === "harvest");
    if (filter === "milestones") return entries.filter((entry) => /田植|中干し|幼穂|出穂|収穫|稲刈/.test(`${entry.category || ""} ${entry.label || ""}`));
    return entries;
  }

  function renderReviewOverview(field) {
    const year = reviewYearValue();
    const previousYear = String(Number(year) - 1);
    const snapshot = fieldYearSnapshot(field, year);
    return `
      <section class="annual-compare-launch"><div><span>振り返り</span><h3>今年と前年を比べる</h3><p>${U.escapeHTML(year)}年と${U.escapeHTML(previousYear)}年の節目・作業・水管理を、見やすく読み比べます。</p></div><button type="button" class="primary" data-annual-open-compare>比較を開く</button></section>
      ${renderYearFlow(field)}
      ${renderEndSeasonReflection(field, snapshot)}
      ${renderSeasonNotes(field)}
      <label class="annual-carryover-note"><span>来年に引き継ぐメモ</span><textarea data-annual-field-edit="nextSeasonMemo" placeholder="例: この圃場は中干しを早めに始める。穂肥量は葉色を見て控えめに。">${U.escapeHTML(field.nextSeasonMemo || "")}</textarea><small>圃場マスターに保存され、年度をまたいで確認できます。</small></label>
    `;
  }

  function renderComparisonExperience(field) {
    const currentYear = reviewYearValue();
    const previousYear = String(Number(currentYear) - 1);
    const current = fieldYearSnapshot(field, currentYear);
    const previous = fieldYearSnapshot(field, previousYear);
    const currentEntries = compareEntriesForFilter(field, currentYear, "all");
    const previousEntries = compareEntriesForFilter(field, previousYear, "all");
    const currentPlanting = milestoneEntry(currentEntries, /田植/);
    const previousPlanting = milestoneEntry(previousEntries, /田植/);
    const currentHeading = milestoneEntry(currentEntries, /出穂/);
    const previousHeading = milestoneEntry(previousEntries, /出穂/);
    const milestones = [["田植え", /田植/], ["中干し", /中干し/], ["幼穂確認", /幼穂/], ["出穂", /出穂/], ["収穫", /収穫|稲刈/]];
    const filters = [["milestones", "季節の節目"], ["all", "すべて"], ["work", "その他の作業"], ["water", "水管理"], ["growth", "生育"], ["harvest", "収穫"]];
    const history = (entries, year) => entries.length ? entries.map((entry) => compareRecordCard(entry, year, field)).join("") : `<div class="annual-compare-record empty"><span>${U.escapeHTML(year)}年</span><b>該当する記録なし</b><small>条件を変えるか、次の作業で残しましょう</small></div>`;
    return `
      <section class="annual-compare-experience" aria-label="${U.escapeHTML(field.name)}の今年と前年の比較">
        <div class="annual-compare-experience-head"><button type="button" class="annual-compare-back" data-annual-close-compare aria-label="比較を閉じる">‹</button><div><span>今年と前年を比べる</span><h3>${U.escapeHTML(field.name)}</h3><p>${U.escapeHTML(currentYear)}年と${U.escapeHTML(previousYear)}年 / ${U.escapeHTML(varietyName(field))}</p></div></div>
        <div class="annual-compare-season-status"><article class="current"><span>${U.escapeHTML(currentYear)}年</span><b>${U.escapeHTML(currentPlanting ? `田植え ${U.fd(currentPlanting.date)}` : "田植え未記録")}</b><small>${U.escapeHTML(currentHeading ? `出穂 ${U.fd(currentHeading.date)}` : "出穂記録待ち")}</small></article><i aria-hidden="true">⇄</i><article><span>${U.escapeHTML(previousYear)}年</span><b>${U.escapeHTML(previousPlanting ? `田植え ${U.fd(previousPlanting.date)}` : "田植え未記録")}</b><small>${U.escapeHTML(previousHeading ? `出穂 ${U.fd(previousHeading.date)}` : "出穂記録なし")}</small></article></div>
        <section class="annual-compare-milestones"><div class="annual-compare-section-head"><div><span>季節の節目</span><h4>今年と前年の歩み</h4></div><small>実績のみ</small></div>${milestones.map(([label, pattern]) => `<article><span>${U.escapeHTML(label)}</span><div>${compareRecordCard(milestoneEntry(currentEntries, pattern), currentYear, field)}${compareRecordCard(milestoneEntry(previousEntries, pattern), previousYear, field)}</div></article>`).join("")}</section>
        <section class="annual-compare-history"><div class="annual-compare-section-head"><div><span>比べたい履歴</span><h4>記録を読み比べる</h4></div><small>${U.escapeHTML(currentYear)}年 ⇄ ${U.escapeHTML(previousYear)}年</small></div><div class="annual-compare-filter-row">${filters.map(([id, label]) => `<button type="button" class="${compareFilter === id ? "active" : ""}" data-annual-compare-filter="${U.attr(id)}">${U.escapeHTML(label)}</button>`).join("")}</div><div class="annual-compare-history-grid"><div><b>${U.escapeHTML(currentYear)}年</b>${history(compareEntriesForFilter(field, currentYear, compareFilter), currentYear)}</div><div><b>${U.escapeHTML(previousYear)}年</b>${history(compareEntriesForFilter(field, previousYear, compareFilter), previousYear)}</div></div></section>
        ${renderAnnualPhotoComparison(field)}
        <section class="annual-compare-memos"><div><span>今年のひとこと</span><b>${U.escapeHTML(current.memo || "まだ記録がありません")}</b></div><div><span>前年の記憶</span><b>${U.escapeHTML(previous.memo || "前年のメモはありません")}</b></div></section>
      </section>
    `;
  }

  function renderYearCompare(field) {
    if (reviewView === "compare") return renderComparisonExperience(field);
    return renderReviewOverview(field);
  }

  // Kept temporarily as an internal reference while the comparison surface
  // settles; the active UI is rendered by renderComparisonExperience above.
  function renderLegacyCompareData(field, statusOverview) {
    const currentYear = yearValue() === "all" ? String(new Date().getFullYear()) : String(yearValue());
    const previousYear = String(Number(currentYear) - 1);
    const current = fieldYearSnapshot(field, currentYear);
    const previous = fieldYearSnapshot(field, previousYear);
    const rows = [
      ["田植え日", snapshotText(current.planting), snapshotText(previous.planting)],
      ["苗箱数", snapshotText(current.trays, "箱"), snapshotText(previous.trays, "箱")],
      ["中干し", snapshotText(current.dry), snapshotText(previous.dry)],
      ["間断灌水", snapshotText(current.intermittent), snapshotText(previous.intermittent)],
      ["深水管理", snapshotText(current.deepWater), snapshotText(previous.deepWater)],
      ["幼穂確認", snapshotText(current.panicle), snapshotText(previous.panicle)],
      ["出穂日", snapshotText(current.heading), snapshotText(previous.heading)],
      ["作業時間（圃場配賦）", current.workHours ? U.formatHours(current.workHours) : "未記録", previous.workHours ? U.formatHours(previous.workHours) : "未記録"],
      ["資材使用", snapshotText(current.materials), snapshotText(previous.materials)],
      ["収穫日", snapshotText(current.harvest), snapshotText(previous.harvest)],
      ["収穫量", snapshotText(current.yield), snapshotText(previous.yield)],
      ["10a当たり収量", snapshotText(current.yieldPer10a), snapshotText(previous.yieldPer10a)],
      ["品質", snapshotText(current.quality), snapshotText(previous.quality)],
      ["写真", current.photos ? `${current.photos}枚` : "未記録", previous.photos ? `${previous.photos}枚` : "未記録"]
    ];
    const keyLabels = new Set(["田植え日", "中干し", "幼穂確認", "出穂日", "収穫量"]);
    const keyRows = rows.filter((row) => keyLabels.has(row[0]));
    const detailRows = rows.filter((row) => !keyLabels.has(row[0]));
    const missing = rows.filter((row) => row[1] === "未記録").map((row) => row[0]);
    return `
      <section class="annual-compare-card">
        <div class="annual-compare-head"><div><span>来年につなぐ比較</span><h3>${U.escapeHTML(currentYear)}年と${U.escapeHTML(previousYear)}年</h3></div><small>${U.escapeHTML(field.name)} / ${U.escapeHTML(varietyName(field))}</small></div>
        <div class="annual-compare-table"><div class="annual-compare-row annual-compare-label"><b>比較項目</b><b>${U.escapeHTML(currentYear)}年</b><b>${U.escapeHTML(previousYear)}年</b></div>${keyRows.map((row) => `<div class="annual-compare-row"><span>${U.escapeHTML(row[0])}</span><b class="${row[1] === "未記録" ? "missing" : ""}">${U.escapeHTML(row[1])}</b><b class="${row[2] === "未記録" ? "missing" : ""}">${U.escapeHTML(row[2])}</b></div>`).join("")}</div>
        <details class="annual-compare-details"><summary>すべての比較項目を見る (${detailRows.length})</summary><div class="annual-compare-table">${detailRows.map((row) => `<div class="annual-compare-row"><span>${U.escapeHTML(row[0])}</span><b class="${row[1] === "未記録" ? "missing" : ""}">${U.escapeHTML(row[1])}</b><b class="${row[2] === "未記録" ? "missing" : ""}">${U.escapeHTML(row[2])}</b></div>`).join("")}</div></details>
        ${renderYearFlow(field)}
        ${renderEndSeasonReflection(field, current)}
        ${missing.length ? `<div class="annual-compare-check"><b>翌年比較のため、今年はここを残す</b><span>${U.escapeHTML(missing.join(" / "))}</span></div>` : '<div class="annual-compare-check complete"><b>比較に必要な基本記録がそろっています</b><span>来年の判断材料として使えます</span></div>'}
        ${renderSeasonNotes(field)}
        <label class="annual-carryover-note"><span>来年に引き継ぐメモ</span><textarea data-annual-field-edit="nextSeasonMemo" placeholder="例: この圃場は中干しを早めに始める。穂肥量は葉色を見て控えめに。">${U.escapeHTML(field.nextSeasonMemo || "")}</textarea><small>圃場マスターに保存され、年度をまたいで確認できます。</small></label>
      </section>
    `;
  }

  function renderAnnualFieldSwitcher(field) {
    const fieldOptions = state.activeFields()
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"))
      .map((item) => `<option value="${U.attr(item.fieldId)}" ${item.fieldId === field.fieldId ? "selected" : ""}>${U.escapeHTML(item.name)}${item.areaA ? ` / ${U.escapeHTML(String(item.areaA))}a` : ""}</option>`)
      .join("");
    return `<label class="annual-field-switcher"><span>圃場を切替</span><select data-annual-field-switch aria-label="振り返る圃場を選択">${fieldOptions}</select></label>`;
  }

  function renderFieldDetail(field) {
    const detailYear = reviewYearValue();
    const planting = state.plantingDateForField
      ? state.plantingDateForField(field.fieldId, detailYear)
      : firstDate(fieldYearRows(field.fieldId, detailYear), (row) => row.kind === "fieldWork" && /^田植え$/.test(String(row.title || "")));
    const asOfDate = stageAsOfDateForField(field.fieldId);
    const dap = planting ? U.daysBetween(planting, asOfDate) : "";
    return `
      <div class="annual-field-detail">
        <div class="annual-detail-head">
          <div>
            <span>圃場履歴</span>
            <h2>${U.escapeHTML(field.name)}</h2>
            <p>${U.escapeHTML(varietyName(field))} / ${U.escapeHTML(field.areaA ? `${field.areaA}a` : "面積未設定")}${planting ? ` / 田植後${U.escapeHTML(String(dap))}日` : ""}</p>
          </div>
          <button type="button" class="annual-detail-menu" aria-label="メニュー">…</button>
        </div>
        ${renderYearCompare(field)}
        ${renderTabs(field)}
        ${renderAnnualFab(field.fieldId)}
      </div>
    `;
  }

  function annualRecordTarget(field, kind, id) {
    const data = state.data();
    const matchesField = (row, key) => Array.isArray(row && row[key]) && row[key].includes(field.fieldId);
    const same = (value) => String(value || "") === String(id || "");
    if (kind === "fieldWork") {
      const row = (data.fieldWorks || []).find((item) => same(item.workId) && matchesField(item, "fieldIds"));
      return row ? { kind, row } : null;
    }
    if (kind === "growth") {
      const row = (data.growthLogs || []).find((item) => same(item.logId) && String(item.fieldId || "") === String(field.fieldId));
      return row ? { kind, row } : null;
    }
    if (kind === "other") {
      const row = (data.otherWorks || []).find((item) => same(item.otherWorkId) && (matchesField(item, "relatedFieldIds") || matchesField(item, "fieldIds")));
      return row ? { kind, row } : null;
    }
    if (kind === "dry" || kind === "irrigation") {
      const row = waterRecord(kind, id);
      return row && String(row.fieldId || "") === String(field.fieldId) ? { kind, row } : null;
    }
    if (kind === "waterReview") {
      const row = legacyWaterReviewRowsForField(field).find((item) => same(item.legacyKey) || (item.sourceWorkIds || []).some((workId) => same(workId)));
      return row ? { kind, row } : null;
    }
    return null;
  }

  function annualRecordDate(value) {
    return isTimelineDate(value) ? U.fd(value) : "未記録";
  }

  function annualRecordPhotos(row) {
    const photos = Array.isArray(row && row.photoData) ? row.photoData : Array.isArray(row && row.photos) ? row.photos : [];
    const storedPhoto = row && typeof row.photoData === "string" ? [row.photoData] : [];
    const single = row && typeof row.photo === "string" ? [row.photo] : [];
    return [...photos, ...storedPhoto, ...single].filter((value) => typeof value === "string" && value.startsWith("data:image/")).slice(0, 6);
  }

  function annualRecordInfoRow(label, value) {
    if (value === undefined || value === null || value === "") return "";
    return `<div class="annual-record-detail-row"><span>${U.escapeHTML(label)}</span><b>${U.escapeHTML(String(value))}</b></div>`;
  }

  function renderAnnualRecordDetail(field, detail) {
    const target = annualRecordTarget(field, detail.kind, detail.id);
    if (!target) {
      return `<section class="annual-record-detail"><button type="button" class="annual-record-detail-back" data-annual-record-detail-back aria-label="一年の流れへ戻る">‹</button><div class="annual-record-detail-head"><span>実績詳細</span><h2>記録を見つけられませんでした</h2><p>削除済み、またはこの圃場に紐づいていない記録です。</p></div></section>`;
    }
    const { kind, row } = target;
    const isLegacyWater = kind === "waterReview";
    const isWater = kind === "dry" || kind === "irrigation" || isLegacyWater;
    const category = isLegacyWater ? "旧作業由来" : isWater ? "水管理" : kind === "growth" ? "生育記録" : kind === "other" ? "その他" : /収穫|稲刈り/.test(String(row.workName || "")) ? "収穫" : "農作業";
    const title = isLegacyWater ? row.label : kind === "growth" ? (isObservedHeading(row) ? "出穂確認" : U.number(row.panicleLengthMm, 0) > 0 ? "幼穂確認" : row.stageConfirmed && row.observedStage ? "現場ステージ" : "生育記録") : String(row.workName || row.method || "記録");
    const date = isWater ? String(row.startDate || row.date || row.actualEndDate || "") : String(row.date || "");
    const fieldNames = kind === "fieldWork" ? (row.fieldIds || []).map((fieldId) => state.field(fieldId)?.name).filter(Boolean).join("・") : kind === "other" ? (row.relatedFieldIds || row.fieldIds || []).map((fieldId) => state.field(fieldId)?.name).filter(Boolean).join("・") : field.name;
    const info = [];
    if (isWater) {
      info.push(annualRecordInfoRow("開始日", annualRecordDate(row.startDate || row.date)));
      info.push(annualRecordInfoRow("終了日", annualRecordDate(row.actualEndDate)));
      if (!isLegacyWater && isTimelineDate(row.startDate || row.date) && isTimelineDate(row.actualEndDate) && String(row.actualEndDate) >= String(row.startDate || row.date)) info.push(annualRecordInfoRow("実績日数", `${timelineDays(row.startDate || row.date, row.actualEndDate)}日間`));
      if (isLegacyWater) info.push(annualRecordInfoRow("元の記録", `旧作業記録 ${(row.sourceWorkIds || []).length}件`));
    } else if (kind === "growth") {
      info.push(annualRecordInfoRow("記録日", annualRecordDate(date)));
      info.push(annualRecordInfoRow("葉数", row.leafCount ? `${row.leafCount}枚` : ""));
      info.push(annualRecordInfoRow("分げつ数", row.tillerCount ? `${row.tillerCount}本` : ""));
      info.push(annualRecordInfoRow("草丈", row.plantHeightCm || row.heightCm ? `${row.plantHeightCm || row.heightCm}cm` : ""));
      info.push(annualRecordInfoRow("葉色", row.leafColor ? `葉色 ${row.leafColor}` : ""));
      info.push(annualRecordInfoRow("幼穂長", U.number(row.panicleLengthMm, 0) > 0 ? `${row.panicleLengthMm}mm` : ""));
      info.push(annualRecordInfoRow("出穂", isObservedHeading(row) ? "確認済み" : ""));
    } else {
      info.push(annualRecordInfoRow("実施日", annualRecordDate(date)));
      info.push(annualRecordInfoRow("作業者", row.worker));
      info.push(annualRecordInfoRow("作業時間", row.hours || row.totalHours ? U.formatHours(row.hours || row.totalHours) : ""));
      info.push(annualRecordInfoRow("機械", row.machine));
      info.push(annualRecordInfoRow("資材", row.material));
      info.push(annualRecordInfoRow("使用量", row.amount || row.quantity));
    }
    const memo = String(row.memo || row.note || "").trim();
    const photos = annualRecordPhotos(row);
    return `
      <section class="annual-record-detail" aria-label="${U.attr(title)}の実績詳細">
        <button type="button" class="annual-record-detail-back" data-annual-record-detail-back aria-label="一年の流れへ戻る">‹</button>
        <header class="annual-record-detail-head"><span>${U.escapeHTML(category)}</span><h2>${U.escapeHTML(title)}</h2><p>${U.escapeHTML(fieldNames || field.name)} / ${U.escapeHTML(annualRecordDate(date))}</p></header>
        <section class="annual-record-detail-summary ${U.attr(isWater ? "water" : kind === "growth" ? "growth" : category === "収穫" ? "harvest" : "work")}" ><b>${U.escapeHTML(title)}</b><span>${U.escapeHTML(isLegacyWater ? "旧作業記録からの照合候補。水管理としては未確定です" : `${category}として登録された実績です`)}</span></section>
        <section class="annual-record-detail-section"><h3>記録内容</h3><div class="annual-record-detail-rows">${info.filter(Boolean).join("") || '<p class="annual-record-detail-empty">記録内容はありません。</p>'}</div></section>
        ${memo ? `<section class="annual-record-detail-section"><h3>メモ</h3><p class="annual-record-detail-memo">${U.escapeHTML(memo)}</p></section>` : ""}
        ${photos.length ? `<section class="annual-record-detail-section"><h3>写真</h3><div class="annual-record-detail-photos">${photos.map((photo) => `<img src="${U.attr(photo)}" alt="${U.escapeHTML(title)}の記録写真">`).join("")}</div></section>` : ""}
        ${isLegacyWater ? '<p class="annual-record-detail-legacy">旧作業記録から確認できる水管理候補です。元作業の実績は変更していません。</p><button type="button" class="secondary annual-record-detail-water" data-annual-record-detail-open-water>水管理の記録を開く</button>' : ""}
      </section>
    `;
  }

  function openAnnualRecordDetail(kind, id, label) {
    const field = selectedFieldId && state.field(selectedFieldId);
    if (!field || !annualRecordTarget(field, kind, id)) return false;
    recordDetail = { kind, id, label: label || "記録" };
    expandedFlowRecord = "";
    timelineActionRecord = null;
    waterEditDraft = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
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
    U.$("annualTimeline").innerHTML = field ? `${renderAnnualFieldSwitcher(field)}${recordDetail ? renderAnnualRecordDetail(field, recordDetail) : renderFieldDetail(field)}${renderTimelineActionSheet()}` : renderTop(rows);
    renderSortOptions();
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
  }

  function editRow(kind, id) {
    if (RiceOS.navigation && RiceOS.navigation.openRecord) {
      const opened = RiceOS.navigation.openRecord(kind, id, {
        fieldId: selectedFieldId,
        originScreen: "annual",
        tab: selectedTab,
        returnToAnnualFieldId: selectedFieldId,
        returnToAnnualTab: selectedTab
      });
      if (opened) return;
    }
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
    if (kind === "other" && RiceOS.screens.otherWork && RiceOS.screens.otherWork.editWork) {
      RiceOS.app.show("other-work");
      RiceOS.screens.otherWork.editWork(id);
      return;
    }
    if (kind === "dry" || kind === "irrigation") {
      openWaterEditor(kind, id);
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

  function openWaterEditor(kind, id) {
    const record = waterRecord(kind, id);
    if (!record) return false;
    selectedFieldId = record.fieldId;
    selectedTab = "water";
    waterEditDraft = { kind, id };
    render();
    setTimeout(() => U.$("annualTimeline").querySelector("[data-annual-water-editor]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    return true;
  }

  function deleteWaterPeriod(kind, id) {
    if (!id) return false;
    const legacy = kind === "fieldWork";
    const legacyPeriod = legacy && selectedFieldId ? waterPeriodsForField(state.field(selectedFieldId)).find((row) => row.editId === id && row.editKind === "fieldWork") : null;
    const legacyIds = legacyPeriod && legacyPeriod.sourceWorkIds.length ? legacyPeriod.sourceWorkIds : [id];
    const legacyWorks = legacy ? state.data().fieldWorks.filter((row) => legacyIds.includes(row.workId)) : [];
    const targetCount = legacyWorks.reduce((count, row) => Math.max(count, (row.fieldIds || []).length), 0);
    const directRecord = legacy ? null : waterRecord(kind, id);
    const directLabel = directRecord && (kind === "dry" ? "中干し" : directRecord.method || "水管理") || "水管理";
    const directStart = directRecord && (directRecord.startDate || directRecord.date) || "";
    const directEnd = directRecord && directRecord.actualEndDate || "";
    const message = legacy
      ? `この旧作業記録由来の水管理を削除しますか？\n\n開始・終了を含む${legacyIds.length}件の元作業記録も削除されます。${targetCount > 1 ? `対象の${targetCount}圃場にも反映されます。` : ""}`
      : `${directLabel}の記録を削除しますか？\n${directStart ? `開始: ${U.fd(directStart)}` : "開始日未登録"}${directEnd ? ` / 終了: ${U.fd(directEnd)}` : " / 継続中"}`;
    if (!confirm(message)) return false;
    const saved = legacy
      ? (state.deleteFieldWorks ? state.deleteFieldWorks(legacyIds, "旧作業由来の水管理を削除しました") : legacyIds.map((workId) => state.deleteFieldWork(workId)).every(Boolean))
      : (kind === "dry" ? state.deleteDryPeriod(id) : state.deleteIrrigation(id));
    if (!saved) return false;
    waterEditDraft = null;
    render();
    return true;
  }

  function closeFieldDetail() {
    if (!selectedFieldId) return false;
    selectedFieldId = "";
    selectedTab = "karte";
    seasonNoteDraft = null;
    waterEditDraft = null;
    reviewView = "overview";
    compareFilter = "work";
    timelineActionRecord = null;
    recordDetail = null;
    expandedFlowRecord = "";
    render();
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
    return true;
  }

  function canHandleBack() {
    return Boolean(recordDetail || expandedFlowRecord || selectedFieldId || reviewView === "compare");
  }

  function handleBack() {
    if (recordDetail) {
      recordDetail = null;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    if (expandedFlowRecord) {
      expandedFlowRecord = "";
      render();
      return true;
    }
    if (reviewView === "compare") {
      reviewView = "overview";
      compareFilter = "work";
      render();
      return true;
    }
    return closeFieldDetail();
  }

  function deleteRow(kind, id) {
    const work = kind === "fieldWork" ? state.data().fieldWorks.find((item) => item.workId === id) : null;
    const growth = kind === "growth" ? state.data().growthLogs.find((item) => item.logId === id) : null;
    const other = kind === "other" ? state.data().otherWorks.find((item) => item.otherWorkId === id) : null;
    const schedule = kind === "schedule" ? (state.data().schedules || []).find((item) => item.scheduleId === id) : null;
    const fieldNames = work ? (work.fieldIds || []).map((fieldId) => state.field(fieldId)?.name).filter(Boolean).join("・") : "";
    const fieldCount = work ? (work.fieldIds || []).length : 0;
    const message = work
      ? `${U.fd(work.date)} ${work.workName}を削除しますか？${fieldNames ? `\n対象: ${fieldNames}` : ""}${fieldCount > 1 ? `（${fieldCount}圃場すべての履歴から削除されます）` : ""}`
      : growth
        ? `${U.fd(growth.date)} 生育記録を削除しますか？\n圃場: ${state.field(growth.fieldId)?.name || "未設定"}`
        : other
          ? `${U.fd(other.date)} ${other.workName}を削除しますか？\n圃場: ${(other.relatedFieldIds || []).map((fieldId) => state.field(fieldId)?.name).filter(Boolean).join("・") || "未設定"}`
          : schedule
            ? `${U.fd(schedule.date)} ${schedule.title || schedule.scheduleType || "予定"}を削除しますか？\n圃場: ${(schedule.fieldIds || []).map((fieldId) => state.field(fieldId)?.name).filter(Boolean).join("・") || "未設定"}`
            : "この記録を削除しますか？";
    const ok = confirm(message);
    if (!ok) return false;
    const deleted = kind === "fieldWork" ? state.deleteFieldWork(id)
      : kind === "growth" ? state.deleteGrowthLog(id)
        : kind === "dry" ? state.deleteDryPeriod(id)
          : kind === "irrigation" ? state.deleteIrrigation(id)
            : kind === "schedule" ? state.deleteSchedule(id)
              : kind === "other" ? state.deleteOtherWork(id) : false;
    if (deleted) render();
    return Boolean(deleted);
  }

  function renderTimelineActionSheet() {
    if (!timelineActionRecord) return "";
    const record = timelineActionRecord;
    const isLegacyWater = record.kind === "waterReview";
    return `
      <div class="annual-record-action-backdrop" data-annual-record-action="cancel">
        <section class="annual-record-action-sheet" role="dialog" aria-modal="true" aria-label="${U.attr(record.label)}の操作">
          <p>記録の操作</p>
          <b>${U.escapeHTML(record.label)}</b>
          ${isLegacyWater
            ? '<button type="button" class="primary" data-annual-record-action="open-water">水管理の記録を開く</button>'
            : '<button type="button" class="primary" data-annual-record-action="edit">編集する</button><button type="button" class="danger" data-annual-record-action="delete">削除する</button>'}
          <button type="button" class="secondary" data-annual-record-action="cancel">キャンセル</button>
        </section>
      </div>`;
  }

  function openTimelineAction(record) {
    timelineActionRecord = record;
    suppressTimelineOpenUntil = Date.now() + 800;
    render();
  }

  function closeTimelineAction() {
    timelineActionRecord = null;
    render();
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

  function openStatusInput(action, fieldId) {
    if (!fieldId || !state.field(fieldId) || !RiceOS.app || !RiceOS.app.openInput) return;
    if (action === "dry" && RiceOS.screens.dryPeriod) {
      RiceOS.app.openInput("dry-period", "annual");
      RiceOS.screens.dryPeriod.prefillDate(U.today(), fieldId);
      return;
    }
    if (action === "growth" && RiceOS.screens.growth) {
      RiceOS.app.openInput("growth", "annual");
      RiceOS.screens.growth.prefillDate(U.today(), fieldId);
      if (U.$("growthBasicSection")) U.$("growthBasicSection").open = true;
      U.$("growthForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "work" && RiceOS.screens.fieldWork) {
      RiceOS.app.openInput("field-work", "annual");
      RiceOS.screens.fieldWork.prefillDate(U.today(), fieldId);
    }
  }

  function openField(fieldId, tab) {
    selectedFieldId = fieldId || "";
    selectedTab = tab || "karte";
    waterEditDraft = null;
    reviewView = "overview";
    compareFilter = "work";
    timelineActionRecord = null;
    recordDetail = null;
    expandedFlowRecord = "";
    render();
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function switchFieldWithinAnnual(fieldId) {
    if (!fieldId || fieldId === selectedFieldId || !state.field(fieldId)) return false;
    // The selector is a review filter, not a new navigation destination.
    // Editing still receives the selected field as its explicit return target.
    selectedFieldId = fieldId;
    selectedTab = "karte";
    seasonNoteDraft = null;
    waterEditDraft = null;
    reviewView = "overview";
    compareFilter = "work";
    timelineActionRecord = null;
    recordDetail = null;
    expandedFlowRecord = "";
    render();
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  function resetNavigation() {
    selectedFieldId = "";
    selectedTab = "karte";
    seasonNoteDraft = null;
    waterEditDraft = null;
    reviewView = "overview";
    compareFilter = "work";
    timelineActionRecord = null;
    recordDetail = null;
    expandedFlowRecord = "";
    render();
  }

  function bind() {
    const year = U.$("annualYear");
    if (year) year.addEventListener("change", render);
    U.$("annualTimeline").addEventListener("click", (event) => {
      const statusAction = event.target.closest("[data-annual-status-action]");
      if (statusAction) {
        event.preventDefault();
        event.stopPropagation();
        openStatusInput(statusAction.dataset.annualStatusAction, statusAction.dataset.annualStatusField);
        return;
      }
      const open = event.target.closest("[data-annual-open-field]");
      if (open) {
        // A card on the review top opens the same review detail, never the
        // fixed-information field screen. The label and destination match.
        if (RiceOS.navigation && RiceOS.navigation.openField && RiceOS.navigation.openField(open.dataset.annualOpenField, {
          originScreen: "annual",
          destination: "annual-history",
          tab: "karte"
        })) return;
        selectedFieldId = open.dataset.annualOpenField;
        selectedTab = "karte";
        waterEditDraft = null;
        render();
        if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (event.target.closest("[data-annual-record-detail-back]")) {
        handleBack();
        return;
      }
      if (event.target.closest("[data-annual-record-detail-open-water]")) {
        recordDetail = null;
        selectedTab = "water";
        waterEditDraft = null;
        render();
        setTimeout(() => U.$("annualTimeline").querySelector(".annual-water-review-list, .annual-water-periods")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
        return;
      }
      if (event.target.closest("[data-annual-back]")) {
        if (RiceOS.navigation && RiceOS.navigation.current && RiceOS.navigation.current() && RiceOS.app && RiceOS.app.back) {
          RiceOS.app.back();
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        handleBack();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (event.target.closest("[data-annual-open-compare]")) {
        reviewView = "compare";
        compareFilter = "work";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (event.target.closest("[data-annual-close-compare]")) {
        reviewView = "overview";
        compareFilter = "work";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const compareFilterButton = event.target.closest("[data-annual-compare-filter]");
      if (compareFilterButton) {
        compareFilter = compareFilterButton.dataset.annualCompareFilter || "work";
        render();
        return;
      }
      const recordAction = event.target.closest("[data-annual-record-action]");
      if (recordAction) {
        const actionName = recordAction.dataset.annualRecordAction;
        if (actionName === "cancel" && recordAction.classList.contains("annual-record-action-backdrop") && event.target !== recordAction) return;
        const record = timelineActionRecord;
        if (actionName === "cancel" || !record) {
          closeTimelineAction();
          return;
        }
        if (actionName === "open-water") {
          timelineActionRecord = null;
          selectedTab = "water";
          waterEditDraft = null;
          render();
          setTimeout(() => U.$("annualTimeline").querySelector(".annual-water-review-list, .annual-water-periods")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
          return;
        }
        timelineActionRecord = null;
        if (actionName === "edit") {
          render();
          editRow(record.kind, record.id);
          return;
        }
        if (actionName === "delete") {
          render();
          if (record.kind === "dry" || record.kind === "irrigation") deleteWaterPeriod(record.kind, record.id);
          else deleteRow(record.kind, record.id);
          return;
        }
      }
      const flowSummary = event.target.closest("[data-annual-flow-summary]");
      if (flowSummary) {
        const key = flowSummary.dataset.annualFlowSummary || "";
        expandedFlowRecord = expandedFlowRecord === key ? "" : key;
        render();
        return;
      }
      const flowMenu = event.target.closest("[data-annual-flow-menu-kind]");
      if (flowMenu) {
        openTimelineAction({
          kind: flowMenu.dataset.annualFlowMenuKind,
          id: flowMenu.dataset.annualFlowMenuId,
          label: flowMenu.dataset.annualFlowMenuLabel || "記録"
        });
        return;
      }
      const recordOpen = event.target.closest("[data-annual-record-open-kind]");
      if (recordOpen) {
        if (Date.now() < suppressTimelineOpenUntil) return;
        openAnnualRecordDetail(recordOpen.dataset.annualRecordOpenKind, recordOpen.dataset.annualRecordOpenId, recordOpen.dataset.annualRecordOpenLabel);
        return;
      }
      const tab = event.target.closest("[data-annual-tab]");
      if (tab) {
        selectedTab = tab.dataset.annualTab;
        waterEditDraft = null;
        render();
        return;
      }
      const waterEdit = event.target.closest("[data-annual-water-edit]");
      if (waterEdit) {
        if (waterEdit.dataset.annualWaterEdit === "fieldWork") editRow("fieldWork", waterEdit.dataset.id);
        else {
          const kind = waterEdit.dataset.annualWaterEdit;
          const rows = kind === "dry" ? (state.data().dryPeriods || []) : (state.data().irrigations || []);
          const record = rows.find((row) => String(kind === "dry" ? row.dryPeriodId : row.irrigationId) === String(waterEdit.dataset.id));
          if (record && RiceOS.recordActions && RiceOS.recordActions.edit && RiceOS.recordActions.edit(kind, record, {
            originScreen: "annual",
            tab: "water",
            returnToAnnualFieldId: selectedFieldId,
            returnToAnnualTab: "water"
          })) return;
          openWaterEditor(kind, waterEdit.dataset.id);
        }
        return;
      }
      const waterDelete = event.target.closest("[data-annual-water-delete]");
      if (waterDelete) {
        deleteWaterPeriod(waterDelete.dataset.annualWaterDelete, waterDelete.dataset.id);
        return;
      }
      const waterEditorDelete = event.target.closest("[data-annual-water-editor-delete]");
      if (waterEditorDelete) {
        deleteWaterPeriod(waterEditorDelete.dataset.annualWaterEditorDelete, waterEditorDelete.dataset.id);
        return;
      }
      const waterImport = event.target.closest("[data-annual-water-import]");
      if (waterImport && selectedFieldId && state.importLegacyWaterPeriod) {
        const candidate = legacyWaterReviewRowsForField(state.field(selectedFieldId)).find((item) => item.legacyKey === waterImport.dataset.annualWaterImport);
        if (!candidate) return;
        const matches = state.directWaterMatchesForLegacy ? state.directWaterMatchesForLegacy(selectedFieldId, candidate.legacyKey) : [];
        if (matches.length > 1) {
          alert("同じ期間の水管理記録が複数あります。先に登録済みの水管理を確認・整理してから取り込んでください。");
          return;
        }
        const existingId = matches[0] && matches[0].directId || "";
        const prompt = existingId
          ? `${candidate.label}（${U.fd(candidate.startDate)} - ${U.fd(candidate.actualEndDate)}）と同じ期間の水管理記録があります。\n既存の水管理記録へ関連付けます。元の作業記録は削除されません。`
          : `${candidate.label}（${U.fd(candidate.startDate)} - ${U.fd(candidate.actualEndDate)}）を水管理へ取り込みます。\n元の作業記録は削除されません。`;
        if (!confirm(prompt)) return;
        const savedId = state.importLegacyWaterPeriod(selectedFieldId, candidate.legacyKey, existingId);
        if (savedId) render();
        return;
      }
      const waterContinue = event.target.closest("[data-annual-water-continue]");
      if (waterContinue && selectedFieldId && state.adoptLegacyWaterPeriod) {
        const candidate = legacyWaterReviewRowsForField(state.field(selectedFieldId)).find((item) => item.legacyKey === waterContinue.dataset.annualWaterContinue);
        if (!candidate || !confirm(`${candidate.label}の旧作業記録を水管理の下書きへ引き継ぎます。\n元の作業記録は残したまま、足りない開始日または終了日を確認できます。`)) return;
        const adopted = state.adoptLegacyWaterPeriod(selectedFieldId, candidate.legacyKey);
        if (!adopted) return;
        waterEditDraft = { kind: adopted.kind === "dry" ? "dry" : "irrigation", id: adopted.id };
        render();
        setTimeout(() => U.$("annualTimeline").querySelector("[data-annual-water-editor]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
        return;
      }
      if (event.target.closest("[data-annual-water-cancel]")) {
        waterEditDraft = null;
        render();
        return;
      }
      const fab = event.target.closest("[data-annual-fab]");
      if (fab) {
        openAdd(fab.dataset.annualFab);
        return;
      }
      if (event.target.closest("[data-annual-reflection-focus]")) {
        const target = U.$("annualTimeline").querySelector(".annual-season-notes") || U.$("annualTimeline").querySelector(".annual-carryover-note");
        if (!target) return;
        if (selectedFieldId && !target.querySelector("textarea, input")) {
          seasonNoteDraft = { fieldId: selectedFieldId, year: reviewYearValue(), date: defaultSeasonNoteDate(reviewYearValue()), memo: "" };
          render();
        }
        const refreshedTarget = U.$("annualTimeline").querySelector(".annual-season-notes") || U.$("annualTimeline").querySelector(".annual-carryover-note");
        refreshedTarget.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = refreshedTarget.querySelector("textarea, input");
        if (input) setTimeout(() => input.focus(), 280);
        return;
      }
      const noteAdd = event.target.closest("[data-season-note-add]");
      if (noteAdd) {
        seasonNoteDraft = { fieldId: noteAdd.dataset.seasonNoteAdd, year: reviewYearValue(), date: defaultSeasonNoteDate(reviewYearValue()), memo: "" };
        render();
        return;
      }
      if (event.target.closest("[data-season-note-cancel]")) {
        seasonNoteDraft = null;
        render();
        return;
      }
      const noteEdit = event.target.closest("[data-season-note-edit]");
      if (noteEdit && selectedFieldId) {
        const note = seasonNotesForReview(selectedFieldId).find((item) => seasonNoteId(item) === noteEdit.dataset.seasonNoteEdit);
        if (!note) return;
        seasonNoteDraft = { fieldId: selectedFieldId, year: reviewYearValue(), noteId: seasonNoteId(note), date: note.date || defaultSeasonNoteDate(reviewYearValue()), memo: note.text || note.memo || note.note || "" };
        render();
        return;
      }
      const noteSave = event.target.closest("[data-season-note-save]");
      if (noteSave && selectedFieldId && state.saveSeasonNote) {
        const editor = noteSave.closest("[data-season-note-editor]");
        const date = editor && editor.querySelector("[data-season-note-date]") && editor.querySelector("[data-season-note-date]").value || "";
        const memo = editor && editor.querySelector("[data-season-note-memo]") && editor.querySelector("[data-season-note-memo]").value.trim() || "";
        if (!memo) return;
        if (!String(date).startsWith(`${reviewYearValue()}-`)) {
          alert(`${reviewYearValue()}年の気づきとして保存するため、日付も同じ年にしてください。`);
          return;
        }
        const saved = state.saveSeasonNote({ noteId: noteSave.dataset.seasonNoteId || "", fieldId: selectedFieldId, season: reviewYearValue(), date, text: memo });
        if (!saved) return;
        seasonNoteDraft = null;
        render();
        return;
      }
      const noteDelete = event.target.closest("[data-season-note-delete]");
      if (noteDelete && state.deleteSeasonNote && confirm("この気づきを削除しますか？")) {
        const saved = state.deleteSeasonNote(noteDelete.dataset.seasonNoteDelete, selectedFieldId);
        if (!saved) return;
        seasonNoteDraft = null;
        render();
        return;
      }
      const action = event.target.closest("[data-annual-action]");
      if (action) {
        if (action.dataset.annualAction === "edit") editRow(action.dataset.kind, action.dataset.id);
        if (action.dataset.annualAction === "delete") deleteRow(action.dataset.kind, action.dataset.id);
      }
    });
    U.$("annualTimeline").addEventListener("pointerdown", (event) => {
      const card = event.target.closest("[data-annual-record-open-kind]");
      if (!card || (event.pointerType === "mouse" && event.button !== 0)) return;
      clearTimeout(timelineLongPressTimer);
      const record = {
        kind: card.dataset.annualRecordOpenKind,
        id: card.dataset.annualRecordOpenId,
        label: card.dataset.annualRecordOpenLabel || "記録"
      };
      timelinePointerStart = { x: event.clientX, y: event.clientY };
      timelineLongPressTimer = setTimeout(() => openTimelineAction(record), 550);
    });
    U.$("annualTimeline").addEventListener("pointermove", (event) => {
      if (!timelinePointerStart) return;
      const moved = Math.hypot(event.clientX - timelinePointerStart.x, event.clientY - timelinePointerStart.y);
      if (moved > 8) clearTimeout(timelineLongPressTimer);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      U.$("annualTimeline").addEventListener(eventName, () => {
        clearTimeout(timelineLongPressTimer);
        timelinePointerStart = null;
      });
    });
    U.$("annualTimeline").addEventListener("contextmenu", (event) => {
      const card = event.target.closest("[data-annual-record-open-kind]");
      if (!card) return;
      event.preventDefault();
      openTimelineAction({ kind: card.dataset.annualRecordOpenKind, id: card.dataset.annualRecordOpenId, label: card.dataset.annualRecordOpenLabel || "記録" });
    });
    U.$("annualTimeline").addEventListener("input", (event) => {
      if (event.target && event.target.id === "annualSearch") {
        annualSearchValue = event.target.value;
        render();
      }
    });
    U.$("annualTimeline").addEventListener("change", (event) => {
      if (event.target && event.target.matches("[data-annual-field-switch]")) {
        switchFieldWithinAnnual(event.target.value);
        return;
      }
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
    U.$("annualTimeline").addEventListener("submit", (event) => {
      const form = event.target.closest("[data-annual-water-edit-form]");
      if (!form) return;
      event.preventDefault();
      const formData = new FormData(form);
      const kind = String(formData.get("kind") || "");
      const id = String(formData.get("id") || "");
      const record = waterRecord(kind, id);
      const startDate = String(formData.get("startDate") || "");
      const actualEndDate = String(formData.get("actualEndDate") || "");
      if (!record || !startDate) return;
      if (actualEndDate && actualEndDate < startDate) {
        alert("終了日は開始日以降の日付にしてください。");
        return;
      }
      if (kind === "irrigation" && !periodCoversWaterMovements(record, startDate, actualEndDate)) {
        alert("親期間の日付は、期間内の入水・落水の記録を含む範囲にしてください。");
        return;
      }
      if (record.actualEndDate && !actualEndDate && !confirm("この完了済み水管理を継続中に戻しますか？")) return;
      const next = { ...record, date: startDate, season: String(startDate).slice(0, 4), startDate, actualEndDate, status: actualEndDate ? "完了" : "実施中", periodStatus: actualEndDate ? "完了" : "実施中", memo: String(formData.get("memo") || "").trim() };
      const saved = kind === "dry" ? state.saveDryPeriod(next) : state.saveIrrigation(next);
      if (!saved) return;
      waterEditDraft = null;
      render();
    });
  }

  // A small pure surface for the record-preservation verifier. It is only
  // exposed when the Node test harness opts in, never in the running app.
  if (window.__RICEOS_TEST__) RiceOS.annualTest = { waterRoleRank, fieldYearTimeline };

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.annual = {
    render,
    bind,
    openField,
    openWaterEditor,
    handleBack,
    canHandleBack,
    resetNavigation,
    isRecordDetailOpen: () => Boolean(recordDetail),
    hasTransientBackState: () => Boolean(recordDetail || expandedFlowRecord || reviewView === "compare")
  };
})();
