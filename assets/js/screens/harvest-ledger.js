(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils;
  let season = U.today().slice(0, 4), varietyId = "", boundRoot = null;
  const root = () => U.$("harvestLedgerContent");
  function historyDate(value) {
    const text = String(value || "");
    const parsed = new Date(`${text}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
      ? `${Number(text.slice(5, 7))}/${Number(text.slice(8, 10))}` : U.fd(value);
  }
  const number = (value, minimumFractionDigits = 0) => value == null || !Number.isFinite(value) ? "未集計" : value.toLocaleString("ja-JP", { minimumFractionDigits, maximumFractionDigits: 1 });
  const quantity = kg => kg == null ? "未集計" : `<strong>${number(kg / 60)}</strong><small>俵</small>`;
  const option = (value, name, selected) => `<option value="${U.attr(value)}"${String(value) === String(selected) ? " selected" : ""}>${U.escapeHTML(name)}</option>`;
  function setScope(scope = {}) {
    if (scope.season !== undefined && R.schema.validCropYear(scope.season)) season = String(scope.season);
    if (scope.varietyId !== undefined) varietyId = String(scope.varietyId || "");
    render();
  }
  function render() {
    const host = root(); if (!host) return;
    const scopes = R.harvestLedger.scopes();
    if (!varietyId && scopes.varieties.length) varietyId = scopes.varieties[0].varietyId;
    const years = [...new Set([Number(season), ...scopes.seasons])].sort((a, b) => b - a);
    const ledger = R.harvestLedger.read(season, varietyId), stock = ledger.stock, performance = ledger.performance;
    host.innerHTML = `<div class="harvest-ledger">
      <header class="hl-header"><h2>収穫・出荷</h2><img src="assets/images/light-icons/rice-sack.png" alt="" width="80" height="80"></header>
      <div class="hl-filters"><label>年産<select id="harvestLedgerSeason" data-harvest-ledger-season>${years.map(year => option(year, `${year}年産`, season)).join("")}</select></label><label>品種<select id="harvestLedgerVariety" data-harvest-ledger-variety>${scopes.varieties.length ? "" : option("", "品種未設定", varietyId)}${scopes.varieties.map(row => option(row.varietyId, row.name, varietyId)).join("")}</select></label></div>
      <section class="hl-balance" aria-label="残っているお米"><h3>残っているお米</h3><div class="hl-balance-value" data-harvest-ledger-remaining>${stock.hasHarvest ? quantity(stock.remainingKg) : "収量未登録"}</div><p>${stock.hasHarvest && stock.remainingKg !== null ? `${number(stock.remainingKg)}kg・30kg袋で${number(stock.remainingKg / 30)}袋相当` : ""}</p><p class="hl-balance-note">自家用を除いた、玄米の出荷用参考残量</p></section>
      ${stock.whiteShipmentCount || stock.unquantifiedCount || stock.unclassifiedCount ? `<p class="hl-warning" role="status">白米 ${stock.whiteShipmentCount}件・数量不足 ${stock.unquantifiedCount}件・品種未設定 ${stock.unclassifiedCount}件は残量に未反映です。</p>` : ""}
      ${stock.remainingKg < 0 ? '<p class="hl-warning" role="alert">出荷数量が収量を超えています。年産・品種・収量・出荷記録を確認してください。</p>' : ""}
      <dl class="hl-quantities"><div><dt>収穫量</dt><dd>${stock.hasHarvest ? quantity(stock.receivedKg) : "未登録"}</dd></div><div><dt>出荷・販売</dt><dd>${quantity(ledger.outgoingKg)}</dd></div><div><dt>おすそ分け</dt><dd>${quantity(ledger.giftKg)}</dd></div><div><dt>自家用</dt><dd data-harvest-ledger-household>${quantity(ledger.householdKg)}</dd></div></dl>
      <section class="hl-performance"><h3>収穫の成績</h3><p class="hl-yield hl-performance-main">10aあたり <span data-harvest-ledger-yield>${performance && performance.balesPer10a !== null ? `<strong>${number(performance.balesPer10a, 1)}</strong><small>俵</small>` : "未集計"}</span></p>${performance && performance.achievementPercent !== null ? `<p>目標 ${number(performance.targetBalesPer10a)}俵${performance.achievementPercent >= 100 ? "に到達" : ""}${performance.status !== "complete" ? "（集計途中）" : ""}</p><progress max="100" value="${Math.min(100, Math.max(0, performance.achievementPercent))}" aria-label="収量目標の達成率"></progress>` : ""}</section>
      <dl class="hl-sales"><div><dt>販売額合計</dt><dd data-harvest-ledger-sales>${ledger.pricedCount ? `<strong>${number(ledger.salesYen)}</strong><small>円</small>` : "未計算"}</dd></div></dl>${ledger.unpricedCount ? `<p>単価・袋内訳未登録 ${ledger.unpricedCount}件（未計算）</p>` : ""}
      <div class="hl-actions"><button type="button" class="primary" data-harvest-ledger-new-milling${!R.state.variety(varietyId) ? " disabled" : ""}>＋ 収量を登録</button><button type="button" class="primary" data-harvest-ledger-new-shipment${!varietyId ? " disabled" : ""}>＋ お米の行き先を登録</button></div>
      <section class="hl-history"><h3>最近の履歴</h3><ul>${ledger.history.slice(0, 10).map(row => `<li><button type="button" data-harvest-ledger-record="${U.attr(row.id)}" data-harvest-ledger-type="${row.type}"><span>${U.escapeHTML(historyDate(row.date))}</span> <span>${U.escapeHTML(row.label)}</span> <span>${row.kg === null ? "袋内訳未登録" : `${number(row.kg)}kg`}</span><span aria-hidden="true"> ›</span></button></li>`).join("")}</ul>${ledger.history.length ? "" : '<p class="empty">記録はありません。</p>'}</section>
      <details class="hl-more"><summary>詳細・これまでの記録</summary><p>玄米の収量・出荷を集計</p><p>旧収量記録 ${ledger.legacyCount}件（残量に未加算）</p><button type="button" class="secondary" data-harvest-ledger-results>収量・旧記録の詳細</button><button type="button" class="secondary" data-harvest-ledger-shipments>出荷台帳・販売単価</button><button type="button" class="secondary" data-harvest-ledger-issues>出荷の対応記録（${stock.issueCount}件）</button></details>
    </div>`;
  }
  function open(screen) { R.app.openInput(screen, "harvest-ledger", { nested: true }); }
  function bind() {
    const host = root(); if (!host || boundRoot === host) return; boundRoot = host;
    host.addEventListener("change", event => {
      if (event.target.matches("[data-harvest-ledger-season]")) setScope({ season: event.target.value });
      if (event.target.matches("[data-harvest-ledger-variety]")) setScope({ varietyId: event.target.value });
    });
    host.addEventListener("click", event => {
      const button = event.target.closest("button"); if (!button || button.disabled) return;
      if (button.hasAttribute("data-harvest-ledger-new-milling")) { open("results"); R.screens.results.openMillingForYear(season, varietyId, { originOnly: true }); }
      else if (button.hasAttribute("data-harvest-ledger-new-shipment")) { open("shipments"); R.screens.shipments.openNew(U.today(), { season, varietyId }); }
      else if (button.hasAttribute("data-harvest-ledger-record")) {
        if (button.dataset.harvestLedgerType === "shipment") { open("shipments"); R.screens.shipments.openDetail(button.dataset.harvestLedgerRecord); }
        else { open("results"); R.screens.results.openMillingDetail(button.dataset.harvestLedgerRecord); }
      } else if (button.hasAttribute("data-harvest-ledger-results")) { open("results"); R.screens.results.openMillingLedger(); }
      else if (button.hasAttribute("data-harvest-ledger-shipments")) open("shipments");
      else if (button.hasAttribute("data-harvest-ledger-issues")) { open("results"); R.screens.results.openShipmentIssues(); }
    });
  }
  R.screens = R.screens || {};
  R.screens.harvestLedger = { render, bind, setScope };
})();
