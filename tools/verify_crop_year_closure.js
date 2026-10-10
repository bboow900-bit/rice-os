"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const memory = new Map(); let writes = 0, fail = false;
const c = vm.createContext({ console, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k,v) { if (fail) throw Error("failure"); writes++; memory.set(k,String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
for (const name of ["utils", "schema", "storage", "state"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", name + ".js"), "utf8"), c);
const R = c.RiceOS, S = R.state, U = R.utils;
U.today = () => "2026-10-09"; U.now = () => "2026-10-09T00:00:00Z";
const raw = () => JSON.stringify([S.data(), [...memory], writes]);
function reset(extra = {}) {
  assert(S.replace(R.schema.normalize({ fields: [{ fieldId: "a" }],
    fieldWorks: [{ workId: "old", date: "2026-09-01", fieldIds: ["a"], workName: "草刈り" }],
    schedules: [{ scheduleId: "old-plan", date: "2026-09-01", season: 2026, fieldIds: ["a"], title: "草刈り" }],
    otherWorks: [{ otherWorkId: "old-other", date: "2026-09-01" }],
    shipments: [{ shipmentId: "ship", date: "2026-10-01", season: 2026, kind: "gift", recipient: "friend" }],
    meta: { customMeta: { keep: true } }, ...extra })));
}
function rejected(fn) { const before = raw(); assert.equal(fn(), null); assert.equal(raw(), before); }
reset(); const initial = raw();
assert.equal(S.defaultCropYear("2025-12-01"), 2025); assert.equal(S.defaultShipmentCropYear("2027-01-01"), 2027);
assert.equal(S.cropYearForRecord({ cropYear: 2027, season: 2026 }), 2027);
assert.equal(S.cropYearForRecord({ season: 2025, date: "2026-01-01" }), 2025);
assert.equal(S.cropYearClosureFor(2026).shipmentsCount, 1); assert.equal(raw(), initial);
const sourceRecords = JSON.stringify([S.data().fieldWorks, S.data().otherWorks, S.data().schedules, S.data().shipments]);
assert(S.closeCropYear(2026, { switchToNext: true }));
assert.equal(S.cropYearClosureFor(2026).closed, true); assert.equal(S.defaultCropYear("2026-12-01"), 2027);
assert.equal(S.defaultShipmentCropYear("2027-01-01"), 2026);
assert.equal(JSON.stringify([S.data().fieldWorks, S.data().otherWorks, S.data().schedules, S.data().shipments]), sourceRecords);
let stable = raw(); assert(S.closeCropYear(2026, { switchToNext: true })); assert.equal(raw(), stable);
assert(S.setActiveCropYear(2028)); stable = raw(); assert(S.closeCropYear(2026, { switchToNext: true })); assert.equal(raw(), stable);
assert(S.reopenCropYear(2026)); assert.equal(S.defaultCropYear(), 2028); assert.equal(S.cropYearClosureFor(2026).history.length, 2);
stable = raw(); assert(S.reopenCropYear(2026)); assert.equal(raw(), stable);
assert(S.closeCropYear(2026, { switchToNext: true })); assert.equal(S.defaultCropYear(), 2027);
assert(S.saveFieldWork({ workId: "new", date: "2026-10-09", fieldIds: ["a"], workName: "耕起", material: "test", amount: "10" }));
let record = S.data().fieldWorks.find(row => row.workId === "new"); assert.equal(record.cropYear, 2027); assert.equal(record.season, 2026);
assert(S.saveFieldWork({ ...record, memo: "edit" })); assert.equal(S.data().fieldWorks.find(row => row.workId === "new").cropYear, 2027);
assert(S.saveFieldWork({ workId: "old", date: "2026-09-01", fieldIds: ["a"], workName: "草刈り", memo: "old edit" }));
assert.equal(Object.hasOwn(S.data().fieldWorks.find(row => row.workId === "old"), "cropYear"), false);
assert(S.saveOtherWork({ otherWorkId: "old-other", date: "2026-09-01", memo: "edit" }));
assert.equal(Object.hasOwn(S.data().otherWorks[0], "cropYear"), false);
assert(S.saveSchedule({ ...S.data().schedules[0], memo: "edit" })); assert.equal(Object.hasOwn(S.data().schedules[0], "cropYear"), false);
assert(S.saveFieldWork({ workId: "linked", date: "2026-09-01", fieldIds: ["a"], workName: "草刈り", sourceScheduleId: "old-plan" }));
assert.equal(S.data().fieldWorks.find(row => row.workId === "linked").cropYear, 2026);
assert(S.saveSchedule({ scheduleId: "future", date: "2026-10-10", fieldIds: ["a"], title: "耕起", cropYear: 2028 }));
assert(S.saveFieldWork({ workId: "linked-new", date: "2026-10-10", fieldIds: ["a"], workName: "耕起", sourceScheduleId: "future" }));
assert.equal(S.data().fieldWorks.find(row => row.workId === "linked-new").cropYear, 2028);
assert(S.saveFieldWork({ workId: "explicit", date: "2026-10-09", fieldIds: ["a"], workName: "耕起", cropYear: 2025, sourceScheduleId: "future" }));
assert.equal(S.data().fieldWorks.find(row => row.workId === "explicit").cropYear, 2025);
const beforeSetter = JSON.parse(JSON.stringify(S.data().fieldWorks.find(row => row.workId === "linked-new")));
assert(S.setRecordCropYear("fieldWork", "linked-new", 2029));
const afterSetter = JSON.parse(JSON.stringify(S.data().fieldWorks.find(row => row.workId === "linked-new"))); delete beforeSetter.cropYear; delete afterSetter.cropYear;
assert.deepEqual(afterSetter, beforeSetter);
assert(S.materialUsageForYear(2026).some(row => row.name === "test"));
assert(!S.materialUsageForYear(2026, { cropYear: true }).some(row => row.name === "test"));
assert(S.materialUsageForYear(2027, { cropYear: true }).some(row => row.name === "test"));
for (const year of ["", null, 1899, 2201, "2027.0", " 2027 ", NaN]) {
  rejected(() => S.setActiveCropYear(year)); rejected(() => S.closeCropYear(year));
  rejected(() => S.saveFieldWork({ date: "2026-10-09", fieldIds: ["a"], workName: "耕起", cropYear: year }));
  rejected(() => S.saveOtherWork({ date: "2026-10-09", cropYear: year }));
  rejected(() => S.saveSchedule({ date: "2026-10-09", fieldIds: ["a"], cropYear: year }));
}
const closedRead = S.cropYearClosureFor(2026); closedRead.history[0].action = "mutated"; assert.equal(S.cropYearClosureFor(2026).closed, true);
const json = JSON.stringify(S.data()); assert(S.replace(JSON.parse(json))); assert.equal(JSON.stringify(S.data()), json);
assert.equal(S.data().meta.customMeta.keep, true);
reset({ shipments: [] }); rejected(() => S.closeCropYear(2026, { switchToNext: true }));
reset(); fail = true; rejected(() => S.closeCropYear(2026, { switchToNext: true })); fail = false;
assert(S.closeCropYear(2026, { switchToNext: true }));
fail = true; rejected(() => S.reopenCropYear(2026)); rejected(() => S.setActiveCropYear(2028)); fail = false;
reset({ shipments: [{ shipmentId: "limit", season: 2200 }] }); rejected(() => S.closeCropYear(2200, { switchToNext: true }));
assert(S.closeCropYear(2200)); rejected(() => S.closeCropYear(2200, { switchToNext: true }));
reset(); assert(S.closeCropYear(2026, { switchToNext: true }));
assert(S.saveShipment({ shipmentId: "late", date: "2027-01-01", season: 2026, kind: "gift", recipient: "friend", riceType: "brown", packages: [{ kg: 30, bags: 1 }] }));
assert.equal(S.cropYearClosureFor(2026).shipmentsCount, 2);
assert(S.saveFieldWork({ workId: "harvest", date: "2027-09-01", fieldIds: ["a"], workName: "稲刈り", harvestStatusByField: { a: "complete" } }));
assert.equal(S.defaultShipmentCropYear("2027-08-31"), 2026); assert.equal(S.defaultShipmentCropYear("2027-09-01"), 2027);
assert.equal(Object.hasOwn(R.schema.normalize({ fieldWorks: [{ workId: "old", date: "2026-01-01" }] }).fieldWorks[0], "cropYear"), false);
reset(); assert(S.setActiveCropYear(2027));
assert(S.saveFertilizerCompletion({ scheduleId: "old-plan", date: "2026-09-01", fertilizerRateKg10a: "10" }));
const fertilizer = S.data().fieldWorks.find(row => row.sourceScheduleId === "old-plan");
assert.equal(fertilizer.cropYear, 2026); assert.equal(fertilizer.season, 2026);
const noAction = raw(); S.cropYearClosureFor(2026); S.defaultCropYear(); S.defaultShipmentCropYear("2027-01-01"); assert.equal(raw(), noAction);
reset();
assert(S.saveFieldWork({ workId: "crop-harvest", date: "2026-09-10", cropYear: 2027, fieldIds: ["a"], workName: "稲刈り", harvestStatusByField: { a: "complete" } }));
const beforeHarvestRead = raw();
assert.equal(S.harvestStatusForField("a", 2026, U.today()).status, "complete");
assert.equal(S.harvestStatusForField("a", 2027, U.today()).status, "none");
assert.equal(S.harvestStatusForField("a", 2026, U.today(), { cropYear: true }).status, "none");
assert.equal(S.harvestStatusForField("a", 2027, U.today(), { cropYear: true }).status, "complete");
assert.equal(S.harvestStatusForField("a", 2027, "2026-09-09", { cropYear: true }).status, "none");
assert.equal(raw(), beforeHarvestRead);
reset({ fieldWorks: [{ workId: "legacy-harvest", date: "2026-09-10", season: 2025, fieldIds: ["a"], workName: "稲刈り" }] });
assert.equal(S.harvestStatusForField("a", 2026, U.today(), { cropYear: true }).status, "legacy");
assert.equal(S.harvestStatusForField("a", 2025, U.today(), { cropYear: true }).status, "none");
assert.equal(JSON.stringify(S.harvestStatusForField("a", 2026, U.today(), { cropYear: true })), JSON.stringify(S.harvestStatusForField("a", 2026, U.today())));
reset({ fieldWorks: [{ workId: "legacy", date: "2026-09-01", season: 2024, fieldIds: ["a"], workName: "草刈り" }],
  otherWorks: [{ otherWorkId: "legacy-other", date: "2026-09-01", season: 2024 }],
  schedules: [{ scheduleId: "legacy-plan", date: "2026-09-01", season: 2024, fieldIds: ["a"], title: "草刈り" }] });
assert(S.saveFieldWork({ ...S.data().fieldWorks[0], memo: "memo edit" }));
assert(S.saveOtherWork({ ...S.data().otherWorks[0], memo: "memo edit" }));
assert(S.saveSchedule({ ...S.data().schedules[0], memo: "memo edit" }));
for (const item of [S.data().fieldWorks[0], S.data().otherWorks[0], S.data().schedules[0]]) {
  assert.equal(item.season, 2024); assert.equal(S.cropYearForRecord(item), 2024); assert.equal(Object.hasOwn(item, "cropYear"), false);
}
assert(S.saveFieldWork({ ...S.data().fieldWorks[0], cropYear: 2027 })); assert.equal(S.data().fieldWorks[0].season, 2026);
assert(S.saveOtherWork({ ...S.data().otherWorks[0], date: "2025-09-01" })); assert.equal(S.data().otherWorks[0].season, 2025);
assert(S.saveSchedule({ ...S.data().schedules[0], cropYear: 2027 })); assert.equal(S.data().schedules[0].season, 2026);
reset({ fieldWorks: [
  { workId: "prep", date: "2026-10-01", cropYear: 2027, fieldIds: ["a"], workName: "耕起" },
  { workId: "heading", date: "2026-08-01", cropYear: 2027, fieldIds: ["a"], workName: "出穂確認" },
  { workId: "legacy", date: "2026-09-01", season: 2024, fieldIds: ["a"], workName: "草刈り" }
], otherWorks: [{ otherWorkId: "crop-other", date: "2026-10-01", cropYear: 2027, relatedFieldIds: ["a"] },
  { otherWorkId: "legacy-other", date: "2026-10-01", season: 2024, relatedFieldIds: ["a"] }],
  growthLogs: [{ logId: "growth", fieldId: "a", date: "2026-08-01", headingObserved: true }],
  dryPeriods: [{ dryPeriodId: "dry", fieldId: "a", date: "2026-07-01", startDate: "2026-07-01" }] });
const timelineBefore = raw();
let timeline = S.timelineEntriesForField("a", { year: 2027, cropYear: true, includePlanned: false });
assert(timeline.works.some(row => row.workId === "prep")); assert(timeline.headingWorks.some(row => row.workId === "heading"));
assert(timeline.others.some(row => row.otherWorkId === "crop-other"));
assert.equal(timeline.growth.length, 0); assert.equal(timeline.waterPeriods.length, 0);
timeline = S.timelineEntriesForField("a", { year: 2026, cropYear: true });
assert(!timeline.works.some(row => row.workId === "prep")); assert.equal(timeline.growth.length, 1); assert.equal(timeline.waterPeriods.length, 1);
timeline = S.timelineEntriesForField("a", { year: 2026 }); assert(timeline.works.some(row => row.workId === "prep"));
timeline = S.timelineEntriesForField("a", { year: 2024, cropYear: true });
assert(timeline.works.some(row => row.workId === "legacy")); assert(timeline.others.some(row => row.otherWorkId === "legacy-other"));
assert.equal(S.timelineEntriesForField("a", { year: "all", cropYear: true }).works.length, 3);
assert.equal(raw(), timelineBefore);
const closedEvent = { action: "closed", at: "2026-10-05T00:00:00Z", switchToNext: true };
const reopenedEvent = { action: "reopened", at: "2026-10-08T00:00:00Z" };
reset({ meta: { activeCropYear: 2028, customMeta: { keep: true }, cropYearClosures: [
  { year: 2026, closedAt: closedEvent.at, reopenedAt: reopenedEvent.at, history: [closedEvent, reopenedEvent] }
] } });
const current = JSON.parse(JSON.stringify(S.data()));
const incoming = R.schema.normalize({ fieldWorks: [{ ...current.fieldWorks[0], memo: "must not overwrite" }],
  meta: { activeCropYear: 2027, cropYearClosures: [
    { year: 2025, closedAt: "2025-10-01T00:00:00Z", history: [{ action: "closed", at: "2025-10-01T00:00:00Z" }] },
    { year: 2026, history: [{ action: "closed", at: "2026-10-01T00:00:00Z" }, closedEvent,
      { action: "closed", at: "2026-02-30T00:00:00Z" }, { action: "unknown", at: U.now() }, {}, null] }
  ] } });
const mergeBefore = JSON.stringify([current, incoming, S.data(), [...memory], writes]);
let merged = R.storage.mergeData(current, incoming).data;
assert.equal(JSON.stringify([current, incoming, S.data(), [...memory], writes]), mergeBefore);
assert.equal(merged.meta.activeCropYear, 2028); assert.equal(merged.meta.customMeta.keep, true);
assert.equal(merged.fieldWorks[0].memo, current.fieldWorks[0].memo);
let merged2026 = merged.meta.cropYearClosures.find(row => row.year === 2026);
assert.equal(merged.meta.cropYearClosures.length, 2); assert.equal(merged2026.history.length, 3);
assert.equal(merged2026.history.at(-1).action, "reopened"); assert.equal(merged2026.reopenedAt, reopenedEvent.at);
const newer = JSON.parse(JSON.stringify(incoming));
newer.meta.cropYearClosures.find(row => row.year === 2026).history.push({ action: "closed", at: "2026-10-09T00:00:00Z", switchToNext: false });
merged = R.storage.mergeData(current, newer).data; merged2026 = merged.meta.cropYearClosures.find(row => row.year === 2026);
assert.equal(merged2026.history.at(-1).action, "closed"); assert.equal(merged2026.closedAt, U.now()); assert.equal(merged2026.reopenedAt, "");
assert.equal(merged.meta.activeCropYear, 2028);
assert.equal(JSON.stringify(R.storage.mergeData(merged, newer).data.meta.cropYearClosures), JSON.stringify(merged.meta.cropYearClosures));
const noActive = JSON.parse(JSON.stringify(current)); delete noActive.meta.activeCropYear;
assert.equal(R.storage.mergeData(noActive, incoming).data.meta.activeCropYear, 2027);
assert.equal(R.storage.mergeData({ meta: { cropYearClosures: { year: 2026 } } }, {}).data.meta.cropYearClosures.length, 0);
assert(S.replace(merged)); assert.equal(S.cropYearClosureFor(2026).closed, true); assert.equal(S.cropYearClosureFor(2025).closed, true);
const sameAt = U.now();
const threeEvents = [{ action: "closed", at: sameAt }, { action: "reopened", at: sameAt }, { action: "closed", at: sameAt }];
reset({ meta: { cropYearClosures: [{ year: 2026, history: threeEvents }, { year: 2025, history: [] }] } });
assert.equal(S.cropYearClosureFor(2026).closed, true); assert.equal(S.cropYearClosureFor(2026).history.length, 3);
const threeCurrent = JSON.parse(JSON.stringify(S.data()));
const beforeEmpty = raw();
const emptyMerge = R.storage.mergeData(threeCurrent, {}).data;
assert.equal(raw(), beforeEmpty);
assert.equal(JSON.stringify(emptyMerge.meta.cropYearClosures), JSON.stringify(threeCurrent.meta.cropYearClosures));
const sameMerge = R.storage.mergeData(threeCurrent, threeCurrent).data;
assert.equal(JSON.stringify(sameMerge.meta.cropYearClosures), JSON.stringify(threeCurrent.meta.cropYearClosures));
assert.equal(JSON.stringify(R.storage.mergeData(sameMerge, threeCurrent).data.meta.cropYearClosures), JSON.stringify(sameMerge.meta.cropYearClosures));
assert(S.replace(sameMerge)); assert.equal(S.cropYearClosureFor(2026).closed, true);
const prefix = JSON.parse(JSON.stringify(threeCurrent)); prefix.meta.cropYearClosures[0].history = threeEvents.slice(0, 2);
const extended = R.storage.mergeData(prefix, threeCurrent).data;
assert.equal(extended.meta.cropYearClosures[0].history.length, 3); assert.equal(extended.meta.cropYearClosures[0].history.at(-1).action, "closed");
for (const malformed of [null, false, "bad", { year: 2026 }]) {
  reset({ meta: { cropYearClosures: malformed } });
  assert(Array.isArray(S.data().meta.cropYearClosures)); assert.equal(S.data().meta.cropYearClosures.length, 0);
  const safeRead = raw(); assert.equal(S.cropYearClosureFor(2026).closed, false); S.defaultShipmentCropYear("2027-01-01"); assert.equal(raw(), safeRead);
}
reset({ meta: { cropYearClosures: [{ year: 2026, closedAt: sameAt, history: [threeEvents[0], {}, null,
  { action: "closed", at: "2026-02-30T00:00:00Z" }, { action: "reopened", at: "2026-10-09T24:00:00Z" }, { action: "unknown", at: sameAt }] }] } });
assert.equal(S.cropYearClosureFor(2026).closed, true); assert.equal(S.cropYearClosureFor(2026).history.length, 1);
reset({ meta: { cropYearClosures: [{ year: 2026, closedAt: "bad", history: [{ action: "closed", at: "bad" }] }] } });
assert.equal(S.cropYearClosureFor(2026).closed, false);
S.data().meta.cropYearClosures = { year: 2026 }; const malformedRead = raw();
assert.equal(S.cropYearClosureFor(2026).closed, false); S.defaultShipmentCropYear("2027-01-01"); assert.equal(raw(), malformedRead);
console.log("crop year closure: PASS");
