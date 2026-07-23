(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;

  function safeParse(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function readRaw(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeRaw(key, raw) {
    localStorage.setItem(key, raw);
  }

  function findLegacy() {
    for (const key of S.LEGACY_STORES) {
      const parsed = safeParse(readRaw(key));
      if (parsed && (parsed.fields || parsed.varieties || parsed.fieldWorks || parsed.growthLogs || parsed.works)) {
        parsed.importedFrom = key;
        return { key, data: parsed };
      }
    }
    return null;
  }

  function loadData() {
    const currentRaw = readRaw(S.STORE_KEY);
    const current = safeParse(currentRaw);
    if (current) {
      const normalized = S.normalize(current);
      const previousVersion = Number(current.schemaVersion || 0);
      if (previousVersion < S.SCHEMA_VERSION) {
        try {
          if (currentRaw) writeRaw(S.BACKUP_KEY, currentRaw);
          normalized.meta = normalized.meta || {};
          normalized.meta.lastBackupAt = U.now();
          normalized.meta.migratedFromSchemaVersion = previousVersion;
          normalized.meta.migratedAt = U.now();
          writeRaw(S.STORE_KEY, JSON.stringify(normalized));
        } catch (error) {
          // Keep using the normalized in-memory copy if migration persistence fails.
        }
      }
      return normalized;
    }

    const backup = safeParse(readRaw(S.BACKUP_KEY));
    if (backup) return S.normalize(backup);

    const legacy = findLegacy();
    if (legacy) {
      const data = S.normalize({ ...legacy.data, importedFrom: legacy.key });
      try {
        writeRaw(S.STORE_KEY, JSON.stringify(data));
      } catch (error) {
        window.__riceMemoryData = data;
      }
      return data;
    }

    const empty = S.emptyData();
    try {
      writeRaw(S.STORE_KEY, JSON.stringify(empty));
    } catch (error) {
      window.__riceMemoryData = empty;
    }
    return empty;
  }

  function saveData(data) {
    const normalized = S.normalize(data);
    const currentRaw = readRaw(S.STORE_KEY);
    try {
      if (currentRaw) {
        writeRaw(S.BACKUP_KEY, currentRaw);
        normalized.meta = normalized.meta || {};
        normalized.meta.lastBackupAt = U.now();
      }
    } catch (error) {
      // Backup failure must not erase current data.
    }
    try {
      const raw = JSON.stringify(normalized);
      writeRaw(S.STORE_KEY, raw);
      window.__riceMemoryData = normalized;
      return normalized;
    } catch (error) {
      window.__riceMemoryData = normalized;
      throw new Error("保存できませんでした。写真が多い場合はJSON保存後、写真つきログを整理してください。");
    }
  }

  function replaceData(data) {
    return saveData(S.normalize(data));
  }

  function importJsonText(text) {
    const parsed = JSON.parse(text);
    return replaceData({ ...parsed, importedFrom: "json" });
  }

  const COLLECTION_IDS = {
    varieties: "varietyId",
    fields: "fieldId",
    fieldWorks: "workId",
    growthLogs: "logId",
    otherWorks: "otherWorkId",
    materials: "materialId",
    varietyResults: "resultId",
    schedules: "scheduleId",
    dryPeriods: "dryPeriodId",
    irrigations: "irrigationId",
    confirmationCandidates: "candidateId"
  };

  function duplicateIds(rows, idKey) {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    const duplicates = new Set();
    (rows || []).forEach((row) => {
      const id = String(row && row[idKey] || "");
      if (!id) return;
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    });
    return Array.from(duplicates);
  }

  function countSummary(data) {
    const d = S.normalize(data || {});
    return Object.fromEntries(Object.keys(COLLECTION_IDS).map((key) => [key, (d[key] || []).length]));
  }

  function rawBrokenFieldIds(data) {
    const fields = Array.isArray(data.fields) ? data.fields : [];
    const fieldIds = new Set(fields.map((field) => String(field && (field.fieldId || field.id) || "")).filter(Boolean));
    const referenced = [];
    const add = (value) => {
      if (Array.isArray(value)) value.forEach(add);
      else if (value !== undefined && value !== null && String(value)) referenced.push(String(value));
    };
    [
      ...(Array.isArray(data.fieldWorks) ? data.fieldWorks.map((row) => row && (row.fieldIds || row.fieldId)) : []),
      ...(Array.isArray(data.growthLogs) ? data.growthLogs.map((row) => row && row.fieldId) : []),
      ...(Array.isArray(data.dryPeriods) ? data.dryPeriods.map((row) => row && row.fieldId) : []),
      ...(Array.isArray(data.irrigations) ? data.irrigations.map((row) => row && row.fieldId) : []),
      ...(Array.isArray(data.schedules) ? data.schedules.map((row) => row && (row.fieldIds || row.fieldId)) : []),
      ...(Array.isArray(data.confirmationCandidates) ? data.confirmationCandidates.map((row) => row && row.fieldId) : []),
      ...(Array.isArray(data.varietyResults) ? data.varietyResults.map((row) => row && row.fieldId) : [])
    ].forEach(add);
    return Array.from(new Set(referenced.filter((id) => !fieldIds.has(id))));
  }

  function inspectJsonText(text, currentData) {
    const errors = [];
    const warnings = [];
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { ok: false, errors: [`JSON形式を読み取れません: ${error.message}`], warnings, parsed: null, normalized: null };
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, errors: ["ルートはJSONオブジェクトである必要があります。"], warnings, parsed, normalized: null };
    }
    Object.entries(COLLECTION_IDS).forEach(([key, idKey]) => {
      if (parsed[key] !== undefined && !Array.isArray(parsed[key])) errors.push(`${key} は配列ではありません。`);
      const duplicates = duplicateIds(parsed[key], idKey);
      if (duplicates.length) warnings.push(`${key} に重複IDが${duplicates.length}件あります。先頭の記録を優先します。`);
    });
    const rawBroken = rawBrokenFieldIds(parsed);
    if (rawBroken.length) warnings.push(`元JSONに参照先のない圃場IDが${rawBroken.length}件あります。復元前に内容を確認してください。`);
    let normalized = null;
    try {
      normalized = S.normalize({ ...parsed, importedFrom: "json" });
    } catch (error) {
      errors.push(`データ移行に失敗しました: ${error.message}`);
    }
    if (normalized) {
      const fieldIds = new Set(normalized.fields.map((field) => field.fieldId));
      const broken = [
        ...normalized.fieldWorks.flatMap((row) => (row.fieldIds || []).filter((id) => !fieldIds.has(id))),
        ...normalized.growthLogs.map((row) => row.fieldId).filter((id) => id && !fieldIds.has(id)),
        ...(normalized.dryPeriods || []).map((row) => row.fieldId).filter((id) => id && !fieldIds.has(id)),
        ...(normalized.irrigations || []).map((row) => row.fieldId).filter((id) => id && !fieldIds.has(id))
      ];
      if (broken.length) warnings.push(`参照先のない圃場IDが${new Set(broken).size}件あります。`);
    }
    const incoming = normalized ? countSummary(normalized) : {};
    const current = countSummary(currentData || loadData());
    const diff = Object.fromEntries(Object.keys(COLLECTION_IDS).map((key) => [key, (incoming[key] || 0) - (current[key] || 0)]));
    return {
      ok: errors.length === 0 && Boolean(normalized),
      errors,
      warnings,
      parsed,
      normalized,
      schemaVersion: parsed.schemaVersion || 0,
      appVersion: parsed.appVersion || parsed.meta && parsed.meta.appVersion || "",
      exportedAt: parsed.exportedAt || "",
      incoming,
      current,
      diff
    };
  }

  function mergeData(currentData, incomingData) {
    const current = S.normalize(currentData || {});
    const incoming = S.normalize(incomingData || {});
    const merged = U.clone(current);
    const added = {};
    const skipped = {};
    Object.entries(COLLECTION_IDS).forEach(([key, idKey]) => {
      const existingIds = new Set((merged[key] || []).map((row) => String(row[idKey] || "")));
      const additions = (incoming[key] || []).filter((row) => !existingIds.has(String(row[idKey] || "")));
      merged[key] = [...(merged[key] || []), ...additions];
      added[key] = additions.length;
      skipped[key] = (incoming[key] || []).length - additions.length;
    });
    merged.meta = {
      ...(current.meta || {}),
      lastImportAt: U.now(),
      lastImportMode: "merge",
      lastImportSourceVersion: incoming.appVersion || incoming.meta && incoming.meta.appVersion || ""
    };
    return { data: S.normalize(merged), added, skipped };
  }

  function importLegacyNow() {
    const legacy = findLegacy();
    if (!legacy) return null;
    return replaceData({ ...legacy.data, importedFrom: legacy.key });
  }

  function restoreBackup() {
    const backup = safeParse(readRaw(S.BACKUP_KEY));
    if (!backup) return null;
    return replaceData({ ...backup, importedFrom: "backup" });
  }

  function backupData() {
    const backup = safeParse(readRaw(S.BACKUP_KEY));
    return backup ? S.normalize(backup) : null;
  }

  function exportJson(data) {
    const normalized = S.normalize(data);
    const exportId = U.id("export", U.today());
    const exportedAt = U.now();
    const payload = {
      ...normalized,
      schemaVersion: S.SCHEMA_VERSION,
      appVersion: S.APP_VERSION,
      exportedAt,
      exportId,
      meta: {
        ...(normalized.meta || {}),
        appVersion: S.APP_VERSION,
        lastExportId: exportId
      }
    };
    const filename = `rice_karte_${U.today()}.json`;
    U.download(filename, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    return payload;
  }

  function byteSize(text) {
    return new Blob([String(text || "")]).size;
  }

  function info(data) {
    const raw = readRaw(S.STORE_KEY) || JSON.stringify(data || {});
    const backupRaw = readRaw(S.BACKUP_KEY) || "";
    const d = S.normalize(data || loadData());
    return {
      storeKey: S.STORE_KEY,
      backupKey: S.BACKUP_KEY,
      bytes: byteSize(raw),
      backupBytes: byteSize(backupRaw),
      varieties: d.varieties.length,
      fields: d.fields.length,
      fieldWorks: d.fieldWorks.length,
      growthLogs: d.growthLogs.length,
      dryPeriods: (d.dryPeriods || []).length,
      irrigations: (d.irrigations || []).length,
      schedules: (d.schedules || []).length,
      otherWorks: d.otherWorks.length,
      materials: d.materials.length,
      varietyResults: d.varietyResults.length,
      updatedAt: d.meta && d.meta.updatedAt || "",
      lastJsonExportAt: d.meta && d.meta.lastJsonExportAt || "",
      lastBackupAt: d.meta && d.meta.lastBackupAt || "",
      storagePersisted: d.meta && d.meta.storagePersisted
    };
  }

  async function storageStatus() {
    const result = { supported: Boolean(navigator.storage), persisted: false, usage: "", quota: "", percent: "" };
    if (!navigator.storage) return result;
    try {
      result.persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        result.usage = Number(estimate.usage || 0);
        result.quota = Number(estimate.quota || 0);
        result.percent = result.quota ? Math.round(result.usage / result.quota * 1000) / 10 : "";
      }
    } catch (error) {
      result.error = error.message;
    }
    return result;
  }

  async function requestPersistentStorage() {
    const before = await storageStatus();
    if (!before.supported || !navigator.storage.persist) return before;
    try {
      await navigator.storage.persist();
    } catch (error) {
      before.error = error.message;
    }
    return storageStatus();
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCsv(data) {
    const d = S.normalize(data);
    const rows = [["種類", "日付", "年度", "圃場", "作業者", "名称", "時間", "資材", "数量", "葉数", "分げつ", "草丈", "葉色", "メモ"]];
    const fieldName = (id) => (d.fields.find((f) => f.fieldId === id) || {}).name || "";
    const periodText = (x) => {
      const planned = x.startDate && x.endDate ? U.daysBetween(x.startDate, x.endDate) : "";
      const actual = x.startDate && x.actualEndDate ? U.daysBetween(x.startDate, x.actualEndDate) : "";
      const diff = planned !== "" && actual !== "" ? actual - planned : "";
      return [
        `開始${x.startDate || ""}`,
        `完了予定${x.endDate || ""}`,
        x.actualEndDate ? `実完了${x.actualEndDate}` : "",
        planned !== "" ? `予定${planned}日` : "",
        actual !== "" ? `実績${actual}日` : "",
        diff !== "" ? `差分${diff > 0 ? "+" : ""}${diff}日` : ""
      ].filter(Boolean).join(" ");
    };
    d.fieldWorks.forEach((w) => rows.push([
      "圃場作業",
      w.date,
      w.season,
      (w.fieldIds || []).map(fieldName).filter(Boolean).join("・"),
      w.worker || "",
      w.workName,
      w.hours || "",
      w.material || "",
      w.amount || "",
      "",
      "",
      "",
      "",
      w.memo || ""
    ]));
    d.growthLogs.forEach((g) => rows.push([
      "生育ログ",
      g.date,
      g.season,
      fieldName(g.fieldId),
      "",
      "生育ログ",
      "",
      "",
      "",
      g.leafCount || "",
      g.tillerCount || "",
      g.plantHeightCm || "",
      g.leafColor || "",
      g.memo || ""
    ]));
    (d.dryPeriods || []).forEach((x) => rows.push([
      "中干し",
      x.date,
      x.season,
      fieldName(x.fieldId),
      "",
      "中干し",
      "",
      "",
      "",
      "",
      "",
      "",
      `${x.status || ""} ひび${x.crackCm || ""}cm 沈み${x.sinkCm || ""}cm ${periodText(x)}`,
      x.memo || ""
    ]));
    (d.irrigations || []).forEach((x) => rows.push([
      x.method || "間断灌水",
      x.date,
      x.season,
      fieldName(x.fieldId),
      "",
      x.method || "間断灌水",
      "",
      "",
      "",
      "",
      "",
      "",
      `${x.periodStatus || ""} ${x.status || ""} ${periodText(x)}`,
      x.memo || ""
    ]));
    (d.schedules || []).forEach((s) => rows.push([
      "予定",
      s.date,
      s.season,
      (s.fieldIds || []).map(fieldName).filter(Boolean).join("・"),
      "",
      s.title || s.scheduleType || "予定",
      "",
      "",
      "",
      "",
      "",
      "",
      s.status || "",
      s.memo || ""
    ]));
    (d.materials || []).forEach((m) => rows.push([
      "資材台帳",
      m.deliveryDate || "",
      m.season,
      "",
      "",
      `${m.category} ${m.name}`,
      "",
      m.name || "",
      `繰越${m.carryover || ""} 購入${m.ordered || ""} 使用${m.used || ""} 在庫${m.remaining || ""}`,
      "",
      "",
      "",
      "",
      m.nextYearMemo || ""
    ]));
    (d.varietyResults || []).forEach((r) => {
      const variety = (d.varieties.find((v) => v.varietyId === r.varietyId) || {}).name || "";
      rows.push([
        "品種結果",
        "",
        r.season,
        "",
        "",
        variety,
        "",
        "",
        `作付${r.areaA || ""} 収量${r.yield || ""} 10a収量${r.yieldPer10a || ""} 売渡${r.shippedQuantity || ""} 販売${r.salesAmount || ""}`,
        "",
        "",
        "",
        r.firstGradeRate || "",
        [r.quality || "", r.reflection || ""].filter(Boolean).join(" / ")
      ]);
    });
    U.download(`rice_karte_${U.today()}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }

  RiceOS.storage = {
    loadData,
    saveData,
    replaceData,
    importJsonText,
    inspectJsonText,
    mergeData,
    importLegacyNow,
    restoreBackup,
    backupData,
    exportJson,
    exportCsv,
    findLegacy,
    info,
    storageStatus,
    requestPersistentStorage
  };
})();
