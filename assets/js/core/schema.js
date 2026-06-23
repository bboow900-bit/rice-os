(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  const SCHEMA_VERSION = 8;
  const STORE_KEY = "rice_os_v8_stable";
  const BACKUP_KEY = "rice_os_v8_stable_backup";
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
    transplanterSetting: "",
    baseFertilizerName: "",
    baseFertilizerNpk: "",
    baseFertilizerAmount: "",
    boxTreatment: "",
    initialHerbicide: "",
    initialInsecticide: "",
    midHerbicide: "",
    midHerbicideTiming: "",
    topDressingName: "",
    topDressingAmount: "",
    topDressingTiming: "",
    pestControlPlan: "",
    memo: ""
  };

  const DEFAULT_FIELD_FIELDS = {
    fieldId: "",
    name: "",
    varietyId: "",
    areaA: 0,
    plantingDate: "",
    drainageStartDate: "",
    drainageTargetDays: "7",
    intermittentStartDate: "",
    intermittentIntervalDays: "3",
    fixedMemo: "",
    memo: "",
    status: "使用中",
    waterHabit: "",
    weedRisk: "",
    sortOrder: 0
  };

  const DEFAULT_VARIETIES = [
    {
      varietyId: "variety_tennotsubu",
      name: "天のつぶ",
      rowSpacing: "30cm",
      plantSpacing: "18cm",
      plantsPerHill: "4本",
      baseFertilizerName: "多収稲専用",
      baseFertilizerNpk: "25-8-8",
      baseFertilizerAmount: "45kg/10a",
      memo: "標準レシピ。圃場ごとの固定メモを優先する。"
    },
    {
      varietyId: "variety_koshihikari",
      name: "コシヒカリ",
      rowSpacing: "30cm",
      plantSpacing: "18cm",
      plantsPerHill: "4本",
      memo: "倒伏と追肥量に注意。"
    }
  ].map((v) => ({ ...DEFAULT_VARIETY_FIELDS, ...v }));

  const DEFAULT_FIELDS = [
    {
      fieldId: "field_kai_pa_ue",
      name: "開パ 上",
      varietyId: "variety_tennotsubu",
      areaA: 20,
      sortOrder: 10
    },
    {
      fieldId: "field_kai_pa_shita",
      name: "開パ 下",
      varietyId: "variety_tennotsubu",
      areaA: 20,
      sortOrder: 20
    },
    {
      fieldId: "field_nashibatake",
      name: "梨畑",
      varietyId: "variety_koshihikari",
      areaA: 32,
      sortOrder: 30
    },
    {
      fieldId: "field_wakudaira",
      name: "和久平",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 40
    },
    {
      fieldId: "field_kameishi_hidariue",
      name: "亀石 左上",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 50
    },
    {
      fieldId: "field_kameishi_hidarishita",
      name: "亀石 左下",
      varietyId: "variety_tennotsubu",
      areaA: 0,
      sortOrder: 60
    },
    {
      fieldId: "field_kameishi_migishita",
      name: "亀石 右下",
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
    "入水",
    "落水",
    "除草剤",
    "草刈り",
    "溝切り",
    "中干し開始",
    "中干し終了",
    "追肥",
    "防除",
    "稲刈り",
    "その他"
  ];

  const OTHER_WORK_NAMES = [
    "種籾注文",
    "塩水選",
    "温湯殺菌",
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

  const MATERIAL_CATEGORIES = ["肥料", "除草剤", "防除", "種籾", "育苗", "燃料", "袋・出荷", "その他"];
  const GROWTH_LEVELS = ["-", "少ない", "普通", "多い", "注意"];
  const LEAF_COLOR_LEVELS = [
    { value: "1", label: "1 薄い", text: "薄い", tone: "bad" },
    { value: "2", label: "2 やや薄い", text: "やや薄い", tone: "warn" },
    { value: "3", label: "3 標準", text: "標準", tone: "ok" },
    { value: "4", label: "4 やや濃い", text: "やや濃い", tone: "info" },
    { value: "5", label: "5 濃い", text: "濃い", tone: "purple" }
  ];
  const WATER_LEVELS = ["-", "浅水", "普通", "深水", "落水", "干し気味", "水不足"];

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

  function normalizeField(input, index, fallbackVarietyId) {
    const f = { ...DEFAULT_FIELD_FIELDS, ...(input || {}) };
    f.fieldId = canonicalId("field", f.fieldId || f.id, f.name || `圃場${index + 1}`);
    f.name = String(f.name || `圃場${index + 1}`);
    f.varietyId = String(f.varietyId || fallbackVarietyId || "");
    f.areaA = U.number(f.areaA, 0);
    f.status = String(f.status || "使用中");
    f.drainageStartDate = String(f.drainageStartDate || "");
    f.drainageTargetDays = String(f.drainageTargetDays || "");
    f.intermittentStartDate = String(f.intermittentStartDate || "");
    f.intermittentIntervalDays = String(f.intermittentIntervalDays || "");
    f.sortOrder = U.number(f.sortOrder, index * 10);
    return f;
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

  function normalizeFieldWork(input) {
    const w = input || {};
    const date = String(w.date || U.today());
    return {
      workId: String(w.workId || w.id || U.id("work", date)),
      type: "fieldWork",
      date,
      season: U.number(w.season, U.season(date)),
      fieldIds: ensureArray(w.fieldIds).length ? ensureArray(w.fieldIds).map(String) : (w.fieldId ? [String(w.fieldId)] : []),
      workName: String(w.workName || w.name || "その他"),
      hours: String(w.hours || ""),
      machine: String(w.machine || ""),
      material: String(w.material || ""),
      amount: String(w.amount || ""),
      weather: String(w.weather || ""),
      weatherAuto: w.weatherAuto && typeof w.weatherAuto === "object" ? w.weatherAuto : null,
      memo: String(w.memo || ""),
      createdAt: String(w.createdAt || U.now()),
      updatedAt: String(w.updatedAt || U.now())
    };
  }

  function normalizeGrowthLog(input) {
    const g = input || {};
    const date = String(g.date || U.today());
    const leafColorScore = String(g.leafColorScore || leafColorScoreFromText(g.leafColor || g.leaf));
    return {
      logId: String(g.logId || g.id || U.id("growth", date)),
      type: "growthLog",
      date,
      season: U.number(g.season, U.season(date)),
      fieldId: String(g.fieldId || ""),
      leafColorScore,
      leafColor: leafColorScore ? leafColorLabel(leafColorScore) : String(g.leafColor || g.leaf || "-"),
      weed: String(g.weed || "-"),
      gas: String(g.gas || "-"),
      water: String(g.water || "-"),
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

  function normalizeMaterial(input) {
    const m = input || {};
    return {
      materialId: String(m.materialId || m.id || U.id("material", U.today())),
      season: U.number(m.season, new Date().getFullYear()),
      category: String(m.category || "その他"),
      name: String(m.name || ""),
      ordered: String(m.ordered || ""),
      used: String(m.used || ""),
      remaining: String(m.remaining || ""),
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
      areaA: String(r.areaA || ""),
      yield: String(r.yield || ""),
      grade: String(r.grade || ""),
      quality: String(r.quality || ""),
      salesAmount: String(r.salesAmount || r.sales || ""),
      reflection: String(r.reflection || ""),
      createdAt: String(r.createdAt || U.now()),
      updatedAt: String(r.updatedAt || U.now())
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

    const fieldIds = new Set(fields.map((f) => f.fieldId));
    fields.forEach((f) => {
      if (!varieties.some((v) => v.varietyId === f.varietyId)) f.varietyId = fallbackVarietyId || "";
    });

    const fieldWorks = dedupeBy([
      ...ensureArray(source.fieldWorks).map(normalizeFieldWork),
      ...convertedWorks
    ], "workId").map((w) => ({
      ...w,
      fieldIds: ensureArray(w.fieldIds).filter((id) => fieldIds.has(id))
    }));

    const growthLogs = dedupeBy([
      ...ensureArray(source.growthLogs).map(normalizeGrowthLog),
      ...convertedGrowth
    ], "logId").map((g) => ({
      ...g,
      fieldId: fieldIds.has(g.fieldId) ? g.fieldId : (fields[0] && fields[0].fieldId) || ""
    }));

    const otherWorks = dedupeBy(ensureArray(source.otherWorks || source.generalWorks).map(normalizeOtherWork), "otherWorkId");
    const materials = dedupeBy(ensureArray(source.materials).map(normalizeMaterial), "materialId");
    const varietyResults = dedupeBy(ensureArray(source.varietyResults).map(normalizeResult), "resultId");

    return {
      schemaVersion: SCHEMA_VERSION,
      varieties,
      fields,
      fieldWorks,
      growthLogs,
      otherWorks,
      materials,
      varietyResults,
      meta: {
        app: "稲作OS Stable",
        createdAt: source.meta && source.meta.createdAt || source.createdAt || U.now(),
        updatedAt: U.now(),
        importedFrom: source.meta && source.meta.importedFrom || source.importedFrom || "",
        lastJsonExportAt: source.meta && source.meta.lastJsonExportAt || "",
        lastNotificationCheck: source.meta && source.meta.lastNotificationCheck || "",
        weatherLocation: source.meta && source.meta.weatherLocation || source.weatherLocation || null
      }
    };
  }

  function emptyData() {
    return normalize({
      varieties: U.clone(DEFAULT_VARIETIES),
      fields: U.clone(DEFAULT_FIELDS),
      fieldWorks: [],
      growthLogs: [],
      otherWorks: [],
      materials: [],
      varietyResults: []
    });
  }

  function phase(workName) {
    const name = String(workName || "");
    if (["種籾注文", "塩水選", "温湯殺菌", "薬剤消毒", "浸種", "催芽", "播種", "育苗管理", "苗箱準備", "育苗土準備"].includes(name)) return "1 種籾・育苗";
    if (["畦塗り・畦管理", "耕起", "基肥・元肥", "代かき"].includes(name)) return "2 田植え前";
    if (["田植え", "補植"].includes(name)) return "3 田植え";
    if (["入水", "落水", "除草剤", "草刈り", "溝切り", "中干し開始", "中干し終了", "追肥", "防除"].includes(name)) return "4 生育管理";
    if (["稲刈り"].includes(name)) return "5 収穫";
    if (["乾燥", "籾摺り", "色彩選別", "袋詰め", "等級検査", "出荷", "売上記録"].includes(name)) return "6 調製・出荷";
    return "7 その他";
  }

  RiceOS.schema = {
    SCHEMA_VERSION,
    STORE_KEY,
    BACKUP_KEY,
    LEGACY_STORES,
    DEFAULT_VARIETIES,
    DEFAULT_FIELDS,
    FIELD_WORK_NAMES,
    OTHER_WORK_NAMES,
    MATERIAL_CATEGORIES,
    GROWTH_LEVELS,
    LEAF_COLOR_LEVELS,
    WATER_LEVELS,
    leafColorLabel,
    leafColorScoreFromText,
    normalize,
    emptyData,
    phase
  };
})();
