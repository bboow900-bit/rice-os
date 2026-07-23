(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const storage = RiceOS.storage;

  let cache = storage.loadData();

  function emit(message, status) {
    window.dispatchEvent(new CustomEvent("riceos:datachange", { detail: { message: message || "保存しました", status: status || "saved" } }));
  }

  function data() {
    return cache;
  }

  function save(next, message) {
    try {
      emit("自動保存中", "saving");
      cache = storage.saveData(next);
      emit(message, "saved");
    } catch (error) {
      alert(error.message);
      emit("保存に失敗しました", "error");
    }
    return cache;
  }

  function replace(next, message) {
    try {
      emit("復元中", "saving");
      cache = storage.replaceData(next);
      emit(message || "復元しました", "saved");
    } catch (error) {
      alert(error.message);
      emit("復元に失敗しました", "error");
    }
    return cache;
  }

  function mutate(fn, message) {
    const draft = U.clone(cache);
    fn(draft);
    return save(draft, message);
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

  function variety(varietyId) {
    return varieties().find((v) => v.varietyId === varietyId);
  }

  function field(fieldId) {
    return fields().find((f) => f.fieldId === fieldId);
  }

  function addVariety(name) {
    const cleanName = String(name || "").trim() || "新しい品種";
    let newId = "";
    mutate((d) => {
      newId = U.id("variety", U.today());
      d.varieties.push({
        ...S.DEFAULT_VARIETIES[0],
        varietyId: newId,
        name: cleanName,
        memo: ""
      });
    }, "品種を追加しました");
    return newId;
  }

  function updateVariety(varietyId, patch) {
    mutate((d) => {
      const index = d.varieties.findIndex((v) => v.varietyId === varietyId);
      if (index >= 0) d.varieties[index] = { ...d.varieties[index], ...patch, updatedAt: U.now() };
    }, "栽培レシピを保存しました");
  }

  function addField(name) {
    const cleanName = String(name || "").trim() || "新しい圃場";
    const base = fields();
    let newId = "";
    mutate((d) => {
      newId = U.id("field", U.today());
      d.fields.push({
        ...S.DEFAULT_FIELDS[0],
        fieldId: newId,
        name: cleanName,
        areaA: 0,
        plantingDate: "",
        fixedMemo: "",
        memo: "",
        varietyId: d.varieties[0] && d.varieties[0].varietyId || "",
        sortOrder: (base.length + 1) * 10
      });
    }, "圃場を追加しました");
    return newId;
  }

  function updateField(fieldId, patch) {
    mutate((d) => {
      const index = d.fields.findIndex((f) => f.fieldId === fieldId);
      if (index >= 0) d.fields[index] = { ...d.fields[index], ...patch, updatedAt: U.now() };
    }, "圃場マスターを保存しました");
  }

  function deleteField(fieldId) {
    mutate((d) => {
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
    return workTextMatches(workName, ["中干し開始", "荳ｭ蟷ｲ縺鈴幕蟋・"]);
  }

  function isDryEndWorkName(workName) {
    return workTextMatches(workName, ["中干し終了", "中干し完了", "中干完了", "荳ｭ蟷ｲ縺礼ｵゆｺ・"]);
  }

  function dryActualDaysForField(field, actualEndDate) {
    const startDate = field && field.drainageStartDate || "";
    const actual = actualEndDate || "";
    const days = startDate && actual ? U.daysBetween(startDate, actual) : "";
    return days === "" ? "" : String(days);
  }

  function fieldWorksByNameFor(fieldId, names) {
    return data().fieldWorks
      .filter((work) => (work.fieldIds || []).includes(fieldId) && matchesWorkName(work, names))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  function firstFieldWorkDate(fieldId, names) {
    const work = fieldWorksByNameFor(fieldId, names)[0];
    return work && work.date || "";
  }

  function lastFieldWorkDate(fieldId, names) {
    const rows = fieldWorksByNameFor(fieldId, names);
    const work = rows[rows.length - 1];
    return work && work.date || "";
  }

  function plantingDateForField(fieldId) {
    return firstFieldWorkDate(fieldId, "田植え");
  }

  function workDateForField(fieldId, names, mode) {
    return mode === "last" ? lastFieldWorkDate(fieldId, names) : firstFieldWorkDate(fieldId, names);
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
    mutate((d) => {
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
        sourceScheduleId: record.sourceScheduleId || "",
        growthSnapshots: record.growthSnapshots || {},
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
      if (normalized.sourceScheduleId) {
        const scheduleIndex = (d.schedules || []).findIndex((schedule) => schedule.scheduleId === normalized.sourceScheduleId);
        if (scheduleIndex >= 0) {
          d.schedules[scheduleIndex] = {
            ...d.schedules[scheduleIndex],
            status: "実施済み",
            completedAt: U.now(),
            completedByWorkId: normalized.workId,
            completionReason: `${normalized.workName || "作業"}の作業記録により完了`,
            updatedAt: U.now()
          };
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
          if (fieldIndex >= 0 && !d.fields[fieldIndex].drainageStartDate) d.fields[fieldIndex].drainageStartDate = normalized.date;
        });
      }
      if (isDryEndWorkName(normalized.workName)) {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) {
            d.fields[fieldIndex].drainageActualEndDate = normalized.date;
            d.fields[fieldIndex].drainageActualDays = dryActualDaysForField(d.fields[fieldIndex], normalized.date);
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
          if (fieldIndex >= 0 && !d.fields[fieldIndex].drainageStartDate) d.fields[fieldIndex].drainageStartDate = normalized.date;
        });
      }
      if (normalized.workName === "中干し終了") {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) {
            d.fields[fieldIndex].drainageActualEndDate = normalized.date;
            d.fields[fieldIndex].drainageActualDays = dryActualDaysForField(d.fields[fieldIndex], normalized.date);
          }
        });
      }
    }, workSaveFeedback(record));
  }

  function deleteFieldWork(workId) {
    mutate((d) => {
      d.fieldWorks = d.fieldWorks.filter((w) => w.workId !== workId);
      (d.schedules || []).forEach((schedule) => {
        if (schedule.completedByWorkId !== workId) return;
        schedule.status = "予定";
        schedule.completedAt = "";
        schedule.completedByWorkId = "";
        schedule.completionReason = "";
        schedule.updatedAt = U.now();
      });
    }, "圃場作業を削除しました");
  }

  function saveGrowthLog(record) {
    mutate((d) => {
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
    }, growthSaveFeedback(record));
  }

  function deleteGrowthLog(logId) {
    mutate((d) => {
      d.growthLogs = d.growthLogs.filter((g) => g.logId !== logId);
    }, "生育ログを削除しました");
  }

  function saveOtherWork(record) {
    mutate((d) => {
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
    mutate((d) => {
      d.otherWorks = d.otherWorks.filter((o) => o.otherWorkId !== otherWorkId);
    }, "その他作業を削除しました");
  }

  function saveMaterial(record) {
    mutate((d) => {
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
    mutate((d) => {
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
    mutate((d) => {
      d.meta = d.meta || {};
      d.meta.weatherLocation = location;
    }, "天気取得位置を保存しました");
  }

  function saveSchedule(record) {
    mutate((d) => {
      const date = record.date || U.today();
      const normalized = {
        scheduleId: record.scheduleId || U.id("schedule", date),
        type: "schedule",
        date,
        season: U.season(date),
        fieldIds: record.fieldIds || [],
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
    mutate((d) => {
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
    mutate((d) => {
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
    mutate((d) => {
      d.schedules = (d.schedules || []).filter((s) => s.scheduleId !== scheduleId);
    }, "予定を削除しました");
  }

  function saveDryPeriod(record) {
    mutate((d) => {
      const date = record.date || U.today();
      const dryPeriodId = record.dryPeriodId || U.id("dry", date);
      const previous = d.dryPeriods.find((item) => item.dryPeriodId === dryPeriodId) || null;
      const normalized = {
        dryPeriodId,
        type: "dryPeriod",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
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
        if (normalized.startDate) d.fields[fieldIndex].drainageStartDate = normalized.startDate;
        if (normalized.targetDays) d.fields[fieldIndex].drainageTargetDays = normalized.targetDays;
        if (normalized.endDate) d.fields[fieldIndex].drainagePlannedEndDate = normalized.endDate;
        if (normalized.actualEndDate) {
          d.fields[fieldIndex].drainageActualEndDate = normalized.actualEndDate;
          d.fields[fieldIndex].drainageActualDays = dryActualDaysForField(d.fields[fieldIndex], normalized.actualEndDate);
        }
      }
    }, `${fieldNameForFeedback(record.fieldId)}の中干し記録を残しました。圃場カードの水管理も更新しました。`);
  }

  function deleteDryPeriod(dryPeriodId) {
    mutate((d) => {
      d.dryPeriods = (d.dryPeriods || []).filter((item) => item.dryPeriodId !== dryPeriodId);
    }, "中干し記録を削除しました");
  }

  function saveIrrigation(record) {
    mutate((d) => {
      const date = record.date || U.today();
      const irrigationId = record.irrigationId || U.id("irrigation", date);
      const previous = d.irrigations.find((item) => item.irrigationId === irrigationId) || null;
      const normalized = {
        irrigationId,
        type: "irrigation",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
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
      if (fieldIndex >= 0) {
        if (normalized.startDate) d.fields[fieldIndex].intermittentStartDate = normalized.startDate;
        if (normalized.targetDays) d.fields[fieldIndex].intermittentIntervalDays = normalized.targetDays;
      }
    }, "水管理を保存しました");
  }

  function deleteIrrigation(irrigationId) {
    mutate((d) => {
      d.irrigations = (d.irrigations || []).filter((item) => item.irrigationId !== irrigationId);
    }, "水管理を削除しました");
  }

  function markJsonExported() {
    mutate((d) => {
      d.meta = d.meta || {};
      d.meta.lastJsonExportAt = U.now();
    }, "JSONバックアップ日を記録しました");
  }

  function markNotificationCheck() {
    mutate((d) => {
      d.meta = d.meta || {};
      d.meta.lastNotificationCheck = U.today();
    }, "通知確認日を記録しました");
  }

  function undoLastSave() {
    const restored = storage.restoreBackup();
    if (!restored) return null;
    cache = restored;
    emit("直前バックアップに戻しました", "saved");
    return cache;
  }

  function fieldWorksFor(fieldId) {
    return data().fieldWorks.filter((w) => (w.fieldIds || []).includes(fieldId));
  }

  function growthLogsFor(fieldId) {
    return data().growthLogs.filter((g) => g.fieldId === fieldId);
  }

  function dryPeriodsFor(fieldId) {
    return (data().dryPeriods || []).filter((d) => d.fieldId === fieldId);
  }

  function irrigationsFor(fieldId) {
    return (data().irrigations || []).filter((i) => i.fieldId === fieldId);
  }

  function lastFieldWork(fieldId) {
    return fieldWorksFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function lastGrowthLog(fieldId) {
    return growthLogsFor(fieldId).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  RiceOS.state = {
    data,
    save,
    replace,
    mutate,
    varieties,
    fields,
    activeFields,
    variety,
    field,
    addVariety,
    updateVariety,
    addField,
    updateField,
    deleteField,
    plantingDateForField,
    workDateForField,
    fieldWorksByNameFor,
    saveFieldWork,
    deleteFieldWork,
    saveGrowthLog,
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
    deleteDryPeriod,
    saveIrrigation,
    deleteIrrigation,
    updateWeatherLocation,
    markJsonExported,
    markNotificationCheck,
    undoLastSave,
    fieldWorksFor,
    growthLogsFor,
    dryPeriodsFor,
    irrigationsFor,
    lastFieldWork,
    lastGrowthLog
  };
})();
