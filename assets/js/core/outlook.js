(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  // Reference metadata is deliberately separate from the calculation. These
  // pages are regional context, never a substitute for a field observation.
  const FUKUSHIMA_SOURCES = [
    { id: "crop", label: "福島県 生育概況", url: "https://www.pref.fukushima.lg.jp/site/fukunou-centre/gijutsu-sakkyou.html", role: "地域の生育傾向" },
    { id: "harvest", label: "福島県 刈取適期情報", url: "https://www.pref.fukushima.lg.jp/sec/36210a/r7-suitoukaritori.html", role: "収穫時期の一般目安" },
    { id: "pest", label: "福島県 病害虫情報", url: "https://www.pref.fukushima.lg.jp/sec/37200b/", role: "病害虫発生予察" }
  ];

  function state() { return RiceOS.state; }
  function agro() { return RiceOS.agro || {}; }
  function yearOf(date) { return String(date || U.today()).slice(0, 4); }
  function dateAdd(date, days) { return date && U.dateAddDays ? U.dateAddDays(date, days) : ""; }
  function validDays(value) { return Number.isFinite(Number(value)) && Number(value) >= 70 && Number(value) <= 130; }

  function median(values) {
    const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!rows.length) return "";
    const middle = Math.floor(rows.length / 2);
    return rows.length % 2 ? rows[middle] : Math.round((rows[middle - 1] + rows[middle]) / 2);
  }

  function varietyName(field) {
    const variety = field && field.varietyId ? state().variety(field.varietyId) : null;
    return String(variety && variety.name || "未設定");
  }

  function workDate(fieldId, year, asOf, matcher) {
    return state().fieldWorksFor(fieldId, year)
      .filter((row) => state().isActualFieldWork(row))
      .filter((row) => String(row.date || "") <= String(asOf || U.today()))
      .filter((row) => matcher.test(String(row.workName || "")))
      .map((row) => String(row.date || ""))
      .filter(Boolean)
      .sort()[0] || "";
  }

  function previousFieldHeading(field, planting, year) {
    const previousYear = String(Number(year) - 1);
    const previousPlanting = state().plantingDateForField(field.fieldId, previousYear);
    const previousHeading = state().headingDateForField(field.fieldId, previousYear);
    const days = previousPlanting && previousHeading ? U.daysBetween(previousPlanting, previousHeading) : "";
    return validDays(days) ? {
      days: Number(days), date: dateAdd(planting, Number(days)), heading: previousHeading
    } : null;
  }

  function previousVarietyHeading(field, planting, year) {
    if (!field || !field.varietyId || !planting) return null;
    const previousYear = String(Number(year) - 1);
    const values = state().fields().filter((item) => item.fieldId !== field.fieldId && item.varietyId === field.varietyId)
      .map((item) => {
        const start = state().plantingDateForField(item.fieldId, previousYear);
        const heading = state().headingDateForField(item.fieldId, previousYear);
        return start && heading ? U.daysBetween(start, heading) : "";
      }).filter(validDays).map(Number);
    const days = median(values);
    return days === "" ? null : { days, count: values.length, date: dateAdd(planting, days) };
  }

  function heatTarget(field) {
    if (agro().harvestReferenceFor) return agro().harvestReferenceFor(field);
    return { target: 1000, minimum: 1000, maximum: 1000, daysMin: 40, daysMax: 50, label: "1,000℃前後", source: "一般的な目安" };
  }

  function dateRange(date, padding) {
    if (!date) return { start: "", end: "", label: "" };
    const width = Number(padding || 0);
    const start = width ? dateAdd(date, -width) : date;
    const end = width ? dateAdd(date, width) : date;
    return { start, end, label: width ? `${U.fd(start)}〜${U.fd(end)}` : U.fd(date) };
  }

  function source(key, label, strength, detail, available) {
    return { key, label, strength, detail, available: Boolean(available) };
  }

  function confidence(key) {
    const rows = {
      high: { key: "high", label: "高", detail: "今年の実測を根拠にしています" },
      medium: { key: "medium", label: "中", detail: "今年の幼穂長と前年実績を根拠にしています" },
      low: { key: "low", label: "低", detail: "前年実績を中心にした参考値です" },
      missing: { key: "missing", label: "記録不足", detail: "予測に必要な記録が不足しています" }
    };
    return rows[key] || rows.missing;
  }

  function forField(fieldId, options) {
    const opts = options || {};
    const asOf = String(opts.asOf || U.today());
    const field = state().field(fieldId);
    if (!field) return null;
    const year = yearOf(asOf);
    const planting = state().plantingDateForField(field.fieldId, year);
    const summary = state().growthSummaryFor(field.fieldId, year, { asOfDate: asOf });
    const headingActual = summary.headingDate || state().headingDateForField(field.fieldId, year, asOf);
    const harvestActual = workDate(field.fieldId, year, asOf, /稲刈り|収穫/);
    const panicle = !headingActual && summary.panicleLog && agro().panicleEstimate
      ? agro().panicleEstimate(field, summary.panicleLog.panicleLengthMm, summary.panicleLog.date)
      : null;
    const sameField = previousFieldHeading(field, planting, year);
    const sameVariety = previousVarietyHeading(field, planting, year);
    const stage = agro().seasonStageForField ? agro().seasonStageForField(field, asOf) : { current: null, certainty: "記録待ち" };
    const water = agro().managementStatus ? agro().managementStatus(field, asOf) : { label: "水管理は未記録" };
    let heading = { kind: "missing", date: "", range: dateRange(""), label: "記録不足", source: "" };
    if (headingActual) heading = { kind: "actual", date: headingActual, range: dateRange(headingActual), label: "実測済", source: "今年の出穂日" };
    else if (panicle && panicle.supported && panicle.date) {
      heading = {
        kind: "panicle", date: panicle.date,
        range: { start: panicle.rangeStart, end: panicle.rangeEnd, label: `${U.fd(panicle.rangeStart)}〜${U.fd(panicle.rangeEnd)}` },
        label: "幼穂長からの見通し", source: panicle.source
      };
    } else if (sameField && sameField.date) {
      heading = { kind: "fieldPrevious", date: sameField.date, range: dateRange(sameField.date, 4), label: "前年圃場からの見通し", source: "前年の同一圃場" };
    } else if (sameVariety && sameVariety.date) {
      heading = { kind: "varietyPrevious", date: sameVariety.date, range: dateRange(sameVariety.date, 6), label: "同品種前年からの見通し", source: "同品種の前年実績" };
    }
    let harvest = { kind: "missing", date: "", range: dateRange(""), label: "記録不足", source: "" };
    if (harvestActual) harvest = { kind: "actual", date: harvestActual, range: dateRange(harvestActual), label: "実測済", source: "今年の収穫日" };
    else if (heading.date) {
      const reference = heatTarget(field);
      const date = dateAdd(heading.date, Math.round((reference.daysMin + reference.daysMax) / 2));
      harvest = {
        kind: heading.kind === "actual" ? "heading" : "estimatedHeading",
        date,
        range: { start: dateAdd(heading.date, reference.daysMin), end: dateAdd(heading.date, reference.daysMax), label: `${U.fd(dateAdd(heading.date, reference.daysMin))}〜${U.fd(dateAdd(heading.date, reference.daysMax))}` },
        label: "出穂日を基準にした参考",
        source: `出穂後${reference.daysMin}〜${reference.daysMax}日 / ${reference.label}`
      };
    }
    // A heading observation confirms heading, not the later harvest window.
    // Keep the card confidence conservative until harvest itself is recorded.
    const confidenceKey = harvest.kind === "actual" ? "high" : heading.kind === "actual" || heading.kind === "panicle" ? "medium" : heading.date ? "low" : "missing";
    const difference = heading.date && sameField && sameField.heading ? U.daysBetween(sameField.heading, heading.date) : "";
    const weather = opts.weather || null;
    const sources = [
      source("current", "今年実測", headingActual || harvestActual ? 5 : panicle && panicle.supported ? 3 : 0, headingActual ? `出穂日 ${U.fd(headingActual)}` : panicle && panicle.supported ? `幼穂長 ${panicle.lengthMm}mm` : "未記録", headingActual || harvestActual || panicle && panicle.supported),
      source("fieldPrevious", "前年圃場実績", sameField ? 3 : 0, sameField ? `前年品種は当時の記録で未確認 / 田植え後 ${sameField.days}日で出穂` : "前年実績なし", sameField),
      source("varietyPrevious", "現在の同品種の前年実績", sameVariety ? 2 : 0, sameVariety ? `${sameVariety.count}圃場の中央値: 田植え後 ${sameVariety.days}日` : "同品種実績なし", sameVariety),
      source("fukushima", "福島県情報", 2, `${heatTarget(field).label}を収穫目安の参考に表示`, true),
      source("weather", "気象データ", weather && weather.available ? 2 : 0, weather && weather.detail || "未取得", Boolean(weather && weather.available)),
      source("normal", "同時期の平均気温", weather && weather.normalAvailable ? 1 : 0, weather && weather.normalDetail || "未取得", Boolean(weather && weather.normalAvailable))
    ];
    return {
      field, asOf, planting, stage, water, heading, harvest, sources, confidence: confidence(confidenceKey),
      difference: difference === "" ? "" : Number(difference),
      regional: { variety: varietyName(field), harvestTarget: heatTarget(field), sources: FUKUSHIMA_SOURCES },
      missing: !heading.date ? "予測精度を上げるには、幼穂長または出穂日の記録が必要です。" : "",
      snapshot: {
        fieldId: field.fieldId,
        season: year,
        asOf,
        engineVersion: "outlook-v1",
        headingDate: heading.date,
        headingKind: heading.kind,
        harvestDate: harvest.date,
        harvestKind: harvest.kind,
        confidence: confidenceKey,
        actualHeadingDate: headingActual || "",
        actualHarvestDate: harvestActual || "",
        basis: {
          growthLogId: summary.panicleLog && summary.panicleLog.logId || "",
          previousFieldSeason: sameField ? String(Number(year) - 1) : "",
          previousVarietyCount: sameVariety ? sameVariety.count : 0,
          weatherAsOf: weather && weather.asOf || ""
        }
      }
    };
  }

  function all(options) {
    return state().activeFields().map((field) => forField(field.fieldId, options)).filter(Boolean);
  }

  RiceOS.outlook = { all, forField, FUKUSHIMA_SOURCES };
})();
