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
  appVersion: "20260820_ver254",
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

const groupMigration = S.normalize({
  varieties: oldData.varieties,
  fields: [
    { fieldId: "group_field_a", name: "亀石 左上", varietyId: "variety_test", fieldGroupId: "亀石" },
    { fieldId: "group_field_b", name: "亀石 左下", varietyId: "variety_test", fieldGroupId: "亀石グループ" },
    { fieldId: "group_field_c", name: "試験田", varietyId: "variety_test", fieldGroupId: "" }
  ],
  fieldWorks: [{ workId: "group_batch_work", date: "2026-06-01", fieldIds: ["group_field_a", "group_field_b"], batchFieldIds: ["group_field_a", "group_field_b"], batchId: "group_batch" }]
});
const kameishiGroup = groupMigration.fieldGroups.find((group) => group.name === "亀石");
assert(kameishiGroup, "亀石グループのマスター移行に失敗した");
assert(groupMigration.fields.filter((field) => ["group_field_a", "group_field_b"].includes(field.fieldId)).every((field) => field.fieldGroupId === kameishiGroup.fieldGroupId), "亀石と亀石グループを同じマスターへ統合できない");
assert(groupMigration.fields.find((field) => field.fieldId === "group_field_c").fieldGroupId === "", "未設定圃場を勝手にグループへ所属させた");
assert(JSON.stringify(groupMigration.fieldWorks[0].fieldIds) === JSON.stringify(["group_field_a", "group_field_b"]), "グループ移行で作業対象圃場が変わった");
assert(groupMigration.fieldWorks[0].batchId === "group_batch", "グループ移行で一括作業のbatchIdが変わった");
assert(JSON.stringify(S.normalize(groupMigration).fieldGroups) === JSON.stringify(groupMigration.fieldGroups), "圃場グループ移行が冪等ではない");
const legacySeasonNote = legacyNotesData.fields.find((field) => field.fieldId === "field_legacy_notes").seasonNotes[0];
assert(legacySeasonNote.noteId === "legacy_note_2025", "legacy season note id was not preserved");
assert(legacySeasonNote.fieldId === "field_legacy_notes" && legacySeasonNote.season === 2025, "legacy season note was not normalized by field and year");
assert(legacySeasonNote.text === "legacy carryover" && legacySeasonNote.createdAt && legacySeasonNote.updatedAt, "legacy season note text or timestamps were not normalized");
const mismatchedSeasonData = S.normalize({
  varieties: oldData.varieties,
  fields: [{ fieldId: "field_mismatched_note", name: "mismatched note", varietyId: "variety_test", seasonNotes: [{ date: "2025-08-01", season: 2026, text: "must follow date" }] }]
});
assert(mismatchedSeasonData.fields[0].seasonNotes[0].season === 2025, "imported season note did not follow its date year");
const mismatchedGrowthSeasonData = S.normalize({
  varieties: oldData.varieties,
  fields: [{ fieldId: "field_mismatched_growth", name: "mismatched growth", varietyId: "variety_test" }],
  growthLogs: [{
    logId: "growth_mismatched_season",
    date: "2025-07-10",
    season: 2026,
    fieldId: "field_mismatched_growth",
    panicleLengthMm: "20",
    headingObserved: true,
    observedStage: "heading",
    stageConfirmed: true
  }]
});
const mismatchedGrowth = mismatchedGrowthSeasonData.growthLogs[0];
assert(mismatchedGrowth.season === 2025, "imported growth log did not follow its date year");
assert(mismatchedGrowth.logId === "growth_mismatched_season" && mismatchedGrowth.panicleLengthMm === "20" && mismatchedGrowth.headingObserved, "growth migration lost panicle or heading evidence");

memory.set(S.STORE_KEY, JSON.stringify(oldData));

load("assets/js/core/storage.js");
load("assets/js/core/state.js");
load("assets/js/core/agro.js");

const state = global.RiceOS.state;
const storage = global.RiceOS.storage;
const agro = global.RiceOS.agro;

