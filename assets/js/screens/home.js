(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  function memoText(field) {
    return `${field.fixedMemo || ""}\n${field.memo || ""}`.toLowerCase();
  }

  function memoSaysNo(field, keyword) {
    const text = memoText(field);
    if (!text.includes(keyword.toLowerCase())) return false;
    return ["不要", "要らない", "いらない", "しない", "無し", "なし", "不要です"].some((word) => text.includes(word));
  }

  function hasRecentWork(fieldId, workNames, days) {
    return state.fieldWorksFor(fieldId).some((work) => {
      const old = U.daysSince(work.date);
      return workNames.includes(work.workName) && old !== "" && old <= days;
    });
  }

  function hasWorkAfterPlanting(fieldId, workNames) {
    const field = state.field(fieldId);
    return state.fieldWorksFor(fieldId).some((work) => {
      return workNames.includes(work.workName) && (!field.plantingDate || work.date >= field.plantingDate);
    });
  }

  function suggestion(field, title, reason, keyword) {
    if (keyword && memoSaysNo(field, keyword)) {
      return {
        title,
        reason: `固定メモに「${keyword}不要」系の記録あり`,
        skip: true
      };
    }
    return { title, reason, skip: false };
  }

  function diagnosisFor(field) {
    const today = U.today();
    const dap = U.daysAfterPlanting(field, today);
    const lastGrowth = state.lastGrowthLog(field.fieldId);
    const lastGrowthAge = lastGrowth ? U.daysSince(lastGrowth.date) : "";
    const list = [];

    if (!field.plantingDate) {
      list.push({ title: "田植日を確認", reason: "田植後日数の表示に必要", skip: false });
    }

    if (!lastGrowth || lastGrowthAge > 7) {
      list.push({ title: "生育ログ更新", reason: lastGrowth ? `前回から${lastGrowthAge}日` : "まだ記録なし", skip: false });
    }

    if (dap !== "" && dap >= 25 && dap <= 48 && !hasWorkAfterPlanting(field.fieldId, ["中干し開始"])) {
      list.push(suggestion(field, "中干し開始を確認", `田植後${dap}日`, "中干し"));
    }

    if (dap !== "" && dap >= 28 && dap <= 55 && !hasWorkAfterPlanting(field.fieldId, ["溝切り"])) {
      list.push(suggestion(field, "溝切りを確認", `田植後${dap}日`, "溝切り"));
    }

    if (dap !== "" && dap >= 35 && dap <= 65 && !hasRecentWork(field.fieldId, ["追肥"], 21)) {
      list.push(suggestion(field, "追肥判断", `田植後${dap}日。葉色と品種レシピを確認`, "追肥"));
    }

    if (lastGrowth && ["多い", "注意"].includes(lastGrowth.weed)) {
      list.push(suggestion(field, "雑草を確認", `前回ログ：雑草${lastGrowth.weed}`, "除草"));
    }

    if (!list.length) {
      list.push({ title: "大きな抜けなし", reason: "固定メモと最近の記録を確認済み", skip: false });
    }

    return list;
  }

  function lastYearRows(fieldId) {
    const range = U.lastYearSamePeriod(U.today(), 10);
    const works = state.fieldWorksFor(fieldId)
      .filter((w) => U.inDateRange(w.date, range.start, range.end))
      .map((w) => ({ date: w.date, label: w.workName, memo: w.memo || w.material || "" }));
    const growth = state.growthLogsFor(fieldId)
      .filter((g) => U.inDateRange(g.date, range.start, range.end))
      .map((g) => ({ date: g.date, label: "生育ログ", memo: `葉色:${g.leafColor} 雑草:${g.weed}` }));
    return [...works, ...growth].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 3);
  }

  function fixedMemoPills(field) {
    const memo = String(field.fixedMemo || "").trim();
    if (!memo) return '<span class="pill">固定メモなし</span>';
    return memo.split(/[、,\n]/).map((part) => part.trim()).filter(Boolean).slice(0, 5)
      .map((part) => `<span class="pill warn">${U.escapeHTML(part)}</span>`).join("");
  }

  function renderKpis() {
    const data = state.data();
    const year = new Date().getFullYear();
    const thisYearWorks = data.fieldWorks.filter((w) => U.number(w.season) === year);
    const hours = thisYearWorks.reduce((sum, w) => sum + U.parseWorkHours(w.hours), 0);
    const area = state.fields().reduce((sum, f) => sum + U.number(f.areaA), 0);
    const alertCount = RiceOS.alerts.todayFocusItems().filter((item) => ["urgent", "warn"].includes(item.priority)).length;
    U.$("homeKpis").innerHTML = [
      ["管理面積", `${Math.round(area * 10) / 10}a`, "ok"],
      ["圃場", `${state.fields().length}枚`, "info"],
      ["今日の注意", `${alertCount}件`, alertCount ? "bad" : "purple"],
      ["今年の作業時間", U.formatHours(hours), "warn"]
    ].map(([label, value, tone]) => `
      <div class="kpi">
        <div class="label">${U.escapeHTML(label)}</div>
        <div class="value"><span class="pill ${tone}">${U.escapeHTML(value)}</span></div>
      </div>
    `).join("");
  }

  function renderCard(field) {
    const variety = state.variety(field.varietyId);
    const dap = U.daysAfterPlanting(field, U.today());
    const lastWork = state.lastFieldWork(field.fieldId);
    const lastGrowth = state.lastGrowthLog(field.fieldId);
    const diag = diagnosisFor(field);
    const komume = RiceOS.alerts.komumeForField(field, diag);
    const lastYear = komume.lastYear.length ? komume.lastYear : lastYearRows(field.fieldId);
    const skipCount = diag.filter((item) => item.skip).length;

    return `
      <article class="field-card">
        <div class="field-card-head">
          <div>
            <div class="title-line">
              <span class="field-name">🌾 ${U.escapeHTML(field.name)}</span>
              <span class="pill ok">${U.escapeHTML(variety && variety.name || "品種未設定")}</span>
            </div>
            <div>
              <span class="pill info">${U.escapeHTML(String(field.areaA || 0))}a</span>
              ${field.plantingDate ? `<span class="pill warn">田植後${U.escapeHTML(String(dap))}日</span>` : '<span class="pill bad">田植日未設定</span>'}
              <span class="pill">${U.escapeHTML(field.status || "使用中")}</span>
            </div>
          </div>
          <span class="pill ${komume.tone}">${U.escapeHTML(komume.priorityLabel)}</span>
        </div>
        <div class="field-card-body diagnosis">
          <div class="diag-block komume-opinion">
            <b>小梅の見立て</b>
            <div class="opinion-text">${U.escapeHTML(komume.opinion)}</div>
            <div class="mini-note">
              ${komume.notes.slice(1, 3).map((note) => `<span>${U.escapeHTML(note)}</span>`).join("")}
            </div>
          </div>
          <div class="diag-block">
            <b>今日やること</b>
            ${komume.doNow.length ? komume.doNow.slice(0, 4).map((item) => `<span class="pill warn">${U.escapeHTML(item)}</span>`).join("") : '<span class="pill ok">急ぎなし</span>'}
          </div>
          <div class="diag-block">
            <b>水管理</b>
            ${komume.water.length ? komume.water.map((item) => `<div class="water-alert ${U.attr(item.priority)}"><b>${U.escapeHTML(item.title)}</b><span>${U.escapeHTML(item.message)}</span></div>`).join("") : '<span class="pill">水管理予定なし</span>'}
          </div>
          <div class="diag-block">
            <b>固定メモ</b>
            <div>${fixedMemoPills(field)}</div>
          </div>
          <div class="diag-block">
            <b>小梅メモ</b>
            <div class="suggestion-list">
              ${diag.map((item) => `
                <div class="suggestion ${item.skip ? "skip" : ""}">
                  <b>${U.escapeHTML(item.title)}</b>
                  <span>${U.escapeHTML(item.reason)}</span>
                </div>
              `).join("")}
            </div>
            ${komume.avoid.length ? `<div class="avoid-list"><b>固定メモで除外</b>${komume.avoid.map((item) => `<span class="pill">${U.escapeHTML(item)}</span>`).join("")}</div>` : ""}
          </div>
          <div class="diag-block">
            <b>直近</b>
            <span class="pill info">作業 ${lastWork ? `${U.fd(lastWork.date)} ${lastWork.workName}` : "なし"}</span>
            <span class="pill purple">生育 ${lastGrowth ? `${U.fd(lastGrowth.date)} 葉色:${lastGrowth.leafColor}` : "なし"}</span>
            ${komume.leafScore ? `<span class="leaf-meter tone-${U.attr(komume.leafTone)}"><span style="width:${U.attr(String(U.number(komume.leafScore, 0) * 20))}%"></span></span>` : ""}
          </div>
          <div class="diag-block">
            <b>去年同時期</b>
            ${lastYear.length ? lastYear.map((row) => `<div class="muted">${U.escapeHTML(U.fd(row.date))} ${U.escapeHTML(row.label)} ${U.escapeHTML(row.memo)}</div>`).join("") : '<div class="muted">記録なし</div>'}
          </div>
        </div>
        <div class="field-card-actions">
          <button class="secondary" data-home-action="field" data-field-id="${U.attr(field.fieldId)}">カルテ編集</button>
          <button class="secondary" data-home-action="work" data-field-id="${U.attr(field.fieldId)}">作業入力</button>
          <button class="secondary" data-home-action="growth" data-field-id="${U.attr(field.fieldId)}">生育入力</button>
          <button class="secondary" data-home-action="calendar" data-field-id="${U.attr(field.fieldId)}">水予定</button>
        </div>
      </article>
    `;
  }

  function render() {
    renderKpis();
    renderTodayFocus();
    const fields = state.activeFields();
    U.$("homeSummary").textContent = `${fields.length}圃場`;
    U.$("komumeCards").innerHTML = fields.length
      ? fields.map(renderCard).join("")
      : '<div class="empty">使用中の圃場がありません。</div>';
  }

  function renderTodayFocus() {
    const el = U.$("todayFocus");
    if (!el) return;
    const items = RiceOS.alerts.todayFocusItems().slice(0, 8);
    el.innerHTML = items.length ? items.map((item) => `
      <div class="focus-item ${U.attr(item.priority)}">
        <span class="pill ${U.attr(RiceOS.alerts.toneForPriority(item.priority))}">${U.escapeHTML(RiceOS.alerts.priorityLabel(item.priority))}</span>
        <b>${U.escapeHTML(item.fieldName || item.title)}</b>
        <span>${U.escapeHTML(item.message)}</span>
      </div>
    `).join("") : '<div class="empty">今日の水管理アラートや記録漏れはありません。</div>';
  }

  function bind() {
    U.$("komumeCards").addEventListener("click", (event) => {
      const button = event.target.closest("[data-home-action]");
      if (!button) return;
      const fieldId = button.dataset.fieldId;
      const action = button.dataset.homeAction;
      if (action === "field") RiceOS.app.show("fields");
      if (action === "work") {
        RiceOS.app.show("field-work");
        RiceOS.screens.fieldWork.prefillField(fieldId);
      }
      if (action === "growth") {
        RiceOS.app.show("growth");
        RiceOS.screens.growth.prefillField(fieldId);
      }
      if (action === "calendar") {
        const field = state.field(fieldId);
        if (field) RiceOS.alerts.downloadFieldCalendar(field);
      }
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.home = { render, bind, diagnosisFor, memoSaysNo };
})();
