(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  function state() {
    return RiceOS.state;
  }

  function fieldOf(fieldOrId) {
    if (!fieldOrId) return null;
    if (typeof fieldOrId === "string") return state().field(fieldOrId);
    return fieldOrId;
  }

  // User-provided Koshihikari reference: panicle length (mm) -> days before heading.
  // Keep this table variety-specific; other varieties only retain the observation.
  const KOSHIHIKARI_PANICLE_TABLE = [
    { mm: 1, days: 25 },
    { mm: 2, days: 21 },
    { mm: 10, days: 18 },
    { mm: 20, days: 15 },
    { mm: 80, days: 12 }
  ];

  // Regional harvest references are intentionally data, not UI text. Recipe
  // overrides take precedence so a grower can tune a variety without forking
  // the calculation used by Home and Outlook.
  const HARVEST_REFERENCES = [
    { pattern: /天のつぶ/, target: 1000, minimum: 1000, maximum: 1000, daysMin: 40, daysMax: 50, label: "1,000℃前後" },
    { pattern: /コシヒカリ/, target: 1025, minimum: 1000, maximum: 1050, daysMin: 40, daysMax: 50, label: "1,000〜1,050℃" },
    { pattern: /ひとめぼれ|夢の香|福乃香/, target: 950, minimum: 950, maximum: 950, daysMin: 40, daysMax: 50, label: "950℃前後" },
    { pattern: /福笑い/, target: 1050, minimum: 1050, maximum: 1050, daysMin: 40, daysMax: 50, label: "1,050℃前後" }
  ];
  const DEFAULT_HARVEST_REFERENCE = { target: 1000, minimum: 1000, maximum: 1000, daysMin: 40, daysMax: 50, label: "1,000℃前後" };

  function addDays(dateText, days) {
    const d = U.localDate ? U.localDate(dateText) : new Date(`${dateText}T00:00:00`);
    if (!d || Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Number(days || 0));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function isKoshihikari(field) {
    const variety = field && field.varietyId ? state().variety(field.varietyId) : null;
    return /コシヒカリ/.test(String(variety && variety.name || ""));
  }

  function harvestReferenceFor(fieldOrId) {
    const field = fieldOf(fieldOrId);
    const variety = field && field.varietyId ? state().variety(field.varietyId) : null;
    const matched = HARVEST_REFERENCES.find((item) => item.pattern.test(String(variety && variety.name || ""))) || DEFAULT_HARVEST_REFERENCE;
    const numberOr = (value, fallback) => {
      const valueNumber = Number(value);
      return Number.isFinite(valueNumber) && valueNumber > 0 ? valueNumber : fallback;
    };
    const minimum = numberOr(variety && variety.ripeningAccumulatedTempMin, matched.minimum);
    const maximum = Math.max(minimum, numberOr(variety && variety.ripeningAccumulatedTempMax, matched.maximum));
    const target = numberOr(variety && variety.ripeningAccumulatedTempTarget, matched.target);
    const daysMin = numberOr(variety && variety.harvestDaysAfterHeadingMin, matched.daysMin);
    const daysMax = Math.max(daysMin, numberOr(variety && variety.harvestDaysAfterHeadingMax, matched.daysMax));
    const hasRecipeOverride = Boolean(variety && [
      "ripeningAccumulatedTempTarget", "ripeningAccumulatedTempMin", "ripeningAccumulatedTempMax",
      "harvestDaysAfterHeadingMin", "harvestDaysAfterHeadingMax"
    ].some((key) => String(variety[key] || "").trim()));
    return {
      target,
      minimum,
      maximum,
      daysMin,
      daysMax,
      label: hasRecipeOverride
        ? (minimum === maximum ? `${minimum}℃` : `${minimum}〜${maximum}℃`)
        : matched.label,
      source: hasRecipeOverride ? "栽培レシピの収穫目安" : "福島県の品種別目安"
    };
  }

  function postHeadingThermalStart(headingDate) {
    return addDays(headingDate, 1);
  }

  function panicleStage(lengthMm) {
    if (lengthMm <= 2) return "幼穂形成期";
    if (lengthMm <= 10) return "幼穂伸長期";
    if (lengthMm <= 20) return "穂ばらみ前";
    if (lengthMm <= 80) return "穂ばらみ期";
    return "出穂前";
  }

  function daysToHeadingFromPanicle(lengthMm) {
    if (lengthMm <= KOSHIHIKARI_PANICLE_TABLE[0].mm) return KOSHIHIKARI_PANICLE_TABLE[0].days;
    const last = KOSHIHIKARI_PANICLE_TABLE[KOSHIHIKARI_PANICLE_TABLE.length - 1];
    if (lengthMm >= last.mm) return last.days;
    for (let i = 1; i < KOSHIHIKARI_PANICLE_TABLE.length; i += 1) {
      const previous = KOSHIHIKARI_PANICLE_TABLE[i - 1];
      const next = KOSHIHIKARI_PANICLE_TABLE[i];
      if (lengthMm <= next.mm) {
        const ratio = (lengthMm - previous.mm) / Math.max(0.001, next.mm - previous.mm);
        return Math.round(previous.days + ((next.days - previous.days) * ratio));
      }
    }
    return last.days;
  }

  function panicleEstimate(fieldOrId, lengthValue, observedDate) {
    const field = fieldOf(fieldOrId);
    const lengthMm = Number(lengthValue);
    if (!field || !Number.isFinite(lengthMm) || lengthMm <= 0) return null;
    if (!isKoshihikari(field)) return { supported: false, lengthMm };
    const daysToHeading = daysToHeadingFromPanicle(lengthMm);
    const date = addDays(observedDate || U.today(), daysToHeading);
    return {
      supported: true,
      lengthMm: Math.round(lengthMm * 10) / 10,
      stage: panicleStage(lengthMm),
      daysToHeading,
      observedDate: observedDate || U.today(),
      date,
      rangeStart: addDays(date, -2),
      rangeEnd: addDays(date, 2),
      source: "コシヒカリ幼穂長基準"
    };
  }

  function latestPanicleEstimate(fieldOrId, year) {
    const field = fieldOf(fieldOrId);
    if (!field) return null;
    const targetYear = year && year !== "all" ? String(year) : "";
    const summary = state().growthSummaryFor && state().growthSummaryFor(field.fieldId, targetYear || undefined);
    if (summary && summary.headingDate) return null;
    if (summary && summary.panicleLog) {
      return panicleEstimate(field, summary.panicleLog.panicleLengthMm, summary.panicleLog.date);
    }
    const logs = state().growthLogsFor(field.fieldId, targetYear || undefined)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const log of logs) {
      const estimate = panicleEstimate(field, log.panicleLengthMm, log.date);
      if (estimate && estimate.supported) return estimate;
    }
    return null;
  }

  function addYears(dateText, years) {
    const d = U.localDate ? U.localDate(dateText) : new Date(`${dateText}T00:00:00`);
    if (!d || Number.isNaN(d.getTime())) return "";
    d.setFullYear(d.getFullYear() + years);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function tempMeanFromWork(work) {
    if (work && work.weatherAuto) {
      const auto = work.weatherAuto;
      const value = auto.tempMean !== "" && auto.tempMean !== undefined ? auto.tempMean : "";
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    const text = String(work && work.weather || "");
    const match = text.match(/平均\s*(-?\d+(?:\.\d+)?)\s*℃/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function tempRows(fieldId, startDate, endDate) {
    if (!fieldId || !startDate || !endDate) return [];
    const rows = new Map();
    (state().data().fieldWorks || []).forEach((work) => {
      if (!work || !(work.fieldIds || []).includes(fieldId)) return;
      if (!U.inDateRange(work.date, startDate, endDate)) return;
      const temp = tempMeanFromWork(work);
      if (temp === null) return;
      if (!rows.has(work.date)) rows.set(work.date, []);
      rows.get(work.date).push(temp);
    });
    return Array.from(rows.entries()).map(([date, values]) => ({
      date,
      tempMean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
    }));
  }

  function sumTemps(fieldId, startDate, endDate) {
    const rows = tempRows(fieldId, startDate, endDate);
    const total = rows.reduce((sum, row) => sum + row.tempMean, 0);
    return {
      count: rows.length,
      total: Math.round(total * 10) / 10
    };
  }

  function progress(fieldOrId, dateText) {
    const field = fieldOf(fieldOrId);
    const date = dateText || U.today();
    const plantingDate = field && state().plantingDateForField ? state().plantingDateForField(field.fieldId, U.dateYear(date)) : "";
    if (!field || !plantingDate) {
      return {
        field,
        dap: "",
        tempTotal: "",
        tempCount: 0,
        tempText: "記録待ち",
        diff: "",
        diffText: "前年比 --"
      };
    }
    const current = sumTemps(field.fieldId, plantingDate, date);
    const previousStart = addYears(plantingDate, -1);
    const previousEnd = addYears(date, -1);
    const previous = sumTemps(field.fieldId, previousStart, previousEnd);
    const diff = current.count && previous.count ? Math.round((current.total - previous.total) * 10) / 10 : "";
    return {
      field,
      dap: U.daysAfterPlanting(field, date),
      tempTotal: current.count ? current.total : "",
      tempCount: current.count,
      tempText: current.count ? `${Math.round(current.total)}℃` : "記録待ち",
      diff,
      diffText: diff === "" ? "前年比 --" : `前年比 ${diff > 0 ? "+" : ""}${diff}℃`
    };
  }

  function compactLine(fieldOrId, dateText) {
    const item = progress(fieldOrId, dateText);
    const dap = item.dap === "" ? "田植日未設定" : `田植後 ${item.dap}日`;
    return `${dap} / 積算気温 ${item.tempText}`;
  }

  // Detailed stage definitions live here so UI screens only render the result.
  // Water management is deliberately kept out of this list.
  const SEASON_STAGES = [
    { key: "establishment", label: "活着期", image: 2, legacyKey: "planting" },
    { key: "earlyTillering", label: "分げつ初期", image: 3, legacyKey: "tillering" },
    { key: "peakTillering", label: "分げつ盛期", image: 3, legacyKey: "tillering" },
    { key: "maximumTillering", label: "最高分げつ期", image: 4, legacyKey: "tillering" },
    { key: "panicleInitiation", label: "幼穂形成期", image: 5, legacyKey: "panicle" },
    { key: "meiosis", label: "減数分裂期", image: 5, legacyKey: "panicle" },
    { key: "booting", label: "穂ばらみ期", image: 5, legacyKey: "panicle" },
    { key: "heading", label: "出穂期", image: 6, legacyKey: "heading" },
    { key: "fullHeading", label: "穂揃期", image: 6, legacyKey: "heading" },
    { key: "ripening", label: "登熟期", image: 7, legacyKey: "ripening" },
    { key: "yellowRipening", label: "黄熟期", image: 7, legacyKey: "ripening" },
    { key: "maturity", label: "成熟期", image: 8, legacyKey: "harvest" }
  ];
  const STAGE_INDEX = Object.fromEntries(SEASON_STAGES.map((item, index) => [item.key, index + 1]));
  const LEGACY_STAGE = {
    planting: "establishment",
    tillering: "peakTillering",
    panicle: "panicleInitiation",
    heading: "heading",
    ripening: "ripening",
    harvest: "maturity"
  };

  function rowsForYear(fieldId, year) {
    return {
      works: state().fieldWorksFor(fieldId, year),
      growth: state().growthLogsFor(fieldId, year)
    };
  }

  function firstDate(rows) {
    return rows.filter(Boolean).sort()[0] || "";
  }

  function plantingDateInYear(fieldId, year) {
    return state().plantingDateForField(fieldId, year);
  }

  function headingDateInYear(fieldId, year, asOfDate) {
    return state().headingDateForField(fieldId, year, asOfDate);
  }

  function panicleStageKey(lengthMm) {
    const length = Number(lengthMm || 0);
    if (length <= 2) return "panicleInitiation";
    if (length <= 10) return "meiosis";
    return "booting";
  }

  function estimatedHeading(field, plantingDate, year) {
    if (!plantingDate) return null;
    const previousYear = Number(year) - 1;
    const ownPlanting = plantingDateInYear(field.fieldId, previousYear);
    const ownHeading = headingDateInYear(field.fieldId, previousYear);
    let headingDays = ownPlanting && ownHeading ? U.daysBetween(ownPlanting, ownHeading) : "";
    // Historical data can contain old trial entries. Only use a same-field
    // planting-to-heading interval when it is within a realistic rice season.
    if (headingDays === "" || headingDays < 70 || headingDays > 130) return null;
    return { date: addDays(plantingDate, headingDays), daysAfterPlanting: headingDays, basis: "前年の同一圃場" };
  }

  function estimatedStageKey(daysFromHeading) {
    if (daysFromHeading <= -45) return "earlyTillering";
    if (daysFromHeading <= -31) return "peakTillering";
    if (daysFromHeading <= -23) return "maximumTillering";
    if (daysFromHeading <= -19) return "panicleInitiation";
    if (daysFromHeading <= -16) return "meiosis";
    if (daysFromHeading <= -8) return "booting";
    if (daysFromHeading <= 5) return "heading";
    if (daysFromHeading <= 10) return "fullHeading";
    if (daysFromHeading <= 35) return "ripening";
    if (daysFromHeading <= 45) return "yellowRipening";
    return "maturity";
  }

  function fallbackStageFromDap(dap) {
    const days = Number(dap);
    if (!Number.isFinite(days) || days < 0) return "";
    if (days <= 7) return "establishment";
    if (days <= 30) return "earlyTillering";
    if (days <= 50) return "peakTillering";
    if (days <= 65) return "maximumTillering";
    if (days <= 78) return "panicleInitiation";
    if (days <= 85) return "meiosis";
    if (days <= 92) return "booting";
    if (days <= 100) return "heading";
    if (days <= 108) return "fullHeading";
    if (days <= 135) return "ripening";
    if (days <= 145) return "yellowRipening";
    return "maturity";
  }

  function stageFromKey(key) {
    const index = STAGE_INDEX[key] || 0;
    return { index, current: index ? SEASON_STAGES[index - 1] : null };
  }

  // A single irrigation period can contain repeated refill and drainage
  // movements. Keep those movements factual and derive display statistics
  // here so Home, water input, and annual review agree on the same history.
  function waterMovementTimeline(record, options) {
    const opts = options || {};
    const asOf = String(opts.asOf || record && record.actualEndDate || "");
    const rows = Array.isArray(record && record.waterMovements) ? record.waterMovements.slice() : [];
    const segments = rows
      .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(String(item.startDate || "")))
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
      .map((item) => {
        const startDate = String(item.startDate);
        const explicitEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(item.endDate || "")) ? String(item.endDate) : "";
        const endDate = explicitEnd || (asOf && asOf >= startDate ? asOf : "");
        const elapsed = endDate ? U.daysBetween(startDate, endDate) : "";
        const days = elapsed === "" || elapsed < 0 ? "" : Number(elapsed) + 1;
        return {
          movementId: String(item.movementId || ""),
          phase: item.phase === "drain" ? "drain" : "flood",
          startDate,
          endDate: explicitEnd,
          displayEndDate: endDate,
          days,
          active: !explicitEnd
        };
      })
      .filter((item) => item.days !== "");
    const summarize = (phase) => {
      const matching = segments.filter((item) => item.phase === phase);
      return {
        count: matching.length,
        days: matching.reduce((total, item) => total + Number(item.days || 0), 0)
      };
    };
    return {
      segments,
      flood: summarize("flood"),
      drain: summarize("drain"),
      active: segments.find((item) => item.active) || null
    };
  }

  function managementStatus(field, date) {
    const targetDate = date || U.today();
    const year = U.dateYear(targetDate);
    const validDate = (value) => {
      const text = String(value || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
      const parsed = new Date(`${text}T00:00:00`);
      return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === Number(text.slice(0, 4)) && parsed.getMonth() + 1 === Number(text.slice(5, 7)) && parsed.getDate() === Number(text.slice(8, 10));
    };
    const periods = state().resolvedWaterPeriodsFor
      ? state().resolvedWaterPeriodsFor(field.fieldId, { year, throughDate: targetDate, includePlanned: true, forDisplay: true })
      : [];
    // A period becomes factual only when it has an actual start. Keep plans
    // visible in their own views, but never let them replace current status.
    const factual = periods.filter((row) => validDate(row.startDate) && !row.planned && row.startDate <= targetDate);
    const hasValidEnd = (row) => validDate(row.actualEndDate) && row.actualEndDate >= row.startDate;
    const active = factual.filter((row) => !row.actualEndDate || (hasValidEnd(row) && row.actualEndDate > targetDate))
      .slice().sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
    const activeKinds = Array.from(new Set(active.map((row) => row.kind)));
    if (activeKinds.length > 1) {
      return {
        key: "overlap",
        label: "水管理の記録を確認",
        tone: "warn",
        date: active[0] && active[0].startDate || "",
        detail: active.map((row) => row.label).filter((label, index, rows) => rows.indexOf(label) === index).join(" / ")
      };
    }
    if (active.length) {
      const current = active[0];
      const labels = { dry: "中干し中", intermittent: "間断灌水中", saturated: "飽水管理中", deep: "深水管理中", drain: "落水中" };
      const keys = { dry: "drying", intermittent: "intermittent", saturated: "saturated", deep: "deepWater", drain: "draining" };
      const movements = Array.isArray(current.raw && current.raw.waterMovements) ? current.raw.waterMovements : [];
      const currentMovement = movements.filter((item) => item && item.startDate && !item.endDate)
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || null;
      const movementLabel = currentMovement && current.kind === "intermittent"
        ? (currentMovement.phase === "drain" ? "間断灌水・落水中" : "間断灌水・入水中")
        : currentMovement && current.kind === "saturated"
          ? (currentMovement.phase === "drain" ? "飽水管理・自然落水中" : "飽水管理・給水中")
          : labels[current.kind] || `${current.label}中`;
      return { key: keys[current.kind] || current.kind, label: movementLabel, tone: current.kind === "dry" ? "warn" : "water", date: currentMovement?.startDate || current.startDate || "" };
    }
    const completed = factual.filter((row) => hasValidEnd(row) && row.actualEndDate <= targetDate)
      .slice().sort((a, b) => String(b.actualEndDate || "").localeCompare(String(a.actualEndDate || "")))[0] || null;
    if (completed) return { key: `${completed.kind}Completed`, label: `${completed.label}完了`, tone: "ok", date: completed.actualEndDate || "" };
    return { key: "waterWaiting", label: "水管理未記録", tone: "waiting", date: "" };
  }

  // Keep the field record authoritative. This helper adds only a compact
  // reading reference for the current growth window; it never changes water
  // periods or creates a planned operation.
  function waterStageContext(fieldOrId, dateText, anchor) {
    const field = fieldOf(fieldOrId);
    const date = dateText || U.today();
    const management = field ? managementStatus(field, date) : { label: "水管理未記録", date: "" };
    const started = String(management.date || "");
    const actualDetail = started
      ? `${U.fd(started)}から ${Math.max(0, U.daysBetween(started, date))}日目`
      : "実績の水管理期間は未登録";
    let referenceLabel = "生育記録を起点に水管理の実績を確認";
    let referenceNote = "一般的な目安です。田面と圃場の状態を見て判断します。";
    if (anchor && anchor.mode === "postHeading") {
      const elapsed = Number(anchor.elapsed || 0);
      if (elapsed <= 4) {
        referenceLabel = "開花期の水管理記録を確認";
        referenceNote = "出穂後の一般的な目安です。田面が長く露出していないか、実績と現場を照合します。";
      } else if (elapsed <= 7) {
        referenceLabel = "間断灌水への移行時期を確認";
        referenceNote = "一般的には開花が終わり始める頃です。現在の水管理期間を現場と照合します。";
      } else if (elapsed <= 25) {
        referenceLabel = "間断灌水の期間と水の動きを確認";
        referenceNote = "出穂後の一般的な登熟期の見方です。登録済みの入水・落水と現場を照合します。";
      } else {
        referenceLabel = "落水開始日と収穫見込みを比較";
        referenceNote = "一般的な登熟後期の目安です。早期落水を避けるかどうかは圃場の状態と収穫予定で判断します。";
      }
    } else if (anchor && anchor.mode === "panicle") {
      if (Number(anchor.length || 0) >= 65 && Number(anchor.length || 0) <= 95) {
        referenceLabel = "低温時の深水管理実績を確認";
        referenceNote = "幼穂長約8cmを基準にした一般的な目安です。地域情報と現場の状態を照合します。";
      } else {
        referenceLabel = "深水・間断の実績を確認";
        referenceNote = "幼穂確認を起点にした一般的な見方です。推定が実際の水管理を上書きすることはありません。";
      }
    }
    return { management, actualDetail, referenceLabel, referenceNote };
  }

  function latestPanicleLog(fieldId, year, dateText) {
    const summary = state().growthSummaryFor && state().growthSummaryFor(fieldId, year, { asOfDate: dateText || U.today() });
    if (summary && summary.panicleLog) return summary.panicleLog;
    return state().growthLogsFor(fieldId, year)
      .filter((row) => String(row.date || "") <= String(dateText || U.today()))
      .filter((row) => Number(row.panicleLengthMm || 0) > 0)
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .at(-1) || null;
  }

  // This is a reading aid, not a water-management instruction. It begins only
  // after an actual panicle measurement and never creates or changes records.
  function criticalWaterWindow(fieldOrId, dateText) {
    const field = fieldOf(fieldOrId);
    const date = dateText || U.today();
    if (!field) return { active: false };
    const year = U.dateYear(date);
    const headingDate = headingDateInYear(field.fieldId, year, date);
    const panicleLog = latestPanicleLog(field.fieldId, year, date);
    const management = managementStatus(field, date);
    const harvested = state().fieldWorksFor(field.fieldId, year)
      .filter((row) => !state().isActualFieldWork || state().isActualFieldWork(row))
      .some((row) => /稲刈り|収穫/.test(String(row.workName || "")) && String(row.date || "") <= String(date));
    if (harvested) return { active: false };

    if (headingDate) {
      const elapsed = U.daysBetween(headingDate, date);
      if (elapsed === "" || elapsed < 0) return { active: false };
      let phase = "出穂・開花期の目安";
      let note = "出穂日を基準にした一般的な見方です。現場の状態と合わせて確認します。";
      if (elapsed >= 5 && elapsed <= 7) {
        phase = "穂揃い期の目安";
        note = "一般的には開花が終わり始める頃です。現在の水管理の実績を現場と合わせて確認します。";
      } else if (elapsed >= 8 && elapsed <= 25) {
        phase = "登熟期の目安";
        note = "出穂後の一般的な目安です。水管理は記録済みの期間と圃場の状態を合わせて見ます。";
      } else if (elapsed >= 26) {
        phase = "登熟後期の目安";
        note = "収穫前の落水記録・予定、土質、圃場の乾き方を比較表示します。";
      }
      return {
        active: true,
        mode: "postHeading",
        phase,
        certainty: "推定",
        anchorLabel: `出穂から${elapsed}日目`,
        observation: `出穂 ${U.fd(headingDate)}（実測）`,
        note,
        management,
        water: waterStageContext(field, date, { mode: "postHeading", elapsed })
      };
    }

    if (!panicleLog) return { active: false };
    const length = Number(panicleLog.panicleLengthMm || 0);
    let phase = "幼穂形成期";
    let note = "幼穂確認を起点に、水管理の実績と気象を合わせて見る時期です。";
    if (length >= 65 && length <= 95) {
      phase = "減数分裂期の目安";
      note = "幼穂長約8cmを基準にした一般的な目安です。低温時の深水管理実績を、地域の参考情報と照合します。";
    } else if (length > 2) {
      phase = "幼穂伸長中";
      note = "幼穂長の実測を起点にした見通しです。節目を断定せず、現在の水管理の実績と現場の状態を合わせて見ます。";
    } else {
      phase = "幼穂形成期";
      note = "幼穂確認を起点に、水管理の実績と気象を合わせて見る時期です。低温時の深水管理実績を、地域の参考情報と照合します。";
    }
    const estimate = panicleEstimate(field, length, panicleLog.date);
      return {
      active: true,
      mode: "panicle",
      phase,
      certainty: "実測を起点",
      anchorLabel: `幼穂 ${length}mm / ${U.fd(panicleLog.date)}`,
      observation: estimate && estimate.supported && estimate.date
        ? `出穂目安 ${U.fd(estimate.rangeStart)}〜${U.fd(estimate.rangeEnd)}`
        : "出穂日は未確認",
        note,
        management,
        water: waterStageContext(field, date, { mode: "panicle", length })
    };
  }

  // Every screen uses this service so confirmed facts and calendar estimates stay aligned.
  function seasonStageForField(fieldOrId, dateText) {
    const field = fieldOf(fieldOrId);
    const date = dateText || U.today();
    if (!field) return { index: 0, current: null, next: "圃場を選択してください", dap: "", image: 1 };

    const year = String(date).slice(0, 4);
    const beforeOrOn = (row) => String(row.date || "") <= date;
    const works = state().fieldWorksFor(field.fieldId)
      .filter((row) => state().isActualFieldWork ? state().isActualFieldWork(row) : !/(?:予定|確認候補)/.test(String(row.workName || "")))
      .filter((row) => String(row.date || "").startsWith(`${year}-`) && beforeOrOn(row));
    const growth = state().growthLogsFor(field.fieldId)
      .filter((row) => String(row.date || "").startsWith(`${year}-`) && beforeOrOn(row));
    const plantingRows = works.filter((row) => /田植/.test(String(row.workName || "")));
    const planting = state().plantingDateForField
      ? state().plantingDateForField(field.fieldId, year)
      : plantingRows.map((row) => row.date).filter(Boolean).sort()[0] || "";
    const recordedHeadingDate = headingDateInYear(field.fieldId, year, date);
    const dap = planting ? U.daysBetween(planting, date) : "";
    const headingDays = planting && recordedHeadingDate ? U.daysBetween(planting, recordedHeadingDate) : "";
    const headingDate = headingDays !== "" && headingDays >= 70 && headingDays <= 130 ? recordedHeadingDate : "";
    const evidence = [];
    plantingRows.forEach((row) => evidence.push({ date: row.date, key: "establishment", source: "work", recordId: row.workId || "" }));
    growth.forEach((row) => {
      const observed = LEGACY_STAGE[String(row.observedStage || "")] || String(row.observedStage || "");
      // 数値測定・出穂確認は、手動ステージ選択より先に実測根拠として扱う。
      if (row.headingObserved) evidence.push({ date: row.date, key: "heading", source: "measured", kind: "heading", recordId: row.logId || "" });
      else if (Number(row.panicleLengthMm || 0) > 0) evidence.push({ date: row.date, key: panicleStageKey(row.panicleLengthMm), source: "measured", kind: "panicle", recordId: row.logId || "" });
      else if (row.stageConfirmed && STAGE_INDEX[observed]) {
        evidence.push({ date: row.date, key: observed, source: "confirmed", kind: "manual-stage-observation", recordId: row.logId || "", correctionReason: row.correctionReason || "" });
      }
      else if (row.tillerCount !== undefined && String(row.tillerCount) !== "") evidence.push({ date: row.date, key: "peakTillering", source: "measured", kind: "tiller", recordId: row.logId || "" });
    });
    works.filter((row) => /稲刈り|収穫/.test(String(row.workName || "")))
      .forEach((row) => evidence.push({ date: row.date, key: "maturity", source: "work", kind: "harvest", recordId: row.workId || "" }));
    const explicitCorrection = evidence.filter((item) => item.source === "confirmed" && item.correctionReason)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))).pop() || null;
    evidence.sort((a, b) => String(a.date).localeCompare(String(b.date))
      || (STAGE_INDEX[a.key] || 0) - (STAGE_INDEX[b.key] || 0)
      || ({ measured: 1, work: 2, confirmed: 3 }[a.source] - { measured: 1, work: 2, confirmed: 3 }[b.source]));
    const latestEvidence = explicitCorrection || evidence[evidence.length - 1] || null;
    const latestPanicleEvidence = evidence.filter((item) => item.kind === "panicle").pop() || null;
    const panicleHasLaterConfirmation = latestPanicleEvidence && evidence.some((item) =>
      item !== latestPanicleEvidence
      && String(item.date || "") >= String(latestPanicleEvidence.date || "")
      && ["manual-stage-observation", "heading", "harvest"].includes(item.kind)
    );
    // A panicle-length measurement remains the confirmed field stage until a
    // later explicit confirmation, heading observation, or harvest supersedes it.
    const displayedEvidence = latestPanicleEvidence && !panicleHasLaterConfirmation && !explicitCorrection
      ? latestPanicleEvidence
      : latestEvidence;
    // Keep the factual field stage and the calendar outlook as two separate
    // layers. A grower's stage selection must remain readable on Home even
    // when an estimate has moved ahead on the calendar.
    const latestManualEvidence = evidence.filter((item) => item.kind === "manual-stage-observation").at(-1) || null;
    const latestMeasuredEvidence = evidence.filter((item) => ["heading", "panicle", "tiller", "harvest"].includes(item.kind)).at(-1) || null;
    const latestFieldEvidence = latestManualEvidence && (!latestMeasuredEvidence || String(latestManualEvidence.date || "") >= String(latestMeasuredEvidence.date || ""))
      ? latestManualEvidence
      : (latestMeasuredEvidence || evidence[evidence.length - 1] || null);
    const fieldStage = stageFromKey(latestFieldEvidence && latestFieldEvidence.key || "");
    const fieldStageEvidence = latestFieldEvidence && latestFieldEvidence.kind === "manual-stage-observation"
      ? "現地判断"
      : latestFieldEvidence && latestFieldEvidence.kind === "heading"
        ? "現地観察"
        : latestFieldEvidence && ["panicle", "tiller"].includes(latestFieldEvidence.kind)
          ? "実測"
          : latestFieldEvidence && latestFieldEvidence.kind === "harvest"
            ? "作業記録"
            : latestFieldEvidence ? "記録" : "記録待ち";
    // An explicit heading observation remains a factual anchor even when it
    // falls outside the usual planting-to-heading range.
    const factualHeadingReference = recordedHeadingDate ? { date: recordedHeadingDate, basis: "今年の出穂日" } : null;
    const historicalHeading = !factualHeadingReference && !headingDate ? estimatedHeading(field, planting, year) : null;
    const headingReference = factualHeadingReference || (headingDate ? { date: headingDate, basis: "今年の出穂日" }
      : (historicalHeading ? { date: historicalHeading.date, basis: historicalHeading.basis } : null));
    const prediction = headingReference ? {
      key: estimatedStageKey(U.daysBetween(headingReference.date, date)),
      date: headingReference.date,
      basis: headingReference.basis
    } : (dap === "" ? null : {
      key: fallbackStageFromDap(dap),
      date: "",
      basis: "田植後日数の目安"
    });
    const actual = displayedEvidence ? stageFromKey(displayedEvidence.key) : stageFromKey("");
    const predicted = prediction ? stageFromKey(prediction.key) : stageFromKey("");
    const evidenceIsToday = displayedEvidence && displayedEvidence.date === date
      && displayedEvidence.source !== "work";
    // A field observation is certain on its recorded day. On later days, the
    // calendar may progress from that observation until another field check
    // confirms or corrects the stage.
    const usePrediction = Boolean(prediction) && !evidenceIsToday
      && (!actual.index || predicted.index >= actual.index);
    const resolved = usePrediction ? predicted : actual;
    const index = resolved.index;
    let next = "次に残せる記録: 田植え日";
    if (index >= STAGE_INDEX.establishment && index < STAGE_INDEX.panicleInitiation) next = "次に残せる記録: 分げつの様子";
    if (index >= STAGE_INDEX.panicleInitiation && index < STAGE_INDEX.heading) next = "次に残せる記録: 幼穂長または出穂";
    if (index >= STAGE_INDEX.heading && index < STAGE_INDEX.ripening) next = "次に残せる記録: 穂揃い・登熟の様子";
    if (index >= STAGE_INDEX.ripening && index < STAGE_INDEX.maturity) next = "次に残せる記録: 成熟・収穫日";
    if (index === STAGE_INDEX.maturity) next = "次に残せる記録: 収穫日・来年への引き継ぎ";
    const current = resolved.current;
    const suggested = headingDate && STAGE_INDEX[current && current.key] >= STAGE_INDEX.heading && U.daysBetween(headingDate, date) >= 7
      ? { type: "ripening", label: "登熟の確認目安", basis: `出穂確認から${U.daysBetween(headingDate, date)}日` }
      : null;
    return {
      index,
      current,
      next,
      dap,
      image: current ? current.image : 1,
      evidenceSource: displayedEvidence && displayedEvidence.source || "",
      evidenceKind: usePrediction ? "prediction" : displayedEvidence && displayedEvidence.kind || "",
      evidenceRecordId: displayedEvidence && displayedEvidence.recordId || "",
      certainty: usePrediction ? "推定" : (current ? "確定" : "記録待ち"),
      basis: usePrediction && prediction ? `${prediction.basis}・田植日` : (displayedEvidence ? "現地記録" : ""),
      predictedHeadingDate: headingReference && headingReference.date || historicalHeading && historicalHeading.date || "",
      // Read-only layers for compact dashboards. They intentionally reuse
      // existing records and never write a stage back to growthLogs.
      fieldStage: {
        index: fieldStage.index,
        current: fieldStage.current,
        evidence: fieldStageEvidence,
        evidenceKind: latestFieldEvidence && latestFieldEvidence.kind || "",
        evidenceDate: latestFieldEvidence && latestFieldEvidence.date || "",
        recordId: latestFieldEvidence && latestFieldEvidence.recordId || ""
      },
      outlookStage: {
        index: predicted.index,
        current: predicted.current,
        basis: prediction && prediction.basis || "",
        anchorDate: prediction && prediction.date || "",
        certainty: prediction ? "推定" : "記録待ち"
      },
      management: managementStatus(field, date),
      suggested
    };
  }

  RiceOS.agro = {
    progress,
    compactLine,
    panicleEstimate,
    latestPanicleEstimate,
    seasonStageForField,
    managementStatus,
    waterStageContext,
    criticalWaterWindow,
    harvestReferenceFor,
    postHeadingThermalStart,
    waterMovementTimeline,
    SEASON_STAGES
  };
})();
