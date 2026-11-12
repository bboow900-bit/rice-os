(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const blank = v => v == null || typeof v === "string" && !v.trim();
  const num = v => !blank(v) && ["string","number"].includes(typeof v) && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v).trim()) && Number.isFinite(Number(v)) ? Number(v) : null;
  const day = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0,10) === d;
  const year = d => Number(String(d).slice(0,4));
  const days = (a,b) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000;
  const add = (d,n) => day(d) && Number.isFinite(n) ? new Date(Date.parse(d + "T00:00:00Z") + Math.round(n)*86400000).toISOString().slice(0,10) : "";
  const mean = rows => rows.reduce((n,r) => n+r,0)/rows.length;
  const copy = v => JSON.parse(JSON.stringify(v));
  const actual = r => !r.deletedAt && !/(予定|計画|候補)/.test(String(r.workName || "") + String(r.status || "") + String(r.kind || ""));
  function validateSettings(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw Error("品種の設定形式を確認してください。");
    const bounds = {panicleInitiationDaysAfterPlanting:[1,365],headingDaysAfterPlanting:[1,365],herbicideDaysAfterPlanting:[1,365],topDressingDaysBeforeHeading:[0,120]};
    Object.entries(bounds).forEach(([k,[min,max]]) => {
      if (!blank(patch[k]) && (num(patch[k]) === null || num(patch[k]) < min || num(patch[k]) > max)) throw Error("日数目安は " + min + "〜" + max + " 日で入力してください（" + k + "）。");
    });
    const seed = ["hotWaterTemperatureC","hotWaterDurationMinutes","hotWaterBatchKg","soakingWaterTemperatureC","soakingAccumulatedWaterTempMin","soakingAccumulatedWaterTempMax","germinationTemperatureC","germinationHoursMin","germinationHoursMax"];
    seed.concat("ripeningAccumulatedTempTarget").forEach(k => { if (!blank(patch[k]) && (num(patch[k]) === null || num(patch[k]) <= 0)) throw Error("温度・時間・数量の目安は正の数で入力してください（" + k + "）。"); });
    [["panicleInitiationDaysAfterPlanting","headingDaysAfterPlanting"],["soakingAccumulatedWaterTempMin","soakingAccumulatedWaterTempMax"],["germinationHoursMin","germinationHoursMax"]].forEach(([a,b]) => {
      if (num(patch[a]) !== null && num(patch[b]) !== null && (a === "panicleInitiationDaysAfterPlanting" ? num(patch[a]) >= num(patch[b]) : num(patch[a]) > num(patch[b]))) throw Error("開始・下限の目安を終了・上限より前に設定してください。");
    });
    return true;
  }
  function harvestOverrides(variety) {
    const target = num(variety && variety.ripeningAccumulatedTempTarget);
    return target !== null && target > 0 ? {ripeningAccumulatedTempTarget:target} : {};
  }
  function historyStats(varietyId, type, asOf, ownField) {
    const data = R.state.data(), excluded = [], candidates = [], seen = new Set();
    const variety = (data.varieties || []).find(v => v.varietyId === varietyId);
    const observations = data.growthLogs || [];
    observations.forEach(g => {
      if (!(type === "heading" ? g.headingObserved : num(g.panicleLengthMm) >= 1 && num(g.panicleLengthMm) <= 2)) return;
      const name = typeof g.varietyProfile === "string" ? g.varietyProfile : "";
      const id = g.varietyId || (name && (data.varieties || []).find(v => v.name === name)?.varietyId);
      let reason = !day(g.date) ? "invalid_date" : !actual(g) ? "not_actual" : g.date > asOf ? "future" : year(g.date) >= year(asOf) ? "not_past_year" : !id ? "variety_missing" : id !== varietyId ? "other_variety" : "";
      const key = [g.fieldId,g.date,id].join("|");
      if (!reason && seen.has(key)) reason = "duplicate_date";
      if (!reason) seen.add(key);
      const planting = (data.fieldWorks || []).filter(w => (w.fieldIds || []).includes(g.fieldId) && /田植/.test(w.workName || "") && actual(w) && w.targetScope !== "offField" && day(w.date) && year(w.date) === year(g.date) && w.date <= asOf).map(w => w.date).sort()[0];
      const interval = planting ? days(planting,g.date) : null;
      if (!reason && (interval === null || interval < 1 || interval > 365)) reason = "invalid_interval";
      const row = {fieldId:g.fieldId,year:year(g.date),date:g.date,plantingDate:planting || "",daysAfterPlanting:interval,varietyId:id || "",varietyName:name || variety?.name || "",logId:g.logId || ""};
      if (reason) excluded.push({...row,reason}); else candidates.push(row);
    });
    const own = ownField && candidates.some(r => r.fieldId === ownField);
    const selected = candidates.filter(r => !own || r.fieldId === ownField).sort((a,b) => a.date.localeCompare(b.date));
    const reps = new Map();
    selected.forEach(r => { const key = r.fieldId + ":" + r.year; if (reps.has(key)) excluded.push({...r,reason:"later_observation"}); else reps.set(key,r); });
    if (own) candidates.filter(r => r.fieldId !== ownField).forEach(r => excluded.push({...r,reason:"own_field_preferred"}));
    const rows = [...reps.values()], years = [...new Set(rows.map(r => r.year))].sort();
    const yearly = years.map(y => ({year:y,mean:mean(rows.filter(r => r.year === y).map(r => r.daysAfterPlanting))}));
    return {mean:yearly.length ? mean(yearly.map(r => r.mean)) : null,min:rows.length ? Math.min(...rows.map(r => r.daysAfterPlanting)) : null,max:rows.length ? Math.max(...rows.map(r => r.daysAfterPlanting)) : null,years,count:rows.length,rows,excluded,yearly,scope:own ? "ownField" : "variety",rule:"圃場年の最初の実測→年平均→各年同重み。参考幅は信頼区間ではありません。"};
  }
  function forVariety(varietyId) {
    return copy({panicle:historyStats(varietyId,"panicle",R.utils.today()),heading:historyStats(varietyId,"heading",R.utils.today())});
  }
  function event(date, kind, label, source, spread = 3, dap) {
    return {date:date || "",range:{start:date ? add(date,-spread) : "",end:date ? add(date,spread) : "",label:kind === "actual" ? "実測日" : "参考幅（統計的信頼区間ではありません）"},kind,label,source,...(Number.isFinite(dap) ? {daysAfterPlanting:dap} : {})};
  }
  function forField(fieldOrId, date = R.utils.today()) {
    const data = R.state.data(), field = typeof fieldOrId === "object" ? fieldOrId : (data.fields || []).find(f => f.fieldId === fieldOrId);
    if (!day(date)) throw Error("予測の基準日を確認してください。");
    const variety = (data.varieties || []).find(v => v.varietyId === field?.varietyId) || {};
    const history = {panicle:historyStats(variety.varietyId,"panicle",date,field?.fieldId),heading:historyStats(variety.varietyId,"heading",date,field?.fieldId)};
    const planting = field ? R.state.plantingDateForField(field.fieldId,year(date)) : "";
    const planted = day(planting) && planting <= date;
    const master = {panicle:num(variety.panicleInitiationDaysAfterPlanting),heading:num(variety.headingDaysAfterPlanting),topDressing:num(variety.topDressingDaysBeforeHeading)};
    const predict = (type,label) => {
      const m = master[type] >= 1 && master[type] <= 365 ? master[type] : null, h = history[type];
      const value = m !== null && h.mean !== null ? (m+h.mean)/2 : m ?? h.mean;
      const kind = m !== null && h.mean !== null ? "combined" : m !== null ? "master" : h.mean !== null ? "history" : "missing";
      const spread = h.mean === null ? 3 : Math.max(3,Math.abs(h.min-h.mean),Math.abs(h.max-h.mean));
      const source = kind === "combined" ? "アプリの単純参考平均：（品種目安＋採用実績平均）÷2。生物学的検証済みではなく、精度保証なし。" : kind === "master" ? "品種マスターの日数目安（参考推定）" : kind === "history" ? "採用した過去年実績の年同重み平均（参考推定）" : "日数目安・採用可能な実績なし";
      return event(planted && value !== null ? add(planting,value) : "",planted ? kind : "missing",label,source,Math.ceil(spread),planted && value !== null ? value : undefined);
    };
    let panicle = predict("panicle","幼穂形成期の推定"), heading = predict("heading","出穂の推定");
    const logs = field ? (data.growthLogs || []).filter(g => g.fieldId === field.fieldId && day(g.date) && year(g.date) === year(date) && g.date <= date && actual(g) && (!planted || g.date >= planting)).sort((a,b) => a.date.localeCompare(b.date)) : [];
    const formation = logs.find(g => num(g.panicleLengthMm) >= 1 && num(g.panicleLengthMm) <= 2);
    if (formation) panicle = event(formation.date,"actual","幼穂形成期の実測","幼穂長1〜2mmの観測",0,planted ? days(planting,formation.date) : undefined);
    const observedHeading = field ? R.state.headingDateForField(field.fieldId,year(date),date) : "";
    if (day(observedHeading) && observedHeading <= date && year(observedHeading) === year(date)) heading = event(observedHeading,"actual","出穂確認","明示的な出穂確認",0,planted ? days(planting,observedHeading) : undefined);
    else {
      const latest = logs.filter(g => num(g.panicleLengthMm) > 0).at(-1);
      const estimate = latest && R.agro?.panicleEstimate?.(field,latest.panicleLengthMm,latest.date);
      if (latest && estimate?.supported && day(estimate.date)) heading = event(estimate.date,"panicle","幼穂長からの出穂推定",estimate.source || "対応品種の幼穂長換算");
      else if (formation && master.panicle >= 1 && master.heading > master.panicle && master.heading <= 365) heading = event(add(formation.date,master.heading-master.panicle),"panicle","幼穂形成実測からの出穂推定","幼穂1〜2mmの観測日＋（品種の出穂日数−幼穂形成日数）の参考値");
    }
    const topDressing = event(heading.date && master.topDressing !== null && master.topDressing >= 0 && master.topDressing <= 120 ? add(heading.date,-master.topDressing) : "","missing","追肥の参考時期","出穂目安から品種設定の日数を差し引いた参考値");
    if (topDressing.date) topDressing.kind = heading.kind === "actual" ? "master" : heading.kind;
    let key = "", anchorDate = "", basis = "推定（根拠なし）";
    if (heading.date && date >= heading.date) {
      const d = days(heading.date,date); key = d <= 5 ? "heading" : d <= 10 ? "fullHeading" : d <= 35 ? "ripening" : d <= 45 ? "yellowRipening" : "maturity"; anchorDate = heading.date; basis = "出穂日目安からの推定";
    } else if (panicle.date && date >= panicle.date) {
      const elapsed = days(panicle.date,date), span = heading.date ? Math.max(1,days(panicle.date,heading.date)) : 25;
      key = elapsed < span*0.4 ? "panicleInitiation" : elapsed < span*0.7 ? "meiosis" : "booting"; anchorDate = panicle.date; basis = "幼穂形成日目安からの推定";
    } else if (planted) { const d = days(planting,date); key = d <= 7 ? "establishment" : d <= 30 ? "earlyTillering" : d <= 50 ? "peakTillering" : "maximumTillering"; anchorDate = planting; basis = "田植日からの推定"; }
    if (R.agro?.SEASON_STAGES && !R.agro.SEASON_STAGES.some(s => s.key === key)) key = "";
    return copy({panicle,heading,topDressing,predictedStage:{key,basis,anchorDate},history,master,sources:[panicle.source,heading.source,topDressing.source]});
  }
  R.cultivation = {forField,forVariety,harvestOverrides,validateSettings};
})();