assert(state.field("field_a"), "旧JSONの圃場を読み込めない");
assert(memory.get(S.BACKUP_KEY), "スキーマ移行前の自動退避が作成されていない");
const releaseBackups = storage.releaseBackupInfo();
assert(releaseBackups.length === 1, "更新前の世代バックアップが作成されていない");
assert(releaseBackups[0].sourceVersion === "20260820_ver254", "世代バックアップの更新前バージョンが正しくない");
assert(state.data().appVersion === S.APP_VERSION, "更新後データにアプリバージョンが記録されていない");
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
const beforeInvalidGrowthBatch = state.data().growthLogs.length;
assert(state.saveGrowthLogsBatch([
  { date: "2026-06-06", fieldId: "field_a", panicleLengthMm: "2" },
  { date: "2026-06-06", fieldId: "亀石グループ", panicleLengthMm: "2" }
], "invalid group growth") === null, "グループ名だけの生育ログを保存できてしまう");
assert(state.data().growthLogs.length === beforeInvalidGrowthBatch, "不正な一括生育ログで一部の圃場だけ保存された");
assert(state.saveGrowthLogsBatch([
  { date: "2026-06-06", fieldId: "field_a", panicleLengthMm: "2" },
  { date: "2026-06-06", fieldId: "field_a", panicleLengthMm: "2" }
], "duplicate group growth") === null, "重複した圃場IDの一括生育ログを保存できてしまう");
assert(state.data().growthLogs.length === beforeInvalidGrowthBatch, "重複した一括生育ログで件数が増えた");
state.updateField("field_b", { status: "終了" });
assert(state.saveGrowthLogsBatch([
  { date: "2026-06-06", fieldId: "field_b", panicleLengthMm: "2" }
], "archived growth") === null, "終了した圃場へ生育ログを保存できてしまう");
assert(state.data().growthLogs.length === beforeInvalidGrowthBatch, "終了圃場への生育ログで件数が増えた");
state.updateField("field_b", { status: "使用中" });

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
const panicleLayerBefore = JSON.stringify(state.data().growthLogs);
assert(panicleObserved.fieldStage && panicleObserved.fieldStage.current && panicleObserved.fieldStage.current.key === "panicleInitiation", "現場ステージ層が幼穂の実測を保持できない");
assert(panicleObserved.fieldStage.evidence === "実測", "幼穂実測を現地判断や推定として混同している");
assert(panicleObserved.outlookStage && panicleObserved.outlookStage.certainty === "推定", "見通しステージ層が分離されていない");
assert(JSON.stringify(state.data().growthLogs) === panicleLayerBefore, "ホーム用ステージ層の導出が生育記録を変更した");
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
  hours: "1",
  legacyWaterRecord: true
});
state.saveFieldWork({
  date: "2026-06-05",
  fieldIds: ["field_a"],
  workName: "中干し開始",
  hours: "1",
  legacyWaterRecord: true
});
state.saveFieldWork({
  date: "2025-07-15",
  fieldIds: ["field_a"],
  workName: "出穂確認",
  hours: "1"
});
const headingCountBeforeDuplicate = state.growthLogsFor("field_a", 2026).filter((row) => row.headingObserved).length;
assert(state.saveGrowthLog({
  date: "2026-07-03",
  fieldId: "field_a",
  headingObserved: true,
  observedStage: "heading",
  stageConfirmed: true
}) === null, "同年の出穂確認を重複保存できてしまう");
assert(state.growthLogsFor("field_a", 2026).filter((row) => row.headingObserved).length === headingCountBeforeDuplicate, "重複出穂確認の拒否で既存記録が変化した");
state.saveGrowthLog({
  date: "2025-06-20",
  fieldId: "field_a",
  panicleLengthMm: "1",
  observedStage: "panicle",
  stageConfirmed: true
});
state.saveGrowthLog({
  date: "2026-06-26",
  fieldId: "field_a",
  panicleLengthMm: "8",
  observedStage: "panicle",
  stageConfirmed: true
});
state.saveGrowthLog({
  date: "2026-07-10",
  fieldId: "field_a",
  observedStage: "heading",
  stageConfirmed: false
});
const growthBeforeSummary = JSON.stringify(state.data().growthLogs);
const growth2025 = state.growthSummaryFor("field_a", 2025);
const growth2026ThroughJune = state.growthSummaryFor("field_a", 2026, { asOfDate: "2026-06-30" });
const growth2026 = state.growthSummaryFor("field_a", 2026);
assert(growth2025.panicleLog && growth2025.panicleLog.date === "2025-06-20", "growth summary leaked a panicle record from another year");
assert(growth2025.headingDate === "" && growth2025.headingSource === "", "a work label became a biological heading-date anchor");
assert(growth2026ThroughJune.panicleLog && growth2026ThroughJune.panicleLog.date === "2026-06-26", "growth summary did not use the latest panicle record in its year");
assert(growth2026ThroughJune.headingDate === "", "growth summary included a future heading record");
assert(growth2026.headingDate === "2026-07-06", "growth summary did not keep the existing confirmed heading evidence after rejecting a duplicate");
growth2026.panicleLog.panicleLengthMm = "999";
assert(state.growthLogsFor("field_a", 2026).some((row) => row.date === "2026-06-26" && row.panicleLengthMm === "8"), "growth summary exposed a mutable saved growth log");
assert(JSON.stringify(state.data().growthLogs) === growthBeforeSummary, "growth summary mutated saved growth logs");
state.saveGrowthLog({
  date: "2026-07-10",
  fieldId: "field_b",
  observedStage: "heading",
  stageConfirmed: false
});
const unconfirmedHeading = state.growthSummaryFor("field_b", 2026);
assert(unconfirmedHeading.headingDate === "" && unconfirmedHeading.confirmedHeading === null, "unconfirmed heading was treated as a confirmed heading record");
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
  workName: "中干し終了",
  legacyWaterRecord: true
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

