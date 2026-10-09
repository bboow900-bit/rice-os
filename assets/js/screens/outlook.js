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
  let weatherRequest = 0;
  let weatherLoadingKey = "";
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
    const keyFor = (row) => state.outlookSnapshotKey ? state.outlookSnapshotKey(row)
      : [row.fieldId, row.season, row.asOf, row.headingDate, row.harvestDate, row.confidence].join("|");
    const candidates = rows.map((row) => row.snapshot).filter(Boolean).filter((row) => {
      return !persistedKeys.has(keyFor(row));
    });
    if (!candidates.length || !state.saveOutlookSnapshots) return;
    const saved = state.saveOutlookSnapshots(candidates);
    if (!saved) return;
    candidates.forEach((row) => persistedKeys.add(keyFor(row)));
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
        ${outlook.calibration && outlook.calibration.status === "applied" ? '<small class="outlook-calibration-badge">この圃場の履歴を参考に暫定補正</small>' : ""}
        <div class="outlook-card-foot"><span>${U.escapeHTML(outlook.water && outlook.water.label || "水管理は未記録")}</span><b>詳細　›</b></div>
      </button>`;
  }

  function differenceText(outlook) {
    if (outlook.difference === "") return "前年の同一圃場との比較に必要な記録はありません。";
    if (outlook.difference === 0) return "前年の同一圃場と同じ頃の見通しです。";
    return `前年の同一圃場より ${Math.abs(outlook.difference)}日 ${outlook.difference < 0 ? "早い" : "遅い"}見通しです。`;
  }

  function calibrationDetail(outlook) {
    const calibration = outlook.calibration;
    if (!calibration) return "";
    const accepted = Array.isArray(calibration.accepted) ? calibration.accepted : [];
    const excluded = Array.isArray(calibration.excluded) ? calibration.excluded : [];
    const applied = calibration.status === "applied";
    const statusText = applied ? `${accepted.length}年分を参考にした暫定補正`
      : outlook.harvest.kind === "actual" ? "実際の収穫日を優先"
        : !outlook.heading.date ? "出穂につながる記録待ち" : "今回は一般目安を使用";
    const shift = Number(calibration.shiftDays) || 0;
    const shiftText = shift === 0 ? "中心日の変更なし" : `中心日を${Math.abs(shift)}日${shift < 0 ? "早め" : "遅め"}に暫定補正`;
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? U.fd(value) : "日付未確認";
    const thermal = calibration.thermalReference;
    return `<section class="outlook-detail-section outlook-calibration" data-outlook-calibration>
      <h3>刈取時期の履歴補正</h3>
      <p class="outlook-calibration-status" data-outlook-calibration-status="${U.attr(calibration.status)}">${U.escapeHTML(statusText)}</p>
      <p>${U.escapeHTML(calibration.reason || "")}</p>
      ${calibration.baseRange && calibration.baseRange.label ? `<dl class="outlook-calibration-summary"><div><dt>補正前の一般目安</dt><dd>${U.escapeHTML(calibration.baseRange.label)}</dd></div>${applied ? `<div><dt>今回の補正</dt><dd>${U.escapeHTML(shiftText)}</dd></div>` : ""}</dl>` : ""}
      <details data-outlook-calibration-evidence><summary>採用した根拠 ${accepted.length}年 / 除外 ${excluded.length}件</summary>
        ${accepted.length ? `<h4>採用した現場の見立て</h4><ul>${accepted.map(row => `<li data-calibration-accepted="${U.attr(row.workId)}"><b>${U.escapeHTML(row.season)}年</b><span>出穂 ${U.escapeHTML(date(row.headingDate))}</span><span>見立てた適期 ${U.escapeHTML(date(row.idealStartDate))}${row.idealEndDate && row.idealEndDate !== row.idealStartDate ? ` ～ ${U.escapeHTML(date(row.idealEndDate))}` : ""}</span><span>出穂後 ${U.escapeHTML(row.daysMin)}～${U.escapeHTML(row.daysMax)}日</span></li>`).join("")}</ul>` : '<p>補正条件を満たす過去年の記録はありません。</p>'}
        ${excluded.length ? `<h4>今回使わなかった記録</h4><ul>${excluded.map(row => `<li data-calibration-excluded="${U.attr(row.workId)}"><b>${U.escapeHTML(row.season)}年</b><span>${U.escapeHTML(row.reason)}</span></li>`).join("")}</ul>` : ""}
      </details>
      ${thermal && Number.isFinite(thermal.minimum) && Number.isFinite(thermal.maximum) ? `<p class="outlook-calibration-note">採用履歴の適期積算: ${U.escapeHTML(thermal.minimum)}～${U.escapeHTML(thermal.maximum)}℃（完全取得 ${U.escapeHTML(thermal.count)}件）。日数による補正には使用していません。積算温度の到達目安への採用条件は下の欄で別に確認できます。</p>` : ""}
      ${calibration.policy ? `<p class="outlook-calibration-note">本アプリの暫定ルール: ${U.escapeHTML(calibration.policy.minimumYears)}年分以上、中心日の補正は最大${U.escapeHTML(calibration.policy.maximumShiftDays)}日、採用範囲は一般目安の前後${U.escapeHTML(calibration.policy.guardDays)}日以内。県の判定基準や精度保証ではありません。</p>` : ""}
      <p class="outlook-calibration-note">日付の補正は過去の出穂後日数を参考にしたものです。一般目安より予測幅を狭めず、信頼度も引き上げません。品種は評価入力時の参照情報で照合しています。現場条件によって前後します。</p>
    </section>`;
  }

  function thermalCalibrationDetail(thermal) {
    const calibration = thermal.thermalCalibration;
    if (!calibration) return "";
    const accepted = Array.isArray(calibration.accepted) ? calibration.accepted : [];
    const excluded = Array.isArray(calibration.excluded) ? calibration.excluded : [];
    const applied = calibration.status === "applied";
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? U.fd(value) : "日付未確認";
    const base = calibration.baseRange || {};
    const policy = calibration.policy || {};
    return `<div class="outlook-thermal-calibration" data-outlook-thermal-calibration-status="${U.attr(calibration.status)}">
      <p><b>${applied ? `過去${accepted.length}年の見立てを参考幅に採用` : "履歴による温度補正は未採用"}</b></p>
      <p>${U.escapeHTML(calibration.reason || "")}</p>
      ${Number.isFinite(base.minimum) && Number.isFinite(base.maximum) ? `<p>品種の一般目安 ${U.escapeHTML(base.minimum)}～${U.escapeHTML(base.maximum)}℃</p>` : ""}
      <details data-outlook-thermal-evidence><summary>温度計算の根拠: ${applied ? "採用" : "候補"} ${accepted.length}年 / 除外 ${excluded.length}件</summary>
        ${accepted.length ? `<h4>${applied ? "採用した年" : "条件を満たす候補年（まだ未採用）"}</h4><ul>${accepted.map(row => `<li data-thermal-accepted="${U.attr(row.workId)}"><b>${U.escapeHTML(row.season)}年</b><span>見立てた適期 ${U.escapeHTML(date(row.idealStartDate))}${row.idealEndDate && row.idealEndDate !== row.idealStartDate ? ` ～ ${U.escapeHTML(date(row.idealEndDate))}` : ""}</span><span>参考積算 ${U.escapeHTML(row.minimum)}～${U.escapeHTML(row.maximum)}℃</span></li>`).join("")}</ul>` : ""}
        ${excluded.length ? `<h4>今回使わなかった年・記録</h4><ul>${excluded.map(row => `<li data-thermal-excluded="${U.attr(row.workId)}"><b>${U.escapeHTML(row.season)}年</b><span>${U.escapeHTML(row.reason)}</span></li>`).join("")}</ul>` : ""}
        ${policy.minimumYears ? `<p>異なる年の完全取得 ${U.escapeHTML(policy.minimumYears)}年分以上を採用条件とする、本アプリの暫定ルールです。</p>` : ""}
        ${policy.regionalUpperLimit ? `<p>福島県資料（${U.escapeHTML(policy.sourceUpdatedAt || "")}）を参照し、${U.escapeHTML(policy.regionalUpperLimit)}℃以上を含む評価年は温度補正に採用しません。保存済みの評価は変更しません。</p>` : ""}
        ${policy.sourceUrl === "https://www.pref.fukushima.lg.jp/sec/36210a/suitoukaritori.html" ? `<p><a href="${U.attr(policy.sourceUrl)}" target="_blank" rel="noopener">参照した福島県資料</a></p>` : ""}
      </details>
      <small>一般目安を狭めず、信頼度も引き上げません。品種は評価入力時の参照情報で照合しています。過去の栽培品種や刈取適期の正確さを保証するものではありません。採用制限は全国共通の恒久基準ではなく、1,200℃未満でも適期を保証しません。</small>
    </div>`;
  }

  function thermalDetail(outlook) {
    const thermal = outlook.thermalProjection;
    if (!thermal) return "";
    const historical = thermal.historical || {};
    const total = historical.total;
    const threshold = thermal.thresholds || {};
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    const dates = validDate(thermal.actualDate) ? `刈取実績 ${U.fd(thermal.actualDate)}`
      : validDate(thermal.arrivalMinDate) && validDate(thermal.arrivalMaxDate)
        ? thermal.arrivalMinDate === thermal.arrivalMaxDate ? U.fd(thermal.arrivalMinDate) : `${U.fd(thermal.arrivalMinDate)} ～ ${U.fd(thermal.arrivalMaxDate)}` : "到達日を算出できません";
    return `<section class="outlook-detail-section outlook-thermal" data-outlook-thermal data-outlook-thermal-status="${U.attr(thermal.status)}">
      <h3>積算温度からの到達目安</h3>
      <p><b>${U.escapeHTML(dates)}</b></p>
      <p>${U.escapeHTML(thermal.reason || "")}</p>
      ${Number.isFinite(total) ? `<p>${historical.complete ? "過去気象の積算" : "取得済み分のみ"} ${U.escapeHTML(total)}℃ / 取得 ${U.escapeHTML(historical.count)}日・必要 ${U.escapeHTML(historical.expectedDays)}日</p>` : ""}
      ${Number.isFinite(threshold.minimum) && Number.isFinite(threshold.maximum) ? `<p>${thermal.thermalCalibration && thermal.thermalCalibration.status === "applied" ? "履歴を含む参考幅" : "品種の参考目安"} ${U.escapeHTML(threshold.minimum)}～${U.escapeHTML(threshold.maximum)}℃</p>` : ""}
      ${thermal.thermalCalibration && thermal.thermalCalibration.status === "applied" && validDate(thermal.generalArrivalMinDate) && validDate(thermal.generalArrivalMaxDate) ? `<p>一般目安の到達: ${U.escapeHTML(thermal.generalArrivalMinDate === thermal.generalArrivalMaxDate ? U.fd(thermal.generalArrivalMinDate) : `${U.fd(thermal.generalArrivalMinDate)} ～ ${U.fd(thermal.generalArrivalMaxDate)}`)}</p>` : ""}
      ${thermal.forecastDays || thermal.seasonalDays ? `<p>到達計算に使用: 予報 ${U.escapeHTML(thermal.forecastDays)}日 / 過去同時期参考 ${U.escapeHTML(thermal.seasonalDays)}日</p>` : ""}
      ${thermal.seasonalDays ? `<p>同時期参考の取得年数: 最少 ${U.escapeHTML(thermal.seasonalMinimumYears)}年 / 対象 ${U.escapeHTML(thermal.seasonalExpectedYears)}年</p>` : ""}
      ${thermalCalibrationDetail(thermal)}
      <small>出穂翌日から計算。過去分はOpen-Meteoの過去気象モデル、今後7日は予報、それ以降は過去3年を対象に取得できた同時期の参考気温です。気象庁の観測値・平年値ではありません。日数による収穫目安とは別の参考値で、刈取適期を確定しません。</small>
    </section>`;
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
        ${calibrationDetail(outlook)}
        ${thermalDetail(outlook)}
        <section class="outlook-detail-section"><h3>見通しの根拠</h3>
          <div class="outlook-source-list">${outlook.sources.map((item) => `<div class="outlook-source ${item.available ? "available" : ""}"><span>${U.escapeHTML(item.label)}</span><b>${stars(item.strength)}</b><small>${U.escapeHTML(item.detail)}</small></div>`).join("")}</div>
        </section>
        <section class="outlook-detail-section regional-reference"><h3>福島県の一般目安</h3>
          <p><b>${U.escapeHTML(regional.variety)}</b>　収穫期の参考: ${U.escapeHTML(regional.harvestTarget.label)}（出穂後の積算気温）</p>
          <div>${regional.sources.map((item) => `<a href="${U.attr(item.url)}" target="_blank" rel="noopener">${U.escapeHTML(item.label)}　›</a>`).join("")}</div>
        </section>
      </section>`;
  }

  function render(options) {
    const root = U.$("outlookDashboard");
    if (!root || !RiceOS.outlook) return;
    const weatherLocation = state.data().meta && state.data().meta.weatherLocation;
    const hasWeatherLocation = weatherLocation && weatherLocation.latitude !== undefined && weatherLocation.longitude !== undefined;
    const context = weatherContextKey === weatherKey(weatherLocation, U.today()) ? weatherContext : null;
    const all = RiceOS.outlook.all({ weather: context });
    const groups = state.fieldGroups();
    const rows = selectedGroupId === "all" ? all : all.filter((item) => item.field.fieldGroupId === selectedGroupId);
    const selected = selectedFieldId ? all.find((item) => item.field.fieldId === selectedFieldId) : null;
    if (selectedFieldId && !selected) selectedFieldId = "";
    if (selected) {
      root.innerHTML = detail(selected);
      if (!options || !options.skipWeather) loadWeather({ silent: true });
      return;
    }
    root.innerHTML = `
      <div class="screen-head outlook-head"><div><p class="eyebrow">記録と地域情報を読む</p><h2>見通し</h2><small>実測を最優先に、予測の根拠を表示します。</small></div></div>
      <div class="outlook-toolbar"><label>対象圃場<select data-outlook-group><option value="all">全圃場</option>${groups.map((group) => `<option value="${U.attr(group.fieldGroupId)}" ${group.fieldGroupId === selectedGroupId ? "selected" : ""}>${U.escapeHTML(group.name)}</option>`).join("")}</select></label><button class="secondary" type="button" data-outlook-weather>${hasWeatherLocation ? "気象を再取得" : "現在地から気象を取得"}</button></div>
      <div class="outlook-actions"><p class="outlook-update-note">見通しを保存すると、予測と実績との差を翌年の補正に残せます。</p><button class="secondary" type="button" data-outlook-save>見通しを保存</button></div>
      <div class="outlook-list">${rows.length ? rows.map(fieldCard).join("") : '<div class="empty-state">このグループに表示できる圃場がありません。</div>'}</div>`;
    if (!options || !options.skipWeather) loadWeather({ silent: true });
  }

  function weatherKey(location, today) {
    const headings = RiceOS.outlook.all().map(row => [row.field.fieldId, row.heading.kind, row.heading.date, row.harvest.kind, row.harvest.date]);
    const observations = (state.data().growthLogs || []).filter(row => row.headingObserved === true).map(row => [row.fieldId, row.date]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return JSON.stringify([today, location && location.latitude, location && location.longitude, headings, observations]);
  }

  function validLocation(location) {
    return Boolean(location && typeof location.latitude === "number" && Number.isFinite(location.latitude)
      && typeof location.longitude === "number" && Number.isFinite(location.longitude)
      && Math.abs(location.latitude) <= 90 && Math.abs(location.longitude) <= 180);
  }

  async function loadWeather(options) {
    const opts = options || {};
    let location = state.data().meta && state.data().meta.weatherLocation;
    if (!validLocation(location)) {
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
    if (!validLocation(location)) {
      if (weatherContext && weatherContext.missingLocation) return;
      weatherContext = { available: false, detail: "位置情報未設定", normalAvailable: false, normalDetail: "位置情報を設定すると取得できます", missingLocation: true };
      if (!opts.silent) U.toast("気象データは位置情報を設定した後に反映できます。");
      render();
      return;
    }
    const today = U.today();
    const key = weatherKey(location, today);
    if (weatherLoading && weatherLoadingKey === key || !opts.force && weatherContextKey === key && weatherContext) return;
    const request = ++weatherRequest;
    weatherLoading = true;
    weatherLoadingKey = key;
    try {
      const endDate = U.dateAddDays(today, 6);
      const starts = RiceOS.outlook.all().filter(row => row.heading.kind === "actual" && row.harvest.kind !== "actual" && row.heading.date <= today).map(row => U.dateAddDays(row.heading.date, 1)).sort();
      const [forecast, historical, past, seasonal] = await Promise.all([
        RiceOS.weather.fetchDailyRange(today, endDate, location).catch(() => ({ rows: [] })),
        RiceOS.weather.fetchSamePeriodAverage(today, endDate, location, 3).catch(() => null),
        starts.length && starts[0] < today ? RiceOS.weather.fetchDailyRange(starts[0], U.dateAddDays(today, -1), location).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
        starts.length && RiceOS.weather.fetchSamePeriodDailyAverage ? RiceOS.weather.fetchSamePeriodDailyAverage(U.dateAddDays(today, 7), U.dateAddDays(today, 120), location, 3).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] })
      ]);
      if (request !== weatherRequest || key !== weatherKey(state.data().meta && state.data().meta.weatherLocation, U.today())) return;
      const means = forecast.rows.filter(row => typeof row.tempMean === "number" && Number.isFinite(row.tempMean)).map(row => row.tempMean);
      const forecastMean = means.length ? Math.round(means.reduce((sum, value) => sum + value, 0) / means.length * 10) / 10 : "";
      weatherContext = {
        available: forecastMean !== "",
        detail: forecastMean === "" ? "今後7日の平均気温を取得できませんでした" : `今後7日 平均 ${forecastMean}℃`,
        normalAvailable: Boolean(historical && historical.days),
        normalDetail: historical && historical.label || "過去同時期の平均は未取得",
        asOf: today,
        location: RiceOS.weather.locationText(location),
        thermal: { asOf: today, locationKey: `${location.latitude}|${location.longitude}`, retrievedAt: U.now(), rows: [
          ...(past.rows || []).map(row => ({ ...row, basis: "historical" })),
          ...(forecast.rows || []).map(row => ({ ...row, basis: "forecast" })),
          ...(seasonal.rows || []).map(row => ({ ...row, basis: "seasonal" }))
        ] }
      };
      weatherContextKey = key;
      render();
    } catch (error) {
      if (request !== weatherRequest || key !== weatherKey(state.data().meta && state.data().meta.weatherLocation, U.today())) return;
      weatherContext = { available: false, detail: "気象データを取得できませんでした", normalAvailable: false, normalDetail: "過去同時期の平均は未取得", asOf: today };
      weatherContextKey = key;
      if (!opts.silent) U.toast("気象データを取得できませんでした。");
      render();
    } finally {
      if (request === weatherRequest) { weatherLoading = false; weatherLoadingKey = ""; }
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
        const location = state.data().meta && state.data().meta.weatherLocation;
        const context = weatherContextKey === weatherKey(location, U.today()) ? weatherContext : null;
        const rows = selectedGroupId === "all" ? RiceOS.outlook.all({ weather: context }) : RiceOS.outlook.all({ weather: context }).filter((item) => item.field.fieldGroupId === selectedGroupId);
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

  function resetNavigation() {
    selectedFieldId = "";
    render({ skipWeather: true });
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
  }
  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.outlook = { render, bind, handleBack, canHandleBack: () => Boolean(selectedFieldId), resetNavigation };
})();
