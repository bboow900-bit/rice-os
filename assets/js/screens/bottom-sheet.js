(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  let selectedDate = U.today();

  function entryHtml(entry) {
    return `
      <div class="mini-card ${U.attr(entry.kind)}">
        <b>${U.escapeHTML(entry.title)}</b>
        <span>${U.escapeHTML(entry.subtitle || "")}</span>
        ${entry.memo ? `<small>${U.escapeHTML(entry.memo)}</small>` : ""}
        ${entry.hasPhoto ? '<span class="pill info">写真あり</span>' : ""}
      </div>
    `;
  }

  function render() {
    U.$("sheetDateTitle").textContent = `${U.fd(selectedDate)} の記録`;
    const rows = RiceOS.calendar.entriesForDate(selectedDate);
    U.$("sheetEntries").innerHTML = rows.length ? rows.map(entryHtml).join("") : '<div class="empty">この日の記録はまだありません。</div>';
  }

  function open(date) {
    selectedDate = date || U.today();
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

  function addSchedule() {
    const title = prompt("予定名を入力してください", "作業予定");
    if (title === null) return;
    const memo = prompt("メモがあれば入力してください", "") || "";
    state.saveSchedule({
      date: selectedDate,
      fieldIds: firstFieldId() ? [firstFieldId()] : [],
      scheduleType: title,
      title,
      memo
    });
  }

  function bind() {
    U.$$("#dateSheet [data-sheet-close]").forEach((el) => el.addEventListener("click", close));
    U.$("dateSheet").addEventListener("click", (event) => {
      const button = event.target.closest("[data-sheet-add]");
      if (!button) return;
      const action = button.dataset.sheetAdd;
      close();
      if (action === "growth") {
        RiceOS.app.show("growth");
        RiceOS.screens.growth.prefillDate(selectedDate, firstFieldId());
      } else if (action === "work") {
        RiceOS.app.show("field-work");
        RiceOS.screens.fieldWork.prefillDate(selectedDate, firstFieldId());
      } else if (action === "material") {
        RiceOS.app.show("materials");
      } else if (action === "schedule") {
        addSchedule();
      } else if (action === "harvest") {
        RiceOS.app.show("results");
      } else if (action === "shipment") {
        RiceOS.app.show("results");
      }
    });
  }

  RiceOS.bottomSheet = { open, close, render };
  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.bottomSheet = { bind };
})();
