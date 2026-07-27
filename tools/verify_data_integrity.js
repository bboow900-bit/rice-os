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
const legacyNotesData = S.normalize({
  varieties: oldData.varieties,
  fields: [{
    fieldId: "field_legacy_notes",
    name: "legacy notes",
    varietyId: "variety_test",
    seasonNotes: [{ id: "legacy_note_2025", date: "2025-09-20", memo: "legacy carryover" }]
  }]
});
const legacySeasonNote = legacyNotesData.fields.find((field) => field.fieldId === "field_legacy_notes").seasonNotes[0];
assert(legacySeasonNote.noteId === "legacy_note_2025", "legacy season note id was not preserved");
assert(legacySeasonNote.fieldId === "field_legacy_notes" && legacySeasonNote.season === 2025, "legacy season note was not normalized by field and year");
assert(legacySeasonNote.text === "legacy carryover" && legacySeasonNote.createdAt && legacySeasonNote.updatedAt, "legacy season note text or timestamps were not normalized");
const mismatchedSeasonData = S.normalize({
  varieties: oldData.varieties,
  fields: [{ fieldId: "field_mismatched_note", name: "mismatched note", varietyId: "variety_test", seasonNotes: [{ date: "2025-08-01", season: 2026, text: "must follow date" }] }]
});
assert(mismatchedSeasonData.fields[0].seasonNotes[0].season === 2025, "imported season note did not follow its date year");

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

const beforeGrowthBatch = state.data().growthLogs.length;
assert(state.saveGrowthLogsBatch([
  { logId: "growth_group_a", date: "2026-06-05", fieldId: "field_a", panicleLengthMm: "1", observedStage: "panicle", stageConfirmed: true },
  { logId: "growth_group_b", date: "2026-06-05", fieldId: "field_b", panicleLengthMm: "1", observedStage: "panicle", stageConfirmed: true }
], "group growth") !== null, "グループ生育記録を一括保存できない");
assert(state.data().growthLogs.length === beforeGrowthBatch + 2, "グループ生育記録の件数が一致しない");
assert(["field_a", "field_b"].every((fieldId) => state.data().growthLogs.some((row) => row.logId === `growth_group_${fieldId.slice(-1)}` && row.fieldId === fieldId)), "グループ生育記録が圃場別に保存されていない");

state.updateField("field_a", { nextSeasonMemo: "keep this carryover" });
const carryoverBeforeSeasonNotes = state.field("field_a").nextSeasonMemo;
const currentSeasonNoteId = state.saveSeasonNote({
  fieldId: "field_a",
  date: "2026-08-01",
  text: "confirm next season timing"
});
assert(currentSeasonNoteId, "season note could not be saved");
assert(state.seasonNotesForField("field_a", 2026).some((note) => note.noteId === currentSeasonNoteId), "current-year season note was not found");
assert(!state.seasonNotesForField("field_a", 2025).some((note) => note.noteId === currentSeasonNoteId), "current-year season note leaked into a prior year");
assert(state.saveSeasonNote({ fieldId: "field_a", season: 2026, date: "2025-08-01", text: "must be rejected" }) === "", "season note accepted a date from a different year");
const reimportedSeasonNotes = S.normalize(JSON.parse(JSON.stringify(state.data()))).fields
  .find((field) => field.fieldId === "field_a").seasonNotes;
assert(reimportedSeasonNotes.some((note) => note.noteId === currentSeasonNoteId), "season note was lost by JSON export and import normalization");
assert(state.deleteSeasonNote(currentSeasonNoteId, "field_b") === null, "a different field could delete this season note");
assert(state.seasonNotesForField("field_a", 2026).some((note) => note.noteId === currentSeasonNoteId), "wrong-field deletion removed a season note");
assert(state.deleteSeasonNote(currentSeasonNoteId, "field_a"), "season note could not be deleted from its field");
assert(!state.seasonNotesForField("field_a", 2026).some((note) => note.noteId === currentSeasonNoteId), "deleted season note remained in the current year");
assert(state.field("field_a").nextSeasonMemo === carryoverBeforeSeasonNotes, "season note changes altered next-season carryover memo");

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
const panicleObserved = agro.seasonStageForField("field_a", "2026-06-25");
assert(panicleObserved.current && panicleObserved.current.key === "panicleInitiation", "幼穂長から幼穂形成期を導出できない");
assert(panicleObserved.certainty === "確定", "幼穂長の記録日が確定ステージとして扱われていない");
const panicleStage = agro.seasonStageForField("field_a", "2026-08-05");
assert(panicleStage.current && panicleStage.index >= panicleObserved.index, "幼穂長後の推定ステージが後退した");
assert(panicleStage.certainty === "推定", "幼穂長後の日数推定が表示されていない");
assert(panicleStage.current.key !== "heading" || panicleStage.certainty === "推定", "幼穂長だけで出穂実績が確定した");
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

