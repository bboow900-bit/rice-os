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
    compactLine
  };
})();
