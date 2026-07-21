(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;
  let bulkFieldIds = [];
  let inputMode = localStorage.getItem("riceGrowthInputMode") || "simple";
  let timelineOpen = localStorage.getItem("riceGrowthTimelineOpen") === "1";

  function setBulkFields(ids) {
    bulkFieldIds = (ids || []).filter(Boolean);
  }

  function clearBulkFields() {
    bulkFieldIds = [];
  }

  function fieldGroupName(field) {
    const raw = String(field && (field.fieldGroupId || field.district) || "").trim();
    return raw ? raw.replace(/グループ$/, "") : "";
  }

  function fieldGroups() {
    const groups = new Map();
    state.activeFields().forEach((field) => {
      const name = fieldGroupName(field);
      if (!name) return;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(field);
    });
    return Array.from(groups.entries()).map(([name, fields]) => ({ name, fields }));
  }

  function cropYear(dateText) {
    return String(dateText || U.today()).slice(0, 4);
  }

  function latestPanicleLog(fieldId, dateText) {
    const year = cropYear(dateText);
    return state.growthLogsFor(fieldId)
      .filter((log) => String(log.date || "").startsWith(`${year}-`) && U.number(log.panicleLengthMm, 0) > 0)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function plantingDateForYear(fieldId, year) {
    return state.fieldWorksFor(fieldId)
      .filter((work) => String(work.date || "").startsWith(`${year}-`) && /田植/.test(String(work.workName || "")))
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]?.date || "";
  }

  function previousPanicleReference(fieldId, dateText) {
    const year = Number(cropYear(dateText));
    if (!Number.isFinite(year)) return null;
    const previousYear = String(year - 1);
    const log = state.growthLogsFor(fieldId)
      .filter((item) => String(item.date || "").startsWith(`${previousYear}-`) && U.number(item.panicleLengthMm, 0) > 0)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
    if (!log) return null;
    const planting = plantingDateForYear(fieldId, previousYear);
    const dap = planting ? U.daysBetween(planting, log.date) : "";
    return { log, planting, dap };
  }

  function renderPanicleEntryState() {
    const field = state.field(U.$("gField").value);
    const latest = field && latestPanicleLog(field.fieldId, U.$("gDate").value);
    const editing = U.$("editGrowthId").value;
    const section = U.$("growthPanicleSection");
    const input = U.$("gPanicleLengthMm");
    const bulk = document.querySelector('[data-action="growth-bulk-panicle"]');
    const locked = Boolean(latest && !editing);
    if (section) {
      section.classList.toggle("panicle-recorded", locked);
      if (locked) section.open = false;
    }
    if (input) input.disabled = locked;
    if (bulk) bulk.classList.toggle("hidden", locked);
  }

  function renderPanicleTargets() {
    const mode = U.$("gPanicleTargetMode");
    const group = U.$("gPanicleGroup");
    const label = U.$("gPanicleGroupLabel");
    const notice = U.$("gPanicleTargetNotice");
    if (!mode || !group || !label || !notice) return;
    const groups = fieldGroups();
    U.setOptions(group, groups.map((item) => ({ value: item.name, label: `${item.name}グループ (${item.fields.length}圃場)` })), group.value || (groups[0] && groups[0].name) || "");
    const isGroup = mode.value === "group";
    label.classList.toggle("hidden", !isGroup || !groups.length);
    const selected = groups.find((item) => item.name === group.value);
    if (!isGroup) {
      const field = state.field(U.$("gField").value);
      notice.textContent = field ? `${field.name} に個別記録します` : "圃場を選択してください";
      return;
    }
    if (!selected) {
      notice.textContent = "グループを選択してください";
      return;
    }
    const varieties = new Set(selected.fields.map((field) => field.varietyId).filter(Boolean));
    const plantingDates = new Set(selected.fields.map((field) => plantingDateForYear(field.fieldId, cropYear(U.$("gDate").value))).filter(Boolean));
    const caution = varieties.size > 1 || plantingDates.size > 1 ? " 品種または田植日が異なる圃場があります。" : "";
    notice.textContent = `${selected.name}グループの${selected.fields.length}圃場へ同じ幼穂長を記録します。${caution}`;
  }

  function setInputMode(mode) {
    inputMode = mode === "detail" ? "detail" : "simple";
    localStorage.setItem("riceGrowthInputMode", inputMode);
    const form = U.$("growthForm");
    if (form) form.dataset.growthMode = inputMode;
    if (inputMode === "simple" && U.$("growthMemoSection")) U.$("growthMemoSection").open = true;
    if (inputMode === "simple" && U.$("growthPhotoSection")) U.$("growthPhotoSection").open = true;
    U.$$("[data-growth-mode-select]").forEach((button) => {
      button.classList.toggle("active", button.dataset.growthModeSelect === inputMode);
    });
  }

  function parseTargetRange(value) {
    const nums = String(value || "").match(/\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return null;
    const first = U.number(nums[0], 0);
    const second = nums[1] ? U.number(nums[1], first) : first;
    return { min: Math.min(first, second), max: Math.max(first, second) };
  }

  function renderChips(containerId, selectId, options) {
    const el = U.$(containerId);
    const select = U.$(selectId);
    if (!el || !select) return;
    const value = select.value;
    el.innerHTML = options.map((opt) => {
      const item = typeof opt === "string" ? { value: opt, label: opt } : opt;
      return `<button type="button" class="${String(item.value) === String(value) ? "active" : ""}" data-growth-select="${U.attr(selectId)}" data-growth-value="${U.attr(item.value)}">${U.escapeHTML(item.text || item.label)}</button>`;
    }).join("");
  }

  function renderChoiceControls() {
    renderChips("gLeafChips", "gLeaf", S.LEAF_COLOR_LEVELS.map((level) => ({ value: level.value, label: level.label, text: `${level.value} ${level.text}` })));
  }

  function renderTargetPanel() {
    const el = U.$("growthTargetPanel");
    if (!el) return;
    const field = state.field(U.$("gField").value);
    const variety = field ? state.variety(field.varietyId) : null;
    const date = U.$("gDate").value || U.today();
    const dap = U.daysAfterPlanting(field, date);
    const tillers = U.number(U.$("gTillerCount") && U.$("gTillerCount").value, 0);
    const target = variety && variety.targetTillers || "";
    const drainageStarted = !!(field && field.drainageStartDate && String(field.drainageStartDate) <= String(date));
    const panicleLength = U.number(U.$("gPanicleLengthMm") && U.$("gPanicleLengthMm").value, 0);
    const range = parseTargetRange(target);
    let targetLine = "分げつ目標は栽培レシピで設定できます。";
    let pct = 0;
    const latestPanicle = field && latestPanicleLog(field.fieldId, date);
    if (drainageStarted) {
      targetLine = panicleLength > 0
        ? `中干し後 / 幼穂 ${panicleLength}mm を記録中。葉色・幼穂長を確認`
        : (latestPanicle ? `中干し後 / 幼穂確認済み (${U.fd(latestPanicle.date)})。葉色・出穂を中心に記録` : "中干し後 / 分げつ目標は完了。葉色・幼穂長を中心に記録");
    } else if (range && tillers > 0) {
      pct = Math.max(5, Math.min(100, (tillers / Math.max(1, range.min)) * 100));
      if (tillers < range.min) targetLine = `目標 ${target} / 現在 ${tillers}本 / あと${Math.round((range.min - tillers) * 10) / 10}本`;
      else if (tillers <= range.max) targetLine = `目標 ${target} / 現在 ${tillers}本 / 目標圏内`;
      else targetLine = `目標 ${target} / 現在 ${tillers}本 / 目標より多め`;
    } else if (target) {
      targetLine = `目標 ${target} / 分げつ数を入れると差分を表示`;
    }
    el.innerHTML = `
      <div class="growth-target-card">
        <div>
          <b>${U.escapeHTML(field && field.name || "圃場")}</b>
          <span>${U.escapeHTML(variety && variety.name || "品種未設定")}${dap !== "" ? ` / 田植後${U.escapeHTML(String(dap))}日` : ""}</span>
        </div>
        <p>${U.escapeHTML(targetLine)}</p>
        ${drainageStarted ? "" : `<i><span style="width:${U.attr(String(pct || 18))}%"></span></i>`}
      </div>
    `;
  }

  function observedHeadingDate(fieldId) {
    return state.growthLogsFor(fieldId)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .find((log) => log.headingObserved)?.date || "";
  }

  function renderPaniclePanel() {
    const el = U.$("growthPaniclePanel");
    if (!el) return;
    const field = state.field(U.$("gField").value);
    const variety = field ? state.variety(field.varietyId) : null;
    const lengthValue = U.$("gPanicleLengthMm") && U.$("gPanicleLengthMm").value;
    const date = U.$("gDate").value || U.today();
    if (!field || !/コシヒカリ/.test(String(variety && variety.name || ""))) {
      el.innerHTML = `
        <div class="growth-panicle-card idle">
          <div><b>幼穂の記録</b><span>${U.escapeHTML(variety && variety.name || "品種未設定")}</span></div>
          <p>幼穂長は記録できます。出穂予測の基準はこの品種では準備中です</p>
        </div>
      `;
      return;
    }
    const headingDate = observedHeadingDate(field.fieldId);
    const latest = latestPanicleLog(field.fieldId, date);
    const previous = previousPanicleReference(field.fieldId, date);
    const existingLength = latest && latest.panicleLengthMm;
    const observedDate = lengthValue || !latest ? date : latest.date;
    const estimate = RiceOS.agro && RiceOS.agro.panicleEstimate
      ? RiceOS.agro.panicleEstimate(field, lengthValue || existingLength, observedDate)
      : null;
    if (headingDate) {
      el.innerHTML = `
        <div class="growth-panicle-card complete">
          <div><b>幼穂・出穂予測</b><span>コシヒカリ基準</span></div>
          <strong>出穂確認済み</strong>
          <p>${U.escapeHTML(U.fd(headingDate))} を実績として登録済みです</p>
        </div>
      `;
      return;
    }
    if (latest && !lengthValue) {
      el.innerHTML = `
        <div class="growth-panicle-card complete">
          <div><b>幼穂確認済み</b><span>再測定は不要</span></div>
          <strong>${U.escapeHTML(String(existingLength))}mm を ${U.escapeHTML(U.fd(latest.date))} に記録</strong>
          <p>${estimate && estimate.supported ? `出穂目安 ${U.fd(estimate.date)}ごろ` : "次は葉色と出穂確認を記録"}</p>
          <small>${previous ? `前年は ${U.fd(previous.log.date)}${previous.dap === "" ? "" : `（田植後${previous.dap}日）`}` : "修正する場合は生育タイムラインからこの記録を編集します"}</small>
        </div>
      `;
      return;
    }
    if (!estimate || !estimate.supported) {
      el.innerHTML = `
        <div class="growth-panicle-card idle">
          <div><b>幼穂・出穂予測</b><span>コシヒカリ基準</span></div>
          <p>幼穂長を入力すると、出穂の目安を表示します</p>
          <small>${previous ? `前年の確認: ${U.fd(previous.log.date)}${previous.dap === "" ? "" : ` / 田植後${previous.dap}日`}` : "1mm: 約25日前 / 2mm: 約21日前 / 10mm: 約18日前"}</small>
        </div>
      `;
      return;
    }
    el.innerHTML = `
      <div class="growth-panicle-card">
        <div><b>幼穂・出穂予測</b><span>${U.escapeHTML(estimate.source)}</span></div>
        <strong>出穂まで あと約${U.escapeHTML(String(estimate.daysToHeading))}日</strong>
        <p>出穂目安 ${U.escapeHTML(U.fd(estimate.date))}ごろ</p>
        <small>幼穂 ${U.escapeHTML(String(estimate.lengthMm))}mm / ${U.escapeHTML(estimate.stage)} / 予測幅 ${U.escapeHTML(U.fd(estimate.rangeStart))}〜${U.escapeHTML(U.fd(estimate.rangeEnd))}${previous ? ` / 前年確認 ${U.escapeHTML(U.fd(previous.log.date))}${previous.dap === "" ? "" : `（田植後${U.escapeHTML(String(previous.dap))}日）`}` : ""}</small>
      </div>
    `;
  }

  function resetForm() {
    U.$("growthHeading").textContent = "生育ログ";
    U.$("editGrowthId").value = "";
    U.$("gDate").value = U.today();
    if (state.activeFields()[0]) U.$("gField").value = state.activeFields()[0].fieldId;
    if (U.$("gLeafCount")) U.$("gLeafCount").value = "";
    if (U.$("gTillerCount")) U.$("gTillerCount").value = "";
    if (U.$("gPlantHeight")) U.$("gPlantHeight").value = "";
    if (U.$("gPanicleLengthMm")) U.$("gPanicleLengthMm").value = "";
    U.$("gLeaf").value = "3";
    if (U.$("gHeadingObserved")) U.$("gHeadingObserved").checked = false;
    U.$("gPhoto").value = "";
    U.$("gPhotoFile").value = "";
    U.$("gMemo").value = "";
    U.$("gPhotoPreview").src = "";
    U.$("gPhotoPreview").dataset.photoData = "";
    U.$("gPhotoPreview").classList.add("hidden");
    clearBulkFields();
    if (U.$("gPanicleTargetMode")) U.$("gPanicleTargetMode").value = "field";
    renderChoiceControls();
    renderPanicleEntryState();
    renderPanicleTargets();
    renderPaniclePanel();
    renderTargetPanel();
  }

  function prefillField(fieldId) {
    resetForm();
    U.$("gField").value = fieldId;
    renderPanicleEntryState();
    renderPanicleTargets();
    renderPaniclePanel();
    renderTargetPanel();
  }

  function prefillDate(date, fieldId) {
    resetForm();
    U.$("gDate").value = date || U.today();
    if (fieldId) U.$("gField").value = fieldId;
    renderPanicleEntryState();
    renderPanicleTargets();
    renderPaniclePanel();
    renderTargetPanel();
  }

  function prefillFields(date, fieldIds) {
    resetForm();
    U.$("gDate").value = date || U.today();
    setBulkFields(fieldIds || []);
    if (bulkFieldIds[0]) U.$("gField").value = bulkFieldIds[0];
    renderPanicleEntryState();
    renderPanicleTargets();
    renderPaniclePanel();
    renderTargetPanel();
    U.toast(`${bulkFieldIds.length}圃場へ同じ生育ログを登録します`);
  }

  function renderOptions() {
    U.setOptions(U.$("gField"), state.activeFields().map((f) => ({ value: f.fieldId, label: f.name })), U.$("gField").value);
    if (U.$("growthFilterField")) {
      U.setOptions(U.$("growthFilterField"), [{ value: "all", label: "全圃場" }, ...state.activeFields().map((f) => ({ value: f.fieldId, label: f.name }))], U.$("growthFilterField").value || "all");
    }
    if (U.$("growthRange")) {
      U.setOptions(U.$("growthRange"), [
        { value: "day", label: "日" },
        { value: "week", label: "週" },
        { value: "month", label: "月" },
        { value: "season", label: "シーズン" }
      ], U.$("growthRange").value || "season");
    }
    U.setOptions(U.$("gLeaf"), S.LEAF_COLOR_LEVELS.map((level) => ({ value: level.value, label: level.label })), U.$("gLeaf").value || "3");
    renderChoiceControls();
    renderPanicleEntryState();
    renderPanicleTargets();
    renderPaniclePanel();
    renderTargetPanel();
  }

  function compareCard(label, log) {
    if (!log) {
      return `<div class="growth-compare-card empty"><b>${U.escapeHTML(label)}</b><span>記録なし</span></div>`;
    }
    const field = state.field(log.fieldId);
    const dap = U.daysAfterPlanting(field, log.date);
    return `
      <div class="growth-compare-card">
        <b>${U.escapeHTML(label)} ${U.escapeHTML(U.fd(log.date))}</b>
        <span>${U.escapeHTML(field && field.name || "")}${dap !== "" ? ` / 田植後${U.escapeHTML(String(dap))}日` : ""}</span>
        <small>分げつ ${U.escapeHTML(log.tillerCount || "-")} / 葉数 ${U.escapeHTML(log.leafCount || "-")} / 草丈 ${U.escapeHTML(log.plantHeightCm || "-")}cm</small>
        ${log.photoData ? `<img src="${U.attr(log.photoData)}" alt="">` : ""}
      </div>
    `;
  }

  function renderComparePanel() {
    const panel = U.$("growthComparePanel");
    if (!panel) return;
    const fieldId = U.$("growthFilterField") && U.$("growthFilterField").value !== "all" ? U.$("growthFilterField").value : U.$("gField").value;
    const logs = state.data().growthLogs
      .filter((log) => !fieldId || log.fieldId === fieldId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const latest = logs[0];
    const range = U.lastYearSamePeriod(latest ? latest.date : U.today(), 14);
    const lastYear = logs.find((log) => U.inDateRange(log.date, range.start, range.end));
    panel.innerHTML = `
      <div class="section-title compact">
        <h3>写真・去年比較</h3>
        <span class="muted">${U.escapeHTML(U.fd(range.start))} - ${U.escapeHTML(U.fd(range.end))}</span>
      </div>
      <div class="growth-compare-grid">
        ${compareCard("今年", latest)}
        ${compareCard("去年同時期", lastYear)}
      </div>
    `;
  }

  function renderTimeline() {
    const fieldFilter = U.$("growthFilterField") ? U.$("growthFilterField").value || "all" : "all";
    const range = U.$("growthRange") ? U.$("growthRange").value || "season" : "season";
    let rows = state.data().growthLogs.slice();
    if (fieldFilter !== "all") rows = rows.filter((log) => log.fieldId === fieldFilter);
    if (range === "day") rows = rows.filter((log) => log.date === U.today());
    if (range === "week") rows = rows.filter((log) => U.daysSince(log.date) !== "" && U.daysSince(log.date) <= 7);
    if (range === "month") rows = rows.filter((log) => U.daysSince(log.date) !== "" && U.daysSince(log.date) <= 31);
    rows = rows.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 80);
    U.$("growthCount").textContent = `${rows.length}件`;
    const timeline = U.$("growthTimelineSection");
    if (timeline) timeline.open = timelineOpen;
    renderLatestPanel(rows);
    U.$("growthTimeline").innerHTML = rows.length ? rows.map((log) => {
      const field = state.field(log.fieldId);
      const variety = field ? state.variety(field.varietyId) : null;
      const dap = U.daysAfterPlanting(field, log.date);
      const leafScore = RiceOS.alerts.leafScore(log);
      const score = Math.max(1, Math.min(5, Math.round(U.number(leafScore, 3))));
      const day = new Date(`${log.date}T00:00:00`);
      const shortDate = Number.isNaN(day.getTime()) ? "-" : `${day.getMonth() + 1}/${day.getDate()}`;
      const target = variety && variety.targetTillers || "";
      const photo = log.photoData || "";
      const targetText = target && log.tillerCount ? `分げつ目標 ${target} / 現在 ${log.tillerCount}本` : "";
      const panicle = RiceOS.agro && RiceOS.agro.panicleEstimate
        ? RiceOS.agro.panicleEstimate(field, log.panicleLengthMm, log.date)
        : null;
      const panicleText = panicle && panicle.supported
        ? `幼穂 ${panicle.lengthMm}mm / 出穂まで約${panicle.daysToHeading}日 / ${U.fd(panicle.date)}ごろ`
        : (log.panicleLengthMm ? `幼穂 ${log.panicleLengthMm}mm` : "");
      return `
        <article class="growth-card timeline-card ${photo ? "has-photo" : ""}">
          <time class="timeline-date-badge" datetime="${U.attr(log.date)}" title="${U.attr(U.fd(log.date))}">
            <b>${U.escapeHTML(shortDate)}</b><span>${U.escapeHTML(U.weekday(log.date))}</span>
          </time>
          <div class="timeline-card-body">
            <div class="timeline-card-head compact">
              <div>
                <b>${U.escapeHTML(field && field.name || "圃場")}</b>
                <span>${U.escapeHTML(variety && variety.name || "品種未設定")}${dap !== "" ? ` / 田植後${U.escapeHTML(String(dap))}日` : ""}</span>
              </div>
              <div class="timeline-leaf-gauge" aria-label="葉色 ${U.attr(String(score))}">
                <small>葉色</small><b>${U.escapeHTML(String(score))}</b>
                <i>${"●".repeat(score)}${"○".repeat(Math.max(0, 5 - score))}</i>
              </div>
            </div>
            <div class="metric-row timeline-metrics">
              <span><small>葉数</small><b>${U.escapeHTML(log.leafCount || "-")}</b></span>
              <span><small>分げつ</small><b>${U.escapeHTML(log.tillerCount || "-")}</b><em>本</em></span>
              <span><small>草丈</small><b>${U.escapeHTML(log.plantHeightCm || "-")}</b><em>cm</em></span>
            </div>
            ${targetText ? `<div class="target-note timeline-target-note">${U.escapeHTML(targetText)}</div>` : ""}
            ${panicleText ? `<div class="timeline-panicle-note compact">🌾 ${U.escapeHTML(panicleText)}</div>` : ""}
            ${log.memo ? `<p class="timeline-memo">${U.escapeHTML(log.memo)}</p>` : ""}
            ${log.photo && !photo ? `<small class="muted">写真: ${U.escapeHTML(log.photo)}</small>` : ""}
          </div>
          ${photo ? `<img class="timeline-photo-thumb" src="${U.attr(photo)}" alt="${U.attr(field && field.name || "生育写真")}">` : ""}
          <details class="timeline-menu">
            <summary aria-label="この記録を操作" title="操作メニュー">…</summary>
            <div><button class="secondary" data-growth-action="edit" data-id="${U.attr(log.logId)}">編集</button><button class="danger" data-growth-action="delete" data-id="${U.attr(log.logId)}">削除</button></div>
          </details>
        </article>
      `;
    }).join("") : '<div class="empty timeline-empty"><b>まだ生育ログはありません。</b><span>記録を追加すると、写真・葉色・分げつ・草丈がタイムラインで並びます。</span></div>';
    renderComparePanel();
  }

  function latestDelta(latest, previous, key, suffix) {
    const now = U.number(latest && latest[key], NaN);
    const before = U.number(previous && previous[key], NaN);
    if (!Number.isFinite(now) || !Number.isFinite(before)) return "前回比較なし";
    const delta = Math.round((now - before) * 10) / 10;
    return `${delta > 0 ? "+" : ""}${delta}${suffix || ""}`;
  }

  function renderLatestPanel(rows) {
    const panel = U.$("growthLatestPanel");
    if (!panel) return;
    const latest = rows[0];
    if (!latest) {
      panel.innerHTML = '<div class="growth-latest-empty"><b>まだ生育記録はありません</b><span>今日の観察から始めましょう</span></div>';
      return;
    }
    const field = state.field(latest.fieldId);
    const previous = rows.filter((item) => item.fieldId === latest.fieldId && item.logId !== latest.logId)[0];
    const leaf = latest.leafColorScore || S.leafColorScoreFromText(latest.leafColor) || "-";
    const panicle = latest.panicleLengthMm ? `${latest.panicleLengthMm}mm` : "未入力";
    panel.innerHTML = `
      <div class="growth-latest-head"><div><b>最新の生育</b><span>${U.escapeHTML(field && field.name || "圃場")} / ${U.escapeHTML(U.fd(latest.date))}</span></div>${latest.photoData ? `<img src="${U.attr(latest.photoData)}" alt="">` : ""}</div>
      <div class="growth-latest-metrics">
        <span>葉色<b>${U.escapeHTML(String(leaf))}</b></span>
        <span>分げつ<b>${U.escapeHTML(latest.tillerCount || "-")}</b><small>${U.escapeHTML(latestDelta(latest, previous, "tillerCount", "本"))}</small></span>
        <span>草丈<b>${U.escapeHTML(latest.plantHeightCm || "-")}</b><small>cm</small></span>
        <span>幼穂<b>${U.escapeHTML(panicle)}</b><small>${U.escapeHTML(latestDelta(latest, previous, "panicleLengthMm", "mm"))}</small></span>
      </div>
    `;
  }

  function render() {
    renderOptions();
    setInputMode(inputMode);
    renderTimeline();
  }

  function fillEdit(log) {
    U.$("growthHeading").textContent = "生育ログを編集";
    U.$("editGrowthId").value = log.logId;
    U.$("gDate").value = log.date;
    U.$("gField").value = log.fieldId;
    if (U.$("gLeafCount")) U.$("gLeafCount").value = log.leafCount || "";
    if (U.$("gTillerCount")) U.$("gTillerCount").value = log.tillerCount || "";
    if (U.$("gPlantHeight")) U.$("gPlantHeight").value = log.plantHeightCm || "";
    if (U.$("gPanicleLengthMm")) U.$("gPanicleLengthMm").value = log.panicleLengthMm || "";
    U.$("gLeaf").value = log.leafColorScore || S.leafColorScoreFromText(log.leafColor) || "3";
    if (U.$("gHeadingObserved")) U.$("gHeadingObserved").checked = Boolean(log.headingObserved);
    U.$("gPhoto").value = log.photo || "";
    U.$("gMemo").value = log.memo || "";
    U.$("gPhotoFile").value = "";
    U.$("gPhotoPreview").dataset.photoData = log.photoData || "";
    U.$("gPhotoPreview").src = log.photoData || "";
    U.$("gPhotoPreview").classList.toggle("hidden", !log.photoData);
    if (log.leafCount || log.plantHeightCm) {
      setInputMode("detail");
    }
    renderChoiceControls();
    renderPanicleEntryState();
    renderPaniclePanel();
    renderTargetPanel();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editLog(logId) {
    const log = state.data().growthLogs.find((item) => item.logId === logId);
    if (log) fillEdit(log);
  }

  function saveHeadingObservedOnly() {
    if (!U.$("gField").value) {
      alert("圃場を選んでください。");
      return;
    }
    const field = state.field(U.$("gField").value);
    state.saveGrowthLog({
      date: U.$("gDate").value || U.today(),
      fieldId: U.$("gField").value,
      leafColorScore: U.$("gLeaf").value || "3",
      leafColor: S.leafColorLabel(U.$("gLeaf").value || "3"),
      weed: "-",
      gas: "-",
      water: "-",
      headingObserved: true,
      memo: U.$("gMemo").value || "出穂確認"
    });
    U.toast(`${field && field.name || "圃場"} の出穂を登録しました`);
    resetForm();
  }

  function bind() {
    U.$("growthForm").addEventListener("click", (event) => {
      const modeButton = event.target.closest("[data-growth-mode-select]");
      if (modeButton) {
        setInputMode(modeButton.dataset.growthModeSelect);
        return;
      }
      const quickHeading = event.target.closest('[data-action="save-heading-observed"]');
      if (quickHeading) {
        saveHeadingObservedOnly();
        return;
      }
      const button = event.target.closest("[data-growth-select]");
      if (!button) return;
      const select = U.$(button.dataset.growthSelect);
      if (!select) return;
      select.value = button.dataset.growthValue;
      renderChoiceControls();
      renderTargetPanel();
    });

    ["gField", "gDate", "gTillerCount", "gLeafCount", "gPlantHeight", "gPanicleLengthMm", "gLeaf", "gHeadingObserved"].forEach((id) => {
      const el = U.$(id);
      if (!el) return;
      el.addEventListener("input", () => {
        renderChoiceControls();
        renderPanicleEntryState();
        renderPaniclePanel();
        renderPanicleTargets();
        renderTargetPanel();
      });
      el.addEventListener("change", () => {
        renderChoiceControls();
        renderPanicleEntryState();
        renderPaniclePanel();
        renderPanicleTargets();
        renderTargetPanel();
      });
    });

    U.$("gPhotoFile").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await U.imageFileToDataUrl(file);
        U.$("gPhotoPreview").src = dataUrl;
        U.$("gPhotoPreview").dataset.photoData = dataUrl;
        U.$("gPhotoPreview").classList.remove("hidden");
        if (!U.$("gPhoto").value) U.$("gPhoto").value = file.name || "写真あり";
        U.toast("写真を追加しました");
      } catch (error) {
        alert(error.message);
      }
    });

    U.$("growthForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!U.$("gField").value) {
        alert("圃場を選んでください。");
        return;
      }
      const existing = state.data().growthLogs.find((log) => log.logId === U.$("editGrowthId").value);
      const common = {
        logId: U.$("editGrowthId").value,
        date: U.$("gDate").value,
        leafCount: U.$("gLeafCount") ? U.$("gLeafCount").value : "",
        tillerCount: U.$("gTillerCount") ? U.$("gTillerCount").value : "",
        plantHeightCm: U.$("gPlantHeight") ? U.$("gPlantHeight").value : "",
        panicleLengthMm: U.$("gPanicleLengthMm") ? U.$("gPanicleLengthMm").value : "",
        leafColorScore: U.$("gLeaf").value,
        leafColor: S.leafColorLabel(U.$("gLeaf").value),
        weed: existing ? existing.weed || "-" : "-",
        gas: existing ? existing.gas || "-" : "-",
        water: existing ? existing.water || "-" : "-",
        headingObserved: U.$("gHeadingObserved") ? U.$("gHeadingObserved").checked : false,
        photo: U.$("gPhoto").value,
        photoData: U.$("gPhotoPreview").dataset.photoData || "",
        memo: U.$("gMemo").value
      };
      const groupName = U.$("gPanicleTargetMode") && U.$("gPanicleTargetMode").value === "group" ? U.$("gPanicleGroup").value : "";
      const groupFields = groupName ? (fieldGroups().find((group) => group.name === groupName) || { fields: [] }).fields.map((field) => field.fieldId) : [];
      const targets = !common.logId && groupFields.length && common.panicleLengthMm
        ? groupFields
        : (!common.logId && bulkFieldIds.length > 1 ? bulkFieldIds : [U.$("gField").value]);
      targets.forEach((fieldId) => state.saveGrowthLog({
        ...common,
        logId: targets.length > 1 ? "" : common.logId,
        fieldId
      }));
      resetForm();
    });

    U.$("growthTimeline").addEventListener("click", (event) => {
      const button = event.target.closest("[data-growth-action]");
      if (!button) return;
      const id = button.dataset.id;
      const log = state.data().growthLogs.find((item) => item.logId === id);
      if (!log) return;
      if (button.dataset.growthAction === "delete") {
        if (confirm("この生育ログを削除しますか？")) state.deleteGrowthLog(id);
        return;
      }
      fillEdit(log);
    });

    document.querySelector('[data-action="reset-growth"]').addEventListener("click", resetForm);
    if (U.$("growthFilterField")) U.$("growthFilterField").addEventListener("change", renderTimeline);
    if (U.$("growthRange")) U.$("growthRange").addEventListener("change", renderTimeline);
    if (U.$("gPanicleTargetMode")) U.$("gPanicleTargetMode").addEventListener("change", renderPanicleTargets);
    if (U.$("gPanicleGroup")) U.$("gPanicleGroup").addEventListener("change", renderPanicleTargets);
    if (U.$("growthTimelineSection")) U.$("growthTimelineSection").addEventListener("toggle", () => {
      timelineOpen = U.$("growthTimelineSection").open;
      localStorage.setItem("riceGrowthTimelineOpen", timelineOpen ? "1" : "0");
    });
    document.querySelector('[data-action="growth-quick-input"]').addEventListener("click", () => {
      U.$("growthBasicSection").open = true;
      U.$("gDate").value = U.today();
      U.$("growthForm").scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => U.$("gTillerCount").focus(), 350);
    });
    document.querySelector('[data-action="growth-bulk-panicle"]').addEventListener("click", () => {
      U.$("growthPanicleSection").open = true;
      U.$("gPanicleTargetMode").value = "group";
      renderPanicleTargets();
      U.$("growthPanicleSection").scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => U.$("gPanicleLengthMm").focus(), 350);
    });
    document.querySelector('[data-action="clear-growth-photo"]').addEventListener("click", () => {
      U.$("gPhotoFile").value = "";
      U.$("gPhotoPreview").src = "";
      U.$("gPhotoPreview").dataset.photoData = "";
      U.$("gPhotoPreview").classList.add("hidden");
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.growth = { render, bind, resetForm, prefillField, prefillDate, prefillFields, editLog };
})();