state.saveFieldWork({
  date: "2025-05-10",
  fieldIds: ["field_a"],
  workName: "田植え",
  hours: "1"
});
state.saveFieldWork({
  date: "2026-05-20",
  fieldIds: ["field_a"],
  workName: "田植え",
  hours: "1"
});
state.saveFieldWork({
  date: "2025-06-01",
  fieldIds: ["field_a"],
  workName: "中干し開始",
  hours: "1"
});
state.saveFieldWork({
  date: "2026-06-05",
  fieldIds: ["field_a"],
  workName: "中干し開始",
  hours: "1"
});
state.saveFieldWork({
  date: "2025-07-15",
  fieldIds: ["field_a"],
  workName: "出穂確認",
  hours: "1"
});
state.saveGrowthLog({
  date: "2026-07-03",
  fieldId: "field_a",
  observedStage: "heading",
  stageConfirmed: true
});
state.saveDryPeriod({
  date: "2025-06-02",
  fieldId: "field_a",
  startDate: "2025-06-02",
  actualEndDate: "2025-06-08",
  status: "完了"
});
state.saveDryPeriod({
  date: "2026-06-06",
  fieldId: "field_a",
  startDate: "2026-06-06",
  status: "進行中"
});
// Completing drying must not invent a new water-management period. Each
// management type is recorded explicitly so the saved facts stay auditable.
state.saveIrrigation({
  date: "2025-06-09",
  fieldId: "field_b",
  method: "間断灌水",
  startDate: "2025-06-09"
});
state.saveDryPeriod({
  date: "2026-06-06",
  fieldId: "field_b",
  startDate: "2026-06-06",
  actualEndDate: "2026-06-11"
});
assert(!state.irrigationsFor("field_b", 2026)
  .some((row) => row.autoStartedFromDry && row.autoStartedFromDrySource), "drying completion unexpectedly started intermittent irrigation");
assert(!state.irrigationsFor("field_b", 2026).some((row) => String(row.date).startsWith("2025-")), "prior-year intermittent irrigation leaked into the current year");
assert(state.irrigationsFor("field_b", 2025).some((row) => String(row.date).startsWith("2025-")), "prior-year intermittent irrigation record was unexpectedly removed");

state.saveIrrigationsBatch([{
  irrigationId: "intermittent_field_b_2026_01",
  date: "2026-06-12",
  fieldId: "field_b",
  method: "間断灌水",
  startDate: "2026-06-12"
}, {
  irrigationId: "drain_field_b_2026_01",
  date: "2026-09-10",
  fieldId: "field_b",
  method: "稲刈り前の落水",
  startDate: "2026-09-10"
}], "independent water periods");
assert(state.irrigationsFor("field_b", 2026).some((row) => row.method === "間断灌水" && row.irrigationId === "intermittent_field_b_2026_01"), "manual intermittent irrigation was not retained");
assert(state.irrigationsFor("field_b", 2026).some((row) => row.method === "稲刈り前の落水" && row.irrigationId === "drain_field_b_2026_01"), "pre-harvest drainage was not retained as an independent period");

