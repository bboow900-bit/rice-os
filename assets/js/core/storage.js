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
    const current = safeParse(readRaw(S.STORE_KEY));
    if (current) return S.normalize(current);

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
    const raw = JSON.stringify(normalized);
    const currentRaw = readRaw(S.STORE_KEY);
    try {
      if (currentRaw) writeRaw(S.BACKUP_KEY, currentRaw);
    } catch (error) {
      // Backup failure must not erase current data.
    }
    try {
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
    const filename = `rice_os_stable_${U.today()}.json`;
    U.download(filename, JSON.stringify(normalized, null, 2), "application/json;charset=utf-8");
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
      otherWorks: d.otherWorks.length,
      materials: d.materials.length,
      varietyResults: d.varietyResults.length,
      updatedAt: d.meta && d.meta.updatedAt || "",
      lastJsonExportAt: d.meta && d.meta.lastJsonExportAt || ""
    };
  }

  RiceOS.storage = {
    loadData,
    saveData,
    replaceData,
    importJsonText,
    importLegacyNow,
    restoreBackup,
    backupData,
    exportJson,
    findLegacy,
    info
  };
})();
