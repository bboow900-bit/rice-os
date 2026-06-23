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
    const filename = `rice_karte_${U.today()}.json`;
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
      dryPeriods: (d.dryPeriods || []).length,
      irrigations: (d.irrigations || []).length,
      schedules: (d.schedules || []).length,
      otherWorks: d.otherWorks.length,
      materials: d.materials.length,
      varietyResults: d.varietyResults.length,
      updatedAt: d.meta && d.meta.updatedAt || "",
      lastJsonExportAt: d.meta && d.meta.lastJsonExportAt || ""
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCsv(data) {
    const d = S.normalize(data);
    const rows = [["種類", "日付", "年度", "圃場", "作業者", "名称", "時間", "資材", "数量", "葉数", "分げつ", "草丈", "葉色", "メモ"]];
    const fieldName = (id) => (d.fields.find((f) => f.fieldId === id) || {}).name || "";
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
      `ひび${x.crackCm || ""}cm 沈み${x.sinkCm || ""}cm`,
      x.memo || ""
    ]));
    (d.irrigations || []).forEach((x) => rows.push([
      "間断灌水",
      x.date,
      x.season,
      fieldName(x.fieldId),
      "",
      x.status || "間断灌水",
      "",
      "",
      "",
      "",
      "",
      "",
      `開始${x.startDate || ""} 終了予定${x.endDate || ""}`,
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
    importLegacyNow,
    restoreBackup,
    backupData,
    exportJson,
    exportCsv,
    findLegacy,
    info
  };
})();
