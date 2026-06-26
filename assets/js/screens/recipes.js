(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;

  const GROUPS = [
    {
      title: "田植機設定",
      fields: [
        ["rowSpacing", "条間"],
        ["plantSpacing", "株間"],
        ["plantsPerHill", "植付本数"],
        ["transplanterSetting", "田植機設定メモ"]
      ]
    },
    {
      title: "基肥",
      fields: [
        ["baseFertilizerName", "肥料名"],
        ["baseFertilizerNpk", "N-P-K"],
        ["baseFertilizerAmount", "施肥量"],
        ["baseFertilizerBagKg", "1袋kg"]
      ]
    },
    {
      title: "初期資材",
      fields: [
        ["boxTreatment", "箱処理剤"],
        ["initialHerbicide", "初期除草剤"],
        ["initialInsecticide", "殺虫剤"]
      ]
    },
    {
      title: "中期除草剤・追肥・防除",
      fields: [
        ["midHerbicide", "中期除草剤"],
        ["midHerbicideTiming", "散布目安"],
        ["topDressingName", "追肥肥料名"],
        ["topDressingAmount", "追肥量"],
        ["topDressingTiming", "追肥時期"],
        ["pestControlPlan", "防除計画"]
      ]
    },
    {
      title: "目標",
      fields: [
        ["targetTillers", "中干し前目標分げつ数"]
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

  function renderGroup(variety, group, open) {
    return `
      <details class="form-section" ${open ? "open" : ""}>
        <summary>${U.escapeHTML(group.title)}</summary>
        <div class="form-grid dense inline-grid">
          ${group.fields.map(([key, label]) => input(variety, key, label)).join("")}
        </div>
      </details>
    `;
  }

  function renderRecipe(variety) {
    const fieldCount = state.fields().filter((field) => field.varietyId === variety.varietyId).length;
    return `
      <article class="record recipe-card">
        <div class="record-head">
          <div>
            <div class="field-name">${U.escapeHTML(variety.name)}</div>
            <span class="pill ok">${fieldCount}圃場</span>
            ${variety.targetTillers ? `<span class="pill info">目標 ${U.escapeHTML(variety.targetTillers)}</span>` : ""}
          </div>
        </div>
        <div class="record-body">
          <details class="form-section" open>
            <summary>品種</summary>
            <div class="form-grid dense inline-grid">
              <label>品種名
                <input data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="name" value="${U.attr(variety.name)}">
              </label>
            </div>
          </details>
          ${GROUPS.map((group, index) => renderGroup(variety, group, index < 2)).join("")}
          <details class="form-section">
            <summary>メモ</summary>
            <label>メモ
              <textarea data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="memo">${U.escapeHTML(variety.memo || "")}</textarea>
            </label>
          </details>
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
