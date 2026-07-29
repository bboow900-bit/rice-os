(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const storage = RiceOS.storage;

  let cache = storage.loadData();
  let lastError = null;

  function emit(message, status) {
    window.dispatchEvent(new CustomEvent("riceos:datachange", { detail: { message: message || "保存しました", status: status || "saved" } }));
  }

  function data() {
    return cache;
  }

  // Save APIs return data on success and null on failure.
  function lastSaveError() {
    return lastError;
  }

  function save(next, message) {
    let saved = false;
    try {
      cache = storage.saveData(next);
      saved = true;
      lastError = null;
      emit(message, "saved");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Save failed"));
      alert(lastError.message);
    }
    return saved ? cache : null;
  }

  function replace(next, message) {
    let saved = false;
    try {
      cache = storage.replaceData(next);
      saved = true;
      lastError = null;
      emit(message || "復元しました", "saved");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Replace failed"));
      alert(lastError.message);
    }
    return saved ? cache : null;
  }

  function mutate(fn, message) {
    try {
      const draft = U.clone(cache);
      fn(draft);
      return save(draft, message);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Mutation failed"));
      alert(lastError.message);
      return null;
    }
  }

  function varieties() {
    return data().varieties;
  }

  function fields() {
    return data().fields.slice().sort((a, b) => U.number(a.sortOrder, 0) - U.number(b.sortOrder, 0));
  }

  function activeFields() {
    return fields().filter((f) => !["休止", "終了"].includes(f.status));
  }

  function fieldGroups() {
    return (data().fieldGroups || []).slice()
      .sort((a, b) => U.number(a.sortOrder, 0) - U.number(b.sortOrder, 0) || String(a.name || "").localeCompare(String(b.name || "")));
  }

  function fieldGroup(fieldGroupId) {
    return fieldGroups().find((group) => group.fieldGroupId === fieldGroupId) || null;
  }

  function groupForField(fieldOrId) {
    const item = typeof fieldOrId === "string" ? field(fieldOrId) : fieldOrId;
    return item && item.fieldGroupId ? fieldGroup(item.fieldGroupId) : null;
  }

  function fieldsForGroup(fieldGroupId, options) {
    const opts = options || {};
    const rows = opts.includeInactive ? fields() : activeFields();
    return rows.filter((item) => item.fieldGroupId === fieldGroupId);
  }

  function groupedFields(options) {
    const opts = options || {};
    const includeInactive = Boolean(opts.includeInactive);
    const includeUnassigned = Boolean(opts.includeUnassigned);
    const result = fieldGroups().map((group) => ({
      ...group,
      fields: fieldsForGroup(group.fieldGroupId, { includeInactive })
    })).filter((group) => opts.includeEmpty || group.fields.length);
    if (includeUnassigned) {
      const rows = (includeInactive ? fields() : activeFields()).filter((item) => !item.fieldGroupId || !fieldGroup(item.fieldGroupId));
      if (rows.length) result.push({ fieldGroupId: "", name: "未設定", aliases: [], sortOrder: Number.MAX_SAFE_INTEGER, fields: rows, unassigned: true });
    }
    return result;
  }

  function variety(varietyId) {
    return varieties().find((v) => v.varietyId === varietyId);
  }

  function field(fieldId) {
    return fields().find((f) => f.fieldId === fieldId);
  }

  function addVariety(name) {
    const cleanName = String(name || "").trim() || "新しい品種";
    let newId = "";
    const saved = mutate((d) => {
      newId = U.id("variety", U.today());
      d.varieties.push({
        ...S.DEFAULT_VARIETIES[0],
        varietyId: newId,
        name: cleanName,
        memo: ""
      });
    }, "品種を追加しました");
    return saved ? newId : "";
  }

  function updateVariety(varietyId, patch) {
    return mutate((d) => {
      const index = d.varieties.findIndex((v) => v.varietyId === varietyId);
      if (index >= 0) d.varieties[index] = { ...d.varieties[index], ...patch, updatedAt: U.now() };
    }, "栽培レシピを保存しました");
  }

  function addField(name) {
    const cleanName = String(name || "").trim() || "新しい圃場";
    const base = fields();
    let newId = "";
    const saved = mutate((d) => {
      newId = U.id("field", U.today());
      d.fields.push({
        ...S.DEFAULT_FIELDS[0],
        fieldId: newId,
        name: cleanName,
        areaA: 0,
        fieldGroupId: "",
        plantingDate: "",
        fixedMemo: "",
        memo: "",
        varietyId: d.varieties[0] && d.varieties[0].varietyId || "",
        sortOrder: (base.length + 1) * 10
      });
    }, "圃場を追加しました");
    return saved ? newId : "";
  }

  function updateField(fieldId, patch) {
    return mutate((d) => {
      const index = d.fields.findIndex((f) => f.fieldId === fieldId);
      if (index < 0) return;
      const next = { ...d.fields[index], ...patch, updatedAt: U.now() };
      const groupId = String(next.fieldGroupId || "");
      if (groupId && !(d.fieldGroups || []).some((group) => group.fieldGroupId === groupId)) throw new Error("圃場グループが見つかりません。圃場マスターで選び直してください。");
      d.fields[index] = next;
    }, "圃場マスターを保存しました");
  }

  function addFieldGroup(name) {
    const cleanName = S.normalizeGroupLabel(name);
    if (!cleanName) return "";
    let newId = "";
    const saved = mutate((d) => {
      const existing = (d.fieldGroups || []).find((group) => S.normalizeGroupLabel(group.name) === cleanName || (group.aliases || []).some((alias) => S.normalizeGroupLabel(alias) === cleanName));
      if (existing) {
        newId = existing.fieldGroupId;
        return;
      }
      newId = U.id("group", U.today());
      d.fieldGroups = d.fieldGroups || [];
      d.fieldGroups.push({ fieldGroupId: newId, name: cleanName, aliases: [], sortOrder: (d.fieldGroups.length + 1) * 10 });
    }, "圃場グループを追加しました");
    return saved ? newId : "";
  }

  function updateFieldGroup(fieldGroupId, patch) {
    return mutate((d) => {
      const index = (d.fieldGroups || []).findIndex((group) => group.fieldGroupId === fieldGroupId);
      if (index < 0) return;
      const name = patch && patch.name === undefined ? d.fieldGroups[index].name : S.normalizeGroupLabel(patch && patch.name);
      if (!name) throw new Error("圃場グループ名を入力してください。");
      if ((d.fieldGroups || []).some((group, groupIndex) => groupIndex !== index && S.normalizeGroupLabel(group.name) === name)) throw new Error("同じ圃場グループ名がすでにあります。");
      d.fieldGroups[index] = { ...d.fieldGroups[index], ...patch, name, updatedAt: U.now() };
    }, "圃場グループを更新しました");
  }

  function deleteField(fieldId) {
    return mutate((d) => {
      const index = (d.fields || []).findIndex((field) => field.fieldId === fieldId);
      if (index < 0) return;
      d.fields[index] = {
        ...d.fields[index],
        status: "終了",
        archivedAt: U.now(),
        archivedReason: "利用者による削除",
        updatedAt: U.now()
      };
    }, "圃場を一覧から外しました。過去記録は年間履歴に残ります");
  }

  function matchesWorkName(work, names) {
    const values = Array.isArray(names) ? names : [names];
    const workName = String(work && work.workName || "");
    if (values.some((name) => workTextMatches(name, ["田植え", "田植", "逕ｰ讀阪∴"]))) return isPlantingWorkName(workName);
    if (values.some((name) => workTextMatches(name, ["中干し開始", "荳ｭ蟷ｲ縺鈴幕蟋・"]))) return isDryStartWorkName(workName);
    if (values.some((name) => workTextMatches(name, ["中干し終了", "荳ｭ蟷ｲ縺礼ｵゆｺ・"]))) return isDryEndWorkName(workName);
    return values.some((name) => workName === name || workName.includes(name));
  }

  function workTextMatches(workName, names) {
    const values = Array.isArray(names) ? names : [names];
    const text = String(workName || "");
    return values.some((name) => text === name || text.includes(name));
  }

  function isPlantingWorkName(workName) {
    return workTextMatches(workName, ["田植え", "田植", "逕ｰ讀阪∴"]);
  }

  function isDryStartWorkName(workName) {
    return !/予定|確認/.test(String(workName || "")) && workTextMatches(workName, ["中干し開始", "荳ｭ蟷ｲ縺鈴幕蟋・"]);
  }

  function isDryEndWorkName(workName) {
    return !/予定|確認/.test(String(workName || "")) && workTextMatches(workName, ["中干し終了", "中干し完了", "中干完了", "荳ｭ蟷ｲ縺礼ｵゆｺ・"]);
  }

  function isHeadingWorkName(workName) {
    return workTextMatches(workName, "出穂");
  }

  // A schedule is intent, while a field-work record is an actual result.
  // Keep actual observations such as "出穂確認"; only explicit plans and
  // confirmation candidates are excluded from biological calculations.
  function isActualFieldWork(work) {
    const name = String(work && work.workName || "");
    return Boolean(work && work.date) && !/(?:予定|確認候補)/.test(name);
  }

  function isInYear(record, year) {
    const date = record && (record.date || record.startDate || record.actualEndDate || record.endDate);
    return U.isInYear(date, year);
  }

  function cacheYearForDate(date) {
    return U.dateYear(date || "");
  }

  function dryActualDaysForField(field, actualEndDate) {
    const startDate = field && field.drainageStartDate || "";
    const actual = actualEndDate || "";
    const days = startDate && actual ? U.daysBetween(startDate, actual) : "";
    return days === "" ? "" : String(days);
  }

  function clearAutoIntermittentForDrying(d, sourceKey) {
    if (!sourceKey) return;
    d.irrigations = (d.irrigations || []).filter((item) => item.autoStartedFromDrySource !== sourceKey);
  }

  function refreshDryingSummary(d, fieldId) {
    const field = d.fields.find((item) => item.fieldId === fieldId);
    if (!field) return;
    const periodRows = (d.dryPeriods || []).filter((item) => item.fieldId === fieldId);
    const workRows = (d.fieldWorks || []).filter((item) => (item.fieldIds || []).includes(fieldId));
    const starts = [
      ...periodRows.map((item) => item.startDate).filter(Boolean),
      ...workRows.filter((item) => isDryStartWorkName(item.workName)).map((item) => item.date).filter(Boolean)
    ].sort();
    const ends = [
      ...periodRows.map((item) => item.actualEndDate).filter(Boolean),
      ...workRows.filter((item) => isDryEndWorkName(item.workName)).map((item) => item.date).filter(Boolean)
    ].sort();
    field.drainageStartDate = starts[0] || "";
    field.drainageActualEndDate = ends[ends.length - 1] || "";
    field.drainageActualDays = field.drainageStartDate && field.drainageActualEndDate
      ? dryActualDaysForField(field, field.drainageActualEndDate) : "";
    // These summary fields are only a backward-compatible cache. Their year
    // lets current-season screens avoid treating an older record as current.
    field.drainageSummaryYear = cacheYearForDate(field.drainageActualEndDate || field.drainageStartDate);
  }

  function refreshIntermittentSummary(d, fieldId) {
    const field = d.fields.find((item) => item.fieldId === fieldId);
    if (!field) return;
    const directStarts = (d.irrigations || [])
      .filter((item) => item.fieldId === fieldId && /間断/.test(String(item.method || "")) && item.startDate)
      .map((item) => item.startDate);
    const legacyStarts = (d.fieldWorks || [])
      .filter((item) => (item.fieldIds || []).includes(fieldId) && waterEventFromWorkName(item.workName)?.kind === "intermittent" && waterEventFromWorkName(item.workName)?.phase === "start")
      .map((item) => item.date)
      .filter(Boolean);
    const latest = [...directStarts, ...legacyStarts].sort().pop() || "";
    field.intermittentStartDate = latest;
    field.intermittentSummaryYear = latest ? cacheYearForDate(latest) : "";
  }

  function startIntermittentAfterDrying(d, fieldId, completedDate, sourceKey) {
    if (!fieldId || !completedDate) return;
    const field = d.fields.find((item) => item.fieldId === fieldId);
    const targetDays = field && field.intermittentIntervalDays || "";
    const previousAuto = (d.irrigations || []).find((item) => item.fieldId === fieldId
      && item.autoStartedFromDrySource === sourceKey);
    if (previousAuto) {
      previousAuto.date = completedDate;
      previousAuto.startDate = completedDate;
      previousAuto.endDate = targetDays ? U.dateAddDays(completedDate, Number(targetDays)) : "";
      previousAuto.targetDays = String(targetDays || "");
      previousAuto.updatedAt = U.now();
      if (field) {
        field.intermittentStartDate = completedDate;
        field.intermittentSummaryYear = cacheYearForDate(completedDate);
      }
      return;
    }
    const alreadyPlanned = (d.irrigations || []).some((item) => item.fieldId === fieldId
      && /間断/.test(String(item.method || ""))
      && !item.actualEndDate
      && String(item.date || item.startDate || "").startsWith(String(completedDate).slice(0, 4)));
    if (alreadyPlanned) return;
    const irrigation = {
      irrigationId: U.id("irrigation", completedDate),
      type: "irrigation",
      date: completedDate,
      season: U.season(completedDate),
      fieldId,
      method: "間断灌水",
      periodStatus: "実施中",
      startDate: completedDate,
      endDate: targetDays ? U.dateAddDays(completedDate, Number(targetDays)) : "",
      actualEndDate: "",
      targetDays: String(targetDays || ""),
      plannedStartDate: "",
      startReason: "中干し完了後（自動開始）",
      startTillerCount: "",
      startLeafColor: "",
      startSurface: "",
      endSurface: "",
      observationSummary: "",
      interruptionDays: "",
      referenceRecordIds: [],
      status: "入水中",
      photo: "",
      photoData: "",
      memo: "中干し完了に連動して開始。現地状況に合わせて編集できます。",
      autoStartedFromDry: true,
      autoStartedFromDrySource: sourceKey || "",
      createdAt: U.now(),
      updatedAt: U.now()
    };
    d.irrigations.push(irrigation);
    if (field) {
      field.intermittentStartDate = completedDate;
      field.intermittentSummaryYear = cacheYearForDate(completedDate);
    }
  }

  function fieldWorksByNameFor(fieldId, names, year) {
    return data().fieldWorks
      .filter((work) => (work.fieldIds || []).includes(fieldId) && isActualFieldWork(work) && matchesWorkName(work, names) && isInYear(work, year))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function firstFieldWorkDate(fieldId, names, year) {
    const work = fieldWorksByNameFor(fieldId, names, year)[0];
    return work && work.date || "";
  }

  function lastFieldWorkDate(fieldId, names, year) {
    const rows = fieldWorksByNameFor(fieldId, names, year);
    const work = rows[rows.length - 1];
    return work && work.date || "";
  }

  function plantingDateForField(fieldId, year) {
    return firstFieldWorkDate(fieldId, "田植え", year);
  }

  function workDateForField(fieldId, names, mode, year) {
    const yearOnly = year === undefined && /^\d{4}$/.test(String(mode || ""));
    const resolvedMode = yearOnly ? "first" : mode;
    const resolvedYear = yearOnly ? mode : year;
    return resolvedMode === "last"
      ? lastFieldWorkDate(fieldId, names, resolvedYear)
      : firstFieldWorkDate(fieldId, names, resolvedYear);
  }

  function headingDateForField(fieldId, year, asOfDate) {
    const onOrBefore = (row) => !asOfDate || String(row.date || "") <= asOfDate;
    const dates = [
      ...growthLogsFor(fieldId, year)
        .filter((log) => onOrBefore(log) && (log.headingObserved || (log.stageConfirmed && log.observedStage === "heading")))
        .map((log) => log.date),
      ...fieldWorksByNameFor(fieldId, "出穂", year)
        .filter(onOrBefore)
        .filter((work) => isHeadingWorkName(work.workName))
        .map((work) => work.date)
    ];
    return dates.filter(Boolean).sort()[0] || "";
  }

  function growthSummaryFor(fieldId, year, options) {
    const targetYear = year === "all" || year === "" || year === null ? undefined : year;
    const asOfDate = typeof options === "object" && options !== null ? options.asOfDate : options;
    const onOrBefore = (row) => !asOfDate || String(row.date || "") <= String(asOfDate);
    const logs = growthLogsFor(fieldId, targetYear)
      .filter(onOrBefore)
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const panicleLog = logs.filter((log) => U.number(log.panicleLengthMm, 0) > 0).at(-1) || null;
    const headingLog = logs.find((log) => log.headingObserved || (log.stageConfirmed && log.observedStage === "heading")) || null;
    const headingDate = headingDateForField(fieldId, targetYear, asOfDate);
    const headingSource = headingLog ? "growthLog" : (headingDate ? "fieldWork" : "");
    const latestLog = logs.at(-1) || null;
    const copyEvidence = (log) => log ? {
      logId: String(log.logId || ""),
      date: String(log.date || ""),
      panicleLengthMm: String(log.panicleLengthMm || ""),
      headingObserved: Boolean(log.headingObserved),
      observedStage: String(log.observedStage || ""),
      stageConfirmed: Boolean(log.stageConfirmed)
    } : null;
    const panicle = copyEvidence(panicleLog);
    const confirmedHeading = copyEvidence(headingLog);
    const stageEvidence = headingDate
      ? { key: "heading", date: headingDate, certainty: "確定", source: headingSource }
      : panicle
        ? { key: "panicle", date: panicle.date, certainty: "確定", source: "growthLog" }
        : null;
    return {
      fieldId: String(fieldId || ""),
      year: targetYear === undefined ? "" : String(targetYear),
      asOfDate: String(asOfDate || ""),
      latestLog: copyEvidence(latestLog),
      panicleLog: panicle,
      headingLog: confirmedHeading,
      panicle,
      confirmedHeading,
      headingDate,
      headingSource,
      stageEvidence
    };
  }

  function scheduleText(value) {
    return String(value || "")
      .replace(/予定|確認|作業|実施|散布|開始|終了|する|します|\s/g, "")
      .toLowerCase();
  }

  function scheduleKeyword(value) {
    const text = String(value || "");
    const keys = ["田植", "除草", "中干", "溝切", "草刈", "追肥", "防除", "出穂", "収穫", "代かき", "播種", "水深", "葉色", "間断", "湿潤"];
    return keys.find((key) => text.includes(key)) || "";
  }

  function scheduleMatchesWork(schedule, work) {
    if (!schedule || !work || schedule.status === "実施済み" || schedule.status === "手動完了") return false;
    const scheduleFields = schedule.fieldIds || [];
    const workFields = work.fieldIds || [];
    if (scheduleFields.length && !scheduleFields.some((id) => workFields.includes(id))) return false;
    const diff = Math.abs(U.daysBetween(schedule.date, work.date));
    if (diff > 2) return false;
    const scheduleKey = scheduleKeyword(`${schedule.title || ""} ${schedule.scheduleType || ""}`);
    const workKey = scheduleKeyword(work.workName || "");
    if (scheduleKey && workKey) return scheduleKey === workKey;
    const a = scheduleText(`${schedule.title || ""}${schedule.scheduleType || ""}`);
    const b = scheduleText(work.workName || "");
    return Boolean(a && b && (a.includes(b) || b.includes(a)));
  }

  function completeMatchingSchedules(d, work) {
    (d.schedules || []).forEach((schedule) => {
      if (!scheduleMatchesWork(schedule, work)) return;
      schedule.status = "実施済み";
      schedule.completedAt = U.now();
      schedule.completedByWorkId = work.workId;
      schedule.completionReason = `${work.workName || "作業"}の作業記録により完了`;
      schedule.updatedAt = U.now();
    });
  }

  function fieldNameForFeedback(fieldId) {
    const found = field(fieldId);
    return found && found.name || "圃場";
  }

  function workSaveFeedback(record) {
    const ids = record.fieldIds || [];
    const place = ids.length > 1 ? `${fieldNameForFeedback(ids[0])}ほか${ids.length - 1}圃場` : fieldNameForFeedback(ids[0]);
    const workName = record.workName || "作業";
    if (isPlantingWorkName(workName)) return `${place}に田植えを残しました。次は活着・分げつの様子を見てみましょう。`;
    if (isDryEndWorkName(workName)) return `${place}の中干し完了を残しました。次は水管理の様子を見てみましょう。`;
    if (/収穫|稲刈り/.test(workName)) return `${place}に収穫を残しました。今年のひとことも振り返りに残せます。`;
    return `${place}に${workName}を残しました。圃場カードの季節ステージを更新しました。`;
  }

  function growthSaveFeedback(record) {
    const place = fieldNameForFeedback(record.fieldId);
    if (U.number(record.panicleLengthMm, 0) > 0) return `${place}に幼穂 ${record.panicleLengthMm}mm を残しました。出穂の目安を確かめてみましょう。`;
    if (record.headingObserved) return `${place}に出穂を残しました。これからは登熟と水管理を見守りましょう。`;
    return `${place}に生育を残しました。次も葉色か分げつをひとつ残すと比較しやすくなります。`;
  }

  function saveFieldWork(record) {
    if (waterEventFromWorkName(record && record.workName) && !(record && record.legacyWaterRecord)) {
      if (typeof alert === "function") alert("中干し・間断灌水・深水・落水は、水管理として記録してください。");
      return null;
    }
    return mutate((d) => {
      const date = record.date || U.today();
      const previous = record.workId ? d.fieldWorks.find((work) => work.workId === record.workId) : null;
      const targetFieldIds = (record.fieldIds || []).slice();
      const batchId = String(record.batchId || previous && previous.batchId || (targetFieldIds.length > 1 ? U.id("batch", date) : ""));
      const timeAccounting = record.timeAccounting || previous && previous.timeAccounting || (targetFieldIds.length > 1 ? "shared" : "single");
      const totalHours = record.totalHours || record.hours || previous && previous.totalHours || "";
      const totalHoursValue = U.parseWorkHours(totalHours);
      const fieldAllocatedHours = record.fieldAllocatedHours || (timeAccounting === "shared" && targetFieldIds.length > 1 && totalHoursValue
        ? Object.fromEntries(targetFieldIds.map((fieldId) => [fieldId, Math.round(totalHoursValue / targetFieldIds.length * 100) / 100]))
        : previous && previous.fieldAllocatedHours || {});
      const normalized = {
        workId: record.workId || U.id("work", date),
        type: "fieldWork",
        date,
        season: U.season(date),
        fieldIds: targetFieldIds,
        batchId,
        batchFieldIds: (record.batchFieldIds || previous && previous.batchFieldIds || targetFieldIds).slice(),
        timeAccounting,
        totalHours,
        fieldAllocatedHours,
        workName: record.workName || "その他",
        worker: record.worker || "",
        hours: record.hours || "",
        machine: record.machine || "",
        material: record.material || "",
        amount: record.amount || "",
        fertilizerRateKg10a: record.fertilizerRateKg10a || "",
        fertilizerTotalKg: record.fertilizerTotalKg || "",
        fertilizerBagCount: record.fertilizerBagCount || "",
        sourceScheduleId: record.sourceScheduleId || previous && previous.sourceScheduleId || "",
        // The regular work form does not edit fertilizer decision snapshots.
        // Retain them until the dedicated fertilizer flow explicitly replaces them.
        growthSnapshots: record.growthSnapshots === undefined
          ? (previous && previous.growthSnapshots || {})
          : record.growthSnapshots,
        weather: record.weather || "",
        weatherAuto: record.weatherAuto || null,
        photo: record.photo || "",
        photoData: record.photoData || "",
        memo: record.memo || "",
        createdAt: record.createdAt || previous && previous.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.fieldWorks.findIndex((w) => w.workId === normalized.workId);
      if (index >= 0) d.fieldWorks[index] = { ...d.fieldWorks[index], ...normalized };
      else d.fieldWorks.push(normalized);
      // An edited work may no longer satisfy the schedule it previously
      // completed. Re-open it first, then let the current record re-match.
      if (previous) {
        (d.schedules || []).forEach((schedule) => {
          if (schedule.completedByWorkId !== normalized.workId) return;
          schedule.status = "予定";
          schedule.completedAt = "";
          schedule.completedByWorkId = "";
          schedule.completionReason = "";
          schedule.updatedAt = U.now();
        });
      }
      if (normalized.sourceScheduleId) {
        const scheduleIndex = (d.schedules || []).findIndex((schedule) => schedule.scheduleId === normalized.sourceScheduleId);
        if (scheduleIndex >= 0 && scheduleMatchesWork(d.schedules[scheduleIndex], normalized)) {
          d.schedules[scheduleIndex] = {
            ...d.schedules[scheduleIndex],
            status: "実施済み",
            completedAt: U.now(),
            completedByWorkId: normalized.workId,
            completionReason: `${normalized.workName || "作業"}の作業記録により完了`,
            updatedAt: U.now()
          };
        } else {
          normalized.sourceScheduleId = "";
          if (index >= 0) d.fieldWorks[index] = { ...d.fieldWorks[index], sourceScheduleId: "" };
        }
      }
      completeMatchingSchedules(d, normalized);
      if (isPlantingWorkName(normalized.workName)) {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) {
            const dates = d.fieldWorks
              .filter((work) => (work.fieldIds || []).includes(fieldId) && isPlantingWorkName(work.workName))
              .map((work) => work.date)
              .filter(Boolean)
              .sort();
            d.fields[fieldIndex].plantingDate = dates[0] || normalized.date;
          }
        });
      }
      if (isDryStartWorkName(normalized.workName)) {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0 && !d.fields[fieldIndex].drainageStartDate) {
            d.fields[fieldIndex].drainageStartDate = normalized.date;
            d.fields[fieldIndex].drainageSummaryYear = cacheYearForDate(normalized.date);
          }
        });
      }
      const fieldTargetsChanged = previous && (previous.fieldIds || []).slice().sort().join("|") !== normalized.fieldIds.slice().sort().join("|");
      if (previous && isDryEndWorkName(previous.workName) && (!isDryEndWorkName(normalized.workName) || previous.date !== normalized.date || fieldTargetsChanged)) {
        (previous.fieldIds || []).forEach((fieldId) => refreshDryingSummary(d, fieldId));
      }
      if (isDryEndWorkName(normalized.workName)) {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) {
            d.fields[fieldIndex].drainageActualEndDate = normalized.date;
            d.fields[fieldIndex].drainageActualDays = dryActualDaysForField(d.fields[fieldIndex], normalized.date);
            d.fields[fieldIndex].drainageSummaryYear = cacheYearForDate(normalized.date);
          }
        });
      }
      if (normalized.workName === "田植え") {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) {
            const dates = d.fieldWorks
              .filter((work) => (work.fieldIds || []).includes(fieldId) && matchesWorkName(work, "田植え"))
              .map((work) => work.date)
              .filter(Boolean)
              .sort();
            d.fields[fieldIndex].plantingDate = dates[0] || normalized.date;
          }
        });
      }
      if (normalized.workName === "中干し開始") {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0 && !d.fields[fieldIndex].drainageStartDate) {
            d.fields[fieldIndex].drainageStartDate = normalized.date;
            d.fields[fieldIndex].drainageSummaryYear = cacheYearForDate(normalized.date);
          }
        });
      }
      if (normalized.workName === "中干し終了") {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) {
            d.fields[fieldIndex].drainageActualEndDate = normalized.date;
            d.fields[fieldIndex].drainageActualDays = dryActualDaysForField(d.fields[fieldIndex], normalized.date);
            d.fields[fieldIndex].drainageSummaryYear = cacheYearForDate(normalized.date);
          }
        });
      }
    }, workSaveFeedback(record));
  }

  function deleteFieldWorks(workIds, message) {
    const ids = [...new Set((Array.isArray(workIds) ? workIds : [workIds]).map(String).filter(Boolean))];
    if (!ids.length) return null;
    return mutate((d) => {
      const removed = d.fieldWorks.filter((work) => ids.includes(work.workId));
      d.fieldWorks = d.fieldWorks.filter((work) => !ids.includes(work.workId));
      const dryFields = new Set();
      const intermittentFields = new Set();
      removed.forEach((work) => {
        (work.fieldIds || []).forEach((fieldId) => {
          if (isDryStartWorkName(work.workName) || isDryEndWorkName(work.workName)) dryFields.add(fieldId);
          const event = waterEventFromWorkName(work.workName);
          if (event && event.kind === "intermittent") intermittentFields.add(fieldId);
        });
      });
      dryFields.forEach((fieldId) => refreshDryingSummary(d, fieldId));
      intermittentFields.forEach((fieldId) => refreshIntermittentSummary(d, fieldId));
      (d.schedules || []).forEach((schedule) => {
        if (!ids.includes(schedule.completedByWorkId)) return;
        schedule.status = "予定";
        schedule.completedAt = "";
        schedule.completedByWorkId = "";
        schedule.completionReason = "";
        schedule.updatedAt = U.now();
      });
    }, message || "圃場作業を削除しました");
  }

  function deleteFieldWork(workId) {
    return deleteFieldWorks([workId]);
  }

  function saveGrowthLogsBatch(records, message) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!rows.length) return null;
    const validFieldIds = new Set(activeFields().map((item) => item.fieldId));
    if (rows.some((record) => !record.fieldId || !validFieldIds.has(record.fieldId))) {
      lastError = new Error("生育ログの圃場が見つかりません。保存は行いませんでした。");
      return null;
    }
    const newFieldIds = rows.filter((record) => !record.logId).map((record) => record.fieldId);
    if (new Set(newFieldIds).size !== newFieldIds.length) {
      lastError = new Error("同じ圃場が一括生育記録に重複しています。保存は行いませんでした。");
      return null;
    }
    return mutate((d) => {
      rows.forEach((record) => saveGrowthLogToDraft(d, record));
    }, message || `生育ログを${rows.length}件保存しました`);
  }

  function saveGrowthLog(record) {
    return saveGrowthLogsBatch([record], growthSaveFeedback(record));
  }

  function saveGrowthLogToDraft(d, record) {
      const date = record.date || U.today();
      const logId = record.logId || U.id("growth", date);
      const previous = d.growthLogs.find((g) => g.logId === logId) || null;
      const leafColorScore = String(record.leafColorScore || RiceOS.schema.leafColorScoreFromText(record.leafColor || ""));
      const normalized = {
        logId,
        type: "growthLog",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
        leafCount: record.leafCount || "",
        tillerCount: record.tillerCount || "",
        plantHeightCm: record.plantHeightCm || "",
        panicleLengthMm: record.panicleLengthMm || "",
        leafColorScore,
        leafColor: leafColorScore ? RiceOS.schema.leafColorLabel(leafColorScore) : (record.leafColor || "-"),
        weed: record.weed || "-",
        gas: record.gas || "-",
        water: record.water || "-",
        headingObserved: Boolean(record.headingObserved),
        observedStage: record.observedStage || previous && previous.observedStage || "",
        stageConfirmed: record.stageConfirmed === undefined ? Boolean(previous && previous.stageConfirmed) : Boolean(record.stageConfirmed),
        measurementCount: record.measurementCount || previous && previous.measurementCount || "",
        measurementMethod: record.measurementMethod || previous && previous.measurementMethod || "",
        stageEvidenceId: record.stageEvidenceId || previous && previous.stageEvidenceId || logId,
        recordedBy: record.recordedBy || previous && previous.recordedBy || "",
        correctionReason: record.correctionReason || previous && previous.correctionReason || "",
        photo: record.photo || "",
        photoData: record.photoData || "",
        memo: record.memo || "",
        createdAt: record.createdAt || previous && previous.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.growthLogs.findIndex((g) => g.logId === normalized.logId);
      if (index >= 0) d.growthLogs[index] = { ...d.growthLogs[index], ...normalized };
      else d.growthLogs.push(normalized);
      d.confirmationCandidates = d.confirmationCandidates || [];
      if (U.number(normalized.panicleLengthMm, 0) > 0 && RiceOS.agro && RiceOS.agro.panicleEstimate) {
        const estimate = RiceOS.agro.panicleEstimate(normalized.fieldId, normalized.panicleLengthMm, normalized.date);
        if (estimate && estimate.supported) {
          const candidateIndex = d.confirmationCandidates.findIndex((item) => item.candidateType === "heading" && item.fieldId === normalized.fieldId && item.basisData && item.basisData.recordId === normalized.logId);
          const candidate = {
            candidateId: candidateIndex >= 0 ? d.confirmationCandidates[candidateIndex].candidateId : U.id("candidate", normalized.date),
            candidateType: "heading",
            fieldId: normalized.fieldId,
            season: normalized.season,
            periodStart: estimate.rangeStart,
            periodEnd: estimate.rangeEnd,
            basisData: {
              recordId: normalized.logId,
              panicleLengthMm: normalized.panicleLengthMm,
              observedDate: normalized.date,
              source: estimate.source
            },
            missingData: [],
            regionProfile: "",
            varietyProfile: (d.varieties.find((item) => item.varietyId === (d.fields.find((item) => item.fieldId === normalized.fieldId) || {}).varietyId) || {}).name || "",
            calculationMethod: "panicle-length-heading-window",
            calculationVersion: "1",
            status: candidateIndex >= 0 ? d.confirmationCandidates[candidateIndex].status || "active" : "active",
            actualRecordId: candidateIndex >= 0 ? d.confirmationCandidates[candidateIndex].actualRecordId || "" : "",
            actualDifferenceDays: candidateIndex >= 0 ? d.confirmationCandidates[candidateIndex].actualDifferenceDays ?? "" : "",
            createdAt: candidateIndex >= 0 ? d.confirmationCandidates[candidateIndex].createdAt : U.now(),
            updatedAt: U.now()
          };
          if (candidateIndex >= 0) d.confirmationCandidates[candidateIndex] = candidate;
          else d.confirmationCandidates.push(candidate);
        }
      }
      if (normalized.headingObserved || normalized.stageConfirmed && normalized.observedStage === "heading") {
        d.confirmationCandidates.forEach((candidate) => {
          if (candidate.candidateType !== "heading" || candidate.fieldId !== normalized.fieldId || String(candidate.season) !== String(normalized.season)) return;
          candidate.status = "confirmed";
          candidate.actualRecordId = normalized.logId;
          candidate.actualDifferenceDays = candidate.periodStart ? U.daysBetween(candidate.periodStart, normalized.date) : "";
          candidate.updatedAt = U.now();
        });
      }
  }

  function deleteGrowthLog(logId) {
    return mutate((d) => {
      d.growthLogs = d.growthLogs.filter((g) => g.logId !== logId);
    }, "生育ログを削除しました");
  }

  function saveOtherWork(record) {
    return mutate((d) => {
      const date = record.date || U.today();
      const normalized = {
        otherWorkId: record.otherWorkId || U.id("other", date),
        type: "otherWork",
        date,
        season: U.season(date),
        workName: record.workName || "その他",
        varietyIds: record.varietyIds || [],
        relatedFieldIds: record.relatedFieldIds || [],
        quantity: record.quantity || "",
        hours: record.hours || "",
        memo: record.memo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.otherWorks.findIndex((o) => o.otherWorkId === normalized.otherWorkId);
      if (index >= 0) d.otherWorks[index] = { ...d.otherWorks[index], ...normalized };
      else d.otherWorks.push(normalized);
    }, "その他作業を保存しました");
  }

  function deleteOtherWork(otherWorkId) {
    return mutate((d) => {
      d.otherWorks = d.otherWorks.filter((o) => o.otherWorkId !== otherWorkId);
    }, "その他作業を削除しました");
  }

  function saveMaterial(record) {
    return mutate((d) => {
      const normalized = {
        materialId: record.materialId || U.id("material", U.today()),
        season: U.number(record.season, new Date().getFullYear()),
        category: record.category || "その他",
        name: record.name || "",
        carryover: record.carryover || "",
        ordered: record.ordered || "",
        used: record.used || "",
        remaining: record.remaining || "",
        deliveryDate: record.deliveryDate || "",
        nextYearMemo: record.nextYearMemo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      d.materials.push(normalized);
    }, "資材を保存しました");
  }

  function saveResult(record) {
    return mutate((d) => {
      const normalized = {
        resultId: record.resultId || U.id("result", U.today()),
        season: U.number(record.season, new Date().getFullYear()),
        varietyId: record.varietyId || "",
        fieldId: record.fieldId || "",
        areaA: record.areaA || "",
        yield: record.yield || "",
        yieldPer10a: record.yieldPer10a || "",
        grade: record.grade || "",
        firstGradeRate: record.firstGradeRate || "",
        shippedQuantity: record.shippedQuantity || "",
        quality: record.quality || "",
        salesAmount: record.salesAmount || "",
        salesPer10a: record.salesPer10a || "",
        reflection: record.reflection || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      d.varietyResults.push(normalized);
    }, "品種結果を保存しました");
  }

  function updateWeatherLocation(location) {
    return mutate((d) => {
      d.meta = d.meta || {};
      d.meta.weatherLocation = location;
    }, "天気取得位置を保存しました");
  }

  function saveSchedule(record) {
    return mutate((d) => {
      const date = record.date || U.today();
      const normalized = {
        scheduleId: record.scheduleId || U.id("schedule", date),
        type: "schedule",
        date,
        season: U.season(date),
        fieldIds: record.fieldIds || [],
        batchId: record.batchId || "",
        batchFieldIds: record.batchFieldIds || record.fieldIds || [],
        scheduleType: record.scheduleType || "作業予定",
        title: record.title || record.scheduleType || "予定",
        status: record.status || "予定",
        completedAt: record.completedAt || "",
        completedByWorkId: record.completedByWorkId || "",
        completedManuallyAt: record.completedManuallyAt || "",
        completionReason: record.completionReason || "",
        plannedFertilizerName: record.plannedFertilizerName || "",
        plannedFertilizerRateKg10a: record.plannedFertilizerRateKg10a || "",
        memo: record.memo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.schedules.findIndex((s) => s.scheduleId === normalized.scheduleId);
      if (index >= 0) d.schedules[index] = { ...d.schedules[index], ...normalized };
      else d.schedules.push(normalized);
    }, "予定を保存しました");
  }

  function completeSchedule(scheduleId) {
    return mutate((d) => {
      const index = (d.schedules || []).findIndex((s) => s.scheduleId === scheduleId);
      if (index < 0) return;
      d.schedules[index] = {
        ...d.schedules[index],
        status: "手動完了",
        completedAt: U.now(),
        completedManuallyAt: U.now(),
        completionReason: "手動で実施済みにしました",
        updatedAt: U.now()
      };
    }, "予定を完了にしました");
  }

  function saveFertilizerCompletion(record) {
    return mutate((d) => {
      const scheduleIndex = (d.schedules || []).findIndex((schedule) => schedule.scheduleId === record.scheduleId);
      if (scheduleIndex < 0) return;
      const schedule = d.schedules[scheduleIndex];
      const date = record.date || U.today();
      const workId = U.id("work", date);
      const rate = String(record.fertilizerRateKg10a || "");
      const total = String(record.fertilizerTotalKg || "");
      const bags = String(record.fertilizerBagCount || "");
      const material = record.material || schedule.plannedFertilizerName || "";
      const amount = [
        rate ? `${rate}kg/10a` : "",
        total ? `合計${total}kg` : "",
        bags ? `${bags}袋` : ""
      ].filter(Boolean).join(" / ");
      const work = {
        workId,
        type: "fieldWork",
        date,
        season: U.season(date),
        fieldIds: schedule.fieldIds || [],
        batchId: (schedule.fieldIds || []).length > 1 ? U.id("batch", date) : "",
        batchFieldIds: (schedule.fieldIds || []).slice(),
        timeAccounting: (schedule.fieldIds || []).length > 1 ? "shared" : "single",
        totalHours: record.hours || "",
        fieldAllocatedHours: {},
        workName: "追肥",
        worker: record.worker || "",
        hours: record.hours || "",
        machine: "",
        material,
        amount,
        fertilizerRateKg10a: rate,
        fertilizerTotalKg: total,
        fertilizerBagCount: bags,
        sourceScheduleId: schedule.scheduleId,
        growthSnapshots: record.growthSnapshots || {},
        weather: "",
        weatherAuto: null,
        photo: "",
        photoData: "",
        memo: record.memo || "",
        createdAt: U.now(),
        updatedAt: U.now()
      };
      d.fieldWorks.push(work);
      d.schedules[scheduleIndex] = {
        ...schedule,
        status: "実施済み",
        completedAt: U.now(),
        completedByWorkId: workId,
        completionReason: `追肥 ${date} 実績${amount || "量未入力"}`,
        updatedAt: U.now()
      };
    }, "追肥の実績を保存しました");
  }

  function deleteSchedule(scheduleId) {
    return mutate((d) => {
      d.schedules = (d.schedules || []).filter((s) => s.scheduleId !== scheduleId);
    }, "予定を削除しました");
  }

  function saveDryPeriodsBatch(records, message) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!rows.length) return null;
    return mutate((d) => {
      rows.forEach((record) => saveDryPeriodToDraft(d, record));
    }, message || `中干し記録を${rows.length}件保存しました`);
  }

  function saveDryPeriod(record) {
    return saveDryPeriodsBatch([record], `${fieldNameForFeedback(record.fieldId)}の中干し記録を残しました。圃場カードの水管理も更新しました。`);
  }

  function saveDryPeriodToDraft(d, record) {
      const date = record.date || U.today();
      const dryPeriodId = record.dryPeriodId || U.id("dry", date);
      const previous = d.dryPeriods.find((item) => item.dryPeriodId === dryPeriodId) || null;
      const normalized = {
        dryPeriodId,
        type: "dryPeriod",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
        batchId: record.batchId || previous && previous.batchId || "",
        batchFieldIds: record.batchFieldIds || previous && previous.batchFieldIds || [],
        status: record.status || (record.actualEndDate ? "完了" : "実施中"),
        startDate: record.startDate || "",
        endDate: record.endDate || "",
        actualEndDate: record.actualEndDate || "",
        targetDays: record.targetDays || "",
        plannedStartDate: record.plannedStartDate || "",
        startReason: record.startReason || "",
        startTillerCount: record.startTillerCount || "",
        startLeafColor: record.startLeafColor || "",
        startSurface: record.startSurface || "",
        endSurface: record.endSurface || "",
        observationSummary: record.observationSummary || "",
        interruptionDays: record.interruptionDays || "",
        referenceRecordIds: record.referenceRecordIds || [],
        crackCm: record.crackCm || "",
        sinkCm: record.sinkCm || "",
        surface: record.surface || "",
        gas: record.gas || "",
        photo: record.photo || "",
        photoData: record.photoData || "",
        memo: record.memo || "",
        createdAt: record.createdAt || previous && previous.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.dryPeriods.findIndex((item) => item.dryPeriodId === normalized.dryPeriodId);
      if (index >= 0) d.dryPeriods[index] = { ...d.dryPeriods[index], ...normalized };
      else d.dryPeriods.push(normalized);
      const fieldIndex = d.fields.findIndex((f) => f.fieldId === normalized.fieldId);
      if (fieldIndex >= 0) {
        if (normalized.startDate) {
          d.fields[fieldIndex].drainageStartDate = normalized.startDate;
          d.fields[fieldIndex].drainageSummaryYear = cacheYearForDate(normalized.startDate);
        }
        if (normalized.targetDays) d.fields[fieldIndex].drainageTargetDays = normalized.targetDays;
        if (normalized.endDate) d.fields[fieldIndex].drainagePlannedEndDate = normalized.endDate;
        if (normalized.actualEndDate) {
          d.fields[fieldIndex].drainageActualEndDate = normalized.actualEndDate;
          d.fields[fieldIndex].drainageActualDays = dryActualDaysForField(d.fields[fieldIndex], normalized.actualEndDate);
          d.fields[fieldIndex].drainageSummaryYear = cacheYearForDate(normalized.actualEndDate);
          // 中干し完了は事実として残すだけにする。間断灌水など次の管理は、
          // 現場で開始を記録した時だけ別の期間として保存される。
        }
      }
      if (previous && previous.actualEndDate && !normalized.actualEndDate) refreshDryingSummary(d, normalized.fieldId);
  }

  function unlinkLegacyWaterPeriod(d, periodId, kind) {
    d.fieldWorks = (d.fieldWorks || []).map((work) => ({
      ...work,
      waterMigrationLinks: (work.waterMigrationLinks || []).filter((link) => link.periodId !== periodId || link.kind !== kind)
    }));
  }

  function deleteDryPeriod(dryPeriodId) {
    return mutate((d) => {
      const removed = (d.dryPeriods || []).find((item) => item.dryPeriodId === dryPeriodId);
      d.dryPeriods = (d.dryPeriods || []).filter((item) => item.dryPeriodId !== dryPeriodId);
      unlinkLegacyWaterPeriod(d, dryPeriodId, "dry");
      if (removed) {
        refreshDryingSummary(d, removed.fieldId);
      }
    }, "中干し記録を削除しました");
  }

  function saveIrrigationsBatch(records, message) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!rows.length) return null;
    return mutate((d) => {
      rows.forEach((record) => saveIrrigationToDraft(d, record));
    }, message || `水管理を${rows.length}件保存しました`);
  }

  function saveIrrigation(record) {
    return saveIrrigationsBatch([record], "水管理を保存しました");
  }

  function saveIrrigationToDraft(d, record) {
      const date = record.date || U.today();
      const irrigationId = record.irrigationId || U.id("irrigation", date);
      const previous = d.irrigations.find((item) => item.irrigationId === irrigationId) || null;
      const normalized = {
        irrigationId,
        type: "irrigation",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
        batchId: record.batchId || previous && previous.batchId || "",
        batchFieldIds: record.batchFieldIds || previous && previous.batchFieldIds || [],
        method: record.method || "間断灌水",
        periodStatus: record.periodStatus || (record.actualEndDate ? "完了" : "実施中"),
        startDate: record.startDate || "",
        endDate: record.endDate || "",
        actualEndDate: record.actualEndDate || "",
        targetDays: record.targetDays || "",
        plannedStartDate: record.plannedStartDate || "",
        startReason: record.startReason || "",
        startTillerCount: record.startTillerCount || "",
        startLeafColor: record.startLeafColor || "",
        startSurface: record.startSurface || "",
        endSurface: record.endSurface || "",
        observationSummary: record.observationSummary || "",
        interruptionDays: record.interruptionDays || "",
        referenceRecordIds: record.referenceRecordIds || [],
        status: record.status || "入水中",
        autoStartedFromDry: record.autoStartedFromDry === undefined ? Boolean(previous && previous.autoStartedFromDry) : Boolean(record.autoStartedFromDry),
        autoStartedFromDrySource: record.autoStartedFromDrySource === undefined ? String(previous && previous.autoStartedFromDrySource || "") : String(record.autoStartedFromDrySource || ""),
        targetDepthCm: record.targetDepthCm || previous && previous.targetDepthCm || "",
        observedDepthCm: record.observedDepthCm || previous && previous.observedDepthCm || "",
        photo: record.photo || "",
        photoData: record.photoData || "",
        memo: record.memo || "",
        createdAt: record.createdAt || previous && previous.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.irrigations.findIndex((item) => item.irrigationId === normalized.irrigationId);
      if (index >= 0) d.irrigations[index] = { ...d.irrigations[index], ...normalized };
      else d.irrigations.push(normalized);
      const fieldIndex = d.fields.findIndex((f) => f.fieldId === normalized.fieldId);
      if (fieldIndex >= 0 && /間断/.test(String(normalized.method || ""))) {
        if (normalized.startDate) {
          d.fields[fieldIndex].intermittentStartDate = normalized.startDate;
          d.fields[fieldIndex].intermittentSummaryYear = cacheYearForDate(normalized.startDate);
        }
        if (normalized.targetDays) d.fields[fieldIndex].intermittentIntervalDays = normalized.targetDays;
      }
  }

  function deleteIrrigation(irrigationId) {
    return mutate((d) => {
      const removed = (d.irrigations || []).find((item) => item.irrigationId === irrigationId);
      d.irrigations = (d.irrigations || []).filter((item) => item.irrigationId !== irrigationId);
      unlinkLegacyWaterPeriod(d, irrigationId, waterKindFromMethod(removed && removed.method));
      if (removed && /間断/.test(String(removed.method || ""))) refreshIntermittentSummary(d, removed.fieldId);
    }, "水管理を削除しました");
  }

  function markJsonExported() {
    return mutate((d) => {
      d.meta = d.meta || {};
      d.meta.lastJsonExportAt = U.now();
    }, "JSONバックアップ日を記録しました");
  }

  function markNotificationCheck() {
    return mutate((d) => {
      d.meta = d.meta || {};
      d.meta.lastNotificationCheck = U.today();
    }, "通知確認日を記録しました");
  }

  function undoLastSave() {
    let restored = null;
    try {
      restored = storage.restoreBackup();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || "Restore failed"));
      alert(lastError.message);
      return null;
    }
    if (!restored) return null;
    cache = restored;
    lastError = null;
    emit("直前バックアップに戻しました", "saved");
    return cache;
  }

  function fieldWorksFor(fieldId, year) {
    return data().fieldWorks.filter((w) => (w.fieldIds || []).includes(fieldId) && isInYear(w, year));
  }

  function isMigratedWaterWork(work, fieldId) {
    if (!work || !Array.isArray(work.waterMigrationLinks) || !work.waterMigrationLinks.length) return false;
    if (fieldId) return work.waterMigrationLinks.some((link) => link.fieldId === fieldId);
    const fieldIds = work.fieldIds || [];
    return Boolean(fieldIds.length) && fieldIds.every((id) => work.waterMigrationLinks.some((link) => link.fieldId === id));
  }

  function growthLogsFor(fieldId, year) {
    return data().growthLogs.filter((g) => g.fieldId === fieldId && isInYear(g, year));
  }

  function dryPeriodsFor(fieldId, year) {
    return (data().dryPeriods || []).filter((d) => d.fieldId === fieldId && isInYear(d, year));
  }

  function irrigationsFor(fieldId, year) {
    return (data().irrigations || []).filter((i) => i.fieldId === fieldId && isInYear(i, year));
  }

  const WATER_PERIOD_TYPES = {
    dry: { label: "中干し", method: "中干し" },
    intermittent: { label: "間断灌水", method: "間断灌水" },
    deep: { label: "深水管理", method: "深水管理" },
    drain: { label: "稲刈り前の落水", method: "稲刈り前の落水" }
  };

  function waterPeriodYear(record) {
    const date = record && (record.startDate || record.date || record.actualEndDate || record.endDate || "");
    return U.dateYear(date) || String(record && record.season || "");
  }

  function waterKindFromMethod(method) {
    const text = String(method || "");
    if (/中干し/.test(text)) return "dry";
    if (/間断灌水/.test(text)) return "intermittent";
    if (/深水/.test(text)) return "deep";
    if (/稲刈り前.*落水|^落水$/.test(text)) return "drain";
    return "";
  }

  function waterEventFromWorkName(workName) {
    const text = String(workName || "").trim();
    if (!text || /予定|確認/.test(text)) return null;
    const type = /中干し/.test(text) ? "dry"
      : /間断灌水/.test(text) ? "intermittent"
      : /深水管理|深水/.test(text) ? "deep"
      : /稲刈り前.*落水/.test(text) ? "drain" : "";
    if (!type) return null;
    if (/終了|完了/.test(text)) return { kind: type, phase: "end" };
    if (/開始/.test(text)) return { kind: type, phase: "start" };
    return null;
  }

  // Older versions stored water management as ordinary work names. Keep those
  // rows visible for reconciliation, but do not let ambiguous names update a
  // current field summary until the user explicitly adopts them.
  function legacyWaterEventFromWorkName(workName) {
    const explicit = waterEventFromWorkName(workName);
    if (explicit) return explicit;
    const text = String(workName || "").trim();
    if (!text || /予定|確認/.test(text)) return null;
    if (/^中干し$/.test(text)) return { kind: "dry", phase: "legacy" };
    if (/^間断灌水$/.test(text)) return { kind: "intermittent", phase: "legacy" };
    if (/^(深水管理|深水)$/.test(text)) return { kind: "deep", phase: "legacy" };
    if (/^(稲刈り前の落水|落水)$/.test(text)) return { kind: "drain", phase: "legacy" };
    return null;
  }

  function waterPeriodStatus(period) {
    if (!period.startDate && period.actualEndDate) return "orphanEnd";
    if (period.actualEndDate) return "completed";
    if (period.startDate) return "active";
    return "planned";
  }

  function directWaterPeriodsFor(fieldId, year, includePlanned) {
    const directDry = (data().dryPeriods || []).filter((row) => row.fieldId === fieldId);
    const directWater = (data().irrigations || []).filter((row) => row.fieldId === fieldId);
    return [...directDry, ...directWater].map((row) => {
      const kind = row.type === "dryPeriod" || /中干し/.test(String(row.method || "")) ? "dry" : waterKindFromMethod(row.method);
      if (!kind) return null;
      const startDate = String(row.startDate || row.date || "");
      const actualEndDate = String(row.actualEndDate || "");
      const plannedEndDate = String(row.endDate || "");
      const planned = !startDate && Boolean(row.plannedStartDate || plannedEndDate || /予定/.test(String(row.status || row.periodStatus || "")));
      return {
        periodId: `direct:${kind}:${row.dryPeriodId || row.irrigationId || row.date || ""}`,
        kind,
        label: WATER_PERIOD_TYPES[kind].label,
        fieldId,
        season: waterPeriodYear(row),
        startDate,
        plannedEndDate,
        actualEndDate,
        targetDays: String(row.targetDays || ""),
        status: waterPeriodStatus({ startDate, actualEndDate }),
        source: "direct",
        directId: row.dryPeriodId || row.irrigationId || "",
        sourceWorkIds: [],
        planned,
        raw: row
      };
    }).filter((row) => row && (!year || row.season === String(year)) && (includePlanned || !row.planned));
  }

  function legacyWaterKey(fieldId, kind, sourceWorkIds) {
    return [fieldId, kind, ...(sourceWorkIds || []).map(String).sort()].join("|");
  }

  function legacyWaterPeriodsFor(fieldId, year, options) {
    const opts = options || {};
    const works = (data().fieldWorks || [])
      .filter((row) => (row.fieldIds || []).includes(fieldId) && (!year || waterPeriodYear(row) === String(year)))
      .map((row) => ({ row, event: legacyWaterEventFromWorkName(row.workName) }))
      .filter((item) => item.event)
      .sort((a, b) => String(a.row.date || "").localeCompare(String(b.row.date || "")) || String(a.row.workId || "").localeCompare(String(b.row.workId || "")));
    const periods = [];
    const open = { dry: [], intermittent: [], deep: [], drain: [] };
    works.forEach(({ row, event }) => {
      const type = WATER_PERIOD_TYPES[event.kind];
      if (event.phase === "start" || event.phase === "legacy") {
        const period = {
          periodId: `work:${event.kind}:${row.workId || row.date || periods.length}`,
          kind: event.kind,
          label: type.label,
          fieldId,
          season: waterPeriodYear(row),
          startDate: String(row.date || ""),
          plannedEndDate: "",
          actualEndDate: "",
          targetDays: "",
          status: "active",
          source: "legacy-work",
          directId: "",
          sourceWorkIds: row.workId ? [row.workId] : [],
          requiresDateReview: event.phase === "legacy",
          planned: false,
          raw: row
        };
        periods.push(period);
        open[event.kind].push(period);
        return;
      }
      const current = open[event.kind].pop();
      if (current) {
        current.actualEndDate = String(row.date || "");
        current.status = "completed";
        if (row.workId) current.sourceWorkIds.push(row.workId);
        return;
      }
      periods.push({
        periodId: `work:${event.kind}:end:${row.workId || row.date || periods.length}`,
        kind: event.kind,
        label: type.label,
        fieldId,
        season: waterPeriodYear(row),
        startDate: "",
        plannedEndDate: "",
        actualEndDate: String(row.date || ""),
        targetDays: "",
        status: "orphanEnd",
        source: "legacy-work",
        directId: "",
        sourceWorkIds: row.workId ? [row.workId] : [],
        planned: false,
        raw: row
      });
    });
    return periods.map((period) => {
      const legacyKey = legacyWaterKey(fieldId, period.kind, period.sourceWorkIds);
      const linked = period.sourceWorkIds.length > 0 && period.sourceWorkIds.every((workId) => {
        const work = (data().fieldWorks || []).find((row) => row.workId === workId);
        return (work && work.waterMigrationLinks || []).some((link) => link.fieldId === fieldId && link.kind === period.kind && link.legacyKey === legacyKey);
      });
      const linkedPeriodId = period.sourceWorkIds.map((workId) => {
        const work = (data().fieldWorks || []).find((row) => row.workId === workId);
        const link = (work && work.waterMigrationLinks || []).find((item) => item.fieldId === fieldId && item.kind === period.kind && item.legacyKey === legacyKey);
        return link && link.periodId || "";
      }).find(Boolean) || "";
      return { ...period, legacyKey, migrated: linked, linkedPeriodId };
    }).filter((period) => (opts.includeMigrated || !period.migrated)
      && (opts.includeUnreviewed || !period.requiresDateReview));
  }

  function legacyWaterReviewFor(fieldId, options) {
    const opts = options || {};
    const year = opts.year === undefined || opts.year === null || String(opts.year) === "all" ? "" : String(opts.year);
    return legacyWaterPeriodsFor(fieldId, year, { includeMigrated: true, includeUnreviewed: true });
  }

  function directWaterMatchesForLegacy(fieldId, legacyKey) {
    const period = legacyWaterPeriodsFor(fieldId, "", { includeMigrated: true, includeUnreviewed: true })
      .find((item) => item.legacyKey === legacyKey);
    if (!period || !period.startDate || !period.actualEndDate) return [];
    return directWaterPeriodsFor(fieldId, "", true).filter((row) => row.kind === period.kind
      && row.startDate === period.startDate && row.actualEndDate === period.actualEndDate);
  }

  function importLegacyWaterPeriod(fieldId, legacyKey, existingPeriodId) {
    const period = legacyWaterPeriodsFor(fieldId, "", { includeMigrated: true })
      .find((item) => item.legacyKey === legacyKey);
    if (!period || period.migrated || !period.sourceWorkIds.length || !period.startDate || !period.actualEndDate) return null;
    let periodId = "";
    const saved = mutate((d) => {
      const directRows = period.kind === "dry" ? d.dryPeriods : d.irrigations;
      const same = existingPeriodId && directRows.find((row) => row.fieldId === fieldId
        && (row.dryPeriodId === existingPeriodId || row.irrigationId === existingPeriodId)
        && waterKindFromMethod(row.method || (period.kind === "dry" ? "中干し" : "")) === period.kind
        && String(row.startDate || row.date || "") === String(period.startDate)
        && String(row.actualEndDate || "") === String(period.actualEndDate));
      periodId = same ? (same.dryPeriodId || same.irrigationId) : "";
      if (!periodId) {
        periodId = U.id(period.kind === "dry" ? "dry" : "irrigation", period.startDate || period.actualEndDate || U.today());
        const base = {
          fieldId,
          date: period.startDate || period.actualEndDate || U.today(),
          startDate: period.startDate || "",
          actualEndDate: period.actualEndDate || "",
          status: period.actualEndDate ? "完了" : "実施中",
          periodStatus: period.actualEndDate ? "完了" : "実施中",
          referenceRecordIds: period.sourceWorkIds.slice(),
          batchId: period.raw && period.raw.batchId || "",
          batchFieldIds: period.raw && period.raw.batchFieldIds || [],
          memo: "旧作業記録から取り込み"
        };
        if (period.kind === "dry") saveDryPeriodToDraft(d, { ...base, dryPeriodId: periodId });
        else saveIrrigationToDraft(d, { ...base, irrigationId: periodId, method: WATER_PERIOD_TYPES[period.kind].method });
      }
      period.sourceWorkIds.forEach((workId) => {
        const index = d.fieldWorks.findIndex((row) => row.workId === workId);
        if (index < 0) return;
        const links = d.fieldWorks[index].waterMigrationLinks || [];
        if (links.some((link) => link.fieldId === fieldId && link.kind === period.kind && link.legacyKey === legacyKey)) return;
        d.fieldWorks[index] = {
          ...d.fieldWorks[index],
          waterMigrationLinks: [...links, { fieldId, kind: period.kind, legacyKey, periodId, linkedAt: U.now() }],
          updatedAt: U.now()
        };
      });
    }, "旧作業記録を水管理へ取り込みました。元の作業記録は残しています。");
    return saved ? periodId : "";
  }

  function adoptLegacyWaterPeriod(fieldId, legacyKey) {
    const period = legacyWaterPeriodsFor(fieldId, "", { includeMigrated: true, includeUnreviewed: true })
      .find((item) => item.legacyKey === legacyKey);
    if (!period || period.migrated || !period.sourceWorkIds.length || (!period.startDate && !period.actualEndDate)) return null;
    let periodId = "";
    const saved = mutate((d) => {
      periodId = U.id(period.kind === "dry" ? "dry" : "irrigation", period.startDate || period.actualEndDate || U.today());
      const base = {
        fieldId,
        date: period.startDate || period.actualEndDate || U.today(),
        startDate: period.startDate || "",
        actualEndDate: period.actualEndDate || "",
        status: period.actualEndDate ? "完了" : "実施中",
        periodStatus: period.actualEndDate ? "完了" : "実施中",
        referenceRecordIds: period.sourceWorkIds.slice(),
        batchId: period.raw && period.raw.batchId || "",
        batchFieldIds: period.raw && period.raw.batchFieldIds || [],
        memo: "旧作業記録から引き継ぎ（期間を確認）"
      };
      if (period.kind === "dry") saveDryPeriodToDraft(d, { ...base, dryPeriodId: periodId });
      else saveIrrigationToDraft(d, { ...base, irrigationId: periodId, method: WATER_PERIOD_TYPES[period.kind].method });
      period.sourceWorkIds.forEach((workId) => {
        const index = d.fieldWorks.findIndex((row) => row.workId === workId);
        if (index < 0) return;
        const links = d.fieldWorks[index].waterMigrationLinks || [];
        if (links.some((link) => link.fieldId === fieldId && link.kind === period.kind && link.legacyKey === legacyKey)) return;
        d.fieldWorks[index] = {
          ...d.fieldWorks[index],
          waterMigrationLinks: [...links, { fieldId, kind: period.kind, legacyKey, periodId, linkedAt: U.now() }],
          updatedAt: U.now()
        };
      });
    }, "旧作業記録を水管理の下書きへ引き継ぎました。期間を確認してください。");
    return saved ? { kind: period.kind, id: periodId } : null;
  }

  // This is read-only. It keeps direct water records authoritative while making
  // legacy work records visible everywhere until the user explicitly edits them.
  function resolvedWaterPeriodsFor(fieldId, options) {
    const opts = options || {};
    const year = opts.year === undefined || opts.year === null || String(opts.year) === "all" ? "" : String(opts.year);
    const throughDate = String(opts.throughDate || "");
    const direct = directWaterPeriodsFor(fieldId, year, Boolean(opts.includePlanned));
    const legacy = legacyWaterPeriodsFor(fieldId, year);
    // Do not infer that separate records describe one period. A direct record
    // and an old work record may be repeated work on the same day. They remain
    // independent until a future explicit relation field links them.
    const periods = [...direct, ...legacy]
      .filter((period) => !throughDate || !period.startDate || period.startDate <= throughDate)
      .map((period) => {
        if (!throughDate || !period.actualEndDate || period.actualEndDate <= throughDate) return period;
        return { ...period, actualEndDate: "", status: period.startDate ? "active" : period.status };
      })
      .sort((a, b) => String(a.startDate || a.actualEndDate || "").localeCompare(String(b.startDate || b.actualEndDate || "")));
    if (!opts.forDisplay) return periods;
    // Only collapse records from the same source. A direct water record and an
    // older work record stay separately actionable even when their dates match.
    const byBoundary = new Map();
    periods.forEach((period) => {
      const key = [period.source, period.kind, period.startDate, period.actualEndDate, period.plannedEndDate].join("|");
      const current = byBoundary.get(key);
      if (!current) {
        byBoundary.set(key, { ...period, displayRecordCount: 1 });
        return;
      }
      current.displayRecordCount += 1;
    });
    return Array.from(byBoundary.values());
  }

  function seasonNotesForField(fieldId, year) {
    const fieldRecord = field(fieldId);
    return (fieldRecord && Array.isArray(fieldRecord.seasonNotes) ? fieldRecord.seasonNotes : [])
      .filter((note) => year === undefined || year === null || String(year).trim() === "" || String(note.season) === String(year))
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function saveSeasonNote(record) {
    const input = record || {};
    const fieldId = String(input.fieldId || "");
    const text = String(input.text ?? input.memo ?? "");
    const date = String(input.date || U.today());
    const inputSeason = input.season === undefined || input.season === null || String(input.season).trim() === "" ? "" : String(input.season);
    if (!fieldId || !field(fieldId) || !text.trim() || !date || inputSeason && U.dateYear(date) !== inputSeason) return "";
    const noteId = String(input.noteId || input.id || U.id("season-note", input.date || U.today()));
    const saved = mutate((d) => {
      const fieldIndex = d.fields.findIndex((item) => item.fieldId === fieldId);
      if (fieldIndex < 0) return;
      const notes = Array.isArray(d.fields[fieldIndex].seasonNotes) ? d.fields[fieldIndex].seasonNotes : [];
      const existingIndex = notes.findIndex((item) => item.noteId === noteId);
      const existing = existingIndex >= 0 ? notes[existingIndex] : null;
      const normalized = S.normalizeSeasonNote({
        ...input,
        noteId,
        fieldId,
        text,
        createdAt: input.createdAt || existing && existing.createdAt || U.now(),
        date,
        season: inputSeason || U.dateYear(date),
        updatedAt: U.now()
      }, fieldId, existingIndex >= 0 ? existingIndex : notes.length);
      if (existingIndex >= 0) notes[existingIndex] = { ...existing, ...normalized };
      else notes.push(normalized);
      d.fields[fieldIndex].seasonNotes = notes;
    }, "今年の気づきを保存しました");
    return saved ? noteId : "";
  }

  function deleteSeasonNote(noteId, fieldId) {
    const safeNoteId = String(noteId || "");
    const safeFieldId = String(fieldId || "");
    if (!safeNoteId || !safeFieldId || !field(safeFieldId)) return null;
    if (!seasonNotesForField(safeFieldId).some((item) => item.noteId === safeNoteId)) return null;
    return mutate((d) => {
      const fieldIndex = d.fields.findIndex((item) => item.fieldId === safeFieldId);
      if (fieldIndex < 0) return;
      d.fields[fieldIndex].seasonNotes = (d.fields[fieldIndex].seasonNotes || [])
        .filter((item) => item.noteId !== safeNoteId);
    }, "今年の気づきを削除しました");
  }

  function lastFieldWork(fieldId) {
    return fieldWorksFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function lastGrowthLog(fieldId) {
    return growthLogsFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  RiceOS.state = {
    data,
    lastSaveError,
    save,
    replace,
    mutate,
    varieties,
    fields,
    activeFields,
    fieldGroups,
    fieldGroup,
    groupForField,
    fieldsForGroup,
    groupedFields,
    variety,
    field,
    addVariety,
    updateVariety,
    addField,
    updateField,
    addFieldGroup,
    updateFieldGroup,
    deleteField,
    plantingDateForField,
    workDateForField,
    headingDateForField,
    growthSummaryFor,
    fieldWorksByNameFor,
    isActualFieldWork,
    isHeadingWorkName,
    saveFieldWork,
    deleteFieldWork,
    deleteFieldWorks,
    saveGrowthLog,
    saveGrowthLogsBatch,
    deleteGrowthLog,
    saveOtherWork,
    deleteOtherWork,
    saveMaterial,
    saveResult,
    saveSchedule,
    completeSchedule,
    saveFertilizerCompletion,
    deleteSchedule,
    saveDryPeriod,
    saveDryPeriodsBatch,
    deleteDryPeriod,
    saveIrrigation,
    saveIrrigationsBatch,
    deleteIrrigation,
    updateWeatherLocation,
    markJsonExported,
    markNotificationCheck,
    undoLastSave,
    fieldWorksFor,
    isMigratedWaterWork,
    waterEventForWorkName: waterEventFromWorkName,
    growthLogsFor,
    dryPeriodsFor,
    irrigationsFor,
    resolvedWaterPeriodsFor,
    legacyWaterReviewFor,
    directWaterMatchesForLegacy,
    importLegacyWaterPeriod,
    adoptLegacyWaterPeriod,
    seasonNotesForField,
    saveSeasonNote,
    deleteSeasonNote,
    lastFieldWork,
    lastGrowthLog
  };
})();
