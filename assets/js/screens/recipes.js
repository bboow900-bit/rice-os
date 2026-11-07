(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let selectedId = "", editing = false, draft = null;
  const syncBack = () => RiceOS.app && RiceOS.app.syncBackButton();

  const GROUPS = [
    {
      title: "田植機設定",
      fields: [
        ["rowSpacing", "条間"],
        ["plantSpacing", "株間"],
        ["plantsPerHill", "植付本数"],
        ["plantsPerTsubo", "坪あたり株数"],
        ["seedlingBoxesPer10a", "10a箱数目安"],
        ["seedlingScrapeAmount", "かき取り量"],
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
        ["targetTillers", "中干し前目標分げつ数"],
        ["panicleInitiationDaysAfterPlanting", "幼穂形成 日数目安"],
        ["panicleAccumulatedTempTarget", "幼穂形成 積算℃"],
        ["headingDaysAfterPlanting", "出穂 日数目安"],
        ["headingAccumulatedTempTarget", "出穂 積算℃"],
        ["ripeningAccumulatedTempTarget", "出穂後 収穫目安℃"]
      ]
    },
    {
      title: "収穫目安の補正",
      fields: [
        ["ripeningAccumulatedTempMin", "出穂後積算℃ 下限"],
        ["ripeningAccumulatedTempMax", "出穂後積算℃ 上限"],
        ["harvestDaysAfterHeadingMin", "出穂後 日数目安（最短）"],
        ["harvestDaysAfterHeadingMax", "出穂後 日数目安（最長）"]
      ]
    }
  ];

  function input(variety, key, label) {
    return `
      <label>${U.escapeHTML(label)}
        <input data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="${U.attr(key)}" value="${U.attr(variety[key] ?? "")}">
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
          <button type="button" class="secondary" data-variety-delete="${U.attr(variety.varietyId)}">削除</button>
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
    const root = U.$("recipeList"), row = selectedId && state.variety(selectedId);
    if (selectedId && !row) {selectedId="";editing=false;draft=null;}
    if (!row) {
      root.innerHTML = `<div class="recipe-ledger-list">${state.varieties().map(v => `<button type="button" class="recipe-open" data-recipe-open="${U.attr(v.varietyId)}"><b>${U.escapeHTML(v.name)}</b><small>${state.fields().filter(f=>f.varietyId===v.varietyId).length}圃場 / 詳細を見る ›</small></button>`).join("") || '<p class="empty">レシピはまだありません。</p>'}</div>`;
    } else if (editing) {
      root.innerHTML = `<div class="recipe-ledger-actions"><button type="button" data-recipe-cancel class="secondary">取消</button><button type="button" data-recipe-save class="primary">変更を保存</button></div>${renderRecipe(draft)}`;
    } else {
      root.innerHTML = `<div class="recipe-ledger-actions"><button type="button" data-recipe-back class="secondary">一覧へ</button><button type="button" data-recipe-edit class="primary">編集</button><button type="button" class="secondary" data-variety-delete="${U.attr(row.varietyId)}">削除</button></div><h3>${U.escapeHTML(row.name)}</h3>${GROUPS.map(group => `<section class="recipe-readonly"><h4>${U.escapeHTML(group.title)}</h4><dl>${group.fields.map(([key,label]) => `<div><dt>${U.escapeHTML(label)}</dt><dd>${U.escapeHTML(row[key] === "" || row[key] == null ? "未登録" : String(row[key]))}</dd></div>`).join("")}</dl></section>`).join("")}<p>${U.escapeHTML(row.memo || "")}</p>`;
    }
    syncBack();
  }

  function handleBack() {
    if (editing) {
      const row = state.variety(selectedId);
      if (JSON.stringify(draft) !== JSON.stringify(row) && !confirm("編集内容を取り消して戻りますか？")) return true;
      editing=false;draft=null;render();return true;
    }
    if (selectedId) {selectedId="";render();return true;}
    return false;
  }

  function bind() {
    U.$("recipeList").addEventListener("click", (event) => {
      const open = event.target.closest("[data-recipe-open]");
      if (open) {selectedId=open.dataset.recipeOpen;editing=false;draft=null;render();return;}
      if (event.target.closest("[data-recipe-edit]")) {draft=U.clone(state.variety(selectedId));editing=true;render();return;}
      if (event.target.closest("[data-recipe-back],[data-recipe-cancel]")) {handleBack();return;}
      if (event.target.closest("[data-recipe-save]")) {
        const patch = {...draft};delete patch.varietyId;
        if (state.updateVariety(selectedId,patch)) {editing=false;draft=null;render();}
        return;
      }
      const button = event.target.closest("[data-variety-delete]");
      if (!button) return;
      const variety = state.variety(button.dataset.varietyDelete);
      if (!variety || !confirm(`品種「${variety.name}」の栽培レシピを削除しますか？この操作は取り消せません。`)) return;
      state.deleteVariety(variety.varietyId);
    });
    const capture = (event) => {
      const el = event.target.closest("[data-recipe-field]");
      if (!el) return;
      if (editing && draft && draft.varietyId === el.dataset.varietyId) draft[el.dataset.recipeField] = el.value;
    };
    U.$("recipeList").addEventListener("input", capture);
    U.$("recipeList").addEventListener("change", capture);
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.recipes = { render, bind, canHandleBack:()=>Boolean(selectedId), handleBack };
})();
