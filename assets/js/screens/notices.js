(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;

  function toneClass(priority) {
    if (priority === "urgent") return "urgent";
    if (priority === "warn") return "warn";
    if (priority === "watch") return "watch";
    return "ok";
  }

  function renderNotice(item) {
    const tone = toneClass(item.priority);
    const label = RiceOS.alerts && RiceOS.alerts.priorityLabel ? RiceOS.alerts.priorityLabel(item.priority) : "確認";
    return `
      <article class="notice-card ${U.attr(tone)}">
        <span class="notice-icon">${tone === "urgent" ? "!" : tone === "warn" ? "!" : "✓"}</span>
        <div>
          <div class="notice-head">
            <b>${U.escapeHTML(item.title || "確認")}</b>
            <span>${U.escapeHTML(label)}</span>
          </div>
          <p>${U.escapeHTML(item.fieldName || "全体")} / ${U.escapeHTML(item.message || "")}</p>
          ${item.date ? `<small>目安日 ${U.escapeHTML(U.fd(item.date))}</small>` : ""}
        </div>
      </article>
    `;
  }

  function render() {
    const list = U.$("noticeList");
    if (!list) return;
    const items = RiceOS.alerts && RiceOS.alerts.scheduledAlerts ? RiceOS.alerts.scheduledAlerts() : [];
    list.innerHTML = items.length
      ? items.map(renderNotice).join("")
      : '<div class="notice-empty"><b>今日のお知らせはありません</b><span>予定登録した作業だけを、当日と期限超過時に表示します。</span></div>';
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.notices = { render };
})();