// Water periods are resolved read-only from both dedicated water records and
// older work records. The resolver must not migrate, delete, or duplicate data.
state.saveFieldWork({ workId: "water_legacy_intermit_start", date: "2026-08-01", fieldIds: ["field_a"], workName: "間断灌水開始", legacyWaterRecord: true });
state.saveFieldWork({ workId: "water_legacy_intermit_end", date: "2026-08-04", fieldIds: ["field_a"], workName: "間断灌水終了", legacyWaterRecord: true });
state.saveFieldWork({ workId: "water_duplicate_direct", date: "2026-06-12", fieldIds: ["field_b"], workName: "間断灌水開始", legacyWaterRecord: true });
state.saveFieldWork({ workId: "water_mixed_deep_end", date: "2026-07-04", fieldIds: ["field_b"], workName: "深水管理終了", legacyWaterRecord: true });
const workCountBeforeBlockedWaterSave = state.data().fieldWorks.length;
assert(state.saveFieldWork({ date: "2026-08-10", fieldIds: ["field_a"], workName: "中干し開始" }) === null, "新しい中干しを通常作業として保存してしまう");
assert(state.data().fieldWorks.length === workCountBeforeBlockedWaterSave, "水管理を通常作業へ追加してしまう");
const waterDataBeforeResolve = JSON.stringify(state.data().irrigations);
const resolvedA2026 = state.resolvedWaterPeriodsFor("field_a", { year: 2026, includePlanned: true });
const resolvedB2026 = state.resolvedWaterPeriodsFor("field_b", { year: 2026, includePlanned: true });
assert(resolvedA2026.some((row) => row.kind === "intermittent" && row.startDate === "2026-08-01" && row.actualEndDate === "2026-08-04" && row.source === "legacy-work"), "作業記録だけの間断灌水期間を復元できない");
assert(resolvedB2026.filter((row) => row.kind === "intermittent" && row.startDate === "2026-06-12").length === 2, "同日の直接記録と作業記録を勝手に統合した");
assert(resolvedB2026.some((row) => row.kind === "deep" && row.startDate === "2026-07-01" && !row.actualEndDate && row.source === "direct"), "直接記録の終了日を作業記録で勝手に補完した");
assert(resolvedB2026.some((row) => row.kind === "deep" && !row.startDate && row.actualEndDate === "2026-07-04" && row.source === "legacy-work"), "作業記録だけの終了事実を残せない");
assert(state.resolvedWaterPeriodsFor("field_b", { year: 2026, includePlanned: true, forDisplay: true }).filter((row) => row.kind === "intermittent" && row.startDate === "2026-06-12").length === 2, "新旧の水管理記録が削除不能な一枚に統合されている");
assert(JSON.stringify(state.data().irrigations) === waterDataBeforeResolve, "水管理の表示解決で保存済みデータが書き換わった");
const duplicateLegacy = state.legacyWaterReviewFor("field_b", { year: 2026 })
  .find((row) => row.sourceWorkIds.includes("water_duplicate_direct"));
