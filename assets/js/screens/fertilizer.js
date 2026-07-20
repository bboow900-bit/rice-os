(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let activeSchedule = null;
  let afterSave = null;

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function format(value) {
    return Math.round(number(value) * 10) / 10;
  }

  function recipePlan(schedule) {
    const field = state.field((schedule.fieldIds || [])[0]);
    const variety = field ? state.variety(field.varietyId) : null;
    const rateText = String(schedule.plannedFertilizerRateKg10a || variety && variety.topDressingAmount || "");
    const rate = rateText.match(/\d+(?:\.\d+)?/);
    return {
      name: schedule.plannedFertilizerName || variety && variety.topDressingName || "",
      rate: rate ? rate[0] : ""
    };
  }

  function latestGrowth(fieldId, date) {
    return state.growthLogsFor(fieldId)
      .filter((log) => !date || String(log.date) <= String(date))
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function growthSnapshot(fieldId, date) {
    const log = latestGrowth(fieldId, date);
    return {
      logDate: log && log.date || "",
      panicleLengthMm: log && log.panicleLengthMm || "",
      leafColorScore: log && log.leafColorScore || "",
      leafColor: log && log.leafColor || "",
      tillerCount: log && log.tillerCount || "",
      plantHeightCm: log && log.plantHeightCm || ""
    };
  }

  function selectedFields() {
    return (activeSchedule && activeSchedule.fieldIds || []).map((fieldId) => state.field(fieldId)).filter(Boolean);
  }

  function totalArea() {
    return selectedFields().reduce((sum, field) => sum + number(field.areaA), 0);
  }

  function renderSummary() {
    const el = U.$("fertilizerScheduleSummary");
    if (!el || !activeSchedule) return;
    const plan = recipePlan(activeSchedule);
    el.innerHTML = `
      <div><b>${U.escapeHTML(activeSchedule.title || "追肥予定")}</b><span>${U.escapeHTML((selectedFields().map((field) => field.name).join("・")) || "圃場未設定")}</span></div>
      <small>予定日 ${U.escapeHTML(U.fd(activeSchedule.date))} / 予定量 ${U.escapeHTML(plan.rate ? `${plan.rate}kg/10a` : "未設定")}</small>
    `;
  }

  function renderGrowthContext() {
    const el = U.$("fertilizerGrowthContext");
    if (!el || !activeSchedule) return;
    const date = U.$("fertilizerDate").value || U.today();
    const cards = selectedFields().map((field) => {
      const snapshot = growthSnapshot(field.fieldId, date);
      const panicle = snapshot.panicleLengthMm ? `幼穂 ${snapshot.panicleLengthMm}mm` : "幼穂 未入力";
      const leaf = snapshot.leafColorScore ? `葉色 ${snapshot.leafColorScore}` : "葉色 未入力";
      const tiller = snapshot.tillerCount ? `分げつ ${snapshot.tillerCount}本` : "分げつ 未入力";
      return `
        <article class="fertilizer-growth-card">
          <b>${U.escapeHTML(field.name)}</b>
          <span>${U.escapeHTML(field.areaA ? `${field.areaA}a` : "面積未設定")}</span>
          <div><em>${U.escapeHTML(panicle)}</em><em>${U.escapeHTML(leaf)}</em><em>${U.escapeHTML(tiller)}</em></div>
          <small>${snapshot.logDate ? `最終生育 ${U.fd(snapshot.logDate)}` : "生育記録なし"}</small>
        </article>
      `;
    }).join("");
    el.innerHTML = `
      <div class="fertilizer-context-title"><b>判断材料</b><span>直近の生育記録</span></div>
      ${cards || '<div class="farm-empty">対象圃場がありません</div>'}
    `;
  }

  function renderTotalPreview() {
    const el = U.$("fertilizerTotalPreview");
    if (!el || !activeSchedule) return;
    const rate = number(U.$("fertilizerRate").value);
    const area = totalArea();
    const total = rate && area ? format(area / 10 * rate) : 0;
    el.innerHTML = `
      <span>対象 ${U.escapeHTML(String(format(area)))}a</span>
      <b>${rate ? `合計 約${U.escapeHTML(String(total))}kg` : "実施量を入力"}</b>
    `;
  }

  function close() {
    const sheet = U.$("fertilizerSheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
    activeSchedule = null;
    afterSave = null;
  }

  function open(schedule, callback) {
    if (!schedule) return;
    activeSchedule = schedule;
    afterSave = callback || null;
    const plan = recipePlan(schedule);
    U.$("fertilizerScheduleId").value = schedule.scheduleId;
    U.$("fertilizerDate").value = U.today();
    U.$("fertilizerMaterial").value = plan.name;
    U.$("fertilizerRate").value = "";
    U.$("fertilizerBags").value = "";
    U.$("fertilizerMemo").value = "";
    renderSummary();
    renderGrowthContext();
    renderTotalPreview();
    const sheet = U.$("fertilizerSheet");
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  }

  function save() {
    if (!activeSchedule) return;
    const rate = number(U.$("fertilizerRate").value);
    if (!rate) {
      alert("実際の量(kg/10a)を入力してください。");
      U.$("fertilizerRate").focus();
      return;
    }
    const date = U.$("fertilizerDate").value || U.today();
    const snapshots = {};
    selectedFields().forEach((field) => {
      snapshots[field.fieldId] = growthSnapshot(field.fieldId, date);
    });
    const area = totalArea();
    state.saveFertilizerCompletion({
      scheduleId: activeSchedule.scheduleId,
      date,
      material: U.$("fertilizerMaterial").value,
      fertilizerRateKg10a: format(rate),
      fertilizerTotalKg: format(area / 10 * rate),
      fertilizerBagCount: U.$("fertilizerBags").value,
      growthSnapshots: snapshots,
      memo: U.$("fertilizerMemo").value
    });
    const callback = afterSave;
    close();
    if (typeof callback === "function") callback();
  }

  function bind() {
    U.$$('[data-fertilizer-close]').forEach((button) => button.addEventListener("click", close));
    U.$("fertilizerDate").addEventListener("change", () => {
      renderGrowthContext();
      renderTotalPreview();
    });
    U.$("fertilizerRate").addEventListener("input", renderTotalPreview);
    U.$("fertilizerUsePlan").addEventListener("click", () => {
      if (!activeSchedule) return;
      const plan = recipePlan(activeSchedule);
      if (!plan.rate) {
        U.$("fertilizerRate").focus();
        return;
      }
      U.$("fertilizerRate").value = plan.rate;
      renderTotalPreview();
    });
    U.$("fertilizerForm").addEventListener("submit", (event) => {
      event.preventDefault();
      save();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.fertilizer = { open, close, bind };
})();
