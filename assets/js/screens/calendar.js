(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  let currentMonth = RiceOS.calendar.monthStart(U.today());
  let selectedDate = U.today();
  let displayMode = "planned";
  let targetFilter = "all";

  function entryFieldIds(entry) {
    const row = entry.record || {};
    if (row.targetScope === "offField" || entry.kind === "shipment") return [];
    if (entry.kind === "schedule" || entry.kind === "schedule-completed") return [...new Set((row.fieldIds || []).filter(Boolean))];
    const actualIds = [row.fieldId, ...(row.fieldIds || [])].filter(Boolean);
    const relatedIds = (row.relatedFieldIds || []).filter(Boolean);
    return [...new Set(actualIds.length ? actualIds : relatedIds.length ? relatedIds : (row.batchFieldIds || []).filter(Boolean))];
  }

  function matchesTarget(entry) {
    const ids = entryFieldIds(entry);
    if (targetFilter === "all") return true;
    if (targetFilter === "offField") return ids.length === 0;
    if (targetFilter.startsWith("field:")) return ids.includes(targetFilter.slice(6));
    if (targetFilter.startsWith("group:")) return ids.some((id) => RiceOS.state.groupForField(id)?.fieldGroupId === targetFilter.slice(6));
    return false;
  }

  function inputTarget() {
    if (targetFilter === "offField") return { mode: "offField" };
    if (targetFilter.startsWith("field:")) {
      const fieldId = targetFilter.slice(6);
      if (RiceOS.state.activeFields().some((field) => field.fieldId === fieldId)) return { mode: "field", fieldId };
    }
    if (targetFilter.startsWith("group:")) {
      const groupId = targetFilter.slice(6);
      if (RiceOS.state.fieldGroup(groupId)) return { mode: "group", groupId };
    }
    return { mode: "field", fieldId: "" };
  }

  function renderTargetFilter() {
    const select = U.$("calendarTargetFilter");
    if (!select) return;
    const groups = RiceOS.state.fieldGroups();
    const fields = RiceOS.state.activeFields();
    const options = [["all", "すべての対象"], ["offField", "圃場外"],
      ...groups.map((group) => [`group:${group.fieldGroupId}`, `グループ: ${group.name}`]),
      ...fields.map((field) => [`field:${field.fieldId}`, `圃場: ${field.name}`])];
    if (!options.some(([value]) => value === targetFilter)) targetFilter = "all";
    select.innerHTML = options.map(([value, label]) => `<option value="${U.attr(value)}"${value === targetFilter ? " selected" : ""}>${U.escapeHTML(label)}</option>`).join("");
    select.value = targetFilter;
  }

  function isPlan(entry) {
    return entry.kind === "schedule" ? !scheduleDone(entry.record) : Boolean(entry.planned);
  }

  function visibleEntries(date) {
    const entries = RiceOS.calendar.entriesForDate(date);
    return entries.filter((entry) => matchesTarget(entry) && (displayMode === "all" || isPlan(entry)));
  }

  function scheduleDone(record) {
    return Boolean(record && (record.completedAt || record.completedByWorkId || record.status === "実施済み" || record.status === "手動完了"));
  }

  function entryStatusLabel(entry) {
    if (entry.planned) return "予定";
    if (entry.kind === "schedule-completed") return "済";
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "超過";
      if (entry.tone === "schedule-done") return "済";
      return "予定";
    }
    if (entry.kind === "work" || entry.kind === "other" || entry.kind === "shipment") return "実績";
    if (entry.kind === "growth") return "生育";
    if (entry.kind === "dry" || entry.kind === "irrigation") return "水管理";
    return "";
  }

  function markerClass(entry) {
    if (entry.kind === "schedule-completed") return "mark-schedule-done";
    if (entry.kind === "shipment") return "mark-shipment";
    if (entry.kind === "schedule") {
      if (entry.tone === "schedule-overdue") return "mark-schedule-overdue";
      if (entry.tone === "schedule-done") return "mark-schedule-done";
      return "mark-schedule";
    }
    if (entry.kind === "growth") return "mark-growth";
    if (entry.kind === "work" || entry.kind === "other") return "mark-work";
    return "mark-water";
  }

  function renderDay(date) {
    const d = new Date(`${date}T00:00:00`);
    const today = date === U.today();
    const inMonth = date.slice(0, 7) === currentMonth.slice(0, 7);
    const entries = visibleEntries(date);
    const modeLabel = displayMode === "all" ? "予定・実績" : "予定";
    const accessibleLabel = `${U.fd(date)} ${modeLabel} ${entries.length}件${entries.length ? `: ${entries.map((entry) => entry.title).join("、")}` : ""}`;
    return `
      <button type="button" class="calendar-day ${today ? "today" : ""} ${inMonth ? "" : "muted-day"} ${entries.length ? "has-entries" : ""} ${selectedDate === date ? "selected" : ""}" data-date="${U.attr(date)}" aria-label="${U.attr(accessibleLabel)}" aria-pressed="${selectedDate === date}"${today ? ' aria-current="date"' : ""}>
        <span class="day-number">${d.getDate()}</span>
        ${entries.slice(0, 2).map((entry) => `<span class="calendar-event-label ${markerClass(entry)} ${U.attr(entry.tone || entry.kind)}" aria-hidden="true">${U.escapeHTML(entry.title)}</span>`).join("")}
        ${entries.length > 2 ? `<span class="calendar-event-more" aria-hidden="true">+${entries.length - 2}</span>` : ""}
      </button>
    `;
  }

  function entryHtml(entry) {
    const id = entry.kind !== "shipment" && RiceOS.recordActions ? RiceOS.recordActions.idFor(entry.kind, entry.record) : "";
    const toneClass = entry.tone || "";
    const canCompleteSchedule = entry.kind === "schedule" && id && !scheduleDone(entry.record);
    const confirmationOnly = canCompleteSchedule && RiceOS.state.isWaterConfirmationSchedule && RiceOS.state.isWaterConfirmationSchedule(entry.record);
    const fieldIds = entryFieldIds(entry);
    const fieldId = fieldIds[0] || "";
    const targetFields = fieldIds.map((id) => RiceOS.state.field(id)).filter(Boolean);
    const groupIds = [...new Set(targetFields.map((field) => RiceOS.state.groupForField(field)?.fieldGroupId || "").filter(Boolean))];
    const groupId = fieldIds.length > 1 && targetFields.length === fieldIds.length && groupIds.length === 1
      && targetFields.every((field) => RiceOS.state.groupForField(field)?.fieldGroupId === groupIds[0]) ? groupIds[0] : "";
    const groupName = groupId ? RiceOS.state.fieldGroup(groupId)?.name || "" : "";
    return `
      <div class="mini-card ${U.attr(entry.kind)} ${U.attr(toneClass)}">
        <b>${U.escapeHTML(entry.title)}</b>
        ${entryStatusLabel(entry) ? `<em class="mini-status ${U.attr(entry.tone || entry.kind)}">${U.escapeHTML(entryStatusLabel(entry))}</em>` : ""}
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
        ${entry.kind === "shipment" && entry.record?.shipmentId ? `<button class="secondary" type="button" data-calendar-open-shipment="${U.attr(entry.record.shipmentId)}">出荷の詳細を見る</button>` : ""}
        ${id ? `
          ${canCompleteSchedule ? `<button class="primary" type="button" data-calendar-action="${confirmationOnly ? "confirm" : "complete"}" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">${confirmationOnly ? "確認済みにする" : "実施を記録"}</button>` : ""}
          <details class="calendar-entry-menu"><summary>操作</summary>
          <div class="record-actions mini-actions">
            ${groupName ? `<button class="secondary" type="button" data-calendar-open-group="${U.attr(groupId)}">${U.escapeHTML(groupName)}グループを見る</button>` : ""}
            ${!groupName && fieldIds.length === 1 ? `<button class="secondary" type="button" data-calendar-open-field="${U.attr(fieldId)}">圃場を見る</button>` : ""}
            ${!groupName && fieldIds.length > 1 ? '<button class="secondary" type="button" data-calendar-open-group="">対象圃場を見る</button>' : ""}
            <button class="secondary" type="button" data-calendar-action="edit" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">編集</button>
            <button class="danger" type="button" data-calendar-action="delete" data-kind="${U.attr(entry.kind)}" data-id="${U.attr(id)}">削除</button>
          </div>
          </details>
        ` : ""}
      </div>
    `;
  }

  function findEntry(kind, id) {
    return visibleEntries(selectedDate).find((entry) => {
      return entry.kind === kind && entry.kind !== "shipment" && RiceOS.recordActions && RiceOS.recordActions.idFor(entry.kind, entry.record) === id;
    });
  }

  function renderSelected() {
    const modeLabel = displayMode === "all" ? "予定・実績" : "予定";
    const selectionMode = U.$("calendarSelectionMode");
    if (selectionMode) selectionMode.textContent = displayMode === "all" ? "予定・実績" : "予定のみ";
    U.$("selectedDateTitle").textContent = `${U.fd(selectedDate)} の${modeLabel}`;
    const entries = visibleEntries(selectedDate);
    const meta = U.$("selectedDateMeta");
    if (meta) {
      meta.textContent = entries.length ? `${entries.length}件を確認中` : "この日に記録を追加できます";
    }
    const target = U.$("selectedDateEntries");
    if (!target) return;
    const completed = entries.filter((entry) => entry.kind === "schedule-completed"
      || entry.kind === "schedule" && scheduleDone(entry.record));
    const plans = entries.filter((entry) => isPlan(entry) && !completed.includes(entry));
    const actuals = entries.filter((entry) => RiceOS.calendar.isActualEntry
      ? RiceOS.calendar.isActualEntry(entry)
      : !isPlan(entry) && !completed.includes(entry));
    target.innerHTML = `
      ${plans.length ? `<section class="calendar-entry-group plan"><h4>予定 <span>${plans.length}件</span></h4>${plans.map(entryHtml).join("")}</section>` : ""}
      ${actuals.length ? `<section class="calendar-entry-group actual"><h4>実績 <span>${actuals.length}件</span></h4>${actuals.map(entryHtml).join("")}</section>` : ""}
      ${completed.length ? `<section class="calendar-entry-group plan"><h4>完了した予定 <span>${completed.length}件</span></h4>${completed.map(entryHtml).join("")}</section>` : ""}
      ${entries.length ? "" : `<p class="calendar-empty-day">この日の${modeLabel}はまだありません。</p>`}
    `;
  }

  function render() {
    renderTargetFilter();
    const mode = U.$("calendarDisplayMode");
    if (mode) mode.value = displayMode;
    U.$("calendarTitle").textContent = RiceOS.calendar.monthLabel(currentMonth);
    U.$("calendarGrid").innerHTML = `
      ${["日", "月", "火", "水", "木", "金", "土"].map((d) => `<div class="calendar-week">${d}</div>`).join("")}
      ${RiceOS.calendar.daysForMonth(currentMonth).map(renderDay).join("")}
    `;
    renderSelected();
  }

  function focusDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
    currentMonth = RiceOS.calendar.monthStart(date);
    selectedDate = date;
    const entries = RiceOS.calendar.entriesForDate(date);
    if (displayMode === "planned" && entries.length && !entries.some(isPlan)) displayMode = "all";
    render();
  }

  function bind() {
    const target = U.$("calendarTargetFilter");
    if (target) target.addEventListener("change", () => {
      targetFilter = target.value;
      render();
    });
    const mode = U.$("calendarDisplayMode");
    if (mode) mode.addEventListener("change", () => {
      displayMode = mode.value === "all" ? "all" : "planned";
      render();
    });
    const today = U.$("calendarToday");
    if (today) today.addEventListener("click", () => {
      selectedDate = U.today();
      currentMonth = RiceOS.calendar.monthStart(selectedDate);
      render();
    });
    U.$("calendarGrid").addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      if (!day) return;
      selectedDate = day.dataset.date;
      render();
    });
    const openSelected = U.$("selectedDateSummary");
    if (openSelected) openSelected.addEventListener("click", (event) => {
      const shipment = event.target.closest("[data-calendar-open-shipment]");
      if (shipment) {
        const id = shipment.dataset.calendarOpenShipment;
        const exists = visibleEntries(selectedDate).some((entry) => entry.kind === "shipment" && entry.record?.shipmentId === id);
        if (!exists || !RiceOS.app || !RiceOS.screens.shipments) return;
        if (RiceOS.navigation) RiceOS.navigation.clear();
        RiceOS.app.openInput("shipments", "calendar");
        RiceOS.screens.shipments.openDetail(id);
        return;
      }
      if (event.target.closest("[data-calendar-add-plan]")) {
        if (RiceOS.bottomSheet && RiceOS.bottomSheet.openSchedule) RiceOS.bottomSheet.openSchedule(selectedDate, inputTarget());
        return;
      }
      const action = event.target.closest("[data-calendar-action]");
      if (action) {
        const entry = findEntry(action.dataset.kind, action.dataset.id);
        if (!entry) return;
        if (action.dataset.calendarAction === "confirm" && entry.kind === "schedule" && !scheduleDone(entry.record)
          && RiceOS.state.isWaterConfirmationSchedule && RiceOS.state.isWaterConfirmationSchedule(entry.record)) {
          if (confirm("中干しの確認を済ませましたか？水管理の開始・終了記録は変更しません。")) {
            RiceOS.state.completeSchedule(entry.record.scheduleId);
            render();
          }
          return;
        }
        if (action.dataset.calendarAction === "complete" && entry.kind === "schedule") {
          if (entry.record.targetScope !== "offField" && String(entry.record.title || entry.record.scheduleType || "").includes("追肥") && RiceOS.screens.fertilizer) {
            RiceOS.screens.fertilizer.open(entry.record, render);
            return;
          }
          if (RiceOS.bottomSheet && RiceOS.bottomSheet.openScheduleCompletion) {
            RiceOS.bottomSheet.openScheduleCompletion(entry.record);
            return;
          }
          U.toast("作業入力を開けません。画面を開き直してください。");
          return;
        }
        if (action.dataset.calendarAction === "edit" && RiceOS.recordActions) {
          RiceOS.recordActions.edit(entry.kind, entry.record, { originScreen: "calendar" });
          return;
        }
        if (action.dataset.calendarAction === "delete" && RiceOS.recordActions) {
          RiceOS.recordActions.remove(entry.kind, entry.record);
          render();
          return;
        }
      }
      const fieldButton = event.target.closest("[data-calendar-open-field]");
      if (fieldButton) {
        const fieldId = fieldButton.dataset.calendarOpenField;
        if (fieldId && RiceOS.navigation && RiceOS.navigation.openField) {
          RiceOS.navigation.openField(fieldId, { originScreen: "calendar" });
          return;
        }
      }
      const groupButton = event.target.closest("[data-calendar-open-group]");
      if (groupButton && RiceOS.screens.fields && RiceOS.screens.fields.openGroup) {
        if (RiceOS.navigation && RiceOS.navigation.clear) RiceOS.navigation.clear();
        if (RiceOS.app) RiceOS.app.show("fields");
        RiceOS.screens.fields.openGroup(groupButton.dataset.calendarOpenGroup || "");
        return;
      }
      if (!event.target.closest("[data-calendar-open-selected], [data-calendar-add-record]")) return;
      if (RiceOS.bottomSheet) RiceOS.bottomSheet.open(selectedDate, "", inputTarget());
    });
    document.querySelectorAll("[data-calendar-move]").forEach((button) => {
      button.addEventListener("click", () => {
        currentMonth = RiceOS.calendar.addMonths(currentMonth, Number(button.dataset.calendarMove));
        selectedDate = currentMonth === RiceOS.calendar.monthStart(U.today()) ? U.today() : currentMonth;
        render();
      });
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.calendar = { render, bind, focusDate };
})();
