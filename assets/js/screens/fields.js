(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  function varietyOptions(selectedId) {
    return state.varieties().map((v) => `<option value="${U.attr(v.varietyId)}" ${v.varietyId === selectedId ? "selected" : ""}>${U.escapeHTML(v.name)}</option>`).join("");
  }

  function statusOptions(selected) {
    return ["使用中", "休耕", "終了"].map((value) => `<option ${value === selected ? "selected" : ""}>${value}</option>`).join("");
  }

  function input(field, key, label, type) {
    return `
      <label>${U.escapeHTML(label)}
        <input type="${U.attr(type || "text")}" data-field-id="${U.attr(field.fieldId)}" data-field-field="${U.attr(key)}" value="${U.attr(field[key] || "")}">
      </label>
    `;
  }

  function renderField(field) {
    const variety = state.variety(field.varietyId);
    return `
      <article class="record">
        <div class="record-head">
          <div>
            <div class="field-name">${U.escapeHTML(field.name)}</div>
            <span class="pill ok">${U.escapeHTML(variety && variety.name || "品種未設定")}</span>
            <span class="pill info">${U.escapeHTML(String(field.areaA || 0))}a</span>
            ${field.plantingDate ? `<span class="pill warn">田植 ${U.escapeHTML(U.fd(field.plantingDate))}</span>` : '<span class="pill bad">田植日未設定</span>'}
          </div>
        </div>
        <div class="record-body">
          <div class="form-grid" style="box-shadow:none;margin:0;padding:0;border:0;background:transparent">
            ${input(field, "name", "圃場名")}
            <label>品種
              <select data-field-id="${U.attr(field.fieldId)}" data-field-field="varietyId">${varietyOptions(field.varietyId)}</select>
            </label>
            ${input(field, "areaA", "面積(a)", "number")}
            <label>状態
              <select data-field-id="${U.attr(field.fieldId)}" data-field-field="status">${statusOptions(field.status)}</select>
            </label>
            ${input(field, "plantingDate", "田植日", "date")}
            ${input(field, "drainageStartDate", "中干し開始日", "date")}
            ${input(field, "drainageTargetDays", "中干し目安日数", "number")}
            ${input(field, "intermittentStartDate", "間断灌水開始日", "date")}
            ${input(field, "intermittentIntervalDays", "間断灌水の確認間隔（日）", "number")}
            ${input(field, "sortOrder", "表示順", "number")}
            ${input(field, "waterHabit", "水の癖")}
            ${input(field, "weedRisk", "雑草の癖")}
            <label class="wide">固定メモ
              <textarea data-field-id="${U.attr(field.fieldId)}" data-field-field="fixedMemo" placeholder="例：溝切り不要、ノビエ多い">${U.escapeHTML(field.fixedMemo || "")}</textarea>
            </label>
            <label class="wide">通常メモ
              <textarea data-field-id="${U.attr(field.fieldId)}" data-field-field="memo">${U.escapeHTML(field.memo || "")}</textarea>
            </label>
          </div>
        </div>
        <div class="record-actions single-action">
          <button class="secondary" type="button" data-field-action="calendar" data-field-id="${U.attr(field.fieldId)}">水管理をカレンダー登録</button>
        </div>
      </article>
    `;
  }

  function render() {
    U.$("fieldList").innerHTML = `<div class="record-grid">${state.fields().map(renderField).join("")}</div>`;
  }

  function bind() {
    U.$("fieldList").addEventListener("change", (event) => {
      const el = event.target.closest("[data-field-field]");
      if (!el) return;
      const key = el.dataset.fieldField;
      const value = ["areaA", "sortOrder"].includes(key) ? U.number(el.value, 0) : el.value;
      state.updateField(el.dataset.fieldId, { [key]: value });
    });

    U.$("fieldList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-field-action]");
      if (!button) return;
      const field = state.field(button.dataset.fieldId);
      if (!field) return;
      if (button.dataset.fieldAction === "calendar") RiceOS.alerts.downloadFieldCalendar(field);
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.fields = { render, bind };
})();