const irrigationCountBeforeAdopt = state.data().irrigations.length;
const adoptedDuplicate = state.adoptLegacyWaterPeriod("field_b", duplicateLegacy.legacyKey);
assert(adoptedDuplicate && adoptedDuplicate.id === "intermittent_field_b_2026_01", "同じ水管理期間を既存の直接記録へ関連付けできない");
assert(state.data().irrigations.length === irrigationCountBeforeAdopt, "旧作業の取り込みで同じ水管理期間を複製した");
assert(state.data().irrigations.find((row) => row.irrigationId === adoptedDuplicate.id).referenceRecordIds.includes("water_duplicate_direct"), "旧作業との参照関係を残せない");
assert(!state.resolvedWaterPeriodsFor("field_a", { year: 2025 }).some((row) => row.startDate === "2026-08-01"), "水管理の表示解決で年度をまたいだ");
state.deleteFieldWork("water_legacy_intermit_start");
assert(!state.resolvedWaterPeriodsFor("field_a", { year: 2026, includePlanned: true }).some((row) => row.sourceWorkIds && row.sourceWorkIds.includes("water_legacy_intermit_start")), "旧作業由来の水管理を削除できない");

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
assert(state.headingDateForField("field_a", 2025) === "", "a heading work label was treated as an observation in its year");
assert(state.headingDateForField("field_a", 2026) === "2026-07-06", "heading lookup did not retain the edited confirmed growth evidence");
assert(state.dryPeriodsFor("field_a", 2025).every((row) => String(row.date).startsWith("2025-")), "year-scoped drying lookup leaked another year");
assert(state.irrigationsFor("field_a", 2026).every((row) => String(row.date).startsWith("2026-")), "year-scoped intermittent irrigation lookup leaked another year");
assert(agro.managementStatus(state.field("field_a"), "2025-06-10").key === "overlap", "重なった水管理記録を一方的に現在地へ決めている");
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

