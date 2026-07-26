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

  function latestPanicleEstimate(fieldOrId) {
    const field = fieldOf(fieldOrId);
    if (!field) return null;
    const logs = state().growthLogsFor(field.fieldId)
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
    const plantingDate = field && state().plantingDateForField ? state().plantingDateForField(field.fieldId) : "";
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
    const prefix = `${year}-`;
    return {
      works: state().fieldWorksFor(fieldId).filter((row) => String(row.date || "").startsWith(prefix)),
      growth: state().growthLogsFor(fieldId).filter((row) => String(row.date || "").startsWith(prefix))
    };
  }

  function firstDate(rows) {
    return rows.filter(Boolean).sort()[0] || "";
  }

  function plantingDateInYear(fieldId, year) {
    return firstDate(rowsForYear(fieldId, year).works
      .filter((row) => /田植/.test(String(row.workName || "")))
      .map((row) => row.date));
  }

  function headingDateInYear(fieldId, year, asOfDate) {
    const rows = rowsForYear(fieldId, year);
    const onOrBefore = (row) => !asOfDate || String(row.date || "") <= asOfDate;
    return firstDate([
      ...rows.growth.filter((row) => Boolean(row.headingObserved) && onOrBefore(row)).map((row) => row.date),
      ...rows.works.filter((row) => /出穂/.test(String(row.workName || "")) && onOrBefore(row)).map((row) => row.date)
    ]);
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

  function managementStatus(field, date) {
    const dry = (state().dryPeriodsFor(field.fieldId) || [])
      .filter((row) => String(row.date || row.startDate || "") <= date)
      .slice().sort((a, b) => String(a.date || a.startDate || "").localeCompare(String(b.date || b.startDate || ""))).pop() || null;
    const dryEnd = dry && dry.actualEndDate || field.drainageActualEndDate || "";
    if (dryEnd) return { key: "dryCompleted", label: "中干し完了", tone: "ok", date: dryEnd };
    if (dry && (dry.startDate || dry.status === "実施中")) return { key: "drying", label: "中干し中", tone: "warn", date: dry.startDate || dry.date || "" };
    return { key: "dryWaiting", label: "中干し未実施", tone: "waiting", date: "" };
  }

  // Every screen uses this service so confirmed facts and calendar estimates stay aligned.
  function seasonStageForField(fieldOrId, dateText) {
    const field = fieldOf(fieldOrId);
    const date = dateText || U.today();
    if (!field) return { index: 0, current: null, next: "圃場を選択してください", dap: "", image: 1 };

    const year = String(date).slice(0, 4);
    const beforeOrOn = (row) => String(row.date || "") <= date;
    const works = state().fieldWorksFor(field.fieldId)
      .filter((row) => String(row.date || "").startsWith(`${year}-`) && beforeOrOn(row));
    const growth = state().growthLogsFor(field.fieldId)
      .filter((row) => String(row.date || "").startsWith(`${year}-`) && beforeOrOn(row));
    const plantingRows = works.filter((row) => /田植/.test(String(row.workName || "")));
    const planting = plantingRows.map((row) => row.date).filter(Boolean).sort()[0]
      || (String(field.plantingDate || "").startsWith(`${year}-`) ? field.plantingDate : "");
    const recordedHeadingDate = headingDateInYear(field.fieldId, year, date);
    const dap = planting ? U.daysBetween(planting, date) : "";
    const headingDays = planting && recordedHeadingDate ? U.daysBetween(planting, recordedHeadingDate) : "";
    const headingDate = headingDays !== "" && headingDays >= 70 && headingDays <= 130 ? recordedHeadingDate : "";
    const evidence = [];
    plantingRows.forEach((row) => evidence.push({ date: row.date, key: "establishment", source: "work", recordId: row.workId || "" }));
    growth.forEach((row) => {
      const observed = LEGACY_STAGE[String(row.observedStage || "")] || String(row.observedStage || "");
      if (row.stageConfirmed && STAGE_INDEX[observed]) {
        evidence.push({ date: row.date, key: observed, source: "confirmed", recordId: row.logId || "", correctionReason: row.correctionReason || "" });
        return;
      }
      if (row.headingObserved) evidence.push({ date: row.date, key: "heading", source: "measured", recordId: row.logId || "" });
      else if (Number(row.panicleLengthMm || 0) > 0) evidence.push({ date: row.date, key: panicleStageKey(row.panicleLengthMm), source: "measured", recordId: row.logId || "" });
      else if (row.tillerCount !== undefined && String(row.tillerCount) !== "") evidence.push({ date: row.date, key: "peakTillering", source: "measured", recordId: row.logId || "" });
    });
    works.filter((row) => /出穂/.test(String(row.workName || "")))
      .forEach((row) => evidence.push({ date: row.date, key: "heading", source: "work", recordId: row.workId || "" }));
    works.filter((row) => /稲刈り|収穫/.test(String(row.workName || "")))
      .forEach((row) => evidence.push({ date: row.date, key: "maturity", source: "work", recordId: row.workId || "" }));
    const explicitCorrection = evidence.filter((item) => item.source === "confirmed" && item.correctionReason)
      .sort((a, b) => String(a.date).localeCompare(String(b.date))).pop() || null;
    evidence.sort((a, b) => (STAGE_INDEX[a.key] || 0) - (STAGE_INDEX[b.key] || 0)
      || String(a.date).localeCompare(String(b.date))
      || ({ measured: 1, work: 2, confirmed: 3 }[a.source] - { measured: 1, work: 2, confirmed: 3 }[b.source]));
    const latestEvidence = explicitCorrection || evidence[evidence.length - 1] || null;
    const historicalHeading = !headingDate ? estimatedHeading(field, planting, year) : null;
    const headingReference = headingDate ? { date: headingDate, basis: "今年の出穂日" } : null;
    const prediction = headingReference ? {
      key: estimatedStageKey(U.daysBetween(headingReference.date, date)),
      date: headingReference.date,
      basis: headingReference.basis
    } : (dap === "" ? null : {
      key: fallbackStageFromDap(dap),
      date: "",
      basis: "田植後日数の目安"
    });
    const actual = latestEvidence ? stageFromKey(latestEvidence.key) : stageFromKey("");
    const predicted = prediction ? stageFromKey(prediction.key) : stageFromKey("");
    // Planting establishes the season, but should not freeze a field at 活着期.
    // Any observed growth measurement, confirmed stage, heading work, or harvest work
    // is treated as the current factual stage instead of a calendar estimate.
    const hasDirectStageEvidence = evidence.some((item) => item.source === "measured"
      || item.source === "confirmed"
      || (item.source === "work" && item.key !== "establishment"));
    const usePrediction = !hasDirectStageEvidence && Boolean(prediction)
      && (!actual.index || predicted.index >= actual.index);
    const resolved = usePrediction ? predicted : actual;
    const index = resolved.index;
    let next = "田植え作業を残すと、今年の比較が始まります";
    if (index >= STAGE_INDEX.establishment && index < STAGE_INDEX.panicleInitiation) next = "分げつの様子を記録しましょう";
    if (index >= STAGE_INDEX.panicleInitiation && index < STAGE_INDEX.heading) next = "幼穂長または出穂を確認できたら残しましょう";
    if (index >= STAGE_INDEX.heading && index < STAGE_INDEX.ripening) next = "穂揃いと登熟の様子を現地で確認して残しましょう";
    if (index >= STAGE_INDEX.ripening && index < STAGE_INDEX.maturity) next = "成熟と収穫日を残しましょう";
    if (index === STAGE_INDEX.maturity) next = "収穫日と来年への引き継ぎを残しましょう";
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
      evidenceSource: latestEvidence && latestEvidence.source || "",
      evidenceRecordId: latestEvidence && latestEvidence.recordId || "",
      certainty: usePrediction ? "推定" : (current ? "確定" : "記録待ち"),
      basis: usePrediction && prediction ? `${prediction.basis}・田植日` : (latestEvidence ? "現地記録" : ""),
      predictedHeadingDate: headingReference && headingReference.date || historicalHeading && historicalHeading.date || "",
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
    SEASON_STAGES
  };
})();
