(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const HARVEST_CALIBRATION_POLICY = Object.freeze({ minimumYears: 2, maximumShiftDays: 7, guardDays: 14 });
  const HARVEST_THERMAL_CALIBRATION_POLICY = Object.freeze({ minimumYears: HARVEST_CALIBRATION_POLICY.minimumYears,
    regionalUpperLimit: 1200, sourceUrl: "https://www.pref.fukushima.lg.jp/sec/36210a/suitoukaritori.html",
    sourceUpdatedAt: "2026-09-29", version: "harvest-thermal-calibration-fukushima-20260929-v1",
    label: "福島県2026年9月29日資料に基づく暫定採用制限（全国共通・恒久基準ではありません）。1200℃未満でも適期を保証しません" });

  // Reference metadata is deliberately separate from the calculation. These
  // pages are regional context, never a substitute for a field observation.
  const FUKUSHIMA_SOURCES = [
    { id: "crop", label: "福島県 生育概況", url: "https://www.pref.fukushima.lg.jp/site/fukunou-centre/gijutsu-sakkyou.html", role: "地域の生育傾向" },
    { id: "harvest", label: "福島県 刈取適期情報", url: "https://www.pref.fukushima.lg.jp/sec/36210a/suitoukaritori.html", role: "収穫時期の一般目安" },
    { id: "pest", label: "福島県 病害虫情報", url: "https://www.pref.fukushima.lg.jp/sec/37200b/", role: "病害虫発生予察" }
  ];

  function state() { return RiceOS.state; }
  function agro() { return RiceOS.agro || {}; }
  function yearOf(date) { return String(date || U.today()).slice(0, 4); }
  function dateAdd(date, days) { return date && U.dateAddDays ? U.dateAddDays(date, days) : ""; }
  function validDays(value) { return Number.isFinite(Number(value)) && Number(value) >= 70 && Number(value) <= 130; }

  function seasonalDifference(previous, current) {
    const parse = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
    };
    const prior = parse(previous);
    const actual = parse(current);
    if (!prior || !actual) return "";
    const year = actual.getUTCFullYear();
    const month = prior.getUTCMonth();
    // February 29 compares with February 28 in a non-leap target year.
    const day = Math.min(prior.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    return Math.round((actual.getTime() - Date.UTC(year, month, day)) / 86400000);
  }

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

  function strictDay(value) {
    if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }

  function recordedBy(value, asOf) {
    return typeof value === "string" && strictDay(value.slice(0, 10))
      && Number.isFinite(Date.parse(value)) && value.slice(0, 10) <= asOf;
  }

  function harvestTemperatureProjection(fieldId, options = {}) {
    const asOf = options.asOf === undefined ? U.today() : options.asOf;
    const field = state().field(fieldId);
    const result = { status: "no-heading", reason: "今年の出穂実測が必要です", asOf, headingDate: "", startDate: "", endDate: "",
      total: "", receivedDays: 0, expectedDays: 0, minimum: "", maximum: "", forecastDays: 0, seasonalDays: 0,
      seasonalMinimumYears: 0, seasonalExpectedYears: 0,
      locationKey: typeof options.locationKey === "string" ? options.locationKey : "",
      retrievedAt: typeof options.retrievedAt === "string" ? options.retrievedAt : "",
      historical: { total: "", count: 0, expectedDays: 0, complete: false, missingDates: [], duplicateDates: [], source: "Open-Meteo Archive (reanalysis/model)" },
      thresholds: null, arrivalMinDate: "", arrivalMaxDate: "", range: { start: "", end: "", label: "" },
      generalArrivalMinDate: "", generalArrivalMaxDate: "", generalRange: { start: "", end: "", label: "" },
      trajectory: [], sources: { historical: [], forecast: [], seasonal: [] }, stoppedAt: "", engineVersion: "harvest-temperature-projection-v1" };
    if (!strictDay(asOf) || asOf > U.today()) { result.status = "invalid-as-of"; result.reason = "基準日は実在する今日以前の日付が必要です"; return result; }
    if (!field) { result.status = "no-field"; result.reason = "対象の圃場が見つかりません"; return result; }
    const year = yearOf(asOf);
    const actual = state().harvestStatusForField(fieldId, year, asOf);
    if (actual.harvested && strictDay(actual.date)) {
      result.status = "not-applicable"; result.reason = "保存済みの刈取実績を優先します";
      result.harvestStatus = actual.status; result.actualDate = actual.date;
      result.range = dateRange(actual.date); return result;
    }
    const location = (state().data().meta || {}).weatherLocation;
    if (!location || typeof location.latitude !== "number" || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
      || typeof location.longitude !== "number" || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
      || options.locationKey !== `${location.latitude}|${location.longitude}`) {
      result.status = "location-mismatch"; result.reason = "気象取得地点が現在の設定と一致しません"; return result;
    }
    if (options.contextAsOf !== undefined && options.contextAsOf !== asOf) {
      result.status = "stale-context"; result.reason = "気象取得の基準日が表示日と一致しません"; return result;
    }
    const headings = [...new Set((state().data().growthLogs || []).filter(row => row.fieldId === fieldId && row.headingObserved === true
      && strictDay(row.date) && yearOf(row.date) === year && row.date <= asOf).map(row => row.date))];
    if (headings.length > 1) { result.status = "heading-conflict"; result.reason = "今年の出穂実測に異なる日付が複数あります"; return result; }
    if (!headings.length) return result;
    result.headingDate = headings[0];
    result.startDate = agro().postHeadingThermalStart ? agro().postHeadingThermalStart(headings[0]) : dateAdd(headings[0], 1);
    const reference = heatTarget(field);
    const dayBasis = harvestCalibration(field, asOf, { kind: "actual", date: headings[0] }, { kind: "heading" },
      { start: dateAdd(headings[0], reference.daysMin), end: dateAdd(headings[0], reference.daysMax), label: "" });
    result.thermalCalibration = harvestThermalCalibration(field, asOf, dayBasis);
    const minimum = result.thermalCalibration.minimum; const maximum = result.thermalCalibration.maximum;
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum || !strictDay(result.startDate)) {
      result.status = "invalid-reference"; result.reason = "出穂翌日と一般積算目安を確認してください"; return result;
    }
    result.thresholds = { minimum, maximum,
      source: result.thermalCalibration.status === "applied" ? "一般目安と同一圃場の過去年Archive積算 / 暫定参考" : reference.source || "",
      label: result.thermalCalibration.status === "applied" ? "一般目安と過去年積算の参考範囲" : reference.label || "" };
    result.minimum = minimum; result.maximum = maximum; result.endDate = dateAdd(asOf, -1);
    const buckets = new Map();
    for (const row of Array.isArray(options.rows) ? options.rows : []) {
      if (!row || !strictDay(row.date) || typeof row.tempMean !== "number" || !Number.isFinite(row.tempMean)
        || typeof row.source !== "string" || !row.source.trim() || !["historical", "forecast", "seasonal"].includes(row.basis)) continue;
      const expectedBasis = row.date < asOf ? "historical" : row.date <= dateAdd(asOf, 6) ? "forecast" : "seasonal";
      if (row.basis !== expectedBasis || row.date < result.startDate || row.date > dateAdd(asOf, 120)) continue;
      if (row.basis === "historical" && (row.source !== "Open-Meteo Archive" || /forecast|seasonal/i.test(`${row.dataset || ""} ${row.model || ""}`))) continue;
      if (row.basis === "forecast" && row.source !== "Open-Meteo Forecast") continue;
      if (row.basis === "seasonal" && (row.source !== "Open-Meteo prior-year daily seasonal reference (reanalysis/model)"
        || !Number.isInteger(row.count) || !Number.isInteger(row.expectedYears) || row.count < 1
        || row.count > row.expectedYears || row.expectedYears > 5)) continue;
      if (!buckets.has(row.date)) buckets.set(row.date, []);
      buckets.get(row.date).push({ date: row.date, tempMean: row.tempMean, basis: row.basis, source: row.source,
        ...(typeof row.model === "string" ? { model: row.model } : {}),
        ...(typeof row.timezone === "string" ? { timezone: row.timezone } : {}),
        ...(row.basis === "seasonal" ? { count: row.count, expectedYears: row.expectedYears,
          basedOn: Array.isArray(row.basedOn) ? row.basedOn.filter(item => item && strictDay(item.date)
            && typeof item.tempMean === "number" && Number.isFinite(item.tempMean) && item.source === "Open-Meteo Archive")
            .map(item => ({ date: item.date, tempMean: item.tempMean, source: item.source,
              ...(typeof item.model === "string" ? { model: item.model } : {}),
              ...(typeof item.timezone === "string" ? { timezone: item.timezone } : {}) })) : [] } : {}) });
    }
    const sources = { historical: new Set(), forecast: new Set(), seasonal: new Set() };
    const finishSources = () => {
      result.total = result.historical.total; result.receivedDays = result.historical.count; result.expectedDays = result.historical.expectedDays;
      result.forecastDays = result.trajectory.filter(row => row.basis === "forecast").length;
      result.seasonalDays = result.trajectory.filter(row => row.basis === "seasonal").length;
      const seasonal = result.trajectory.filter(row => row.basis === "seasonal");
      result.seasonalMinimumYears = seasonal.length ? Math.min(...seasonal.map(row => row.count)) : 0;
      result.seasonalExpectedYears = seasonal.length ? Math.max(...seasonal.map(row => row.expectedYears)) : 0;
      Object.keys(sources).forEach(key => { result.sources[key] = [...sources[key]].sort(); });
      result.range = { start: result.arrivalMinDate, end: result.arrivalMaxDate,
        label: result.arrivalMinDate && result.arrivalMaxDate ? `${U.fd(result.arrivalMinDate)}〜${U.fd(result.arrivalMaxDate)}` : "" };
      result.generalRange = { start: result.generalArrivalMinDate, end: result.generalArrivalMaxDate,
        label: result.generalArrivalMinDate && result.generalArrivalMaxDate ? `${U.fd(result.generalArrivalMinDate)}〜${U.fd(result.generalArrivalMaxDate)}` : "" };
      return result;
    };
    let historicalTotal = 0;
    const historicalRows = [];
    for (let date = result.startDate; date < asOf; date = dateAdd(date, 1)) {
      result.historical.expectedDays++;
      const rows = buckets.get(date) || [];
      if (rows.length !== 1) {
        result.historical.missingDates.push(date);
        if (rows.length > 1) result.historical.duplicateDates.push(date);
        continue;
      }
      historicalRows.push(rows[0]); historicalTotal += rows[0].tempMean;
      sources.historical.add(rows[0].source); result.historical.count++;
    }
    result.historical.total = result.historical.count ? Math.round(historicalTotal * 10) / 10 : "";
    result.historical.complete = result.historical.count === result.historical.expectedDays;
    if (!result.historical.complete) {
      result.status = "historical-missing"; result.reason = "過去気象に欠測・重複があるため到達日は算出しません";
      result.stoppedAt = result.historical.missingDates[0]; return finishSources();
    }
    let total = 0;
    const accumulate = row => {
      total += row.tempMean;
      result.trajectory.push({ ...row, total: Math.round(total * 10) / 10 });
      sources[row.basis].add(row.source);
      if (!result.arrivalMinDate && total >= minimum) result.arrivalMinDate = row.date;
      if (!result.arrivalMaxDate && total >= maximum) result.arrivalMaxDate = row.date;
      if (!result.generalArrivalMinDate && total >= Number(reference.minimum)) result.generalArrivalMinDate = row.date;
      if (!result.generalArrivalMaxDate && total >= Number(reference.maximum)) result.generalArrivalMaxDate = row.date;
    };
    historicalRows.forEach(accumulate);
    for (let date = result.startDate > asOf ? result.startDate : asOf; !result.arrivalMaxDate && date <= dateAdd(asOf, 120); date = dateAdd(date, 1)) {
      const rows = buckets.get(date) || [];
      if (rows.length !== 1) {
        result.status = "future-missing"; result.reason = "予報・季節参考の日付が不足または重複しているため、その日で計算を止めました";
        result.stoppedAt = date; return finishSources();
      }
      accumulate(rows[0]);
    }
    result.status = result.arrivalMaxDate ? "projected" : "not-reached";
    result.reason = result.arrivalMaxDate ? result.arrivalMaxDate < asOf
      ? "昨日までのArchive取得値が一般積算目安に到達しています。刈取適期の確定ではありません"
      : "一般積算目安への参考到達日です。予報または季節参考を含みます"
      : "120日以内に一般積算目安へ到達しませんでした";
    return finishSources();
  }

  function thermalProjectionBasis(projection) {
    const { trajectory, historical, ...summary } = projection;
    const evidence = JSON.stringify(trajectory);
    let hash = 2166136261;
    for (let i = 0; i < evidence.length; i++) hash = Math.imul(hash ^ evidence.charCodeAt(i), 16777619) >>> 0;
    return U.clone({ ...summary,
      historical: { total: historical.total, count: historical.count, expectedDays: historical.expectedDays,
        complete: historical.complete, source: historical.source,
        missingDays: historical.missingDates.length, duplicateDays: historical.duplicateDates.length },
      trajectoryDays: trajectory.length,
      trajectoryFingerprint: `thermal-trajectory-v1-${hash.toString(16).padStart(8, "0")}` });
  }

  function harvestCalibration(field, asOf, heading, harvest, baseRange) {
    const policyVersion = "harvest-calibration-v1";
    const result = { status: "not-applicable", reason: "今年の出穂実測後・未収穫時だけ補正します", shiftDays: 0,
      baseRange: U.clone(baseRange), range: U.clone(baseRange), accepted: [], excluded: [], policyVersion,
      policy: { ...HARVEST_CALIBRATION_POLICY }, fingerprint: "" };
    const policy = HARVEST_CALIBRATION_POLICY;
    const reference = heatTarget(field);
    const min = Number(reference.daysMin); const max = Number(reference.daysMax);
    const rows = state().harvestTimingComparisonFor ? state().harvestTimingComparisonFor(field.fieldId) : [];
    const year = yearOf(asOf);
    const currentHeadings = (state().data().growthLogs || []).filter(row => row.fieldId === field.fieldId
      && row.headingObserved === true && strictDay(row.date) && yearOf(row.date) === year && row.date <= asOf);
    const candidates = [];
    const finish = () => {
      const text = JSON.stringify({ ...result, fieldId: field.fieldId, varietyId: field.varietyId || "", asOf, headingDate: heading.date, reference: { min, max } });
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
      result.fingerprint = `${policyVersion}-${hash.toString(16).padStart(8, "0")}`;
      return result;
    };
    if (!strictDay(asOf) || asOf > U.today()) { result.reason = "基準日は実在する今日以前の日付が必要です"; return finish(); }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || min > max) { result.reason = "一般目安の範囲を確認してください"; return finish(); }
    if (new Set(currentHeadings.map(row => row.date)).size > 1) {
      result.reason = "今年の出穂実測に異なる日付が複数あるため補正しません";
      return finish();
    }
    if (heading.kind !== "actual" || !strictDay(heading.date) || !currentHeadings.some(row => row.date === heading.date)) return finish();
    if (harvest.kind === "actual" || rows.some(row => row.season === year && row.actualDate <= asOf)) {
      result.reason = "今年の刈取実績があるため補正しません"; return finish();
    }
    rows.forEach(row => {
      let reason = "";
      let start = row.idealStartDate; let end = row.idealEndDate;
      if (!start && !end && row.assessment === "appropriate") start = end = row.actualDate;
      else { start = start || end; end = end || start; }
      const headingDate = row.observedHeadingDate;
      const daysMin = strictDay(start) && strictDay(headingDate) ? Number(U.daysBetween(headingDate, start)) : NaN;
      const daysMax = strictDay(end) && strictDay(headingDate) ? Number(U.daysBetween(headingDate, end)) : NaN;
      if (row.season >= year || row.actualDate > asOf) reason = "過去年の実績ではありません";
      else if (!["early", "appropriate", "late"].includes(row.assessment)) reason = "収穫時期の評価が未確定です";
      else if (row.harvestStatus !== "complete") reason = "圃場の刈取完了が明示されていません";
      else if (!recordedBy(row.evaluatedAt, asOf)) reason = "評価日時が不明または基準日より後です";
      else if (row.varietySource !== "assessment-current-master" || !field.varietyId || row.varietyId !== field.varietyId) reason = "評価時の品種参照が一致しません";
      else if (!strictDay(headingDate) || row.headingObservationCount !== 1) reason = "その年の出穂実測が一意に確認できません";
      else if (!strictDay(start) || !strictDay(end) || start > end || end > asOf || daysMin < 0 || daysMin > daysMax) reason = "理想期間と出穂日を確認してください";
      else if (row.assessment === "early" && start <= row.actualDate || row.assessment === "late" && end >= row.actualDate
        || row.assessment === "appropriate" && (start > row.actualDate || end < row.actualDate)) reason = "評価と理想期間が一致しません";
      else if (daysMin < min - policy.guardDays || daysMax > max + policy.guardDays) reason = `一般目安の前後${policy.guardDays}日以内の範囲を外れています`;
      const evidence = { workId: row.workId, season: row.season, headingDate: headingDate || "", actualDate: row.actualDate,
        idealStartDate: start || "", idealEndDate: end || "", daysMin: Number.isFinite(daysMin) ? daysMin : "",
        daysMax: Number.isFinite(daysMax) ? daysMax : "", evaluatedAt: row.evaluatedAt, varietyId: row.varietyId,
        varietySource: row.varietySource, assessment: row.assessment };
      if (reason) result.excluded.push({ ...evidence, reason });
      else candidates.push({ row, evidence });
    });
    candidates.forEach(candidate => {
      if (candidates.filter(other => other.evidence.season === candidate.evidence.season).length > 1) {
        result.excluded.push({ ...candidate.evidence, reason: "同じ年に複数の採用候補があるため全件除外します" });
      } else result.accepted.push(candidate.evidence);
    });
    result.excluded.sort((a, b) => a.season.localeCompare(b.season) || a.workId.localeCompare(b.workId));
    if (result.accepted.length < policy.minimumYears) { result.status = "insufficient"; result.reason = `異なる年の採用可能な評価が${policy.minimumYears}年分必要です`; return finish(); }
    const centers = result.accepted.map(row => (row.daysMin + row.daysMax) / 2).sort((a, b) => a - b);
    const middle = Math.floor(centers.length / 2);
    const center = centers.length % 2 ? centers[middle] : (centers[middle - 1] + centers[middle]) / 2;
    const shift = Math.max(-policy.maximumShiftDays, Math.min(policy.maximumShiftDays, Math.round(center - (min + max) / 2)));
    const starts = [baseRange.start, dateAdd(heading.date, min + shift), ...result.accepted.map(row => dateAdd(heading.date, row.daysMin))];
    const ends = [baseRange.end, dateAdd(heading.date, max + shift), ...result.accepted.map(row => dateAdd(heading.date, row.daysMax))];
    const start = starts.sort()[0]; const end = ends.sort().at(-1);
    if (!strictDay(baseRange.start) || !strictDay(baseRange.end) || start < dateAdd(heading.date, min - policy.guardDays)
      || end > dateAdd(heading.date, max + policy.guardDays) || start > baseRange.start || end < baseRange.end) {
      result.reason = "一般目安の前後範囲と既存範囲の保持を両立できないため補正しません"; return finish();
    }
    result.status = "applied"; result.reason = "同一圃場・品種参照一致の過去年評価による暫定補正です";
    result.shiftDays = shift; result.range = { start, end, label: `${U.fd(start)}〜${U.fd(end)}` };
    const totals = candidates.filter(item => result.accepted.some(row => row.workId === item.row.workId)).flatMap(item => {
      const thermal = item.row.idealThermal;
      if (!thermal || !thermal.current || !recordedBy(thermal.retrievedAt, asOf)) return [];
      return thermal.endpoints.filter(row => row.status === "complete" && row.source === "Open-Meteo Archive (reanalysis/model)"
        && typeof row.total === "number" && Number.isFinite(row.total) && row.date <= asOf).map(row => row.total);
    });
    if (totals.length) result.thermalReference = { minimum: Math.min(...totals), maximum: Math.max(...totals), count: totals.length,
      source: "Open-Meteo Archive (reanalysis/model) / 暫定参考・予測日計算には不使用" };
    return finish();
  }

  function harvestThermalCalibration(field, asOf, dayCalibration) {
    const reference = heatTarget(field);
    const baseRange = { minimum: Number(reference.minimum), maximum: Number(reference.maximum) };
    const result = { status: "insufficient", reason: "完全な積算根拠が異なる過去年2年分必要です",
      ...baseRange, baseRange, range: { ...baseRange }, accepted: [],
      excluded: dayCalibration.excluded.map(row => ({ workId: row.workId, season: row.season, reason: row.reason, stage: "day-guard" })),
      policy: { ...HARVEST_THERMAL_CALIBRATION_POLICY },
      policyVersion: HARVEST_THERMAL_CALIBRATION_POLICY.version, fingerprint: "" };
    const finish = () => {
      const text = JSON.stringify({ ...result, fieldId: field.fieldId, asOf });
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
      result.fingerprint = `${result.policyVersion}-${hash.toString(16).padStart(8, "0")}`;
      return result;
    };
    if (dayCalibration.status === "not-applicable") {
      result.status = "not-applicable"; result.reason = dayCalibration.reason; return finish();
    }
    if (!Number.isFinite(result.minimum) || result.minimum <= 0 || !Number.isFinite(result.maximum) || result.maximum < result.minimum) {
      result.status = "not-applicable"; result.reason = "一般積算目安を確認してください"; return finish();
    }
    const rows = state().harvestTimingComparisonFor(field.fieldId);
    const locationToken = JSON.stringify((state().data().meta || {}).weatherLocation || null);
    const archive = "Open-Meteo Archive (reanalysis/model)";
    for (const evidence of dayCalibration.accepted) {
      const row = rows.find(item => item.workId === evidence.workId);
      const thermal = row && row.idealThermal;
      const dates = [...new Set([evidence.idealStartDate, evidence.idealEndDate])].sort();
      let reason = "";
      if (!thermal || !thermal.current) reason = "積算根拠が未取得または条件変更されています";
      else if (!recordedBy(thermal.retrievedAt, asOf)) reason = "取得日時が不明または基準日より後です";
      else if (thermal.headingDate !== evidence.headingDate || thermal.startDate !== dateAdd(evidence.headingDate, 1)
        || thermal.locationToken !== locationToken || thermal.source !== archive) reason = "出穂日・開始日・取得地点・出典が一致しません";
      const endpoints = dates.map(date => thermal && (thermal.endpoints || []).filter(item => item.date === date));
      if (!reason && endpoints.some((matches, index) => {
        const endpoint = matches[0]; const expected = Number(U.daysBetween(evidence.headingDate, dates[index]));
        return matches.length !== 1 || endpoint.status !== "complete" || endpoint.source !== archive
          || typeof endpoint.total !== "number" || !Number.isFinite(endpoint.total) || endpoint.total <= 0
          || !Number.isInteger(endpoint.count) || endpoint.count !== expected || endpoint.expectedDays !== expected || expected <= 0;
      })) reason = "理想期間の全端点に完全なArchive積算が必要です";
      const totals = !reason ? endpoints.map(matches => matches[0].total) : [];
      if (!reason && totals.some((value, index) => index > 0 && value < totals[index - 1])) reason = "期間の始点と終点の積算が逆転しています";
      if (!reason && totals.some(value => value >= result.policy.regionalUpperLimit)) reason = "福島県資料に基づく暫定採用制限により、1200℃以上の端点がある年は全体を除外します";
      if (reason) result.excluded.push({ workId: evidence.workId, season: evidence.season, reason });
      else result.accepted.push({ workId: evidence.workId, season: evidence.season, headingDate: evidence.headingDate,
        idealStartDate: evidence.idealStartDate, idealEndDate: evidence.idealEndDate,
        startDate: thermal.startDate, retrievedAt: thermal.retrievedAt, locationToken, source: archive,
        minimum: Math.min(...totals), maximum: Math.max(...totals),
        endpoints: endpoints.map(matches => ({ date: matches[0].date, total: matches[0].total, count: matches[0].count, expectedDays: matches[0].expectedDays })) });
    }
    if (new Set(result.accepted.map(row => row.season)).size < result.policy.minimumYears) return finish();
    result.status = "applied"; result.reason = "同一圃場の完全な過去年積算と一般目安を合わせた暫定参考です";
    result.minimum = Math.min(baseRange.minimum, ...result.accepted.map(row => row.minimum));
    result.maximum = Math.max(baseRange.maximum, ...result.accepted.map(row => row.maximum));
    result.range = { minimum: result.minimum, maximum: result.maximum };
    return finish();
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
    const harvestStatus = state().harvestStatusForField(field.fieldId, year, asOf);
    const harvestActual = harvestStatus.harvested ? harvestStatus.date : "";
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
    if (harvestActual) harvest = { kind: "actual", date: harvestActual, range: dateRange(harvestActual), label: harvestStatus.status === "legacy" ? "完了区分未確認" : "収穫完了", source: "今年の収穫日" };
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
    const calibration = harvestCalibration(field, asOf, heading, harvest, harvest.range);
    const thermalCalibration = harvestThermalCalibration(field, asOf, calibration);
    if (calibration.status === "applied") {
      harvest = { ...harvest, date: dateAdd(harvest.date, calibration.shiftDays), range: U.clone(calibration.range),
        source: `${harvest.source} / 圃場過去評価の暫定補正` };
    }
    // A heading observation confirms heading, not the later harvest window.
    // Keep the card confidence conservative until harvest itself is recorded.
    const confidenceKey = harvest.kind === "actual" ? "high" : heading.kind === "actual" || heading.kind === "panicle" ? "medium" : heading.date ? "low" : "missing";
    const difference = sameField ? seasonalDifference(sameField.heading, heading.date) : "";
    const weather = opts.weather || null;
    const thermalProjection = weather && weather.thermal ? harvestTemperatureProjection(fieldId,
      { ...weather.thermal, contextAsOf: weather.thermal.asOf, asOf }) : null;
    const sources = [
      source("current", "今年実測", headingActual || harvestActual ? 5 : panicle && panicle.supported ? 3 : 0, headingActual ? `出穂日 ${U.fd(headingActual)}` : panicle && panicle.supported ? `幼穂長 ${panicle.lengthMm}mm` : "未記録", headingActual || harvestActual || panicle && panicle.supported),
      source("fieldPrevious", "前年圃場実績", sameField ? 3 : 0, sameField ? `前年品種は当時の記録で未確認 / 田植え後 ${sameField.days}日で出穂` : "前年実績なし", sameField),
      source("varietyPrevious", "現在の同品種の前年実績", sameVariety ? 2 : 0, sameVariety ? `${sameVariety.count}圃場の中央値: 田植え後 ${sameVariety.days}日` : "同品種実績なし", sameVariety),
      source("fukushima", "福島県情報", 2, `${heatTarget(field).label}を収穫目安の参考に表示`, true),
      source("weather", "気象データ", weather && weather.available ? 2 : 0, weather && weather.detail || "未取得", Boolean(weather && weather.available)),
      source("normal", "同時期の平均気温", weather && weather.normalAvailable ? 1 : 0, weather && weather.normalDetail || "未取得", Boolean(weather && weather.normalAvailable))
    ];
    return {
      field, asOf, planting, stage, water, heading, harvest, calibration, thermalCalibration, thermalProjection, sources, confidence: confidence(confidenceKey),
      difference: difference === "" ? "" : Number(difference),
      regional: { variety: varietyName(field), harvestTarget: heatTarget(field), sources: FUKUSHIMA_SOURCES },
      missing: !heading.date ? "予測精度を上げるには、幼穂長または出穂日の記録が必要です。" : "",
      snapshot: {
        fieldId: field.fieldId,
        season: year,
        asOf,
        engineVersion: "outlook-v2-harvest-calibration",
        headingDate: heading.date,
        headingKind: heading.kind,
        harvestDate: harvest.date,
        harvestKind: harvest.kind,
        harvestRange: { start: harvest.range.start, end: harvest.range.end },
        confidence: confidenceKey,
        actualHeadingDate: headingActual || "",
        actualHarvestDate: harvestActual || "",
        basis: {
          growthLogId: summary.panicleLog && summary.panicleLog.logId || "",
          previousFieldSeason: sameField ? String(Number(year) - 1) : "",
          previousVarietyCount: sameVariety ? sameVariety.count : 0,
          weatherAsOf: weather && weather.asOf || "",
          harvestCalibration: U.clone(calibration),
          thermalCalibration: U.clone(thermalCalibration),
          ...(thermalProjection ? { thermalProjection: thermalProjectionBasis(thermalProjection) } : {})
        }
      }
    };
  }

  function all(options) {
    return state().activeFields().map((field) => forField(field.fieldId, options)).filter(Boolean);
  }

  RiceOS.outlook = { all, forField, FUKUSHIMA_SOURCES, HARVEST_CALIBRATION_POLICY, HARVEST_THERMAL_CALIBRATION_POLICY, harvestTemperatureProjection };
})();
