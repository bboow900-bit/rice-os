(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;
  let bulkFieldIds = [];
  let dryWeatherCacheKey = "";
  let dryWeatherRows = [];
  let dryWeatherError = "";

  function setBulkFields(ids) {
    bulkFieldIds = (ids || []).filter(Boolean);
  }

  function clearBulkFields() {
    bulkFieldIds = [];
  }

  function firstFieldId() {
    const field = state.activeFields()[0] || state.fields()[0];
    return field ? field.fieldId : "";
  }

  function currentField() {
    return state.field(U.$("dryField").value) || state.field(firstFieldId());
  }

  function setEndFromDays() {
    const start = U.$("dryStartDate").value;
    const days = U.number(U.$("dryTargetDays").value, 0);
    if (start && days > 0) {
      U.$("dryEndDate").value = U.dateAddDays(start, days);
    }
  }

  function setDaysFromEnd() {
    const start = U.$("dryStartDate").value;
    const end = U.$("dryEndDate").value;
    const days = U.daysBetween(start, end);
    if (days !== "" && days >= 0) U.$("dryTargetDays").value = String(days);
  }

  function periodStats(startDate, plannedEndDate, actualEndDate) {
    const planned = startDate && plannedEndDate ? U.daysBetween(startDate, plannedEndDate) : "";
    const actual = startDate && actualEndDate ? U.daysBetween(startDate, actualEndDate) : "";
    const diff = planned !== "" && actual !== "" ? actual - planned : "";
    return { planned, actual, diff };
  }

  function diffLabel(diff) {
    if (diff === "") return "";
    if (diff === 0) return "予定どおり";
    return diff > 0 ? `+${diff}日` : `${diff}日`;
  }

  function soilAdjustment(field) {
    const reasons = [];
    let days = 0;
    const soil = String(field && field.soilType || "");
    const water = String(field && field.waterHolding || "");
    const features = Array.isArray(field && field.fieldFeatures) ? field.fieldFeatures : [];
    if (soil.includes("粘土")) { days += 1; reasons.push("粘土質 +1日"); }
    if (soil.includes("砂")) { days -= 1; reasons.push("砂質 -1日"); }
    if (water === "良い") { days += 1; reasons.push("水持ち良い +1日"); }
    if (water === "悪い") { days -= 1; reasons.push("水持ち悪い -1日"); }
    if (features.includes("湿田")) { days += 1; reasons.push("湿田 +1日"); }
    if (features.includes("乾田")) { days -= 1; reasons.push("乾田 -1日"); }
    return { days, reasons };
  }

  function weatherAdjustment(rows) {
    const valid = (rows || []).filter((row) => row && row.date);
    const rainDays = valid.filter((row) => U.number(row.precipitation, 0) >= 1).length;
    const rainTotal = valid.reduce((sum, row) => sum + U.number(row.precipitation, 0), 0);
    const hotDryDays = valid.filter((row) => U.number(row.precipitation, 0) < 1 && U.number(row.tempMean, 0) >= 24).length;
    let days = 0;
    const reasons = [];
    if (rainDays >= 2) { days += 1; reasons.push(`雨${rainDays}日 +1日`); }
    if (rainTotal >= 20) { days += 1; reasons.push(`降水${Math.round(rainTotal)}mm +1日`); }
    if (hotDryDays >= 3) { days -= 1; reasons.push(`高温少雨${hotDryDays}日 -1日`); }
    return { days, reasons, rainDays, rainTotal, hotDryDays };
  }

  function renderDryAdjustment() {
    const el = U.$("dryWeatherAdjust");
    if (!el) return;
    const field = currentField();
    const start = U.$("dryStartDate").value;
    const targetDays = U.number(U.$("dryTargetDays").value, 0);
    if (!field || !start || !targetDays) {
      el.innerHTML = "";
      return;
    }
    const soil = soilAdjustment(field);
    const weather = weatherAdjustment(dryWeatherRows);
    const total = soil.days + weather.days;
    const suggestedDays = Math.max(1, targetDays + total);
    const suggestedDate = U.dateAddDays(start, suggestedDays);
    const tone = total > 0 ? "slow" : total < 0 ? "fast" : "normal";
    const reasons = [...soil.reasons, ...weather.reasons];
    el.innerHTML = `
      <div class="dry-adjust-card ${U.attr(tone)}">
        <div>
          <b>中干し終了確認候補</b>
          <span>${U.escapeHTML(`予定${targetDays}日 → 目安${suggestedDays}日目ごろ`)}</span>
        </div>
        <strong>${U.escapeHTML(U.fd(suggestedDate))}</strong>
        <p>${U.escapeHTML(total > 0 ? "乾きが遅れそう。現場確認を優先。" : total < 0 ? "乾きが早そう。早めに現場確認。" : "予定どおりを基本に現場確認。")}</p>
        <small>${U.escapeHTML(reasons.length ? reasons.join(" / ") : "土質・天気補正なし")}</small>
        ${dryWeatherError ? `<small class="warn-text">${U.escapeHTML(dryWeatherError)}</small>` : ""}
      </div>
    `;
  }

  async function hydrateDryWeather() {
    if (!RiceOS.weather || !RiceOS.weather.fetchDailyRange) {
      dryWeatherError = "天気取得機能が利用できません";
      renderDryAdjustment();
      return;
    }
    const start = U.$("dryDate").value || U.today();
    const end = U.dateAddDays(start, 7);
    const location = state.data().meta && state.data().meta.weatherLocation;
    const key = [start, end, location && location.latitude, location && location.longitude].join(":");
    if (key === dryWeatherCacheKey) {
      renderDryAdjustment();
      return;
    }
    dryWeatherCacheKey = key;
    dryWeatherError = "";
    try {
      if (!location || location.latitude === undefined) {
        dryWeatherRows = [];
        dryWeatherError = "天気位置未設定のため土質だけで補正中";
        renderDryAdjustment();
        return;
      }
      const loc = location;
      const result = await RiceOS.weather.fetchDailyRange(start, end, loc);
      dryWeatherRows = result.rows || [];
    } catch (error) {
      dryWeatherRows = [];
      dryWeatherError = "天気予報を取得できないため土質だけで補正中";
    }
    renderDryAdjustment();
  }

  function renderTargetCompare() {
    const field = currentField();
    const start = U.$("dryStartDate").value;
    const end = U.$("dryEndDate").value;
    const actualEnd = U.$("dryActualEndDate").value;
    const observed = U.$("dryDate").value || U.today();
    const elapsed = start ? U.daysBetween(start, observed) : "";
    const remaining = end && !actualEnd ? U.daysBetween(observed, end) : "";
    const stats = periodStats(start, end, actualEnd);
    const crack = U.$("dryCrackCm").value || "-";
    const sink = U.$("drySinkCm").value || "-";
    U.$("dryTargetCompare").innerHTML = `
      <div class="mini-card">
        <b>${U.escapeHTML(field && field.name || "圃場")}</b>
        <span>ひび割れ 目標 ${U.escapeHTML(field && field.targetCrackCm || "-")}cm / 現在 ${U.escapeHTML(crack)}cm</span>
        <span>沈み込み 目標 ${U.escapeHTML(field && field.targetSinkCm || "-")}cm / 現在 ${U.escapeHTML(sink)}cm</span>
        ${elapsed !== "" ? `<span>中干し ${U.escapeHTML(String(elapsed))}日目</span>` : ""}
        ${remaining !== "" ? `<span class="${remaining <= 1 ? "warn-text" : ""}">終了目安まであと ${U.escapeHTML(String(remaining))}日</span>` : ""}
        ${actualEnd ? `<span>実際の完了日 ${U.escapeHTML(U.fd(actualEnd))}</span>` : ""}
        ${stats.actual !== "" ? `<span>予定${U.escapeHTML(String(stats.planned))}日 / 実績${U.escapeHTML(String(stats.actual))}日 / ${U.escapeHTML(diffLabel(stats.diff))}</span>` : ""}
      </div>
    `;
    renderDryAdjustment();
  }

  function resetForm() {
    const field = state.field(firstFieldId());
    U.$("dryHeading").textContent = "中干し管理";
    U.$("editDryId").value = "";
    U.$("dryDate").value = U.today();
    U.$("dryField").value = field ? field.fieldId : "";
    U.$("dryStartDate").value = field && field.drainageStartDate || U.today();
    U.$("dryTargetDays").value = field && field.drainageTargetDays || "7";
    U.$("dryEndDate").value = "";
    setEndFromDays();
    U.$("dryActualEndDate").value = "";
    U.$("dryStatus").value = "実施中";
    U.$("dryCrackCm").value = "";
    U.$("drySinkCm").value = "";
    U.$("drySurface").value = "-";
    U.$("dryGas").value = "-";
    U.$("dryPhoto").value = "";
    U.$("dryPhotoFile").value = "";
    U.$("dryPhotoPreview").src = "";
    U.$("dryPhotoPreview").dataset.photoData = "";
    U.$("dryPhotoPreview").classList.add("hidden");
    U.$("dryMemo").value = "";
    clearBulkFields();
    renderTargetCompare();
  }

  function renderOptions() {
    const fieldValue = U.$("dryField").value || firstFieldId();
    U.setOptions(U.$("dryField"), state.activeFields().map((field) => ({ value: field.fieldId, label: field.name })), fieldValue);
    U.setOptions(U.$("dryStatus"), S.WATER_PERIOD_STATUS, U.$("dryStatus").value || "実施中");
    U.setOptions(U.$("drySurface"), S.DRY_SURFACE_LEVELS, U.$("drySurface").value || "-");
    U.setOptions(U.$("dryGas"), S.DRY_GAS_LEVELS, U.$("dryGas").value || "-");
  }

  function fillEdit(item) {
    U.$("dryHeading").textContent = "中干し記録を編集";
    U.$("editDryId").value = item.dryPeriodId;
    U.$("dryField").value = item.fieldId;
    U.$("dryDate").value = item.date;
    U.$("dryStartDate").value = item.startDate || "";
    U.$("dryEndDate").value = item.endDate || "";
    U.$("dryActualEndDate").value = item.actualEndDate || "";
    U.$("dryTargetDays").value = item.targetDays || "";
    U.$("dryStatus").value = item.status || (item.actualEndDate ? "完了" : "実施中");
    U.$("dryCrackCm").value = item.crackCm || "";
    U.$("drySinkCm").value = item.sinkCm || "";
    U.$("drySurface").value = item.surface || "-";
    U.$("dryGas").value = item.gas || "-";
    U.$("dryPhoto").value = item.photo || "";
    U.$("dryMemo").value = item.memo || "";
    U.$("dryPhotoFile").value = "";
    U.$("dryPhotoPreview").dataset.photoData = item.photoData || "";
    U.$("dryPhotoPreview").src = item.photoData || "";
    U.$("dryPhotoPreview").classList.toggle("hidden", !item.photoData);
    renderTargetCompare();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList() {
    const rows = (state.data().dryPeriods || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
    U.$("dryList").innerHTML = rows.length ? rows.map((item) => {
      const field = state.field(item.fieldId);
      const elapsed = item.startDate ? U.daysBetween(item.startDate, item.date) : "";
      const remaining = item.endDate ? U.daysBetween(item.date, item.endDate) : "";
      const stats = periodStats(item.startDate, item.endDate, item.actualEndDate);
      return `
        <article class="record water-record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(U.fd(item.date))} 中干し</b><br>
              <span class="pill info">${U.escapeHTML(field && field.name || "圃場")}</span>
              <span class="pill ok">${U.escapeHTML(item.status || (item.actualEndDate ? "完了" : "実施中"))}</span>
              ${elapsed !== "" ? `<span class="pill ok">${U.escapeHTML(String(elapsed))}日目</span>` : ""}
              ${remaining !== "" ? `<span class="pill warn">終了目安まで${U.escapeHTML(String(remaining))}日</span>` : ""}
              ${stats.actual !== "" ? `<span class="pill purple">予定${U.escapeHTML(String(stats.planned))}日 / 実績${U.escapeHTML(String(stats.actual))}日 / ${U.escapeHTML(diffLabel(stats.diff))}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            <div class="metric-row">
              <span>ひび <b>${U.escapeHTML(item.crackCm || "-")}</b>cm</span>
              <span>沈み込み <b>${U.escapeHTML(item.sinkCm || "-")}</b>cm</span>
              <span>田面 <b>${U.escapeHTML(item.surface || "-")}</b></span>
              <span>ガス <b>${U.escapeHTML(item.gas || "-")}</b></span>
            </div>
            ${item.photoData ? `<img class="thumb" src="${U.attr(item.photoData)}" alt="">` : ""}
            ${item.memo ? `<div>${U.escapeHTML(item.memo)}</div>` : ""}
          </div>
          <div class="record-actions">
            <button class="secondary" data-dry-action="edit" data-id="${U.attr(item.dryPeriodId)}">編集</button>
            <button class="danger" data-dry-action="delete" data-id="${U.attr(item.dryPeriodId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">中干し記録はまだありません。</div>';
  }

  function render() {
    renderOptions();
    renderTargetCompare();
    hydrateDryWeather();
    renderList();
  }

  function prefillDate(date, fieldId) {
    resetForm();
    U.$("dryDate").value = date || U.today();
    if (fieldId) U.$("dryField").value = fieldId;
    const field = currentField();
    if (field) {
      U.$("dryStartDate").value = field.drainageStartDate || U.$("dryStartDate").value;
      U.$("dryTargetDays").value = field.drainageTargetDays || U.$("dryTargetDays").value;
      setEndFromDays();
    }
    renderTargetCompare();
  }

  function prefillFields(date, fieldIds) {
    resetForm();
    U.$("dryDate").value = date || U.today();
    setBulkFields(fieldIds || []);
    if (bulkFieldIds[0]) U.$("dryField").value = bulkFieldIds[0];
    const field = currentField();
    if (field) {
      U.$("dryStartDate").value = field.drainageStartDate || U.$("dryStartDate").value;
      U.$("dryTargetDays").value = field.drainageTargetDays || U.$("dryTargetDays").value;
      setEndFromDays();
    }
    renderTargetCompare();
    U.toast(`${bulkFieldIds.length}圃場へ同じ中干し記録を登録します`);
  }

  function editDry(dryPeriodId) {
    const item = (state.data().dryPeriods || []).find((row) => row.dryPeriodId === dryPeriodId);
    if (item) fillEdit(item);
  }

  function bind() {
    U.$("dryForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (U.$("dryStatus").value === "完了" && !U.$("dryActualEndDate").value) {
        U.$("dryActualEndDate").value = U.$("dryDate").value || U.today();
      }
      const common = {
        dryPeriodId: U.$("editDryId").value,
        date: U.$("dryDate").value,
        status: U.$("dryStatus").value,
        startDate: U.$("dryStartDate").value,
        endDate: U.$("dryEndDate").value,
        actualEndDate: U.$("dryActualEndDate").value,
        targetDays: U.$("dryTargetDays").value,
        crackCm: U.$("dryCrackCm").value,
        sinkCm: U.$("drySinkCm").value,
        surface: U.$("drySurface").value,
        gas: U.$("dryGas").value,
        photo: U.$("dryPhoto").value,
        photoData: U.$("dryPhotoPreview").dataset.photoData || "",
        memo: U.$("dryMemo").value
      };
      const targets = !common.dryPeriodId && bulkFieldIds.length > 1 ? bulkFieldIds : [U.$("dryField").value];
      targets.forEach((fieldId) => state.saveDryPeriod({
        ...common,
        dryPeriodId: targets.length > 1 ? "" : common.dryPeriodId,
        fieldId
      }));
      resetForm();
    });

    U.$("dryPhotoFile").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await U.imageFileToDataUrl(file);
        U.$("dryPhotoPreview").src = dataUrl;
        U.$("dryPhotoPreview").dataset.photoData = dataUrl;
        U.$("dryPhotoPreview").classList.remove("hidden");
        if (!U.$("dryPhoto").value) U.$("dryPhoto").value = file.name || "写真あり";
      } catch (error) {
        alert(error.message);
      }
    });

    U.$("dryList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-dry-action]");
      if (!button) return;
      const id = button.dataset.id;
      const item = (state.data().dryPeriods || []).find((row) => row.dryPeriodId === id);
      if (!item) return;
      if (button.dataset.dryAction === "delete") {
        if (confirm("この中干し記録を削除しますか？")) state.deleteDryPeriod(id);
        return;
      }
      fillEdit(item);
    });

    ["dryField", "dryDate", "dryActualEndDate", "dryStatus", "dryCrackCm", "drySinkCm", "drySurface", "dryGas"].forEach((id) => U.$(id).addEventListener("change", () => {
      if (id === "dryActualEndDate" && U.$("dryActualEndDate").value) U.$("dryStatus").value = "完了";
      if (id === "dryStatus" && U.$("dryStatus").value === "完了" && !U.$("dryActualEndDate").value) U.$("dryActualEndDate").value = U.$("dryDate").value || U.today();
      renderTargetCompare();
      if (id === "dryField" || id === "dryDate") hydrateDryWeather();
    }));
    ["dryStartDate", "dryTargetDays"].forEach((id) => U.$(id).addEventListener("change", () => {
      setEndFromDays();
      renderTargetCompare();
      renderDryAdjustment();
    }));
    U.$("dryEndDate").addEventListener("change", () => {
      setDaysFromEnd();
      renderTargetCompare();
    });

    document.querySelector('[data-action="reset-dry"]').addEventListener("click", resetForm);
    document.querySelector('[data-action="clear-dry-photo"]').addEventListener("click", () => {
      U.$("dryPhotoFile").value = "";
      U.$("dryPhotoPreview").src = "";
      U.$("dryPhotoPreview").dataset.photoData = "";
      U.$("dryPhotoPreview").classList.add("hidden");
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.dryPeriod = { render, bind, resetForm, prefillDate, prefillFields, editDry };
})();
