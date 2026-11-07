(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils;
  const state = R.state;
  const methods = Object.freeze([{ value: "conventional", label: "慣行" }, { value: "dense", label: "密苗" }].map(Object.freeze));
  const media = Object.freeze([{ value: "soil", label: "培土" }, { value: "mat", label: "マット" }].map(Object.freeze));
  const fields = Object.freeze([
    { key: "germinatedSeedGPerTray", label: "催芽籾の播種量", unit: "g/箱", type: "number" },
    { key: "bedThicknessCm", label: "床土の厚さ", unit: "cm", type: "number" },
    { key: "coverThicknessCm", label: "覆土の厚さ", unit: "cm", type: "number" },
    { key: "rimGapCm", label: "覆土後の箱の縁からの隙間", unit: "cm", type: "number" },
    { key: "bedWeightKg", label: "床土の重さ", unit: "kg/箱", type: "number", optional: true },
    { key: "coverWeightKg", label: "覆土の重さ", unit: "kg/箱", type: "number", optional: true },
    { key: "boxDepthCm", label: "育苗箱の深さ", unit: "cm", type: "number", optional: true },
    { key: "boxType", label: "育苗箱の種類", unit: "", type: "text", optional: true },
    { key: "dial", label: "播種量ダイヤル", unit: "", type: "text" },
    { key: "speed", label: "送り速度・変速", unit: "", type: "text" },
    { key: "watering", label: "灌水設定", unit: "", type: "text" },
    { key: "calibrationG", label: "調整時に量った催芽籾", unit: "g", type: "number", optional: true },
    { key: "trays", label: "調整時の箱数", unit: "箱", type: "number", integer: true, optional: true }
  ].map(Object.freeze));
  let error = "";
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const text = value => value == null ? "" : String(value);
  function rows(data = state.data()) {
    const value = data.meta && data.meta.seederProfiles;
    if (value === undefined) return [];
    const seen = new Set();
    if (!Array.isArray(value) || value.some(row => !object(row) || typeof row.profileId !== "string" || !row.profileId || seen.has(row.profileId) || (seen.add(row.profileId), false))) throw Error("播種機設定の保存形式を確認してください。元のデータは変更していません。");
    return value;
  }
  function validYear(value) { return ["string", "number"].includes(typeof value) && /^\d{4}$/.test(String(value)) && Number(value) >= 1900 && Number(value) <= 2200; }
  function numeric(value, field) {
    if (value == null || typeof value === "string" && !value.trim()) return "";
    const n = ["string", "number"].includes(typeof value) ? Number(value) : NaN;
    if (!Number.isFinite(n) || n < 0 || field.integer && !Number.isSafeInteger(n)) throw Error(`${field.label}は0以上の${field.integer ? "整数" : "数値"}で入力してください。`);
    return n;
  }
  function normalize(input, previous) {
    const merged = { ...previous, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) };
    const method = ({ "慣行": "conventional", "密苗": "dense" })[merged.method] || merged.method;
    const medium = ({ "培土": "soil", "マット": "mat" })[merged.medium] || merged.medium;
    if (!validYear(merged.cropYear) || !text(merged.name).trim() || !methods.some(row => row.value === method) || !media.some(row => row.value === medium)) throw Error("年度・機械名・播種方法・育苗床を確認してください。");
    const result = { ...merged, profileId: previous ? previous.profileId : U.id("seeder-profile", U.today()), cropYear: Number(merged.cropYear), name: text(merged.name).trim(), model: text(merged.model), method, medium, intent: text(merged.intent), memo: text(merged.memo), createdAt: previous ? previous.createdAt || U.now() : U.now(), updatedAt: previous ? previous.updatedAt || U.now() : U.now() };
    fields.forEach(field => { result[field.key] = field.type === "number" ? numeric(merged[field.key], field) : text(merged[field.key]); });
    for (const key of ["varietyId", "materialId", "matMaterialId"]) {
      result[key] = text(merged[key]);
      const collection = key === "varietyId" ? state.data().varieties : state.data().materials;
      const idKey = key === "varietyId" ? "varietyId" : "materialId";
      if (result[key] && !collection.some(row => row[idKey] === result[key]) && !(previous && previous[key] === result[key])) throw Error("選択した品種・資材が見つかりません。");
    }
    return result;
  }
  function profilesFor(filters = {}) {
    return U.clone(rows().filter(row => ["cropYear", "method", "medium", "varietyId"].every(key => filters[key] === undefined || row[key] === (key === "cropYear" ? Number(filters[key]) : filters[key]))));
  }
  function saveProfile(input) {
    try {
      if (!object(input)) throw Error("保存する設定を確認してください。");
      const previous = rows().find(row => row.profileId === input.profileId);
      if (input.profileId && !previous) throw Error("編集対象の設定が見つかりません。");
      const row = normalize(input, previous);
      if (previous && JSON.stringify(previous) === JSON.stringify(row)) { error = ""; return U.clone(previous); }
      row.updatedAt = U.now();
      const saved = state.mutate(data => {
        const collection = rows(data);
        const index = collection.findIndex(item => item.profileId === row.profileId);
        if (index < 0) collection.push(row); else collection[index] = row;
        data.meta = data.meta || {}; data.meta.seederProfiles = collection;
      }, "播種機設定を保存しました");
      if (!saved) { error = "保存できませんでした。入力内容は保持しています。"; return null; }
      error = "";
      return U.clone(saved.meta.seederProfiles.find(item => item.profileId === row.profileId));
    } catch (failure) { error = failure.message; return null; }
  }
  function copyProfile(id, cropYear) {
    try {
      const row = rows().find(item => item.profileId === id);
      if (!row || !validYear(cropYear)) throw Error("複製元とコピー先年度を確認してください。");
      const copy = { ...U.clone(row), cropYear: Number(cropYear), copiedFromProfileId: row.profileId };
      delete copy.profileId; delete copy.createdAt; delete copy.updatedAt;
      return saveProfile(copy);
    } catch (failure) { error = failure.message; return null; }
  }
  function referenced(value, id) {
    if (!value || typeof value !== "object") return false;
    if (value.seederProfileId === id || value.profileId === id || [value.seederProfileIds, value.profileIds].some(ids => Array.isArray(ids) && ids.includes(id))) return true;
    return Object.values(value).some(child => referenced(child, id));
  }
  function deleteProfile(id) {
    try {
      if (!rows().some(row => row.profileId === id)) throw Error("削除対象の設定が見つかりません。");
      const data = state.data(), other = { ...data, meta: { ...data.meta } };
      delete other.meta.seederProfiles;
      if (rows().some(row => row.profileId !== id && row.copiedFromProfileId === id) || referenced(other, id)) throw Error("履歴で参照されている設定は削除できません。");
      const saved = state.mutate(d => { d.meta.seederProfiles = rows(d).filter(row => row.profileId !== id); }, "播種機設定を削除しました");
      error = saved ? "" : "削除できませんでした。保存内容は変更していません。";
      return saved;
    } catch (failure) { error = failure.message; return null; }
  }
  function snapshot(id) {
    const row = rows().find(item => item.profileId === id);
    return row ? U.clone({ ...row, capturedAt: U.now() }) : null;
  }
  R.seederSettings = Object.freeze({ methods, media, fields, profilesFor, saveProfile, copyProfile, deleteProfile, snapshot, lastError: () => error });
})();
