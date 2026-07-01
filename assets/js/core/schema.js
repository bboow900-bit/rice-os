(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  const SCHEMA_VERSION = 11;
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
    pestControlPlan: "",
    targetTillers: "18〜22本",
    herbicideDaysAfterPlanting: "7",
    panicleInitiationDaysAfterPlanting: "60",
    headingDaysAfterPlanting: "85",
    headingAccumulatedTempTarget: "",
    panicleAccumulatedTempTarget: "",
    ripeningAccumulatedTempTarget: "",
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
    "間断灌水開始",
    "間断灌水終了",
    "湿潤灌漑開始",
    "湿潤灌漑終了",
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

  const MATERIAL_CATEGORIES = ["種籾", "肥料", "除草剤", "防除剤", "燃料", "米袋", "部品", "その他"];
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
  const IRRIGATION_TYPES = ["間断灌水", "湿潤灌漑"];

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
    f.district = String(f.district || "");
    f.fieldGroupId = String(f.fieldGroupId || "");
    f.varietyId = String(f.varietyId || fallbackVarietyId || "");
    f.areaA = U.number(f.areaA, 0);
    f.seedlingBoxes = String(f.seedlingBoxes || "");
    f.status = String(f.status || "使用中");
    f.drainageStartDate = String(f.drainageStartDate || "");
    f.drainageTargetDays = String(f.drainageTargetDays || "");
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
      worker: String(w.worker || ""),
      hours: String(w.hours || ""),
      machine: String(w.machine || ""),
      material: String(w.material || ""),
      amount: String(w.amount || ""),
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
    return {
      logId: String(g.logId || g.id || U.id("growth", date)),
      type: "growthLog",
      date,
      season: U.number(g.season, U.season(date)),
      fieldId: String(g.fieldId || ""),
      leafCount: String(g.leafCount || ""),
      tillerCount: String(g.tillerCount || ""),
      plantHeightCm: String(g.plantHeightCm || g.plantHeight || ""),
      leafColorScore,
      leafColor: leafColorScore ? leafColorLabel(leafColorScore) : String(g.leafColor || g.leaf || "-"),
      weed: String(g.weed || "-"),
      gas: String(g.gas || "-"),
      water: String(g.water || "-"),
      headingObserved: Boolean(g.headingObserved || g.headingDate || String(g.memo || "").includes("出穂")),
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
      carryover: String(m.carryover || ""),
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
    const date = String(s.date || U.today());
    return {
      scheduleId: String(s.scheduleId || s.id || U.id("schedule", date)),
      type: "schedule",
      date,
      season: U.number(s.season, U.season(date)),
      fieldIds: ensureArray(s.fieldIds).map(String),
      scheduleType: String(s.scheduleType || s.kind || "作業予定"),
      title: String(s.title || s.workName || s.scheduleType || "予定"),
      status: String(s.status || "予定"),
      completedAt: String(s.completedAt || ""),
      completedByWorkId: String(s.completedByWorkId || ""),
      completedManuallyAt: String(s.completedManuallyAt || ""),
      completionReason: String(s.completionReason || ""),
      memo: String(s.memo || ""),
      createdAt: String(s.createdAt || U.now()),
      updatedAt: String(s.updatedAt || U.now())
    };
  }

  function normalizeDryPeriod(input) {
    const d = input || {};
    const date = String(d.date || d.observedDate || d.startDate || U.today());
    return {
      dryPeriodId: String(d.dryPeriodId || d.id || U.id("dry", date)),
      type: "dryPeriod",
      date,
      season: U.number(d.season, U.season(date)),
      fieldId: String(d.fieldId || ""),
      status: String(d.status || (d.actualEndDate ? "完了" : "実施中")),
      startDate: String(d.startDate || d.drainageStartDate || ""),
      endDate: String(d.endDate || d.expectedEndDate || ""),
      actualEndDate: String(d.actualEndDate || ""),
      targetDays: String(d.targetDays || d.drainageTargetDays || ""),
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
    const date = String(i.date || i.startDate || U.today());
    return {
      irrigationId: String(i.irrigationId || i.id || U.id("irrigation", date)),
      type: "irrigation",
      date,
      season: U.number(i.season, U.season(date)),
      fieldId: String(i.fieldId || ""),
      method: String(i.method || i.irrigationType || "間断灌水"),
      periodStatus: String(i.periodStatus || (i.actualEndDate ? "完了" : "実施中")),
      startDate: String(i.startDate || ""),
      endDate: String(i.endDate || ""),
      actualEndDate: String(i.actualEndDate || ""),
      targetDays: String(i.targetDays || ""),
      status: String(i.status || "入水中"),
      memo: String(i.memo || ""),
      createdAt: String(i.createdAt || U.now()),
      updatedAt: String(i.updatedAt || U.now())
    };
  }

  function normalizeShipment(input) {
    const s = input || {};
    const date = String(s.date || U.today());
    return {
      shipmentId: String(s.shipmentId || s.id || U.id("shipment", date)),
      type: "shipment",
      date,
      season: U.number(s.season, U.season(date)),
      varietyId: String(s.varietyId || ""),
      quantity: String(s.quantity || ""),
      amount: String(s.amount || ""),
      memo: String(s.memo || ""),
      createdAt: String(s.createdAt || U.now()),
      updatedAt: String(s.updatedAt || U.now())
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
    const schedules = dedupeBy(ensureArray(source.schedules).map(normalizeSchedule), "scheduleId").map((s) => ({
      ...s,
      fieldIds: ensureArray(s.fieldIds).filter((id) => fieldIds.has(id))
    }));
    const dryPeriods = dedupeBy(ensureArray(source.dryPeriods).map(normalizeDryPeriod), "dryPeriodId").map((d) => ({
      ...d,
      fieldId: fieldIds.has(d.fieldId) ? d.fieldId : (fields[0] && fields[0].fieldId) || ""
    }));
    const irrigations = dedupeBy(ensureArray(source.irrigations).map(normalizeIrrigation), "irrigationId").map((i) => ({
      ...i,
      fieldId: fieldIds.has(i.fieldId) ? i.fieldId : (fields[0] && fields[0].fieldId) || ""
    }));
    const shipments = dedupeBy(ensureArray(source.shipments).map(normalizeShipment), "shipmentId");
    const workers = Array.from(new Set([...WORKERS, ...ensureArray(source.workers).map(String), ...fieldWorks.map((w) => w.worker).filter(Boolean)]));

    return {
      schemaVersion: SCHEMA_VERSION,
      varieties,
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
      photos: ensureArray(source.photos),
      workers,
      meta: {
        app: "稲作カルテ",
        appName: "稲作カルテ",
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
      dryPeriods: [],
      irrigations: [],
      schedules: [],
      otherWorks: [],
      materials: [],
      varietyResults: [],
      shipments: [],
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
    WORKERS,
    SCHEDULE_TYPES,
    DRY_SURFACE_LEVELS,
    DRY_GAS_LEVELS,
    IRRIGATION_STATUS,
    WATER_PERIOD_STATUS,
    IRRIGATION_TYPES,
    leafColorLabel,
    leafColorScoreFromText,
    normalize,
    emptyData,
    phase
  };
})();
