(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  const SCHEMA_VERSION = 17;
  const APP_VERSION = "20261114_ver320";
  const STORE_KEY = "rice_os_v8_stable";
  const BACKUP_KEY = "rice_os_v8_stable_backup";
  const RELEASE_BACKUPS_KEY = "rice_os_v8_stable_release_backups";
  const RELEASE_BACKUP_LIMIT = 3;
  const LEGACY_STORES = [
    "rice_os_v7_rescue",
    "rice_os_v7_stable",
    "rice_os_v6_clean",
    "rice_os_v6_1",
    "rice_os_v6",
    "rice_os_v5_today",
    "rice_os_v42_stable"
  ];

  const DEFAULT_VARIETY_FIELDS = {
    varietyId: "",
    name: "",
    rowSpacing: "30cm",
    plantSpacing: "18cm",
    plantsPerHill: "4本",
    seedlingBoxes: "",
    plantsPerTsubo: "60",
    seedlingBoxesPer10a: "",
    seedlingScrapeAmount: "",
    transplanterSetting: "",
    baseFertilizerName: "",
    baseFertilizerNpk: "",
    baseFertilizerAmount: "",
    baseFertilizerBagKg: "20",
    boxTreatment: "",
    initialHerbicide: "",
    initialInsecticide: "",
    midHerbicide: "",
    midHerbicideTiming: "",
    topDressingName: "",
    topDressingAmount: "",
    topDressingTiming: "",
    topDressingDaysBeforeHeading: "",
    hotWaterTemperatureC: "60",
    hotWaterDurationMinutes: "10",
    hotWaterBatchKg: "5",
    soakingWaterTemperatureC: "12",
    soakingAccumulatedWaterTempMin: "100",
    soakingAccumulatedWaterTempMax: "120",
    germinationTemperatureC: "28",
    germinationHoursMin: "24",
    germinationHoursMax: "48",
    pestControlPlan: "",
    targetTillers: "18〜22本",
    herbicideDaysAfterPlanting: "7",
    panicleInitiationDaysAfterPlanting: "60",
    headingDaysAfterPlanting: "85",
    headingAccumulatedTempTarget: "",
    panicleAccumulatedTempTarget: "",
    ripeningAccumulatedTempTarget: "",
    ripeningAccumulatedTempMin: "",
    ripeningAccumulatedTempMax: "",
    harvestDaysAfterHeadingMin: "",
    harvestDaysAfterHeadingMax: "",
    memo: ""
  };

  const DEFAULT_FIELD_FIELDS = {
    fieldId: "",
    name: "",
    district: "",
    fieldGroupId: "",
    varietyId: "",
    areaA: 0,
    seedlingBoxes: "",
    plantingDate: "",
    drainageStartDate: "",
    drainageTargetDays: "7",
    drainagePlannedEndDate: "",
    drainageActualEndDate: "",
    drainageActualDays: "",
    intermittentStartDate: "",
    intermittentIntervalDays: "3",
    wetIrrigationTargetDays: "20",
    soilType: "",
    waterHolding: "",
    drainage: "",
    commonWeeds: [],
    fieldFeatures: [],
    targetCrackCm: "1〜2",
    targetSinkCm: "2〜4",
    fixedMemo: "",
    nextSeasonMemo: "",
    seasonNotes: [],
    memo: "",
    status: "使用中",
    waterHabit: "",
    weedRisk: "",
    sortOrder: 0
  };

  const DEFAULT_FIELD_GROUPS = [
    { fieldGroupId: "group_kaipa", name: "開パ", aliases: ["開パグループ"], sortOrder: 10 },
    { fieldGroupId: "group_nashibatake", name: "梨畑", aliases: ["梨畑グループ"], sortOrder: 20 },
    { fieldGroupId: "group_wakudaira", name: "和久平", aliases: ["和久平グループ"], sortOrder: 30 },
    { fieldGroupId: "group_kameishi", name: "亀石", aliases: ["亀石グループ"], sortOrder: 40 }
  ];

  const DEFAULT_VARIETIES = [
    {
      varietyId: "variety_tennotsubu",
      name: "天のつぶ",
      rowSpacing: "30cm",
      plantSpacing: "18cm",
      plantsPerHill: "4本",
      plantsPerTsubo: "60",
      seedlingBoxesPer10a: "18",
      baseFertilizerName: "多収稲専用",
      baseFertilizerNpk: "25-8-8",
      baseFertilizerAmount: "45kg/10a",
      memo: "標準レシピ。圃場ごとの固定メモを優先する。"
    },
    {
      varietyId: "variety_koshihikari",
      name: "コシヒカリ",
      rowSpacing: "30cm",
      plantSpacing: "24cm",
      plantsPerHill: "4本",
      plantsPerTsubo: "60",
      seedlingBoxesPer10a: "15",
      memo: "倒伏と追肥量に注意。"
    }
  ].map((v) => ({ ...DEFAULT_VARIETY_FIELDS, ...v }));

  const DEFAULT_FIELDS = [
    {
      fieldId: "field_kai_pa_ue",
      name: "開パ 上",
      fieldGroupId: "group_kaipa",
      varietyId: "variety_tennotsubu",
      areaA: 20,
      sortOrder: 10
    },
    {
      fieldId: "field_kai_pa_shita",
      name: "開パ 下",
      fieldGroupId: "group_kaipa",
      varietyId: "variety_tennotsubu",
      areaA: 20,
      sortOrder: 20
    },
    {
      fieldId: "field_nashibatake",
      name: "梨畑",
      fieldGroupId: "group_nashibatake",
      varietyId: "variety_koshihikari",
      areaA: 32,
      sortOrder: 30
    },
    {
      fieldId: "field_wakudaira",
      name: "和久平",
      fieldGroupId: "group_wakudaira",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 40
    },
    {
      fieldId: "field_kameishi_hidariue",
      name: "亀石 左上",
      fieldGroupId: "group_kameishi",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 50
    },
    {
      fieldId: "field_kameishi_hidarishita",
      name: "亀石 左下",
      fieldGroupId: "group_kameishi",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 60
    },
    {
      fieldId: "field_kameishi_migishita",
      name: "亀石 右下",
      fieldGroupId: "group_kameishi",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 70
    }
  ].map((f) => ({ ...DEFAULT_FIELD_FIELDS, ...f }));

  const FIELD_WORK_NAMES = [
    "畦塗り・畦管理",
    "耕起",
    "基肥・元肥",
    "代かき",
    "田植え",
    "補植",
    "除草剤",
    "草刈り",
    "溝切り",
    "追肥",
    "防除",
    "稲刈り",
    "その他"
  ];

  const OTHER_WORK_NAMES = [
    "種籾注文",
    "塩水選",
    "温湯殺菌",
    "温湯消毒",
    "薬剤消毒",
    "浸種",
    "催芽",
    "播種",
    "苗箱準備",
    "育苗土準備",
    "育苗管理",
    "乾燥",
    "籾摺り",
    "色彩選別",
    "袋詰め",
    "等級検査",
    "出荷",
    "売上記録",
    "資材購入",
    "その他"
  ];

  const MATERIAL_CATEGORIES = ["種籾", "肥料", "除草剤", "防除剤", "殺虫殺菌剤", "培土", "マット", "燃料", "米袋", "部品", "その他"];
  const GROWTH_LEVELS = ["-", "少ない", "普通", "多い", "注意"];
  const LEAF_COLOR_LEVELS = [
    { value: "1", label: "1 薄い", text: "薄い", tone: "bad" },
    { value: "2", label: "2 やや薄い", text: "やや薄い", tone: "warn" },
    { value: "3", label: "3 標準", text: "標準", tone: "ok" },
    { value: "4", label: "4 やや濃い", text: "やや濃い", tone: "info" },
    { value: "5", label: "5 濃い", text: "濃い", tone: "purple" }
  ];
  const WATER_LEVELS = ["-", "浅水", "普通", "深水", "落水", "干し気味", "水不足"];
  const WORKERS = ["自分", "外注"];
  const SCHEDULE_TYPES = ["中干し予定", "追肥予定", "防除予定", "作業予定", "資材使用", "収穫", "出荷"];
  const DRY_SURFACE_LEVELS = ["-", "湿っている", "やや乾いている", "乾いている"];
  const DRY_GAS_LEVELS = ["-", "多い", "少しあり", "ほとんど無し", "無し"];
  const IRRIGATION_STATUS = ["入水中", "落水中"];
  const WATER_PERIOD_STATUS = ["予定中", "実施中", "完了"];
  const IRRIGATION_TYPES = ["間断灌水", "飽水管理", "深水管理", "湿潤灌漑"];
  const MACHINE_CATEGORIES = ["コンバイン", "トラクター", "田植機", "草刈機", "スパイダーモア", "乾燥機", "籾摺機", "その他"];

  function canonicalId(prefix, value, fallbackName) {
    const raw = String(value || fallbackName || "").trim();
    if (raw) return raw;
    return U.id(prefix, U.today());
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function dedupeBy(items, keyName) {
    const seen = new Set();
    return ensureArray(items).filter((item) => {
      const key = item && item[keyName];
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeVariety(input, index) {
    const v = { ...DEFAULT_VARIETY_FIELDS, ...(input || {}) };
    v.varietyId = canonicalId("variety", v.varietyId || v.id, v.name || `品種${index + 1}`);
    v.name = String(v.name || `品種${index + 1}`);
    return v;
  }

  function normalizeGroupLabel(value) {
    return String(value || "").trim().replace(/\s+/g, " ").replace(/グループ$/, "").trim();
  }

  function groupIdForLabel(label) {
    const normalized = normalizeGroupLabel(label);
    if (!normalized) return "";
    return `group_${Array.from(normalized).map((char) => char.codePointAt(0).toString(36)).join("_")}`;
  }

  function normalizeFieldGroup(input, index) {
    const group = input || {};
    const name = normalizeGroupLabel(group.name || group.label || group.fieldGroupId || group.id);
    const aliases = Array.from(new Set(ensureArray(group.aliases)
      .map(normalizeGroupLabel)
      .filter(Boolean)
      .filter((alias) => alias !== name)));
    return {
      fieldGroupId: String(group.fieldGroupId || group.groupId || group.id || groupIdForLabel(name)),
      name,
      aliases,
      sortOrder: U.number(group.sortOrder, (index + 1) * 10)
    };
  }

  function defaultGroupIdForFieldName(name) {
    const normalized = String(name || "").replace(/[\s　()（）]/g, "");
    if (/^開パ[上下]$/.test(normalized)) return "group_kaipa";
    if (/^梨畑$/.test(normalized)) return "group_nashibatake";
    if (/^和久平$/.test(normalized)) return "group_wakudaira";
    if (/^亀石(左上|左下|右上|右下|中央)?$/.test(normalized)) return "group_kameishi";
    return "";
  }

  function normalizeField(input, index, fallbackVarietyId) {
    const f = { ...DEFAULT_FIELD_FIELDS, ...(input || {}) };
    f.fieldId = canonicalId("field", f.fieldId || f.id, f.name || `圃場${index + 1}`);
    f.name = String(f.name || `圃場${index + 1}`);
    f.district = String(f.district || "");
    f.fieldGroupId = String(f.fieldGroupId || "");
    f.varietyId = String(f.varietyId || fallbackVarietyId || "");
    f.areaA = U.number(f.areaA, 0);
    f.seedlingBoxes = String(f.seedlingBoxes || "");
    f.status = String(f.status || "使用中");
    f.archivedAt = String(f.archivedAt || "");
    f.archivedReason = String(f.archivedReason || "");
    f.drainageStartDate = String(f.drainageStartDate || "");
    f.drainageTargetDays = String(f.drainageTargetDays || "");
    f.drainagePlannedEndDate = String(f.drainagePlannedEndDate || "");
    f.drainageActualEndDate = String(f.drainageActualEndDate || "");
    f.drainageActualDays = String(f.drainageActualDays || "");
    f.intermittentStartDate = String(f.intermittentStartDate || "");
    f.intermittentIntervalDays = String(f.intermittentIntervalDays || "");
    f.wetIrrigationTargetDays = String(f.wetIrrigationTargetDays || "");
    f.soilType = String(f.soilType || "");
    f.waterHolding = String(f.waterHolding || "");
    f.drainage = String(f.drainage || "");
    f.commonWeeds = ensureArray(f.commonWeeds).map(String);
    f.fieldFeatures = ensureArray(f.fieldFeatures).map(String);
    f.targetCrackCm = String(f.targetCrackCm || "");
    f.targetSinkCm = String(f.targetSinkCm || "");
    f.nextSeasonMemo = String(f.nextSeasonMemo || "");
    f.seasonNotes = dedupeBy(ensureArray(f.seasonNotes)
      .map((note, noteIndex) => normalizeSeasonNote(note, f.fieldId, noteIndex)), "noteId");
    f.sortOrder = U.number(f.sortOrder, index * 10);
    return f;
  }

  function normalizeSeasonNote(input, fieldId, index) {
    const note = input || {};
    const date = String(note.date || U.today());
    // A reflection belongs to the year in its date. Ignore a conflicting
    // imported season value so JSON restoration cannot leak it into another year.
    const season = U.number(U.dateYear(date), U.season(date));
    return {
      noteId: canonicalId("season-note", note.noteId || note.id, `${fieldId}_${season}_${date}_${index + 1}`),
      fieldId: String(note.fieldId || fieldId || ""),
      season,
      date,
      text: String(note.text ?? note.memo ?? ""),
      ...(note.kind ? { kind: String(note.kind) } : {}),
      createdAt: String(note.createdAt || note.updatedAt || U.now()),
      updatedAt: String(note.updatedAt || note.createdAt || U.now())
    };
  }

  function leafColorScoreFromText(value) {
    const text = String(value || "").trim();
    if (!text || text === "-") return "";
    const numeric = text.match(/[1-5]/);
    if (numeric) return numeric[0];
    if (text.includes("やや薄")) return "2";
    if (text.includes("薄")) return "1";
    if (text.includes("標準") || text.includes("普通")) return "3";
    if (text.includes("やや濃")) return "4";
    if (text.includes("濃") || text.includes("多い")) return "5";
    if (text.includes("注意")) return "5";
    return "";
  }

  function leafColorLabel(score) {
    const found = LEAF_COLOR_LEVELS.find((level) => String(level.value) === String(score));
    return found ? found.label : "-";
  }

  function normalizeHarvestWeather(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const text = (value) => typeof value === "string" ? value : "";
    const day = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return NaN;
      const time = Date.parse(`${value}T00:00:00Z`);
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
    };
    const number = (value) => (typeof value === "number" || typeof value === "string" && value.trim() !== "")
      && Number.isFinite(Number(value)) ? Number(value) : "";
    const startDate = text(input.startDate);
    const endDate = text(input.endDate);
    const days = (day(endDate) - day(startDate)) / 86400000 + 1;
    const validRange = Number.isInteger(days) && days > 0 && days <= 366;
    const latitude = number(input.latitude);
    const longitude = number(input.longitude);
    const located = latitude !== "" && longitude !== "" && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const asOfDate = Number.isFinite(day(input.asOfDate)) ? input.asOfDate : U.today();
    const result = { status: "no_data", startDate, endDate, expectedDays: validRange ? days : 0,
      tempCount: 0, rainCount: 0, meanTemp: "", totalRain: "", source: "Open-Meteo Archive (reanalysis/model)",
      locationLabel: text(input.locationLabel), latitude, longitude, fetchedAt: text(input.fetchedAt), asOfDate,
      rows: [], missing: [], tempMissing: [], rainMissing: [] };
    if (!startDate) result.status = "missing_drain";
    else if (!validRange) result.status = "invalid_range";
    else if (!located) result.status = "location_missing";
    else if (input.status === "fetch_failed") result.status = "fetch_failed";
    const byDate = new Map();
    for (const row of ensureArray(input.rows)) {
      if (!row || typeof row !== "object" || Array.isArray(row) || row.source !== "Open-Meteo Archive" || /forecast/i.test(text(row.dataset))
        || !Number.isFinite(day(row.date)) || row.date < startDate || row.date > endDate
        || row.date >= asOfDate || byDate.has(row.date)) continue;
      byDate.set(row.date, row);
    }
    let tempSum = 0;
    let rainSum = 0;
    for (let i = 0; validRange && i < days; i++) {
      const date = new Date(day(startDate) + i * 86400000).toISOString().slice(0, 10);
      const raw = located && result.status !== "fetch_failed" ? byDate.get(date) : null;
      const tempMean = number(raw && raw.tempMean);
      const rain = number(raw && raw.precipitation);
      const precipitation = rain !== "" && rain >= 0 ? rain : "";
      result.rows.push({ date, tempMean, precipitation, source: raw ? "Open-Meteo Archive" : "" });
      if (tempMean !== "") { result.tempCount++; tempSum += tempMean; } else result.tempMissing.push(date);
      if (precipitation !== "") { result.rainCount++; rainSum += precipitation; } else result.rainMissing.push(date);
      if (tempMean === "" || precipitation === "") result.missing.push(date);
    }
    if (result.tempCount) result.meanTemp = Number((tempSum / result.tempCount).toFixed(6));
    if (result.rainCount) result.totalRain = Number(rainSum.toFixed(6));
    if (result.status === "no_data" && (result.tempCount || result.rainCount)) {
      result.status = result.missing.length ? "partial" : "complete";
    }
    return result;
  }

  function normalizeHarvestReview(input, strict = false) {
    const validObject = input && typeof input === "object" && !Array.isArray(input);
    if (!validObject && strict) throw new Error("収穫振り返りの形式を確認してください。");
    const review = validObject ? input : {};
    const choices = {
      surface: ["硬め", "適度", "軟らかい", "ぬかるむ"],
      traffic: ["問題なし", "一部苦労", "作業に支障"],
      weeds: ["ほぼなし", "少し", "多い"],
      weedExtent: ["一部", "広範囲"],
      weedImpact: ["なし", "刈り取りに苦労", "作業を中断"],
      yieldBasis: ["籾（乾燥前）", "籾（乾燥後）", "玄米（乾燥調製後）"]
    };
    const normalized = {};
    Object.entries(choices).forEach(([key, values]) => {
      const value = review[key] ?? "";
      if (value !== "" && !values.includes(value) && strict) throw new Error("収穫振り返りの選択値を確認してください。");
      normalized[key] = values.includes(value) ? value : "";
    });
    for (const key of ["yieldKg", "harvestAreaA"]) {
      const raw = review[key] ?? "";
      const value = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : null;
      const valid = value !== null && (value === "" || (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
        && Number.isFinite(Number(value)) && (key === "yieldKg" ? Number(value) >= 0 : Number(value) > 0)));
      if (!valid && strict) throw new Error("収量は0以上、収穫面積は0より大きい数値を入力してください（空欄可）。");
      normalized[key] = valid ? value : "";
    }
    if (review.weedNote != null && typeof review.weedNote !== "string" && strict) throw new Error("雑草メモは文字列で入力してください。");
    normalized.weedNote = typeof review.weedNote === "string" ? review.weedNote : "";
    return normalized;
  }

  function normalizeHarvestTimingThermal(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const text = key => typeof input[key] === "string" ? input[key] : "";
    const statuses = ["complete", "missing", "future", "no-heading", "no-location", "fetch-failed", "invalid-range"];
    const seen = new Set();
    const endpoints = ensureArray(input.endpoints).filter(row => row && typeof row.date === "string" && !seen.has(row.date) && seen.add(row.date)).map(row => {
      const count = Number.isInteger(row.count) && row.count >= 0 ? row.count : 0;
      const expectedDays = Number.isInteger(row.expectedDays) && row.expectedDays >= 0 ? row.expectedDays : 0;
      let status = statuses.includes(row.status) ? row.status : "missing";
      let total = ["complete", "missing"].includes(status) && count > 0 && typeof row.total === "number" && Number.isFinite(row.total) ? row.total : "";
      const day = value => {
        if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return NaN;
        const time = Date.parse(`${value}T00:00:00Z`);
        return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
      };
      const rangeDays = (day(row.date) - day(input.startDate)) / 86400000 + 1;
      if (status === "complete" && (!Number.isInteger(rangeDays) || rangeDays <= 0)) { status = "invalid-range"; total = ""; }
      else if (status === "complete" && rangeDays !== expectedDays) status = "missing";
      if (status === "complete" && (count !== expectedDays || count === 0 || total === "")) status = "missing";
      return { date: row.date, total, count, expectedDays, status, source: typeof row.source === "string" ? row.source : "" };
    });
    return { headingDate: text("headingDate"), startDate: text("startDate"), asOf: text("asOf"), source: text("source"),
      locationLabel: text("locationLabel"), retrievedAt: text("retrievedAt"), endpoints,
      ...(typeof input.locationToken === "string" ? { locationToken: input.locationToken } : {}) };
  }

  function normalizeHarvestTiming(input, strict = false, workDate = "") {
    if ((!input || typeof input !== "object" || Array.isArray(input)) && strict) throw new Error("収穫時期評価の形式を確認してください。");
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const result = {};
    const choices = {
      assessment: ["", "early", "appropriate", "late", "pending"],
      yellowing: ["", "green", "mixed", "mostlyYellow", "unknown"],
      delayReason: ["", "rain", "surface", "machine", "schedule", "other"]
    };
    Object.entries(choices).forEach(([key, values]) => {
      const value = row[key] === undefined ? "" : row[key];
      if (strict && !values.includes(value)) throw new Error("収穫時期評価の選択値を確認してください。");
      result[key] = values.includes(value) ? value : "";
    });
    const validDate = value => {
      if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    for (const key of ["idealStartDate", "idealEndDate", "moistureDate", "memo"]) {
      const value = row[key] === undefined ? "" : row[key];
      if (strict && (typeof value !== "string" || key !== "memo" && value && !validDate(value))) throw new Error("収穫時期評価の日付・メモを確認してください。");
      result[key] = typeof value === "string" ? value : "";
    }
    const raw = row.moisturePct === undefined ? "" : row.moisturePct;
    const moisture = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : null;
    if (strict && (moisture === null || moisture !== "" && (!Number.isFinite(Number(moisture)) || Number(moisture) < 0 || Number(moisture) > 100))) throw new Error("籾水分は0から100の数値で入力してください。");
    result.moisturePct = moisture === null ? "" : moisture;
    if (strict) {
      const start = result.idealStartDate;
      const end = result.idealEndDate;
      if (!validDate(workDate) || start && end && start > end) throw new Error("収穫日と理想の収穫期間を確認してください。");
      const endpoints = [start, end].filter(Boolean);
      if (result.assessment === "early" && endpoints.some((value) => value <= workDate)
        || result.assessment === "late" && endpoints.some((value) => value >= workDate)
        || result.assessment === "appropriate" && (start && start > workDate || end && end < workDate)) throw new Error("収穫時期の評価と理想の期間が一致しません。");
    }
    if (typeof row.evaluatedAt === "string") result.evaluatedAt = row.evaluatedAt;
    for (const key of ["varietyId", "varietyName", "season"]) {
      if (row[key] !== undefined) result[key] = String(row[key] ?? "");
    }
    if (typeof row.varietySource === "string") result.varietySource = row.varietySource;
    const thermal = normalizeHarvestTimingThermal(row.thermal);
    if (thermal) result.thermal = thermal;
    return result;
  }

  function validCropYear(value) {
    return ["number", "string"].includes(typeof value) && /^\d{4}$/.test(String(value))
      && Number(value) >= 1900 && Number(value) <= 2200;
  }

  function cropYearClosureTime(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
    const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)
      || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return NaN;
    return Date.parse(value);
  }

  function normalizeCropYearClosures(input) {
    return ensureArray(input).filter(row => row && typeof row === "object" && validCropYear(row.year)).map(row => {
      const history = ensureArray(row.history).filter(event => event && ["closed", "reopened"].includes(event.action)
        && Number.isFinite(cropYearClosureTime(event.at))).map(event => ({ ...event }))
        .sort((a, b) => cropYearClosureTime(a.at) - cropYearClosureTime(b.at));
      let closedAt = Number.isFinite(cropYearClosureTime(row.closedAt)) ? row.closedAt : "";
      let reopenedAt = Number.isFinite(cropYearClosureTime(row.reopenedAt)) ? row.reopenedAt : "";
      if (history.length) {
        closedAt = history.filter(event => event.action === "closed").at(-1)?.at || "";
        reopenedAt = history.at(-1).action === "reopened" ? history.at(-1).at : "";
      } else if (closedAt && reopenedAt && cropYearClosureTime(closedAt) > cropYearClosureTime(reopenedAt)) reopenedAt = "";
      return { ...row, year: Number(row.year), closedAt, reopenedAt, history };
    });
  }

  const WORK_TIMING_REASONS = ["rain", "surface", "machine", "labor", "schedule", "intentional", "material", "other"];
  function normalizeScheduleSnapshot(input, strict = false) {
    if (input == null) return null;
    const r = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const date = String(r.date || ""), parsed = Date.parse(`${date}T00:00:00Z`);
    const valid = r.scheduleId && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date && validCropYear(r.cropYear);
    if (!valid) { if (strict) throw new Error("予定の保存情報を確認してください。"); return null; }
    if (strict && r.latestPlannedDate !== undefined) {
      const latest = Date.parse(`${r.latestPlannedDate}T00:00:00Z`);
      if (typeof r.latestPlannedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.latestPlannedDate) || !Number.isFinite(latest) || new Date(latest).toISOString().slice(0, 10) !== r.latestPlannedDate) throw new Error("直近の予定日を確認してください。");
    }
    return { scheduleId: String(r.scheduleId), title: String(r.title || ""), date, cropYear: Number(r.cropYear), capturedAt: String(r.capturedAt || ""), ...(typeof r.latestPlannedDate === "string" ? { latestPlannedDate: r.latestPlannedDate } : {}), ...(["recorded", "legacy-first-observed"].includes(r.originalDateSource) ? { originalDateSource: r.originalDateSource } : {}) };
  }
  function normalizeTimingReview(input, strict = false) {
    if (input == null) return null;
    const r = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const date = String(r.plannedDate || ""), parsed = Date.parse(`${date}T00:00:00Z`);
    const validDate = !date || /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
    if (strict && (!validDate || r.reason && !WORK_TIMING_REASONS.includes(r.reason) || typeof input !== "object" || Array.isArray(input))) throw new Error("予定日と実施理由を確認してください。");
    return { plannedDate: validDate ? date : "", reason: WORK_TIMING_REASONS.includes(r.reason) ? r.reason : "", memo: String(r.memo || "") };
  }

  function validateSeedPreparation(s) {
    const blank = v => v === undefined || v === null || typeof v === "string" && !v.trim();
    if (!s || typeof s !== "object" || Array.isArray(s) || typeof s.varietyId !== "string"
      || !["hotWater","soaking","germination"].includes(s.process)
      || !s.settingsSnapshot || typeof s.settingsSnapshot !== "object" || Array.isArray(s.settingsSnapshot)) throw Error("種子準備の品種・工程・保存設定を確認してください。");
    ["temperatureC","durationMinutes","batchKg","actualWaterTemperatureC","actualBatchKg"].forEach(k => {
      const v = s[k];
      if (!blank(v) && (!["string","number"].includes(typeof v) || !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(v).trim()) || !Number.isFinite(Number(v)) || Number(v) <= 0)) throw Error("種子準備の温度・時間・数量は正の数で入力してください。");
    });
    ["budState","memo"].forEach(k => { if (!blank(s[k]) && typeof s[k] !== "string") throw Error("種子準備の状態・メモを確認してください。"); });
    ["startAt","endAt"].forEach(k => {
      const v = s[k];
      if (blank(v)) return;
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/.test(v)
        || !materialDay(v.slice(0,10)) || !Number.isFinite(Date.parse(v))) throw Error("種子準備の開始・終了日時を確認してください。");
    });
    if (!blank(s.startAt) && !blank(s.endAt) && Date.parse(s.endAt) < Date.parse(s.startAt)) throw Error("種子準備の終了日時は開始日時以降にしてください。");
  }
  function normalizeFieldWork(input) {
    const w = input || {};
    if (w.seedPreparation !== undefined && w.seedPreparation !== null) validateSeedPreparation(w.seedPreparation);
    if (w.materialUsageSnapshot !== undefined && w.materialUsageSnapshot !== null) {
      const s = w.materialUsageSnapshot;
      if (!s || typeof s !== "object" || Array.isArray(s) || s.version !== 1
        || !["materialId", "amount", "date", "unit", "sourcePurchaseId", "sourceReceiptId", "sourceDate", "reason", "recordedAt"].every(k => typeof s[k] === "string")
        || !s.materialId.trim() || !materialDay(s.date) || !s.reason.trim()
        || s.materialId !== String(w.materialId || "") || s.date !== String(w.date || U.today()) || s.amount !== String(w.amount ?? "")
        || !s.unit.trim() && (s.quantity !== null || s.cost !== null)
        || s.quantity === null && s.cost !== null
        || !Number.isFinite(Date.parse(s.recordedAt)) || s.sourceDate !== "" && !materialDay(s.sourceDate)
        || ![s.quantity, s.cost].every(v => v === null || typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER)) throw new Error("Invalid material usage snapshot");
      validateMaterialPackaging(s.packaging);
      if (["unitCost", "sourceAmount", "sourceQuantity"].some(key => s[key] !== undefined && s[key] !== null
        && (typeof s[key] !== "number" || !Number.isFinite(s[key]) || s[key] < 0 || s[key] > Number.MAX_SAFE_INTEGER))
        || s.sourceQuantity !== undefined && s.sourceQuantity !== null && s.sourceQuantity === 0
        || s.sourceUnit !== undefined && typeof s.sourceUnit !== "string") throw new Error("Invalid material usage cost basis");
    }
    const offField = w.targetScope === "offField";
    const date = String(w.date || U.today());
    const harvestSnapshots = (offField ? [] : ensureArray(w.harvestSnapshots)).map((snapshot) => {
      const row = snapshot || {};
      const water = row.water && typeof row.water === "object" ? row.water : {};
      const outlook = row.outlook && typeof row.outlook === "object" ? row.outlook : {};
      const thermal = row.thermal && typeof row.thermal === "object" ? row.thermal : {};
      const optionalNumber = (value) => String(value ?? "").trim() === "" ? NaN : Number(value);
      const errorDays = optionalNumber(outlook.errorDays);
      const thermalTotal = optionalNumber(thermal.total);
      const thermalTarget = optionalNumber(thermal.target);
      const thermalDifference = optionalNumber(thermal.difference);
      return {
        fieldId: String(row.fieldId || ""),
        season: U.number(row.season, U.season(date)),
        harvestDate: String(row.harvestDate || date),
        savedAt: String(row.savedAt || w.updatedAt || w.createdAt || U.now()),
        ...(normalizeHarvestWeather(row.weather) ? { weather: normalizeHarvestWeather(row.weather) } : {}),
        water: {
          lastWateringDate: String(water.lastWateringDate || ""),
          lastWateringLabel: String(water.lastWateringLabel || ""),
          daysFromLastWatering: String(water.daysFromLastWatering || ""),
          finalDrainDate: String(water.finalDrainDate || ""),
          daysFromFinalDrain: String(water.daysFromFinalDrain || ""),
          ...(water.elapsedDaysFromFinalDrain !== undefined ? { elapsedDaysFromFinalDrain: String(water.elapsedDaysFromFinalDrain ?? "") } : {}),
          ...(water.elapsedDaysFromHeadingToDrain !== undefined ? { elapsedDaysFromHeadingToDrain: String(water.elapsedDaysFromHeadingToDrain ?? "") } : {}),
          ...(typeof water.rewateringAfterDrain === "boolean" ? { rewateringAfterDrain: water.rewateringAfterDrain } : {})
        },
        outlook: {
          status: String(outlook.status || "記録なし"),
          predictedHarvestDate: String(outlook.predictedHarvestDate || ""),
          predictedAsOf: String(outlook.predictedAsOf || ""),
          errorDays: Number.isFinite(errorDays) ? errorDays : ""
        },
        thermal: {
          ...(thermal.coverageVersion === 1 ? { coverageVersion: 1 } : {}),
          ...(typeof thermal.locationToken === "string" ? { locationToken: thermal.locationToken } : {}),
          status: String(thermal.status || "未保存"),
          headingDate: String(thermal.headingDate || ""),
          startDate: String(thermal.startDate || ""),
          endDate: String(thermal.endDate || ""),
          total: Number.isFinite(thermalTotal) ? thermalTotal : "",
          target: Number.isFinite(thermalTarget) ? thermalTarget : "",
          difference: Number.isFinite(thermalDifference) ? thermalDifference : "",
          count: String(thermal.count || ""),
          expectedDays: String(thermal.expectedDays || ""),
          plantingDate: String(thermal.plantingDate || ""),
          daysFromPlanting: String(thermal.daysFromPlanting || ""),
          source: String(thermal.source || ""),
          locationLabel: String(thermal.locationLabel || ""),
          retrievedAt: String(thermal.retrievedAt || "")
        }
      };
    }).filter((snapshot) => snapshot.fieldId);
    return {
      workId: String(w.workId || w.id || U.id("work", date)),
      ...(w.varietyId !== undefined ? {varietyId:String(w.varietyId || "")} : {}),
      ...(w.varietyProfile !== undefined ? {varietyProfile:String(w.varietyProfile || "")} : {}),
      ...(w.seedPreparation !== undefined ? {seedPreparation:U.clone(w.seedPreparation)} : {}),
      ...(w.materialUsageSnapshot !== undefined ? {materialUsageSnapshot: U.clone(w.materialUsageSnapshot)} : {}),
      ...(w.unit !== undefined ? {unit:w.unit} : {}),
      ...(w.amountUnit !== undefined ? {amountUnit:w.amountUnit} : {}),
      type: "fieldWork",
      targetScope: offField ? "offField" : "field",
      date,
      season: U.number(w.season, U.season(date)),
      ...(validCropYear(w.cropYear) ? { cropYear: Number(w.cropYear) } : {}),
      fieldIds: offField ? [] : ensureArray(w.fieldIds).length ? ensureArray(w.fieldIds).map(String) : (w.fieldId ? [String(w.fieldId)] : []),
      orphanedFieldIds: offField ? [] : ensureArray(w.orphanedFieldIds).map(String),
      batchId: offField ? "" : String(w.batchId || ""),
      batchFieldIds: offField ? [] : ensureArray(w.batchFieldIds || w.fieldIds).map(String),
      waterMigrationLinks: (offField ? [] : ensureArray(w.waterMigrationLinks)).map((link) => ({
        fieldId: String(link && link.fieldId || ""),
        kind: String(link && link.kind || ""),
        legacyKey: String(link && link.legacyKey || ""),
        periodId: String(link && link.periodId || ""),
        linkedAt: String(link && link.linkedAt || U.now())
      })).filter((link) => link.fieldId && link.kind && link.legacyKey && link.periodId),
      timeAccounting: offField ? "single" : String(w.timeAccounting || (ensureArray(w.fieldIds).length > 1 ? "shared" : "single")),
      totalHours: String(w.totalHours || w.hours || ""),
      fieldAllocatedHours: !offField && w.fieldAllocatedHours && typeof w.fieldAllocatedHours === "object" ? w.fieldAllocatedHours : {},
      workName: String(w.workName || w.name || "その他"),
      worker: String(w.worker || ""),
      hours: String(w.hours || ""),
      machine: String(w.machine || w.machineName || ""),
      machineId: String(w.machineId || ""),
      ...(normalizeScheduleSnapshot(w.scheduleSnapshot) ? { scheduleSnapshot: normalizeScheduleSnapshot(w.scheduleSnapshot) } : {}),
      ...(normalizeTimingReview(w.timingReview) ? { timingReview: normalizeTimingReview(w.timingReview) } : {}),
      ...(w.seedlingBoxesActual !== undefined ? { seedlingBoxesActual: typeof w.seedlingBoxesActual === "number" && Number.isFinite(w.seedlingBoxesActual) && w.seedlingBoxesActual >= 0 ? w.seedlingBoxesActual : null } : {}),
      ...(w.tractorProfileId !== undefined ? { tractorProfileId: String(w.tractorProfileId || "") } : {}),
      ...(normalizeTractorSnapshot(w.tractorSettingsSnapshot) ? { tractorSettingsSnapshot: normalizeTractorSnapshot(w.tractorSettingsSnapshot) } : {}),
      ...(w.transplanterProfileId !== undefined ? { transplanterProfileId: String(w.transplanterProfileId || "") } : {}),
      ...(normalizeTransplanterSnapshot(w.transplanterSettingsSnapshot) ? { transplanterSettingsSnapshot: normalizeTransplanterSnapshot(w.transplanterSettingsSnapshot) } : {}),
      material: String(w.material || ""),
      materialId: String(w.materialId || ""),
      herbicideLinks: (offField ? [] : ensureArray(w.herbicideLinks)).filter((link) => link && link.fieldId && link.assignmentId && link.stepId).map((link) => ({ fieldId: String(link.fieldId), assignmentId: String(link.assignmentId), stepId: String(link.stepId) })),
      herbicideCategory: String(w.herbicideCategory || ""),
      herbicidePurpose: String(w.herbicidePurpose || ""),
      amount: String(w.amount ?? ""),
      fertilizerRateKg10a: String(w.fertilizerRateKg10a || ""),
      fertilizerTotalKg: String(w.fertilizerTotalKg || ""),
      fertilizerBagCount: String(w.fertilizerBagCount || ""),
      sourceScheduleId: String(w.sourceScheduleId || ""),
      growthSnapshots: !offField && w.growthSnapshots && typeof w.growthSnapshots === "object" ? w.growthSnapshots : {},
      // A harvest work can hold one factual close-out snapshot per field.
      // This remains attached to the work so a JSON export keeps the original
      // water timing and forecast comparison even after screens are revised.
      harvestSnapshots: offField ? [] : harvestSnapshots,
      ...(!offField && w.harvestStatusByField && typeof w.harvestStatusByField === "object" && !Array.isArray(w.harvestStatusByField)
        ? { harvestStatusByField: Object.fromEntries(Object.entries(w.harvestStatusByField).map(([id, value]) => [id, ["partial", "complete"].includes(value) ? value : ""])) } : {}),
      ...(!offField && w.harvestWaterClosures ? { harvestWaterClosures: normalizeHarvestWaterClosures(w.harvestWaterClosures) } : {}),
      ...(!offField && /稲刈り|収穫/.test(String(w.workName || w.name || "")) && !/予定|確認|落水/.test(String(w.workName || w.name || ""))
        && w.harvestTimingByField && typeof w.harvestTimingByField === "object" && !Array.isArray(w.harvestTimingByField)
        ? { harvestTimingByField: Object.fromEntries(Object.entries(w.harvestTimingByField)
          .filter(([id]) => ensureArray(w.fieldIds).includes(id)).map(([id, value]) => [id, normalizeHarvestTiming(value)])) } : {}),
      ...(w.harvestReview !== undefined ? { harvestReview: normalizeHarvestReview(w.harvestReview) } : {}),
      weather: String(w.weather || ""),
      weatherAuto: w.weatherAuto && typeof w.weatherAuto === "object" ? w.weatherAuto : null,
      photo: String(w.photo || ""),
      photoData: String(w.photoData || ""),
      memo: String(w.memo || ""),
      createdAt: String(w.createdAt || U.now()),
      updatedAt: String(w.updatedAt || U.now())
    };
  }

  function normalizeGrowthLog(input) {
    const g = input || {};
    const date = String(g.date || U.today());
    const leafColorScore = String(g.leafColorScore || leafColorScoreFromText(g.leafColor || g.leaf));
    const inferredStage = g.observedStage
      || (g.headingObserved || g.headingDate ? "heading" : "")
      || (Number(g.panicleLengthMm || g.youhoLengthMm || 0) > 0 ? "panicle" : "")
      || (g.tillerCount !== undefined && String(g.tillerCount) !== "" ? "tillering" : "");
    return {
      logId: String(g.logId || g.id || U.id("growth", date)),
      ...(g.varietyId !== undefined ? {varietyId:String(g.varietyId || "")} : {}),
      ...(g.varietyProfile !== undefined ? {varietyProfile:String(g.varietyProfile || "")} : {}),
      type: "growthLog",
      date,
      // 年度は日付から再計算する。旧JSONの stale season で年間履歴が混ざらないようにする。
      season: U.season(date),
      fieldId: String(g.fieldId || ""),
      orphanedFieldId: String(g.orphanedFieldId || ""),
      ...(g.sourceScheduleId ? { sourceScheduleId: String(g.sourceScheduleId) } : {}),
      leafCount: String(g.leafCount || ""),
      tillerCount: String(g.tillerCount || ""),
      plantHeightCm: String(g.plantHeightCm || g.plantHeight || ""),
      panicleLengthMm: String(g.panicleLengthMm || g.youhoLengthMm || ""),
      leafColorScore,
      leafColor: leafColorScore ? leafColorLabel(leafColorScore) : String(g.leafColor || g.leaf || "-"),
      weed: String(g.weed || "-"),
      gas: String(g.gas || "-"),
      water: String(g.water || "-"),
      // 出穂日は専用の現地確認だけを根拠にする。メモや手動ステージから
      // 推測すると、実測日と現場判断が混ざってしまうため読み取らない。
      headingObserved: Boolean(g.headingObserved || g.headingDate),
      observedStage: String(inferredStage || ""),
      stageConfirmed: g.stageConfirmed === undefined ? Boolean(g.headingObserved || g.headingDate) : Boolean(g.stageConfirmed),
      // Old records remain unchanged until their own explicit edit. Their
      // meaning is inferred for display rather than backfilled on any save.
      stageEvidenceType: String(g.stageEvidenceType || ""),
      measurementCount: String(g.measurementCount || ""),
      measurementMethod: String(g.measurementMethod || ""),
      stageEvidenceId: String(g.stageEvidenceId || g.logId || g.id || ""),
      recordedBy: String(g.recordedBy || ""),
      correctionReason: String(g.correctionReason || ""),
      photo: String(g.photo || ""),
      photoData: String(g.photoData || ""),
      memo: String(g.memo || ""),
      createdAt: String(g.createdAt || U.now()),
      updatedAt: String(g.updatedAt || U.now())
    };
  }

  function normalizeOtherWork(input) {
    const o = input || {};
    const date = String(o.date || U.today());
    return {
      otherWorkId: String(o.otherWorkId || o.id || U.id("other", date)),
      type: "otherWork",
      date,
      season: U.number(o.season, U.season(date)),
      ...(validCropYear(o.cropYear) ? { cropYear: Number(o.cropYear) } : {}),
      workName: String(o.workName || o.name || "その他"),
      varietyIds: ensureArray(o.varietyIds).map(String),
      relatedFieldIds: ensureArray(o.relatedFieldIds || o.fieldIds).map(String),
      quantity: String(o.quantity || ""),
      hours: String(o.hours || ""),
      memo: String(o.memo || ""),
      createdAt: String(o.createdAt || U.now()),
      updatedAt: String(o.updatedAt || U.now())
    };
  }

  function materialDay(value) {
    const time = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + "T00:00:00Z") : NaN;
    return value >= "1900-01-01" && value <= "2200-12-31" && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  }
  function validateMaterialPackaging(p) {
    if (p === null) return;
    if (!p || typeof p !== "object" || Array.isArray(p)
      || ![p.unit, p.baseUnit].every(v => typeof v === "string" && v.trim() && v === v.trim()) || p.unit === p.baseUnit
      || typeof p.quantity !== "number" || !Number.isFinite(p.quantity) || p.quantity <= 0 || p.quantity > Number.MAX_SAFE_INTEGER) throw new Error("Invalid material packaging");
  }
  function normalizeMaterial(input) {
    const m = input || {};
    if (m.packaging !== undefined) validateMaterialPackaging(m.packaging);
    if (m.packaging && String(m.unit || "").trim() && ![m.packaging.unit, m.packaging.baseUnit].includes(String(m.unit).trim())) {
      throw new Error("資材の管理単位「" + m.unit + "」を、購入規格の単位「" + m.packaging.unit + "」または内容量の単位「" + m.packaging.baseUnit + "」と一致させてください。");
    }
    if (m.purchasePlans !== undefined) {
      const ids = new Set();
      if (!Array.isArray(m.purchasePlans)) throw new Error("Invalid purchase plans");
      m.purchasePlans.forEach(p => {
        if (!p || typeof p !== "object" || Array.isArray(p) || typeof p.planId !== "string" || !p.planId.trim() || ids.has(p.planId)
          || !Number.isInteger(p.season) || p.season < 1900 || p.season > 2200
          || typeof p.quantity !== "number" || !Number.isFinite(p.quantity) || p.quantity < 0 || p.quantity > Number.MAX_SAFE_INTEGER
          || typeof p.unit !== "string" || !p.unit.trim() || typeof p.memo !== "string"
          || ![p.createdAt, p.updatedAt].every(v => typeof v === "string" && v.trim() && Number.isFinite(Date.parse(v)))) throw new Error("Invalid purchase plan");
        ids.add(p.planId);
      });
    }
    if (m.stocktakes !== undefined) {
      const ids = new Set();
      const validDay = date => {
        const time = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
        return Number(date && date.slice(0, 4)) >= 1900 && Number(date && date.slice(0, 4)) <= 2200 && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
      };
      const validTime = time => typeof time === "string" && Boolean(time) && Number.isFinite(Date.parse(time));
      const validQuantity = q => typeof q === "number" && Number.isFinite(q) && q >= 0 && q <= Number.MAX_SAFE_INTEGER;
      if (!Array.isArray(m.stocktakes)) throw new Error("在庫確認履歴の形式を確認してください。元のデータは変更していません。");
      m.stocktakes.forEach(row => {
        if (!row || typeof row !== "object" || typeof row.stocktakeId !== "string" || !row.stocktakeId.trim() || ids.has(row.stocktakeId)
          || !validDay(row.date) || !validQuantity(row.quantity) || typeof row.unit !== "string" || !row.unit.trim() || !validTime(row.createdAt)
          || !String(m.unit || "").trim() || row.unit.trim() !== String(m.unit || "").trim()
          || row.sequence !== undefined && (!Number.isSafeInteger(row.sequence) || row.sequence < 0)
          || ["previousQuantity","adjustment"].some(key => row[key] !== undefined && row[key] !== null && (typeof row[key] !== "number" || !Number.isFinite(row[key]) || Math.abs(row[key]) > Number.MAX_SAFE_INTEGER * 2))
          || row.deletedAt !== undefined && !validTime(row.deletedAt)
          || row.supersedesId !== undefined && (typeof row.supersedesId !== "string" || !row.supersedesId.trim() || row.supersedesId === row.stocktakeId)
          || !row.snapshot || typeof row.snapshot !== "object") throw new Error("在庫確認履歴の日付・数量・単位・IDを確認してください。");
        ids.add(row.stocktakeId);
        ["purchases", "usage"].forEach(key => {
          const entries = row.snapshot[key], keys = new Set();
          if (!Array.isArray(entries)) throw new Error("在庫確認時の履歴照合情報を確認してください。");
          entries.forEach(entry => {
            if (!entry || typeof entry.id !== "string" || !entry.id.trim() || keys.has(entry.id) || !validDay(entry.date) || entry.date > row.date
              || !(entry.quantity === null || validQuantity(entry.quantity)) || typeof entry.unit !== "string") throw new Error("在庫確認時の履歴照合情報が不正です。");
            keys.add(entry.id);
          });
        });
      });
    }
    if (m.purchases !== undefined) {
      const ids = new Set();
      if (!Array.isArray(m.purchases)) throw new Error("資材の購入履歴の形式を確認してください。元のデータは変更していません。");
      m.purchases.forEach(row => {
        if (row && row.packagingSnapshot !== undefined) validateMaterialPackaging(row.packagingSnapshot);
        const date = row && row.date;
        const time = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
        const validMoney = value => value === "" || value === undefined || value === null || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
        if (!row || typeof row !== "object" || typeof row.purchaseId !== "string" || !row.purchaseId || ids.has(row.purchaseId)
          || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date
          || !Number.isInteger(row.season) || row.season < 1900 || row.season > 2200
          || typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > Number.MAX_SAFE_INTEGER
          || typeof row.unit !== "string" || !row.unit.trim() || !validMoney(row.unitPrice) || !validMoney(row.totalAmount)) {
          throw new Error("資材の購入履歴に不正な日付・数量・金額または重複IDがあります。元のデータは変更していません。");
        }
        ids.add(row.purchaseId);
        const validDay = value => {
          const time = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + "T00:00:00Z") : NaN;
          return value >= "1900-01-01" && value <= "2200-12-31" && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
        };
        if (row.deliveryMode !== undefined && row.deliveryMode !== "manual"
          || row.expectedDeliveryDate !== undefined && row.expectedDeliveryDate !== "" && !validDay(row.expectedDeliveryDate)
          || row.deliveryMode === "manual" && (!Array.isArray(row.receipts) || typeof row.expectedDeliveryDate !== "string")
          || row.deliveryMode === undefined && row.receipts !== undefined) throw new Error("購入履歴の納品方式・予定日を確認してください。");
        const receiptIds = new Set(), quantities = [];
        if (row.cancellations !== undefined && (row.deliveryMode !== "manual" || !Array.isArray(row.cancellations))) throw new Error("購入履歴の注文取消形式を確認してください。");
        const cancellationIds = new Set();
        (row.cancellations || []).forEach(cancellation => {
          if (!cancellation || typeof cancellation.cancellationId !== "string" || !cancellation.cancellationId.trim() || cancellationIds.has(cancellation.cancellationId)
            || !validDay(cancellation.date) || cancellation.date > U.today()
            || typeof cancellation.quantity !== "number" || !Number.isFinite(cancellation.quantity) || cancellation.quantity <= 0 || cancellation.quantity > Number.MAX_SAFE_INTEGER
            || typeof cancellation.reason !== "string" || !cancellation.reason.trim()
            || typeof cancellation.createdAt !== "string" || !Number.isFinite(Date.parse(cancellation.createdAt))
            || cancellation.deletedAt !== undefined && (typeof cancellation.deletedAt !== "string" || !Number.isFinite(Date.parse(cancellation.deletedAt)))) throw new Error("購入履歴の注文取消日・数量・理由・IDを確認してください。");
          cancellationIds.add(cancellation.cancellationId);
          if (!cancellation.deletedAt) quantities.push(cancellation.quantity);
        });
        (row.receipts || []).forEach(receipt => {
          if (!receipt || typeof receipt.receiptId !== "string" || !receipt.receiptId.trim() || receiptIds.has(receipt.receiptId)
            || !validDay(receipt.date) || receipt.date > U.today()
            || typeof receipt.quantity !== "number" || !Number.isFinite(receipt.quantity) || receipt.quantity <= 0 || receipt.quantity > Number.MAX_SAFE_INTEGER
            || receipt.unit !== row.unit || typeof receipt.memo !== "string"
            || typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))
            || receipt.deletedAt !== undefined && (typeof receipt.deletedAt !== "string" || !Number.isFinite(Date.parse(receipt.deletedAt)))) throw new Error("購入履歴の入庫日・数量・単位・IDを確認してください。");
          receiptIds.add(receipt.receiptId);
          if (!receipt.deletedAt) quantities.push(receipt.quantity);
        });
        // Compare decimal quantities exactly, including fractional split deliveries.
        const parts = [...quantities, -row.quantity].map(q => {
          const [m, e = "0"] = String(q).toLowerCase().split("e");
          return {n:BigInt(m.replace(".", "")), s:(m.split(".")[1] || "").length - Number(e)};
        });
        const scale = parts.reduce((n, p) => Math.max(n, p.s), 0);
        if (parts.reduce((n, p) => n + p.n * 10n ** BigInt(scale - p.s), 0n) > 0n) throw new Error("購入数量を超える入庫・注文取消履歴があります。");
      });
    }
    return {
      ...m,
      materialId: String(m.materialId || m.id || U.id("material", U.today())),
      season: U.number(m.season, new Date().getFullYear()),
      category: String(m.category || "その他"),
      name: String(m.name || ""),
      formalName: String(m.formalName || ""),
      formulation: String(m.formulation || ""),
      unit: String(m.unit || ""),
      carryover: String(m.carryover ?? ""),
      ordered: String(m.ordered ?? ""),
      used: String(m.used ?? ""),
      remaining: String(m.remaining ?? ""),
      deliveryDate: String(m.deliveryDate || ""),
      nextYearMemo: String(m.nextYearMemo || m.memo || ""),
      createdAt: String(m.createdAt || U.now()),
      updatedAt: String(m.updatedAt || U.now())
    };
  }

  function normalizeResult(input) {
    const r = input || {};
    return {
      resultId: String(r.resultId || r.id || U.id("result", U.today())),
      season: U.number(r.season, new Date().getFullYear()),
      varietyId: String(r.varietyId || ""),
      fieldId: String(r.fieldId || ""),
      areaA: String(r.areaA || ""),
      yield: String(r.yield || ""),
      yieldPer10a: String(r.yieldPer10a || ""),
      grade: String(r.grade || ""),
      firstGradeRate: String(r.firstGradeRate || ""),
      shippedQuantity: String(r.shippedQuantity || r.shipped || ""),
      quality: String(r.quality || ""),
      salesAmount: String(r.salesAmount || r.sales || ""),
      salesPer10a: String(r.salesPer10a || ""),
      reflection: String(r.reflection || ""),
      createdAt: String(r.createdAt || U.now()),
      updatedAt: String(r.updatedAt || U.now())
    };
  }

  function normalizeSchedule(input) {
    const s = input || {};
    const offField = s.targetScope === "offField";
    const date = String(s.date || U.today());
    return {
      scheduleId: String(s.scheduleId || s.id || U.id("schedule", date)),
      ...(s.initialPlannedDate !== undefined ? { initialPlannedDate: String(s.initialPlannedDate), originalDateSource: s.originalDateSource === "recorded" ? "recorded" : "legacy-first-observed" } : {}),
      ...(Array.isArray(s.dateRevisions) ? { dateRevisions: s.dateRevisions.filter(r => r && typeof r.from === "string" && typeof r.to === "string").map(r => ({ from: r.from, to: r.to, at: String(r.at || "") })) } : {}),
      type: "schedule",
      targetScope: offField ? "offField" : "field",
      date,
      season: U.number(s.season, U.season(date)),
      ...(validCropYear(s.cropYear) ? { cropYear: Number(s.cropYear) } : {}),
      fieldIds: offField ? [] : ensureArray(s.fieldIds).map(String),
      batchId: offField ? "" : String(s.batchId || ""),
      batchFieldIds: offField ? [] : ensureArray(s.batchFieldIds || s.fieldIds).map(String),
      orphanedFieldIds: offField ? [] : ensureArray(s.orphanedFieldIds).map(String),
      scheduleType: String(s.scheduleType || s.kind || "作業予定"),
      title: String(s.title || s.workName || s.scheduleType || "予定"),
      status: String(s.status || "予定"),
      completedAt: String(s.completedAt || ""),
      completedByWorkId: String(s.completedByWorkId || ""),
      completedByWaterPeriodId: String(s.completedByWaterPeriodId || ""),
      completedManuallyAt: String(s.completedManuallyAt || ""),
      completionReason: String(s.completionReason || ""),
      recordKind: String(s.recordKind || ""),
      waterKind: String(s.waterKind || ""),
      waterPhase: String(s.waterPhase || ""),
      ...(s.completionLink && s.completionLink.recordId ? {
        completionLink: {
          kind: String(s.completionLink.kind || ""),
          recordId: String(s.completionLink.recordId || ""),
          fieldId: String(s.completionLink.fieldId || ""),
          event: String(s.completionLink.event || "")
        }
      } : {}),
      plannedFertilizerName: String(s.plannedFertilizerName || ""),
      plannedFertilizerRateKg10a: String(s.plannedFertilizerRateKg10a || ""),
      memo: String(s.memo || ""),
      createdAt: String(s.createdAt || U.now()),
      updatedAt: String(s.updatedAt || U.now())
    };
  }

  function normalizeHarvestWaterClosures(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input).filter(([, row]) => row && row.workId && row.date)
      .map(([id, row]) => [id, { workId: String(row.workId), date: String(row.date) }]));
  }

  function normalizeHarvestAutoEnd(input) {
    if (!input || typeof input !== "object" || !input.workId || !input.date || !input.original) return undefined;
    return {
      workId: String(input.workId), date: String(input.date),
      ...(input.blocked === true ? { blocked: true, reason: "movement-outside-harvest" } : {}),
      original: {
        actualEndDate: String(input.original.actualEndDate || ""),
        status: String(input.original.status || ""),
        periodStatus: String(input.original.periodStatus || ""),
        ...(Array.isArray(input.original.waterMovements) ? { waterMovements: U.clone(input.original.waterMovements) } : {})
      }
    };
  }

  function normalizeDryPeriod(input) {
    const d = input || {};
    const date = String(d.startDate || d.date || d.observedDate || U.today());
    return {
      dryPeriodId: String(d.dryPeriodId || d.id || U.id("dry", date)),
      type: "dryPeriod",
      date,
      season: U.number(d.season, U.season(date)),
      fieldId: String(d.fieldId || ""),
      batchId: String(d.batchId || ""),
      batchFieldIds: ensureArray(d.batchFieldIds).map(String),
      orphanedFieldId: String(d.orphanedFieldId || ""),
      status: String(d.status || (d.actualEndDate ? "完了" : "実施中")),
      startDate: String(d.startDate || d.drainageStartDate || ""),
      endDate: String(d.endDate || d.expectedEndDate || ""),
      actualEndDate: String(d.actualEndDate || ""),
      ...(normalizeHarvestAutoEnd(d.harvestAutoEnd) ? { harvestAutoEnd: normalizeHarvestAutoEnd(d.harvestAutoEnd) } : {}),
      targetDays: String(d.targetDays || d.drainageTargetDays || ""),
      plannedStartDate: String(d.plannedStartDate || ""),
      startReason: String(d.startReason || ""),
      startTillerCount: String(d.startTillerCount || ""),
      startLeafColor: String(d.startLeafColor || ""),
      startSurface: String(d.startSurface || ""),
      endSurface: String(d.endSurface || ""),
      observationSummary: String(d.observationSummary || ""),
      interruptionDays: String(d.interruptionDays || ""),
      referenceRecordIds: ensureArray(d.referenceRecordIds).map(String),
      sourceScheduleId: String(d.sourceScheduleId || ""),
      sourceSchedulePhase: String(d.sourceSchedulePhase || ""),
      crackCm: String(d.crackCm || ""),
      sinkCm: String(d.sinkCm || ""),
      surface: String(d.surface || ""),
      gas: String(d.gas || ""),
      photo: String(d.photo || ""),
      photoData: String(d.photoData || ""),
      memo: String(d.memo || ""),
      createdAt: String(d.createdAt || U.now()),
      updatedAt: String(d.updatedAt || U.now())
    };
  }

  function normalizeIrrigation(input) {
    const i = input || {};
    const date = String(i.startDate || i.date || U.today());
    const waterMovements = ensureArray(i.waterMovements).map((movement, index) => {
      const row = movement || {};
      // Preserve an unknown legacy value rather than silently reclassifying
      // it as an irrigation event during JSON restore.
      const phase = ["flood", "drain", "wait"].includes(row.phase) ? row.phase : "unknown";
      return {
        movementId: String(row.movementId || row.id || `movement_${index + 1}`),
        phase,
        startDate: String(row.startDate || ""),
        endDate: String(row.endDate || ""),
        createdAt: String(row.createdAt || i.createdAt || U.now()),
        updatedAt: String(row.updatedAt || i.updatedAt || U.now())
      };
    }).filter((movement) => movement.startDate);
    return {
      irrigationId: String(i.irrigationId || i.id || U.id("irrigation", date)),
      type: "irrigation",
      date,
      season: U.number(i.season, U.season(date)),
      fieldId: String(i.fieldId || ""),
      batchId: String(i.batchId || ""),
      batchFieldIds: ensureArray(i.batchFieldIds).map(String),
      orphanedFieldId: String(i.orphanedFieldId || ""),
      method: String(i.method || i.irrigationType || "間断灌水"),
      periodStatus: String(i.periodStatus || (i.actualEndDate ? "完了" : "実施中")),
      startDate: String(i.startDate || ""),
      endDate: String(i.endDate || ""),
      actualEndDate: String(i.actualEndDate || ""),
      ...(normalizeHarvestAutoEnd(i.harvestAutoEnd) ? { harvestAutoEnd: normalizeHarvestAutoEnd(i.harvestAutoEnd) } : {}),
      targetDays: String(i.targetDays || ""),
      plannedStartDate: String(i.plannedStartDate || ""),
      startReason: String(i.startReason || ""),
      startTillerCount: String(i.startTillerCount || ""),
      startLeafColor: String(i.startLeafColor || ""),
      startSurface: String(i.startSurface || ""),
      endSurface: String(i.endSurface || ""),
      observationSummary: String(i.observationSummary || ""),
      interruptionDays: String(i.interruptionDays || ""),
      referenceRecordIds: ensureArray(i.referenceRecordIds).map(String),
      sourceScheduleId: String(i.sourceScheduleId || ""),
      sourceSchedulePhase: String(i.sourceSchedulePhase || ""),
      status: String(i.status || "入水中"),
      autoStartedFromDry: Boolean(i.autoStartedFromDry),
      autoStartedFromDrySource: String(i.autoStartedFromDrySource || ""),
      targetDepthCm: String(i.targetDepthCm || ""),
      observedDepthCm: String(i.observedDepthCm || ""),
      waterMovements,
      photo: String(i.photo || ""),
      photoData: String(i.photoData || ""),
      memo: String(i.memo || ""),
      createdAt: String(i.createdAt || U.now()),
      updatedAt: String(i.updatedAt || U.now())
    };
  }

  function normalizePricePer60Kg(value, strict = false) {
    if (value == null || typeof value === "string" && !value.trim()) return "";
    const price = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    if (Number.isSafeInteger(price) && price >= 0) return price;
    if (strict) throw new Error("60kgあたりの単価は0以上の整数で入力してください。");
    return "";
  }

  function normalizeShipmentPrice(input, strict = false) {
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const recipient = typeof row.recipient === "string" ? row.recipient.trim() : "";
    const season = String(row.season ?? "").trim();
    const pricePer60Kg = normalizePricePer60Kg(row.pricePer60Kg, strict);
    if (strict) {
      if (!["number", "string"].includes(typeof row.season) || !/^[1-9]\d{3}$/.test(season)) throw new Error("収穫年度を入力してください。");
      if (!recipient) throw new Error("出荷先・相手先を入力してください。");
      if (pricePer60Kg === "") throw new Error("60kgあたりの単価を入力してください。");
    }
    return {
      ...row,
      priceId: String(row.priceId || U.id("shipment_price", U.today())),
      season: U.number(row.season, 0),
      recipient,
      pricePer60Kg,
      createdAt: String(row.createdAt || U.now()),
      updatedAt: String(row.updatedAt || U.now())
    };
  }

  function normalizeShipment(input, strict = false) {
    const s = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const date = String(s.date || (strict ? "" : U.today())).trim();
    const season = String(s.season ?? "").trim();
    const recipient = typeof s.recipient === "string" ? s.recipient.trim() : "";
    const packageNumber = (value) => typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
    const packages = ensureArray(s.packages).map((item) => {
      const row = item && typeof item === "object" && !Array.isArray(item) ? item : {};
      const kg = packageNumber(row.kg);
      const bags = packageNumber(row.bags);
      if (strict && (!Number.isFinite(kg) || kg <= 0 || !Number.isSafeInteger(bags) || bags <= 0)) {
        throw new Error("袋の重量は正の数、袋数は正の整数を入力してください。");
      }
      return { ...row, kg: Number.isFinite(kg) && kg > 0 ? kg : "", bags: Number.isSafeInteger(bags) && bags > 0 ? bags : "" };
    });
    if (strict) {
      const parsedDate = new Date(`${date}T00:00:00Z`);
      if (typeof s.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) throw new Error("有効な日付を入力してください。");
      if (!["number", "string"].includes(typeof s.season) || !/^[1-9]\d{3}$/.test(season)) throw new Error("収穫年度を入力してください。");
      if (!recipient && s.kind !== "household") throw new Error("出荷先・相手先を入力してください。");
      if (!["shipment", "sale", "gift", "household"].includes(s.kind)) throw new Error("出荷・販売・贈答・自家用の区分を選択してください。");
      if (s.kind === "household" && (typeof s.varietyId !== "string" || !s.varietyId.trim())) throw new Error("自家用に取り分ける品種を選択してください。");
      if (!["brown", "white"].includes(s.riceType)) throw new Error("玄米・白米の区分を選択してください。");
      if (!packages.length) throw new Error("袋の重量と袋数を1件以上入力してください。");
    }
    return {
      ...s,
      shipmentId: String(s.shipmentId || s.id || U.id("shipment", date)),
      type: "shipment",
      date,
      season: U.number(s.season, U.season(date)),
      kind: ["shipment", "sale", "gift", "household"].includes(s.kind) ? s.kind : "shipment",
      recipient,
      varietyId: String(s.varietyId || ""),
      riceType: ["brown", "white"].includes(s.riceType) ? s.riceType : "brown",
      ...(!["brown", "white"].includes(s.riceType) ? { inventoryRiceTypeUnverified: true } : strict && s.inventoryRiceTypeUnverified ? { inventoryRiceTypeUnverified: false } : {}),
      packages,
      pricePer60Kg: normalizePricePer60Kg(s.pricePer60Kg, strict),
      quantity: String(s.quantity ?? ""),
      amount: String(s.amount ?? ""),
      memo: String(s.memo || ""),
      createdAt: String(s.createdAt || U.now()),
      updatedAt: String(s.updatedAt || U.now())
    };
  }

  function normalizeInventoryRecord(input, idKey, strict = false) {
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const date = String(row.date ?? "");
    const parsed = new Date(`${date}T00:00:00Z`);
    const season = validCropYear(row.season);
    if (strict && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || !validCropYear(date.slice(0, 4)))) throw new Error("有効な日付を入力してください。");
    if (strict && !season) throw new Error("収穫年度を1900〜2200で入力してください。");
    if (strict && !String(row.varietyId || "")) throw new Error("品種を選択してください。");
    return { ...row, [idKey]: String(row[idKey] || U.id(idKey, date)), date, season: season ? Number(row.season) : "", varietyId: String(row.varietyId || ""), memo: String(row.memo ?? ""), createdAt: String(row.createdAt || U.now()), updatedAt: String(row.updatedAt || row.createdAt || U.now()) };
  }

  function inventoryNumber(value) {
    return typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
  }

  function normalizeMillingRecord(input, strict = false) {
    const row = normalizeInventoryRecord(input, "millingId", strict);
    if (strict && input.packages !== undefined && !Array.isArray(input.packages)) throw new Error("袋内訳を確認してください。");
    const packages = ensureArray(row.packages).map(item => {
      const kg = inventoryNumber(item && item.kg), bags = inventoryNumber(item && item.bags);
      const valid = Number.isFinite(kg) && kg > 0 && Number.isSafeInteger(bags) && bags > 0 && Number.isFinite(kg * bags);
      if (strict && !valid) throw new Error("袋重量は正の数、袋数は正の整数で入力してください。");
      return { kg: valid ? kg : "", bags: valid ? bags : "" };
    });
    const loose = row.looseKg == null || row.looseKg === "" ? 0 : inventoryNumber(row.looseKg);
    const looseKg = Number.isFinite(loose) && loose >= 0 ? loose : "";
    const total = packages.reduce((sum, item) => sum + Number(item.kg) * Number(item.bags), 0) + Number(looseKg);
    const totalBags = packages.reduce((sum, item) => sum + Number(item.bags), 0);
    if (strict && !Number.isSafeInteger(totalBags)) throw new Error("袋数の合計が安全に集計できる範囲を超えています。");
    if (strict && (looseKg === "" || !Number.isFinite(total) || total <= 0)) throw new Error("正の受入重量を入力してください。");
    if (strict && row.fieldIds !== undefined && !Array.isArray(row.fieldIds)) throw new Error("圃場を確認してください。");
    return { ...row, fieldIds: Array.from(new Set(ensureArray(row.fieldIds).map(String))), packages, looseKg };
  }

  function normalizeHarvestYearReview(input, strict = false) {
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const area = row.areaA == null || row.areaA === "" ? null : inventoryNumber(row.areaA);
    const validArea = area === null || Number.isFinite(area) && area > 0;
    if (strict && (!validCropYear(row.season) || !String(row.varietyId || "") || !validArea || row.completed !== undefined && typeof row.completed !== "boolean" || row.fieldIds !== undefined && !Array.isArray(row.fieldIds))) throw new Error("年産・品種・正の面積・完了区分を確認してください。");
    const target = row.targetBalesPer10a === undefined ? 10 : inventoryNumber(row.targetBalesPer10a);
    if (strict && (!Number.isFinite(target) || target <= 0 || row.areaMode !== undefined && !["auto", "manual"].includes(row.areaMode) || row.followUpOutcome !== undefined && !["", "improved", "same", "uncertain"].includes(row.followUpOutcome))) throw new Error("面積方式・目標・振り返り区分を確認してください。");
    const plans = row.plans && typeof row.plans === "object" ? row.plans : {};
    const refs = ensureArray(row.evidenceRefs).filter(ref => ref && ["fieldWork", "growth", "dry", "irrigation", "milling"].includes(ref.kind) && typeof ref.id === "string" && ref.id).map(ref => ({ kind: ref.kind, id: ref.id }));
    if (strict && row.evidenceRefs !== undefined && (!Array.isArray(row.evidenceRefs) || refs.length !== row.evidenceRefs.length)) throw new Error("実績の参照を確認してください。");
    return { ...row, reviewId: String(row.reviewId || U.id("harvest_review", U.today())), season: validCropYear(row.season) ? Number(row.season) : "", varietyId: String(row.varietyId || ""), areaA: validArea ? area : null, areaMode: row.areaMode === "auto" ? "auto" : row.areaMode === "manual" || area !== null && validArea ? "manual" : "auto", ...(Array.isArray(row.areaSnapshot) ? { areaSnapshot: row.areaSnapshot.filter(item => item && typeof item.fieldId === "string").map(item => ({ fieldId: item.fieldId, name: String(item.name || ""), varietyId: String(item.varietyId || ""), areaA: typeof item.areaA === "number" && Number.isFinite(item.areaA) && item.areaA > 0 ? item.areaA : null })) } : {}), targetBalesPer10a: Number.isFinite(target) && target > 0 ? target : 10, conditions: String(row.conditions ?? ""), plans: { continue: String(plans.continue ?? ""), change: String(plans.change ?? ""), undecided: String(plans.undecided ?? "") }, evidenceRefs: refs, followUpOutcome: ["improved", "same", "uncertain"].includes(row.followUpOutcome) ? row.followUpOutcome : "", followUpMemo: String(row.followUpMemo ?? ""), completed: row.completed === true, memo: String(row.memo ?? ""), ...(Array.isArray(row.fieldIds) ? { fieldIds: Array.from(new Set(row.fieldIds.map(String))) } : {}), createdAt: String(row.createdAt || U.now()), updatedAt: String(row.updatedAt || row.createdAt || U.now()) };
  }

  function normalizeShipmentIssue(input, strict = false) {
    const row = normalizeInventoryRecord(input, "issueId", strict);
    const reason = String(row.reason ?? "").trim();
    const cost = row.costYen == null || typeof row.costYen === "string" && !row.costYen.trim() ? "" : inventoryNumber(row.costYen);
    const valid = cost === "" || Number.isSafeInteger(cost) && cost >= 0;
    if (strict && (!reason || !valid)) throw new Error("理由と0以上の整数の費用を確認してください。");
    return { ...row, millingId: String(row.millingId || ""), reason, action: String(row.action ?? ""), costYen: valid ? cost : "" };
  }

  function normalizeConfirmationCandidate(input) {
    const c = input || {};
    const createdAt = String(c.createdAt || U.now());
    return {
      candidateId: String(c.candidateId || c.id || U.id("candidate", String(createdAt).slice(0, 10))),
      candidateType: String(c.candidateType || ""),
      fieldId: String(c.fieldId || ""),
      season: U.number(c.season, U.season(String(c.periodStart || createdAt).slice(0, 10))),
      periodStart: String(c.periodStart || ""),
      periodEnd: String(c.periodEnd || ""),
      basisData: c.basisData && typeof c.basisData === "object" ? c.basisData : {},
      missingData: ensureArray(c.missingData).map(String),
      regionProfile: String(c.regionProfile || ""),
      varietyProfile: String(c.varietyProfile || ""),
      calculationMethod: String(c.calculationMethod || ""),
      calculationVersion: String(c.calculationVersion || ""),
      status: String(c.status || "active"),
      actualRecordId: String(c.actualRecordId || ""),
      actualDifferenceDays: c.actualDifferenceDays === "" || c.actualDifferenceDays === undefined ? "" : U.number(c.actualDifferenceDays, 0),
      createdAt,
      updatedAt: String(c.updatedAt || createdAt)
    };
  }

  const TRANSPLANTER_SETTING_FIELDS = [
    ["rowSpacing", "条間", "text", ""], ["plantSpacing", "株間", "text", ""], ["plantsPerHill", "植付本数", "text", ""],
    ["plantsPerTsubo", "坪あたり株数", "text", ""], ["seedlingBoxesPer10a", "10a箱数目安", "text", ""],
    ["seedlingScrapeAmount", "かき取り量", "text", ""], ["transplanterSetting", "田植機設定メモ", "text", ""],
    ["depthCm", "植付深さ", "number", "cm"], ["speedKmh", "作業速度", "number", "km/h"],
    ["fertilizerName", "側条施肥の肥料名", "text", ""], ["fertilizerRateKg10a", "側条施肥量", "number", "kg/10a"]
  ].map(([key, label, type, unit]) => ({ key, label, type, unit, ...(type === "number" ? { min: 0, step: "any" } : {}) }));

  function normalizeTransplanterSettings(input, strict = false) {
    if (strict && (!input || typeof input !== "object" || Array.isArray(input))) throw new Error("田植機設定の形式を確認してください。");
    const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    if (strict && Object.keys(raw).some(key => !TRANSPLANTER_SETTING_FIELDS.some(f => f.key === key) && raw[key] !== "" && raw[key] != null)) throw new Error("未対応の田植機設定が含まれています。");
    return Object.fromEntries(TRANSPLANTER_SETTING_FIELDS.map(f => {
      const value = raw[f.key];
      if (value == null || typeof value === "string" && !value.trim()) return [f.key, ""];
      if (f.type === "text") {
        if (strict && !["number", "string"].includes(typeof value)) throw new Error(`${f.label}を確認してください。`);
        return [f.key, ["number", "string"].includes(typeof value) ? String(value) : ""];
      }
      const numeric = inventoryNumber(value), valid = Number.isFinite(numeric) && numeric >= 0;
      if (strict && !valid) throw new Error(`${f.label}は0以上の数値で入力してください。`);
      return [f.key, valid ? numeric : ""];
    }));
  }

  function carryoverMetadata(row) {
    if (!row || typeof row !== "object") return {};
    const source = row.carryoverSource;
    return { ...(validCropYear(row.cropYear) ? { cropYear: Number(row.cropYear) } : {}), ...(validCropYear(row.sourceSeason) ? { sourceSeason: Number(row.sourceSeason) } : {}), ...(validCropYear(row.targetSeason) ? { targetSeason: Number(row.targetSeason) } : {}), ...(source && typeof source.key === "string" ? { carryoverSource: { key: source.key, kind: String(source.kind || ""), sourceId: String(source.sourceId || ""), sourceYear: validCropYear(source.sourceYear) ? Number(source.sourceYear) : null, targetYear: validCropYear(source.targetYear) ? Number(source.targetYear) : null } } : {}) };
  }
  function normalizeTransplanterProfile(input, strict = false) { return { ...normalizeTransplanterProfileBase(input, strict), ...carryoverMetadata(input) }; }
  function normalizeTransplanterProfileBase(input, strict = false) {
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    if (strict && (!validCropYear(row.cropYear) || !String(row.varietyId || "") || !String(row.name || "").trim())) throw new Error("作付年度・品種・設定名を確認してください。");
    return { profileId: String(row.profileId || U.id("transplanter_profile", U.today())), cropYear: validCropYear(row.cropYear) ? Number(row.cropYear) : "", machineId: String(row.machineId || ""), varietyId: String(row.varietyId || ""), name: String(row.name || "").trim(), settings: normalizeTransplanterSettings(row.settings === undefined ? {} : row.settings, strict), intent: String(row.intent ?? ""), memo: String(row.memo ?? ""), createdAt: String(row.createdAt || U.now()), updatedAt: String(row.updatedAt || row.createdAt || U.now()) };
  }

  function normalizeTransplanterSnapshot(input, strict = false) {
    if (!input || typeof input !== "object" || Array.isArray(input)) { if (strict) throw new Error("田植機の実施設定を確認してください。"); return null; }
    const row = input;
    if (strict && (!row.profileId || !row.varietyId || !validCropYear(row.cropYear))) throw new Error("田植機設定の年度・品種を確認してください。");
    return { profileId: String(row.profileId || ""), profileName: String(row.profileName || ""), cropYear: validCropYear(row.cropYear) ? Number(row.cropYear) : "", machineId: String(row.machineId || ""), machineName: String(row.machineName || ""), machineMaker: String(row.machineMaker || ""), machineModel: String(row.machineModel || ""), varietyId: String(row.varietyId || ""), varietyName: String(row.varietyName || ""), settings: normalizeTransplanterSettings(row.settings === undefined ? {} : row.settings, strict), intent: String(row.intent ?? ""), memo: String(row.memo ?? ""), capturedAt: String(row.capturedAt || "") };
  }

  const TRACTOR_WORK_TYPES = [
    { value: "autumnTillage", label: "秋起こし" },
    { value: "ridgePlastering", label: "くろぬり（畦塗り）" },
    { value: "puddling", label: "代掻き" }
  ];
  const TRACTOR_SETTING_FIELDS = [
    ["attachmentMaker", "作業機メーカー", "text", ""], ["attachmentModel", "作業機型式", "text", ""],
    ["engineRpm", "エンジン回転数", "number", "rpm"], ["ptoGear", "PTO段", "text", ""], ["ptoRpm", "PTO軸回転数", "number", "rpm"],
    ["mainGear", "主変速", "text", ""], ["subGear", "副変速", "text", ""], ["speedKmh", "作業速度", "number", "km/h"],
    ["depthControl", "耕深制御", "text", ""], ["levelControl", "水平制御", "text", ""],
    ["depthCm", "作業深さ", "number", "cm", ["autumnTillage", "puddling"]], ["depthDial", "深さダイヤル", "text", "", ["autumnTillage", "puddling"]],
    ["rotorGear", "ロータリー変速", "text", "", ["autumnTillage"]], ["rearCover", "後部カバー", "text", "", ["autumnTillage"]],
    ["passes", "回数", "number", "回", ["autumnTillage", "puddling"]], ["strawFinish", "わらの仕上がり", "text", "", ["autumnTillage"]],
    ["ridgeHeightCm", "畦高さ", "number", "cm", ["ridgePlastering"]], ["ridgeWidthCm", "畦幅", "number", "cm", ["ridgePlastering"]],
    ["offsetCm", "オフセット", "number", "cm", ["ridgePlastering"]], ["pretreatmentDepthCm", "前処理深さ", "number", "cm", ["ridgePlastering"]],
    ["rollerSetting", "ローラー設定", "text", "", ["ridgePlastering"]], ["diskSetting", "ディスク設定", "text", "", ["ridgePlastering"]],
    ["soilMoisture", "土の湿り", "text", "", ["ridgePlastering"]], ["finish", "仕上がり", "text", "", ["ridgePlastering", "puddling"]],
    ["passType", "工程", "text", "", ["puddling"]], ["waterLevel", "水位", "text", "", ["puddling"]],
    ["soilExposure", "土の露出", "text", "", ["puddling"]], ["levelBoard", "均平板", "text", "", ["puddling"]],
    ["soilPull", "土の引き具合", "text", "", ["puddling"]], ["strawFloat", "わら浮き", "text", "", ["puddling"]]
  ].map(([key, label, type, unit, workTypes]) => ({ key, label, type, unit, ...(workTypes ? { workTypes } : {}), ...(type === "number" ? { ...(key === "offsetCm" ? {} : { min: key === "passes" ? 1 : 0 }), step: key === "passes" ? 1 : "any" } : {}) }));

  function normalizeTractorSettings(input, workType, strict = false) {
    if (strict && (!input || typeof input !== "object" || Array.isArray(input))) throw new Error("トラクター設定の形式を確認してください。");
    const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const fields = TRACTOR_SETTING_FIELDS.filter(f => !f.workTypes || f.workTypes.includes(workType));
    if (strict && Object.keys(raw).some(key => !fields.some(f => f.key === key) && raw[key] !== "" && raw[key] != null)) throw new Error("この作業では使わない設定が含まれています。");
    return Object.fromEntries(fields.map(f => {
      const value = raw[f.key];
      if (value == null || typeof value === "string" && !value.trim()) return [f.key, ""];
      if (f.type === "text") {
        if (strict && !["string", "number"].includes(typeof value)) throw new Error(`${f.label}を確認してください。`);
        return [f.key, ["string", "number"].includes(typeof value) ? String(value) : ""];
      }
      const number = inventoryNumber(value);
      const valid = Number.isFinite(number) && (f.key === "offsetCm" || number >= 0) && (f.key !== "passes" || Number.isSafeInteger(number) && number > 0);
      if (strict && !valid) throw new Error(`${f.label}の数値を確認してください。`);
      return [f.key, valid ? number : ""];
    }));
  }

  function normalizeTractorProfile(input, strict = false) {
    if (strict && input && input.cropYear !== undefined && !validCropYear(input.cropYear)) throw new Error("作付年度を確認してください。");
    return { ...normalizeTractorProfileBase(input, strict), ...carryoverMetadata(input) };
  }
  function normalizeTractorProfileBase(input, strict = false) {
    const row = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    const name = String(row.name || "").trim(), machineId = String(row.machineId || "");
    const workType = String(row.workType || "");
    if (strict && (!name || !machineId || !TRACTOR_WORK_TYPES.some(t => t.value === workType))) throw new Error("機械・設定名・作業種別を確認してください。");
    return { profileId: String(row.profileId || U.id("tractor_profile", U.today())), machineId, name, workType, settings: normalizeTractorSettings(row.settings === undefined ? {} : row.settings, workType, strict), conditions: String(row.conditions ?? ""), memo: String(row.memo ?? ""), createdAt: String(row.createdAt || U.now()), updatedAt: String(row.updatedAt || row.createdAt || U.now()) };
  }

  function normalizeTractorSnapshot(input, strict = false) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      if (strict) throw new Error("作業時のトラクター設定を確認してください。");
      return null;
    }
    const row = input;
    if (strict && (!row.profileId || !row.machineId || !TRACTOR_WORK_TYPES.some(t => t.value === row.workType))) throw new Error("トラクター設定の機械・作業種別を確認してください。");
    return { profileId: String(row.profileId || ""), profileName: String(row.profileName || ""), machineId: String(row.machineId || ""), machineName: String(row.machineName || ""), machineMaker: String(row.machineMaker || ""), machineModel: String(row.machineModel || ""), workType: String(row.workType || ""), settings: normalizeTractorSettings(row.settings === undefined ? {} : row.settings, row.workType, strict), conditions: String(row.conditions ?? ""), memo: String(row.memo ?? ""), capturedAt: String(row.capturedAt || "") };
  }

  function normalizeMachine(input, index) {
    const row = input || {};
    const createdAt = String(row.createdAt || U.now());
    return {
      machineId: String(row.machineId || row.id || U.id("machine", String(index + 1))),
      name: String(row.name || row.machineName || `機械${index + 1}`),
      category: MACHINE_CATEGORIES.includes(String(row.category || row.type)) ? String(row.category || row.type) : "その他",
      maker: String(row.maker || row.manufacturer || ""),
      model: String(row.model || row.modelNumber || ""),
      meterHours: String(row.meterHours ?? row.hourMeter ?? ""),
      ...(row.meterBaseline !== undefined ? { meterBaseline: String(row.meterBaseline ?? "") } : {}),
      ...(["manual", "maintenance"].includes(row.meterOrigin) ? { meterOrigin: row.meterOrigin } : {}),
      purchasedAt: String(row.purchasedAt || ""),
      status: ["使用中", "使用停止"].includes(String(row.status)) ? String(row.status) : (row.retiredAt ? "使用停止" : "使用中"),
      retiredAt: String(row.retiredAt || ""),
      memo: String(row.memo || ""),
      customItems: ensureArray(row.customItems).map(String).map((item) => item.trim()).filter(Boolean),
      createdAt,
      updatedAt: String(row.updatedAt || createdAt)
    };
  }

  function normalizeMaintenanceRecord(input, index) {
    const row = input || {};
    const date = String(row.date || U.today());
    const createdAt = String(row.createdAt || U.now());
    return {
      maintenanceId: String(row.maintenanceId || row.id || U.id("maintenance", `${date}-${index + 1}`)),
      machineId: String(row.machineId || ""),
      date,
      kind: String(row.kind || "点検"),
      item: String(row.item || row.title || "整備記録"),
      meterHours: String(row.meterHours ?? ""),
      parts: String(row.parts || ""),
      cost: String(row.cost || ""),
      vendor: String(row.vendor || ""),
      nextDueDate: String(row.nextDueDate || ""),
      nextDueHours: String(row.nextDueHours || ""),
      photoData: String(row.photoData || ""),
      memo: String(row.memo || ""),
      createdAt,
      updatedAt: String(row.updatedAt || createdAt)
    };
  }

  function convertLegacyWorks(input) {
    return ensureArray(input.works).map((w) => {
      if (String(w.name || w.workName || "").includes("生育ログ")) {
        return { growth: normalizeGrowthLog({ ...w, logId: w.id || w.logId }) };
      }
      return { work: normalizeFieldWork({ ...w, workId: w.id || w.workId }) };
    });
  }

  function normalize(input) {
    const source = U.clone(input || {});
    const converted = convertLegacyWorks(source);
    const convertedWorks = converted.filter((x) => x.work).map((x) => x.work);
    const convertedGrowth = converted.filter((x) => x.growth).map((x) => x.growth);

    let varieties = ensureArray(source.varieties || source.recipes).map(normalizeVariety);
    DEFAULT_VARIETIES.forEach((def, i) => {
      const existing = varieties.find((v) => v.varietyId === def.varietyId);
      if (existing) {
        Object.keys(DEFAULT_VARIETY_FIELDS).forEach((key) => {
          if (existing[key] === undefined) existing[key] = def[key];
        });
      } else {
        varieties.push(U.clone(def));
      }
      if (!varieties[i]) varieties[i] = U.clone(def);
    });
    varieties = dedupeBy(varieties, "varietyId");

    const fallbackVarietyId = varieties[0] && varieties[0].varietyId;
    let fields = ensureArray(source.fields).map((f, index) => normalizeField(f, index, fallbackVarietyId));
    DEFAULT_FIELDS.forEach((def) => {
      const existing = fields.find((f) => f.fieldId === def.fieldId);
      if (existing) {
        Object.keys(DEFAULT_FIELD_FIELDS).forEach((key) => {
          if (existing[key] === undefined) existing[key] = def[key];
        });
      } else {
        fields.push(U.clone(def));
      }
    });
    fields = dedupeBy(fields, "fieldId").sort((a, b) => U.number(a.sortOrder, 0) - U.number(b.sortOrder, 0));

    // Field groups are master data. Older saves held a free-form label directly
    // on each field, so consolidate those labels once while preserving field IDs.
    const savedGroups = ensureArray(source.fieldGroups).map(normalizeFieldGroup);
    const defaultGroups = DEFAULT_FIELD_GROUPS.map(normalizeFieldGroup);
    const defaultsById = new Map(defaultGroups.map((group) => [group.fieldGroupId, group]));
    const savedGroupIds = new Set(savedGroups.map((group) => group.fieldGroupId));
    const groupSources = [
      ...savedGroups.map((group) => {
        const fallback = defaultsById.get(group.fieldGroupId);
        if (!fallback) return group;
        return {
          ...group,
          // A renamed built-in group still recognizes its old label in legacy
          // field data without recreating a second master record.
          aliases: Array.from(new Set([
            ...(group.aliases || []),
            fallback.name,
            ...(fallback.aliases || [])
          ].filter((label) => normalizeGroupLabel(label) && normalizeGroupLabel(label) !== normalizeGroupLabel(group.name))))
        };
      }),
      ...defaultGroups.filter((group) => !savedGroupIds.has(group.fieldGroupId))
    ].filter((group) => group.fieldGroupId && group.name);
    // A user master wins over a built-in master by ID first.
    // Without the ID check, renaming a default group re-added the old default
    // group on every normalization pass.
    const seenGroupIds = new Set();
    let fieldGroups = groupSources.filter((group) => {
      if (seenGroupIds.has(group.fieldGroupId)) return false;
      seenGroupIds.add(group.fieldGroupId);
      return true;
    });
    const groupById = new Map(fieldGroups.map((group) => [group.fieldGroupId, group]));
    const groupByLabel = new Map();
    fieldGroups.forEach((group) => {
      [group.name, ...(group.aliases || [])].forEach((label) => {
        const normalized = normalizeGroupLabel(label);
        // A legacy free-form label can be ambiguous. Keep the first stable
        // master rather than silently moving records with an explicit ID.
        if (normalized && !groupByLabel.has(normalized)) groupByLabel.set(normalized, group);
      });
    });
    fields.forEach((field) => {
      let legacyValue = String(field.fieldGroupId || "");
      if (!legacyValue) {
        // Only known legacy default field names are inferred. Other blank values
        // remain unassigned rather than being guessed from a district or memo.
        legacyValue = defaultGroupIdForFieldName(field.name);
        if (!legacyValue) return;
        field.fieldGroupId = legacyValue;
      }
      const normalizedLabel = normalizeGroupLabel(legacyValue);
      let group = groupById.get(legacyValue) || groupByLabel.get(normalizedLabel);
      if (!group) {
        group = normalizeFieldGroup({ name: normalizedLabel, aliases: normalizedLabel !== legacyValue ? [legacyValue] : [], sortOrder: (fieldGroups.length + 1) * 10 }, fieldGroups.length);
        fieldGroups.push(group);
        groupById.set(group.fieldGroupId, group);
        [group.name, ...(group.aliases || [])].forEach((label) => groupByLabel.set(normalizeGroupLabel(label), group));
      }
      field.fieldGroupId = group.fieldGroupId;
    });
    fieldGroups = fieldGroups
      .map((group, index) => normalizeFieldGroup(group, index))
      .filter((group) => group.fieldGroupId && group.name)
      .sort((a, b) => U.number(a.sortOrder, 0) - U.number(b.sortOrder, 0) || a.name.localeCompare(b.name));

    const fieldIds = new Set(fields.map((f) => f.fieldId));
    fields.forEach((f) => {
      if (!varieties.some((v) => v.varietyId === f.varietyId)) f.varietyId = fallbackVarietyId || "";
    });

    const orphan = (fieldId) => fieldId && !fieldIds.has(fieldId) ? fieldId : "";
    const fieldWorks = dedupeBy([
      ...ensureArray(source.fieldWorks).map(normalizeFieldWork),
      ...convertedWorks
    ], "workId").map((w) => ({
      ...w,
      orphanedFieldIds: Array.from(new Set([...(w.orphanedFieldIds || []), ...ensureArray(w.fieldIds).filter((id) => !fieldIds.has(id))])),
      fieldIds: ensureArray(w.fieldIds).filter((id) => fieldIds.has(id)),
      batchFieldIds: ensureArray(w.batchFieldIds || w.fieldIds).filter((id) => fieldIds.has(id))
    }));

    const growthLogs = dedupeBy([
      ...ensureArray(source.growthLogs).map(normalizeGrowthLog),
      ...convertedGrowth
    ], "logId").map((g) => ({
      ...g,
      orphanedFieldId: g.orphanedFieldId || orphan(g.fieldId),
      fieldId: fieldIds.has(g.fieldId) ? g.fieldId : ""
    }));

    const otherWorks = dedupeBy(ensureArray(source.otherWorks || source.generalWorks).map(normalizeOtherWork), "otherWorkId");
    const materials = dedupeBy(ensureArray(source.materials).map(normalizeMaterial), "materialId");
    Object.entries({ herbicidePrograms: "programId", herbicideAssignments: "assignmentId", herbicideObservations: "observationId" }).forEach(([key, idKey]) => {
      const collection = source.meta && source.meta[key];
      if (collection === undefined) return;
      if (!Array.isArray(collection) || collection.some((row) => !row || typeof row !== "object" || typeof row[idKey] !== "string" || !row[idKey] || (key !== "herbicideObservations" && (!Array.isArray(row.steps) || row.steps.some((step) => !step || typeof step.id !== "string"))))) throw new Error("除草体系のデータ形式が不正です。元のデータは変更していません。");
    });
    const varietyResults = dedupeBy(ensureArray(source.varietyResults).map(normalizeResult), "resultId");
    const schedules = dedupeBy(ensureArray(source.schedules).map(normalizeSchedule), "scheduleId").map((s) => ({
      ...s,
      orphanedFieldIds: Array.from(new Set([...(s.orphanedFieldIds || []), ...ensureArray(s.fieldIds).filter((id) => !fieldIds.has(id))])),
      fieldIds: ensureArray(s.fieldIds).filter((id) => fieldIds.has(id)),
      batchFieldIds: ensureArray(s.batchFieldIds || s.fieldIds).filter((id) => fieldIds.has(id))
    }));
    const dryPeriods = dedupeBy(ensureArray(source.dryPeriods).map(normalizeDryPeriod), "dryPeriodId").map((d) => ({
      ...d,
      orphanedFieldId: d.orphanedFieldId || orphan(d.fieldId),
      fieldId: fieldIds.has(d.fieldId) ? d.fieldId : "",
      batchFieldIds: ensureArray(d.batchFieldIds).filter((id) => fieldIds.has(id))
    }));
    const irrigations = dedupeBy(ensureArray(source.irrigations).map(normalizeIrrigation), "irrigationId").map((i) => ({
      ...i,
      orphanedFieldId: i.orphanedFieldId || orphan(i.fieldId),
      fieldId: fieldIds.has(i.fieldId) ? i.fieldId : "",
      batchFieldIds: ensureArray(i.batchFieldIds).filter((id) => fieldIds.has(id))
    }));
    const shipments = dedupeBy(ensureArray(source.shipments).map((row) => normalizeShipment(row)), "shipmentId");
    const priceKeys = new Set();
    const shipmentPrices = dedupeBy(ensureArray(source.shipmentPrices).map((row) => normalizeShipmentPrice(row)), "priceId")
      .filter((row) => {
        const key = JSON.stringify([row.season, row.recipient]);
        if (priceKeys.has(key)) return false;
        priceKeys.add(key);
        return true;
      });
    const machines = dedupeBy(ensureArray(source.machines).map(normalizeMachine), "machineId");
    const machineIds = new Set(machines.map((row) => row.machineId));
    // Preserve a record even if its old machine master is missing. The
    // orphan marker lets a future UI guide relinking without erasing history.
    const maintenanceRecords = dedupeBy(ensureArray(source.maintenanceRecords).map(normalizeMaintenanceRecord), "maintenanceId")
      .map((row) => ({ ...row, orphanedMachineId: row.machineId && !machineIds.has(row.machineId) ? row.machineId : "" }));
    const confirmationCandidates = dedupeBy(ensureArray(source.confirmationCandidates).map(normalizeConfirmationCandidate), "candidateId")
      .filter((candidate) => !candidate.fieldId || fieldIds.has(candidate.fieldId));
    const workers = Array.from(new Set([...WORKERS, ...ensureArray(source.workers).map(String), ...fieldWorks.map((w) => w.worker).filter(Boolean)]));

    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: String(source.appVersion || source.meta && source.meta.appVersion || APP_VERSION),
      varieties,
      fieldGroups,
      fields,
      fieldWorks,
      growthLogs,
      dryPeriods,
      irrigations,
      schedules,
      otherWorks,
      materials,
      varietyResults,
      shipments,
      millingRecords: dedupeBy(ensureArray(source.millingRecords).map(row => normalizeMillingRecord(row)), "millingId"),
      shipmentIssues: dedupeBy(ensureArray(source.shipmentIssues).map(row => normalizeShipmentIssue(row)), "issueId"),
      harvestYearReviews: dedupeBy(ensureArray(source.harvestYearReviews).map(row => normalizeHarvestYearReview(row)), "reviewId").filter((row, index, rows) => rows.findIndex(other => other.season === row.season && other.varietyId === row.varietyId) === index),
      shipmentPrices,
      confirmationCandidates,
      machines,
      tractorProfiles: dedupeBy(ensureArray(source.tractorProfiles).map(row => normalizeTractorProfile(row)), "profileId"),
      transplanterProfiles: dedupeBy(ensureArray(source.transplanterProfiles).map(row => normalizeTransplanterProfile(row)), "profileId"),
      maintenanceRecords,
      photos: ensureArray(source.photos),
      workers,
      meta: {
        ...(source.meta || {}),
        ...(validCropYear(source.meta && source.meta.activeCropYear) ? { activeCropYear: Number(source.meta.activeCropYear) } : {}),
        ...(source.meta && Object.prototype.hasOwnProperty.call(source.meta, "cropYearClosures")
          ? { cropYearClosures: normalizeCropYearClosures(source.meta.cropYearClosures) } : {}),
        app: "稲作カルテ",
        appName: "稲作カルテ",
        createdAt: source.meta && source.meta.createdAt || source.createdAt || U.now(),
        updatedAt: U.now(),
        importedFrom: source.meta && source.meta.importedFrom || source.importedFrom || "",
        lastJsonExportAt: source.meta && source.meta.lastJsonExportAt || "",
        lastNotificationCheck: source.meta && source.meta.lastNotificationCheck || "",
        weatherLocation: source.meta && source.meta.weatherLocation || source.weatherLocation || null,
        appVersion: source.meta && source.meta.appVersion || source.appVersion || APP_VERSION,
        lastBackupAt: source.meta && source.meta.lastBackupAt || "",
        storagePersisted: source.meta && source.meta.storagePersisted,
        storagePersistCheckedAt: source.meta && source.meta.storagePersistCheckedAt || "",
        lastExportId: source.meta && source.meta.lastExportId || source.exportId || "",
        // Derived forecast snapshots are metadata only. Source records remain
        // authoritative and are never reconstructed from these rows.
        outlookSnapshots: ensureArray(source.meta && source.meta.outlookSnapshots),
        // Global next-season ideas sit alongside, but never replace, each
        // field's individual carryover note.
        nextSeasonIdeas: ensureArray(source.meta && source.meta.nextSeasonIdeas)
          .map((item, index) => ({
            ...carryoverMetadata(item),
            ...(item && item.reviewId ? { sourceSeason: validCropYear(item.sourceSeason) ? Number(item.sourceSeason) : "", targetSeason: validCropYear(item.targetSeason) ? Number(item.targetSeason) : "", varietyId: String(item.varietyId || ""), reviewId: String(item.reviewId), category: String(item.category || ""), reason: String(item.reason || ""), evidenceRefs: ensureArray(item.evidenceRefs).filter(ref => ref && typeof ref.kind === "string" && typeof ref.id === "string").map(ref => ({ kind: ref.kind, id: ref.id })) } : {}),
            ideaId: String(item && item.ideaId || `next-season-idea-import-${index + 1}`),
            text: String(item && item.text || "").trim(),
            done: Boolean(item && item.done),
            createdAt: String(item && item.createdAt || ""),
            updatedAt: String(item && item.updatedAt || "")
          }))
          .filter((item) => item.text)
      }
    };
  }

  function emptyData() {
    return normalize({
      varieties: U.clone(DEFAULT_VARIETIES),
      fieldGroups: U.clone(DEFAULT_FIELD_GROUPS),
      fields: U.clone(DEFAULT_FIELDS),
      fieldWorks: [],
      growthLogs: [],
      dryPeriods: [],
      irrigations: [],
      schedules: [],
      otherWorks: [],
      materials: [],
      varietyResults: [],
      shipments: [],
      millingRecords: [],
      shipmentIssues: [],
      harvestYearReviews: [],
      shipmentPrices: [],
      confirmationCandidates: [],
      machines: [],
      maintenanceRecords: [],
      tractorProfiles: [],
      transplanterProfiles: [],
      workers: U.clone(WORKERS)
    });
  }

  function phase(workName) {
    const name = String(workName || "");
    if (["種籾注文", "塩水選", "温湯殺菌", "薬剤消毒", "浸種", "催芽", "播種", "育苗管理", "苗箱準備", "育苗土準備"].includes(name)) return "1 種籾・育苗";
    if (["畦塗り・畦管理", "耕起", "基肥・元肥", "代かき"].includes(name)) return "2 田植え前";
    if (["田植え", "補植"].includes(name)) return "3 田植え";
    if (["入水", "落水", "除草剤", "草刈り", "溝切り", "中干し開始", "中干し終了", "間断灌水開始", "間断灌水終了", "湿潤灌漑開始", "湿潤灌漑終了", "追肥", "防除"].includes(name)) return "4 生育管理";
    if (["稲刈り"].includes(name)) return "5 収穫";
    if (["乾燥", "籾摺り", "色彩選別", "袋詰め", "等級検査", "出荷", "売上記録"].includes(name)) return "6 調製・出荷";
    return "7 その他";
  }

  RiceOS.schema = {
    SCHEMA_VERSION,
    APP_VERSION,
    STORE_KEY,
    BACKUP_KEY,
    RELEASE_BACKUPS_KEY,
    RELEASE_BACKUP_LIMIT,
    LEGACY_STORES,
    DEFAULT_VARIETIES,
    DEFAULT_FIELD_GROUPS,
    DEFAULT_FIELDS,
    FIELD_WORK_NAMES,
    OTHER_WORK_NAMES,
    MATERIAL_CATEGORIES,
    GROWTH_LEVELS,
    LEAF_COLOR_LEVELS,
    WATER_LEVELS,
    WORKERS,
    SCHEDULE_TYPES,
    DRY_SURFACE_LEVELS,
    DRY_GAS_LEVELS,
    IRRIGATION_STATUS,
    WATER_PERIOD_STATUS,
    IRRIGATION_TYPES,
    MACHINE_CATEGORIES,
    leafColorLabel,
    leafColorScoreFromText,
    normalize,
    validCropYear,
    cropYearClosureTime,
    normalizeCropYearClosures,
    normalizeMachine,
    TRACTOR_WORK_TYPES,
    TRACTOR_SETTING_FIELDS,
    normalizeTractorProfile,
    WORK_TIMING_REASONS,
    normalizeScheduleSnapshot,
    normalizeTimingReview,
    normalizeTractorSnapshot,
    TRANSPLANTER_SETTING_FIELDS,
    normalizeTransplanterProfile,
    normalizeTransplanterSnapshot,
    normalizeHarvestReview,
    normalizeHarvestTiming,
    normalizeHarvestTimingThermal,
    normalizeHarvestWeather,
    normalizeMaintenanceRecord,
    normalizeShipment,
    normalizeMillingRecord,
    normalizeShipmentIssue,
    normalizeHarvestYearReview,
    normalizeShipmentPrice,
    normalizeGroupLabel,
    normalizeSeasonNote,
    emptyData,
    phase
  };
})();
