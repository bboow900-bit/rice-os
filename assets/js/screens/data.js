(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const storage = RiceOS.storage;
  const state = RiceOS.state;
  const APP_VERSION_LABEL = `Ver2.0 / ${RiceOS.schema.APP_VERSION || ""}`;
  const IMPORT_LABELS = {
    varieties: "栽培レシピ",
    fields: "圃場",
    fieldWorks: "圃場作業",
    growthLogs: "生育",
    dryPeriods: "中干し",
    irrigations: "水管理",
    schedules: "予定",
    materials: "資材",
    varietyResults: "結果",
    confirmationCandidates: "確認候補"
  };

  function sizeLabel(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10}KB`;
    return `${Math.round(bytes / 1024 / 102.4) / 10}MB`;
  }

  function render() {
    const info = storage.info(state.data());
    U.$("dataStatus").innerHTML = [
      ["アプリバージョン", APP_VERSION_LABEL],
      ["保存キー", info.storeKey],
      ["使用量", sizeLabel(info.bytes)],
      ["直前バックアップ", info.backupBytes ? sizeLabel(info.backupBytes) : "なし"],
      ["レシピ/圃場", `${info.varieties}/${info.fields}`],
      ["圃場作業", `${info.fieldWorks}件`],
      ["生育ログ", `${info.growthLogs}件`],
      ["水管理", `${info.dryPeriods || 0}/${info.irrigations || 0}`],
      ["予定", `${info.schedules || 0}件`],
      ["資材/結果", `${info.materials}/${info.varietyResults}`],
      ["最終JSON保存", info.lastJsonExportAt ? U.fd(String(info.lastJsonExportAt).slice(0, 10)) : "記録なし"],
      ["最終自動退避", info.lastBackupAt ? U.fd(String(info.lastBackupAt).slice(0, 10)) : "記録なし"]
    ].map(([label, value]) => `
      <div class="kpi">
        <div class="label">${U.escapeHTML(label)}</div>
        <div class="value" style="font-size:16px">${U.escapeHTML(value)}</div>
      </div>
    `).join("");
    U.$("dataSnapshot").value = JSON.stringify(state.data(), null, 2);
    renderStorageStatus();
  }

  function importReport(inspection, mode, mergeResult) {
    const el = U.$("dataImportReport");
    if (!el) return;
    const counts = inspection && inspection.incoming || {};
    const countRows = Object.keys(IMPORT_LABELS)
      .filter((key) => counts[key] !== undefined)
      .map((key) => {
        const diff = inspection.diff && inspection.diff[key] || 0;
        const added = mergeResult && mergeResult.added && mergeResult.added[key];
        const suffix = added !== undefined ? ` / 追加 ${added}件` : ` / 現在との差 ${diff >= 0 ? "+" : ""}${diff}`;
        return `<span><b>${U.escapeHTML(IMPORT_LABELS[key])}</b>${U.escapeHTML(String(counts[key]))}件${U.escapeHTML(suffix)}</span>`;
      }).join("");
    const errors = (inspection && inspection.errors || []).map((text) => `<li class="error">${U.escapeHTML(text)}</li>`).join("");
    const warnings = (inspection && inspection.warnings || []).map((text) => `<li>${U.escapeHTML(text)}</li>`).join("");
    const title = !inspection || !inspection.ok
      ? "検査で問題が見つかりました"
      : mode === "inspect" ? "JSON検査結果" : mode === "merge" ? "追加・統合しました" : "完全置換しました";
    el.classList.remove("hidden");
    el.innerHTML = `
      <div><b>${U.escapeHTML(title)}</b><small>schema ${U.escapeHTML(String(inspection && inspection.schemaVersion || "旧版"))} / ${U.escapeHTML(inspection && inspection.appVersion || "バージョン記録なし")}</small></div>
      <div class="data-import-counts">${countRows}</div>
      ${errors || warnings ? `<ul>${errors}${warnings}</ul>` : '<p>参照切れやID重複は見つかりませんでした。</p>'}
    `;
  }

  async function renderStorageStatus() {
    const el = U.$("dataStorageStatus");
    if (!el || !storage.storageStatus) return;
    const status = await storage.storageStatus();
    const usage = status.usage === "" ? "不明" : sizeLabel(status.usage);
    const quota = status.quota === "" ? "不明" : sizeLabel(status.quota);
    const capacity = status.percent === "" ? "" : ` (${status.percent}%)`;
    el.innerHTML = `<b>ブラウザ保存</b><span>${status.supported ? (status.persisted ? "永続保存: 取得済み" : "永続保存: 未取得またはブラウザ判断") : "永続保存API: 非対応"}</span><small>使用 ${U.escapeHTML(usage)} / 上限 ${U.escapeHTML(quota)}${U.escapeHTML(capacity)}</small>${status.percent !== "" && status.percent >= 80 ? "<strong>容量が少なくなっています。JSON保存を行ってください。</strong>" : ""}`;
  }

  async function importJson() {
    const file = U.$("importFile").files && U.$("importFile").files[0];
    if (!file) {
      alert("JSONファイルを選んでください。");
      return;
    }
    try {
      const text = await U.readFileText(file);
      const inspection = storage.inspectJsonText(text, state.data());
      const mode = U.$("importMode") && U.$("importMode").value || "inspect";
      importReport(inspection, "inspect");
      if (!inspection.ok || mode === "inspect") return;
      if (mode === "merge") {
        const ok = confirm("現在のデータを残し、同じIDではない記録だけを追加しますか？\n実行前の状態は自動退避されます。");
        if (!ok) return;
        const merged = storage.mergeData(state.data(), inspection.normalized);
        state.replace(merged.data, "JSONから新しい記録を追加しました");
        importReport(inspection, "merge", merged);
      } else {
        const ok = confirm("現在のデータを完全に置き換えますか？\n現在の状態は実行直前に自動退避されます。");
        if (!ok) return;
        state.replace({ ...inspection.normalized, importedFrom: "json-replace" }, "JSONで完全置換しました");
        importReport(inspection, "replace");
      }
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
    document.querySelector('[data-action="export-json"]').addEventListener("click", () => {
      state.markJsonExported();
      storage.exportJson(state.data());
    });
    document.querySelector('[data-action="export-csv"]').addEventListener("click", () => {
      storage.exportCsv(state.data());
    });
    document.querySelector('[data-action="import-json"]').addEventListener("click", importJson);
    document.querySelector('[data-action="import-legacy"]').addEventListener("click", importLegacy);
    document.querySelector('[data-action="restore-backup"]').addEventListener("click", restoreBackup);
    document.querySelector('[data-action="undo-last-save"]').addEventListener("click", () => {
      if (!confirm("直前バックアップへ戻しますか？")) return;
      const restored = state.undoLastSave();
      if (!restored) alert("直前バックアップがありません。");
    });
    document.querySelector('[data-action="request-persistent-storage"]').addEventListener("click", async () => {
      const status = await storage.requestPersistentStorage();
      state.mutate((d) => {
        d.meta = d.meta || {};
        d.meta.storagePersisted = Boolean(status.persisted);
        d.meta.storagePersistCheckedAt = U.now();
      }, status.persisted ? "永続保存を取得しました" : "永続保存の状態を確認しました");
      renderStorageStatus();
      if (!status.persisted) alert("このブラウザでは永続保存が保証されません。定期的にJSON保存してください。");
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.data = { render, bind };
})();
