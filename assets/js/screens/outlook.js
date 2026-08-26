(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let selectedFieldId = "";
  let selectedGroupId = "all";
  let weatherContext = null;
  let weatherContextKey = "";
  let weatherLoading = false;
  let persistedKeys = new Set();
  let bound = false;

  function stars(strength) {
    const level = Math.max(0, Math.min(5, Number(strength) || 0));
    return "★★★★★".slice(0, level) + "☆☆☆☆☆".slice(0, 5 - level);
  }

  function varietyName(field) {
    const variety = field && state.variety(field.varietyId);
    return variety && variety.name || "品種未設定";
  }

  function stageLabel(outlook) {
    const current = outlook.stage && outlook.stage.current;
    const label = current && (current.label || current.name) || "生育記録待ち";
    const certainty = outlook.stage && outlook.stage.certainty || "推定";
    return `${label}（${certainty}）`;
  }

  function dateText(entry) {
    if (!entry || !entry.date) return "記録不足";
    return entry.kind === "actual" ? `${U.fd(entry.date)}（実測済）` : entry.range.label;
  }

  function persist(rows) {
    const candidates = rows.map((row) => row.snapshot).filter(Boolean).filter((row) => {
      const key = [row.fieldId, row.season, row.asOf, row.headingDate, row.harvestDate, row.confidence].join("|");
      return !persistedKeys.has(key);
    });
    if (!candidates.length || !state.saveOutlookSnapshots) return;
    const saved = state.saveOutlookSnapshots(candidates);
    if (!saved) return;
    candidates.forEach((row) => persistedKeys.add([row.fieldId, row.season, row.asOf, row.headingDate, row.harvestDate, row.confidence].join("|")));
  }

  function fieldCard(outlook) {
    const field = outlook.field;
    return `
      <button class="outlook-field-card" type="button" data-outlook-field="${U.attr(field.fieldId)}">
        <div class="outlook-card-head">
          <div><small>${U.escapeHTML(varietyName(field))} / ${U.escapeHTML(field.areaA ? `${field.areaA}a` : "面積未登録")}</small><h3>${U.escapeHTML(field.name)}</h3></div>
          <span class="outlook-confidence ${U.attr(outlook.confidence.key)}">信頼度 ${U.escapeHTML(outlook.confidence.label)}</span>
        </div>
        <div class="outlook-now"><span>現在</span><b>${U.escapeHTML(stageLabel(outlook))}</b></div>
        <dl class="outlook-estimates">
          <div><dt>出穂</dt><dd>${U.escapeHTML(dateText(outlook.heading))}</dd></div>
          <div><dt>収穫目安</dt><dd>${U.escapeHTML(dateText(outlook.harvest))}</dd></div>
        </dl>
        <div class="outlook-card-foot"><span>${U.escapeHTML(outlook.water && outlook.water.label || "水管理は未記録")}</span><b>詳細　›</b></div>
      </button>`;
  }

  function differenceText(outlook) {
    if (outlook.difference === "") return "前年の同一圃場との比較に必要な記録はありません。";
    if (outlook.difference === 0) return "前年の同一圃場と同じ頃の見通しです。";
    return `前年の同一圃場より ${Math.abs(outlook.difference)}日 ${outlook.difference < 0 ? "早い" : "遅い"}見通しです。`;
  }

  function detail(outlook) {
    const regional = outlook.regional;
    return `
      <section class="outlook-detail">
        <div class="screen-head outlook-detail-head">
          <div><p class="eyebrow">${U.escapeHTML(varietyName(outlook.field))}</p><h2>${U.escapeHTML(outlook.field.name)}の見通し</h2></div>
        </div>
        <div class="outlook-detail-hero">
          <small>現在ステージ</small><b>${U.escapeHTML(stageLabel(outlook))}</b><span>${U.escapeHTML(outlook.water && outlook.water.label || "水管理は未記録")}</span>
        </div>
        <section class="outlook-detail-section"><h3>見通し</h3>
          <div class="outlook-detail-grid">
            <div><small>出穂予測</small><b>${U.escapeHTML(dateText(outlook.heading))}</b><span>${U.escapeHTML(outlook.heading.source || "")}</span></div>
            <div><small>収穫目安</small><b>${U.escapeHTML(dateText(outlook.harvest))}</b><span>${U.escapeHTML(outlook.harvest.source || "")}</span></div>
            <div><small>信頼度</small><b>${U.escapeHTML(outlook.confidence.label)}</b><span>${U.escapeHTML(outlook.confidence.detail)}</span></div>
            <div><small>前年との差</small><b>${U.escapeHTML(differenceText(outlook))}</b></div>
          </div>
          ${outlook.missing ? `<p class="outlook-missing">${U.escapeHTML(outlook.missing)}</p>` : ""}
        </section>
        <section class="outlook-detail-section"><h3>見通しの根拠</h3>
          <div class="outlook-source-list">${outlook.sources.map((item) => `<div class="outlook-source ${item.available ? "available" : ""}"><span>${U.escapeHTML(item.label)}</span><b>${stars(item.strength)}</b><small>${U.escapeHTML(item.detail)}</small></div>`).join("")}</div>
        </section>
        <section class="outlook-detail-section regional-reference"><h3>福島県の一般目安</h3>
          <p><b>${U.escapeHTML(regional.variety)}</b>　収穫期の参考: ${U.escapeHTML(regional.harvestTarget.label)}（出穂後の積算気温）</p>
          <div>${regional.sources.map((item) => `<a href="${U.attr(item.url)}" target="_blank" rel="noopener">${U.escapeHTML(item.label)}　›</a>`).join("")}</div>
        </section>
      </section>`;
  }

  function render() {
    const root = U.$("outlookDashboard");
    if (!root || !RiceOS.outlook) return;
    const weatherLocation = state.data().meta && state.data().meta.weatherLocation;
    const hasWeatherLocation = weatherLocation && weatherLocation.latitude !== undefined && weatherLocation.longitude !== undefined;
    const all = RiceOS.outlook.all({ weather: weatherContext });
    const groups = state.fieldGroups();
    const rows = selectedGroupId === "all" ? all : all.filter((item) => item.field.fieldGroupId === selectedGroupId);
    const selected = selectedFieldId ? all.find((item) => item.field.fieldId === selectedFieldId) : null;
    if (selectedFieldId && !selected) selectedFieldId = "";
    if (selected) {
      root.innerHTML = detail(selected);
      return;
    }
    root.innerHTML = `
      <div class="screen-head outlook-head"><div><p class="eyebrow">記録と地域情報を読む</p><h2>見通し</h2><small>実測を最優先に、予測の根拠を表示します。</small></div></div>
      <div class="outlook-toolbar"><label>対象圃場<select data-outlook-group><option value="all">全圃場</option>${groups.map((group) => `<option value="${U.attr(group.fieldGroupId)}" ${group.fieldGroupId === selectedGroupId ? "selected" : ""}>${U.escapeHTML(group.name)}</option>`).join("")}</select></label><button class="secondary" type="button" data-outlook-weather>${hasWeatherLocation ? "気象を再取得" : "現在地から気象を取得"}</button></div>
      <div class="outlook-actions"><p class="outlook-update-note">見通しを保存すると、予測と実績との差を翌年の補正に残せます。</p><button class="secondary" type="button" data-outlook-save>見通しを保存</button></div>
      <div class="outlook-list">${rows.length ? rows.map(fieldCard).join("") : '<div class="empty-state">このグループに表示できる圃場がありません。</div>'}</div>`;
    loadWeather({ silent: true });
  }

  function weatherKey(location, today) {
    return [today, location && location.latitude, location && location.longitude].join("|");
  }

  async function loadWeather(options) {
    const opts = options || {};
    let location = state.data().meta && state.data().meta.weatherLocation;
    if (!location || location.latitude === undefined) {
      if (opts.requestLocation && RiceOS.weather && RiceOS.weather.ensureLocation) {
        try {
          location = await RiceOS.weather.ensureLocation();
        } catch (error) {
          weatherContext = { available: false, detail: "位置情報を取得できませんでした", normalAvailable: false, normalDetail: "ブラウザの位置情報許可を確認してください", missingLocation: true };
          U.toast(error && error.message || "現在地を取得できませんでした。");
          render();
          return;
        }
      }
    }
    if (!location || location.latitude === undefined) {
      if (weatherContext && weatherContext.missingLocation) return;
      weatherContext = { available: false, detail: "位置情報未設定", normalAvailable: false, normalDetail: "位置情報を設定すると取得できます", missingLocation: true };
      if (!opts.silent) U.toast("気象データは位置情報を設定した後に反映できます。");
      render();
      return;
    }
    const today = U.today();
    const key = weatherKey(location, today);
    if (weatherLoading || !opts.force && weatherContextKey === key && weatherContext) return;
    weatherLoading = true;
    weatherContextKey = key;
    try {
      const endDate = U.dateAddDays(today, 6);
      const [forecast, historical] = await Promise.all([
        RiceOS.weather.fetchDailyRange(today, endDate, location),
        RiceOS.weather.fetchSamePeriodAverage(today, endDate, location, 3)
      ]);
      const means = forecast.rows.map((row) => Number(row.tempMean)).filter(Number.isFinite);
      const forecastMean = means.length ? Math.round(means.reduce((sum, value) => sum + value, 0) / means.length * 10) / 10 : "";
      weatherContext = {
        available: forecastMean !== "",
        detail: forecastMean === "" ? "直近7日の平均気温を取得できませんでした" : `直近7日 平均 ${forecastMean}℃`,
        normalAvailable: Boolean(historical && historical.days),
        normalDetail: historical && historical.label || "過去同時期の平均は未取得",
        asOf: today,
        location: RiceOS.weather.locationText(location)
      };
      render();
    } catch (error) {
      weatherContext = { available: false, detail: "気象データを取得できませんでした", normalAvailable: false, normalDetail: "過去同時期の平均は未取得", asOf: today };
      if (!opts.silent) U.toast("気象データを取得できませんでした。");
      render();
    } finally {
      weatherLoading = false;
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", (event) => {
      const fieldButton = event.target.closest("[data-outlook-field]");
      if (fieldButton) { selectedFieldId = fieldButton.dataset.outlookField; render(); RiceOS.app.syncBackButton(); return; }
      if (event.target.closest("[data-outlook-weather]")) loadWeather({ force: true, requestLocation: true });
      if (event.target.closest("[data-outlook-save]")) {
        const rows = selectedGroupId === "all" ? RiceOS.outlook.all({ weather: weatherContext }) : RiceOS.outlook.all({ weather: weatherContext }).filter((item) => item.field.fieldGroupId === selectedGroupId);
        persist(rows);
        return;
      }
    });
    document.addEventListener("change", (event) => {
      if (!event.target.matches("[data-outlook-group]")) return;
      selectedGroupId = event.target.value || "all";
      render();
    });
  }

  function handleBack() {
    if (!selectedFieldId) return false;
    selectedFieldId = "";
    render();
    return true;
  }

  function resetNavigation() { selectedFieldId = ""; }
  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.outlook = { render, bind, handleBack, canHandleBack: () => Boolean(selectedFieldId), resetNavigation };
})();
