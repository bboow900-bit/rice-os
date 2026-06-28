(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let selectedDate = U.today();
  let selectedFieldId = "";
  let editingScheduleId = "";

  function entryHtml(entry) {
    const id = RiceOS.recordActions ? RiceOS.recordActions.idFor(entry.kind, entry.record) : "";
    return `
      <div class="mini-card ${U.attr(entry.kind)}">
        <b>${U.escapeHTML(entry.title)}</b>
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
        ${id ? `
          <div class="record-actions mini-actions">
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
    const existing = editingScheduleId
      ? (state.data().schedules || []).find((schedule) => schedule.scheduleId === editingScheduleId)
      : null;
    state.saveSchedule({
      ...(existing || {}),
      scheduleId: editingScheduleId || undefined,
      date: selectedDate,
      fieldIds: activeFieldId() ? [activeFieldId()] : [],
      scheduleType: title,
      title,
      memo
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
    U.$("dateSheet").addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-sheet-action]");
      if (actionButton && RiceOS.recordActions) {
        const entry = findEntry(actionButton.dataset.kind, actionButton.dataset.id);
        if (!entry) return;
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
      if (!button) return;
      const action = button.dataset.sheetAdd;
      if (action === "growth") {
        openScreen("growth", (fieldId) => RiceOS.screens.growth.prefillDate(selectedDate, fieldId));
      } else if (action === "work") {
        openScreen("field-work", (fieldId) => RiceOS.screens.fieldWork.prefillDate(selectedDate, fieldId));
      } else if (action === "schedule") {
        showScheduleForm();
      } else if (action === "harvest") {
        openScreen("results");
      } else if (action === "shipment") {
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