state.saveIrrigation({
  irrigationId: "legacy_auto_intermit_field_a",
  date: "2026-06-15",
  fieldId: "field_a",
  method: "間断灌水",
  startDate: "2026-06-15",
  autoStartedFromDry: true,
  autoStartedFromDrySource: "work:legacy_dry_end"
});
state.saveFieldWork({
  workId: "dry_end_manual_work",
  date: "2026-06-16",
  fieldIds: ["field_a"],
  workName: "中干し終了"
});
assert(!state.irrigationsFor("field_a", 2026).some((row) => row.autoStartedFromDrySource === "work:dry_end_manual_work"), "drying-end work unexpectedly created intermittent irrigation");
state.deleteFieldWork("dry_end_manual_work");
assert(state.irrigationsFor("field_a", 2026).some((row) => row.irrigationId === "legacy_auto_intermit_field_a"), "deleting a drying-end work removed a legacy automatic irrigation record");

const intermittentStartBeforeDeep = state.field("field_b").intermittentStartDate;
assert(state.saveIrrigationsBatch([{
  irrigationId: "deep_water_field_b",
  date: "2026-07-01",
  fieldId: "field_b",
  method: "深水管理",
  startDate: "2026-07-01",
  targetDepthCm: "10",
  observedDepthCm: "8"
}], "deep water") !== null, "深水管理を一括保存できない");
const deepWater = state.irrigationsFor("field_b", 2026).find((row) => row.irrigationId === "deep_water_field_b");
assert(deepWater && deepWater.method === "深水管理" && deepWater.targetDepthCm === "10", "深水管理の追加項目が保存されていない");
assert(state.field("field_b").intermittentStartDate === intermittentStartBeforeDeep, "深水管理が間断灌水の開始日キャッシュを上書きした");

state.saveIrrigation({
  date: "2025-06-09",
  fieldId: "field_a",
  method: "間断灌水",
  startDate: "2025-06-09"
});
state.saveIrrigation({
  date: "2026-06-12",
  fieldId: "field_a",
  method: "間断灌水",
  startDate: "2026-06-12"
});
assert(state.plantingDateForField("field_a") === "2025-05-10", "yearless planting lookup changed");
assert(state.plantingDateForField("field_a", 2026) === "2026-05-15", "year-scoped planting lookup leaked another year");
assert(global.RiceOS.utils.daysAfterPlanting(state.field("field_a"), "2026-05-25") === 10, "DAP used a planting date from another year");
assert(state.workDateForField("field_a", "中干し開始", "last", 2025) === "2025-06-01", "year-scoped work lookup leaked another year");
assert(state.headingDateForField("field_a", 2025) === "2025-07-15", "heading work was not found in its year");
assert(state.headingDateForField("field_a", 2026) === "2026-07-03", "heading lookup did not include confirmed growth evidence");
assert(state.dryPeriodsFor("field_a", 2025).every((row) => String(row.date).startsWith("2025-")), "year-scoped drying lookup leaked another year");
assert(state.irrigationsFor("field_a", 2026).every((row) => String(row.date).startsWith("2026-")), "year-scoped intermittent irrigation lookup leaked another year");
assert(agro.managementStatus(state.field("field_a"), "2025-06-10").key === "intermittent", "中干し完了後の間断灌水が管理状況へ反映されない");
assert(agro.managementStatus(state.field("field_a"), "2026-06-10").key === "drying", "management status leaked a different year");

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
const quarantined = S.normalize(brokenPayload);
const quarantinedGrowth = quarantined.growthLogs.find((row) => row.logId === "growth_broken_reference");
assert(quarantinedGrowth && quarantinedGrowth.fieldId === "" && quarantinedGrowth.orphanedFieldId === "field_missing", "参照切れの生育記録が隔離されず別圃場へ移った");
const crossYearWater = S.normalize({
  varieties: oldData.varieties,
  fields: oldData.fields,
  dryPeriods: [{ dryPeriodId: "dry_cross_year", fieldId: "field_a", date: "2026-01-03", startDate: "2025-12-28" }],
  irrigations: [{ irrigationId: "irrigation_cross_year", fieldId: "field_a", date: "2026-01-03", startDate: "2025-12-29", method: "間断灌水" }]
});
assert(crossYearWater.dryPeriods[0].date === "2025-12-28" && crossYearWater.dryPeriods[0].season === 2025, "中干しの年度が開始日に基づかない");
assert(crossYearWater.irrigations[0].date === "2025-12-29" && crossYearWater.irrigations[0].season === 2025, "間断灌水の年度が開始日に基づかない");
const mergedNotes = storage.mergeData(
  S.normalize({ varieties: oldData.varieties, fields: [{ fieldId: "field_a", name: "A", varietyId: "variety_test", seasonNotes: [{ noteId: "note_current", date: "2026-09-01", text: "current" }] }] }),
  S.normalize({ varieties: oldData.varieties, fields: [{ fieldId: "field_a", name: "A", varietyId: "variety_test", seasonNotes: [{ noteId: "note_imported", date: "2026-09-02", text: "imported" }] }] })
).data;
assert(mergedNotes.fields.find((field) => field.fieldId === "field_a").seasonNotes.some((note) => note.noteId === "note_imported"), "同一圃場のJSON統合でseasonNotesが失われた");
state.saveSchedule({ scheduleId: "schedule_edit_check", date: "2026-07-20", fieldIds: ["field_b"], scheduleType: "追肥", title: "追肥予定" });
state.saveFieldWork({ workId: "work_schedule_edit", date: "2026-07-20", fieldIds: ["field_b"], workName: "追肥", sourceScheduleId: "schedule_edit_check" });
assert(state.data().schedules.find((row) => row.scheduleId === "schedule_edit_check").status === "実施済み", "予定に紐づく作業で完了にならない");
state.saveFieldWork({ workId: "work_schedule_edit", date: "2026-07-20", fieldIds: ["field_b"], workName: "草刈り" });
assert(state.data().schedules.find((row) => row.scheduleId === "schedule_edit_check").status === "予定", "作業編集後も予定が誤って実施済みのまま");
const invalidCollectionInspection = storage.inspectJsonText(JSON.stringify({ ...brokenPayload, fields: {} }), state.data());
assert(!invalidCollectionInspection.ok, "配列ではないコレクションを正常扱いした");
assert(invalidCollectionInspection.errors.some((error) => error.includes("fields は配列ではありません")), "配列形式エラーを説明できない");
const roundTrip = S.normalize(JSON.parse(json));
const afterRoundTrip = storage.info(roundTrip);
["fields", "fieldWorks", "growthLogs", "dryPeriods", "irrigations"].forEach((key) => {
  assert(beforeRoundTrip[key] === afterRoundTrip[key], `JSON往復で${key}件数が変わった`);
});
assert(storage.loadData().fieldWorks.length === state.data().fieldWorks.length, "再起動相当の読み込みで記録が消えた");

