(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  const GROUPS = [
    {
      title: "田植設定",
      fields: [
        ["rowSpacing", "条間"],
        ["plantSpacing", "株間"],
        ["plantsPerHill", "植付本数"],
        ["seedlingBoxes", "苗箱数"],
        ["transplanterSetting", "田植機設定メモ"]
      ]
    },
    {
      title: "基肥",
      fields: [
        ["baseFertilizerName", "肥料名"],
        ["baseFertilizerNpk", "N-P-K"],
        ["baseFertilizerAmount", "施肥量"]
      ]
    },
    {
      title: "除草・防除・追肥",
      fields: [
        ["boxTreatment", "箱処理剤"],
        ["initialHerbicide", "初期除草剤"],
        ["initialInsecticide", "初期防除"],
        ["midHerbicide", "中期除草剤"],
        ["midHerbicideTiming", "中期除草時期"],
        ["topDressingName", "追肥名"],
        ["topDressingAmount", "追肥量"],
        ["topDressingTiming", "追肥時期"],
        ["pestControlPlan", "防除計画"]
      ]
    }
  ];

  function input(variety, key, label) {
    return `
      <label>${U.escapeHTML(label)}
        <input data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="${U.attr(key)}" value="${U.attr(variety[key] || "")}">
      </label>
    `;
  }

  function renderGroup(variety, group) {
    return `
      <div class="diag-block">
        <b>${U.escapeHTML(group.title)}</b>
        <div class="form-grid" style="box-shadow:none;margin:8px 0 0;padding:0;border:0;background:transparent">
          ${group.fields.map(([key, label]) => input(variety, key, label)).join("")}
        </div>
      </div>
    `;
  }

  function renderRecipe(variety) {
    const fieldCount = state.fields().filter((field) => field.varietyId === variety.varietyId).length;
    return `
      <article class="record">
        <div class="record-head">
          <div>
            <div class="field-name">${U.escapeHTML(variety.name)}</div>
            <span class="pill ok">${fieldCount}圃場</span>
          </div>
        </div>
        <div class="record-body diagnosis">
          <label>品種名
            <input data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="name" value="${U.attr(variety.name)}">
          </label>
          ${GROUPS.map((group) => renderGroup(variety, group)).join("")}
          <label>メモ
            <textarea data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="memo">${U.escapeHTML(variety.memo || "")}</textarea>
          </label>
        </div>
      </article>
    `;
  }

  function render() {
    U.$("recipeList").innerHTML = `<div class="record-grid">${state.varieties().map(renderRecipe).join("")}</div>`;
  }

  function bind() {
    U.$("recipeList").addEventListener("change", (event) => {
      const el = event.target.closest("[data-recipe-field]");
      if (!el) return;
      state.updateVariety(el.dataset.varietyId, { [el.dataset.recipeField]: el.value });
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.recipes = { render, bind };
})();
