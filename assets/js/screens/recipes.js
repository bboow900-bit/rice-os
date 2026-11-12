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
      title: "温湯殺菌の参考設定",
      fields: [
        ["hotWaterTemperatureC", "水温（℃）"],
        ["hotWaterDurationMinutes", "処理時間（分）"],
        ["hotWaterBatchKg", "1回の処理量（kg）"]
      ]
    },
    {
      title: "浸種・催芽の参考設定",
      fields: [
        ["soakingWaterTemperatureC", "浸種の設定水温（℃）"],
        ["soakingAccumulatedWaterTempMin", "浸種の積算水温 下限（℃・日）"],
        ["soakingAccumulatedWaterTempMax", "浸種の積算水温 上限（℃・日）"],
        ["germinationTemperatureC", "催芽の設定水温（℃）"],
        ["germinationHoursMin", "催芽時間の参考 下限（時間）"],
        ["germinationHoursMax", "催芽時間の参考 上限（時間）"]
      ]
    },
    {
      title: "追肥の目安",
      fields: [
        ["topDressingName", "追肥肥料名"],
        ["topDressingAmount", "追肥量"],
        ["topDressingDaysBeforeHeading", "追肥時期の目安（出穂何日前）"]
      ]
    },
    {
      title: "生育の目安（品種共通の平均値）",
      fields: [
        ["targetTillers", "中干し前目標分げつ数"],
        ["panicleInitiationDaysAfterPlanting", "幼穂形成期の目安（田植え後の日数）"],
        ["headingDaysAfterPlanting", "出穂期の目安（田植え後の日数）"],
        ["ripeningAccumulatedTempTarget", "出穂後 収穫目安℃"]
      ]
    }
  ];
  const groupOrder = ["生育の目安（品種共通の平均値）", "追肥の目安", "温湯殺菌の参考設定", "浸種・催芽の参考設定", "田植機設定", "基肥"];
  GROUPS.sort((a,b) => groupOrder.indexOf(a.title) - groupOrder.indexOf(b.title));

  const NUMERIC = /^(hotWater|soaking|germination|topDressingDays|panicleInitiationDays|headingDays)/;

  function input(variety, key, label) {
    return `
      <label>${U.escapeHTML(label)}
        <input ${NUMERIC.test(key) ? 'type="number" min="0" step="any" inputmode="decimal"' : ''} data-variety-id="${U.attr(variety.varietyId)}" data-recipe-field="${U.attr(key)}" value="${U.attr(variety[key] ?? "")}">
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

  function historySummary(variety) {
    const model = RiceOS.cultivation;
    if (!model || !model.forVariety) return "";
    const history = model.forVariety(variety.varietyId);
    const rows = [["panicle", "幼穂形成期", "panicleInitiationDaysAfterPlanting"], ["heading", "出穂期", "headingDaysAfterPlanting"]];
    return `<section class="recipe-readonly"><h4>これまでの実績</h4>${rows.map(([key,label,field]) => {
      const stat = history && history[key];
      const mean = stat && Number(stat.mean);
      if (!stat || !Number.isFinite(mean) || mean <= 0) return `<p>${label}：比較できる実測記録はまだありません。</p>`;
      return `<p><b>${label}：田植え後 約${Math.round(mean)}日</b><br><small>${Array.isArray(stat.years) ? stat.years.length : 0}年分 / ${U.escapeHTML(String(stat.count || ""))}圃場年 / ${U.escapeHTML(String(stat.min))}〜${U.escapeHTML(String(stat.max))}日</small></p><button type="button" class="secondary" data-recipe-adopt="${field}" data-recipe-days="${Math.round(mean)}">この実績平均を編集に反映</button>`;
    }).join("")}<p class="muted">実測記録と当時の品種を確認できる履歴が対象です。採用後も、保存するまではマスターは変わりません。</p></section>`;
  }

  function render() {
    const root = U.$("recipeList"), row = selectedId && state.variety(selectedId);
    if (selectedId && !row) {selectedId="";editing=false;draft=null;}
    if (!row) {
      root.innerHTML = `<div class="recipe-ledger-list">${state.varieties().map(v => `<button type="button" class="recipe-open" data-recipe-open="${U.attr(v.varietyId)}"><b>${U.escapeHTML(v.name)}</b><small>${state.fields().filter(f=>f.varietyId===v.varietyId).length}圃場 / 詳細を見る ›</small></button>`).join("") || '<p class="empty">レシピはまだありません。</p>'}</div>`;
    } else if (editing) {
      root.innerHTML = `<div class="recipe-ledger-actions"><button type="button" data-recipe-cancel class="secondary">取消</button><button type="button" data-recipe-save class="primary">変更を保存</button></div><p id="recipeValidationError" role="alert"></p><p class="muted">品種共通の参考値です。温湯殺菌の5kgは使用設備に合わせた設定です。浸種の積算水温と催芽時間は別に扱い、実際の芽の状態で判断します。</p>${renderRecipe(draft)}`;
    } else {
      root.innerHTML = `<div class="recipe-ledger-actions"><button type="button" data-recipe-back class="secondary">一覧へ</button><button type="button" data-recipe-edit class="primary">編集</button><button type="button" class="secondary" data-variety-delete="${U.attr(row.varietyId)}">削除</button></div><h3>${U.escapeHTML(row.name)}</h3>${historySummary(row)}${GROUPS.map(group => `<section class="recipe-readonly"><h4>${U.escapeHTML(group.title)}</h4><dl>${group.fields.map(([key,label]) => `<div><dt>${U.escapeHTML(label)}</dt><dd>${U.escapeHTML(row[key] === "" || row[key] == null ? "未登録" : String(row[key]))}</dd></div>`).join("")}</dl></section>`).join("")}<p>${U.escapeHTML(row.memo || "")}</p>`;
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

  function openReferenceDraft(varietyId, values) {
    const variety=state.variety(varietyId);
    if (!variety) return false;
    const allowed=new Set(GROUPS.flatMap(group=>group.fields.map(([key])=>key)));
    const patch=Object.fromEntries(Object.entries(values || {}).filter(([key,value])=>allowed.has(key) && value !== "" && value != null));
    if (!Object.keys(patch).length) return false;
    if (editing && draft && !confirm("現在の編集を取り消して実績の参考値を開きますか？")) return false;
    selectedId=varietyId;draft={...U.clone(variety),...patch};editing=true;
    RiceOS.app.show("recipes");render();return true;
  }

  function bind() {
    U.$("recipeList").addEventListener("click", (event) => {
      const open = event.target.closest("[data-recipe-open]");
      if (open) {selectedId=open.dataset.recipeOpen;editing=false;draft=null;render();return;}
      if (event.target.closest("[data-recipe-edit]")) {draft=U.clone(state.variety(selectedId));editing=true;render();return;}
      const adopt = event.target.closest("[data-recipe-adopt]");
      if (adopt) {draft=U.clone(state.variety(selectedId));draft[adopt.dataset.recipeAdopt]=adopt.dataset.recipeDays;editing=true;render();return;}
      if (event.target.closest("[data-recipe-back],[data-recipe-cancel]")) {handleBack();return;}
      if (event.target.closest("[data-recipe-save]")) {
        try { if (RiceOS.cultivation && RiceOS.cultivation.validateSettings) RiceOS.cultivation.validateSettings(draft); }
        catch (error) { const notice=U.$("recipeValidationError");if(notice)notice.textContent=error.message;return; }
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
  RiceOS.screens.recipes = { render, bind, openReferenceDraft, canHandleBack:()=>Boolean(selectedId), handleBack };
})();
