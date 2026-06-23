(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const storage = RiceOS.storage;
  const state = RiceOS.state;

  function sizeLabel(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10}KB`;
    return `${Math.round(bytes / 1024 / 102.4) / 10}MB`;
  }

  function render() {
    const info = storage.info(state.data());
    U.$("dataStatus").innerHTML = [
      ["保存キー", info.storeKey],
      ["使用量", sizeLabel(info.bytes)],
      ["直前バックアップ", info.backupBytes ? sizeLabel(info.backupBytes) : "なし"],
      ["レシピ/圃場", `${info.varieties}/${info.fields}`],
      ["圃場作業", `${info.fieldWorks}件`],
      ["生育ログ", `${info.growthLogs}件`],
      ["その他作業", `${info.otherWorks}件`],
      ["資材/結果", `${info.materials}/${info.varietyResults}`]
    ].map(([label, value]) => `
      <div class="kpi">
        <div class="label">${U.escapeHTML(label)}</div>
        <div class="value" style="font-size:16px">${U.escapeHTML(value)}</div>
      </div>
    `).join("");
    U.$("dataSnapshot").value = JSON.stringify(state.data(), null, 2);
  }

  async function importJson() {
    const file = U.$("importFile").files && U.$("importFile").files[0];
    if (!file) {
      alert("JSONファイルを選んでください。");
      return;
    }
    try {
      const text = await U.readFileText(file);
      const parsed = JSON.parse(text);
      const normalized = RiceOS.schema.normalize({ ...parsed, importedFrom: "json" });
      const ok = confirm(`JSONを復元しますか？\nレシピ ${normalized.varieties.length}件 / 圃場 ${normalized.fields.length}件 / 生育ログ ${normalized.growthLogs.length}件`);
      if (!ok) return;
      state.replace(normalized, "JSONを復元しました");
      U.$("importFile").value = "";
    } catch (error) {
      alert(`読み込み失敗: ${error.message}`);
    }
  }

  function importLegacy() {
    const legacy = storage.findLegacy();
    if (!legacy) {
      alert("取り込める旧版データが見つかりませんでした。");
      return;
    }
    const normalized = RiceOS.schema.normalize({ ...legacy.data, importedFrom: legacy.key });
    const ok = confirm(`旧版データ「${legacy.key}」を取り込みますか？\nレシピ ${normalized.varieties.length}件 / 圃場 ${normalized.fields.length}件`);
    if (!ok) return;
    state.replace(normalized, "旧版データを取り込みました");
  }

  function restoreBackup() {
    const backup = storage.backupData();
    if (!backup) {
      alert("直前バックアップがありません。");
      return;
    }
    const ok = confirm(`直前バックアップを復旧しますか？\nレシピ ${backup.varieties.length}件 / 圃場 ${backup.fields.length}件`);
    if (!ok) return;
    state.replace(backup, "直前バックアップを復旧しました");
  }

  function bind() {
    document.querySelector('[data-action="export-json"]').addEventListener("click", () => storage.exportJson(state.data()));
    document.querySelector('[data-action="import-json"]').addEventListener("click", importJson);
    document.querySelector('[data-action="import-legacy"]').addEventListener("click", importLegacy);
    document.querySelector('[data-action="restore-backup"]').addEventListener("click", restoreBackup);
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.data = { render, bind };
})();
