(function () {
  "use strict";

  const R = window.RiceOS = window.RiceOS || {};
  const maxFileBytes = 20 * 1024 * 1024;

  function preparationError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function prepare(data) {
    if (typeof File !== "function") throw preparationError("unsupported", "この環境ではファイル共有を利用できません。JSONダウンロードを選べます。");
    if (!data || typeof data !== "object" || Array.isArray(data)) throw preparationError("invalid-data", "共有するデータを確認できませんでした。");
    const U = R.utils;
    const S = R.schema;
    const normalized = S.normalize(data);
    const exportedAt = U.now();
    const timestamp = Date.parse(exportedAt);
    if (!Number.isFinite(timestamp)) throw preparationError("invalid-time", "共有ファイルの日時を確認できませんでした。");
    const exportId = U.id("export", U.today());
    const payload = {
      ...normalized,
      schemaVersion: S.SCHEMA_VERSION,
      appVersion: S.APP_VERSION,
      exportedAt,
      exportId,
      meta: { ...(normalized.meta || {}), appVersion: S.APP_VERSION, lastExportId: exportId }
    };
    const json = JSON.stringify(payload, null, 2);
    const tooLarge = () => preparationError("too-large", "共有用JSONが20MiBを超えています。JSONダウンロードを選んでください。");
    if (json.length > maxFileBytes) throw tooLarge();
    const filename = `rice_karte_${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}.json`;
    const file = new File([json], filename, { type: "application/json", lastModified: timestamp });
    if (!Number.isSafeInteger(file.size) || file.size <= 0) throw preparationError("invalid-file", "共有ファイルを作成できませんでした。");
    if (file.size > maxFileBytes) throw tooLarge();
    return file;
  }

  async function share(data) {
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof navigator.share !== "function") {
      return { status: "unsupported", message: "この環境ではファイル共有を利用できません。JSONダウンロードを選べます。" };
    }
    try {
      const file = prepare(data);
      const request = { files: [file] };
      if (navigator.canShare(request) !== true) return { status: "unsupported", message: "このファイルは共有に対応していません。JSONダウンロードを選べます。" };
      await navigator.share(request);
      return { status: "shared", message: "共有先へ受け渡しました。端末外への保存完了は確認できません。" };
    } catch (error) {
      if (error && error.name === "AbortError") return { status: "cancelled", message: "共有を取り消しました。" };
      if (error && ["unsupported", "too-large"].includes(error.code)) return { status: "unsupported", message: error.message };
      return { status: "error", message: "共有できませんでした。共有先や権限を確認してください。自動保存は行っていません。" };
    }
  }

  R.backupExport = Object.freeze({ prepare, share, maxFileBytes });
})();
