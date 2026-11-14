(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const text = value => typeof value === "string" ? value : "";
  const list = value => Array.isArray(value) ? value : [];
  const number = value => ["number", "string"].includes(typeof value) && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const day = value => {
    if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return "";
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : "";
  };
  const days = (start, end) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
  const assessments = { early: "早かった", appropriate: "適期", late: "遅かった", pending: "判断保留" };
  const reasons = { rain: "雨", surface: "圃場の乾き", machine: "機械", schedule: "作業都合", other: "その他" };
  const unavailable = reason => ({ available: false, label: "データ上の参考比較", reason, range: null, offsetDays: null, relation: "unavailable", labelText: "比較できません" });

  function comparison(model, actualDate) {
    if (!model || model.available !== true) return unavailable(text(model && model.reason) || "有効な事前比較の根拠がありません");
    const start = day(model.range && model.range.start), end = day(model.range && model.range.end);
    if (!day(actualDate) || !start || !end || start > end) return unavailable("比較する日付範囲を確認できません");
    const offsetDays = actualDate < start ? days(start, actualDate) : actualDate > end ? days(end, actualDate) : 0;
    return { available: true, label: "データ上の参考比較", reason: "", range: { start, end }, offsetDays,
      relation: offsetDays < 0 ? "before" : offsetDays > 0 ? "after" : "inside",
      labelText: offsetDays < 0 ? `目安期間の開始から${-offsetDays}日前` : offsetDays > 0 ? `目安期間の終了から${offsetDays}日後` : "目安期間の範囲内" };
  }

  function savedThermal(work, fieldId, date) {
    const empty = { available: false, status: "missing", label: "保存された積算温度なし", total: null, count: null, expectedDays: null,
      partial: false, legacy: false, source: "", savedAt: "", retrievedAt: "", headingDate: "", startDate: "", endDate: "" };
    const snapshots = list(work.harvestSnapshots).filter(row => row && row.fieldId === fieldId && row.harvestDate === date);
    if (snapshots.length !== 1) return { ...empty, status: snapshots.length > 1 ? "ambiguous" : "missing", label: snapshots.length > 1 ? "同一圃場・刈取日の保存記録が重複" : empty.label };
    const snapshot = snapshots[0], thermal = snapshot.thermal;
    if (!thermal || typeof thermal !== "object") return empty;
    const total = number(thermal.total), count = number(thermal.count), expectedDays = number(thermal.expectedDays);
    const source = text(thermal.source), headingDate = day(thermal.headingDate), startDate = day(thermal.startDate), endDate = day(thermal.endDate);
    const legacy = thermal.coverageVersion !== 1;
    const meta = { source, savedAt: text(snapshot.savedAt), retrievedAt: text(thermal.retrievedAt), headingDate, startDate, endDate, legacy };
    if (/forecast|seasonal|予報|予測/i.test(`${source} ${text(thermal.status)}`) || date >= R.utils.today()) {
      return { ...empty, ...meta, status: "unavailable", label: "保存された気象実績の根拠が未確認" };
    }
    // Legacy totals remain visible as saved, not as verified coverage or a comparison basis.
    if (legacy && total !== null) {
      const savedCount = Number.isInteger(count) && count >= 0 ? count : null;
      const savedExpected = Number.isInteger(expectedDays) && expectedDays > 0 ? expectedDays : null;
      const partial = thermal.status === "一部欠測" || savedCount !== null && savedExpected !== null && savedCount < savedExpected;
      return { ...empty, ...meta, available: true, status: "legacy", label: "旧保存値（未検証・比較根拠には使用しません）",
        total, count: savedCount, expectedDays: savedExpected, partial };
    }
    if (!/^Open-Meteo Archive(?: \(reanalysis\/model\))?$/.test(source)
      || date >= R.utils.today() || !["確定", "一部欠測"].includes(thermal.status)) {
      return { ...empty, ...meta, status: "unavailable", label: "保存された気象実績の根拠が未確認" };
    }
    const coverage = headingDate && startDate && endDate === date && days(headingDate, startDate) === 1 && startDate <= endDate
      && Number.isInteger(count) && Number.isInteger(expectedDays) && count > 0 && count <= expectedDays && days(startDate, endDate) + 1 === expectedDays;
    if (total === null || !source || !coverage) return { ...empty, ...meta, status: "unavailable", label: "積算値・取得範囲の根拠が未確認" };
    const partial = thermal.status === "一部欠測" || count < expectedDays;
    return { ...empty, ...meta, available: true, status: partial ? "partial" : "complete",
      label: partial ? "一部欠測（取得済み分のみ）" : "保存済み気象実績",
      total, count, expectedDays, partial };
  }

  // DTO strings are plain text, not HTML. No timestamps are synthesized.
  // metrics refer to the entire work, never an allocated per-field share.
  // comparison is a data reference, independent of the operator assessment.
  function describe(work, fieldId) {
    const row = work && typeof work === "object" ? work : {};
    const ids = [...new Set(list(row.fieldIds).filter(id => typeof id === "string" && id))];
    const associated = row.targetScope !== "offField" && /稲刈り|収穫/.test(text(row.workName)) && ids.includes(fieldId);
    const date = day(row.date), shared = ids.length > 1;
    const cropYear = R.state.cropYearForRecord(row);
    const year = R.schema.validCropYear(cropYear) ? String(cropYear) : "";
    const timing = associated && row.harvestTimingByField && row.harvestTimingByField[fieldId] || {};
    const rawReview = associated && row.harvestReview || {};
    const review = R.schema.normalizeHarvestReview(rawReview);
    const code = Object.prototype.hasOwnProperty.call(assessments, text(timing.assessment)) ? text(timing.assessment) : "";
    const assessment = { recorded: Boolean(code), code, label: assessments[code] || "未登録", evaluatedAt: text(timing.evaluatedAt) };
    const delayReason = Object.prototype.hasOwnProperty.call(reasons, text(timing.delayReason)) ? text(timing.delayReason) : "";
    const moisture = number(timing.moisturePct);
    const observations = { shared, scope: shared ? "work-group" : "work-field", scopeLabel: shared ? "選択した圃場に共通の観察（圃場別の評価ではありません）" : "この作業の観察",
      surface: review.surface, traffic: review.traffic, weeds: review.weeds, weedExtent: review.weedExtent, weedImpact: review.weedImpact, weedNote: review.weedNote };
    const kg = number(review.yieldKg), area = number(review.harvestAreaA);
    const kgPer10a = kg !== null && kg >= 0 && area !== null && area > 0 && review.yieldBasis ? kg / area * 10 : null;
    const metrics = { scope: "work", shared, scopeLabel: shared ? "今回の対象圃場合計（圃場別には配分しません）" : "今回の作業",
      kg, areaA: area, basis: review.yieldBasis, kgPer10a: Number.isFinite(kgPer10a) ? kgPer10a : null,
      thermal: associated && date ? savedThermal(row, fieldId, date) : savedThermal({}, fieldId, "") };
    // Only the validated, saved-preharvest state comparison is admissible.
    const matches = associated && date && text(row.workId) && typeof R.state.harvestForecastComparisonFor === "function"
      ? list(R.state.harvestForecastComparisonFor(fieldId)).filter(item => item && item.workId === row.workId && item.actualDate === date) : [];
    const matched = matches.length === 1 ? matches[0] : null;
    const summaryLines = [];
    if (shared && [review.surface, review.traffic, review.weeds, review.weedExtent, review.weedImpact, review.weedNote].some(Boolean)) summaryLines.push(observations.scopeLabel);
    if (code) summaryLines.push(`作業者の評価: ${assessment.label}`);
    if (delayReason) summaryLines.push(`記録された日程の事情: ${reasons[delayReason]}`);
    if (review.surface) summaryLines.push(`${observations.scopeLabel} / 田面: ${review.surface}`);
    if (review.traffic) summaryLines.push(`機械の走行: ${review.traffic}`);
    if (review.weeds) summaryLines.push(`収穫時の残草: ${review.weeds}`);
    if (review.weedExtent) summaryLines.push(`残草の範囲: ${review.weedExtent}`);
    if (review.weedImpact) summaryLines.push(`雑草による作業への影響: ${review.weedImpact}`);
    if (review.weedNote) summaryLines.push(`雑草名・気づき: ${review.weedNote}`);
    if (text(timing.memo)) summaryLines.push(`判断の根拠・追記: ${timing.memo}`);
    if (associated && text(row.memo)) summaryLines.push(`元の作業メモ: ${row.memo}`);
    return { workId: text(row.workId), fieldId: text(fieldId), associated, harvestDate: date, year,
      sourceMemo: associated ? text(row.memo) : "", assessment,
      timing: { idealStartDate: day(timing.idealStartDate), idealEndDate: day(timing.idealEndDate), delayReason,
        delayReasonLabel: reasons[delayReason] || "", memo: text(timing.memo), moisturePct: moisture !== null && moisture >= 0 && moisture <= 100 ? moisture : null, moistureDate: day(timing.moistureDate) },
      observations, metrics, comparison: { day: comparison(matched && matched.dayComparison, date), thermal: comparison(matched && matched.thermalComparison, date) }, summaryLines };
  }
  R.harvestReview = { describe };
})();
