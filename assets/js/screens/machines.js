(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  const C = RiceOS.schema;
  let view = { mode: "list", machineId: "", maintenanceId: "", item: "", originScreen: "" };

  const TEMPLATE_ITEMS = {
    "コンバイン": ["エンジンオイル", "冷却水", "刈刃", "こぎ胴・脱こく部", "チェーン・ベルト", "クローラー・走行部", "収穫後清掃・保管"],
    "トラクター": ["エンジンオイル", "作動油・ミッション油", "冷却水", "ロータリー爪", "PTO・給脂", "タイヤ・走行部", "バッテリー・灯火"],
    "田植機": ["植付爪・掻取部", "苗載台・レール", "株間・植付設定", "走行部・油脂", "箱施用機", "清掃・保管"],
    "草刈機": ["刈刃", "燃料・エンジンオイル", "エアフィルター", "プラグ", "防振・安全装置", "清掃"],
    "スパイダーモア": ["刈刃", "ベルト", "エンジンオイル", "走行ワイヤー・レバー", "車輪・駆動部", "清掃・草詰まり"],
    "乾燥機": ["燃焼部", "ベルト・搬送部", "掃除", "安全装置"],
    "籾摺機": ["ロール", "ベルト", "選別部", "掃除"],
    "その他": ["点検", "給脂", "清掃", "部品交換", "修理"]
  };

  function root() { return U.$("machineMaintenanceRoot"); }
  function machine(id) { return state.machine && state.machine(id); }
  function fd(value) { return value ? U.fd(value) : "未記録"; }
  function shortDate(value) { return String(value || "").replace(/^\d{4}-0?/, "").replace("-", "/") || "-"; }
  function title(machineRow) { return [machineRow.maker, machineRow.name].filter(Boolean).join(" ") || "機械"; }
  function recent(record) { return state.maintenanceRecordsFor(record.machineId)[0] || null; }
  function escape(value) { return U.escapeHTML(String(value || "")); }

  function renderList() {
    const rows = state.machines({ includeRetired: true });
    root().innerHTML = `
      <div class="screen-head machine-head">${view.originScreen ? '<button type="button" class="secondary icon-button" data-machine-exit aria-label="管理へ戻る">‹</button>' : ""}<div><p class="eyebrow">機械台帳</p><h2>機械メンテナンス</h2><small>機械ごとの点検・整備履歴を残します</small></div><button type="button" class="primary" data-machine-add>＋ 機械追加</button></div>
      <section class="machine-list" aria-label="登録済み機械">
        ${rows.length ? rows.map((row) => {
          const last = recent(row);
          return `<button type="button" class="machine-card ${row.status === "使用停止" ? "retired" : ""}" data-machine-open="${escape(row.machineId)}">
            <span class="machine-card-icon" aria-hidden="true">${machineIcon(row.category)}</span>
            <span class="machine-card-main"><b>${escape(title(row))}</b><small>${escape([row.category, row.model].filter(Boolean).join(" / ") || "型式未登録")}</small><em>${last ? `最終整備 ${escape(fd(last.date))} / ${escape(last.item)}` : "整備記録はまだありません"}</em></span>
            <span class="machine-card-side"><strong>${row.meterHours ? `${escape(row.meterHours)}h` : ""}</strong><i>${row.status === "使用停止" ? "使用停止" : "›"}</i></span>
          </button>`;
        }).join("") : `<div class="empty machine-empty"><b>機械を登録しましょう</b><span>コンバイン、トラクター、草刈機などを分けて整備履歴を残せます。</span><button type="button" class="primary" data-machine-add>機械を登録</button></div>`}
      </section>`;
  }

  function machineIcon(category) {
    const source = ({
      "コンバイン": "assets/images/menu-icons/harvest.png",
      "トラクター": "assets/images/light-icons/tractor-puddling.png",
      "田植機": "assets/images/light-icons/transplanter-light.png",
      "草刈機": "assets/images/light-icons/mowing-worker.png",
      "スパイダーモア": "assets/images/light-icons/mowing-worker.png",
      "乾燥機": "assets/images/light-icons/rice-sack.png",
      "籾摺機": "assets/images/light-icons/rice-sack.png"
    })[category] || "assets/images/light-icons/karte-notebook.png";
    return `<img src="${source}" alt="">`;
  }

  function renderDetail() {
    const row = machine(view.machineId);
    if (!row) { view = { mode: "list", machineId: "", maintenanceId: "" }; renderList(); return; }
    const records = state.maintenanceRecordsFor(row.machineId);
    const items = Array.from(new Set([...(TEMPLATE_ITEMS[row.category] || TEMPLATE_ITEMS["その他"]), ...(row.customItems || [])]));
    root().innerHTML = `
      <div class="screen-head machine-head"><button type="button" class="secondary icon-button" data-machine-back aria-label="機械一覧へ戻る">‹</button><div><p class="eyebrow">機械台帳</p><h2>${escape(title(row))}</h2><small>${escape([row.category, row.model].filter(Boolean).join(" / ") || "型式未登録")}</small></div><button type="button" class="secondary" data-machine-edit="${escape(row.machineId)}">編集</button></div>
      <section class="machine-summary-card"><div><span>現在アワー</span><b>${row.meterHours ? `${escape(row.meterHours)}h` : "未記録"}</b></div><div><span>状態</span><b>${escape(row.status || "使用中")}</b></div><div><span>整備件数</span><b>${records.length}件</b></div></section>
      <section class="machine-items"><div class="section-title compact"><div><h3>整備項目</h3><span>機械ごとに記録を残します</span></div></div><div class="machine-item-chips">${items.map((item) => `<button type="button" data-maintenance-add="${escape(item)}">${escape(item)}</button>`).join("")}</div><button type="button" class="secondary machine-add-custom" data-maintenance-add="">＋ 別の整備を記録</button></section>
      <section class="machine-history"><div class="section-title compact"><div><h3>整備履歴</h3><span>${records.length ? "タップして内容を確認・編集" : "まだ整備記録はありません"}</span></div></div>${records.length ? records.map((record) => `<button type="button" class="machine-history-row" data-maintenance-open="${escape(record.maintenanceId)}"><time>${escape(shortDate(record.date))}</time><span><b>${escape(record.item)}</b><small>${escape([record.kind, record.parts, record.meterHours ? `${record.meterHours}h` : ""].filter(Boolean).join(" / ") || "内容未記入")}</small></span><i>›</i></button>`).join("") : ""}</section>
      ${row.status !== "使用停止" ? `<button type="button" class="text-danger machine-retire" data-machine-retire="${escape(row.machineId)}">この機械を使用停止にする</button>` : ""}`;
  }

  function renderMachineForm() {
    const row = view.machineId ? machine(view.machineId) : null;
    const categories = C.MACHINE_CATEGORIES || Object.keys(TEMPLATE_ITEMS);
    root().innerHTML = `
      <div class="screen-head machine-head"><button type="button" class="secondary icon-button" data-machine-back aria-label="戻る">‹</button><div><p class="eyebrow">機械台帳</p><h2>${row ? "機械を編集" : "機械を登録"}</h2></div></div>
      <form id="machineForm" class="form-card machine-form"><details class="form-section" open><summary>基本情報</summary><div class="form-grid dense inline-grid"><label>機械名<input name="name" required value="${escape(row && row.name)}" placeholder="例: SR75"></label><label>種類<select name="category">${categories.map((category) => `<option value="${escape(category)}" ${row && row.category === category ? "selected" : ""}>${escape(category)}</option>`).join("")}</select></label><label>メーカー<input name="maker" value="${escape(row && row.maker)}" placeholder="例: クボタ"></label><label>型式<input name="model" value="${escape(row && row.model)}" placeholder="例: SR75"></label></div></details><details class="form-section" open><summary>管理情報</summary><div class="form-grid dense inline-grid"><label>現在アワー<input name="meterHours" inputmode="decimal" value="${escape(row && row.meterHours)}" placeholder="例: 812"></label><label>購入年・日<input name="purchasedAt" value="${escape(row && row.purchasedAt)}" placeholder="例: 2020"></label></div><label>この機械だけの整備項目<textarea name="customItems" placeholder="例: 排出オーガ&#10;1行に1項目">${escape(row && (row.customItems || []).join("\n"))}</textarea></label><label>メモ<textarea name="memo">${escape(row && row.memo)}</textarea></label></details><div class="form-actions"><button type="button" class="secondary" data-machine-back>キャンセル</button><button type="submit" class="primary">保存する</button></div></form>`;
  }

  function renderMaintenanceForm() {
    const row = machine(view.machineId);
    if (!row) { view = { mode: "list", machineId: "", maintenanceId: "" }; renderList(); return; }
    const record = view.maintenanceId ? state.maintenanceRecordsFor(row.machineId).find((item) => item.maintenanceId === view.maintenanceId) : null;
    const item = view.item || record && record.item || "";
    root().innerHTML = `
      <div class="screen-head machine-head"><button type="button" class="secondary icon-button" data-machine-detail-back aria-label="機械詳細へ戻る">‹</button><div><p class="eyebrow">${escape(title(row))}</p><h2>${record ? "整備記録を編集" : "整備を記録"}</h2></div></div>
      <form id="maintenanceForm" class="form-card machine-form"><details class="form-section" open><summary>整備内容</summary><div class="form-grid dense inline-grid"><label>実施日<input name="date" type="date" value="${escape(record && record.date || U.today())}" required></label><label>種別<select name="kind">${["点検", "給脂", "清掃", "交換", "修理"].map((kind) => `<option value="${kind}" ${record && record.kind === kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label></div><label>項目<input name="item" required value="${escape(item)}" placeholder="例: エンジンオイル"></label></details><details class="form-section" open><summary>記録</summary><div class="form-grid dense inline-grid"><label>実施時アワー<input name="meterHours" inputmode="decimal" value="${escape(record && record.meterHours || row.meterHours)}"></label><label>費用（円）<input name="cost" inputmode="numeric" value="${escape(record && record.cost)}"></label><label>部品・油脂<input name="parts" value="${escape(record && record.parts)}"></label><label>依頼先<input name="vendor" value="${escape(record && record.vendor)}"></label></div><div class="form-grid dense inline-grid"><label>次回目安日<input name="nextDueDate" type="date" value="${escape(record && record.nextDueDate)}"></label><label>次回目安アワー<input name="nextDueHours" inputmode="decimal" value="${escape(record && record.nextDueHours)}"></label></div><label>メモ<textarea name="memo">${escape(record && record.memo)}</textarea></label></details><div class="form-actions"><button type="button" class="secondary" data-machine-detail-back>キャンセル</button><button type="submit" class="primary">保存する</button>${record ? `<button type="button" class="danger" data-maintenance-delete="${escape(record.maintenanceId)}">削除</button>` : ""}</div></form>`;
  }

  function render() {
    if (!root()) return;
    if (view.mode === "detail") renderDetail();
    else if (view.mode === "machine-form") renderMachineForm();
    else if (view.mode === "maintenance-form") renderMaintenanceForm();
    else renderList();
  }

  function open(machineId) { view = { ...view, mode: "detail", machineId, maintenanceId: "", item: "" }; render(); RiceOS.app && RiceOS.app.syncBackButton(); }
  function enter(originScreen) { view = { mode: "list", machineId: "", maintenanceId: "", item: "", originScreen: originScreen || "" }; render(); RiceOS.app && RiceOS.app.syncBackButton(); }
  function resetNavigation(clearOrigin) {
    view = {
      ...view,
      mode: "list",
      machineId: "",
      maintenanceId: "",
      item: "",
      originScreen: clearOrigin === false ? view.originScreen : ""
    };
  }
  function canHandleBack() { return view.mode !== "list" || Boolean(view.originScreen); }
  function handleBack() { if (view.mode === "maintenance-form") { view.mode = "detail"; view.maintenanceId = ""; view.item = ""; } else if (view.mode !== "list") { view.mode = "list"; view.machineId = ""; view.maintenanceId = ""; view.item = ""; } else if (view.originScreen) { const origin = view.originScreen; resetNavigation(); RiceOS.app.show(origin); return true; } else return false; render(); RiceOS.app && RiceOS.app.syncBackButton(); return true; }

  function bind() {
    document.addEventListener("click", (event) => {
      const add = event.target.closest("[data-machine-add]");
      if (add) { view = { ...view, mode: "machine-form", machineId: "", maintenanceId: "", item: "" }; render(); RiceOS.app && RiceOS.app.syncBackButton(); return; }
      const openButton = event.target.closest("[data-machine-open]");
      if (openButton) { open(openButton.dataset.machineOpen); return; }
      const edit = event.target.closest("[data-machine-edit]");
      if (edit) { view.mode = "machine-form"; view.machineId = edit.dataset.machineEdit; render(); return; }
      const detailBack = event.target.closest("[data-machine-detail-back]");
      if (detailBack) { view.mode = "detail"; view.maintenanceId = ""; view.item = ""; render(); return; }
      const back = event.target.closest("[data-machine-back]");
      if (back) { resetNavigation(false); render(); RiceOS.app && RiceOS.app.syncBackButton(); return; }
      const exit = event.target.closest("[data-machine-exit]");
      if (exit) { handleBack(); return; }
      const maintenance = event.target.closest("[data-maintenance-add]");
      if (maintenance) { view.mode = "maintenance-form"; view.maintenanceId = ""; view.item = maintenance.dataset.maintenanceAdd || ""; render(); return; }
      const maintenanceOpen = event.target.closest("[data-maintenance-open]");
      if (maintenanceOpen) { view.mode = "maintenance-form"; view.maintenanceId = maintenanceOpen.dataset.maintenanceOpen; view.item = ""; render(); return; }
      const retire = event.target.closest("[data-machine-retire]");
      if (retire && confirm("この機械を使用停止にしますか？\n整備履歴は削除されません。")) { state.retireMachine(retire.dataset.machineRetire); render(); }
      const remove = event.target.closest("[data-maintenance-delete]");
      if (remove && confirm("この整備記録を削除しますか？")) { state.deleteMaintenanceRecord(remove.dataset.maintenanceDelete); view.mode = "detail"; view.maintenanceId = ""; render(); }
    });
    document.addEventListener("submit", (event) => {
      if (event.target.id === "machineForm") {
        event.preventDefault(); const form = new FormData(event.target);
        const machineId = state.saveMachine({ machineId: view.machineId, name: form.get("name"), category: form.get("category"), maker: form.get("maker"), model: form.get("model"), meterHours: form.get("meterHours"), purchasedAt: form.get("purchasedAt"), customItems: String(form.get("customItems") || "").split(/\r?\n/), memo: form.get("memo") });
        if (machineId) open(machineId);
      }
      if (event.target.id === "maintenanceForm") {
        event.preventDefault(); const form = new FormData(event.target);
        const id = state.saveMaintenanceRecord({ maintenanceId: view.maintenanceId, machineId: view.machineId, date: form.get("date"), kind: form.get("kind"), item: form.get("item"), meterHours: form.get("meterHours"), cost: form.get("cost"), parts: form.get("parts"), vendor: form.get("vendor"), nextDueDate: form.get("nextDueDate"), nextDueHours: form.get("nextDueHours"), memo: form.get("memo") });
        if (id) { view.mode = "detail"; view.maintenanceId = ""; view.item = ""; render(); }
      }
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.machines = { render, bind, open, enter, resetNavigation, canHandleBack, handleBack };
})();
