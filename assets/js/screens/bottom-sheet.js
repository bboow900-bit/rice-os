(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let selectedDate = U.today();
  let selectedFieldId = "";
  let selectedKind = "";
  let editingScheduleId = "";
  let savingSchedule = false;
  let workFieldIds = [];
  let scheduleFieldIds = [];

  function entryId(entry) {
    return entry.kind === "other" ? entry.record.otherWorkId || "" : RiceOS.recordActions ? RiceOS.recordActions.idFor(entry.kind, entry.record) : "";
  }

  function openEntry(entry) {
    close();
    if (entry.kind === "other") {
      if (RiceOS.navigation && RiceOS.navigation.openRecord && RiceOS.navigation.openRecord("other", entryId(entry))) return;
      if (RiceOS.screens.otherWork) {
        RiceOS.app.show("other-work");
        RiceOS.screens.otherWork.editWork(entryId(entry));
      }
      return;
    }
    RiceOS.recordActions.edit(entry.kind, entry.record);
  }

  function renderSelectionCards(hostId, ids, disabled) {
    U.$(hostId).innerHTML = state.activeFields().map((field) => `
      <button type="button" class="select-card ${ids.includes(field.fieldId) ? "selected" : ""}"
        data-sheet-field="${U.attr(field.fieldId)}" aria-pressed="${ids.includes(field.fieldId)}" ${disabled ? "disabled" : ""}>
        <b>${U.escapeHTML(field.name)}</b><small>${U.escapeHTML(String(field.areaA || 0))}a</small>
      </button>`).join("");
  }

  function modeFieldIds(mode, groupId) {
    if (mode === "offField") return [];
    if (mode === "all") return state.activeFields().map((field) => field.fieldId);
    if (mode === "group") return (scheduleGroups().find((group) => group.fieldGroupId === groupId) || {}).fieldIds || [];
    return null;
  }
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
    const id = entryId(entry);
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
            <button class="secondary" type="button" data-sheet-action="edit" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">${entry.kind === "other" ? "表示" : "編集"}</button>
            ${entry.kind !== "other" ? `<button class="danger" type="button" data-sheet-action="delete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">削除</button>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  function findEntry(kind, id) {
    return RiceOS.calendar.entriesForDate(selectedDate).find((entry) => {
      return entryId(entry) === id && entry.kind === kind;
    });
  }

  function render() {
    U.$("sheetDateTitle").textContent = `${U.fd(selectedDate)} の記録`;
    if (!savingSchedule) hideScheduleForm();
    hideWaterQuick();
    renderTargetSelect();
    renderRecordChoice();
    const rows = RiceOS.calendar.entriesForDate(selectedDate);
    U.$("sheetEntries").innerHTML = rows.length ? rows.map(entryHtml).join("") : '<div class="empty">この日の記録はまだありません。</div>';
  }

  function open(date, fieldId) {
    selectedDate = date || U.today();
    selectedFieldId = fieldId || "";
    workFieldIds = selectedFieldId ? [selectedFieldId] : [];
    scheduleFieldIds = [];
    U.$("sheetScheduleTargetMode").value = "field";
    selectedKind = "";
    if (U.$("sheetTargetMode")) U.$("sheetTargetMode").value = "field";
    if (U.$("sheetGroup")) U.$("sheetGroup").value = "";
    render();
    const sheet = U.$("dateSheet");
    sheet.classList.remove("hidden");
    sheet.setAttribute("aria-hidden", "false");
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
  }

  function close() {
    const sheet = U.$("dateSheet");
    sheet.classList.add("hidden");
    sheet.setAttribute("aria-hidden", "true");
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
  }

  function isOpen() {
    const sheet = U.$("dateSheet");
    return Boolean(sheet && !sheet.classList.contains("hidden"));
  }

  function firstFieldId() {
    return state.activeFields()[0] && state.activeFields()[0].fieldId || "";
  }

  function activeFieldId() {
    const select = U.$("sheetField");
    const value = select ? select.value : selectedFieldId;
    selectedFieldId = value;
    return value;
  }

  function targetFieldIds() {
    const mode = U.$("sheetTargetMode") && U.$("sheetTargetMode").value || "field";
    if (mode === "offField") return [];
    if (mode === "all") return state.activeFields().map((field) => field.fieldId);
    if (mode === "group") {
      const groupId = U.$("sheetGroup") && U.$("sheetGroup").value || "";
      const group = groupId && scheduleGroups().find((item) => item.fieldGroupId === groupId);
      return group ? group.fieldIds : [];
    }
    if (selectedKind === "work") return workFieldIds.filter((id) => state.activeFields().some((field) => field.fieldId === id));
    const fieldId = activeFieldId();
    return fieldId ? [fieldId] : [];
  }

  function renderTargetSelect() {
    const fields = state.activeFields();
    U.setOptions(U.$("sheetField"), [{ value: "", label: "圃場を選ぶ" }, ...fields.map((field) => ({
      value: field.fieldId,
      label: field.name
    }))], selectedFieldId);
    const groups = scheduleGroups();
    const mode = U.$("sheetTargetMode");
    const group = U.$("sheetGroup");
    if (!mode || !group) return;
    U.setOptions(group, [{ value: "", label: "グループを選ぶ" }, ...groups.map((item) => ({ value: item.fieldGroupId, label: `${item.name} (${item.fieldIds.length}圃場)` }))], group.value || "");
    if (mode.value === "group" || mode.value === "all") workFieldIds = modeFieldIds(mode.value, group.value);
    mode.disabled = false;
    const offOption = mode.querySelector('option[value="offField"]');
    offOption.disabled = selectedKind !== "work";
    if (selectedKind !== "work" && mode.value === "offField") mode.value = "field";
    const isGroup = mode.value === "group";
    U.$("sheetFieldLabel").classList.toggle("hidden", selectedKind === "work" || mode.value !== "field");
    U.$("sheetGroupLabel").classList.toggle("hidden", !isGroup);
    U.$("sheetWorkFields").hidden = selectedKind !== "work" || mode.value === "offField";
    renderSelectionCards("sheetWorkFields", workFieldIds, false);
  }

  function kindLabel(kind) {
    return ({ work: "作業記録", growth: "生育記録", stage: "幼穂・出穂", water: "水管理" })[kind] || "";
  }

  function renderRecordChoice() {
    const step = U.$("sheetTargetStep");
    if (!step) return;
    step.classList.toggle("hidden", !selectedKind);
    U.$$("#sheetKindActions [data-sheet-add]").forEach((button) => button.classList.toggle("active", button.dataset.sheetAdd === selectedKind));
    const label = U.$("sheetSelectedKind");
    if (label) label.textContent = selectedKind ? `${kindLabel(selectedKind)}を記録します` : "種類を選んでください";
    const ids = targetFieldIds();
    const fields = ids.map((id) => state.field(id)).filter(Boolean);
    const summary = U.$("sheetTargetSummary");
    const offField = selectedKind === "work" && U.$("sheetTargetMode").value === "offField";
    if (summary) summary.textContent = offField ? "対象: 圃場外" : fields.length ? `対象: ${fields.map((field) => field.name).join("・")}` : "対象を選択してください";
    const openButton = U.$("sheetOpenRecord");
    if (openButton) {
      openButton.disabled = !selectedKind || (!offField && !fields.length);
      openButton.textContent = selectedKind ? `${kindLabel(selectedKind)}の入力を開く` : "入力を開く";
    }
  }

  function fieldGroupName(field) {
    const group = state.groupForField ? state.groupForField(field) : null;
    return group ? group.name : "";
  }

  function scheduleGroups() {
    return state.groupedFields({ includeUnassigned: false }).map((group) => ({
      ...group,
      fieldIds: group.fields.map((field) => field.fieldId)
    }));
  }

  function renderScheduleTargets(record) {
    const mode = U.$("sheetScheduleTargetMode");
    const group = U.$("sheetScheduleGroup");
    const groupLabel = U.$("sheetScheduleGroupLabel");
    if (!mode || !group || !groupLabel) return;
    const groups = scheduleGroups();
    U.setOptions(group, groups.map((item) => ({ value: item.fieldGroupId, label: `${item.name} (${item.fieldIds.length}圃場)` })), group.value || (groups[0] && groups[0].fieldGroupId) || "");
    mode.value = record ? record.targetScope === "offField" ? "offField" : "field" : (mode.value || "field");
    groupLabel.classList.toggle("hidden", mode.value !== "group" || !groups.length);
    mode.disabled = Boolean(editingScheduleId);
    group.disabled = Boolean(editingScheduleId);
    U.$("sheetScheduleFields").hidden = mode.value === "offField";
    renderSelectionCards("sheetScheduleFields", scheduleFieldIds, Boolean(editingScheduleId));
    renderSchedulePresets();
    renderFertilizerScheduleFields(record);
  }

  function topDressingPlan() {
    const field = state.field(scheduleFieldIds[0]);
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
    const visible = U.$("sheetScheduleTargetMode").value !== "offField" && title.includes("追肥");
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
    const presets = U.$("sheetScheduleTargetMode").value === "offField"
      ? RiceOS.schema.OTHER_WORK_NAMES.map((name) => ({ title: `${name}予定`, label: name })) : SCHEDULE_PRESETS;
    root.innerHTML = presets.map((preset) => `
      <button type="button" class="${title === preset.title ? "active" : ""}" data-schedule-preset="${U.attr(preset.title)}">${U.escapeHTML(preset.label)}</button>
    `).join("");
  }

  function hideScheduleForm() {
    const form = U.$("sheetScheduleForm");
    if (!form) return;
    form.classList.add("hidden");
    editingScheduleId = "";
  }

  function hideWaterQuick() {
    const panel = U.$("sheetWaterQuick");
    if (panel) panel.classList.add("hidden");
  }

  function showWaterQuick() {
    hideScheduleForm();
    const panel = U.$("sheetWaterQuick");
    if (!panel) return;
    panel.classList.remove("hidden");
  }

  function showScheduleForm(record) {
    const form = U.$("sheetScheduleForm");
    if (!form) return;
    editingScheduleId = record && record.scheduleId || "";
    scheduleFieldIds = record ? record.targetScope === "offField" ? [] : (record.fieldIds || []).slice() : targetFieldIds();
    U.$("sheetScheduleTargetMode").value = record ? record.targetScope === "offField" ? "offField" : "field" : U.$("sheetTargetMode").value === "offField" ? "offField" : "field";
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
    const isFertilizer = U.$("sheetScheduleTargetMode").value !== "offField" && title.includes("追肥");
    const existing = editingScheduleId
      ? (state.data().schedules || []).find((schedule) => schedule.scheduleId === editingScheduleId)
      : null;
    const mode = U.$("sheetScheduleTargetMode") ? U.$("sheetScheduleTargetMode").value : "field";
    const groups = scheduleGroups();
    const group = groups.find((item) => item.fieldGroupId === (U.$("sheetScheduleGroup") && U.$("sheetScheduleGroup").value));
    if (!existing && mode === "group" && (!group || !group.fieldGroupId || !group.fieldIds.length)) {
      U.toast("予定を登録するグループを選択してください");
      return;
    }
    const offField = existing ? existing.targetScope === "offField" : mode === "offField";
    const targets = offField ? [[]] : existing ? [existing.fieldIds || []] : scheduleFieldIds.map((id) => [id]);
    if (!offField && (!targets.length || targets.some((ids) => !ids.length))) {
      U.toast("予定を登録する圃場を選択してください");
      return;
    }
    const batchId = existing ? existing.batchId || "" : targets.length > 1 ? U.id("schedule-batch", selectedDate) : "";
    const batchFieldIds = existing ? existing.batchFieldIds || [] : targets.length > 1 ? targets.flat() : [];
    savingSchedule = true;
    const saved = targets.every((fieldIds) => state.saveSchedule({
      ...(existing || {}),
      scheduleId: existing ? editingScheduleId : undefined,
      date: selectedDate,
      fieldIds,
      targetScope: offField ? "offField" : "field",
      batchId,
      batchFieldIds,
      scheduleType: title,
      title,
      memo,
      plannedFertilizerName: isFertilizer ? String(U.$("sheetScheduleFertilizerName").value || "").trim() : "",
      plannedFertilizerRateKg10a: isFertilizer ? String(U.$("sheetScheduleFertilizerRate").value || "").trim() : ""
    }) !== null);
    savingSchedule = false;
    if (!saved) return;
    hideScheduleForm();
    render();
  }

  function openScreen(screen, callback) {
    const fieldIds = targetFieldIds();
    if (!fieldIds.length && !(screen === "field-work" && U.$("sheetTargetMode").value === "offField")) {
      U.toast("記録する圃場またはグループを選択してください");
      return;
    }
    const originScreen = RiceOS.app && RiceOS.app.currentScreen ? RiceOS.app.currentScreen() : "home";
    close();
    if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
    if (RiceOS.app && RiceOS.app.openInput) RiceOS.app.openInput(screen, originScreen);
    else RiceOS.app.show(screen);
    if (typeof callback === "function") callback(fieldIds);
  }

  function scheduleRecordKind(record) {
    if (record && record.targetScope === "offField") return { kind: "work", waterType: "" };
    if (record && record.recordKind === "water" && record.waterKind) return { kind: "water", waterType: record.waterKind };
    const title = String(record && (record.title || record.scheduleType) || "");
    if (/中干し/.test(title)) return { kind: "water", waterType: "dry" };
    if (/間断|かんだん/.test(title)) return { kind: "water", waterType: "intermittent" };
    if (/飽水/.test(title)) return { kind: "water", waterType: "saturated" };
    if (/深水/.test(title)) return { kind: "water", waterType: "deep" };
    if (/落水/.test(title)) return { kind: "water", waterType: "drain" };
    if (/幼穂|出穂/.test(title)) return { kind: "stage", waterType: "" };
    return { kind: "work", waterType: "" };
  }

  function openScheduleCompletion(record) {
    const target = scheduleRecordKind(record);
    const fieldIds = (record.fieldIds || []).filter((id) => state.field(id));
    if (!fieldIds.length && record.targetScope !== "offField") return;
    const originScreen = RiceOS.app && RiceOS.app.currentScreen ? RiceOS.app.currentScreen() : "home";
    close();
    if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
    if (target.kind === "water") {
      if (RiceOS.app && RiceOS.app.openInput) RiceOS.app.openInput("irrigation", originScreen);
      else RiceOS.app.show("irrigation");
      RiceOS.screens.irrigation.prefillSchedule(record);
      return;
    }
    if (target.kind === "stage") {
      if (RiceOS.app && RiceOS.app.openInput) RiceOS.app.openInput("growth", originScreen);
      else RiceOS.app.show("growth");
      RiceOS.screens.growth.prefillStageRecord(U.today(), fieldIds);
      return;
    }
    if (RiceOS.app && RiceOS.app.openInput) RiceOS.app.openInput("field-work", originScreen);
    else RiceOS.app.show("field-work");
    RiceOS.screens.fieldWork.prefillSchedule(record);
  }

  function bind() {
    U.$$("#dateSheet [data-sheet-close]").forEach((el) => el.addEventListener("click", close));
    U.$("sheetField").addEventListener("change", () => {
      selectedFieldId = U.$("sheetField").value;
      renderRecordChoice();
    });
    if (U.$("sheetTargetMode")) U.$("sheetTargetMode").addEventListener("change", () => {
      workFieldIds = modeFieldIds(U.$("sheetTargetMode").value, U.$("sheetGroup").value) || workFieldIds;
      renderTargetSelect(); renderRecordChoice();
    });
    if (U.$("sheetGroup")) U.$("sheetGroup").addEventListener("change", () => {
      workFieldIds = modeFieldIds("group", U.$("sheetGroup").value);
      renderTargetSelect(); renderRecordChoice();
    });
    if (U.$("sheetScheduleTargetMode")) {
      U.$("sheetScheduleTargetMode").addEventListener("change", () => {
        scheduleFieldIds = modeFieldIds(U.$("sheetScheduleTargetMode").value, U.$("sheetScheduleGroup").value) || scheduleFieldIds;
        U.$("sheetScheduleFertilizerName").value = "";
        U.$("sheetScheduleFertilizerRate").value = "";
        renderScheduleTargets();
      });
    }
    U.$("sheetScheduleGroup").addEventListener("change", () => {
      scheduleFieldIds = modeFieldIds("group", U.$("sheetScheduleGroup").value);
      renderScheduleTargets();
    });
    if (U.$("sheetScheduleTitle")) {
      U.$("sheetScheduleTitle").addEventListener("input", () => {
        renderFertilizerScheduleFields();
        renderSchedulePresets();
      });
    }
    U.$("dateSheet").addEventListener("click", (event) => {
      const fieldCard = event.target.closest("[data-sheet-field]");
      if (fieldCard) {
        const schedule = Boolean(fieldCard.closest("#sheetScheduleFields"));
        if (schedule && editingScheduleId) return;
        const ids = new Set(schedule ? scheduleFieldIds : workFieldIds);
        const id = fieldCard.dataset.sheetField;
        if (ids.has(id)) ids.delete(id); else ids.add(id);
        if (schedule) {
          scheduleFieldIds = Array.from(ids);
          U.$("sheetScheduleTargetMode").value = "field";
          renderScheduleTargets();
        } else {
          workFieldIds = Array.from(ids);
          U.$("sheetTargetMode").value = "field";
          renderTargetSelect(); renderRecordChoice();
        }
        return;
      }
      const actionButton = event.target.closest("[data-sheet-action]");
      if (actionButton && RiceOS.recordActions) {
        const entry = findEntry(actionButton.dataset.kind, actionButton.dataset.id);
        if (!entry) return;
        if (actionButton.dataset.sheetAction === "complete" && entry.kind === "schedule") {
          if (entry.record.targetScope !== "offField" && String(entry.record.title || entry.record.scheduleType || "").includes("追肥") && RiceOS.screens.fertilizer) {
            RiceOS.screens.fertilizer.open(entry.record, render);
            return;
          }
          openScheduleCompletion(entry.record);
          return;
        }
        if (actionButton.dataset.sheetAction === "edit") {
          if (entry.kind === "schedule") {
            showScheduleForm(entry.record);
            return;
          }
          openEntry(entry);
        }
        if (actionButton.dataset.sheetAction === "delete") {
          if (RiceOS.recordActions.remove(entry.kind, entry.record)) render();
        }
        return;
      }
      const button = event.target.closest("[data-sheet-add]");
      const waterTypeButton = event.target.closest("[data-sheet-water-type]");
      const presetButton = event.target.closest("[data-schedule-preset]");
      if (waterTypeButton) {
        const typeKey = waterTypeButton.dataset.sheetWaterType || "";
        openScreen("irrigation", (fieldIds) => RiceOS.screens.irrigation.prefillFields(selectedDate, fieldIds, typeKey));
        return;
      }
      if (presetButton) {
        U.$("sheetScheduleTitle").value = presetButton.dataset.schedulePreset;
        renderFertilizerScheduleFields();
        renderSchedulePresets();
        return;
      }
      const openRecord = event.target.closest("#sheetOpenRecord");
      if (openRecord) {
        if (!selectedKind) return;
        if (selectedKind === "growth") openScreen("growth", (fieldIds) => RiceOS.screens.growth.prefillFields(selectedDate, fieldIds));
        else if (selectedKind === "work") openScreen("field-work", (fieldIds) => RiceOS.screens.fieldWork.prefillFields(selectedDate, fieldIds, { targetScope: U.$("sheetTargetMode").value === "offField" ? "offField" : "field" }));
        else if (selectedKind === "stage") openScreen("growth", (fieldIds) => RiceOS.screens.growth.prefillStageRecord(selectedDate, fieldIds));
        else if (selectedKind === "water") showWaterQuick();
        return;
      }
      if (!button) return;
      const action = button.dataset.sheetAdd;
      if (["growth", "work", "stage", "water"].includes(action)) {
        selectedKind = action;
        renderTargetSelect();
        hideWaterQuick();
        renderRecordChoice();
      } else if (action === "photo") {
        openScreen("growth", (fieldIds) => {
          RiceOS.screens.growth.prefillFields(selectedDate, fieldIds);
          if (U.$("growthPhotoSection")) U.$("growthPhotoSection").open = true;
        });
      } else if (action === "schedule") {
        showScheduleForm();
      } else if (action === "result") {
        openScreen("results");
      } else if (action === "shipment") {
        const originScreen = RiceOS.app.currentScreen();
        close();
        if (RiceOS.navigation) RiceOS.navigation.clear();
        RiceOS.app.openInput("shipments", originScreen);
        RiceOS.screens.shipments.openNew(selectedDate);
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

  RiceOS.bottomSheet = { open, close, isOpen, render, openScheduleCompletion };
  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.bottomSheet = { bind };
})();
