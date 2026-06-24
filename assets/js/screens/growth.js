(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

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
    renderChips("gWeedChips", "gWeed", S.GROWTH_LEVELS);
    renderChips("gGasChips", "gGas", S.GROWTH_LEVELS);
    renderChips("gWaterChips", "gWater", S.WATER_LEVELS);
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
    const range = parseTargetRange(target);
    let targetLine = "分げつ目標は栽培レシピで設定できます。";
    let pct = 0;
    if (range && tillers > 0) {
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
        <i><span style="width:${U.attr(String(pct || 18))}%"></span></i>
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
    U.$("gLeaf").value = "3";
    U.$("gWeed").value = "-";
    U.$("gGas").value = "-";
    U.$("gWater").value = "-";
    U.$("gPhoto").value = "";
    U.$("gPhotoFile").value = "";
    U.$("gMemo").value = "";
    U.$("gPhotoPreview").src = "";
    U.$("gPhotoPreview").dataset.photoData = "";
    U.$("gPhotoPreview").classList.add("hidden");
    renderChoiceControls();
    renderTargetPanel();
  }

  function prefillField(fieldId) {
    resetForm();
    U.$("gField").value = fieldId;
  }

  function prefillDate(date, fieldId) {
    resetForm();
    U.$("gDate").value = date || U.today();
    if (fieldId) U.$("gField").value = fieldId;
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
    U.setOptions(U.$("gWeed"), S.GROWTH_LEVELS, U.$("gWeed").value || "-");
    U.setOptions(U.$("gGas"), S.GROWTH_LEVELS, U.$("gGas").value || "-");
    U.setOptions(U.$("gWater"), S.WATER_LEVELS, U.$("gWater").value || "-");
    renderChoiceControls();
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
    U.$("growthCount").textContent = `${state.data().growthLogs.length}件`;
    U.$("growthTimeline").innerHTML = rows.length ? rows.map((log) => {
      const field = state.field(log.fieldId);
      const variety = field ? state.variety(field.varietyId) : null;
      const dap = U.daysAfterPlanting(field, log.date);
      const leafScore = RiceOS.alerts.leafScore(log);
      const score = Math.max(1, Math.min(5, Math.round(U.number(leafScore, 3))));
      const target = variety && variety.targetTillers || "";
      const photo = log.photoData || "";
      const targetText = target && log.tillerCount ? `分げつ目標 ${target} / 現在 ${log.tillerCount}本` : "";
      return `
        <article class="growth-card timeline-card">
          <div class="growth-date">
            <b>${U.escapeHTML(U.fd(log.date))}</b>
            <span>${U.escapeHTML(field && field.name || "圃場")}</span>
          </div>
          <div class="timeline-card-body">
            <div class="timeline-card-head">
              <div>
                <b>葉色：${U.escapeHTML(log.leafColor || S.leafColorLabel(score))}</b>
                <span>${U.escapeHTML(variety && variety.name || "品種未設定")}${dap !== "" ? ` / 田植後${U.escapeHTML(String(dap))}日` : ""}</span>
              </div>
              ${photo ? '<span class="pill info">写真あり</span>' : log.photo ? '<span class="pill info">写真メモあり</span>' : ""}
            </div>
            <div class="timeline-leaves" aria-label="葉色${U.attr(String(score))}">
              ${"●".repeat(score)}${"○".repeat(Math.max(0, 5 - score))}
            </div>
            <div class="metric-row timeline-metrics">
              <span>葉数 <b>${U.escapeHTML(log.leafCount || "-")}</b></span>
              <span>分げつ <b>${U.escapeHTML(log.tillerCount || "-")}</b></span>
              <span>草丈 <b>${U.escapeHTML(log.plantHeightCm || "-")}</b>cm</span>
            </div>
            <div class="timeline-status-row">
              <span>雑草 ${U.escapeHTML(log.weed || "-")}</span>
              <span>ガス ${U.escapeHTML(log.gas || "-")}</span>
              <span>水 ${U.escapeHTML(log.water || "-")}</span>
            </div>
            ${targetText ? `<div class="target-note">${U.escapeHTML(targetText)}</div>` : ""}
            ${log.memo ? `<p class="timeline-memo">${U.escapeHTML(log.memo)}</p>` : ""}
            ${log.photo && !photo ? `<small class="muted">写真: ${U.escapeHTML(log.photo)}</small>` : ""}
          </div>
          <div class="growth-photo-frame ${photo ? "" : "empty"}">
            ${photo ? `<img src="${U.attr(photo)}" alt="">` : "<span>写真</span>"}
          </div>
          <div class="record-actions timeline-actions">
            <button class="secondary" data-growth-action="edit" data-id="${U.attr(log.logId)}">編集</button>
            <button class="danger" data-growth-action="delete" data-id="${U.attr(log.logId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty timeline-empty"><b>まだ生育ログはありません。</b><span>記録を追加すると、写真・葉色・分げつ・草丈がタイムラインで並びます。</span></div>';
    renderComparePanel();
  }

  function render() {
    renderOptions();
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
    U.$("gLeaf").value = log.leafColorScore || S.leafColorScoreFromText(log.leafColor) || "3";
    U.$("gWeed").value = log.weed || "-";
    U.$("gGas").value = log.gas || "-";
    U.$("gWater").value = log.water || "-";
    U.$("gPhoto").value = log.photo || "";
    U.$("gMemo").value = log.memo || "";
    U.$("gPhotoFile").value = "";
    U.$("gPhotoPreview").dataset.photoData = log.photoData || "";
    U.$("gPhotoPreview").src = log.photoData || "";
    U.$("gPhotoPreview").classList.toggle("hidden", !log.photoData);
    renderChoiceControls();
    renderTargetPanel();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editLog(logId) {
    const log = state.data().growthLogs.find((item) => item.logId === logId);
    if (log) fillEdit(log);
  }

  function bind() {
    U.$("growthForm").addEventListener("click", (event) => {
      const button = event.target.closest("[data-growth-select]");
      if (!button) return;
      const select = U.$(button.dataset.growthSelect);
      if (!select) return;
      select.value = button.dataset.growthValue;
      renderChoiceControls();
      renderTargetPanel();
    });

    ["gField", "gDate", "gTillerCount", "gLeafCount", "gPlantHeight", "gLeaf", "gWeed", "gGas", "gWater"].forEach((id) => {
      const el = U.$(id);
      if (!el) return;
      el.addEventListener("input", () => {
        renderChoiceControls();
        renderTargetPanel();
      });
      el.addEventListener("change", () => {
        renderChoiceControls();
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
      state.saveGrowthLog({
        logId: U.$("editGrowthId").value,
        date: U.$("gDate").value,
        fieldId: U.$("gField").value,
        leafCount: U.$("gLeafCount") ? U.$("gLeafCount").value : "",
        tillerCount: U.$("gTillerCount") ? U.$("gTillerCount").value : "",
        plantHeightCm: U.$("gPlantHeight") ? U.$("gPlantHeight").value : "",
        leafColorScore: U.$("gLeaf").value,
        leafColor: S.leafColorLabel(U.$("gLeaf").value),
        weed: U.$("gWeed").value,
        gas: U.$("gGas").value,
        water: U.$("gWater").value,
        photo: U.$("gPhoto").value,
        photoData: U.$("gPhotoPreview").dataset.photoData || "",
        memo: U.$("gMemo").value
      });
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
    document.querySelector('[data-action="clear-growth-photo"]').addEventListener("click", () => {
      U.$("gPhotoFile").value = "";
      U.$("gPhotoPreview").src = "";
      U.$("gPhotoPreview").dataset.photoData = "";
      U.$("gPhotoPreview").classList.add("hidden");
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.growth = { render, bind, resetForm, prefillField, prefillDate, editLog };
})();