const failureEvents = [];
const failureAlerts = [];
const originalDispatchEvent = global.dispatchEvent;
const originalAlert = global.alert;
const originalSaveData = storage.saveData;
const originalReplaceData = storage.replaceData;
const beforeSaveFailure = state.data();
const beforeSaveFailureRaw = memory.get(S.STORE_KEY);
global.dispatchEvent = (event) => {
  failureEvents.push(event);
  return true;
};
global.alert = (message) => failureAlerts.push(message);
storage.saveData = () => {
  throw new Error("simulated save failure");
};
storage.replaceData = () => {
  throw new Error("simulated replace failure");
};
try {
  assert(state.save({ ...beforeSaveFailure }, "must not emit") === null, "save failure must return null");
  assert(state.replace({ ...beforeSaveFailure }, "must not emit") === null, "replace failure must return null");
  assert(state.mutate((draft) => {
    draft.fields[0].name = "must not persist";
  }, "must not emit") === null, "mutate failure must return null");
  assert(state.updateField("field_a", { name: "must not persist" }) === null, "record update failure must return null");
  assert(state.addField("must not persist") === "", "new record failure must not return an unsaved ID");
  assert(state.lastSaveError() instanceof Error, "save failure must retain an error");
  assert(state.data() === beforeSaveFailure, "save failure must preserve the in-memory cache");
  assert(memory.get(S.STORE_KEY) === beforeSaveFailureRaw, "save failure must preserve localStorage");
  assert(failureEvents.length === 0, "save failure must not emit a datachange event");
  assert(failureAlerts.length === 5, "save failure must remain visible to the user");
} finally {
  storage.saveData = originalSaveData;
  storage.replaceData = originalReplaceData;
  global.dispatchEvent = originalDispatchEvent;
  global.alert = originalAlert;
}

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
