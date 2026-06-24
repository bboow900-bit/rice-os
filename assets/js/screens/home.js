(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let homeMonth = RiceOS.calendar.monthStart(U.today());
  let homeDate = U.today();
  let homeFieldId = "";

  function fieldLabel(field) {
    if (!field) return "圃場未設定";
    const variety = state.variety(field.varietyId);
    return `${field.name}${variety ? ` / ${variety.name}` : ""}`;
  }

  function currentField() {
    if (homeFieldId && state.field(homeFieldId)) return state.field(homeFieldId);
    const field = state.activeFields()[0] || state.fields()[0] || null;
    homeFieldId = field ? field.fieldId : "";
    return field;
  }

  function homeFieldOptions() {
    const current = currentField();
    return state.activeFields().map((field) => `
      <option value="${U.attr(field.fieldId)}" ${current && current.fieldId === field.fieldId ? "selected" : ""}>${U.escapeHTML(field.name)}</option>
    `).join("");
  }

  function areaText() {
    const area = state.fields().reduce((sum, field) => sum + U.number(field.areaA), 0);
    return `${Math.round(area * 10) / 10}a`;
  }

  function renderProgressCard() {
    const field = currentField();
    const progress = RiceOS.agro ? RiceOS.agro.progress(field, U.today()) : {};
    const dap = progress.dap === "" ? "田植日未設定" : `田植後 ${progress.dap}日`;
    return `
      <div class="visual-heat-card">
        <div>
          <b>${U.escapeHTML(fieldLabel(field))}</b>
          <span>生育進行の目安</span>
        </div>
        <div class="visual-heat-metrics">
          <span><b>${U.escapeHTML(dap)}</b><small>日数</small></span>
          <span><b>${U.escapeHTML(progress.tempText || "記録待ち")}</b><small>積算気温</small></span>
          <span><b>${U.escapeHTML(progress.diffText || "前年比 --")}</b><small>前年比較</small></span>
        </div>
      </div>
    `;
  }

  function markerClass(entry) {
    if (entry.kind === "schedule") return "mark-schedule";
    if (entry.kind === "growth") return "mark-growth";
    if (entry.kind === "work") return "mark-work";
    return "mark-water";
  }

  function renderCalendarDay(date) {
    const d = new Date(`${date}T00:00:00`);
    const inMonth = date.slice(0, 7) === homeMonth.slice(0, 7);
    const today = date === U.today();
    const selected = date === homeDate;
    const entries = RiceOS.calendar.entriesForDate(date);
    const hasPhoto = entries.some((entry) => entry.hasPhoto);
    return `
      <button class="visual-cal-day ${inMonth ? "" : "outside"} ${today ? "today" : ""} ${selected ? "selected" : ""}" data-home-date="${U.attr(date)}">
        <span>${d.getDate()}</span>
        <i>
          ${entries.slice(0, 3).map((entry) => `<b class="${markerClass(entry)}"></b>`).join("")}
          ${hasPhoto ? '<em>写</em>' : ""}
        </i>
      </button>
    `;
  }

  function renderEntries(date) {
    const entries = RiceOS.calendar.entriesForDate(date);
    if (!entries.length) return '<div class="visual-empty">この日の記録はまだありません。</div>';
    return entries.slice(0, 4).map((entry) => `
      <div class="visual-record-line ${U.attr(entry.kind)}">
        <b>${U.escapeHTML(entry.title)}</b>
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
      </div>
    `).join("");
  }

  function renderActionButton(screen, label, icon, extra = "") {
    return `<button class="visual-add-button ${extra}" data-home-add="${U.attr(screen)}"><span>${U.escapeHTML(icon)}</span>${U.escapeHTML(label)}</button>`;
  }

  function renderCalendarPanel() {
    return `
      <section class="visual-phone visual-calendar-phone">
        <div class="visual-phone-bar">
          <div>
            <b>稲作カルテ</b>
            <span>田んぼの記録・比較・管理アプリ</span>
          </div>
          <button type="button" data-action="refresh-home">更新</button>
        </div>
        <div class="visual-month-head">
          <button type="button" data-home-month="-1">‹</button>
          <b>${U.escapeHTML(RiceOS.calendar.monthLabel(homeMonth))}</b>
          <button type="button" data-home-month="1">›</button>
        </div>
        <div class="visual-calendar-grid">
          ${["日", "月", "火", "水", "木", "金", "土"].map((day) => `<strong>${day}</strong>`).join("")}
          ${RiceOS.calendar.daysForMonth(homeMonth).map(renderCalendarDay).join("")}
        </div>
        <div class="visual-day-card">
          <div>
            <b>${U.escapeHTML(U.fd(homeDate))} の記録</b>
            <button type="button" data-home-open-date>日付を開く</button>
          </div>
          ${renderEntries(homeDate)}
        </div>
        <div class="visual-add-area">
          <span>${U.escapeHTML(U.fd(homeDate))} に記録を追加</span>
          <div>
            ${renderActionButton("growth", "生育記録", "生", "green")}
            ${renderActionButton("field-work", "作業記録", "作", "orange")}
            ${renderActionButton("materials", "資材使用", "資", "blue")}
            ${renderActionButton("calendar", "予定登録", "予", "green")}
            ${renderActionButton("results", "収穫記録", "収", "brown")}
            ${renderActionButton("photos", "写真", "写", "yellow")}
          </div>
        </div>
      </section>
    `;
  }

  function growthRows() {
    const field = currentField();
    return state.data().growthLogs
      .filter((log) => !field || log.fieldId === field.fieldId)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);
  }

  function fallbackPhoto(field) {
    return "";
  }

  function renderGrowthCard(log, index) {
    const field = state.field(log.fieldId);
    const dap = U.daysAfterPlanting(field, log.date);
    const leafScore = RiceOS.alerts.leafScore(log);
    const photo = log.photoData || fallbackPhoto(field);
    return `
      <article class="visual-growth-card ${index === 0 ? "current" : ""}">
        <div class="visual-date-stamp">
          <b>${U.escapeHTML(String(new Date(`${log.date}T00:00:00`).getMonth() + 1))}/${U.escapeHTML(String(new Date(`${log.date}T00:00:00`).getDate()))}</b>
          <span>${U.escapeHTML(U.weekday(log.date))}</span>
        </div>
        <div class="visual-growth-body">
          <div class="visual-growth-head">
            <b>葉色：${U.escapeHTML(log.leafColor || "-")}</b>
            <span>${U.escapeHTML(field && field.name || "圃場")}</span>
          </div>
          <div class="visual-leaves">${"●".repeat(Math.max(1, U.number(leafScore, 3)))}${"○".repeat(Math.max(0, 5 - U.number(leafScore, 3)))}</div>
          <div class="visual-growth-metrics">
            <span>葉数 ${U.escapeHTML(log.leafCount || "-")}</span>
            <span>分げつ ${U.escapeHTML(log.tillerCount || "-")}</span>
            <span>草丈 ${U.escapeHTML(log.plantHeightCm || "-")}cm</span>
            ${dap !== "" ? `<span>田植後 ${U.escapeHTML(String(dap))}日</span>` : ""}
          </div>
          <small>雑草：${U.escapeHTML(log.weed || "-")}　ガス：${U.escapeHTML(log.gas || "-")}　水管理：${U.escapeHTML(log.water || "-")}</small>
        </div>
        <div class="visual-photo-tile ${photo ? "" : "empty"}">
          ${photo ? `<img src="${U.attr(photo)}" alt="">` : "<span>写真</span>"}
        </div>
      </article>
    `;
  }

  function renderLastYearMini(field) {
    const result = RiceOS.calendar.lastYearSamePeriod(14);
    const rows = result.rows.filter((row) => !field || !row.record || row.record.fieldId === field.fieldId).slice(0, 2);
    return `
      <div class="visual-compare">
        <div class="section-title compact">
          <h3>去年同時期との比較</h3>
          <span class="muted">${U.escapeHTML(U.fd(result.range.start))} - ${U.escapeHTML(U.fd(result.range.end))}</span>
        </div>
        <div class="visual-compare-grid">
          ${rows.length ? rows.map((row) => `
            <div>
              <b>${U.escapeHTML(U.fd(row.date))}</b>
              <span>${U.escapeHTML(row.title)}</span>
              <small>${U.escapeHTML(row.subtitle || "")}</small>
            </div>
          `).join("") : '<div><b>記録なし</b><span>今年の記録を増やすほど比較しやすくなります。</span></div>'}
        </div>
      </div>
    `;
  }

  function renderTimelinePanel() {
    const field = currentField();
    const variety = field ? state.variety(field.varietyId) : null;
    const rows = growthRows();
    return `
      <section class="visual-phone visual-timeline-phone">
        <div class="visual-panel-head">
          <div>
            <span>生育タイムライン：${U.escapeHTML(field ? field.name : "圃場")}</span>
            <b>${U.escapeHTML(variety && variety.targetTillers ? `目標分げつ ${variety.targetTillers}` : "生育の流れ")}</b>
          </div>
          <button type="button" data-home-add="growth">追加</button>
        </div>
        <div class="visual-timeline-list">
          ${rows.length ? rows.map(renderGrowthCard).join("") : '<div class="visual-empty tall">生育記録を入れると、ここに画像のようなタイムラインが並びます。</div>'}
        </div>
        ${renderLastYearMini(field)}
      </section>
    `;
  }

  function latestDry(field) {
    return (state.data().dryPeriods || [])
      .filter((item) => !field || item.fieldId === field.fieldId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function latestIrrigation(field) {
    return (state.data().irrigations || [])
      .filter((item) => !field || item.fieldId === field.fieldId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function renderChoiceRow(label, values, active) {
    return `
      <div class="visual-choice-row">
        <b>${U.escapeHTML(label)}</b>
        <div>${values.map((value) => `<span class="${String(value) === String(active) ? "active" : ""}">${U.escapeHTML(value)}</span>`).join("")}</div>
      </div>
    `;
  }

  function renderWaterProgress(field, dry, irrigation) {
    const start = dry && dry.startDate || field && field.drainageStartDate || "";
    const end = dry && dry.endDate || (start && field && field.drainageTargetDays ? U.dateAddDays(start, U.number(field.drainageTargetDays)) : "");
    const elapsed = start ? U.daysBetween(start, U.today()) : "";
    const remain = end ? U.daysBetween(U.today(), end) : "";
    const pct = elapsed !== "" && remain !== "" ? Math.max(8, Math.min(100, (elapsed / Math.max(1, elapsed + remain)) * 100)) : 42;
    return `
      <div class="visual-progress-card">
        <div>
          <b>中干しの進捗</b>
          <span>${elapsed !== "" ? `${elapsed}日目` : "開始日未設定"}${remain !== "" ? ` / 残り${remain}日` : ""}</span>
        </div>
        <i><span style="width:${U.attr(String(pct))}%"></span></i>
        <dl>
          <div><dt>開始日</dt><dd>${U.escapeHTML(U.fd(start) || "-")}</dd></div>
          <div><dt>終了予定</dt><dd>${U.escapeHTML(U.fd(end) || "-")}</dd></div>
          <div><dt>水管理</dt><dd>${U.escapeHTML(irrigation && irrigation.method || "間断灌水/湿潤灌漑")}</dd></div>
        </dl>
      </div>
    `;
  }

  function renderInputPanel() {
    const field = currentField();
    const dry = latestDry(field);
    const irrigation = latestIrrigation(field);
    return `
      <section class="visual-phone visual-input-phone">
        <div class="visual-form-head">
          <div>
            <span>中干し記録</span>
            <b>${U.escapeHTML(fieldLabel(field))}</b>
          </div>
          <button type="button" data-home-add="dry-period">追加</button>
        </div>
        <div class="visual-tabs">
          <span>基本情報</span>
          <span class="active">中干し観察</span>
          <span>写真・メモ</span>
        </div>
        <div class="visual-form-body">
          <label>観察日 <b>${U.escapeHTML(U.fd(dry && dry.date || U.today()))}</b></label>
          <label>中干し日数 <b>${U.escapeHTML(dry && dry.targetDays || field && field.drainageTargetDays || "7")}日目安</b></label>
          ${renderChoiceRow("ひび割れ幅", ["0", "1cm", "2cm", "3cm", "5cm以上"], dry && dry.crackCm ? `${dry.crackCm}cm` : "2cm")}
          ${renderChoiceRow("足の沈み込み", ["0", "2cm", "3cm", "5cm", "10cm以上"], dry && dry.sinkCm ? `${dry.sinkCm}cm` : "3cm")}
          ${renderChoiceRow("田面の状態", ["湿っている", "やや乾いている", "乾いている"], dry && dry.surface || "乾いている")}
          ${renderChoiceRow("ガスの状態", ["多い", "少しあり", "ほとんど無し", "無し"], dry && dry.gas || "ほとんど無し")}
          <label>メモ <small>${U.escapeHTML(dry && dry.memo || "午前中観察。田面はよく乾いてきている。")}</small></label>
          <button class="visual-save-button" type="button" data-home-add="dry-period">中干しを記録する</button>
        </div>
        ${renderWaterProgress(field, dry, irrigation)}
      </section>
    `;
  }

  function renderTopSummary() {
    return `
      <section class="visual-home-top">
        <div class="visual-home-title">
          <span>田んぼの記録・比較・管理アプリ</span>
          <b>稲作カルテ</b>
          <label class="visual-home-field">表示圃場<select data-home-field>${homeFieldOptions()}</select></label>
        </div>
        <div class="visual-home-hero" role="img" aria-label="田んぼの写真">
          <span>今日の田んぼを、来年の判断材料へ</span>
        </div>
        <div class="visual-kpi-row">
          <span><b>${U.escapeHTML(areaText())}</b><small>管理面積</small></span>
          <span><b>${U.escapeHTML(String(state.fields().length))}枚</b><small>圃場</small></span>
          <span><b>${U.escapeHTML(String(state.varieties().length))}</b><small>品種</small></span>
        </div>
        ${renderProgressCard()}
      </section>
    `;
  }

  function render() {
    U.$("homeVisualDashboard").innerHTML = `
      <div class="visual-app-board">
        ${renderTopSummary()}
        <div class="visual-three-panel">
          ${renderCalendarPanel()}
          ${renderTimelinePanel()}
          ${renderInputPanel()}
        </div>
      </div>
    `;
  }

  function openAddTarget(target) {
    if (!target) return;
    const field = currentField();
    if (target === "calendar") {
      RiceOS.app.show("calendar");
      if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(homeDate, field && field.fieldId);
      return;
    }
    RiceOS.app.show(target);
    if (target === "growth" && RiceOS.screens.growth) RiceOS.screens.growth.prefillDate(homeDate, field && field.fieldId);
    if (target === "field-work" && RiceOS.screens.fieldWork) RiceOS.screens.fieldWork.prefillDate(homeDate, field && field.fieldId);
    if (target === "dry-period" && RiceOS.screens.dryPeriod) RiceOS.screens.dryPeriod.prefillDate(homeDate, field && field.fieldId);
  }

  function bind() {
    U.$("homeVisualDashboard").addEventListener("click", (event) => {
      const monthButton = event.target.closest("[data-home-month]");
      if (monthButton) {
        homeMonth = RiceOS.calendar.addMonths(homeMonth, Number(monthButton.dataset.homeMonth));
        render();
        return;
      }
      const dateButton = event.target.closest("[data-home-date]");
      if (dateButton) {
        homeDate = dateButton.dataset.homeDate;
        render();
        if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(homeDate, currentField() && currentField().fieldId);
        return;
      }
      if (event.target.closest("[data-home-open-date]")) {
        if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(homeDate, currentField() && currentField().fieldId);
        return;
      }
      const fieldSelect = event.target.closest("[data-home-field]");
      if (fieldSelect) return;
      const addButton = event.target.closest("[data-home-add]");
      if (addButton) openAddTarget(addButton.dataset.homeAdd);
    });
    U.$("homeVisualDashboard").addEventListener("change", (event) => {
      const select = event.target.closest("[data-home-field]");
      if (!select) return;
      homeFieldId = select.value;
      render();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.home = { render, bind };
})();
