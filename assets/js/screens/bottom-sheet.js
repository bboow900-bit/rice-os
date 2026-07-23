(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let selectedDate = U.today();
  let selectedFieldId = "";
  let editingScheduleId = "";
  const SCHEDULE_PRESETS = [
    { label: "草刈り", title: "草刈り予定" },
    { label: "追肥", title: "追肥予定" },
    { label: "防除", title: "防除予定" },
    { label: "除草剤", title: "除草剤散布予定" },
    { label: "中干し", title: "中干し確認" },
    { label: "田植え", title: "田植え予定" },
    { label: "稲刈り", title: "稲刈り予定" },
    { label: "幼穂確認", title: "幼穂確認" }
  ];

  function scheduleDone(record) {
    return Boolean(record && (record.completedAt || record.completedByWorkId || record.status === "実施済み" || record.status === "手動完了"));
  }

  function entryStatusLabel(entry) {
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "超過";
      if (entry.tone === "schedule-done") return "済";
      return "予定";
    }
    if (entry.kind === "work") return "実績";
    if (entry.kind === "growth") return "生育";
    if (entry.kind === "dry" || entry.kind === "irrigation") return "水管理";
    return "";
  }

  function entryHtml(entry) {
    const id = RiceOS.recordActions ? RiceOS.recordActions.idFor(entry.kind, entry.record) : "";
    const toneClass = entry.tone || "";
    const canCompleteSchedule = entry.kind === "schedule" && id && !scheduleDone(entry.record);
    return `
      <div class="mini-card ${U.attr(entry.kind)} ${U.attr(toneClass)}">
        <b>${U.escapeHTML(entry.title)}</b>
        ${entryStatusLabel(entry) ? `<em class="mini-status ${U.attr(entry.tone || entry.kind)}">${U.escapeHTML(entryStatusLabel(entry))}</em>` : ""}
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
        ${id ? `
          <div class="record-actions mini-actions">
            ${canCompleteSchedule ? `<button class="primary" type="button" data-sheet-action="complete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">実施を記録</button>` : ""}
            <button class="secondary" type="button" data-sheet-action="edit" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">編集</button>
            <button class="danger" type="button" data-sheet-action="delete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">削除</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  function findEntry(kind, id) {
    return RiceOS.calendar.entriesForDate(selectedDate).find((entry) => {
      return RiceOS.recordActions && RiceOS.recordActions.idFor(entry.kind, entry.record) === id && entry.kind === kind;
    });
  }

  function render() {
    U.$("sheetDateTitle").textContent = `${U.fd(selectedDate)} の記録`;
    hideScheduleForm();
    renderFieldSelect();
    const rows = RiceOS.calendar.entriesForDate(selectedDate);
    U.$("sheetEntries").innerHTML = rows.length ? rows.map(entryHtml).join("") : '<div class="empty">この日の記録はまだありません。</div>';
  }

  function open(date, fieldId) {
    selectedDate = date || U.today();
    selectedFieldId = fieldId || firstFieldId();
    render();
    const sheet = U.$("dateSheet");
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
  }

  function close() {
    const sheet = U.$("dateSheet");
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
  }

  function firstFieldId() {
    return state.activeFields()[0] && state.activeFields()[0].fieldId || "";
  }

  function activeFieldId() {
    const value = U.$("sheetField") && U.$("sheetField").value || selectedFieldId || firstFieldId();
    selectedFieldId = value;
    return value;
  }

  function renderFieldSelect() {
    const fields = state.activeFields();
    if (!selectedFieldId && fields[0]) selectedFieldId = fields[0].fieldId;
    U.setOptions(U.$("sheetField"), fields.map((field) => ({
      value: field.fieldId,
      label: field.name
    })), selectedFieldId);
  }

  function fieldGroupName(field) {
    return String(field && (field.fieldGroupId || field.district) || "").trim();
  }

  function scheduleGroups() {
    const map = new Map();
    state.activeFields().forEach((field) => {
      const name = fieldGroupName(field);
      if (!name) return;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(field.fieldId);
    });
    return Array.from(map.entries()).map(([name, fieldIds]) => ({ name, fieldIds }));
  }

  function renderScheduleTargets(record) {
    const mode = U.$("sheetScheduleTargetMode");
    const group = U.$("sheetScheduleGroup");
    const groupLabel = U.$("sheetScheduleGroupLabel");
    if (!mode || !group || !groupLabel) return;
    const groups = scheduleGroups();
    U.setOptions(group, groups.map((item) => ({ value: item.name, label: `${item.name} (${item.fieldIds.length}圃場)` })), group.value || (groups[0] && groups[0].name) || "");
    mode.value = record ? "field" : (mode.value || "field");
    groupLabel.classList.toggle("hidden", mode.value !== "group" || !groups.length);
    mode.disabled = Boolean(record);
    group.disabled = Boolean(record);
  }

  function topDressingPlan() {
    const field = state.field(activeFieldId());
    const variety = field ? state.variety(field.varietyId) : null;
    const amountText = String(variety && variety.topDressingAmount || "");
    const rate = amountText.match(/\d+(?:\.\d+)?/);
    return {
      name: variety && variety.topDressingName || "",
      rate: rate ? rate[0] : ""
    };
  }

  function renderFertilizerScheduleFields(record) {
    const block = U.$("sheetScheduleFertilizerFields");
    const title = String(U.$("sheetScheduleTitle") && U.$("sheetScheduleTitle").value || "");
    if (!block) return;
    const visible = title.includes("追肥");
    block.classList.toggle("hidden", !visible);
    if (!visible) return;
    const plan = topDressingPlan();
    const name = U.$("sheetScheduleFertilizerName");
    const rate = U.$("sheetScheduleFertilizerRate");
    if (record) {
      name.value = record.plannedFertilizerName || "";
      rate.value = record.plannedFertilizerRateKg10a || "";
      return;
    }
    if (!name.value) name.value = plan.name;
    if (!rate.value) rate.value = plan.rate;
  }

  function renderSchedulePresets() {
    const root = U.$("sheetSchedulePresetPicks");
    if (!root) return;
    const title = String(U.$("sheetScheduleTitle").value || "");
    root.innerHTML = SCHEDULE_PRESETS.map((preset) => `
      <button type="button" class="${title === preset.title ? "active" : ""}" data-schedule-preset="${U.attr(preset.title)}">${U.escapeHTML(preset.label)}</button>
    `).join("");
  }

  function hideScheduleForm() {
    const form = U.$("sheetScheduleForm");
    if (!form) return;
    form.classList.add("hidden");
    editingScheduleId = "";
  }

  function showScheduleForm(record) {
    const form = U.$("sheetScheduleForm");
    if (!form) return;
    editingScheduleId = record && record.scheduleId || "";
    U.$("sheetScheduleTitle").value = record ? record.title || record.scheduleType || "" : "";
    U.$("sheetScheduleMemo").value = record ? record.memo || "" : "";
    U.$("sheetScheduleFertilizerName").value = record ? record.plannedFertilizerName || "" : "";
    U.$("sheetScheduleFertilizerRate").value = record ? record.plannedFertilizerRateKg10a || "" : "";
    renderSchedulePresets();
    renderScheduleTargets(record);
    renderFertilizerScheduleFields(record);
    const head = form.querySelector(".sheet-schedule-head b");
    if (head) head.textContent = editingScheduleId ? "予定を編集" : "予定を登録";
    form.classList.remove("hidden");
    setTimeout(() => U.$("sheetScheduleTitle").focus(), 50);
  }

  function addScheduleFromForm() {
    const title = String(U.$("sheetScheduleTitle").value || "").trim();
    if (!title) {
      alert("予定名を入力してください。");
      U.$("sheetScheduleTitle").focus();
      return;
    }
    const memo = String(U.$("sheetScheduleMemo").value || "").trim();
    const isFertilizer = title.includes("追肥");
    const existing = editingScheduleId
      ? (state.data().schedules || []).find((schedule) => schedule.scheduleId === editingScheduleId)
      : null;
    const mode = U.$("sheetScheduleTargetMode") ? U.$("sheetScheduleTargetMode").value : "field";
    const groups = scheduleGroups();
    const group = groups.find((item) => item.name === (U.$("sheetScheduleGroup") && U.$("sheetScheduleGroup").value));
    const targets = existing
      ? [existing.fieldIds || []]
      : mode === "all"
        ? state.activeFields().map((field) => [field.fieldId])
        : mode === "group" && group
          ? group.fieldIds.map((fieldId) => [fieldId])
          : [activeFieldId() ? [activeFieldId()] : []];
    targets.forEach((fieldIds) => {
    state.saveSchedule({
      ...(existing || {}),
      scheduleId: existing ? editingScheduleId : undefined,
      date: selectedDate,
      fieldIds,
      scheduleType: title,
      title,
      memo,
      plannedFertilizerName: isFertilizer ? String(U.$("sheetScheduleFertilizerName").value || "").trim() : "",
      plannedFertilizerRateKg10a: isFertilizer ? String(U.$("sheetScheduleFertilizerRate").value || "").trim() : ""
    });
    });
    hideScheduleForm();
    render();
  }

  function openScreen(screen, callback) {
    close();
    RiceOS.app.show(screen);
    if (typeof callback === "function") callback(activeFieldId());
  }

  function bind() {
    U.$$("#dateSheet [data-sheet-close]").forEach((el) => el.addEventListener("click", close));
    U.$("sheetField").addEventListener("change", () => {
      selectedFieldId = U.$("sheetField").value;
    });
    if (U.$("sheetScheduleTargetMode")) {
      U.$("sheetScheduleTargetMode").addEventListener("change", () => renderScheduleTargets());
    }
    if (U.$("sheetScheduleTitle")) {
      U.$("sheetScheduleTitle").addEventListener("input", () => {
        renderFertilizerScheduleFields();
        renderSchedulePresets();
      });
    }
    U.$("dateSheet").addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-sheet-action]");
      if (actionButton && RiceOS.recordActions) {
        const entry = findEntry(actionButton.dataset.kind, actionButton.dataset.id);
        if (!entry) return;
        if (actionButton.dataset.sheetAction === "complete" && entry.kind === "schedule") {
          if (String(entry.record.title || entry.record.scheduleType || "").includes("追肥") && RiceOS.screens.fertilizer) {
            RiceOS.screens.fertilizer.open(entry.record, render);
            return;
          }
          close();
          RiceOS.app.show("field-work");
          RiceOS.screens.fieldWork.prefillSchedule(entry.record);
          return;
        }
        if (actionButton.dataset.sheetAction === "edit") {
          if (entry.kind === "schedule") {
            showScheduleForm(entry.record);
            return;
          }
          close();
          RiceOS.recordActions.edit(entry.kind, entry.record);
        }
        if (actionButton.dataset.sheetAction === "delete") {
          if (RiceOS.recordActions.remove(entry.kind, entry.record)) render();
        }
        return;
      }
      const button = event.target.closest("[data-sheet-add]");
      const presetButton = event.target.closest("[data-schedule-preset]");
      if (presetButton) {
        U.$("sheetScheduleTitle").value = presetButton.dataset.schedulePreset;
        renderFertilizerScheduleFields();
        renderSchedulePresets();
        return;
      }
      if (!button) return;
      const action = button.dataset.sheetAdd;
      if (action === "growth") {
        openScreen("growth", (fieldId) => RiceOS.screens.growth.prefillDate(selectedDate, fieldId));
      } else if (action === "work") {
        openScreen("field-work", (fieldId) => RiceOS.screens.fieldWork.prefillDate(selectedDate, fieldId));
      } else if (action === "water") {
        openScreen("irrigation", (fieldId) => RiceOS.screens.irrigation.prefillDate(selectedDate, fieldId));
      } else if (action === "photo") {
        openScreen("growth", (fieldId) => {
          RiceOS.screens.growth.prefillDate(selectedDate, fieldId);
          if (U.$("growthPhotoSection")) U.$("growthPhotoSection").open = true;
        });
      } else if (action === "schedule") {
        showScheduleForm();
      } else if (action === "result") {
        openScreen("results");
      }
    });
    if (U.$("sheetScheduleForm")) {
      U.$("sheetScheduleForm").addEventListener("submit", (event) => {
        event.preventDefault();
        addScheduleFromForm();
      });
    }
    if (document.querySelector("[data-sheet-schedule-cancel]")) {
      document.querySelector("[data-sheet-schedule-cancel]").addEventListener("click", hideScheduleForm);
    }
  }

  RiceOS.bottomSheet = { open, close, render };
  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.bottomSheet = { bind };
})();