const legacyWaterStart = { workId: "work_legacy_water_start", date: "2026-06-20", fieldIds: ["field_a"], workName: "\u4e2d\u5e72\u3057\u958b\u59cb" };
const legacyWaterEnd = { workId: "work_legacy_water_end", date: "2026-06-27", fieldIds: ["field_a"], workName: "\u4e2d\u5e72\u3057\u5b8c\u4e86" };
assert(state.save({ ...state.data(), fieldWorks: [...state.data().fieldWorks, legacyWaterStart, legacyWaterEnd] }, "legacy water seed"), "legacy water test seed failed");
const legacyReview = state.legacyWaterReviewFor("field_a", { year: "2026" }).find((row) => row.kind === "dry" && row.sourceWorkIds.includes("work_legacy_water_start"));
assert(legacyReview && !legacyReview.migrated, "legacy water review did not expose an unlinked work period");
const directBeforeImport = state.data().dryPeriods.length;
const importedWaterId = state.importLegacyWaterPeriod("field_a", legacyReview.legacyKey);
assert(importedWaterId, "legacy water import did not create or link a direct period");
assert(state.data().dryPeriods.length === directBeforeImport + 1, "legacy water import did not add exactly one direct period");
assert(state.data().dryPeriods.some((row) => row.dryPeriodId === importedWaterId && row.fieldId === "field_a"), "legacy water import lost the target field");
assert(state.legacyWaterReviewFor("field_a", { year: "2026" }).some((row) => row.legacyKey === legacyReview.legacyKey && row.migrated), "legacy water import did not preserve the migration link");
assert(!state.resolvedWaterPeriodsFor("field_a", { year: "2026" }).some((row) => row.source === "legacy-work" && row.legacyKey === legacyReview.legacyKey), "migrated legacy water period still appears as a duplicate");
assert(state.importLegacyWaterPeriod("field_a", legacyReview.legacyKey) === null, "legacy water import must be idempotent");
assert(state.deleteDryPeriod(importedWaterId), "linked direct water period could not be deleted");
assert(state.legacyWaterReviewFor("field_a", { year: "2026" }).some((row) => row.legacyKey === legacyReview.legacyKey && !row.migrated), "deleting direct water did not restore the legacy review row");
assert(state.waterEventForWorkName("\u4e2d\u5e72\u3057\u958b\u59cb\u4e88\u5b9a") === null, "planned water work must not become an actual period");
assert(state.waterEventForWorkName("\u6df1\u6c34\u78ba\u8a8d") === null, "water confirmation must not become an actual period");
assert(state.waterEventForWorkName("\u6df1\u6c34") === null, "ambiguous deep-water work must not become an actual period");
state.saveFieldWork({ workId: "work_legacy_deep", date: "2026-08-01", fieldIds: ["field_a"], workName: "\u6df1\u6c34\u7ba1\u7406", legacyWaterRecord: true });
const deepLegacyReview = state.legacyWaterReviewFor("field_a", { year: "2026" }).find((row) => row.kind === "deep" && row.sourceWorkIds.includes("work_legacy_deep"));
assert(deepLegacyReview, "legacy deep-water work must remain available for reconciliation");
assert(!state.resolvedWaterPeriodsFor("field_a", { year: "2026" }).some((row) => row.legacyKey === deepLegacyReview.legacyKey), "unreviewed legacy water work must not affect current water status");
const adoptedDeep = state.adoptLegacyWaterPeriod("field_a", deepLegacyReview.legacyKey);
assert(adoptedDeep && adoptedDeep.id, "incomplete legacy water work must create an editable direct draft");
assert(state.data().irrigations.some((row) => row.irrigationId === adoptedDeep.id && row.method === "\u6df1\u6c34\u7ba1\u7406"), "adopted deep-water draft must preserve its water type");
assert(state.isMigratedWaterWork(state.data().fieldWorks.find((row) => row.workId === "work_legacy_deep")), "adopted legacy work must be marked to avoid duplicate work-list display");
state.saveFieldWork({ workId: "work_legacy_group_water", date: "2026-08-05", fieldIds: ["field_a", "field_b"], workName: "\u6df1\u6c34\u7ba1\u7406", legacyWaterRecord: true });
const groupLegacyReview = state.legacyWaterReviewFor("field_a", { year: "2026" }).find((row) => row.sourceWorkIds.includes("work_legacy_group_water"));
assert(state.adoptLegacyWaterPeriod("field_a", groupLegacyReview.legacyKey), "one field in a legacy group work can be adopted safely");
const groupLegacyWork = state.data().fieldWorks.find((row) => row.workId === "work_legacy_group_water");
assert(state.isMigratedWaterWork(groupLegacyWork, "field_a"), "adopted field must be marked as migrated");
assert(!state.isMigratedWaterWork(groupLegacyWork, "field_b"), "unadopted group field must remain independently reviewable");
assert(!state.isMigratedWaterWork(groupLegacyWork), "partially adopted group work must remain visible outside a field-specific view");
state.saveFieldWork({ workId: "work_legacy_drain", date: "2026-09-10", fieldIds: ["field_a"], workName: "\u843d\u6c34", legacyWaterRecord: true });
assert(state.legacyWaterReviewFor("field_a", { year: "2026" }).some((row) => row.kind === "drain" && row.sourceWorkIds.includes("work_legacy_drain")), "legacy drainage work must remain available for reconciliation");

const machineId = state.saveMachine({ name: "SR75", category: "\u30b3\u30f3\u30d0\u30a4\u30f3", maker: "\u30af\u30dc\u30bf", model: "SR75", meterHours: "812" });
assert(machineId && state.machine(machineId).name === "SR75", "machine master could not be saved");
const maintenanceId = state.saveMaintenanceRecord({ machineId, date: "2026-08-17", item: "\u30a8\u30f3\u30b8\u30f3\u30aa\u30a4\u30eb", meterHours: "812", parts: "\u30aa\u30a4\u30eb" });
assert(maintenanceId && state.maintenanceRecordsFor(machineId).length === 1, "maintenance record could not be saved");
state.saveMaintenanceRecord({ machineId, date: "2026-07-01", item: "\u904e\u53bb\u70b9\u691c", meterHours: "700" });
assert(state.machine(machineId).meterHours === "812", "older maintenance input rolled back the current meter hours");
assert(state.retireMachine(machineId), "machine could not be retired");
const maintenanceCountBeforeRetiredAdd = state.maintenanceRecordsFor(machineId).length;
assert(state.saveMaintenanceRecord({ machineId, date: "2026-08-18", item: "\u8aa4\u5165\u529b" }) === "", "a retired machine accepted a new maintenance record");
assert(state.maintenanceRecordsFor(machineId).length === maintenanceCountBeforeRetiredAdd, "retired machine changed maintenance history");
assert(S.normalize(JSON.parse(JSON.stringify(state.data()))).maintenanceRecords.length === state.data().maintenanceRecords.length, "maintenance history was lost during JSON normalization");

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
