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

  function cropYearForRecord(record) {
    if (!record) return "";
    if (S.validCropYear(record.cropYear)) return Number(record.cropYear);
    if (S.validCropYear(record.season)) return Number(record.season);
    const year = U.dateYear(record.date);
    return S.validCropYear(year) ? Number(year) : "";
  }

  function defaultCropYear(date) {
    const active = (data().meta || {}).activeCropYear;
    return S.validCropYear(active) ? Number(active) : cropYearForRecord({ date: date || U.today() });
  }

  function cropYearClosureFor(year) {
    if (!S.validCropYear(year)) return null;
    const value = Number(year);
    const stored = S.normalizeCropYearClosures((data().meta || {}).cropYearClosures).find(row => Number(row.year) === value);
    const history = stored && Array.isArray(stored.history) ? stored.history : [];
    const last = history.at(-1);
    const closed = stored && (last ? last.action === "closed" : Boolean(stored.closedAt && !stored.reopenedAt));
    const works = data().fieldWorks.filter(row => cropYearForRecord(row) === value);
    const harvests = works.filter(row => isHarvestWork(row) && isActualFieldWork(row));
    const shipmentsCount = (data().shipments || []).filter(row => Number(row.season) === value).length;
    return U.clone({ year: value, closed: Boolean(closed), status: closed ? "closed" : "open", closedAt: stored && stored.closedAt || "",
      shipmentsCount, activeCropYear: defaultCropYear(U.today()),
      reopenedAt: stored && stored.reopenedAt || "", history,
      counts: { shipments: shipmentsCount,
        fieldWorks: works.length, otherWorks: data().otherWorks.filter(row => cropYearForRecord(row) === value).length,
        schedules: data().schedules.filter(row => cropYearForRecord(row) === value).length, harvestWorks: harvests.length,
        completedHarvestFields: new Set(harvests.flatMap(row => (row.fieldIds || []).filter(id => (row.harvestStatusByField || {})[id] === "complete"))).size } });
  }

  function defaultShipmentCropYear(date) {
    const actualDate = date || U.today();
    const fallback = cropYearForRecord({ date: actualDate });
    const closedYears = S.normalizeCropYearClosures((data().meta || {}).cropYearClosures).filter(row => S.validCropYear(row.year)
      && cropYearClosureFor(row.year).status === "closed").map(row => Number(row.year));
    if (!closedYears.length) return fallback;
    const closedYear = Math.max(...closedYears);
    const harvestYears = data().fieldWorks.filter(row => isHarvestWork(row) && isActualFieldWork(row)
      && harvestDateYear(row.date) && row.date <= actualDate
      && (row.fieldIds || []).some(id => (row.harvestStatusByField || {})[id] === "complete"))
      .map(row => Number(harvestDateYear(row.date))).filter(year => S.validCropYear(year) && year > closedYear);
    return harvestYears.length ? Math.max(...harvestYears) : closedYear;
  }

  function setActiveCropYear(year) {
    if (S.validCropYear(year) && Number((data().meta || {}).activeCropYear) === Number(year)) return data();
    return mutate(d => {
      if (!S.validCropYear(year)) throw new Error("作付年度は1900〜2200年で指定してください。");
      d.meta.activeCropYear = Number(year);
    }, "新規作業の作付年度を変更しました");
  }

  function closeCropYear(year, options = {}) {
    if (!S.validCropYear(year) || options.switchToNext === true && Number(year) === 2200) {
      return mutate(() => { throw new Error("締める年度と翌年度を1900〜2200年で指定してください。"); });
    }
    if (S.validCropYear(year) && cropYearClosureFor(year).status === "closed") return data();
    return mutate(d => {
      if (!S.validCropYear(year) || options.switchToNext === true && Number(year) === 2200) throw new Error("締める年度と翌年度を1900〜2200年で指定してください。");
      if (!d.shipments.some(row => Number(row.season) === Number(year))) throw new Error("この年度の出荷・販売・配布記録を1件以上保存してから締めてください。");
      const rows = d.meta.cropYearClosures = S.normalizeCropYearClosures(d.meta.cropYearClosures);
      let row = rows.find(item => Number(item.year) === Number(year));
      if (!row) { row = { year: Number(year), closedAt: "", reopenedAt: "", history: [] }; rows.push(row); }
      row.closedAt = U.now(); row.reopenedAt = "";
      row.history.push({ action: "closed", at: U.now(), switchToNext: options.switchToNext === true });
      if (options.switchToNext === true) d.meta.activeCropYear = Number(year) + 1;
    }, "作付年度を締めました");
  }

  function reopenCropYear(year) {
    if (S.validCropYear(year) && cropYearClosureFor(year).status !== "closed") return data();
    return mutate(d => {
      if (!S.validCropYear(year)) throw new Error("作付年度は1900〜2200年で指定してください。");
      d.meta.cropYearClosures = S.normalizeCropYearClosures(d.meta.cropYearClosures);
      const row = d.meta.cropYearClosures.find(item => Number(item.year) === Number(year));
      row.reopenedAt = U.now(); row.history.push({ action: "reopened", at: U.now() });
    }, "作付年度の締めを解除しました");
  }

  function cropYearForSave(draft, record, previous, date) {
    if (record.cropYear !== undefined) {
      if (!S.validCropYear(record.cropYear)) throw new Error("作付年度は1900〜2200年で指定してください。");
      return { cropYear: Number(record.cropYear) };
    }
    if (previous) return S.validCropYear(previous.cropYear) ? { cropYear: Number(previous.cropYear) } : {};
    const source = record.sourceScheduleId && draft.schedules.find(row => row.scheduleId === record.sourceScheduleId);
    if (source) {
      const inherited = cropYearForRecord(source);
      if (!S.validCropYear(inherited)) throw new Error("元の予定の作付年度を確認してください。");
      return { cropYear: inherited };
    }
    const year = defaultCropYear(date);
    if (!S.validCropYear(year)) throw new Error("作付年度を確認してください。");
    return { cropYear: year };
  }

  function seasonForCropYearSave(record, previous, date) {
    return previous && previous.date === date && !S.validCropYear(previous.cropYear)
      && record.cropYear === undefined && S.validCropYear(previous.season)
      ? previous.season : U.season(date);
  }

  function setRecordCropYear(kind, id, year) {
    const table = { fieldWork: ["fieldWorks", "workId"], other: ["otherWorks", "otherWorkId"], schedule: ["schedules", "scheduleId"] }[kind];
    const current = table && data()[table[0]].find(row => row[table[1]] === id);
    if (current && S.validCropYear(year) && current.cropYear === Number(year)) return data();
    return mutate(d => {
      if (!table || !current) throw new Error("年度を変更する記録が見つかりません。");
      if (!S.validCropYear(year)) throw new Error("作付年度は1900〜2200年で指定してください。");
      d[table[0]].find(row => row[table[1]] === id).cropYear = Number(year);
    }, "記録の作付年度を変更しました");
  }

  // Save APIs return data on success and null on failure.
  function lastSaveError() {
    return lastError;
  }

  function save(next, message) {
    let saved = false;
    try {
      reconcileHarvestWaterClosures(next);
      reconcileWorkSchedules(next, { existingOnly: true });
      reconcileExistingWaterSchedules(next);
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
      const restored = U.clone(next);
      reconcileHarvestWaterClosures(restored);
      reconcileWorkSchedules(restored, { existingOnly: true });
      reconcileExistingWaterSchedules(restored);
      cache = storage.replaceData(restored);
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
      if (index < 0) throw new Error("品種が見つかりません。画面を開き直してください。");
      if (Object.prototype.hasOwnProperty.call(patch, "name") && !String(patch.name || "").trim()) throw new Error("品種名を入力してください。");
      d.varieties[index] = { ...d.varieties[index], ...patch, varietyId, updatedAt: U.now() };
    }, "栽培レシピを保存しました");
  }

  // Inspect nested plans and historical records as well as current field links.
  function hasMasterReference(value, key, id) {
    if (!value || typeof value !== "object") return false;
    if (value[key] === id || Array.isArray(value[`${key}s`]) && value[`${key}s`].includes(id)) return true;
    return Object.values(value).some((child) => hasMasterReference(child, key, id));
  }

  function deleteVariety(varietyId) {
    return mutate((d) => {
      if (!d.varieties.some((v) => v.varietyId === varietyId)) throw new Error("品種が見つかりません。");
      if (S.DEFAULT_VARIETIES.some((v) => v.varietyId === varietyId)) throw new Error("標準品種は削除できません。栽培レシピの編集をご利用ください。");
      if (Object.entries(d).some(([key, value]) => key !== "varieties" && hasMasterReference(value, "varietyId", varietyId))) throw new Error("圃場・記録・予定で参照されている品種は削除できません。履歴を保持するため、栽培レシピの編集をご利用ください。");
      d.varieties = d.varieties.filter((v) => v.varietyId !== varietyId);
    }, "品種を削除しました");
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
    return targetScope(work) === "field" && Boolean(work && work.date) && !/(?:予定|確認候補)/.test(name);
  }

  function isHarvestWork(work) {
    return isActualFieldWork(work) && /稲刈り|収穫/.test(String(work.workName || "")) && !/落水/.test(String(work.workName || ""));
  }

  function harvestDateYear(value) {
    if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? String(year) : "";
  }

  function harvestStatusForField(fieldId, year, asOf, options = {}) {
    const through = asOf === undefined ? U.today() : asOf;
    if (!harvestDateYear(through) || !/^[1-9]\d{3}$/.test(String(year))) {
      return { status: "none", harvested: false, date: "", workIds: [] };
    }
    const rows = data().fieldWorks.filter((work) => isHarvestWork(work)
      && (work.fieldIds || []).includes(fieldId) && harvestDateYear(work.date)
      && String(options.cropYear === true && S.validCropYear(work.cropYear) ? cropYearForRecord(work) : harvestDateYear(work.date)) === String(year)
      && String(work.date) <= String(through));
    const complete = rows.filter((work) => (work.harvestStatusByField || {})[fieldId] === "complete");
    const partial = rows.filter((work) => (work.harvestStatusByField || {})[fieldId] === "partial");
    const legacy = rows.filter((work) => !Object.prototype.hasOwnProperty.call(work.harvestStatusByField || {}, fieldId));
    const selected = complete.length ? complete : partial.length ? partial : legacy;
    const status = complete.length ? "complete" : partial.length ? "partial" : legacy.length ? "legacy" : "none";
    const dates = selected.map((work) => work.date).sort();
    return { status, harvested: status === "complete" || status === "legacy",
      date: status === "legacy" ? dates[0] || "" : dates.at(-1) || "",
      workIds: selected.map((work) => work.workId) };
  }

  function confirmHarvestCompletion(workId, fieldId) {
    const work = data().fieldWorks.find((row) => row.workId === workId);
    if (!work || !isHarvestWork(work) || !field(fieldId) || !(work.fieldIds || []).includes(fieldId)
      || !harvestDateYear(work.date) || work.date > U.today()
      || Object.prototype.hasOwnProperty.call(work.harvestStatusByField || {}, fieldId)) return null;
    return mutate((draft) => {
      const saved = draft.fieldWorks.find((row) => row.workId === workId);
      saved.harvestStatusByField = { ...saved.harvestStatusByField, [fieldId]: "complete" };
      saved.updatedAt = U.now();
      (draft.schedules || []).forEach((schedule) => {
        if (schedule.completedByWorkId !== workId) return;
        if (schedule.status === "手動完了" || schedule.completedManuallyAt) return;
        const ids = schedule.fieldIds && schedule.fieldIds.length ? schedule.fieldIds : saved.fieldIds;
        if (ids.length && ids.every((id) => saved.fieldIds.includes(id) && saved.harvestStatusByField[id] === "complete")) return;
        schedule.status = "予定";
        schedule.completedAt = "";
        schedule.completedByWorkId = "";
        schedule.completionReason = "";
        schedule.updatedAt = U.now();
      });
      // Confirm only schedules whose actual targets are now explicitly complete.
      const schedules = (draft.schedules || []).filter((schedule) => {
        if (schedule.status === "手動完了" || schedule.completedManuallyAt) return false;
        const ids = schedule.fieldIds && schedule.fieldIds.length ? schedule.fieldIds : saved.fieldIds;
        return ids.includes(fieldId) && ids.every((id) => saved.fieldIds.includes(id)
          && saved.harvestStatusByField[id] === "complete");
      });
      const source = schedules.find((schedule) => schedule.scheduleId === saved.sourceScheduleId);
      if (source && scheduleMatchesWork(source, saved, { explicitSource: true })) {
        source.status = "実施済み";
        source.completedAt = U.now();
        source.completedByWorkId = saved.workId;
        source.completionReason = `${saved.workName || "作業"}の作業記録により完了`;
        source.updatedAt = U.now();
      }
      completeMatchingSchedules({ schedules }, saved);
    }, "この圃場の刈り取り完了を確認しました");
  }

  function harvestClosureFor(draft, fieldId, startDate) {
    const year = harvestDateYear(startDate);
    if (!year || !fieldId) return null;
    return (draft.fieldWorks || []).filter((work) => isHarvestWork(work)
      && harvestDateYear(work.date) === year && work.date >= startDate && work.date <= U.today()
      && (work.fieldIds || []).includes(fieldId) && (work.harvestStatusByField || {})[fieldId] === "complete")
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.workId).localeCompare(String(b.workId)))[0] || null;
  }

  function waterRecordForHarvestEdit(record, previous) {
    if (!previous || !previous.harvestAutoEnd || previous.harvestAutoEnd.blocked) return record;
    const auto = previous.harvestAutoEnd;
    const edited = { ...record };
    const manualEnd = record.harvestEndOverride === true
      || record.actualEndDate !== undefined && record.actualEndDate !== auto.date;
    if (manualEnd) {
      edited.harvestAutoEnd = undefined;
      // Keep the closed movement history when a user explicitly takes ownership.
      if (!Array.isArray(edited.waterMovements) && Array.isArray(previous.waterMovements)) edited.waterMovements = previous.waterMovements;
    } else {
      edited.harvestAutoEnd = U.clone(auto);
      edited.actualEndDate = auto.date;
      if (record.status !== undefined) edited.harvestAutoEnd.original.status = record.status === "完了" ? auto.original.status : record.status;
      if (record.periodStatus !== undefined) edited.harvestAutoEnd.original.periodStatus = record.periodStatus === "完了" ? auto.original.periodStatus : record.periodStatus;
      if (Array.isArray(record.waterMovements) && JSON.stringify(record.waterMovements) !== JSON.stringify(previous.waterMovements)) {
        edited.harvestAutoEnd.original.waterMovements = U.clone(record.waterMovements);
      }
    }
    return edited;
  }

  // Auto-owned boundaries are reversible; recorded manual ends are never changed.
  function reconcileHarvestWaterClosures(draft) {
    const changedDryFields = new Set();
    [...(draft.dryPeriods || []), ...(draft.irrigations || [])].forEach((row) => {
      const oldEnd = row.actualEndDate;
      const auto = row.harvestAutoEnd;
      if (auto && !auto.blocked && row.actualEndDate === auto.date) {
        row.actualEndDate = auto.original.actualEndDate;
        if (row.type === "dryPeriod") row.status = auto.original.status;
        else { row.status = auto.original.status; row.periodStatus = auto.original.periodStatus; }
        if (Array.isArray(auto.original.waterMovements)) row.waterMovements = U.clone(auto.original.waterMovements);
      }
      delete row.harvestAutoEnd;
      const planned = !row.startDate && Boolean(row.plannedStartDate || row.endDate || /予定/.test(String(row.status || row.periodStatus || "")));
      const startDate = planned ? "" : row.startDate || row.date || "";
      const knownKind = row.type === "dryPeriod" || Boolean(waterKindFromMethod(row.method));
      const work = !row.actualEndDate && !planned && knownKind ? harvestClosureFor(draft, row.fieldId, startDate) : null;
      const movements = row.waterMovements || [];
      // Later recorded movements contradict an automatic boundary: keep all facts.
      if (work) {
        const blocked = movements.some((movement) => !harvestDateYear(movement.startDate) || movement.startDate > work.date);
        row.harvestAutoEnd = { workId: work.workId, date: work.date, original: {
          actualEndDate: row.actualEndDate || "", status: row.status || "", periodStatus: row.periodStatus || "",
          ...(Array.isArray(row.waterMovements) ? { waterMovements: U.clone(row.waterMovements) } : {})
        } };
        if (blocked) {
          row.harvestAutoEnd.blocked = true;
          row.harvestAutoEnd.reason = "movement-outside-harvest";
          if (row.type === "dryPeriod" && oldEnd !== row.actualEndDate) changedDryFields.add(row.fieldId);
          return;
        }
        row.actualEndDate = work.date;
        if (row.type === "dryPeriod") row.status = "完了";
        else { row.status = "終了"; row.periodStatus = "完了"; }
        if (Array.isArray(row.waterMovements)) row.waterMovements = movements.map((movement) =>
          !movement.endDate || movement.endDate > work.date ? { ...movement, endDate: work.date } : movement);
      }
      if (row.type === "dryPeriod" && oldEnd !== row.actualEndDate) changedDryFields.add(row.fieldId);
    });
    (draft.fieldWorks || []).forEach((work) => { delete work.harvestWaterClosures; });
    (draft.fields || []).forEach((field) => {
      const years = new Set((draft.fieldWorks || []).filter((work) => (work.fieldIds || []).includes(field.fieldId))
        .map((work) => harvestDateYear(work.date)).filter(Boolean));
      years.forEach((year) => legacyWaterPeriodsFrom(draft, field.fieldId, year).forEach((period) => {
        if (period.actualEndDate || period.requiresDateReview || period.migrated) return;
        const harvest = harvestClosureFor(draft, field.fieldId, period.startDate);
        if (harvest) period.raw.harvestWaterClosures = { ...period.raw.harvestWaterClosures,
          [field.fieldId]: { workId: harvest.workId, date: harvest.date } };
      }));
    });
    changedDryFields.forEach((id) => refreshDryingSummary(draft, id));
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
    // 出穂後日数の基準日は、専用の「出穂確認」だけに限定する。
    // 現地で選んだ生育ステージや作業名の「出穂」は、判断・作業の記録であって
    // 出穂日そのものとは限らない。
    const dates = growthLogsFor(fieldId, year)
      .filter((log) => onOrBefore(log) && log.headingObserved)
      .map((log) => log.date);
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
    const headingLog = logs.find((log) => log.headingObserved) || null;
    const headingDate = headingDateForField(fieldId, targetYear, asOfDate);
    const headingSource = headingLog ? "growthLog" : "";
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

  function targetScope(record) {
    return record && record.targetScope === "offField" ? "offField" : "field";
  }

  function workTargets(draft, record, previous) {
    const scope = record.targetScope === undefined ? targetScope(previous) : targetScope(record);
    const ids = scope === "offField" ? [] : (record.fieldIds === undefined ? previous && previous.fieldIds || [] : record.fieldIds);
    // Existing legacy records may have lost targets; new field work must not.
    if (scope === "field" && (!previous || targetScope(previous) === "offField")) {
      if (!Array.isArray(ids) || !ids.length || ids.some((id) => !draft.fields.some((field) => field.fieldId === id))) {
        throw new Error("対象の圃場を選択してください。");
      }
    }
    return { targetScope: scope, fieldIds: ids.slice() };
  }

  function scheduleMatchesWork(schedule, work, options = {}) {
    if (!schedule || !work || schedule.status === "実施済み" || schedule.status === "手動完了") return false;
    if (targetScope(schedule) !== targetScope(work)) return false;
    const scheduleFields = schedule.fieldIds || [];
    const workFields = work.fieldIds || [];
    const year = harvestDateYear(work.date);
    if (!year || harvestDateYear(schedule.date) !== year) return false;
    if (options.explicitSource && !options.partialTargets
      && scheduleFields.some((id) => !workFields.includes(id))) return false;
    if (isHarvestWork(work) && work.harvestStatusByField) {
      const targets = scheduleFields.length ? scheduleFields : workFields;
      if (!targets.length || !targets.every((id) => workFields.includes(id)
        && work.harvestStatusByField[id] === "complete")) return false;
    }
    if (scheduleFields.length && !scheduleFields.some((id) => workFields.includes(id))) return false;
    const diff = Math.abs(U.daysBetween(schedule.date, work.date));
    if (!options.explicitSource && (!Number.isFinite(Number(diff)) || diff === "" || diff > 2)) return false;
    const scheduleKey = scheduleKeyword(`${schedule.title || ""} ${schedule.scheduleType || ""}`);
    const workKey = scheduleKeyword(work.workName || "");
    if (scheduleKey && workKey) return scheduleKey === workKey;
    const a = scheduleText(`${schedule.title || ""}${schedule.scheduleType || ""}`);
    const b = scheduleText(work.workName || "");
    return Boolean(a && b && (a.includes(b) || b.includes(a)));
  }

  function completeMatchingSchedules(d, work) {
    if (!isHarvestWork(work)) reconcileWorkSchedules(d);
    (d.schedules || []).forEach((schedule) => {
      if (!isHarvestWork(work)) return;
      if (!scheduleMatchesWork(schedule, work)) return;
      schedule.status = "実施済み";
      schedule.completedAt = U.now();
      schedule.completedByWorkId = work.workId;
      schedule.completionReason = `${work.workName || "作業"}の作業記録により完了`;
      schedule.updatedAt = U.now();
    });
  }

  function reconcileWorkSchedules(d, options = {}) {
    (d.schedules || []).forEach((schedule) => {
      if (schedule.completedManuallyAt || schedule.status === "手動完了"
        || schedule.completedByWaterPeriodId || schedule.completionLink) return;
      const owner = (d.fieldWorks || []).find((row) => row.workId === schedule.completedByWorkId);
      if (owner && isHarvestWork(owner)) return;
      if (options.existingOnly && (!owner || schedule.status !== "実施済み")) return;
      if (schedule.status === "実施済み" && !schedule.completedByWorkId) return;
      const pending = { ...schedule, status: "予定" };
      const matches = (d.fieldWorks || []).filter((row) => !isHarvestWork(row)
        && !/予定|確認候補/.test(String(row.status || ""))
        && scheduleMatchesWork(pending, row, {
          explicitSource: row.sourceScheduleId === schedule.scheduleId, partialTargets: true
        }));
      const targets = schedule.fieldIds || [];
      const complete = targetScope(schedule) === "offField" ? matches.length > 0
        : targets.length ? targets.every((id) => matches.some((row) => (row.fieldIds || []).includes(id)))
          : matches.length > 0;
      if (complete) {
        if (options.existingOnly) return;
        const last = matches[matches.length - 1];
        const reason = `${last.workName || "作業"}の作業記録により完了`;
        if (schedule.status === "実施済み" && schedule.completedAt
          && schedule.completedByWorkId === last.workId && schedule.completionReason === reason) return;
        schedule.status = "実施済み";
        schedule.completedAt = schedule.completedAt || U.now();
        schedule.completedByWorkId = last.workId;
        schedule.completionReason = reason;
      } else if (schedule.completedByWorkId) {
        schedule.status = "予定";
        schedule.completedAt = "";
        schedule.completedByWorkId = "";
        schedule.completionReason = "";
      } else return;
      schedule.updatedAt = U.now();
    });
  }

  function fieldNameForFeedback(fieldId) {
    const found = field(fieldId);
    return found && found.name || "圃場";
  }

  function workSaveFeedback(record) {
    const previous = record.workId && data().fieldWorks.find((work) => work.workId === record.workId);
    if ((record.targetScope === undefined ? targetScope(previous) : targetScope(record)) === "offField") return "作業を保存しました。";
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

  function daysThrough(startDate, endDate) {
    const days = U.daysBetween(startDate, endDate);
    return days === "" || Number(days) < 0 ? "" : String(Number(days) + 1);
  }

  function harvestWaterSnapshot(draft, fieldId, harvestDate) {
    const season = String(U.season(harvestDate));
    const waterRows = [...(draft.dryPeriods || []), ...(draft.irrigations || [])]
      .filter((row) => String(row.fieldId || "") === String(fieldId))
      .filter((row) => String(waterPeriodYear(row)) === season);
    const candidates = [];
    waterRows.forEach((row) => {
      const kind = row.type === "dryPeriod" ? "dry" : waterKindFromMethod(row.method);
      (row.waterMovements || []).forEach((movement) => {
        const date = String(movement && movement.startDate || "");
        if (movement && movement.phase === "flood" && date && date <= harvestDate) {
          candidates.push({ date, label: kind === "saturated" ? "給水・飽水" : "入水" });
        }
      });
    });
    const lastWatering = candidates.sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) || null;
    const finalDrain = waterRows
      .filter((row) => waterKindFromMethod(row.method) === "drain")
      .filter((row) => row.startDate || !(row.plannedStartDate || row.endDate || /予定/.test(`${row.status || ""} ${row.periodStatus || ""}`)))
      .map((row) => String(row.startDate || row.date || ""))
      .filter((date) => date && date <= harvestDate)
      .sort()
      .at(-1) || "";
    const headingDate = headingDateForField(fieldId, season, finalDrain || harvestDate);
    const elapsedDays = (start, end) => {
      const days = start && end ? U.daysBetween(start, end) : "";
      return days === "" || !Number.isFinite(Number(days)) || Number(days) < 0 ? "" : String(days);
    };
    return {
      lastWateringDate: lastWatering ? lastWatering.date : "",
      lastWateringLabel: lastWatering ? lastWatering.label : "",
      daysFromLastWatering: lastWatering ? daysThrough(lastWatering.date, harvestDate) : "",
      finalDrainDate: finalDrain,
      daysFromFinalDrain: finalDrain ? daysThrough(finalDrain, harvestDate) : "",
      elapsedDaysFromFinalDrain: elapsedDays(finalDrain, harvestDate),
      elapsedDaysFromHeadingToDrain: elapsedDays(headingDate, finalDrain),
      rewateringAfterDrain: Boolean(finalDrain && candidates.some((item) => item.date > finalDrain))
    };
  }

  function harvestOutlookSnapshot(draft, fieldId, harvestDate) {
    const season = String(U.season(harvestDate));
    const forecast = ((draft.meta && draft.meta.outlookSnapshots) || [])
      .filter((row) => String(row.fieldId || "") === String(fieldId) && String(row.season || "") === season)
      .filter((row) => row && row.harvestDate && row.harvestKind !== "actual" && String(row.asOf || "") <= harvestDate)
      .slice()
      .sort((a, b) => String(a.asOf || "").localeCompare(String(b.asOf || "")))
      .at(-1);
    if (!forecast) return { status: "見通し記録なし", predictedHarvestDate: "", predictedAsOf: "", errorDays: "" };
    return {
      status: "比較済み",
      predictedHarvestDate: String(forecast.harvestDate),
      predictedAsOf: String(forecast.asOf || ""),
      errorDays: U.daysBetween(String(forecast.harvestDate), harvestDate)
    };
  }

  function harvestSnapshotsForWork(draft, work) {
    return (work.fieldIds || []).map((fieldId) => ({
      fieldId: String(fieldId),
      season: U.season(work.date),
      harvestDate: String(work.date),
      savedAt: U.now(),
      water: harvestWaterSnapshot(draft, fieldId, work.date),
      outlook: harvestOutlookSnapshot(draft, fieldId, work.date),
      thermal: { status: "気象実績を取得中" }
    }));
  }

  function saveFieldWork(record) {
    return mutate((d) => {
      const date = record.date || U.today();
      const previous = record.workId ? d.fieldWorks.find((work) => work.workId === record.workId) : null;
      const targets = workTargets(d, record, previous);
      const offField = targets.targetScope === "offField";
      if (offField && previous && targetScope(previous) === "field"
        && ((previous.fieldIds || []).length || (previous.orphanedFieldIds || []).length)
        && (isPlantingWorkName(previous.workName) || isHeadingWorkName(previous.workName)
          || isDryStartWorkName(previous.workName) || isDryEndWorkName(previous.workName)
          || legacyWaterEventFromWorkName(previous.workName) || (previous.waterMigrationLinks || []).length)) {
        throw new Error("圃場の生育・水管理に紐付いた作業は、対象範囲を変更できません。");
      }
      if (!offField && waterEventFromWorkName(record.workName) && !record.legacyWaterRecord) {
        throw new Error("中干し・間断灌水・深水・落水は、水管理として記録してください。");
      }
      const harvestReview = record.harvestReview === undefined ? previous && previous.harvestReview : S.normalizeHarvestReview(record.harvestReview, true);
      const mergedHarvestReview = record.harvestReview === undefined ? harvestReview
        : S.normalizeHarvestReview({ ...(previous && previous.harvestReview || {}), ...record.harvestReview }, true);
      const targetFieldIds = targets.fieldIds;
      const timingHarvest = !offField && isHarvestWork({ ...record, date, targetScope: targets.targetScope });
      const timingInput = record.harvestTimingByField;
      if (timingInput !== undefined && (!timingInput || typeof timingInput !== "object" || Array.isArray(timingInput))) {
        throw new Error("圃場別の収穫時期評価を確認してください。");
      }
      if (timingInput && Object.keys(timingInput).some((id) => !timingHarvest || !targetFieldIds.includes(id))) {
        throw new Error("収穫時期評価は稲刈り実績の対象圃場にだけ保存できます。");
      }
      let harvestTimingByField;
      if (timingHarvest && (timingInput !== undefined || previous && previous.harvestTimingByField !== undefined)) {
        harvestTimingByField = {};
        targetFieldIds.forEach((id) => {
          const old = previous && previous.harvestTimingByField && previous.harvestTimingByField[id];
          const supplied = timingInput && timingInput[id];
          if (supplied === undefined && !old) return;
          if (supplied !== undefined && (!supplied || typeof supplied !== "object" || Array.isArray(supplied))) throw new Error("収穫時期評価の形式を確認してください。");
          const timingKeys = ["assessment", "idealStartDate", "idealEndDate", "moisturePct", "moistureDate", "yellowing", "delayReason", "memo"];
          if (supplied && timingKeys.every((key) => supplied[key] === "")) return;
          const value = S.normalizeHarvestTiming({ ...old, ...Object.fromEntries(Object.entries(supplied || {}).filter(([, item]) => item !== undefined)) }, true, date);
          delete value.thermal;
          if (old && old.thermal && previous.date === date
            && ["assessment", "idealStartDate", "idealEndDate"].every((key) => value[key] === old[key])) value.thermal = U.clone(old.thermal);
          const targetField = d.fields.find((field) => field.fieldId === id);
          const varietyId = targetField && targetField.varietyId || "";
          const variety = d.varieties.find((item) => item.varietyId === varietyId);
          value.varietyId = old && old.varietyId !== undefined ? old.varietyId : varietyId;
          value.varietyName = old && old.varietyName !== undefined ? old.varietyName : variety && variety.name || "";
          delete value.varietySource;
          if (old && old.varietySource !== undefined) value.varietySource = old.varietySource;
          else if (!old || old.varietyId === undefined && old.varietyName === undefined) value.varietySource = "assessment-current-master";
          value.season = String(U.season(date));
          const content = ({ evaluatedAt, thermal, ...rest }) => rest;
          value.evaluatedAt = old && JSON.stringify(content(S.normalizeHarvestTiming(old))) === JSON.stringify(content(value))
            ? old.evaluatedAt || U.now() : U.now();
          harvestTimingByField[id] = value;
        });
      }
      let harvestStatusByField;
      if (!offField && isHarvestWork({ ...record, date, targetScope: targets.targetScope })) {
        const requested = record.harvestStatusByField === undefined ? previous && previous.harvestStatusByField : record.harvestStatusByField;
        if (requested !== undefined) {
          if (!harvestDateYear(date)) throw new Error("実在する稲刈り日を入力してください。");
          if (!requested || typeof requested !== "object" || Array.isArray(requested)) throw new Error("圃場別の収穫状態を確認してください。");
          harvestStatusByField = {};
          targetFieldIds.forEach((id) => {
            const value = requested[id];
            if (["partial", "complete"].includes(value)) harvestStatusByField[id] = value;
            else if (!(previous && (previous.fieldIds || []).includes(id)
              && !Object.prototype.hasOwnProperty.call(previous.harvestStatusByField || {}, id) && value === undefined)) {
              throw new Error("各圃場の稲刈りを一部・完了から選択してください。");
            }
          });
        }
      }
      const requestedLinks = offField ? [] : record.herbicideLinks === undefined ? (previous && previous.herbicideLinks || []) : record.herbicideLinks;
      if (!Array.isArray(requestedLinks)) throw new Error("除草体系の紐付けを確認してください。");
      const herbicideLinks = (record.workName === "除草剤" ? requestedLinks : []).filter((link) => targetFieldIds.includes(link.fieldId));
      const assignments = Array.isArray(d.meta && d.meta.herbicideAssignments) ? d.meta.herbicideAssignments : [];
      if (herbicideLinks.some((link) => !assignments.some((a) => a.assignmentId === link.assignmentId && a.fieldId === link.fieldId && String(a.year) === String(date).slice(0, 4) && Array.isArray(a.steps) && a.steps.some((s) => s.id === link.stepId)))) throw new Error("除草体系の年度・圃場が作業と一致しません。選び直してください。");
      const batchId = offField ? "" : String(record.batchId || previous && previous.batchId || (targetFieldIds.length > 1 ? U.id("batch", date) : ""));
      const timeAccounting = offField ? "single" : record.timeAccounting || previous && previous.timeAccounting || (targetFieldIds.length > 1 ? "shared" : "single");
      const totalHours = record.totalHours || record.hours || previous && previous.totalHours || "";
      const totalHoursValue = U.parseWorkHours(totalHours);
      const fieldAllocatedHours = offField ? {} : record.fieldAllocatedHours || (timeAccounting === "shared" && targetFieldIds.length > 1 && totalHoursValue
        ? Object.fromEntries(targetFieldIds.map((fieldId) => [fieldId, Math.round(totalHoursValue / targetFieldIds.length * 100) / 100]))
        : previous && previous.fieldAllocatedHours || {});
      const normalized = {
        workId: record.workId || U.id("work", date),
        type: "fieldWork",
        targetScope: targets.targetScope,
        date,
        season: seasonForCropYearSave(record, previous, date),
        ...cropYearForSave(d, record, previous, date),
        fieldIds: targetFieldIds,
        batchId,
        batchFieldIds: offField ? [] : (record.batchFieldIds || previous && previous.batchFieldIds || targetFieldIds).slice(),
        ...(offField ? { orphanedFieldIds: [], waterMigrationLinks: [] } : {}),
        timeAccounting,
        totalHours,
        fieldAllocatedHours,
        workName: record.workName || "その他",
        worker: record.worker || "",
        hours: record.hours || "",
        machine: record.machine || "",
        // The visible machine name remains the established record field.
        // Keep an optional master reference for a later picker without
        // rewriting historical work records.
        machineId: record.machineId === undefined ? (previous && previous.machineId || "") : String(record.machineId || ""),
        material: record.material || "",
        materialId: record.materialId === undefined
          ? (previous && String(previous.material || "") === String(record.material || "") ? previous.materialId || "" : "")
          : String(record.materialId || ""),
        amount: record.amount || "",
        herbicideLinks: U.clone(herbicideLinks),
        herbicideCategory: record.herbicideCategory === undefined ? (previous && previous.herbicideCategory || "") : String(record.herbicideCategory || ""),
        herbicidePurpose: record.herbicidePurpose === undefined ? (previous && previous.herbicidePurpose || "") : String(record.herbicidePurpose || ""),
        fertilizerRateKg10a: record.fertilizerRateKg10a || "",
        fertilizerTotalKg: record.fertilizerTotalKg || "",
        fertilizerBagCount: record.fertilizerBagCount || "",
        sourceScheduleId: record.sourceScheduleId || previous && previous.sourceScheduleId || "",
        // The regular work form does not edit fertilizer decision snapshots.
        // Retain them until the dedicated fertilizer flow explicitly replaces them.
        growthSnapshots: offField ? {} : record.growthSnapshots === undefined
          ? (previous && previous.growthSnapshots || {})
          : record.growthSnapshots,
        harvestSnapshots: offField ? [] : record.harvestSnapshots === undefined
          ? (previous && previous.harvestSnapshots || [])
          : record.harvestSnapshots,
        harvestStatusByField,
        harvestTimingByField,
        ...(mergedHarvestReview !== undefined && mergedHarvestReview !== null ? { harvestReview: U.clone(mergedHarvestReview) } : {}),
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
      if (!offField && /稲刈り|収穫/.test(String(normalized.workName || ""))) {
        const existing = Array.isArray(normalized.harvestSnapshots) ? normalized.harvestSnapshots : [];
        normalized.harvestSnapshots = harvestSnapshotsForWork(d, normalized).map((snapshot) =>
          existing.find((item) => item.fieldId === snapshot.fieldId && item.harvestDate === snapshot.harvestDate) || snapshot);
        const savedIndex = d.fieldWorks.findIndex((work) => work.workId === normalized.workId);
        if (savedIndex >= 0) d.fieldWorks[savedIndex] = { ...d.fieldWorks[savedIndex], harvestSnapshots: normalized.harvestSnapshots };
      }
      // An edited work may no longer satisfy the schedule it previously
      // completed. Re-open it first, then let the current record re-match.
      if (previous) {
        (d.schedules || []).forEach((schedule) => {
          if (schedule.completedByWorkId !== normalized.workId) return;
          if (schedule.completedManuallyAt || schedule.status === "手動完了") return;
          schedule.status = "予定";
          schedule.completedAt = "";
          schedule.completedByWorkId = "";
          schedule.completionReason = "";
          schedule.updatedAt = U.now();
        });
      }
      if (normalized.sourceScheduleId) {
        const scheduleIndex = (d.schedules || []).findIndex((schedule) => schedule.scheduleId === normalized.sourceScheduleId);
        if (scheduleIndex >= 0 && scheduleMatchesWork({ ...d.schedules[scheduleIndex], status: "予定" }, normalized, { explicitSource: true, partialTargets: !isHarvestWork(normalized) })) {
          if (isHarvestWork(normalized)) {
          d.schedules[scheduleIndex] = {
            ...d.schedules[scheduleIndex],
            status: "実施済み",
            completedAt: U.now(),
            completedByWorkId: normalized.workId,
            completionReason: `${normalized.workName || "作業"}の作業記録により完了`,
            updatedAt: U.now()
          };
          }
        } else {
          normalized.sourceScheduleId = "";
          if (index >= 0) d.fieldWorks[index] = { ...d.fieldWorks[index], sourceScheduleId: "" };
        }
      }
      completeMatchingSchedules(d, normalized);
      if (offField) return;
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

  function saveHarvestWeatherSnapshot(workId, fieldId, expectedHarvestDate, expectedDrainDate, payload) {
    let weather = S.normalizeHarvestWeather(payload);
    const work = (cache.fieldWorks || []).find((row) => row.workId === workId);
    const snapshot = work && (work.harvestSnapshots || []).find((row) => row.fieldId === fieldId);
    if (!weather || !work || !["稲刈り", "収穫"].includes(work.workName)
      || !(work.fieldIds || []).includes(fieldId) || !(cache.fields || []).some((row) => row.fieldId === fieldId)
      || work.date !== expectedHarvestDate || !snapshot || snapshot.harvestDate !== expectedHarvestDate
      || (snapshot.water && snapshot.water.finalDrainDate || "") !== expectedDrainDate
      || weather.startDate !== expectedDrainDate || weather.endDate !== expectedHarvestDate) return null;
    const old = S.normalizeHarvestWeather(snapshot.weather);
    if (old && (old.tempCount || old.rainCount)) {
      if (old.startDate !== weather.startDate || old.endDate !== weather.endDate
        || old.latitude !== weather.latitude || old.longitude !== weather.longitude) return null;
      // Merge against the latest saved cells, not the state at request start.
      if (!["partial", "complete"].includes(weather.status)
        || old.fetchedAt && weather.fetchedAt && weather.fetchedAt < old.fetchedAt) return null;
      const byDate = new Map(old.rows.map((row) => [row.date, row]));
      weather = S.normalizeHarvestWeather({ ...weather, rows: weather.rows.map((row) => {
        const before = byDate.get(row.date);
        if (!before || before.tempMean === "" && before.precipitation === "") return row;
        return { ...row, source: "Open-Meteo Archive",
          tempMean: before.tempMean !== "" ? before.tempMean : row.tempMean,
          precipitation: before.precipitation !== "" ? before.precipitation : row.precipitation };
      }) });
    }
    if (JSON.stringify(old) === JSON.stringify(weather)) return null;
    return mutate((draft) => {
      const target = draft.fieldWorks.find((row) => row.workId === workId).harvestSnapshots.find((row) => row.fieldId === fieldId);
      target.weather = weather;
    }, "収穫期間の過去気象参照を保存しました");
  }

  function saveHarvestThermalSnapshots(workId, snapshots, options) {
    const id = String(workId || "");
    const incoming = (Array.isArray(snapshots) ? snapshots : []).filter((item) => item && item.fieldId);
    if (!id || !incoming.length) return null;
    const current = data().fieldWorks.find((work) => work.workId === id);
    if (!current || !isHarvestWork(current)
      || options && options.expectedWork && JSON.stringify(current) !== options.expectedWork) return null;
    const validated = [];
    for (const item of incoming) {
      const basis = actualHarvestThermalBasis(current, String(item.fieldId));
      const coverage = basis && actualHarvestThermalCoverage(options && options.rowsByField && options.rowsByField[item.fieldId], basis);
      if (!coverage || !coverage.count) return null;
      validated.push({ ...item, headingDate: basis.headingDate, startDate: basis.startDate, endDate: current.date,
        coverageVersion: 1, locationToken: JSON.stringify(basis.location),
        total: coverage.total, count: String(coverage.count), expectedDays: String(coverage.expectedDays),
        difference: item.target === "" || item.target == null ? "" : Math.round((coverage.total - Number(item.target)) * 10) / 10,
        status: coverage.count === coverage.expectedDays ? "確定" : "一部欠測", source: "Open-Meteo Archive" });
    }
    return mutate((draft) => {
      const workIndex = (draft.fieldWorks || []).findIndex((work) => work.workId === id);
      if (workIndex < 0 || !/稲刈り|収穫/.test(String(draft.fieldWorks[workIndex].workName || ""))) return;
      const work = draft.fieldWorks[workIndex];
      const byField = new Map(validated.map((item) => [String(item.fieldId), item]));
      work.harvestSnapshots = (work.harvestSnapshots || []).map((snapshot) => {
        const thermal = byField.get(String(snapshot.fieldId || ""));
        return thermal ? { ...snapshot, thermal, savedAt: U.now() } : snapshot;
      });
      draft.fieldWorks[workIndex] = work;
    }, "収穫時の積算気温を保存しました");
  }

  function actualHarvestThermalBasis(work, fieldId) {
    if (!work || !isHarvestWork(work) || !(work.fieldIds || []).includes(fieldId) || !field(fieldId)
      || !harvestDateYear(work.date) || work.date > U.today()) return null;
    const headings = [...new Set(data().growthLogs.filter(row => row.fieldId === fieldId && row.headingObserved === true
      && harvestDateYear(row.date) === harvestDateYear(work.date) && row.date <= work.date).map(row => row.date))];
    const location = data().meta && data().meta.weatherLocation;
    if (headings.length !== 1 || !location || !["latitude", "longitude"].every(key =>
      ["number", "string"].includes(typeof location[key]) && String(location[key]).trim() !== "" && Number.isFinite(Number(location[key])))
      || Math.abs(Number(location.latitude)) > 90 || Math.abs(Number(location.longitude)) > 180) return null;
    const headingDate = headings[0], startDate = U.dateAddDays(headingDate, 1);
    if (!harvestDateYear(startDate) || startDate > work.date) return null;
    return { headingDate, startDate, endDate: work.date, location, expectedDays: Number(U.daysBetween(startDate, work.date)) + 1 };
  }

  function actualHarvestThermalCoverage(rows, basis) {
    if (!Array.isArray(rows)) return null;
    const byDate = new Map();
    for (const row of rows) {
      if (!row || !harvestDateYear(row.date) || row.date < basis.startDate || row.date > basis.endDate) return null;
      if (!byDate.has(row.date)) byDate.set(row.date, []);
      byDate.get(row.date).push(row);
    }
    const values = [...byDate.values()].filter(matches => matches.length === 1).map(matches => matches[0])
      .filter(row => row.date < U.today() && row.source === "Open-Meteo Archive"
        && !/forecast|seasonal/i.test(`${row.dataset || ""} ${row.model || ""}`)
        && typeof row.tempMean === "number" && Number.isFinite(row.tempMean)).map(row => row.tempMean);
    return { count: values.length, expectedDays: basis.expectedDays,
      total: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : "" };
  }

  function completeHarvestThermal(thermal, basis) {
    return Boolean(thermal && basis && basis.endDate < U.today() && thermal.status === "確定"
      && thermal.coverageVersion === 1 && thermal.locationToken === JSON.stringify(basis.location)
      && thermal.headingDate === basis.headingDate && thermal.startDate === basis.startDate && thermal.endDate === basis.endDate
      && thermal.source === "Open-Meteo Archive" && typeof thermal.total === "number" && Number.isFinite(thermal.total)
      && Number(thermal.count) === basis.expectedDays && Number(thermal.expectedDays) === basis.expectedDays
      && typeof thermal.retrievedAt === "string" && Number.isFinite(Date.parse(thermal.retrievedAt)));
  }

  function isHarvestThermalComplete(workId, fieldId) {
    const work = data().fieldWorks.find(row => row.workId === workId);
    const snapshot = work && (work.harvestSnapshots || []).find(row => row.fieldId === fieldId && row.harvestDate === work.date);
    return completeHarvestThermal(snapshot && snapshot.thermal, actualHarvestThermalBasis(work, fieldId));
  }

  function harvestTimingThermalBasis(workId, fieldId) {
    const work = data().fieldWorks.find(row => row.workId === workId);
    const timing = work && work.harvestTimingByField && work.harvestTimingByField[fieldId];
    if (!work || !isHarvestWork(work) || !(work.fieldIds || []).includes(fieldId) || !timing) return null;
    const dates = [...new Set([timing.idealStartDate, timing.idealEndDate].filter(Boolean))];
    if (!dates.length && timing.assessment === "appropriate") dates.push(work.date);
    const headingDate = headingDateForField(fieldId, U.season(work.date), work.date);
    const startDate = harvestDateYear(headingDate) ? RiceOS.agro && RiceOS.agro.postHeadingThermalStart
      ? RiceOS.agro.postHeadingThermalStart(headingDate) : U.dateAddDays(headingDate, 1) : "";
    const location = data().meta && data().meta.weatherLocation;
    return { work, timing, dates: dates.sort(), headingDate, startDate, location, locationToken: JSON.stringify(location || null) };
  }

  function harvestTimingThermalMatchesBasis(basis) {
    const thermal = basis && basis.timing.thermal;
    if (!thermal || thermal.source !== "Open-Meteo Archive (reanalysis/model)"
      || thermal.headingDate !== basis.headingDate || thermal.startDate !== basis.startDate
      || thermal.locationToken !== basis.locationToken
      || JSON.stringify((thermal.endpoints || []).map(row => row.date)) !== JSON.stringify(basis.dates)) return false;
    if (thermal.endpoints.some(row => {
      const expected = harvestDateYear(row.date) && harvestDateYear(basis.startDate) && row.date >= basis.startDate
        ? Number(U.daysBetween(basis.startDate, row.date)) + 1 : 0;
      return row.expectedDays !== expected || !Number.isInteger(row.count) || row.count < 0 || row.count > expected
        || row.status === "complete" && (expected <= 0 || row.count !== expected || typeof row.total !== "number"
          || !Number.isFinite(row.total) || row.source !== "Open-Meteo Archive (reanalysis/model)");
    })) return false;
    return true;
  }

  function harvestTimingThermalIsCurrent(workId, fieldId) {
    const basis = harvestTimingThermalBasis(workId, fieldId);
    if (!harvestTimingThermalMatchesBasis(basis)) return false;
    return basis.timing.thermal.endpoints.every(row => row.status === "complete") || basis.timing.thermal.asOf === U.today();
  }

  function harvestTimingComparisonFor(fieldId) {
    if (!fieldId) return [];
    return data().fieldWorks.filter(work => isHarvestWork(work) && harvestDateYear(work.date) && work.date <= U.today()
      && (work.fieldIds || []).includes(fieldId)).map(work => {
      const timing = work.harvestTimingByField && work.harvestTimingByField[fieldId];
      const snapshot = (work.harvestSnapshots || []).find(row => row.fieldId === fieldId && row.harvestDate === work.date);
      const stored = snapshot && snapshot.thermal;
      const headingDate = stored && stored.headingDate;
      const startDate = stored && stored.startDate;
      const actualSource = stored && typeof stored.source === "string" ? stored.source.trim() : "";
      const expectedDays = harvestDateYear(startDate) && startDate <= work.date ? Number(U.daysBetween(startDate, work.date)) + 1 : 0;
      const numeric = stored && stored.total !== "" && stored.total != null
        && ["number", "string"].includes(typeof stored.total) && String(stored.total).trim() !== "" && Number.isFinite(Number(stored.total));
      const supported = stored && expectedDays > 0 && harvestDateYear(headingDate) && headingDate <= startDate
        && stored.endDate === work.date && Number(stored.expectedDays) === expectedDays && Number.isInteger(Number(stored.count))
        && Number(stored.count) > 0 && Number(stored.count) <= expectedDays && numeric
        && actualSource && !/forecast/i.test(actualSource) && work.date < U.today();
      const actualThermal = stored ? {
        total: supported ? Number(stored.total) : "",
        status: supported && Number(stored.count) === expectedDays ? "complete"
          : !actualSource || /forecast/i.test(actualSource) || !expectedDays
            || Number(stored.expectedDays) !== expectedDays ? "unknown" : "missing",
        count: supported ? Number(stored.count) : 0,
        expectedDays: supported ? expectedDays : 0,
        headingDate: harvestDateYear(headingDate) && headingDate <= work.date ? headingDate : "",
        startDate: harvestDateYear(startDate) && startDate <= work.date ? startDate : "",
        endDate: work.date, source: actualSource, locationLabel: typeof stored.locationLabel === "string" ? stored.locationLabel : ""
      } : null;
      const idealCurrent = Boolean(timing && harvestTimingThermalIsCurrent(work.workId, fieldId));
      const idealThermal = timing && timing.thermal ? {
        ...U.clone(timing.thermal), current: idealCurrent,
        endpoints: (timing.thermal.endpoints || []).map(row => ({ ...U.clone(row),
          total: idealCurrent && ["complete", "missing"].includes(row.status)
            && row.count > 0 && row.count <= row.expectedDays && typeof row.total === "number" && Number.isFinite(row.total)
            && row.source === "Open-Meteo Archive (reanalysis/model)" ? row.total : "",
          status: idealCurrent ? row.status : "stale" }))
      } : null;
      const savedStatus = work.harvestStatusByField && work.harvestStatusByField[fieldId];
      const harvestStatus = ["complete", "partial"].includes(savedStatus) ? savedStatus
        : work.harvestStatusByField && Object.prototype.hasOwnProperty.call(work.harvestStatusByField, fieldId) ? "unknown" : "legacy";
      const observedDates = [...new Set(data().growthLogs.filter(log => log.fieldId === fieldId && log.headingObserved === true
        && harvestDateYear(log.date) === harvestDateYear(work.date) && log.date <= work.date).map(log => log.date))].sort();
      return { workId: work.workId, actualDate: work.date, season: harvestDateYear(work.date), harvestStatus,
        assessment: timing && timing.assessment || "", idealStartDate: timing && timing.idealStartDate || "",
        idealEndDate: timing && timing.idealEndDate || "", memo: timing && timing.memo || "",
        varietyName: timing && timing.varietyName || "", varietySource: timing && timing.varietySource || "",
        varietyId: timing && timing.varietyId || "", evaluatedAt: timing && timing.evaluatedAt || "",
        observedHeadingDate: observedDates.length === 1 ? observedDates[0] : "", headingObservationCount: observedDates.length,
        actualThermal, idealThermal,
        ...(harvestDateYear(headingDate) && headingDate <= work.date ? {
          headingDate, daysAfterHeading: Number(U.daysBetween(headingDate, work.date))
        } : {}) };
    }).sort((a, b) => a.actualDate.localeCompare(b.actualDate) || String(a.workId).localeCompare(String(b.workId)));
  }

  function harvestVarietyComparisonFor(fieldId) {
    const selected = field(fieldId);
    const varietyId = selected && selected.varietyId || "";
    const master = varietyId && variety(varietyId);
    const result = { varietyId, varietyName: master && master.name || "", rows: [], excluded: [] };
    const validDay = value => typeof value === "string" && Boolean(harvestDateYear(value));
    for (const target of fields()) {
      for (const saved of harvestTimingComparisonFor(target.fieldId)) {
        const work = data().fieldWorks.find(item => item.workId === saved.workId);
        const timing = work && work.harvestTimingByField && work.harvestTimingByField[target.fieldId];
        const delayReason = timing && ["rain", "surface", "machine", "schedule", "other"].includes(timing.delayReason) ? timing.delayReason : "";
        const row = { ...saved, fieldId: target.fieldId, fieldName: target.name || "",
          sourceLabel: "評価入力時の品種参照（過去年の栽培品種確定ではありません）", currentField: target.fieldId === fieldId, delayReason };
        let reason = "";
        if (!varietyId) reason = "選択圃場の品種が未設定です";
        else if (!master) reason = "選択圃場の基準品種マスターが未確認です";
        else if (!saved.varietyId) reason = "評価入力時の品種IDが未登録です";
        else if (saved.varietyId !== varietyId) reason = "評価入力時の品種IDが一致しません";
        else if (saved.varietySource !== "assessment-current-master") reason = "評価入力時の品種参照の出典が未確認です";
        else if (saved.assessment === "pending") reason = "収穫時期の評価が保留です";
        else if (!["early", "appropriate", "late"].includes(saved.assessment)) reason = "収穫時期の評価が未登録です";
        else if (saved.harvestStatus === "partial") reason = "部分刈取のため比較参照から除外します";
        else if (saved.harvestStatus !== "complete") reason = "刈取完了区分が未確認です";
        const suppliedIdeal = Boolean(saved.idealStartDate || saved.idealEndDate);
        let start = saved.idealStartDate || saved.idealEndDate;
        let end = saved.idealEndDate || saved.idealStartDate;
        let idealUsesActualDate = false;
        if (!suppliedIdeal && saved.assessment === "appropriate") {
          start = end = saved.actualDate; idealUsesActualDate = true;
        }
        if (!validDay(start) || !validDay(end) || start > end) start = end = "";
        row.idealStartDate = start; row.idealEndDate = end; row.idealUsesActualDate = idealUsesActualDate;
        // These day counts are observations, not thermal estimates or scores.
        row.daysAfterHeading = "";
        row.idealDaysMin = ""; row.idealDaysMax = "";
        if (saved.headingObservationCount === 1 && validDay(saved.observedHeadingDate) && saved.observedHeadingDate <= saved.actualDate) {
          row.daysAfterHeading = Number(U.daysBetween(saved.observedHeadingDate, saved.actualDate));
          if (start && start >= saved.observedHeadingDate) {
            row.idealDaysMin = Number(U.daysBetween(saved.observedHeadingDate, start));
            row.idealDaysMax = Number(U.daysBetween(saved.observedHeadingDate, end));
          }
        }
        if (reason) result.excluded.push({ ...row, reason });
        else result.rows.push(row);
      }
    }
    const compare = (a, b) => a.actualDate.localeCompare(b.actualDate) || a.fieldId.localeCompare(b.fieldId) || String(a.workId).localeCompare(String(b.workId));
    result.rows.sort(compare); result.excluded.sort(compare);
    return U.clone(result);
  }

  function harvestForecastComparisonFor(fieldId) {
    const validDay = value => typeof value === "string" && Boolean(harvestDateYear(value));
    const timestamp = value => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
        || !validDay(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return NaN;
      return Date.parse(value);
    };
    const jstDay = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
    const rangeValid = range => range && validDay(range.start) && validDay(range.end) && range.start <= range.end;
    const difference = (start, end, range, ideal, delayed) => {
      const days = end < range.start ? Number(U.daysBetween(range.start, end))
        : start > range.end ? Number(U.daysBetween(range.end, start)) : 0;
      return { days, label: ideal ? days === 0 ? "見立て期間と重なる" : "見立て期間との差"
        : delayed ? "日程差" : days === 0 ? "保存見通しの範囲内" : "保存見通しとの日付差" };
    };
    const snapshots = (data().meta || {}).outlookSnapshots || [];
    const now = timestamp(U.now());
    return harvestTimingComparisonFor(fieldId).map(row => {
      const work = data().fieldWorks.find(item => item.workId === row.workId);
      const timing = work.harvestTimingByField && work.harvestTimingByField[fieldId] || {};
      const delayReason = ["rain", "surface", "machine", "schedule", "other"].includes(timing.delayReason) ? timing.delayReason : "";
      let idealStartDate = validDay(row.idealStartDate) ? row.idealStartDate : "";
      let idealEndDate = validDay(row.idealEndDate) ? row.idealEndDate : "";
      if (!idealStartDate && !idealEndDate && row.assessment === "appropriate") idealStartDate = idealEndDate = row.actualDate;
      else { idealStartDate = idealStartDate || idealEndDate; idealEndDate = idealEndDate || idealStartDate; }
      if (idealStartDate > idealEndDate) idealStartDate = idealEndDate = "";
      const exclusions = [];
      const candidates = [];
      snapshots.forEach((saved, index) => {
        if (!saved || saved.fieldId !== fieldId || String(saved.season) !== row.season) return;
        const time = timestamp(saved.savedAt);
        let reason = "";
        if (!validDay(saved.asOf) || harvestDateYear(saved.asOf) !== row.season || !Number.isFinite(time)) reason = "基準日または保存日時が未確認です";
        else if (saved.asOf >= row.actualDate || jstDay(time) >= row.actualDate) reason = "刈取当日以降の見通しは事前比較に使いません";
        else if (saved.asOf > jstDay(time) || time > now || saved.asOf > U.today()) reason = "保存日より後の基準日または未来の保存日時です";
        else if (saved.harvestKind === "actual" || saved.actualHarvestDate || saved.harvestType === "actual") reason = "刈取実績を含むため事前見通しではありません";
        else if (!saved.harvestKind || !rangeValid(saved.harvestRange)) reason = "保存された日付範囲が未確認です";
        if (reason) exclusions.push({ snapshotId: saved.snapshotId || "", asOf: saved.asOf || "", savedAt: saved.savedAt || "", reason });
        else candidates.push({ saved, index, time });
      });
      candidates.sort((a, b) => a.saved.asOf.localeCompare(b.saved.asOf) || a.time - b.time || a.index - b.index);
      const selected = candidates.at(-1);
      const forecast = selected ? U.clone(selected.saved) : null;
      const unavailable = reason => ({ available: false, actual: null, ideal: null, reason });
      let dayComparison = unavailable("事前に保存された有効な見通しがありません");
      let thermalComparison = unavailable("比較可能な積算見通しがありません");
      if (selected) {
        const saved = selected.saved;
        const savedHeading = saved.actualHeadingDate;
        const headingReason = saved.headingKind !== "actual" || !validDay(savedHeading)
          ? "出穂推定に基づく見通しのため精度差は算出しません"
          : row.headingObservationCount !== 1 || row.observedHeadingDate !== savedHeading
            || saved.headingDate && saved.headingDate !== savedHeading
            ? "出穂実測の根拠が変更または不一致のため精度差は算出しません" : "";
        const compare = range => ({ available: true, range: U.clone(range),
          actual: difference(row.actualDate, row.actualDate, range, false, Boolean(delayReason)),
          ideal: idealStartDate ? difference(idealStartDate, idealEndDate, range, true, false) : null, reason: "" });
        dayComparison = headingReason ? unavailable(headingReason) : compare(saved.harvestRange);
        const thermal = saved.basis && saved.basis.thermalProjection;
        const history = thermal && thermal.historical;
        const expected = thermal && validDay(thermal.startDate) && validDay(saved.asOf)
          ? Math.max(0, Number(U.daysBetween(thermal.startDate, saved.asOf))) : -1;
        const retrieved = thermal && timestamp(thermal.retrievedAt);
        const forecastSources = thermal && thermal.sources && thermal.sources.forecast;
        const seasonalSources = thermal && thermal.sources && thermal.sources.seasonal;
        const location = (data().meta || {}).weatherLocation;
        let reason = headingReason;
        if (!reason && (!thermal || thermal.status !== "projected" || !rangeValid(thermal.range)
          || thermal.range.start < thermal.startDate)) reason = "完全な到達範囲を持つ積算見通しがありません";
        if (!reason) {
          const futureStart = thermal.startDate > saved.asOf ? thermal.startDate : saved.asOf;
          const forecastEnd = thermal.range.end < U.dateAddDays(saved.asOf, 6) ? thermal.range.end : U.dateAddDays(saved.asOf, 6);
          const forecastDays = forecastEnd >= futureStart ? Number(U.daysBetween(futureStart, forecastEnd)) + 1 : 0;
          const seasonalStart = futureStart > U.dateAddDays(saved.asOf, 7) ? futureStart : U.dateAddDays(saved.asOf, 7);
          const seasonalDays = thermal.range.end >= seasonalStart ? Number(U.daysBetween(seasonalStart, thermal.range.end)) + 1 : 0;
          const validSource = (sources, days, source) => Array.isArray(sources)
            && (days > 0 ? sources.length === 1 && sources[0] === source : sources.length === 0);
          if (thermal.range.end > U.dateAddDays(saved.asOf, 120)
            || !Number.isInteger(thermal.forecastDays) || thermal.forecastDays !== forecastDays
            || !Number.isInteger(thermal.seasonalDays) || thermal.seasonalDays !== seasonalDays
            || !validSource(forecastSources, forecastDays, "Open-Meteo Forecast")
            || !validSource(seasonalSources, seasonalDays, "Open-Meteo prior-year daily seasonal reference (reanalysis/model)")
            || !Number.isInteger(thermal.seasonalMinimumYears) || !Number.isInteger(thermal.seasonalExpectedYears)
            || (seasonalDays > 0 ? thermal.seasonalMinimumYears < 1 || thermal.seasonalMinimumYears > thermal.seasonalExpectedYears
              || thermal.seasonalExpectedYears > 5 : thermal.seasonalMinimumYears !== 0 || thermal.seasonalExpectedYears !== 0)) {
            reason = "到達日までの予報・季節参考の日数、出典、参照年数が整合しません";
          }
        }
        if (!reason && (thermal.asOf !== saved.asOf || thermal.headingDate !== savedHeading
          || thermal.startDate !== U.dateAddDays(savedHeading, 1) || thermal.endDate !== U.dateAddDays(saved.asOf, -1)
          || !history || history.complete !== true || !Number.isInteger(history.count) || history.count !== expected
          || history.expectedDays !== expected || expected < 0 || (expected > 0 && (typeof history.total !== "number" || !Number.isFinite(history.total)))
          || history.source !== "Open-Meteo Archive (reanalysis/model)" || !Number.isFinite(retrieved) || retrieved > selected.time
          || !thermal.sources || (expected > 0 && (!Array.isArray(thermal.sources.historical)
            || thermal.sources.historical.length !== 1 || thermal.sources.historical[0] !== "Open-Meteo Archive"))
          || (forecastSources !== undefined && (!Array.isArray(forecastSources) || forecastSources.some(source => source !== "Open-Meteo Forecast")))
          || (seasonalSources !== undefined && (!Array.isArray(seasonalSources) || seasonalSources.some(source => source !== "Open-Meteo prior-year daily seasonal reference (reanalysis/model)")))
          || (thermal.range.end >= saved.asOf && !(forecastSources || []).length && !(seasonalSources || []).length))) reason = "積算見通しの取得日数・出典・取得日時の根拠が不完全です";
        if (!reason && (!location || thermal.locationKey !== `${location.latitude}|${location.longitude}`)) reason = "現在の気象設定と異なる";
        thermalComparison = reason ? unavailable(reason) : compare(thermal.range);
      }
      return { workId: row.workId, actualDate: row.actualDate, season: row.season, harvestStatus: row.harvestStatus,
        assessment: row.assessment, idealStartDate, idealEndDate, delayReason, forecast, dayComparison, thermalComparison, exclusions,
        legacyOutlook: U.clone((work.harvestSnapshots || []).filter(item => item.fieldId === fieldId && item.outlook).map(item => item.outlook)) };
    });
  }

  async function retryHarvestTimingThermal(workId, fieldId, options = {}) {
    const basis = harvestTimingThermalBasis(workId, fieldId);
    if (!basis) return { status: "not_saved" };
    if (options.signal && options.signal.aborted) return { status: "cancelled" };
    if (harvestTimingThermalIsCurrent(workId, fieldId)
      && basis.timing.thermal.endpoints.every(row => row.status === "complete")) return { status: "unchanged" };
    const expectedWork = JSON.stringify(basis.work);
    const headingToken = JSON.stringify(data().growthLogs.filter(row => row.fieldId === fieldId && row.headingObserved));
    const fieldToken = JSON.stringify(field(fieldId));
    const asOf = U.today();
    const validLocation = basis.location && ["latitude", "longitude"].every(key =>
      ["number", "string"].includes(typeof basis.location[key]) && String(basis.location[key]).trim() !== ""
      && Number.isFinite(Number(basis.location[key])))
      && Math.abs(Number(basis.location.latitude)) <= 90 && Math.abs(Number(basis.location.longitude)) <= 180;
    const endpoints = basis.dates.map(date => {
      const expectedDays = harvestDateYear(date) && harvestDateYear(basis.startDate) && date >= basis.startDate
        ? Number(U.daysBetween(basis.startDate, date)) + 1 : 0;
      const status = !harvestDateYear(date) ? "invalid-range" : date >= asOf ? "future"
        : !harvestDateYear(basis.headingDate) ? "no-heading" : !expectedDays ? "invalid-range"
          : !validLocation ? "no-location" : "missing";
      const completed = harvestTimingThermalMatchesBasis(basis) && basis.timing.thermal.endpoints.find(row => row.date === date
        && row.status === "complete" && row.count === expectedDays && row.count > 0 && typeof row.total === "number" && Number.isFinite(row.total));
      return completed ? U.clone(completed) : { date, total: "", count: 0, expectedDays, status, source: "" };
    });
    const requested = endpoints.filter(row => row.status === "missing");
    let retrievedAt = U.now();
    if (requested.length) {
      try {
        if (!RiceOS.weather || !RiceOS.weather.fetchDailyRange) throw new Error("Weather unavailable");
        const endDate = requested.map(row => row.date).sort().at(-1);
        const result = await RiceOS.weather.fetchDailyRange(basis.startDate, endDate, U.clone(basis.location));
        retrievedAt = result && (result.retrievedAt || result.fetchedAt) || U.now();
        const rows = new Map();
        for (const row of result && Array.isArray(result.rows) ? result.rows : []) {
          if (!row || row.source !== "Open-Meteo Archive" || /forecast/i.test(`${row.dataset || ""} ${row.model || ""}`)
            || !harvestDateYear(row.date) || row.date < basis.startDate || row.date > endDate || row.date >= asOf
            || typeof row.tempMean !== "number" || !Number.isFinite(row.tempMean) || rows.has(row.date)) continue;
          rows.set(row.date, row.tempMean);
        }
        requested.forEach(endpoint => {
          const values = [...rows].filter(([date]) => date <= endpoint.date).map(([, value]) => value);
          endpoint.count = values.length;
          endpoint.total = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : "";
          endpoint.status = values.length === endpoint.expectedDays ? "complete" : "missing";
          endpoint.source = values.length ? "Open-Meteo Archive (reanalysis/model)" : "";
        });
      } catch (error) {
        requested.forEach(endpoint => { endpoint.status = "fetch-failed"; });
      }
    }
    if (options.signal && options.signal.aborted) return { status: "cancelled" };
    let unchanged = false;
    if (harvestTimingThermalMatchesBasis(basis)) {
      endpoints.forEach((endpoint, index) => {
        const old = basis.timing.thermal.endpoints.find(row => row.date === endpoint.date);
        if (old && ["complete", "missing"].includes(old.status) && old.count > 0
          && old.count <= endpoint.expectedDays && old.expectedDays === endpoint.expectedDays
          && typeof old.total === "number" && Number.isFinite(old.total)
          && old.source === "Open-Meteo Archive (reanalysis/model)" && endpoint.count <= old.count) endpoints[index] = U.clone(old);
      });
      if (JSON.stringify(endpoints) === JSON.stringify(basis.timing.thermal.endpoints)) {
        retrievedAt = basis.timing.thermal.retrievedAt;
        unchanged = basis.timing.thermal.asOf === asOf;
      }
    }
    const latest = harvestTimingThermalBasis(workId, fieldId);
    if (!latest || JSON.stringify(latest.work) !== expectedWork || latest.headingDate !== basis.headingDate
      || latest.startDate !== basis.startDate || latest.locationToken !== basis.locationToken || asOf !== U.today()
      || JSON.stringify(field(fieldId)) !== fieldToken
      || JSON.stringify(data().growthLogs.filter(row => row.fieldId === fieldId && row.headingObserved)) !== headingToken) return { status: "not_saved" };
    if (unchanged) return { status: "unchanged" };
    const thermal = S.normalizeHarvestTimingThermal({ headingDate: basis.headingDate, startDate: basis.startDate, asOf,
      source: "Open-Meteo Archive (reanalysis/model)", locationLabel: basis.location && basis.location.label || "",
      locationToken: basis.locationToken, retrievedAt, endpoints });
    const saved = mutate(draft => {
      draft.fieldWorks.find(row => row.workId === workId).harvestTimingByField[fieldId].thermal = thermal;
    }, "理想の収穫期間の過去積算気温参照を保存しました");
    return { status: saved ? "saved" : "not_saved" };
  }

  async function retryHarvestThermal(workId, fieldId, options = {}) {
    const work = data().fieldWorks.find((row) => row.workId === workId);
    const snapshot = work && (work.harvestSnapshots || []).find((row) => row.fieldId === fieldId && row.harvestDate === work.date);
    if (!work || !isHarvestWork(work) || !(work.fieldIds || []).includes(fieldId) || !snapshot) return { status: "not_saved" };
    if (options.signal && options.signal.aborted) return { status: "cancelled" };
    const basis = actualHarvestThermalBasis(work, fieldId);
    if (!basis) return { status: "not_saved" };
    if (completeHarvestThermal(snapshot.thermal, basis)) return { status: "unchanged" };
    const expectedWork = JSON.stringify(work);
    const date = work.date;
    const headingDate = basis.headingDate;
    const plantingDate = plantingDateForField(fieldId, U.season(date));
    const location = data().meta && data().meta.weatherLocation;
    if (!harvestDateYear(date) || !harvestDateYear(headingDate) || !location || location.latitude === undefined || location.longitude === undefined
      || !RiceOS.weather || !RiceOS.weather.fetchDailyRange) return { status: "not_saved" };
    const locationToken = JSON.stringify(location);
    const headingToken = JSON.stringify(data().growthLogs.filter((row) => row.fieldId === fieldId && row.headingObserved));
    const startDate = basis.startDate;
    if (!harvestDateYear(startDate) || startDate > date) return { status: "not_saved" };
    try {
      const weather = await RiceOS.weather.fetchDailyRange(startDate, date, U.clone(location));
      if (options.signal && options.signal.aborted) return { status: "cancelled" };
      const latest = data().fieldWorks.find((row) => row.workId === workId);
      if (!latest || JSON.stringify(latest) !== expectedWork
        || JSON.stringify(data().meta && data().meta.weatherLocation) !== locationToken
        || JSON.stringify(data().growthLogs.filter((row) => row.fieldId === fieldId && row.headingObserved)) !== headingToken
        || headingDateForField(fieldId, U.season(date), date) !== headingDate
        || plantingDateForField(fieldId, U.season(date)) !== plantingDate) return { status: "not_saved" };
      const expectedDays = Number(U.daysBetween(startDate, date)) + 1;
      const coverage = actualHarvestThermalCoverage(weather && weather.rows, basis);
      if (!coverage) return { status: "not_saved" };
      const count = coverage.count;
      const total = coverage.total;
      const previous = snapshot.thermal;
      const comparablePrevious = previous && previous.headingDate === headingDate && previous.startDate === startDate && previous.endDate === date
        && previous.coverageVersion === 1 && previous.locationToken === locationToken
        && previous.source === "Open-Meteo Archive" && Number(previous.expectedDays) === expectedDays
        && Number.isInteger(Number(previous.count)) && Number(previous.count) > 0 && Number(previous.count) <= expectedDays
        && typeof previous.total === "number" && Number.isFinite(previous.total);
      if (!Number.isFinite(expectedDays) || expectedDays <= 0 || !Number.isInteger(count) || count <= 0 || count > expectedDays
        || total === "" || total == null || !Number.isFinite(Number(total))
        || comparablePrevious && count <= Number(previous.count) && count < expectedDays) return { status: "not_saved" };
      const reference = RiceOS.agro && RiceOS.agro.harvestReferenceFor ? RiceOS.agro.harvestReferenceFor(field(fieldId)) : null;
      const target = reference && reference.target || "";
      const thermal = { fieldId, headingDate, startDate, endDate: date, total: Number(total), target,
        difference: target === "" ? "" : Math.round((Number(total) - Number(target)) * 10) / 10,
        count: String(count), expectedDays: String(expectedDays), plantingDate: plantingDate || "",
        daysFromPlanting: plantingDate ? String(Number(U.daysBetween(plantingDate, date)) + 1) : "",
        status: count === expectedDays ? (date >= U.today() ? "当日速報" : "確定") : "一部欠測",
        source: "Open-Meteo Archive",
        locationLabel: location.label || "取得位置", retrievedAt: weather.retrievedAt || U.now() };
      const saved = saveHarvestThermalSnapshots(workId, [thermal], { expectedWork, rowsByField: { [fieldId]: weather.rows } });
      return { status: saved ? "saved" : "not_saved" };
    } catch (error) {
      return { status: options.signal && options.signal.aborted ? "cancelled" : "fetch_failed" };
    }
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
        if (schedule.completedManuallyAt || schedule.status === "手動完了") return;
        schedule.status = "予定";
        schedule.completedAt = "";
        schedule.completedByWorkId = "";
        schedule.completionReason = "";
        schedule.updatedAt = U.now();
      });
      reconcileWorkSchedules(d);
    }, message || "圃場作業を削除しました");
  }

  function deleteFieldWork(workId) {
    return deleteFieldWorks([workId]);
  }

  function saveGrowthLogsBatch(records, message) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!rows.length) return null;
    const validFieldIds = new Set(activeFields().map((item) => item.fieldId));
    if (rows.some((record) => !validFieldIds.has(record.fieldId === undefined
      ? (data().growthLogs.find((row) => row.logId === record.logId) || {}).fieldId : record.fieldId))) {
      lastError = new Error("生育ログの圃場が見つかりません。保存は行いませんでした。");
      return null;
    }
    const newFieldIds = rows.filter((record) => !record.logId).map((record) => record.fieldId);
    if (new Set(newFieldIds).size !== newFieldIds.length) {
      lastError = new Error("同じ圃場が一括生育記録に重複しています。保存は行いませんでした。");
      return null;
    }
    const effectiveRows = rows.map((record) => ({
      ...data().growthLogs.find((existing) => existing.logId === record.logId),
      ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
    }));
    const editedIds = new Set(rows.map((row) => row.logId).filter(Boolean));
    const headingPool = [...data().growthLogs.filter((row) => !editedIds.has(row.logId)), ...effectiveRows];
    const duplicateHeading = effectiveRows.find((record) => record.headingObserved && headingPool.some((existing) => (
      existing !== record && (!record.logId || existing.logId !== record.logId)
      && existing.headingObserved && existing.fieldId === record.fieldId
      && String(existing.date === undefined ? U.today() : existing.date).slice(0, 4)
        === String(record.date === undefined ? U.today() : record.date).slice(0, 4)
    )));
    if (duplicateHeading) {
      lastError = new Error("この圃場には同じ年の出穂確認が登録済みです。既存の生育記録を編集してください。保存は行いませんでした。");
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
      const existing = record.logId && d.growthLogs.find((row) => row.logId === record.logId);
      const date = record.date === undefined ? existing && existing.date || U.today() : record.date;
      validateRecordDates(record, existing, { date });
      record = { ...existing, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) };
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
        sourceScheduleId: record.sourceScheduleId === undefined ? previous && previous.sourceScheduleId || "" : String(record.sourceScheduleId || ""),
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
        stageEvidenceType: record.stageEvidenceType || previous && previous.stageEvidenceType || (record.headingObserved ? "heading-observation" : (U.number(record.panicleLengthMm, 0) > 0 ? "panicle-measurement" : (record.stageConfirmed ? "manual-stage-observation" : ""))),
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
      reconcileGrowthSchedules(d, normalized, previous, record);
      const index = d.growthLogs.findIndex((g) => g.logId === normalized.logId);
      if (index >= 0) d.growthLogs[index] = { ...d.growthLogs[index], ...normalized };
      else d.growthLogs.push(normalized);
      d.confirmationCandidates = d.confirmationCandidates || [];
      const derivedCandidate = d.confirmationCandidates.find((item) => item.candidateType === "heading" && item.basisData && item.basisData.recordId === normalized.logId);
      // The source log, not its editable field/date, owns this prediction.
      d.confirmationCandidates = d.confirmationCandidates.filter((item) => !(item.candidateType === "heading" && item.basisData && item.basisData.recordId === normalized.logId));
      if (harvestDateYear(normalized.date) && U.number(normalized.panicleLengthMm, 0) > 0 && RiceOS.agro && RiceOS.agro.panicleEstimate) {
        const estimate = RiceOS.agro.panicleEstimate(normalized.fieldId, normalized.panicleLengthMm, normalized.date);
        if (estimate && estimate.supported) {
          const candidate = {
            candidateId: derivedCandidate ? derivedCandidate.candidateId : U.id("candidate", normalized.date),
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
            status: derivedCandidate ? derivedCandidate.status || "active" : "active",
            actualRecordId: "",
            actualDifferenceDays: "",
            createdAt: derivedCandidate ? derivedCandidate.createdAt : U.now(),
            updatedAt: U.now()
          };
          d.confirmationCandidates.push(reconcileGrowthCandidate(d, candidate));
        }
      }
      d.confirmationCandidates = d.confirmationCandidates.map((candidate) => {
        if (candidate.candidateType !== "heading") return candidate;
        if (candidate.actualRecordId === normalized.logId
          || normalized.headingObserved
            && candidate.fieldId === normalized.fieldId && String(candidate.season) === String(normalized.season)) {
          return reconcileGrowthCandidate(d, candidate);
        }
        return candidate;
      });
  }

  function growthScheduleEvent(schedule) {
    if (schedule.targetScope === "offField" || schedule.recordKind === "water") return "";
    const name = `${schedule.title || ""} ${schedule.scheduleType || ""}`;
    const panicle = /幼穂/.test(name);
    const heading = /出穂/.test(name);
    return panicle === heading ? "" : panicle ? "panicle" : "heading";
  }

  function growthMatchesSchedule(schedule, log, evidence) {
    const event = growthScheduleEvent(schedule);
    const ids = schedule.fieldIds || [];
    // A single growth row cannot prove completion for a multi-field legacy plan.
    if (!event || ids.length !== 1 || ids[0] !== log.fieldId
      || !harvestDateYear(log.date) || !harvestDateYear(schedule.date)) return false;
    if (String(schedule.season) !== String(log.season)
      || String(U.season(schedule.date)) !== String(log.season)) return false;
    return event === "heading" ? evidence.headingObserved === true
      : ["string", "number"].includes(typeof evidence.panicleLengthMm)
        && Number.isFinite(Number(evidence.panicleLengthMm)) && Number(evidence.panicleLengthMm) > 0;
  }

  function growthLinkOwned(schedule, logId) {
    const link = schedule.completionLink;
    return link && link.kind === "growth" && link.recordId === logId
      && !schedule.completedManuallyAt && schedule.status !== "手動完了"
      && !schedule.completedByWorkId && !schedule.completedByWaterPeriodId;
  }

  function reopenGrowthSchedule(schedule) {
    schedule.status = "予定";
    schedule.completedAt = "";
    schedule.completionLink = undefined;
    schedule.completionReason = "";
    schedule.updatedAt = U.now();
  }

  function reconcileGrowthSchedules(d, log, previous, evidence) {
    const moved = previous && (previous.date !== log.date || previous.fieldId !== log.fieldId);
    let reopened = false;
    (d.schedules || []).forEach((schedule) => {
      if (!growthLinkOwned(schedule, log.logId)) return;
      if (schedule.scheduleId !== log.sourceScheduleId) {
        reopenGrowthSchedule(schedule);
        return;
      }
      if (moved || !growthMatchesSchedule(schedule, log, evidence)
        || schedule.completionLink.event !== growthScheduleEvent(schedule)) {
        reopenGrowthSchedule(schedule);
        reopened = true;
      }
    });
    // A correction must not silently re-complete the plan it just reopened.
    if (moved || reopened) log.sourceScheduleId = "";
    const schedule = (d.schedules || []).find((s) => s.scheduleId === log.sourceScheduleId);
    if (!schedule || !growthMatchesSchedule(schedule, log, evidence)) return;
    if (schedule.completedManuallyAt || schedule.status === "手動完了"
      || schedule.completedByWorkId || schedule.completedByWaterPeriodId) return;
    if (schedule.completedAt || schedule.completionLink) return;
    schedule.status = "実施済み";
    schedule.completedAt = U.now();
    schedule.completionLink = { kind: "growth", recordId: log.logId, fieldId: log.fieldId, event: growthScheduleEvent(schedule) };
    schedule.completionReason = `${log.date} の生育記録と連動`;
    schedule.updatedAt = U.now();
  }

  function reconcileGrowthCandidate(d, candidate) {
    // Manual stage judgements are not evidence of an observed heading date.
    const replacement = d.growthLogs
      .filter((log) => log.fieldId === candidate.fieldId
        && String(log.season) === String(candidate.season) && log.headingObserved && harvestDateYear(log.date))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return {
      ...candidate,
      status: candidate.status === "dismissed" ? "dismissed" : replacement ? "confirmed" : "active",
      actualRecordId: replacement ? replacement.logId : "",
      actualDifferenceDays: replacement && candidate.periodStart ? U.daysBetween(candidate.periodStart, replacement.date) : "",
      updatedAt: U.now()
    };
  }

  function deleteGrowthLog(logId) {
    return mutate((d) => {
      const removed = d.growthLogs.find((g) => g.logId === logId);
      d.growthLogs = d.growthLogs.filter((g) => g.logId !== logId);
      if (removed) (d.schedules || []).forEach((schedule) => {
        if (growthLinkOwned(schedule, logId)) reopenGrowthSchedule(schedule);
      });
      if (!removed || !Array.isArray(d.confirmationCandidates)) return;

      // A panicle measurement is the evidence for its own prediction. Removing it
      // must also remove that prediction, while a deleted heading confirmation can
      // fall back to another confirmed heading record from the same field and year.
      d.confirmationCandidates = d.confirmationCandidates
        .filter((candidate) => !(candidate.candidateType === "heading" && candidate.basisData && candidate.basisData.recordId === logId))
        .map((candidate) => {
          if (candidate.candidateType !== "heading" || candidate.actualRecordId !== logId) return candidate;
          return reconcileGrowthCandidate(d, candidate);
        });
    }, "生育ログを削除しました");
  }

  function saveOtherWork(record) {
    return mutate((d) => {
      const date = record.date || U.today();
      const previous = record.otherWorkId ? d.otherWorks.find(row => row.otherWorkId === record.otherWorkId) : null;
      const normalized = {
        otherWorkId: record.otherWorkId || U.id("other", date),
        type: "otherWork",
        date,
        season: seasonForCropYearSave(record, previous, date),
        ...cropYearForSave(d, record, previous, date),
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
      const index = record.materialId ? d.materials.findIndex((item) => item.materialId === record.materialId) : -1;
      if (record.materialId && index < 0) throw new Error("資材が見つかりません。台帳を開き直してください。");
      const previous = index >= 0 ? d.materials[index] : {};
      record = { ...previous, ...record };
      if (!String(record.name || "").trim()) throw new Error("資材名を入力してください。");
      const normalized = {
        ...record,
        materialId: record.materialId || U.id("material", U.today()),
        season: U.number(record.season, new Date().getFullYear()),
        category: record.category || "その他",
        name: record.name || "",
        formalName: record.formalName || "",
        formulation: record.formulation || "",
        unit: record.unit || "",
        carryover: record.carryover ?? "",
        ordered: record.ordered ?? "",
        used: record.used ?? "",
        remaining: record.remaining ?? "",
        deliveryDate: record.deliveryDate || "",
        nextYearMemo: record.nextYearMemo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      if (index >= 0) d.materials[index] = normalized;
      else d.materials.push(normalized);
    }, "資材を保存しました");
  }

  function deleteMaterial(materialId) {
    return mutate((d) => {
      if (!d.materials.some((m) => m.materialId === materialId)) throw new Error("資材が見つかりません。");
      if (Object.entries(d).some(([key, value]) => key !== "materials" && hasMasterReference(value, "materialId", materialId))) throw new Error("作業記録・予定・除草体系で参照されている資材は削除できません。履歴を保持するため、資材の編集をご利用ください。");
      d.materials = d.materials.filter((m) => m.materialId !== materialId);
    }, "資材を削除しました");
  }

  function materialUsageForYear(year, options = {}) {
    if (!/^\d{4}$/.test(String(year))) return [];
    const groups = new Map();
    data().fieldWorks.filter((work) => options.cropYear === true ? String(cropYearForRecord(work)) === String(year) : isInYear(work, year))
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((work) => {
        const materialId = String(work.materialId || "");
        const name = String(work.material || "");
        if (!materialId && !name.trim()) return;
        const key = materialId ? `id:${materialId}` : `name:${name}`;
        if (!groups.has(key)) {
          const master = materialId && data().materials.find((item) => item.materialId === materialId);
          groups.set(key, { key, materialId, name: master && (master.formalName || master.name) || name || "名称未入力", works: [] });
        }
        groups.get(key).works.push(U.clone(work));
      });
    return Array.from(groups.values());
  }

  function saveResult(record) {
    return mutate((d) => {
      const resultId = String(record.resultId || "").trim();
      const index = resultId ? d.varietyResults.findIndex((row) => row.resultId === resultId) : -1;
      if (resultId && index < 0) throw new Error("品種結果が見つかりません。画面を開き直してください。");
      const previous = index >= 0 ? d.varietyResults[index] : {};
      const merged = { ...previous, ...Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) };
      const text = (key) => String(merged[key] ?? "");
      const normalized = {
        ...previous,
        resultId: resultId || U.id("result", U.today()),
        season: U.number(merged.season, new Date().getFullYear()),
        varietyId: text("varietyId"),
        fieldId: text("fieldId"),
        areaA: text("areaA"),
        yield: text("yield"),
        yieldPer10a: text("yieldPer10a"),
        grade: text("grade"),
        firstGradeRate: text("firstGradeRate"),
        shippedQuantity: text("shippedQuantity"),
        quality: text("quality"),
        salesAmount: text("salesAmount"),
        salesPer10a: text("salesPer10a"),
        reflection: text("reflection"),
        createdAt: previous.createdAt || merged.createdAt || U.now(),
        updatedAt: U.now()
      };
      if (index >= 0) d.varietyResults[index] = normalized;
      else d.varietyResults.push(normalized);
    }, "品種結果を保存しました");
  }

  function deleteResult(resultId) {
    return mutate((d) => {
      if (!resultId || !d.varietyResults.some((row) => row.resultId === resultId)) {
        throw new Error("品種結果が見つかりません。画面を開き直してください。");
      }
      d.varietyResults = d.varietyResults.filter((row) => row.resultId !== resultId);
    }, "品種結果を削除しました");
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
      const previous = record.scheduleId ? d.schedules.find((schedule) => schedule.scheduleId === record.scheduleId) : null;
      const targets = workTargets(d, record, previous);
      const normalized = {
        scheduleId: record.scheduleId || U.id("schedule", date),
        type: "schedule",
        targetScope: targets.targetScope,
        date,
        season: seasonForCropYearSave(record, previous, date),
        ...cropYearForSave(d, record, previous, date),
        fieldIds: targets.fieldIds,
        batchId: targets.targetScope === "offField" ? "" : record.batchId || "",
        batchFieldIds: targets.targetScope === "offField" ? [] : record.batchFieldIds || targets.fieldIds,
        ...(targets.targetScope === "offField" ? { orphanedFieldIds: [] } : {}),
        scheduleType: record.scheduleType || "作業予定",
        title: record.title || record.scheduleType || "予定",
        status: record.status || "予定",
        completedAt: record.completedAt || "",
        completedByWorkId: record.completedByWorkId || "",
        completedByWaterPeriodId: record.completedByWaterPeriodId || "",
        completedManuallyAt: record.completedManuallyAt || "",
        completionReason: record.completionReason || "",
        recordKind: record.recordKind || "",
        waterKind: record.waterKind || "",
        waterPhase: record.waterPhase || "",
        ...(record.completionLink && record.completionLink.recordId ? { completionLink: U.clone(record.completionLink) } : {}),
        plannedFertilizerName: record.plannedFertilizerName || "",
        plannedFertilizerRateKg10a: record.plannedFertilizerRateKg10a || "",
        memo: record.memo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      if (previous && targetScope(previous) !== targets.targetScope) {
        // A completion link cannot cross scopes after editing the schedule.
        normalized.status = "予定";
        normalized.completedAt = "";
        normalized.completedByWorkId = "";
        normalized.completedByWaterPeriodId = "";
        normalized.completedManuallyAt = "";
        normalized.completionReason = "";
        normalized.completionLink = undefined;
        d.fieldWorks.forEach((work) => {
          if (work.sourceScheduleId === normalized.scheduleId && targetScope(work) !== targets.targetScope) work.sourceScheduleId = "";
        });
      }
      const index = d.schedules.findIndex((s) => s.scheduleId === normalized.scheduleId);
      if (index >= 0) d.schedules[index] = { ...d.schedules[index], ...normalized };
      else d.schedules.push(normalized);
      if (previous && previous.completedByWorkId && targetScope(previous) === targets.targetScope) {
        reconcileWorkSchedules({ ...d, schedules: [d.schedules[index]] });
      }
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
      if (targetScope(schedule) !== "field" || targetScope(record) !== "field") throw new Error("圃場の予定を選択してください。");
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
        ...cropYearForSave(d, { ...record, sourceScheduleId: schedule.scheduleId }, null, date),
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

  // A water schedule never becomes the source of truth for water management.
  // It is completed only when the exact linked direct period was saved.
  function isWaterConfirmationSchedule(schedule) {
    return Boolean(schedule && targetScope(schedule) === "field"
      && (!schedule.recordKind || schedule.recordKind === "water")
      && !schedule.waterKind && !schedule.waterPhase
      && /^中干し確認(?:予定)?$/.test(String(schedule.title || "")));
  }

  function waterScheduleTarget(schedule) {
    if (!schedule || targetScope(schedule) !== "field") return null;
    if (schedule.recordKind && schedule.recordKind !== "water") return null;
    if (schedule.waterKind || schedule.waterPhase) {
      return ["dry", "intermittent", "saturated", "deep", "drain"].includes(schedule.waterKind)
        && ["start", "end"].includes(schedule.waterPhase)
        ? { kind: schedule.waterKind, phase: schedule.waterPhase } : null;
    }
    // Legacy plans use the same explicit start/end meanings as water work names.
    const title = String(schedule.title || schedule.scheduleType || "").replace(/予定$/, "");
    const types = [/中干し/, /間断|かんだん/, /飽水/, /深水/, /落水/];
    if (types.filter((pattern) => pattern.test(title)).length !== 1) return null;
    if (/開始/.test(title) && /終了|完了/.test(title)) return null;
    return waterEventFromWorkName(title);
  }

  function completeLinkedWaterSchedule(d, record, recordKind, recordId) {
    const scheduleId = String(record && record.sourceScheduleId || "");
    const phase = String(record && record.sourceSchedulePhase || "");
    if (!scheduleId || !phase || !recordId) return;
    const index = (d.schedules || []).findIndex((schedule) => schedule.scheduleId === scheduleId);
    if (index < 0) return;
    const schedule = d.schedules[index];
    if (targetScope(schedule) !== "field") return;
    const waterKind = recordKind === "dry" ? "dry" : waterKindFromMethod(record.method);
    const target = waterScheduleTarget(schedule);
    if (!target || target.kind !== waterKind || target.phase !== phase) return;
    if ((schedule.fieldIds || []).length !== 1 || schedule.fieldIds[0] !== record.fieldId) return;
    // Planned and actual dates may differ. The explicit schedule ID is the link;
    // the actual boundary must still exist for the requested phase.
    if (!validWaterScheduleBoundary(schedule, record, recordKind, phase)) return;
    if (schedule.completedManuallyAt || schedule.status === "手動完了" || schedule.completedByWorkId) return;
    const existingLink = schedule.completionLink || null;
    if (schedule.completedAt && (!existingLink || existingLink.recordId !== recordId || existingLink.kind !== recordKind)) return;
    if (schedule.status === "実施済み" && existingLink && existingLink.recordId === recordId
      && existingLink.kind === recordKind && existingLink.fieldId === record.fieldId && existingLink.event === phase) return;
    d.schedules[index] = {
      ...schedule,
      status: "実施済み",
      completedAt: U.now(),
      completedByWaterPeriodId: recordId,
      completionLink: { kind: recordKind, recordId, fieldId: record.fieldId, event: phase },
      completionReason: `${record.startDate || record.date || ""} の水管理実績と連動`,
      updatedAt: U.now()
    };
  }

  function restoreLinkedWaterSchedule(d, recordKind, recordId, event) {
    (d.schedules || []).forEach((schedule, index) => {
      const link = schedule.completionLink;
      if (schedule.completedManuallyAt || schedule.status === "手動完了" || schedule.completedByWorkId) return;
      const target = waterScheduleTarget(schedule);
      if (link && (!target || !["start", "end"].includes(link.event) || target.phase !== link.event)) return;
      if (link ? link.kind !== recordKind || link.recordId !== recordId
        : schedule.completedByWaterPeriodId !== recordId || !waterScheduleTarget(schedule)
          || (recordKind === "dry") !== (waterScheduleTarget(schedule).kind === "dry")) return;
      // Reopening a boundary must not undo another phase or a manual completion.
      if (event && (link ? link.event : waterScheduleTarget(schedule).phase) !== event) return;
      d.schedules[index] = {
        ...schedule,
        status: "予定",
        completedAt: "",
        completedByWaterPeriodId: "",
        completionLink: undefined,
        completionReason: "",
        updatedAt: U.now()
      };
    });
  }

  function validWaterScheduleBoundary(schedule, record, recordKind, phase) {
    const target = waterScheduleTarget(schedule);
    const kind = recordKind === "dry" ? "dry" : waterKindFromMethod(record.method);
    if (!target || target.kind !== kind || target.phase !== phase
      || (schedule.fieldIds || []).length !== 1 || schedule.fieldIds[0] !== record.fieldId) return false;
    const startYear = harvestDateYear(record.startDate);
    const date = phase === "end" ? record.actualEndDate : record.startDate;
    const year = harvestDateYear(date);
    return Boolean(startYear && year && year === harvestDateYear(schedule.date)
      && String(year) === String(schedule.season)
      && (phase !== "end" || date >= record.startDate));
  }

  function reconcileWaterSchedulesForRecord(d, record, previous, recordKind, recordId) {
    (d.schedules || []).forEach((schedule) => {
      if (schedule.completedManuallyAt || schedule.status === "手動完了" || schedule.completedByWorkId) return;
      const link = schedule.completionLink;
      const target = waterScheduleTarget(schedule);
      // Unknown or contradictory legacy provenance is not enough to undo a completion.
      if (link && (!target || !["start", "end"].includes(link.event) || target.phase !== link.event)) return;
      const owned = link ? link.kind === recordKind && link.recordId === recordId
        : schedule.completedByWaterPeriodId === recordId && target
          && (recordKind === "dry") === (target.kind === "dry");
      if (!owned) return;
      const phase = link ? link.event : target.phase;
      const sourceChanged = previous && previous.sourceScheduleId !== record.sourceScheduleId;
      const unlinked = sourceChanged && !record.sourceScheduleId
        || record.sourceScheduleId && record.sourceSchedulePhase === phase && record.sourceScheduleId !== schedule.scheduleId
        || previous && previous.sourceScheduleId === schedule.scheduleId && previous.sourceSchedulePhase === phase
          && !record.sourceSchedulePhase;
      if (unlinked || link && link.fieldId && link.fieldId !== record.fieldId
        || !validWaterScheduleBoundary(schedule, record, recordKind, phase)) {
        // restore replaces the row, so copy its canonical result into the draft.
        const subset = { schedules: [schedule] };
        restoreLinkedWaterSchedule(subset, recordKind, recordId, phase);
        Object.assign(schedule, subset.schedules[0]);
      }
    });
  }

  function reconcileExistingWaterSchedules(d) {
    const legacyBoundary = (record) => !record.startDate && !record.plannedStartDate && !record.endDate
      && !/予定/.test(`${record.status || ""} ${record.periodStatus || ""}`)
      ? { ...record, startDate: record.date } : record;
    (d.dryPeriods || []).forEach((record) => reconcileWaterSchedulesForRecord(d, legacyBoundary(record), record, "dry", record.dryPeriodId));
    (d.irrigations || []).forEach((record) => reconcileWaterSchedulesForRecord(d, legacyBoundary(record), record, "irrigation", record.irrigationId));
  }

  function waterStartForSave(record, previous) {
    if (record.startDate !== undefined) return String(record.startDate || "");
    if (previous && previous.startDate !== undefined) return String(previous.startDate || "");
    if (record.plannedStartDate || record.endDate || /予定/.test(`${record.status || ""} ${record.periodStatus || ""}`)) return "";
    return String(record.date || previous && previous.date || "");
  }

  function validateRecordDates(input, previous, dates, water) {
    const keys = water ? ["date", "startDate", "endDate", "actualEndDate", "plannedStartDate"] : ["date"];
    keys.forEach((key) => {
      if (previous && input[key] === undefined) return;
      const value = dates[key];
      if (key !== "date" && (value === "" || value === undefined || value === null)) return;
      if (!harvestDateYear(value)) throw new Error("日付は実在する年月日（YYYY-MM-DD）で入力してください。");
    });
    if (!water) return;
    const changedBoundary = !previous || ["startDate", "endDate", "actualEndDate", "plannedStartDate"].some((key) => input[key] !== undefined);
    if (changedBoundary) {
      const legacyStart = !dates.startDate && !dates.plannedStartDate && !dates.endDate
        && !/予定/.test(`${dates.status || ""} ${dates.periodStatus || ""}`) ? dates.date : "";
      const start = dates.startDate || dates.plannedStartDate || legacyStart;
      [dates.endDate, dates.actualEndDate].forEach((end) => {
        if (harvestDateYear(start) && harvestDateYear(end) && end < start) throw new Error("終了日は開始日以後で入力してください。");
      });
    }
    const movements = input.waterMovements;
    if (movements !== undefined && !Array.isArray(movements)) throw new Error("水の動きの記録を確認してください。");
    if (!Array.isArray(movements)) {
      if (changedBoundary && previous && (previous.waterMovements || []).length) {
        validateRecordDates({ waterMovements: previous.waterMovements }, previous, dates, true);
      }
      return;
    }
    movements.forEach((movement) => {
      if (!movement || !harvestDateYear(movement.startDate)
        || movement.endDate && !harvestDateYear(movement.endDate)) throw new Error("水の動きの日付は実在する年月日で入力してください。");
      if (!harvestDateYear(dates.startDate) || movement.startDate < dates.startDate
        || movement.endDate && movement.endDate < movement.startDate
        || dates.actualEndDate && (movement.startDate > dates.actualEndDate
          || movement.endDate && movement.endDate > dates.actualEndDate)) throw new Error("水の動きは水管理の実施期間内で入力してください。");
    });
  }

  function saveDryPeriodsBatch(records, message) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!rows.length) return null;
    return mutate((d) => {
      rows.forEach((record) => {
        const saved = saveDryPeriodToDraft(d, record);
        completeLinkedWaterSchedule(d, saved, "dry", saved.dryPeriodId);
      });
    }, message || `中干し記録を${rows.length}件保存しました`);
  }

  function saveDryPeriod(record) {
    return saveDryPeriodsBatch([record], `${fieldNameForFeedback(record.fieldId)}の中干し記録を残しました。圃場カードの水管理も更新しました。`);
  }

  function saveDryPeriodToDraft(d, record) {
      const existing = record.dryPeriodId && d.dryPeriods.find((row) => row.dryPeriodId === record.dryPeriodId);
      const date = record.date === undefined ? existing && existing.date || U.today() : record.date;
      const supplied = record;
      record = { ...existing, ...record };
      validateRecordDates(supplied, existing, { ...record, date, startDate: waterStartForSave(record, existing) }, true);
      const dryPeriodId = record.dryPeriodId || U.id("dry", date);
      const previous = d.dryPeriods.find((item) => item.dryPeriodId === dryPeriodId) || null;
      record = waterRecordForHarvestEdit(record, previous);
      const normalized = {
        dryPeriodId,
        type: "dryPeriod",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
        batchId: record.batchId || previous && previous.batchId || "",
        batchFieldIds: record.batchFieldIds || previous && previous.batchFieldIds || [],
        status: record.status || (record.actualEndDate ? "完了" : "実施中"),
        startDate: waterStartForSave(record, previous),
        endDate: record.endDate || "",
        actualEndDate: record.actualEndDate || "",
        harvestAutoEnd: record.harvestAutoEnd,
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
        sourceScheduleId: record.sourceScheduleId === undefined ? previous && previous.sourceScheduleId || "" : String(record.sourceScheduleId || ""),
        sourceSchedulePhase: record.sourceSchedulePhase === undefined ? previous && previous.sourceSchedulePhase || "" : String(record.sourceSchedulePhase || ""),
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
      reconcileWaterSchedulesForRecord(d, normalized, previous, "dry", dryPeriodId);
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
      if (previous && previous.actualEndDate && !normalized.actualEndDate) {
        restoreLinkedWaterSchedule(d, "dry", dryPeriodId, "end");
        refreshDryingSummary(d, normalized.fieldId);
      }
      return normalized;
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
      restoreLinkedWaterSchedule(d, "dry", dryPeriodId);
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
      rows.forEach((record) => {
        const saved = saveIrrigationToDraft(d, record);
        completeLinkedWaterSchedule(d, saved, "irrigation", saved.irrigationId);
      });
    }, message || `水管理を${rows.length}件保存しました`);
  }

  function saveIrrigation(record) {
    return saveIrrigationsBatch([record], "水管理を保存しました");
  }

  function saveIrrigationToDraft(d, record) {
      const existing = record.irrigationId && d.irrigations.find((row) => row.irrigationId === record.irrigationId);
      const date = record.date === undefined ? existing && existing.date || U.today() : record.date;
      const supplied = record;
      record = { ...existing, ...record };
      validateRecordDates(supplied, existing, { ...record, date, startDate: waterStartForSave(record, existing) }, true);
      const irrigationId = record.irrigationId || U.id("irrigation", date);
      const previous = d.irrigations.find((item) => item.irrigationId === irrigationId) || null;
      record = waterRecordForHarvestEdit(record, previous);
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
        startDate: waterStartForSave(record, previous),
        endDate: record.endDate || "",
        actualEndDate: record.actualEndDate || "",
        harvestAutoEnd: record.harvestAutoEnd,
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
        sourceScheduleId: record.sourceScheduleId === undefined ? previous && previous.sourceScheduleId || "" : String(record.sourceScheduleId || ""),
        sourceSchedulePhase: record.sourceSchedulePhase === undefined ? previous && previous.sourceSchedulePhase || "" : String(record.sourceSchedulePhase || ""),
        status: record.status || "入水中",
        autoStartedFromDry: record.autoStartedFromDry === undefined ? Boolean(previous && previous.autoStartedFromDry) : Boolean(record.autoStartedFromDry),
        autoStartedFromDrySource: record.autoStartedFromDrySource === undefined ? String(previous && previous.autoStartedFromDrySource || "") : String(record.autoStartedFromDrySource || ""),
        targetDepthCm: record.targetDepthCm || previous && previous.targetDepthCm || "",
        observedDepthCm: record.observedDepthCm || previous && previous.observedDepthCm || "",
        // Optional within-period movements keep a single irrigation period as
        // the canonical record while preserving each refill / drainage change.
        waterMovements: Array.isArray(record.waterMovements)
          ? record.waterMovements.map((item) => ({ ...item }))
          : Array.isArray(previous && previous.waterMovements) ? previous.waterMovements.map((item) => ({ ...item })) : [],
        photo: record.photo || "",
        photoData: record.photoData || "",
        memo: record.memo || "",
        createdAt: record.createdAt || previous && previous.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.irrigations.findIndex((item) => item.irrigationId === normalized.irrigationId);
      if (index >= 0) d.irrigations[index] = { ...d.irrigations[index], ...normalized };
      else d.irrigations.push(normalized);
      reconcileWaterSchedulesForRecord(d, normalized, previous, "irrigation", irrigationId);
      if (previous && previous.actualEndDate && !normalized.actualEndDate) {
        restoreLinkedWaterSchedule(d, "irrigation", irrigationId, "end");
      }
      const fieldIndex = d.fields.findIndex((f) => f.fieldId === normalized.fieldId);
      if (fieldIndex >= 0 && /間断/.test(String(normalized.method || ""))) {
        if (normalized.startDate) {
          d.fields[fieldIndex].intermittentStartDate = normalized.startDate;
          d.fields[fieldIndex].intermittentSummaryYear = cacheYearForDate(normalized.startDate);
        }
        if (normalized.targetDays) d.fields[fieldIndex].intermittentIntervalDays = normalized.targetDays;
      }
      return normalized;
  }

  function deleteIrrigation(irrigationId) {
    return mutate((d) => {
      const removed = (d.irrigations || []).find((item) => item.irrigationId === irrigationId);
      d.irrigations = (d.irrigations || []).filter((item) => item.irrigationId !== irrigationId);
      restoreLinkedWaterSchedule(d, "irrigation", irrigationId);
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

  function nextSeasonIdeas() {
    const rows = data().meta && Array.isArray(data().meta.nextSeasonIdeas) ? data().meta.nextSeasonIdeas : [];
    return rows.slice().sort((a, b) => {
      const doneDiff = Number(Boolean(a.done)) - Number(Boolean(b.done));
      return doneDiff || String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    });
  }

  function saveNextSeasonIdea(record) {
    const input = record || {};
    const text = String(input.text || "").trim();
    if (!text) return "";
    const ideaId = String(input.ideaId || U.id("next-season-idea", U.today()));
    const saved = mutate((d) => {
      d.meta = d.meta || {};
      const rows = Array.isArray(d.meta.nextSeasonIdeas) ? d.meta.nextSeasonIdeas : [];
      const index = rows.findIndex((item) => String(item.ideaId) === ideaId);
      const previous = index >= 0 ? rows[index] : null;
      const normalized = {
        ideaId,
        text,
        done: input.done === undefined ? Boolean(previous && previous.done) : Boolean(input.done),
        createdAt: String(input.createdAt || previous && previous.createdAt || U.now()),
        updatedAt: U.now()
      };
      if (index >= 0) rows[index] = { ...previous, ...normalized };
      else rows.push(normalized);
      d.meta.nextSeasonIdeas = rows;
    }, "来年やりたいことを保存しました");
    return saved ? ideaId : "";
  }

  function toggleNextSeasonIdea(ideaId, done) {
    const current = nextSeasonIdeas().find((item) => String(item.ideaId) === String(ideaId));
    if (!current) return null;
    return saveNextSeasonIdea({ ...current, done: Boolean(done) }) ? true : null;
  }

  function deleteNextSeasonIdea(ideaId) {
    const safeId = String(ideaId || "");
    if (!safeId || !nextSeasonIdeas().some((item) => String(item.ideaId) === safeId)) return null;
    return mutate((d) => {
      d.meta = d.meta || {};
      d.meta.nextSeasonIdeas = (Array.isArray(d.meta.nextSeasonIdeas) ? d.meta.nextSeasonIdeas : [])
        .filter((item) => String(item.ideaId) !== safeId);
    }, "来年やりたいことを削除しました");
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
    saturated: { label: "飽水管理", method: "飽水管理" },
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
    if (/飽水管理/.test(text)) return "saturated";
    if (/深水/.test(text)) return "deep";
    if (/稲刈り前.*落水|^落水$/.test(text)) return "drain";
    return "";
  }

  function waterEventFromWorkName(workName) {
    const text = String(workName || "").trim();
    if (!text || /予定|確認/.test(text)) return null;
    const type = /中干し/.test(text) ? "dry"
      : /間断灌水/.test(text) ? "intermittent"
      : /飽水管理/.test(text) ? "saturated"
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
    if (/^飽水管理$/.test(text)) return { kind: "saturated", phase: "legacy" };
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
      // Scheduled periods can carry the date they were registered in `date`.
      // That is not an actual start, so never promote it to factual status.
      const explicitStartDate = String(row.startDate || "");
      const actualEndDate = String(row.actualEndDate || "");
      const plannedEndDate = String(row.endDate || "");
      const planned = !explicitStartDate && Boolean(row.plannedStartDate || plannedEndDate || /予定/.test(String(row.status || row.periodStatus || "")));
      const startDate = planned ? "" : String(explicitStartDate || row.date || "");
      return {
        periodId: `direct:${kind}:${row.dryPeriodId || row.irrigationId || row.date || ""}`,
        kind,
        label: WATER_PERIOD_TYPES[kind].label,
        fieldId,
        season: waterPeriodYear(row),
        startDate,
        plannedStartDate: String(row.plannedStartDate || ""),
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
    return legacyWaterPeriodsFrom(data(), fieldId, year, options);
  }

  function legacyWaterPeriodsFrom(draft, fieldId, year, options) {
    const opts = options || {};
    const works = (draft.fieldWorks || [])
      .filter((row) => (row.fieldIds || []).includes(fieldId) && (!year || waterPeriodYear(row) === String(year)))
      .map((row) => ({ row, event: legacyWaterEventFromWorkName(row.workName) }))
      .filter((item) => item.event)
      .sort((a, b) => String(a.row.date || "").localeCompare(String(b.row.date || "")) || String(a.row.workId || "").localeCompare(String(b.row.workId || "")));
    const periods = [];
    const open = { dry: [], intermittent: [], saturated: [], deep: [], drain: [] };
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
        const work = (draft.fieldWorks || []).find((row) => row.workId === workId);
        return (work && work.waterMigrationLinks || []).some((link) => link.fieldId === fieldId && link.kind === period.kind && link.legacyKey === legacyKey);
      });
      const linkedPeriodId = period.sourceWorkIds.map((workId) => {
        const work = (draft.fieldWorks || []).find((row) => row.workId === workId);
        const link = (work && work.waterMigrationLinks || []).find((item) => item.fieldId === fieldId && item.kind === period.kind && item.legacyKey === legacyKey);
        return link && link.periodId || "";
      }).find(Boolean) || "";
      const closure = !period.actualEndDate && !linked && period.raw.harvestWaterClosures && period.raw.harvestWaterClosures[fieldId];
      return { ...period, ...(closure ? { actualEndDate: closure.date, status: "completed", harvestClosure: closure } : {}), legacyKey, migrated: linked, linkedPeriodId };
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

  function legacyWaterCarryover(period, fallbackMemo, draft) {
    const ids = new Set();
    const rows = [period && period.raw || {}, ...((period && period.sourceWorkIds || []).map((workId) => (draft && draft.fieldWorks || []).find((row) => row.workId === workId) || {}))]
      .filter((row) => {
        const key = row.workId || `${row.date || ""}|${row.title || ""}|${row.memo || ""}`;
        if (ids.has(key)) return false;
        ids.add(key);
        return true;
      });
    const details = rows.flatMap((raw) => [
      raw.machine ? `元作業の機械: ${raw.machine}` : "",
      raw.material ? `元作業の資材: ${raw.material}${raw.amount ? ` ${raw.amount}` : ""}` : "",
      raw.weather ? `元作業の天気: ${raw.weather}` : "",
      raw.memo || ""
    ]).concat(fallbackMemo || "").filter(Boolean);
    const photoRow = rows.slice().reverse().find((raw) => raw.photoData || raw.photo) || {};
    return {
      memo: Array.from(new Set(details)).join("\n"),
      photo: photoRow.photo || "",
      photoData: photoRow.photoData || ""
    };
  }

  function mergeWaterMemo(existingMemo, carryoverMemo) {
    return Array.from(new Set([existingMemo || "", carryoverMemo || ""].filter(Boolean))).join("\n");
  }

  function matchingDirectWaterRow(rows, fieldId, period) {
    return (rows || []).find((row) => row.fieldId === fieldId
      && waterKindFromMethod(row.method || (period.kind === "dry" ? "中干し" : "")) === period.kind
      && String(row.startDate || row.date || "") === String(period.startDate || "")
      && String(row.actualEndDate || "") === String(period.actualEndDate || "")) || null;
  }

  function importLegacyWaterPeriod(fieldId, legacyKey, existingPeriodId) {
    const period = legacyWaterPeriodsFor(fieldId, "", { includeMigrated: true })
      .find((item) => item.legacyKey === legacyKey);
    if (!period || period.migrated || !period.sourceWorkIds.length || !period.startDate || !period.actualEndDate) return null;
    let periodId = "";
    const saved = mutate((d) => {
      const directRows = period.kind === "dry" ? d.dryPeriods : d.irrigations;
      const selected = existingPeriodId && directRows.find((row) => row.fieldId === fieldId
        && (row.dryPeriodId === existingPeriodId || row.irrigationId === existingPeriodId)
        && waterKindFromMethod(row.method || (period.kind === "dry" ? "中干し" : "")) === period.kind
        && String(row.startDate || row.date || "") === String(period.startDate)
        && String(row.actualEndDate || "") === String(period.actualEndDate));
      const same = selected || matchingDirectWaterRow(directRows, fieldId, period);
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
        ...legacyWaterCarryover(period, "旧作業記録から取り込み", d)
      };
        if (period.kind === "dry") saveDryPeriodToDraft(d, { ...base, dryPeriodId: periodId });
        else saveIrrigationToDraft(d, { ...base, irrigationId: periodId, method: WATER_PERIOD_TYPES[period.kind].method });
      } else {
        const index = directRows.indexOf(same);
        directRows[index] = {
          ...same,
          referenceRecordIds: Array.from(new Set([...(same.referenceRecordIds || []), ...period.sourceWorkIds])),
          memo: mergeWaterMemo(same.memo, base.memo),
          photo: same.photo || base.photo,
          photoData: same.photoData || base.photoData,
          updatedAt: U.now()
        };
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
      const directRows = period.kind === "dry" ? d.dryPeriods : d.irrigations;
      const existing = matchingDirectWaterRow(directRows, fieldId, period);
      periodId = existing ? (existing.dryPeriodId || existing.irrigationId) : U.id(period.kind === "dry" ? "dry" : "irrigation", period.startDate || period.actualEndDate || U.today());
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
        ...legacyWaterCarryover(period, "旧作業記録から引き継ぎ（期間を確認）", d)
      };
      if (!existing) {
        if (period.kind === "dry") saveDryPeriodToDraft(d, { ...base, dryPeriodId: periodId });
        else saveIrrigationToDraft(d, { ...base, irrigationId: periodId, method: WATER_PERIOD_TYPES[period.kind].method });
      } else {
        const index = directRows.indexOf(existing);
        directRows[index] = {
          ...existing,
          referenceRecordIds: Array.from(new Set([...(existing.referenceRecordIds || []), ...period.sourceWorkIds])),
          memo: mergeWaterMemo(existing.memo, base.memo),
          photo: existing.photo || base.photo,
          photoData: existing.photoData || base.photoData,
          updatedAt: U.now()
        };
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
      const key = [period.source, period.kind, period.startDate, period.plannedStartDate, period.actualEndDate, period.plannedEndDate].join("|");
      const current = byBoundary.get(key);
      if (!current) {
        byBoundary.set(key, { ...period, displayRecordCount: 1 });
        return;
      }
      current.displayRecordCount += 1;
    });
    return Array.from(byBoundary.values());
  }

  function displayCopy(value) {
    if (Array.isArray(value)) return value.map(displayCopy);
    if (value && typeof value === "object") {
      return Object.keys(value).reduce((copy, key) => {
        copy[key] = displayCopy(value[key]);
        return copy;
      }, {});
    }
    return value;
  }

  // Read-only sources for a field-year timeline. Keep canonical records inside
  // state and return deep display copies so UI code cannot mutate saved data.
  function timelineEntriesForField(fieldId, options) {
    const opts = options || {};
    const year = opts.year === undefined || opts.year === null || String(opts.year) === "all" ? undefined : String(opts.year);
    const id = String(fieldId || "");
    if (!id) return { works: [], headingWorks: [], growth: [], waterPeriods: [], others: [] };
    const allWorks = fieldWorksFor(id, opts.cropYear === true ? undefined : year)
      .filter(row => opts.cropYear !== true || !year || String(cropYearForRecord(row)) === year)
      .filter((row) => isActualFieldWork(row))
      .map(displayCopy);
    const headingWorks = allWorks.filter((row) => isHeadingWorkName(row.workName));
    const works = allWorks
      .filter((row) => !waterEventFromWorkName(row.workName))
      .filter((row) => !isMigratedWaterWork(row, id));
    const growth = growthLogsFor(id, year).map(displayCopy);
    const waterPeriods = resolvedWaterPeriodsFor(id, { year, includePlanned: Boolean(opts.includePlanned), forDisplay: true })
      .map(({ raw, ...period }) => ({
        ...displayCopy(period),
        sourceStatus: String(raw && (raw.status || raw.periodStatus) || "")
      }));
    const others = (data().otherWorks || [])
      .filter((row) => (row.relatedFieldIds || row.fieldIds || []).includes(id))
      .filter((row) => !year || String(opts.cropYear === true ? cropYearForRecord(row) : row.season || String(row.date || "").slice(0, 4)) === year)
      .filter((row) => isActualFieldWork(row))
      .map(displayCopy);
    return { works, headingWorks, growth, waterPeriods, others };
  }

  function seasonNotesForField(fieldId, year, options) {
    const fieldRecord = field(fieldId);
    return (fieldRecord && Array.isArray(fieldRecord.seasonNotes) ? fieldRecord.seasonNotes : [])
      .filter((note) => (options && options.includeCarryover || note.kind !== "carryover")
        && (year === undefined || year === null || year === "all" || String(year).trim() === "" || String(note.season) === String(year)))
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
        ...existing,
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
    if (!seasonNotesForField(safeFieldId, "all", { includeCarryover: true }).some((item) => item.noteId === safeNoteId)) return null;
    return mutate((d) => {
      const fieldIndex = d.fields.findIndex((item) => item.fieldId === safeFieldId);
      if (fieldIndex < 0) return;
      d.fields[fieldIndex].seasonNotes = (d.fields[fieldIndex].seasonNotes || [])
        .filter((item) => item.noteId !== safeNoteId);
    }, "今年の気づきを削除しました");
  }

  function carryoverNoteForField(fieldId, year) {
    return seasonNotesForField(fieldId, year, { includeCarryover: true }).find((note) => note.kind === "carryover") || null;
  }

  function saveCarryoverNote(record) {
    const input = record || {};
    const year = String(input.season || "");
    const fieldId = String(input.fieldId || "");
    const text = typeof input.text === "string" ? input.text.trim() : "";
    const date = input.date || `${year}-01-01`;
    if (!field(fieldId) || !/^[1-9]\d{3}$/.test(year) || !text || harvestDateYear(date) !== year) return "";
    const existing = carryoverNoteForField(fieldId, year);
    if (input.noteId && (!existing || existing.noteId !== input.noteId)) return "";
    return saveSeasonNote({ ...existing, fieldId, season: year, date, text, kind: "carryover", noteId: existing && existing.noteId || "" });
  }

  // Derived outlook history is kept apart from farm records. It is append-only
  // metadata, so saving a recalculation never alters works, growth, or water.
  function outlookSnapshotKey(row) {
    const ignored = new Set(["snapshotId", "savedAt", "headingErrorDays", "harvestErrorDays"]);
    const canonical = value => {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
        .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
      return value;
    };
    return JSON.stringify(canonical(Object.fromEntries(Object.entries(row || {}).filter(([key]) => !ignored.has(key)))));
  }

  function saveOutlookSnapshots(rows) {
    const incoming = (Array.isArray(rows) ? rows : []).filter((row) => row && row.fieldId && row.season && row.asOf);
    if (!incoming.length) return data();
    const existing = Array.isArray(data().meta && data().meta.outlookSnapshots) ? data().meta.outlookSnapshots : [];
    const keyFor = outlookSnapshotKey;
    const known = new Set(existing.map(keyFor));
    const additions = incoming.filter((row) => {
      const key = keyFor(row);
      if (known.has(key)) return false;
      known.add(key); return true;
    }).map((row) => ({
      ...U.clone(row),
      snapshotId: row.snapshotId || U.id("outlook", `${row.fieldId}-${row.season}-${row.asOf}`),
      savedAt: U.now()
    }));
    if (!additions.length) return data();
    const previousEstimated = (fieldId, season, type) => existing.slice().reverse().find((row) => row.fieldId === fieldId && row.season === season && row[type] && !/^actual$/.test(String(row[`${type.replace("Date", "")}Kind`] || "")));
    return mutate((draft) => {
      draft.meta = draft.meta || {};
      const snapshots = Array.isArray(draft.meta.outlookSnapshots) ? draft.meta.outlookSnapshots.slice() : [];
      additions.forEach((row) => {
        const headingPrevious = row.actualHeadingDate ? previousEstimated(row.fieldId, row.season, "headingDate") : null;
        const harvestPrevious = row.actualHarvestDate ? previousEstimated(row.fieldId, row.season, "harvestDate") : null;
        if (headingPrevious && headingPrevious.headingDate) row.headingErrorDays = U.daysBetween(headingPrevious.headingDate, row.actualHeadingDate);
        if (harvestPrevious && harvestPrevious.harvestDate) row.harvestErrorDays = U.daysBetween(harvestPrevious.harvestDate, row.actualHarvestDate);
        snapshots.push(row);
      });
      draft.meta.outlookSnapshots = snapshots;
    }, "見通しを更新しました");
  }

  function lastFieldWork(fieldId) {
    return fieldWorksFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function lastGrowthLog(fieldId) {
    return growthLogsFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function inventoryRowsFor(collection, filters = {}) {
    return U.clone((data()[collection] || []).filter(row =>
      (filters.season === undefined || row.season === Number(filters.season)) &&
      (filters.varietyId === undefined || row.varietyId === filters.varietyId) &&
      (filters.fieldId === undefined || (row.fieldIds || []).includes(filters.fieldId)) &&
      (filters.millingId === undefined || row.millingId === filters.millingId)));
  }

  function millingRecordsFor(filters = {}) { return inventoryRowsFor("millingRecords", filters); }
  function shipmentIssuesFor(filters = {}) { return inventoryRowsFor("shipmentIssues", filters); }

  function inventoryPackageTotals(packages) {
    if (!Array.isArray(packages)) return null;
    let kg = 0, bags = 0;
    for (const row of packages) {
      if (!row || typeof row.kg !== "number" || !Number.isFinite(row.kg) || row.kg <= 0 || !Number.isSafeInteger(row.bags) || row.bags <= 0) return null;
      kg += row.kg * row.bags; bags += row.bags;
    }
    return Number.isFinite(kg) && Number.isSafeInteger(bags) ? { kg, bags } : null;
  }

  function millingRecordTotals(row) {
    const totals = inventoryPackageTotals(row && row.packages);
    const loose = row && row.looseKg;
    if (!totals || typeof loose !== "number" || !Number.isFinite(loose) || loose < 0 || !Number.isFinite(totals.kg + loose)) return { kg: null, bags: null };
    return { kg: totals.kg + loose, bags: totals.bags };
  }

  function saveInventoryRecord(collection, idKey, input, normalize) {
    input = input || {};
    try {
      const previous = (data()[collection] || []).find(row => row[idKey] === input[idKey]);
      if (input[idKey] && !previous) throw new Error("編集対象の記録が見つかりません。");
      const defined = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
      const candidate = normalize({ ...previous, ...defined, createdAt: previous ? previous.createdAt : U.now(), updatedAt: previous ? previous.updatedAt : U.now() }, true);
      const sameReference = previous && candidate.varietyId === previous.varietyId;
      if (!variety(candidate.varietyId) && !sameReference) throw new Error("登録済みの品種を選択してください。");
      if (collection === "millingRecords") {
        const unchangedTargets = sameReference && JSON.stringify(candidate.fieldIds) === JSON.stringify(previous.fieldIds);
        if (!unchangedTargets && candidate.fieldIds.some(id => !field(id) || field(id).varietyId !== candidate.varietyId)) throw new Error("選択圃場の品種が一致していません。");
        // Moving a referenced batch would silently change the meaning of its issue history.
        if (previous && (candidate.season !== previous.season || !sameReference) && (data().shipmentIssues || []).some(row => row.millingId === previous.millingId)) throw new Error("対応記録があるため年度・品種を変更できません。");
      } else if (candidate.millingId) {
        const linked = (data().millingRecords || []).find(row => row.millingId === candidate.millingId);
        const historical = previous && previous.millingId === candidate.millingId && previous.season === candidate.season && sameReference;
        if (linked ? linked.season !== candidate.season || linked.varietyId !== candidate.varietyId : !historical) throw new Error("籾摺り記録の年度・品種を確認してください。");
      }
      if (previous && JSON.stringify(candidate) === JSON.stringify(previous)) return U.clone(previous);
      candidate.updatedAt = U.now();
      const saved = mutate(d => {
        d[collection] = d[collection] || [];
        const index = d[collection].findIndex(row => row[idKey] === candidate[idKey]);
        if (index < 0) d[collection].push(candidate); else d[collection][index] = candidate;
      }, "記録を保存しました");
      return saved ? U.clone(saved[collection].find(row => row[idKey] === candidate[idKey])) : null;
    } catch (error) { lastError = error; return null; }
  }

  function saveMillingRecord(input) { return saveInventoryRecord("millingRecords", "millingId", input, S.normalizeMillingRecord); }
  function saveShipmentIssue(input) { return saveInventoryRecord("shipmentIssues", "issueId", input, S.normalizeShipmentIssue); }
  function deleteInventoryRecord(collection, idKey, id) {
    if (!(data()[collection] || []).some(row => row[idKey] === id)) return null;
    return mutate(d => { d[collection] = d[collection].filter(row => row[idKey] !== id); }, "記録を削除しました");
  }
  function deleteMillingRecord(id) { return deleteInventoryRecord("millingRecords", "millingId", id); }
  function deleteShipmentIssue(id) { return deleteInventoryRecord("shipmentIssues", "issueId", id); }

  function riceStockFor(season, varietyId) {
    const result = { receivedKg: 0, dispatchedKg: 0, remainingKg: 0, receivedBags: 0, whiteShipmentCount: 0, unquantifiedCount: 0, unclassifiedCount: 0, hasHarvest: false, issueCostYen: 0, issueCount: 0, issueUnpricedCount: 0 };
    if (!S.validCropYear(season) || !varietyId) return result;
    for (const row of millingRecordsFor({ season, varietyId })) {
      const totals = millingRecordTotals(row);
      if (totals.kg === null || totals.kg <= 0) { result.unquantifiedCount++; continue; }
      result.receivedKg += totals.kg; result.receivedBags += totals.bags;
      result.hasHarvest = true;
    }
    for (const row of data().shipments || []) {
      if (row.season !== Number(season) || !["shipment", "sale", "gift"].includes(row.kind)) continue;
      if (!row.varietyId) { result.unclassifiedCount++; continue; }
      if (row.varietyId !== varietyId) continue;
      if (row.inventoryRiceTypeUnverified) { result.unquantifiedCount++; continue; }
      if (row.riceType === "white") { result.whiteShipmentCount++; continue; }
      const totals = inventoryPackageTotals(row.packages);
      if (row.riceType !== "brown" || !totals || !row.packages.length) { result.unquantifiedCount++; continue; }
      result.dispatchedKg += totals.kg;
    }
    for (const row of shipmentIssuesFor({ season, varietyId })) {
      result.issueCount++;
      if (Number.isSafeInteger(row.costYen) && row.costYen >= 0) result.issueCostYen += row.costYen;
      else result.issueUnpricedCount++;
    }
    result.remainingKg = result.receivedKg - result.dispatchedKg;
    return result;
  }

  function shipments() {
    return U.clone(data().shipments || []);
  }

  function saveShipment(record) {
    const input = record || {};
    let shipmentId;
    const saved = mutate((d) => {
      d.shipments = d.shipments || [];
      const index = d.shipments.findIndex((row) => row.shipmentId === input.shipmentId);
      const previous = index >= 0 ? d.shipments[index] : null;
      const normalized = S.normalizeShipment({
        ...previous,
        ...input,
        createdAt: previous ? previous.createdAt : U.now(),
        updatedAt: U.now()
      }, true);
      shipmentId = normalized.shipmentId;
      if (index >= 0) d.shipments[index] = normalized;
      else d.shipments.push(normalized);
    }, "出荷記録を保存しました");
    return saved ? U.clone(saved.shipments.find((row) => row.shipmentId === shipmentId)) : null;
  }

  function deleteShipment(shipmentId) {
    if (!(data().shipments || []).some((row) => row.shipmentId === shipmentId)) return null;
    return mutate((d) => {
      d.shipments = (d.shipments || []).filter((row) => row.shipmentId !== shipmentId);
    }, "出荷記録を削除しました");
  }

  function shipmentPrices() {
    return U.clone(data().shipmentPrices || []);
  }

  function saveShipmentPrice(record) {
    const input = record || {};
    let priceId;
    const saved = mutate((d) => {
      d.shipmentPrices = d.shipmentPrices || [];
      const byId = d.shipmentPrices.find((row) => row.priceId === input.priceId);
      const candidate = S.normalizeShipmentPrice({ ...byId, ...input }, true);
      const byKey = d.shipmentPrices.find((row) => row.season === candidate.season && row.recipient === candidate.recipient);
      if (byId && byKey && byId.priceId !== byKey.priceId) throw new Error("同じ相手先・収穫年度の単価が既にあります。");
      const previous = byKey || byId;
      const normalized = {
        ...previous,
        ...candidate,
        priceId: previous ? previous.priceId : candidate.priceId,
        createdAt: previous ? previous.createdAt : U.now(),
        updatedAt: U.now()
      };
      priceId = normalized.priceId;
      const index = d.shipmentPrices.findIndex((row) => row.priceId === priceId);
      if (index >= 0) d.shipmentPrices[index] = normalized;
      else d.shipmentPrices.push(normalized);
    }, "相手先の単価を保存しました");
    return saved ? U.clone(saved.shipmentPrices.find((row) => row.priceId === priceId)) : null;
  }

  function deleteShipmentPrice(priceId) {
    if (!(data().shipmentPrices || []).some((row) => row.priceId === priceId)) return null;
    return mutate((d) => {
      d.shipmentPrices = (d.shipmentPrices || []).filter((row) => row.priceId !== priceId);
    }, "相手先の単価を削除しました");
  }

  function machines(options) {
    const opts = options || {};
    return (data().machines || []).filter((row) => opts.includeRetired || row.status !== "使用停止")
      .slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ja"));
  }

  function machine(machineId) {
    return (data().machines || []).find((row) => row.machineId === machineId) || null;
  }

  function maintenanceRecordsFor(machineId) {
    return (data().maintenanceRecords || []).filter((row) => row.machineId === machineId)
      .slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  function saveMachine(record) {
    const input = record || {};
    const prior = input.machineId ? machine(String(input.machineId)) : null;
    const name = String(input.name === undefined ? prior && prior.name || "" : input.name || "").trim();
    if (!name) { lastError = new Error("機械名を入力してください。"); return ""; }
    let machineId = String(input.machineId || "");
    const saved = mutate((d) => {
      machineId = machineId || U.id("machine", U.today());
      const index = (d.machines || []).findIndex((row) => row.machineId === machineId);
      const existing = index >= 0 ? d.machines[index] : null;
      if (input.machineId && !existing) throw new Error("機械が見つかりません。画面を開き直してください。");
      const merged = { ...existing, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
      if (input.meterHours !== undefined) merged.meterHours = validatedMeter(input.meterHours);
      // Form submissions resend the displayed derived value; only a changed value
      // or explicit confirmation establishes a new manual baseline.
      const manual = !existing || input.meterManualOverride === true
        || input.meterHours !== undefined && (String(merged.meterHours) === "" || String(existing.meterHours || "") === ""
          ? String(merged.meterHours) !== String(existing.meterHours || "")
          : Number(merged.meterHours) !== Number(existing.meterHours));
      delete merged.meterBaseline;
      delete merged.meterOrigin;
      if (manual) { merged.meterBaseline = String(merged.meterHours ?? ""); merged.meterOrigin = "manual"; }
      else if (existing.meterBaseline !== undefined) {
        merged.meterBaseline = existing.meterBaseline;
        merged.meterOrigin = existing.meterOrigin;
      }
      const normalized = S.normalizeMachine({ ...merged, machineId, name, createdAt: existing && existing.createdAt || input.createdAt || U.now(), updatedAt: U.now() }, index >= 0 ? index : (d.machines || []).length);
      d.machines = d.machines || [];
      if (index >= 0) d.machines[index] = normalized;
      else d.machines.push(normalized);
      recomputeMachineMeter(d, machineId);
    }, input.machineId ? "機械情報を更新しました" : "機械を登録しました");
    return saved ? machineId : "";
  }

  function retireMachine(machineId) {
    if (!machine(machineId)) return null;
    return mutate((d) => {
      const index = (d.machines || []).findIndex((row) => row.machineId === machineId);
      if (index < 0) return;
      d.machines[index] = { ...d.machines[index], status: "使用停止", retiredAt: U.today(), updatedAt: U.now() };
    }, "機械を使用停止にしました。整備履歴は残ります");
  }

  function saveMaintenanceRecord(record) {
    const input = record || {};
    const previous = input.maintenanceId && (data().maintenanceRecords || []).find((row) => row.maintenanceId === input.maintenanceId);
    const targetId = input.machineId === undefined ? previous && previous.machineId : input.machineId;
    const targetMachine = machine(targetId);
    if (!targetId || !targetMachine) { lastError = new Error("対象の機械が見つかりません。"); return ""; }
    if (targetMachine.status === "使用停止" && !input.maintenanceId) { lastError = new Error("使用停止中の機械には新しい整備記録を追加できません。"); return ""; }
    const date = String(input.date === undefined ? previous && previous.date || U.today() : input.date || U.today());
    let maintenanceId = String(input.maintenanceId || "");
    const saved = mutate((d) => {
      maintenanceId = maintenanceId || U.id("maintenance", date);
      const index = (d.maintenanceRecords || []).findIndex((row) => row.maintenanceId === maintenanceId);
      const existing = index >= 0 ? d.maintenanceRecords[index] : null;
      if (input.maintenanceId && !existing) throw new Error("整備記録が見つかりません。画面を開き直してください。");
      const merged = { ...existing, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
      if (input.meterHours !== undefined) merged.meterHours = validatedMeter(input.meterHours);
      const normalized = S.normalizeMaintenanceRecord({ ...merged, machineId: targetId, maintenanceId, date, createdAt: existing && existing.createdAt || input.createdAt || U.now(), updatedAt: U.now() }, index >= 0 ? index : (d.maintenanceRecords || []).length);
      d.maintenanceRecords = d.maintenanceRecords || [];
      if (index >= 0) d.maintenanceRecords[index] = normalized;
      else d.maintenanceRecords.push(normalized);
      if (existing && existing.machineId !== normalized.machineId) recomputeMachineMeter(d, existing.machineId);
      recomputeMachineMeter(d, normalized.machineId);
    }, input.maintenanceId ? "整備記録を更新しました" : "整備記録を追加しました");
    return saved ? maintenanceId : "";
  }

  function deleteMaintenanceRecord(maintenanceId) {
    if (!(data().maintenanceRecords || []).some((row) => row.maintenanceId === maintenanceId)) return null;
    return mutate((d) => {
      const removed = d.maintenanceRecords.find((row) => row.maintenanceId === maintenanceId);
      d.maintenanceRecords = d.maintenanceRecords.filter((row) => row.maintenanceId !== maintenanceId);
      recomputeMachineMeter(d, removed.machineId);
    }, "整備記録を削除しました");
  }

  function validatedMeter(value) {
    const text = String(value ?? "").trim();
    if (text && (!Number.isFinite(Number(text)) || Number(text) < 0)) throw new Error("稼働時間は0以上の数値で入力してください。");
    return text;
  }

  function recomputeMachineMeter(d, machineId) {
    const row = (d.machines || []).find((item) => item.machineId === machineId);
    if (!row) return;
    const known = row.meterBaseline !== undefined;
    const base = known ? String(row.meterBaseline) : String(row.meterHours || "");
    const valid = value => String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
    // Unknown legacy readings remain a floor, never an inferred manual baseline.
    if (!known && base && !valid(base)) return;
    let meter = base;
    let origin = "manual";
    (d.maintenanceRecords || []).filter((item) => item.machineId === machineId).forEach((item) => {
      if (valid(item.meterHours) && (!valid(meter) || Number(item.meterHours) > Number(meter))) {
        meter = item.meterHours;
        origin = "maintenance";
      }
    });
    if (row.meterHours !== meter || known && row.meterOrigin !== origin) {
      row.meterHours = meter;
      if (known) row.meterOrigin = origin;
      row.updatedAt = U.now();
    }
  }

  // Existing records get the same reversible view without a startup storage write.
  reconcileHarvestWaterClosures(cache);
  reconcileWorkSchedules(cache, { existingOnly: true });
  reconcileExistingWaterSchedules(cache);

  RiceOS.state = {
    data,
    cropYearForRecord,
    defaultCropYear,
    defaultShipmentCropYear,
    cropYearClosureFor,
    closeCropYear,
    reopenCropYear,
    setActiveCropYear,
    setRecordCropYear,
    lastSaveError,
    save,
    replace,
    mutate,
    shipments,
    saveMillingRecord,
    deleteMillingRecord,
    millingRecordsFor,
    millingRecordTotals,
    riceStockFor,
    saveShipmentIssue,
    deleteShipmentIssue,
    shipmentIssuesFor,
    saveShipment,
    deleteShipment,
    shipmentPrices,
    saveShipmentPrice,
    deleteShipmentPrice,
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
    deleteVariety,
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
    harvestStatusForField,
    confirmHarvestCompletion,
    isHeadingWorkName,
    saveFieldWork,
    saveHarvestThermalSnapshots,
    retryHarvestThermal,
    isHarvestThermalComplete,
    retryHarvestTimingThermal,
    harvestTimingThermalIsCurrent,
    harvestForecastComparisonFor,
    harvestTimingComparisonFor,
    harvestVarietyComparisonFor,
    completeHarvestThermal,
    saveHarvestWeatherSnapshot,
    deleteFieldWork,
    deleteFieldWorks,
    saveGrowthLog,
    saveGrowthLogsBatch,
    deleteGrowthLog,
    saveOtherWork,
    deleteOtherWork,
    saveMaterial,
    deleteMaterial,
    materialUsageForYear,
    saveResult,
    deleteResult,
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
    nextSeasonIdeas,
    saveNextSeasonIdea,
    toggleNextSeasonIdea,
    deleteNextSeasonIdea,
    undoLastSave,
    fieldWorksFor,
    isMigratedWaterWork,
    waterEventForWorkName: waterEventFromWorkName,
    waterScheduleTarget,
    isWaterConfirmationSchedule,
    growthLogsFor,
    dryPeriodsFor,
    irrigationsFor,
    resolvedWaterPeriodsFor,
    timelineEntriesForField,
    legacyWaterReviewFor,
    directWaterMatchesForLegacy,
    importLegacyWaterPeriod,
    adoptLegacyWaterPeriod,
    seasonNotesForField,
    saveSeasonNote,
    deleteSeasonNote,
    carryoverNoteForField,
    saveCarryoverNote,
    saveOutlookSnapshots,
    outlookSnapshotKey,
    lastFieldWork,
    lastGrowthLog,
    machines,
    machine,
    maintenanceRecordsFor,
    saveMachine,
    retireMachine,
    saveMaintenanceRecord,
    deleteMaintenanceRecord
  };
})();
