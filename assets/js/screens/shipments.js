(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  const KINDS = { shipment: "出荷", sale: "販売", gift: "おすそ分け" };
  const RICE_TYPES = { brown: "玄米", white: "白米" };
  let view = "list";
  let selectedId = "";
  let editorOrigin = "list";
  let draft = null;
  let errorMessage = "";
  let saving = false;
  let bound = false;
  let priceSettingsOpen = false;
  let priceDraft = null;
  let priceError = "";
  const filters = { season: U.today().slice(0, 4), recipient: "", kind: "all" };

  function root() { return U.$("shipmentContent"); }
  function rows() { return state.shipments ? state.shipments() : []; }
  function record(id) { return rows().find((row) => row.shipmentId === id); }
  function prices() { return state.shipmentPrices ? state.shipmentPrices() : []; }
  function hasPackages(row) {
    return Array.isArray(row.packages) && row.packages.length > 0 && row.packages.every((item) =>
      Number.isFinite(Number(item.kg)) && Number(item.kg) > 0 && Number.isSafeInteger(Number(item.bags)) && Number(item.bags) > 0);
  }
  function numberText(value) { return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 6, useGrouping: false }); }
  function yen(value) { return `¥${Number(value).toLocaleString("ja-JP")}`; }
  function salesFor(row) {
    const result = { amount: 0, priced: 0, missing: 0, missingBags: 0, legacy: 0 };
    if (row.kind === "gift") return result;
    if (!hasPackages(row)) { result.legacy = 1; return result; }
    const price = row.pricePer60Kg;
    const total = totals(row.packages);
    const amount = Math.round(total.kg * Number(price) / 60);
    if (price !== undefined && price !== null && String(price).trim() !== "" && /^\d+$/.test(String(price).trim())
      && Number.isSafeInteger(Number(price)) && Number.isSafeInteger(amount)) {
      result.amount = amount;
      result.priced = 1;
    } else { result.missing = 1; result.missingBags = total.bags; }
    return result;
  }
  function salesTotal(items) {
    return items.reduce((sum, row) => {
      const value = salesFor(row);
      Object.keys(sum).forEach((key) => { sum[key] += value[key]; });
      return sum;
    }, { amount: 0, priced: 0, missing: 0, missingBags: 0, legacy: 0 });
  }
  function salesHtml(sales) {
    return `<span class="shipment-sales-amount">${sales.priced ? `単価記録分 ${yen(sales.amount)}` : "売上 未計算"}</span>${sales.missing ? `<small class="shipment-sales-missing">単価未登録 ${sales.missing}件（${numberText(sales.missingBags)}袋・未計算）</small>` : ""}${sales.legacy ? `<small class="shipment-sales-missing">袋内訳未登録 ${sales.legacy}件（未計算）</small>` : ""}`;
  }
  function option(value, label, selected) {
    return `<option value="${U.attr(value)}"${String(value) === String(selected) ? " selected" : ""}>${U.escapeHTML(label)}</option>`;
  }
  function totals(packages) {
    return (packages || []).reduce((sum, item) => {
      const kg = Number(item.kg);
      const bags = Number(item.bags);
      if (Number.isFinite(kg) && kg > 0 && Number.isSafeInteger(bags) && bags > 0 && Number.isFinite(kg * bags)) {
        sum.kg += kg * bags;
        sum.bags += bags;
      }
      return sum;
    }, { kg: 0, bags: 0 });
  }
  function packageText(packages) {
    return (packages || []).map((item) => `${numberText(item.kg)}kg × ${numberText(item.bags)}袋`).join(" / ");
  }
  function varietyName(id) {
    if (!id) return "品種未設定";
    const variety = state.variety(id);
    return variety ? variety.name : "保存済みの品種";
  }
  function recipients() {
    return Array.from(new Set([...rows(), ...prices()].map((row) => String(row.recipient || "").trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "ja"));
  }
  function filteredRows() {
    const query = filters.recipient.trim().toLocaleLowerCase();
    return rows().filter((row) => (filters.season === "all" || String(row.season) === filters.season)
      && (filters.kind === "all" || row.kind === filters.kind)
      && (!query || String(row.recipient || "").toLocaleLowerCase().includes(query)))
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }
  function suggestions(id) {
    return `<datalist id="${id}">${recipients().map((name) => `<option value="${U.attr(name)}"></option>`).join("")}</datalist>`;
  }
  function newPriceDraft() {
    return { season: filters.season === "all" ? U.today().slice(0, 4) : filters.season, recipient: "", pricePer60Kg: "" };
  }
  function renderPriceSettings() {
    const item = priceDraft || newPriceDraft();
    const registered = prices().slice().sort((a, b) => Number(b.season) - Number(a.season) || a.recipient.localeCompare(b.recipient, "ja"));
    return `<details class="shipment-price-settings" data-shipment-price-settings${priceSettingsOpen ? " open" : ""}><summary>販売先の単価</summary>
      <form id="shipmentPriceForm" class="stack-form shipment-price-form" novalidate>
        <label>収穫年（年産）<input id="shipmentPriceSeason" name="season" type="number" inputmode="numeric" min="1900" max="2200" step="1" value="${U.attr(item.season)}" required></label>
        <label>相手先<input id="shipmentPriceRecipient" name="recipient" list="shipmentPriceRecipients" value="${U.attr(item.recipient)}" required></label>
        <label>1俵（60kg）の価格（円）<input id="shipmentPriceRate" name="pricePer60Kg" type="number" inputmode="numeric" min="0" step="1" value="${U.attr(item.pricePer60Kg)}" required></label>
        ${suggestions("shipmentPriceRecipients")}<p id="shipmentPriceError" class="shipment-error" role="alert"${priceError ? "" : " hidden"}>${U.escapeHTML(priceError)}</p>
        <div class="form-actions"><button type="submit" class="primary" data-shipment-price-save>${item.priceId ? "単価を更新" : "単価を保存"}</button><button type="button" class="secondary" data-shipment-price-cancel>取り消す</button></div>
      </form><div class="shipment-price-list">${registered.length ? registered.map((price) => `<div class="shipment-price-row"><div><b>${U.escapeHTML(price.recipient)}</b><span>${U.escapeHTML(price.season)}年産 / ${yen(price.pricePer60Kg)}（60kg）</span></div><div class="shipment-price-actions"><button type="button" class="secondary" data-shipment-price-edit="${U.attr(price.priceId)}">編集</button><button type="button" class="danger" data-shipment-price-delete="${U.attr(price.priceId)}">削除</button></div></div>`).join("") : '<p class="muted">登録単価はありません。</p>'}</div></details>`;
  }
  function capturePriceDraft() {
    const form = U.$("shipmentPriceForm");
    if (!form) return;
    priceDraft = { ...(priceDraft || {}), season: form.elements.namedItem("season").value,
      recipient: form.elements.namedItem("recipient").value, pricePer60Kg: form.elements.namedItem("pricePer60Kg").value };
  }
  function priceSettingError(message) {
    priceError = message;
    const error = U.$("shipmentPriceError");
    if (error) { error.textContent = message; error.hidden = false; }
  }
  function validRate(value) {
    return /^\d+$/.test(String(value).trim()) && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  }
  function savePriceSetting() {
    capturePriceDraft();
    if (!priceDraft || !/^\d{4}$/.test(String(priceDraft.season)) || Number(priceDraft.season) < 1900 || Number(priceDraft.season) > 2200) { priceSettingError("収穫年を1900〜2200の整数で入力してください。"); return; }
    if (!priceDraft.recipient.trim()) { priceSettingError("相手先を入力してください。"); return; }
    if (!validRate(priceDraft.pricePer60Kg)) { priceSettingError("1俵（60kg）の価格は0以上の整数（円）で入力してください。"); return; }
    if (priceDraft.priceId && !prices().some((row) => row.priceId === priceDraft.priceId)) { priceSettingError("編集対象の単価が見つかりません。"); return; }
    try {
      if (!state.saveShipmentPrice || !state.saveShipmentPrice({ ...priceDraft, season: Number(priceDraft.season), recipient: priceDraft.recipient.trim(), pricePer60Kg: Number(priceDraft.pricePer60Kg) })) {
        priceSettingError("単価を保存できませんでした。"); return;
      }
      priceDraft = newPriceDraft();
      priceError = "";
      priceSettingsOpen = true;
      render();
    } catch (error) { priceSettingError(error.message || "単価を保存できませんでした。"); }
  }
  function applyRegisteredPrice() {
    const registered = prices().find((row) => String(row.season) === String(draft.season) && row.recipient.trim() === draft.recipient.trim());
    draft.pricePer60Kg = registered ? registered.pricePer60Kg : "";
    U.$("shipmentPricePer60Kg").value = draft.pricePer60Kg;
  }
  function renderYearTotals(visible) {
    const seasons = filters.season === "all"
      ? Array.from(new Set(visible.map((row) => String(row.season)))).sort((a, b) => Number(b) - Number(a))
      : [filters.season];
    const scope = [filters.recipient.trim() ? `相手先: ${filters.recipient.trim()}` : "全相手先", filters.kind === "all" ? "全区分" : KINDS[filters.kind]].join(" / ");
    return `<section class="shipment-year-totals" aria-label="収穫年別の集計"><p class="shipment-total-scope">${U.escapeHTML(scope)}</p>${seasons.map((season) => {
      const seasonRows = visible.filter((row) => String(row.season) === season);
      const counted = seasonRows.filter(hasPackages);
      const uncounted = seasonRows.length - counted.length;
      const packages = counted.flatMap((row) => row.packages);
      const total = totals(packages);
      const salesRows = seasonRows.filter((row) => row.kind === "shipment" || row.kind === "sale");
      const sales = salesTotal(salesRows);
      const recipientNames = Array.from(new Set(salesRows.map((row) => row.recipient || "相手先未設定"))).sort((a, b) => a.localeCompare(b, "ja"));
      const sizes = new Map();
      packages.forEach((item) => {
        const kg = Number(item.kg);
        const bags = Number(item.bags);
        if (kg > 0 && Number.isFinite(kg) && bags > 0 && Number.isSafeInteger(bags)) sizes.set(kg, (sizes.get(kg) || 0) + bags);
      });
      return `<div class="shipment-year-total"><div class="shipment-total-head"><b>${U.escapeHTML(season)}年産</b>${!counted.length && uncounted ? '<strong>未集計</strong>' : `<strong>${numberText(total.kg)}<small>kg</small></strong><span>${numberText(total.bags)}袋</span>`}</div>
        ${uncounted ? `<p class="shipment-legacy-info">袋内訳未登録 ${uncounted}件（未集計）</p>` : ""}
        <div class="shipment-size-totals">${Array.from(sizes).sort((a, b) => b[0] - a[0]).map(([kg, bags]) => `<span>${numberText(kg)}kg袋 <b>${numberText(bags)}袋</b></span>`).join("") || '<span>袋数の記録なし</span>'}</div>
        ${salesRows.length ? `<div class="shipment-year-sales">${salesHtml(sales)}</div><dl class="shipment-recipient-sales">${recipientNames.map((name) => `<div><dt>${U.escapeHTML(name)}</dt><dd>${salesHtml(salesTotal(salesRows.filter((row) => (row.recipient || "相手先未設定") === name)))}</dd></div>`).join("")}</dl>` : ""}</div>`;
    }).join("")}</section>`;
  }
  function renderLedger() {
    const visible = filteredRows();
    const seasons = Array.from(new Set([U.today().slice(0, 4), filters.season === "all" ? "" : filters.season, ...rows().map((row) => String(row.season))]))
      .filter(Boolean).sort((a, b) => Number(b) - Number(a));
    return `<div class="shipment-ledger">
      <div class="shipment-list-head"><h3>出荷台帳</h3><button type="button" class="primary" data-shipment-new>＋ 記録を追加</button></div>
      <div class="shipment-filters">
        <label>収穫年<select id="shipmentFilterSeason" data-shipment-filter="season">${option("all", "全収穫年", filters.season)}${seasons.map((year) => option(year, `${year}年産`, filters.season)).join("")}</select></label>
        <label>相手先<input id="shipmentFilterRecipient" data-shipment-filter="recipient" type="search" list="shipmentFilterRecipients" value="${U.attr(filters.recipient)}" placeholder="相手先で検索"></label>
        <label>区分<select id="shipmentFilterKind" data-shipment-filter="kind">${option("all", "すべて", filters.kind)}${Object.entries(KINDS).map(([key, label]) => option(key, label, filters.kind)).join("")}</select></label>
      </div>${suggestions("shipmentFilterRecipients")}
      ${renderPriceSettings()}
      ${renderYearTotals(visible)}
      <div class="shipment-ledger-count">${visible.length}件</div>
      <div class="shipment-list">${visible.length ? visible.map((row) => {
        const total = totals(row.packages);
        const counted = hasPackages(row);
        const sales = salesFor(row);
        return `<button type="button" class="shipment-card" data-shipment-open="${U.attr(row.shipmentId)}" aria-label="${U.attr(`${row.date} ${row.recipient || "相手先未設定"}の記録を開く`)}">
          <span class="shipment-card-main"><span class="shipment-card-date">${U.escapeHTML(U.fd(row.date))} <span class="pill info">${U.escapeHTML(KINDS[row.kind] || "出荷")}</span></span><b>${U.escapeHTML(row.recipient || "相手先未設定")}</b><small>${U.escapeHTML(`${row.season}年産 / ${RICE_TYPES[row.riceType] || "種類未設定"} / ${varietyName(row.varietyId)}`)}</small><span class="shipment-card-packages">${counted ? U.escapeHTML(packageText(row.packages)) : "袋内訳未登録"}</span></span>
          <span class="shipment-card-side">${counted ? `<strong>${numberText(total.kg)}kg</strong><small>${numberText(total.bags)}袋</small>` : '<strong>未集計</strong>'}${row.kind !== "gift" && (sales.priced || sales.missing) ? salesHtml(sales) : ""}<span aria-hidden="true">›</span></span></button>`;
      }).join("") : '<div class="empty shipment-empty">この条件の記録はありません。</div>'}</div></div>`;
  }
  function renderDetail(row) {
    const total = totals(row.packages);
    return `<section class="shipment-detail">
      <div class="shipment-detail-head"><button type="button" class="secondary icon-button" data-shipment-back aria-label="一覧へ戻る">‹</button><h3>${U.escapeHTML(row.recipient || "相手先未設定")}</h3></div>
      <div class="shipment-detail-meta"><span class="pill info">${U.escapeHTML(KINDS[row.kind] || "出荷")}</span><span>${U.escapeHTML(U.fd(row.date))}</span><span>${U.escapeHTML(row.season)}年産</span></div>
      <div class="shipment-detail-rice">${U.escapeHTML(RICE_TYPES[row.riceType] || "種類未設定")} / ${U.escapeHTML(varietyName(row.varietyId))}</div>
      <div class="shipment-detail-total">${hasPackages(row) ? `<strong>${numberText(total.kg)}kg</strong><span>${numberText(total.bags)}袋</span>` : '<strong>未集計</strong><span>袋内訳未登録</span>'}</div>
      ${row.quantity || row.amount ? `<dl class="shipment-legacy-info">${row.quantity ? `<div><dt>旧記録の数量</dt><dd>${U.escapeHTML(row.quantity)}</dd></div>` : ""}${row.amount ? `<div><dt>旧記録の金額</dt><dd>${U.escapeHTML(row.amount)}</dd></div>` : ""}</dl>` : ""}
      <dl class="shipment-package-detail">${(row.packages || []).map((item) => `<div><dt>${numberText(item.kg)}kg袋</dt><dd>${numberText(item.bags)}袋 / ${numberText(Number(item.kg) * Number(item.bags))}kg</dd></div>`).join("")}</dl>
      ${row.kind !== "gift" ? `<div class="shipment-detail-sales">${validRate(row.pricePer60Kg ?? "") ? `<p>1俵（60kg） ${yen(row.pricePer60Kg)}</p>` : ""}${salesHtml(salesFor(row))}</div>` : ""}
      ${row.memo ? `<div class="shipment-memo">${U.escapeHTML(row.memo)}</div>` : ""}
      <p id="shipmentError" class="shipment-error" role="alert"${errorMessage ? "" : " hidden"}>${U.escapeHTML(errorMessage)}</p>
      <div class="form-actions shipment-detail-actions"><button type="button" class="primary" data-shipment-edit>編集</button><button type="button" class="danger" data-shipment-delete>削除</button></div></section>`;
  }
  function packageEditor(item, index) {
    return `<div class="shipment-package-row" data-shipment-package>
      <label>1袋のkg<input data-shipment-kg type="number" inputmode="decimal" min="0.001" step="any" value="${U.attr(item.kg)}" aria-label="袋 ${index + 1} の1袋のkg"></label>
      <label>袋数<input data-shipment-bags type="number" inputmode="numeric" min="1" step="1" value="${U.attr(item.bags)}" aria-label="袋 ${index + 1} の袋数"></label>
      <button type="button" class="secondary icon-button" data-shipment-remove-package="${index}" aria-label="袋 ${index + 1} を削除">×</button></div>`;
  }
  function renderEditor() {
    const varieties = state.varieties();
    return `<form id="shipmentForm" class="stack-form shipment-editor" novalidate>
      <div class="shipment-editor-head"><button type="button" class="secondary icon-button" data-shipment-back aria-label="入力を取り消す">‹</button><h3>${selectedId ? "記録を編集" : "出荷・配布を記録"}</h3></div>
      <div class="form-grid dense shipment-basic-fields">
        <label>日付<input id="shipmentDate" name="date" type="date" value="${U.attr(draft.date)}" required></label>
        <label>収穫年（年産）<input id="shipmentSeason" name="season" type="number" inputmode="numeric" min="1900" max="2200" step="1" value="${U.attr(draft.season)}" required></label>
        <label>区分<select id="shipmentKind" name="kind">${Object.entries(KINDS).map(([key, label]) => option(key, label, draft.kind)).join("")}</select></label>
        <label>相手先<input id="shipmentRecipient" name="recipient" list="shipmentRecipients" value="${U.attr(draft.recipient)}" required></label>
        <label class="shipment-price-label${draft.kind === "gift" ? " hidden" : ""}" data-shipment-price-label${draft.kind === "gift" ? " hidden" : ""}>1俵（60kg）の価格（円）<input id="shipmentPricePer60Kg" name="pricePer60Kg" type="number" inputmode="numeric" min="0" step="1" value="${U.attr(draft.pricePer60Kg ?? "")}"></label>
        <label>品種<select id="shipmentVariety" name="varietyId">${option("", "未設定", draft.varietyId)}${draft.varietyId && !varieties.some((item) => item.varietyId === draft.varietyId) ? option(draft.varietyId, "保存済みの品種", draft.varietyId) : ""}${varieties.map((item) => option(item.varietyId, item.name, draft.varietyId)).join("")}</select></label>
        <label>米の種類<select id="shipmentRiceType" name="riceType">${Object.entries(RICE_TYPES).map(([key, label]) => option(key, label, draft.riceType)).join("")}</select></label>
      </div>${suggestions("shipmentRecipients")}
      <section class="shipment-packages"><h4>袋の内訳</h4><div id="shipmentPackages">${draft.packages.map(packageEditor).join("")}</div>
        <div class="shipment-package-picks" role="group" aria-label="袋を追加">${[30, 10, 5].map((kg) => `<button type="button" class="secondary" data-shipment-add-package="${kg}">＋ ${kg}kg</button>`).join("")}<button type="button" class="secondary" data-shipment-add-package="custom">＋ その他</button></div>
        <output id="shipmentPackageTotal" class="shipment-package-total" aria-live="polite">${editorTotal()}</output></section>
      <label>メモ（任意）<textarea id="shipmentMemo" name="memo">${U.escapeHTML(draft.memo)}</textarea></label>
      <p id="shipmentError" class="shipment-error" role="alert"${errorMessage ? "" : " hidden"}>${U.escapeHTML(errorMessage)}</p>
      <div class="form-actions"><button type="submit" class="primary"${saving ? " disabled" : ""}>保存</button><button type="button" class="secondary" data-shipment-back>取り消す</button></div></form>`;
  }
  function editorTotal() {
    const total = totals(draft.packages);
    return `${numberText(total.kg)}kg / ${numberText(total.bags)}袋${draft.kind === "gift" ? "" : ` / ${salesHtml(salesFor(draft))}`}`;
  }
  function syncEditorTotals() {
    root().querySelectorAll("[data-shipment-price-label]").forEach((label) => {
      label.hidden = draft.kind === "gift";
      label.classList.toggle("hidden", draft.kind === "gift");
    });
    U.$("shipmentPackageTotal").innerHTML = editorTotal();
  }
  function syncBack() {
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
  }
  function render() {
    const host = root();
    if (!host) return;
    if (view === "detail" && !record(selectedId)) { view = "list"; selectedId = ""; }
    host.innerHTML = view === "editor" && draft ? renderEditor() : view === "detail" ? renderDetail(record(selectedId)) : renderLedger();
    host.dataset.shipmentView = view;
    syncBack();
  }
  function openNew(date) {
    selectedId = "";
    editorOrigin = "list";
    errorMessage = "";
    const recordDate = typeof date === "string" && date ? date : U.today();
    draft = { date: recordDate, season: recordDate.slice(0, 4), kind: "shipment", recipient: "", pricePer60Kg: "", varietyId: "", riceType: "brown", packages: [{ kg: "30", bags: "" }], memo: "" };
    view = "editor";
    render();
  }
  function openDetail(id) {
    if (!record(id)) return false;
    selectedId = id;
    view = "detail";
    draft = null;
    errorMessage = "";
    render();
    return true;
  }
  function openEditor() {
    const row = record(selectedId);
    if (!row) return;
    editorOrigin = "detail";
    draft = { ...U.clone(row), kind: row.kind || "shipment", recipient: row.recipient || "", riceType: row.riceType || "brown", memo: row.memo || "",
      pricePer60Kg: row.pricePer60Kg ?? "",
      packages: hasPackages(row) ? row.packages.map((item) => ({ ...U.clone(item), kg: String(item.kg), bags: String(item.bags) })) : [{ kg: "30", bags: "" }] };
    errorMessage = "";
    view = "editor";
    render();
  }
  function captureDraft() {
    const form = U.$("shipmentForm");
    if (!draft || !form) return;
    ["date", "season", "kind", "recipient", "varietyId", "riceType", "memo", "pricePer60Kg"].forEach((key) => { draft[key] = form.elements.namedItem(key).value; });
    draft.packages = Array.from(form.querySelectorAll("[data-shipment-package]")).map((item, index) => ({ ...draft.packages[index], kg: item.querySelector("[data-shipment-kg]").value, bags: item.querySelector("[data-shipment-bags]").value }));
  }
  function showError(message, id) {
    errorMessage = message;
    const error = U.$("shipmentError");
    if (error) { error.textContent = message; error.hidden = false; }
    const input = id && U.$(id);
    if (input) input.focus();
  }
  function validatedDraft() {
    const date = String(draft.date);
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) { showError("有効な日付を入力してください。", "shipmentDate"); return null; }
    if (!/^\d{4}$/.test(String(draft.season)) || Number(draft.season) < 1900 || Number(draft.season) > 2200) { showError("収穫年を1900〜2200の整数で入力してください。", "shipmentSeason"); return null; }
    if (!draft.recipient.trim()) { showError("相手先を入力してください。", "shipmentRecipient"); return null; }
    if (!Object.hasOwn(KINDS, draft.kind) || !Object.hasOwn(RICE_TYPES, draft.riceType)) { showError("区分と米の種類を選択してください。"); return null; }
    if (!draft.packages.length) { showError("袋の内訳を追加してください。"); return null; }
    const packages = [];
    for (const item of draft.packages) {
      const kg = Number(item.kg);
      const bags = Number(item.bags);
      if (!String(item.kg).trim() || !String(item.bags).trim() || !Number.isFinite(kg) || kg <= 0 || !Number.isSafeInteger(bags) || bags <= 0 || !Number.isFinite(kg * bags)) {
        showError("1袋のkgは0より大きい数、袋数は1以上の整数で入力してください。"); return null;
      }
      packages.push({ ...item, kg, bags });
    }
    const total = totals(packages);
    if (!Number.isFinite(total.kg) || !Number.isSafeInteger(total.bags)) { showError("袋の数量が大きすぎます。内訳を確認してください。"); return null; }
    const priceText = String(draft.pricePer60Kg ?? "").trim();
    if (priceText && !validRate(priceText)) { showError("1俵（60kg）の価格は0以上の整数（円）で入力してください。", "shipmentPricePer60Kg"); return null; }
    if (priceText && !Number.isSafeInteger(Math.round(total.kg * Number(priceText) / 60))) { showError("売上金額が大きすぎます。単価と重量を確認してください。"); return null; }
    return { ...draft, pricePer60Kg: priceText ? Number(priceText) : "", season: Number(draft.season), recipient: draft.recipient.trim(), memo: draft.memo.trim(), packages };
  }
  function saveDraft() {
    if (saving) return;
    captureDraft();
    const payload = validatedDraft();
    if (!payload) return;
    if (!state.saveShipment) { showError("保存機能を準備中です。"); return; }
    if (selectedId && !record(selectedId)) { showError("編集対象の記録が見つかりません。入力を取り消して一覧を確認してください。"); return; }
    const previousIds = new Set(rows().map((row) => row.shipmentId));
    saving = true;
    let saved;
    try { saved = state.saveShipment(payload); }
    catch (error) { showError(error.message || "保存できませんでした。入力内容を確認してください。"); }
    finally { saving = false; }
    if (!saved) { if (!errorMessage) showError("保存できませんでした。入力内容を確認してください。"); return; }
    const id = selectedId || (typeof saved === "string" ? saved : saved.shipmentId) || (rows().find((row) => !previousIds.has(row.shipmentId)) || {}).shipmentId;
    draft = null;
    errorMessage = "";
    selectedId = id || "";
    view = selectedId && record(selectedId) ? "detail" : "list";
    render();
  }
  function canHandleBack() { return view !== "list"; }
  function handleBack() {
    if (!canHandleBack() || saving) return false;
    view = view === "editor" && editorOrigin === "detail" && record(selectedId) ? "detail" : "list";
    if (view === "list") selectedId = "";
    draft = null;
    errorMessage = "";
    render();
    return true;
  }
  function resetNavigation() {
    view = "list";
    selectedId = "";
    draft = null;
    errorMessage = "";
    render();
  }
  function updateFilter(input) {
    filters[input.dataset.shipmentFilter] = input.value;
    const focusId = input.id;
    const cursor = input.type === "search" ? input.selectionStart : null;
    render();
    if (cursor !== null) {
      const replacement = U.$(focusId);
      replacement.focus();
      replacement.setSelectionRange(cursor, cursor);
    }
  }
  function bind() {
    const host = root();
    if (!host || bound) return;
    bound = true;
    host.addEventListener("toggle", (event) => {
      if (event.target.matches("[data-shipment-price-settings]")) priceSettingsOpen = event.target.open;
    }, true);
    host.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || saving) return;
      if (button.hasAttribute("data-shipment-price-cancel")) {
        priceDraft = newPriceDraft(); priceError = ""; render(); return;
      }
      if (button.hasAttribute("data-shipment-price-edit")) {
        const price = prices().find((row) => row.priceId === button.dataset.shipmentPriceEdit);
        if (price) { priceDraft = U.clone(price); priceSettingsOpen = true; priceError = ""; render(); }
        return;
      }
      if (button.hasAttribute("data-shipment-price-delete")) {
        const price = prices().find((row) => row.priceId === button.dataset.shipmentPriceDelete);
        if (!price || !confirm(`${price.season}年産 ${price.recipient}の登録単価を削除しますか？`)) return;
        try {
          if (state.deleteShipmentPrice && state.deleteShipmentPrice(price.priceId)) {
            if (priceDraft && priceDraft.priceId === price.priceId) priceDraft = newPriceDraft();
            priceError = ""; render();
          } else priceSettingError("単価を削除できませんでした。");
        } catch (error) { priceSettingError(error.message || "単価を削除できませんでした。"); }
        return;
      }
      if (button.hasAttribute("data-shipment-new")) { openNew(); return; }
      if (button.hasAttribute("data-shipment-open")) { openDetail(button.dataset.shipmentOpen); return; }
      if (button.hasAttribute("data-shipment-back")) { handleBack(); return; }
      if (button.hasAttribute("data-shipment-edit")) { openEditor(); return; }
      if (button.hasAttribute("data-shipment-delete")) {
        const row = record(selectedId);
        if (!row || !confirm(`${U.fd(row.date)} ${row.recipient || "相手先未設定"}の記録を削除しますか？`)) return;
        try {
          if (state.deleteShipment && state.deleteShipment(selectedId)) resetNavigation();
          else showError("削除できませんでした。記録を確認してください。");
        } catch (error) { showError(error.message || "削除できませんでした。"); }
        return;
      }
      if (view !== "editor") return;
      if (button.hasAttribute("data-shipment-add-package")) {
        captureDraft();
        draft.packages.push({ kg: button.dataset.shipmentAddPackage === "custom" ? "" : button.dataset.shipmentAddPackage, bags: "" });
        render();
        const last = root().querySelectorAll("[data-shipment-package]");
        if (last.length) last[last.length - 1].querySelector(button.dataset.shipmentAddPackage === "custom" ? "[data-shipment-kg]" : "[data-shipment-bags]").focus();
      }
      if (button.hasAttribute("data-shipment-remove-package")) {
        captureDraft();
        draft.packages.splice(Number(button.dataset.shipmentRemovePackage), 1);
        render();
      }
    });
    host.addEventListener("input", (event) => {
      const input = event.target;
      if (input.closest("#shipmentPriceForm")) { capturePriceDraft(); return; }
      if (input.dataset.shipmentFilter === "recipient") { updateFilter(input); return; }
      if (view !== "editor") return;
      const previousRecipient = draft.recipient;
      const previousSeason = draft.season;
      captureDraft();
      if ((input.id === "shipmentRecipient" || input.id === "shipmentSeason")
        && (draft.recipient !== previousRecipient || String(draft.season) !== String(previousSeason))) applyRegisteredPrice();
      syncEditorTotals();
    });
    host.addEventListener("change", (event) => {
      if (event.target.hasAttribute("data-shipment-filter") && event.target.dataset.shipmentFilter !== "recipient") updateFilter(event.target);
      else if (view === "editor") {
        const previousRecipient = draft.recipient;
        const previousSeason = draft.season;
        captureDraft();
        if (draft.recipient !== previousRecipient || String(draft.season) !== String(previousSeason)) applyRegisteredPrice();
        syncEditorTotals();
      }
    });
    host.addEventListener("submit", (event) => {
      if (event.target.id === "shipmentPriceForm") {
        event.preventDefault(); priceError = ""; savePriceSetting(); return;
      }
      if (event.target.id !== "shipmentForm") return;
      event.preventDefault();
      errorMessage = "";
      saveDraft();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.shipments = { render, bind, openNew, openDetail, canHandleBack, handleBack, resetNavigation, preserveOnDataChange: true };
})();
