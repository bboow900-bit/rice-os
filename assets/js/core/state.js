(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const storage = RiceOS.storage;

  let cache = storage.loadData();

  function emit(message) {
    window.dispatchEvent(new CustomEvent("riceos:datachange", { detail: { message: message || "保存しました" } }));
  }

  function data() {
    return cache;
  }

  function save(next, message) {
    try {
      cache = storage.saveData(next);
      emit(message);
    } catch (error) {
      alert(error.message);
      emit("保存に失敗しました");
    }
    return cache;
  }

  function replace(next, message) {
    try {
      cache = storage.replaceData(next);
      emit(message || "復元しました");
    } catch (error) {
      alert(error.message);
      emit("復元に失敗しました");
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
    return fields().filter((f) => f.status !== "終了");
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

  function saveFieldWork(record) {
    mutate((d) => {
      const date = record.date || U.today();
      const normalized = {
        workId: record.workId || U.id("work", date),
        type: "fieldWork",
        date,
        season: U.season(date),
        fieldIds: record.fieldIds || [],
        workName: record.workName || "その他",
        hours: record.hours || "",
        machine: record.machine || "",
        material: record.material || "",
        amount: record.amount || "",
        weather: record.weather || "",
        weatherAuto: record.weatherAuto || null,
        memo: record.memo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.fieldWorks.findIndex((w) => w.workId === normalized.workId);
      if (index >= 0) d.fieldWorks[index] = { ...d.fieldWorks[index], ...normalized };
      else d.fieldWorks.push(normalized);
      if (normalized.workName === "田植え") {
        normalized.fieldIds.forEach((fieldId) => {
          const fieldIndex = d.fields.findIndex((f) => f.fieldId === fieldId);
          if (fieldIndex >= 0) d.fields[fieldIndex].plantingDate = normalized.date;
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
          if (fieldIndex >= 0 && !d.fields[fieldIndex].intermittentStartDate) d.fields[fieldIndex].intermittentStartDate = normalized.date;
        });
      }
    }, "圃場作業を保存しました");
  }

  function deleteFieldWork(workId) {
    mutate((d) => {
      d.fieldWorks = d.fieldWorks.filter((w) => w.workId !== workId);
    }, "圃場作業を削除しました");
  }

  function saveGrowthLog(record) {
    mutate((d) => {
      const date = record.date || U.today();
      const leafColorScore = String(record.leafColorScore || RiceOS.schema.leafColorScoreFromText(record.leafColor || ""));
      const normalized = {
        logId: record.logId || U.id("growth", date),
        type: "growthLog",
        date,
        season: U.season(date),
        fieldId: record.fieldId || "",
        leafColorScore,
        leafColor: leafColorScore ? RiceOS.schema.leafColorLabel(leafColorScore) : (record.leafColor || "-"),
        weed: record.weed || "-",
        gas: record.gas || "-",
        water: record.water || "-",
        photo: record.photo || "",
        photoData: record.photoData || "",
        memo: record.memo || "",
        createdAt: record.createdAt || U.now(),
        updatedAt: U.now()
      };
      const index = d.growthLogs.findIndex((g) => g.logId === normalized.logId);
      if (index >= 0) d.growthLogs[index] = { ...d.growthLogs[index], ...normalized };
      else d.growthLogs.push(normalized);
    }, "生育ログを保存しました");
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
        areaA: record.areaA || "",
        yield: record.yield || "",
        grade: record.grade || "",
        quality: record.quality || "",
        salesAmount: record.salesAmount || "",
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
    emit("直前バックアップに戻しました");
    return cache;
  }

  function fieldWorksFor(fieldId) {
    return data().fieldWorks.filter((w) => (w.fieldIds || []).includes(fieldId));
  }

  function growthLogsFor(fieldId) {
    return data().growthLogs.filter((g) => g.fieldId === fieldId);
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
    saveFieldWork,
    deleteFieldWork,
    saveGrowthLog,
    deleteGrowthLog,
    saveOtherWork,
    deleteOtherWork,
    saveMaterial,
    saveResult,
    updateWeatherLocation,
    markJsonExported,
    markNotificationCheck,
    undoLastSave,
    fieldWorksFor,
    growthLogsFor,
    lastFieldWork,
    lastGrowthLog
  };
})();
