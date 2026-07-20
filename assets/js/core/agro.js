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

  RiceOS.agro = {
    progress,
    compactLine,
    panicleEstimate,
    latestPanicleEstimate
  };
})();
