(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  function photoLogs(fieldId) {
    return state.growthLogsFor(fieldId)
      .filter((log) => log.photoData || log.photo)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function renderPhotoCard(log) {
    const field = state.field(log.fieldId);
    const dap = U.daysAfterPlanting(field, log.date);
    return `
      <article class="photo-card">
        ${log.photoData ? `<img src="${U.attr(log.photoData)}" alt="">` : ""}
        <div class="photo-card-body">
          <b>${U.escapeHTML(U.fd(log.date))} ${U.escapeHTML(field && field.name || "")}</b>
          ${dap !== "" ? `<span class="pill warn">田植後${U.escapeHTML(String(dap))}日</span>` : ""}
          ${!log.photoData && log.photo ? `<div class="pill info">${U.escapeHTML(log.photo)}</div>` : ""}
          <div class="muted">葉色:${U.escapeHTML(log.leafColor)} / 雑草:${U.escapeHTML(log.weed)} / ガス:${U.escapeHTML(log.gas)} / 水:${U.escapeHTML(log.water)}</div>
          ${log.memo ? `<div>${U.escapeHTML(log.memo)}</div>` : ""}
          <div class="record-actions single-action">
            <button class="secondary" type="button" data-photo-action="edit-growth" data-id="${U.attr(log.logId)}">生育ログを編集</button>
          </div>
        </div>
      </article>
    `;
  }

  function currentFieldId() {
    const select = U.$("photoField");
    const fields = state.fields();
    if (!fields.length) return "";
    if (!fields.some((field) => field.fieldId === select.value)) select.value = fields[0].fieldId;
    return select.value || fields[0].fieldId;
  }

  function renderCompare(fieldId) {
    const range = U.lastYearSamePeriod(U.today(), 10);
    const rows = photoLogs(fieldId).filter((log) => U.inDateRange(log.date, range.start, range.end));
    U.$("photoCompareRange").textContent = `${U.fd(range.start)} - ${U.fd(range.end)}`;
    U.$("photoCompare").innerHTML = rows.length ? rows.slice(0, 6).map(renderPhotoCard).join("") : '<div class="empty">去年同時期の写真付き生育ログはありません。</div>';
  }

  function render() {
    const current = U.$("photoField").value;
    U.setOptions(U.$("photoField"), state.fields().map((field) => ({ value: field.fieldId, label: field.name })), current);
    const fieldId = currentFieldId();
    const rows = photoLogs(fieldId);
    U.$("photoTimeline").innerHTML = rows.length ? rows.map(renderPhotoCard).join("") : '<div class="empty">写真付き生育ログはまだありません。</div>';
    renderCompare(fieldId);
  }

  function bind() {
    U.$("photoField").addEventListener("change", render);
    U.$("photoTimeline").addEventListener("click", (event) => {
      const button = event.target.closest("[data-photo-action]");
      if (!button) return;
      if (button.dataset.photoAction === "edit-growth" && RiceOS.screens.growth) {
        RiceOS.app.show("growth");
        RiceOS.screens.growth.editLog(button.dataset.id);
      }
    });
    U.$("photoCompare").addEventListener("click", (event) => {
      const button = event.target.closest("[data-photo-action]");
      if (!button) return;
      if (button.dataset.photoAction === "edit-growth" && RiceOS.screens.growth) {
        RiceOS.app.show("growth");
        RiceOS.screens.growth.editLog(button.dataset.id);
      }
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.photos = { render, bind };
})();
