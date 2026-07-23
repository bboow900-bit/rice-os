"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const memory = new Map();

global.window = global;
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} }
};
Object.defineProperty(global, "navigator", { value: {}, configurable: true });
global.alert = () => {};
global.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }
};
global.dispatchEvent = () => true;
global.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};

function load(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInThisContext(source, { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("assets/js/core/utils.js");
load("assets/js/core/schema.js");

const S = global.RiceOS.schema;
const oldData = {
  schemaVersion: 7,
  varieties: [{ varietyId: "variety_test", name: "試験品種" }],
  fields: [
    { fieldId: "field_a", name: "旧名A", varietyId: "variety_test", areaA: 20, fieldGroupId: "旧グループ" },
    { fieldId: "field_b", name: "圃場B", varietyId: "variety_test", areaA: 15, fieldGroupId: "旧グループ" }
  ],
  fieldWorks: [{
    workId: "work_planting",
    date: "2026-05-15",
    season: 2026,
    fieldIds: ["field_a"],
    workName: "田植え",
    hours: "1"
  }],
  growthLogs: [],
  dryPeriods: [],
  irrigations: [],
  schedules: [],
  otherWorks: [],
  materials: [],
  varietyResults: []
};
memory.set(S.STORE_KEY, JSON.stringify(oldData));

load("assets/js/core/storage.js");
load("assets/js/core/state.js");
load("assets/js/core/agro.js");

const state = global.RiceOS.state;
const storage = global.RiceOS.storage;
const agro = global.RiceOS.agro;

assert(state.field("field_a"), "旧JSONの圃場を読み込めない");
assert(memory.get(S.BACKUP_KEY), "スキーマ移行前の自動退避が作成されていない");
assert(state.fieldWorksFor("field_a").some((row) => row.workId === "work_planting"), "旧作業と圃場IDの関連が消えた");

state.updateField("field_a", { name: "新名A" });
assert(state.fieldWorksFor("field_a").some((row) => row.workId === "work_planting"), "圃場名変更で過去作業が消えた");

state.saveFieldWork({
  date: "2026-06-01",
  fieldIds: ["field_a", "field_b"],
  workName: "草刈り",
  worker: "自分",
  hours: "2"
});
const batchWork = state.data().fieldWorks.find((row) => row.workName === "草刈り");
assert(batchWork && batchWork.batchId, "一括作業にbatchIdがない");
assert(batchWork.totalHours === "2", "一括作業の全体時間が変わった");
assert(Number(batchWork.fieldAllocatedHours.field_a) === 1 && Number(batchWork.fieldAllocatedHours.field_b) === 1, "圃場別配賦時間が正しくない");
const frozenTargets = JSON.stringify(batchWork.batchFieldIds);
state.updateField("field_b", { fieldGroupId: "別グループ" });
assert(JSON.stringify(batchWork.batchFieldIds) === frozenTargets, "グループ変更で過去の一括対象が変わった");

state.saveGrowthLog({
  date: "2026-06-10",
  fieldId: "field_a",
  tillerCount: "18",
  observedStage: "tillering",
  stageConfirmed: true
});
const stageBeforeWater = agro.seasonStageForField("field_a", "2026-06-15");
state.saveDryPeriod({
  date: "2026-06-15",
  fieldId: "field_a",
  startDate: "2026-06-15",
  endDate: "2026-06-22",
  status: "実施中"
});
state.saveIrrigation({
  date: "2026-06-23",
  fieldId: "field_a",
  method: "間断灌水",
  startDate: "2026-06-23",
  status: "入水中"
});
const stageAfterWater = agro.seasonStageForField("field_a", "2026-06-24");
assert(stageBeforeWater.index === stageAfterWater.index, "水管理記録だけで生育ステージが進んだ");

const koshihikari = state.varieties().find((row) => String(row.name).includes("コシヒカリ"));
assert(koshihikari, "コシヒカリ初期レシピがない");
state.updateField("field_a", { varietyId: koshihikari.varietyId });
state.saveGrowthLog({
  date: "2026-06-25",
  fieldId: "field_a",
  panicleLengthMm: "2",
  observedStage: "panicle",
  stageConfirmed: false
});
const panicleStage = agro.seasonStageForField("field_a", "2026-06-26");
assert(panicleStage.current && panicleStage.current.key === "panicle", "幼穂長から幼穂ステージを導出できない");
assert(panicleStage.current.key !== "heading", "幼穂長だけで出穂実績が確定した");
const prediction = state.data().confirmationCandidates.find((row) => row.candidateType === "heading" && row.fieldId === "field_a");
assert(prediction && prediction.status === "active", "出穂確認目安の履歴が保存されていない");

state.saveGrowthLog({
  date: "2026-07-05",
  fieldId: "field_a",
  headingObserved: true,
  observedStage: "heading",
  stageConfirmed: true
});
const headingLog = state.growthLogsFor("field_a").find((row) => row.headingObserved);
const confirmedPrediction = state.data().confirmationCandidates.find((row) => row.candidateId === prediction.candidateId);
assert(confirmedPrediction && confirmedPrediction.status === "confirmed", "実績登録後に予測履歴が残っていない");
assert(confirmedPrediction.actualRecordId === headingLog.logId, "予測と出穂実績が関連付いていない");
const previousDifference = confirmedPrediction.actualDifferenceDays;
state.saveGrowthLog({ ...headingLog, date: "2026-07-06" });
const correctedPrediction = state.data().confirmationCandidates.find((row) => row.candidateId === prediction.candidateId);
assert(correctedPrediction.actualDifferenceDays !== previousDifference, "出穂日修正後に予測差が再計算されていない");

state.saveFieldWork({
  date: "2026-07-07",
  fieldIds: ["field_a"],
  workName: "防除",
  hours: "1",
  weather: "",
  weatherAuto: null
});
assert(state.data().fieldWorks.some((row) => row.date === "2026-07-07" && row.workName === "防除"), "天気なしで作業を保存できない");

const beforeRoundTrip = storage.info(state.data());
const json = JSON.stringify(state.data());
const inspection = storage.inspectJsonText(json, state.data());
assert(inspection.ok, "JSON再検査に失敗した");
const brokenPayload = JSON.parse(json);
brokenPayload.growthLogs.push({
  logId: "growth_broken_reference",
  date: "2026-07-08",
  fieldId: "field_missing"
});
const brokenInspection = storage.inspectJsonText(JSON.stringify(brokenPayload), state.data());
assert(
  brokenInspection.warnings.some((warning) => warning.includes("参照先のない圃場ID")),
  "インポート前検査で元JSONの参照切れを検出できない"
);
const invalidCollectionInspection = storage.inspectJsonText(JSON.stringify({ ...brokenPayload, fields: {} }), state.data());
assert(!invalidCollectionInspection.ok, "配列ではないコレクションを正常扱いした");
assert(invalidCollectionInspection.errors.some((error) => error.includes("fields は配列ではありません")), "配列形式エラーを説明できない");
const roundTrip = S.normalize(JSON.parse(json));
const afterRoundTrip = storage.info(roundTrip);
["fields", "fieldWorks", "growthLogs", "dryPeriods", "irrigations"].forEach((key) => {
  assert(beforeRoundTrip[key] === afterRoundTrip[key], `JSON往復で${key}件数が変わった`);
});
assert(storage.loadData().fieldWorks.length === state.data().fieldWorks.length, "再起動相当の読み込みで記録が消えた");

console.log("PASS data integrity");
console.log(JSON.stringify({
  schemaVersion: S.SCHEMA_VERSION,
  fields: beforeRoundTrip.fields,
  fieldWorks: beforeRoundTrip.fieldWorks,
  growthLogs: beforeRoundTrip.growthLogs,
  dryPeriods: beforeRoundTrip.dryPeriods,
  irrigations: beforeRoundTrip.irrigations,
  confirmationCandidates: state.data().confirmationCandidates.length
}, null, 2));
