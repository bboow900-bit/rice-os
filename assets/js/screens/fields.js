(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let activeBulkGroup = "";
  let activeFieldId = "";
  let fieldView = "list";
  let fieldSearch = "";
  let fieldGroupFilter = "all";

  const SOIL_TYPES = ["", "砂質", "粘土質", "中間", "その他"];
  const WATER_LEVELS = ["", "良い", "普通", "悪い"];
  const WEEDS = ["ノビエ", "ホタルイ", "クログワイ", "オモダカ", "その他"];
  const FEATURES = ["乾田", "湿田", "ガスが出やすい", "溝切り不要", "水持ちが悪い"];

  function varietyOptions(selectedId) {
    return state.varieties().map((v) => `<option value="${U.attr(v.varietyId)}" ${v.varietyId === selectedId ? "selected" : ""}>${U.escapeHTML(v.name)}</option>`).join("");
  }

  function optionTags(values, selected) {
    return values.map((value) => `<option value="${U.attr(value)}" ${String(value) === String(selected || "") ? "selected" : ""}>${U.escapeHTML(value || "未設定")}</option>`).join("");
  }

  function statusOptions(selected) {
    return ["使用中", "休止", "休耕", "終了"].map((value) => `<option ${value === selected ? "selected" : ""}>${value}</option>`).join("");
  }

  function input(field, key, label, type) {
    return `
      <label>${U.escapeHTML(label)}
        <input type="${U.attr(type || "text")}" data-field-id="${U.attr(field.fieldId)}" data-field-field="${U.attr(key)}" value="${U.attr(field[key] || "")}">
      </label>
    `;
  }

  function arrayInput(field, key, label, presets) {
    const value = Array.isArray(field[key]) ? field[key].join("、") : "";
    return `
      <label>${U.escapeHTML(label)}
        <input data-field-id="${U.attr(field.fieldId)}" data-field-field="${U.attr(key)}" data-array-field="1" list="${U.attr(key)}List" value="${U.attr(value)}" placeholder="${U.attr(presets.join("、"))}">
      </label>
    `;
  }

  function datalist(id, values) {
    return `<datalist id="${U.attr(id)}">${values.map((value) => `<option value="${U.attr(value)}"></option>`).join("")}</datalist>`;
  }

  function latestByDate(rows) {
    return (rows || []).slice().sort((a, b) => String(b.date || b.startDate).localeCompare(String(a.date || a.startDate)))[0] || null;
  }

  function currentSeasonYear() {
    return U.dateYear(U.today());
  }

  function currentYearCache(field, cacheYearKey, dateKeys) {
    const year = currentSeasonYear();
    const explicitYear = String(field && field[cacheYearKey] || "");
    const dates = dateKeys.map((key) => String(field && field[key] || "")).filter(Boolean);
    // Old backups have no cache-year field. A date in this year is still safe.
    return explicitYear === year || (!explicitYear && dates.some((date) => U.dateYear(date) === year));
  }

  function isIntermittentIrrigation(row) {
    return /間断/.test(String(row && row.method || ""));
  }

  function isDeepWaterIrrigation(row) {
    return /深水/.test(String(row && row.method || ""));
  }

  function compactArray(value, emptyText) {
    const rows = Array.isArray(value) ? value : [];
    if (!rows.length) return emptyText || "-";
    return rows.slice(0, 3).join("・") + (rows.length > 3 ? ` ほか${rows.length - 3}` : "");
  }

  function renderKarteMetric(label, value, tone) {
    return `
      <div class="field-karte-metric ${tone || ""}">
        <span>${U.escapeHTML(label)}</span>
        <b>${U.escapeHTML(value || "-")}</b>
      </div>
    `;
  }

  function renderMasterTile(label, value, tone) {
    return `
      <div class="${tone || ""}">
        <span>${U.escapeHTML(label)}</span>
        <b>${U.escapeHTML(value || "-")}</b>
      </div>
    `;
  }

  function renderMiniTiles(items, tone) {
    return `
      <div class="field-master-mini-grid">
        ${items.map((item) => renderMasterTile(item[0], item[1], tone)).join("")}
      </div>
    `;
  }

  function formatNumber(value, digits) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const fixed = n.toFixed(digits == null ? 1 : digits);
    return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  function parseKgPer10a(value) {
    const match = String(value || "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
  }

  function per10a(value, areaA) {
    const amount = U.number(value, 0);
    const area = U.number(areaA, 0);
    if (!amount || !area) return "";
    return formatNumber(amount / area * 10, 1);
  }

  function resolvedWaterPeriodsForField(fieldId, year) {
    if (!state.resolvedWaterPeriodsFor) return [];
    return state.resolvedWaterPeriodsFor(fieldId, { year, throughDate: U.today(), includePlanned: true, forDisplay: true });
  }

  function latestResolvedWaterPeriod(fieldId, kind) {
    return resolvedWaterPeriodsForField(fieldId, currentSeasonYear())
      .filter((row) => row.kind === kind && row.startDate)
      .slice()
      .sort((a, b) => String(b.startDate || b.actualEndDate || "").localeCompare(String(a.startDate || a.actualEndDate || "")))[0] || null;
  }

  function drySummary(field) {
    const year = currentSeasonYear();
    const latest = latestResolvedWaterPeriod(field.fieldId, "dry");
    const useCachedSummary = currentYearCache(field, "drainageSummaryYear", ["drainageStartDate", "drainageActualEndDate", "drainagePlannedEndDate"]);
    const startDate = latest && latest.startDate || (useCachedSummary && field.drainageStartDate) || "";
    const targetDays = latest && latest.targetDays || field.drainageTargetDays || "";
    const plannedEndDate = latest && latest.plannedEndDate || (useCachedSummary && field.drainagePlannedEndDate) || (startDate && targetDays ? U.dateAddDays(startDate, U.number(targetDays, 0)) : "");
    const actualEndDate = latest && latest.actualEndDate || (useCachedSummary && field.drainageActualEndDate) || "";
    const plannedDays = startDate && plannedEndDate ? U.daysBetween(startDate, plannedEndDate) : (targetDays || "");
    const actualDays = (useCachedSummary && field.drainageActualDays) || (startDate && actualEndDate ? U.daysBetween(startDate, actualEndDate) : "");
    const diff = plannedDays !== "" && actualDays !== "" ? U.number(actualDays, 0) - U.number(plannedDays, 0) : "";
    const diffText = diff === "" ? "-" : diff === 0 ? "予定どおり" : diff > 0 ? `+${diff}日` : `${diff}日`;
    return {
      startDate,
      targetDays,
      plannedEndDate,
      actualEndDate,
      plannedDays,
      actualDays,
      diffText,
      status: actualEndDate ? "完了" : (startDate ? "実施中" : "未開始")
    };
  }

  function fertilizerPlan(variety, field) {
    const area = U.number(field.areaA, 0);
    const kgPer10a = parseKgPer10a(variety && variety.baseFertilizerAmount);
    const bagKg = U.number(variety && variety.baseFertilizerBagKg, 20) || 20;
    const totalKg = area && kgPer10a ? area / 10 * kgPer10a : 0;
    const bags = totalKg && bagKg ? totalKg / bagKg : 0;
    return {
      name: variety && variety.baseFertilizerName || "基肥未設定",
      amount: variety && variety.baseFertilizerAmount || "",
      bagKg,
      totalKg,
      bags
    };
  }

  function seedlingPlan(variety, field) {
    const area = U.number(field.areaA, 0);
    const boxesPer10a = U.number(variety && variety.seedlingBoxesPer10a, 0);
    const required = area && boxesPer10a ? area / 10 * boxesPer10a : 0;
    const actual = U.number(field.seedlingBoxes, 0);
    const diff = actual && required ? actual - required : 0;
    return {
      rowSpacing: variety && variety.rowSpacing || "",
      plantSpacing: variety && variety.plantSpacing || "",
      plantsPerTsubo: variety && variety.plantsPerTsubo || "",
      scrapeAmount: variety && variety.seedlingScrapeAmount || "",
      boxesPer10a,
      required,
      actual,
      diff
    };
  }

  const MASTER_MENU = [
    { key: "field-master", group: "マスター", label: "圃場マスター", sub: "土質・面積", icon: "field-master.png", screen: "fields", tone: "green" },
    { key: "recipe", group: "マスター", label: "栽培レシピ", sub: "品種単位", icon: "recipe.png", screen: "recipes", tone: "green" },
    { key: "transplanter", group: "マスター", label: "田植え機", sub: "株間・本数", icon: "transplanter.png", screen: "recipes", tone: "amber" },
    { key: "materials", group: "マスター", label: "資材管理", sub: "在庫・使用", icon: "materials.png", screen: "materials", tone: "amber" },
    { key: "irrigation", group: "記録・確認", label: "水管理", sub: "中干し・深水・間断", icon: "irrigation.png", screen: "irrigation", tone: "water" },
    { key: "photos", group: "記録・確認", label: "写真", sub: "比較素材", icon: "photos.png", screen: "photos", tone: "" },
    { key: "harvest", group: "記録・確認", label: "収穫履歴", sub: "収量・販売", icon: "harvest.png", screen: "results", tone: "amber" }
  ];

  function menuIcon(name) {
    return `assets/images/menu-icons/${name}`;
  }

  function groupName(field) {
    const group = state.groupForField ? state.groupForField(field) : null;
    return group ? group.name : "未設定";
  }

  function groupedFields() {
    return (state.groupedFields ? state.groupedFields({ includeUnassigned: true }) : [])
      .map((group) => ({ ...group, area: group.fields.reduce((sum, field) => sum + U.number(field.areaA, 0), 0) }))
      .sort((a, b) => b.fields.length - a.fields.length || a.name.localeCompare(b.name));
  }

  function fieldsForGroup(fieldGroupId) {
    const group = groupedFields().find((item) => item.fieldGroupId === fieldGroupId);
    return group ? group.fields : [];
  }

  function latestGrowthForField(fieldId) {
    return (state.growthLogsFor ? state.growthLogsFor(fieldId, currentSeasonYear()) : [])
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function riceStageNumberForField(field) {
    if (RiceOS.agro && RiceOS.agro.seasonStageForField) return RiceOS.agro.seasonStageForField(field).image;
    const latest = latestGrowthForField(field.fieldId);
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId, currentSeasonYear()) : "";
    const baseDate = latest && latest.date || U.today();
    const dap = planting ? U.daysBetween(planting, baseDate) : "";
    const tillers = latest ? U.number(latest.tillerCount, 0) : 0;
    const height = latest ? U.number(latest.plantHeightCm, 0) : 0;
    const leaf = latest ? U.number(latest.leafCount, 0) : 0;
    if (!latest && !planting) return 1;
    const signal = Math.max(
      dap === "" ? 0 : U.number(dap, 0),
      height >= 95 ? 115 : height >= 82 ? 96 : height >= 70 ? 80 : height >= 58 ? 66 : height >= 45 ? 52 : height >= 32 ? 38 : height >= 18 ? 22 : 0,
      tillers >= 24 ? 64 : tillers >= 20 ? 54 : tillers >= 16 ? 44 : tillers >= 11 ? 32 : tillers >= 6 ? 20 : 0,
      leaf >= 8 ? 68 : leaf >= 7 ? 54 : leaf >= 6 ? 42 : leaf >= 5 ? 31 : leaf >= 4 ? 20 : 0
    );
    if (signal < 14) return 1;
    if (signal < 26) return 2;
    if (signal < 40) return 3;
    if (signal < 55) return 4;
    if (signal < 70) return 5;
    if (signal < 88) return 6;
    if (signal < 108) return 7;
    return 8;
  }

  function riceStageNumberForGroup(group) {
    return Math.max(1, ...group.fields.map(riceStageNumberForField));
  }

  function groupRiceAsset(stageNumber) {
    const num = Math.max(1, Math.min(8, Number(stageNumber) || 1));
    return `assets/images/rice-stages/rice-card-clump-${String(num).padStart(2, "0")}.png`;
  }

  function groupRiceImage(stageNumber) {
    const num = Math.max(1, Math.min(8, Number(stageNumber) || 1));
    return `<img class="field-group-rice-img" src="${U.attr(groupRiceAsset(num))}" alt="" loading="lazy" data-rice-stage="${U.attr(String(num))}">`;
  }

  function renderMasterSummary() {
    const fields = state.activeFields();
    const area = fields.reduce((sum, field) => sum + U.number(field.areaA, 0), 0);
    const groups = state.fieldGroups ? state.fieldGroups().length : groupedFields().length;
    return `
      <section class="field-master-summary">
        <div><small>管理面積</small><b>${U.escapeHTML(String(Math.round(area * 10) / 10))}a</b></div>
        <div><small>圃場数</small><b>${U.escapeHTML(String(fields.length))}</b></div>
        <div><small>グループ</small><b>${U.escapeHTML(String(groups))}</b></div>
      </section>
    `;
  }

  function renderMasterMenu() {
    const groups = ["マスター", "記録・確認"];
    return `
      <section class="field-master-section">
        <div class="field-master-section-head">
          <h3>管理メニュー</h3>
          <span>項目の本籍地をここに集約</span>
        </div>
        <div class="field-master-menu-stack">
          ${groups.map((group) => `
            <div class="field-master-menu-block">
              <b>${U.escapeHTML(group)}</b>
              <div class="field-master-menu-grid">
                ${MASTER_MENU.filter((item) => item.group === group).map((item) => `
                  <button type="button" class="field-master-menu-button ${U.attr(item.tone || "")}" data-field-master-menu="${U.attr(item.key)}" data-jump-screen="${U.attr(item.screen)}">
                    <img src="${U.attr(menuIcon(item.icon))}" alt="">
                    <b>${U.escapeHTML(item.label)}</b>
                    <small>${U.escapeHTML(item.sub)}</small>
                  </button>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderGroupCards() {
    const groups = groupedFields();
    return `
      <section class="field-master-section">
        <div class="field-master-section-head">
          <h3>圃場グループ</h3>
          <div><span>一括登録の土台</span><button type="button" class="secondary" data-field-group-add>＋ グループ追加</button></div>
        </div>
        <div class="field-group-list">
          ${groups.map((group) => {
            const riceStage = riceStageNumberForGroup(group);
            const isOpen = activeBulkGroup === group.fieldGroupId;
            return `
            <article class="field-group-card ${isOpen ? "open" : ""}" data-field-group-card="${U.attr(group.fieldGroupId)}">
              <span class="field-group-rice stage-${U.attr(String(riceStage).padStart(2, "0"))}" aria-hidden="true">${groupRiceImage(riceStage)}</span>
              <div class="field-group-main">
                <h4>${U.escapeHTML(group.unassigned ? "グループ未設定" : `${group.name}グループ`)}</h4>
                <p>${U.escapeHTML(String(group.fields.length))}圃場 / ${U.escapeHTML(String(Math.round(group.area * 10) / 10))}a</p>
                <div>${group.fields.slice(0, 5).map((field) => `<span>${U.escapeHTML(field.name)}</span>`).join("")}</div>
              </div>
              <div class="field-group-card-actions">
                ${group.unassigned ? "" : `<button type="button" data-field-group-action="bulk" data-field-group="${U.attr(group.fieldGroupId)}">一括登録</button><button type="button" data-field-group-action="edit" data-field-group="${U.attr(group.fieldGroupId)}">編集</button>`}
              </div>
              ${isOpen ? `
                <div class="field-group-field-panel">
                  <b>グループ内の圃場</b>
                  <div>
                    ${group.fields.map((field) => `
                      <button type="button" class="field-group-field-button" data-field-group-field="${U.attr(field.fieldId)}">
                        <span>${U.escapeHTML(field.name)}</span>
                        <small>${U.escapeHTML(state.variety(field.varietyId) && state.variety(field.varietyId).name || "品種未設定")} / ${U.escapeHTML(String(field.areaA || 0))}a</small>
                      </button>
                    `).join("")}
                  </div>
                </div>
              ` : ""}
            </article>
          `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderFieldMasterIntro() {
    return `
      <div class="field-master-home">
        ${renderMasterSummary()}
        ${renderMasterMenu()}
        ${renderGroupCards()}
        ${renderFieldPicker()}
      </div>
    `;
  }

  function selectedField() {
    const fields = state.fields();
    if (!fields.length) return null;
    const selected = activeFieldId && state.field(activeFieldId);
    return selected || fields.slice().sort((a, b) => U.number(a.sortOrder, 0) - U.number(b.sortOrder, 0))[0];
  }

  function renderFieldPicker() {
    const selected = selectedField();
    return `
      <section class="field-master-section field-master-picker-section" data-field-master-picker>
        <div class="field-master-section-head">
          <h3>圃場マスター</h3>
          <span>圃場を選んで編集</span>
        </div>
        <div class="field-master-picker">
          ${state.fields().map((field) => {
            const variety = state.variety(field.varietyId);
            const isSelected = selected && selected.fieldId === field.fieldId;
            const stage = riceStageNumberForField(field);
            return `
              <button type="button" class="${isSelected ? "active" : ""}" data-field-pick="${U.attr(field.fieldId)}">
                <span class="field-master-picker-rice">${groupRiceImage(stage)}</span>
                <b>${U.escapeHTML(field.name)}</b>
                <small>${U.escapeHTML(variety && variety.name || "品種未設定")} / ${U.escapeHTML(String(field.areaA || 0))}a</small>
              </button>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function periodLine(item, fallbackStart, fallbackDays) {
    const start = item && item.startDate || fallbackStart || "";
    const end = item && item.endDate || (start && fallbackDays ? U.dateAddDays(start, U.number(fallbackDays, 0)) : "");
    const observed = item && item.date || U.today();
    const elapsed = start ? U.daysBetween(start, observed) : "";
    const remaining = end ? U.daysBetween(U.today(), end) : "";
    if (!start) return "開始日未設定";
    return [
      `${elapsed !== "" ? `${elapsed}日目` : "進行中"}`,
      remaining !== "" ? (remaining >= 0 ? `残り${remaining}日` : `${Math.abs(remaining)}日超過`) : "",
      end ? `目安 ${U.fd(end)}` : ""
    ].filter(Boolean).join(" / ");
  }

  function renderLatestLog(label, row, parts, tone) {
    if (!row) {
      return `
        <div class="field-karte-log empty">
          <b>${U.escapeHTML(label)}</b>
          <span>まだ記録がありません</span>
        </div>
      `;
    }
    return `
      <div class="field-karte-log ${tone || ""}">
        <b>${U.escapeHTML(label)} <small>${U.escapeHTML(U.fd(row.date || row.startDate))}</small></b>
        <span>${U.escapeHTML((parts || []).filter(Boolean).join(" / "))}</span>
      </div>
    `;
  }

  function photosForField(fieldId, year, limit = 4) {
    const targetYear = year || currentSeasonYear();
    const photos = [
      ...state.growthLogsFor(fieldId, targetYear).map((row) => ({ date: row.date, photoData: row.photoData, photo: row.photo, title: "生育" })),
      ...state.fieldWorksFor(fieldId, targetYear).filter((row) => !(state.waterEventForWorkName && state.waterEventForWorkName(row.workName))).map((row) => ({ date: row.date, photoData: row.photoData, photo: row.photo, title: row.workName || "作業" })),
      ...state.dryPeriodsFor(fieldId, targetYear).map((row) => ({ date: row.date, photoData: row.photoData, photo: row.photo, title: "中干し" }))
    ].filter((row) => row.photoData || row.photo);
    const sorted = photos.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return limit ? sorted.slice(0, limit) : sorted;
  }

  function calendarDistance(dateA, dateB) {
    const a = String(dateA || "").slice(5);
    const b = String(dateB || "").slice(5);
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    return Math.abs(new Date(`2000-${a}T00:00:00`).getTime() - new Date(`2000-${b}T00:00:00`).getTime());
  }

  function photoComparisonForField(field) {
    const currentYear = currentSeasonYear();
    const previousYear = String(Number(currentYear) - 1);
    const current = photosForField(field.fieldId, currentYear)[0] || null;
    // The comparison needs every prior-year photo. The compact strip remains capped at four.
    const previousPhotos = photosForField(field.fieldId, previousYear, 0);
    if (!current) return { currentYear, previousYear, current: null, previous: null, label: "今年の写真がありません" };
    if (!previousPhotos.length) return { currentYear, previousYear, current, previous: null, label: "前年の写真がありません" };
    const currentPlanting = state.plantingDateForField && state.plantingDateForField(field.fieldId, currentYear);
    const previousPlanting = state.plantingDateForField && state.plantingDateForField(field.fieldId, previousYear);
    if (currentPlanting && previousPlanting) {
      const currentDap = U.daysBetween(currentPlanting, current.date);
      const previous = previousPhotos.slice().sort((a, b) => Math.abs(U.daysBetween(previousPlanting, a.date) - currentDap) - Math.abs(U.daysBetween(previousPlanting, b.date) - currentDap))[0];
      const previousDap = U.daysBetween(previousPlanting, previous.date);
      return { currentYear, previousYear, current, previous, label: `田植後 ${currentDap}日 / 前年 ${previousDap}日で比較` };
    }
    const previous = previousPhotos.slice().sort((a, b) => calendarDistance(a.date, current.date) - calendarDistance(b.date, current.date))[0];
    return { currentYear, previousYear, current, previous, label: "同じ暦日の近傍で比較" };
  }

  function renderPhotoComparison(field) {
    const comparison = photoComparisonForField(field);
    const card = (year, photo, current) => photo ? `<figure><img src="${U.attr(photo.photoData)}" alt="${U.attr(`${year}年 ${photo.title}`)}"><figcaption><b>${U.escapeHTML(current ? "今年" : "前年")}</b><span>${U.escapeHTML(U.fd(photo.date))} / ${U.escapeHTML(photo.title)}</span></figcaption></figure>` : `<div class="field-photo-compare-empty"><b>${U.escapeHTML(current ? "今年" : "前年")}</b><span>${U.escapeHTML(current ? "写真未登録" : "前年写真なし")}</span></div>`;
    return `
      <section class="field-photo-compare" aria-label="今年と前年の写真比較">
        <div class="field-photo-compare-head"><div><span>写真比較</span><b>${U.escapeHTML(comparison.label)}</b></div><small>${U.escapeHTML(comparison.currentYear)}年 / ${U.escapeHTML(comparison.previousYear)}年</small></div>
        <div class="field-photo-compare-grid">${card(comparison.currentYear, comparison.current, true)}${card(comparison.previousYear, comparison.previous, false)}</div>
      </section>
    `;
  }

  function renderPhotoStrip(field) {
    const photos = photosForField(field.fieldId);
    if (!photos.length) return '<div class="field-photo-strip empty">写真はまだありません</div>';
    return `
      <div class="field-photo-strip">
        ${photos.map((photo) => `
          <div>
            ${photo.photoData ? `<img src="${U.attr(photo.photoData)}" alt="">` : `<span>${U.escapeHTML(photo.photo || "写真メモ")}</span>`}
            <small>${U.escapeHTML(photo.title)} / ${U.escapeHTML(U.fd(photo.date))}</small>
          </div>
        `).join("")}
      </div>
    `;
  }

  function featureItems(field) {
    return [
      field.soilType,
      field.waterHolding ? `水持ち:${field.waterHolding}` : "",
      ...(Array.isArray(field.fieldFeatures) ? field.fieldFeatures : []),
      ...(Array.isArray(field.commonWeeds) ? field.commonWeeds.map((weed) => `雑草:${weed}`) : [])
    ].filter(Boolean);
  }

  function renderFeatureTags(field) {
    const tags = featureItems(field);
    return tags.length ? tags.slice(0, 8).map((tag) => `<span>${U.escapeHTML(tag)}</span>`).join("") : '<span>特徴未設定</span>';
  }

  function renderKarteDashboard(field) {
    const variety = state.variety(field.varietyId);
    const dap = U.daysAfterPlanting(field, U.today());
    const fixedMemo = String(field.fixedMemo || "").trim();
    const fertilizer = fertilizerPlan(variety, field);
    const seedling = seedlingPlan(variety, field);
    const boxPer10a = per10a(field.seedlingBoxes, field.areaA);
    const fertilizerPer10a = fertilizer.totalKg && field.areaA ? formatNumber(fertilizer.totalKg / U.number(field.areaA, 0) * 10, 1) : "";
    const seedlingDiffText = seedling.actual && seedling.required
      ? `${seedling.diff >= 0 ? "+" : ""}${formatNumber(seedling.diff, 1)}箱`
      : "-";
    const features = featureItems(field);
    const featureText = features.length ? features.slice(0, 3).join("・") + (features.length > 3 ? ` ほか${features.length - 3}` : "") : "未設定";
    const dry = drySummary(field);
    return `
      <div class="field-karte-dashboard">
        <div class="field-master-panels">
          <section class="field-master-panel basic">
            <div class="field-master-panel-head">
              <span class="field-master-panel-icon rice"><img src="assets/images/light-icons/paddy-field.png" alt=""></span>
              <div><h4>圃場基本</h4><p>この田んぼの固定情報</p></div>
            </div>
            <div class="field-master-hero-row">
              <div class="field-master-hero-main">
                <span>品種</span>
                <b>${U.escapeHTML(variety && variety.name || "未設定")}</b>
              </div>
              <div class="field-master-hero-sub">
                <span>面積</span>
                <b>${U.escapeHTML(String(field.areaA || 0))}a</b>
              </div>
            </div>
            ${renderMiniTiles([
              ["分げつ目標", variety && variety.targetTillers || "未設定"],
              ["特徴", featureText]
            ], "green")}
            ${fixedMemo ? `<div class="field-fixed-note compact"><b>固定メモ</b><span>${U.escapeHTML(fixedMemo)}</span></div>` : ""}
          </section>
          <section class="field-master-panel water">
            <div class="field-master-panel-head">
              <span class="field-master-panel-icon tray"><img src="assets/images/menu-icons/dry-period.png" alt=""></span>
              <div><h4>中干し実績</h4><p>予定と実績を分けて表示</p></div>
            </div>
            <div class="field-master-hero-row">
              <div class="field-master-hero-main">
                <span>状態</span>
                <b>${U.escapeHTML(dry.status)}</b>
              </div>
              <div class="field-master-hero-sub">
                <span>予定</span>
                <b>${dry.plannedDays !== "" ? `${U.escapeHTML(String(dry.plannedDays))}日` : "-"}</b>
              </div>
              <div class="field-master-hero-sub">
                <span>実績</span>
                <b>${dry.actualDays !== "" ? `${U.escapeHTML(String(dry.actualDays))}日` : "-"}</b>
              </div>
            </div>
            ${renderMiniTiles([
              ["開始日", dry.startDate ? U.fd(dry.startDate) : "-"],
              ["完了予定", dry.plannedEndDate ? U.fd(dry.plannedEndDate) : "-"],
              ["実際の完了日", dry.actualEndDate ? U.fd(dry.actualEndDate) : "-"],
              ["差分", dry.diffText]
            ], "blue")}
          </section>
          <section class="field-master-panel seedling">
            <div class="field-master-panel-head">
              <span class="field-master-panel-icon tray"><img src="assets/images/light-icons/seedling-tray.png" alt=""></span>
              <div><h4>苗箱計算</h4><p>田植機設定から目安箱数を計算</p></div>
            </div>
            <div class="field-master-hero-row">
              <div class="field-master-hero-main">
                <span>必要箱数</span>
                <b>${seedling.required ? `${U.escapeHTML(formatNumber(seedling.required, 1))}箱` : "未設定"}</b>
              </div>
              <div class="field-master-hero-sub">
                <span>実使用</span>
                <b>${field.seedlingBoxes ? `${U.escapeHTML(String(field.seedlingBoxes))}箱` : "未入力"}</b>
              </div>
              <div class="field-master-hero-sub">
                <span>差分</span>
                <b>${U.escapeHTML(seedlingDiffText)}</b>
              </div>
            </div>
            ${renderMiniTiles([
              ["株間", seedling.plantSpacing || "-"],
              ["坪あたり株数", seedling.plantsPerTsubo ? `${seedling.plantsPerTsubo}株` : "-"],
              ["10a箱数目安", seedling.boxesPer10a ? `${formatNumber(seedling.boxesPer10a, 1)}箱` : "-"],
              ["かき取り量", seedling.scrapeAmount || "未設定"],
              ["実績/10a", boxPer10a ? `${boxPer10a}箱` : "-"]
            ], "amber")}
          </section>
          <section class="field-master-panel fertilizer">
            <div class="field-master-panel-head">
              <span class="field-master-panel-icon bag"><img src="assets/images/light-icons/fertilizer-bag.png" alt=""></span>
              <div><h4>基肥計算</h4><p>レシピから袋数まで自動計算</p></div>
            </div>
            <div class="field-master-hero-row">
              <div class="field-master-hero-main">
                <span>合計</span>
                <b>${fertilizer.totalKg ? `${U.escapeHTML(formatNumber(fertilizer.totalKg, 1))}kg` : "未設定"}</b>
              </div>
              <div class="field-master-hero-sub">
                <span>袋数</span>
                <b>${fertilizer.bags ? `${U.escapeHTML(formatNumber(fertilizer.bags, 1))}袋` : "-"}</b>
              </div>
            </div>
            ${renderMiniTiles([
              ["基肥", fertilizer.name],
              ["施肥量", fertilizer.amount || "-"],
              ["1袋", `${formatNumber(fertilizer.bagKg, 1)}kg`],
              ["肥料kg/10a", fertilizerPer10a ? `${fertilizerPer10a}kg` : "-"]
            ], "purple")}
          </section>
        </div>
        <button class="secondary field-history-link" type="button" data-field-action="history" data-field-id="${U.attr(field.fieldId)}">この圃場の年間履歴を見る</button>
      </div>
    `;
  }

  function renderField(field) {
    const variety = state.variety(field.varietyId);
    const plantingDate = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
    return `
      <article class="record field-karte" data-field-master-id="${U.attr(field.fieldId)}">
        <div class="record-head">
          <div>
            <div class="field-name">${U.escapeHTML(field.name)}</div>
            <span class="pill ok">${U.escapeHTML(variety && variety.name || "品種未設定")}</span>
            <span class="pill info">${U.escapeHTML(String(field.areaA || 0))}a</span>
            ${plantingDate ? `<span class="pill warn">田植 ${U.escapeHTML(U.fd(plantingDate))}</span>` : '<span class="pill bad">田植え作業未登録</span>'}
          </div>
        </div>
        ${renderKarteDashboard(field)}
        <div class="record-body">
          <details class="form-section" open>
            <summary>基本情報</summary>
            <div class="form-grid dense inline-grid">
              ${input(field, "name", "圃場名")}
              ${input(field, "district", "地区")}
              <label>品種<select data-field-id="${U.attr(field.fieldId)}" data-field-field="varietyId">${varietyOptions(field.varietyId)}</select></label>
              ${input(field, "areaA", "面積(a)", "number")}
              ${input(field, "seedlingBoxes", "実使用箱数", "number")}
              <label>状態<select data-field-id="${U.attr(field.fieldId)}" data-field-field="status">${statusOptions(field.status)}</select></label>
              ${input(field, "sortOrder", "表示順", "number")}
            </div>
          </details>

          <details class="form-section">
            <summary>圃場カルテ</summary>
            <div class="form-grid dense inline-grid">
              <label>土質<select data-field-id="${U.attr(field.fieldId)}" data-field-field="soilType">${optionTags(SOIL_TYPES, field.soilType)}</select></label>
              <label>水持ち<select data-field-id="${U.attr(field.fieldId)}" data-field-field="waterHolding">${optionTags(WATER_LEVELS, field.waterHolding)}</select></label>
              ${arrayInput(field, "commonWeeds", "生えやすい雑草", WEEDS)}
              ${arrayInput(field, "fieldFeatures", "圃場特徴", FEATURES)}
            </div>
          </details>

          <details class="form-section">
            <summary>中干し・水管理目標</summary>
            <div class="form-grid dense inline-grid">
              ${input(field, "targetCrackCm", "目標ひび割れ幅(cm)")}
              ${input(field, "targetSinkCm", "目標沈み込み(cm)")}
              ${input(field, "drainageTargetDays", "中干し予定日数", "number")}
              ${input(field, "intermittentIntervalDays", "間断灌水予定日数", "number")}
            </div>
            <div class="hint-text">中干し予定日数は目標値です。開始日・完了予定日・実際の完了日・実績日数は中干し記録または作業記録から自動反映します。</div>
          </details>

          <details class="form-section">
            <summary>メモ</summary>
            <label>固定メモ
              <textarea data-field-id="${U.attr(field.fieldId)}" data-field-field="fixedMemo" placeholder="例: 溝切り不要、ガスが出やすい">${U.escapeHTML(field.fixedMemo || "")}</textarea>
            </label>
            <label>通常メモ
              <textarea data-field-id="${U.attr(field.fieldId)}" data-field-field="memo">${U.escapeHTML(field.memo || "")}</textarea>
            </label>
          </details>
        </div>
        <div class="record-actions single-action">
          <button class="secondary" type="button" data-field-action="history" data-field-id="${U.attr(field.fieldId)}">年間履歴</button>
          <button class="secondary danger" type="button" data-field-action="delete" data-field-id="${U.attr(field.fieldId)}">圃場を削除</button>
        </div>
      </article>
    `;
  }

  function fieldStage(field) {
    if (RiceOS.agro && RiceOS.agro.seasonStageForField) {
      const shared = RiceOS.agro.seasonStageForField(field);
      return {
        number: shared.index ? shared.image : 0,
        label: shared.current ? shared.current.label : "記録待ち",
        certainty: shared.certainty || "記録待ち",
        management: shared.management || { label: "中干し未実施", tone: "waiting" }
      };
    }
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId, currentSeasonYear()) : "";
    const growth = latestGrowthForField(field.fieldId);
    if (!planting && !growth) return { number: 0, label: "記録待ち" };
    const stage = riceStageNumberForField(field);
    const labels = ["記録待ち", "田植え", "活着", "分げつ", "中干し", "幼穂", "出穂", "登熟", "収穫"];
    return { number: stage, label: labels[stage] || "生育中", certainty: "確定", management: { label: "中干し未実施", tone: "waiting" } };
  }

  function latestPhotoForField(field) {
    return photosForField(field.fieldId)[0] || null;
  }

  function latestIrrigationForField(fieldId) {
    return latestResolvedWaterPeriod(fieldId, "intermittent");
  }

  function latestDeepWaterForField(fieldId) {
    return latestResolvedWaterPeriod(fieldId, "deep");
  }

  // Home and field detail must read exactly the same water-management state.
  // The core resolver keeps dedicated records and old work records visible.
  function currentWaterManagement(field) {
    if (!RiceOS.agro || !RiceOS.agro.managementStatus) return null;
    return RiceOS.agro.managementStatus(field, U.today());
  }

  function renderCriticalWaterWindow(field) {
    const focus = RiceOS.agro && RiceOS.agro.criticalWaterWindow
      ? RiceOS.agro.criticalWaterWindow(field, U.today())
      : null;
    if (!focus || !focus.active) return "";
    const water = focus.water || {};
    const headingMode = focus.mode === "postHeading";
    return `
      <section class="critical-water-window field-critical-water mode-${U.attr(focus.mode)}" aria-label="幼穂確認以降の生育と水管理">
        <div class="critical-water-window-head"><span>${headingMode ? "出穂後の生育と水管理" : "幼穂確認からの生育と水管理"}</span><b>${U.escapeHTML(focus.certainty)}</b></div>
        <strong>${U.escapeHTML(focus.phase)}</strong>
        <div class="critical-water-window-facts"><span>${U.escapeHTML(focus.anchorLabel)}</span><span>${U.escapeHTML(focus.observation)}</span></div>
        <div class="critical-water-window-water">
          <span>現在の実績</span><b>${U.escapeHTML(water.management && water.management.label || focus.management && focus.management.label || "水管理未記録")}</b>
          <small>${U.escapeHTML(water.actualDetail || "実績の水管理期間は未登録")}</small>
        </div>
        <div class="critical-water-window-reference"><span>照合の目安</span><b>${U.escapeHTML(water.referenceLabel || "現場と記録を確認")}</b></div>
        <p>${U.escapeHTML(focus.note)}</p>
        ${water.referenceNote ? `<p class="critical-water-window-note">${U.escapeHTML(water.referenceNote)}</p>` : ""}
      </section>
    `;
  }

  function latestSeasonNoteForField(fieldId) {
    if (!state.seasonNotesForField) return null;
    return (state.seasonNotesForField(fieldId, currentSeasonYear()) || []).slice()
      .sort((a, b) => String(b.date || b.updatedAt || "").localeCompare(String(a.date || a.updatedAt || "")))[0] || null;
  }

  function periodDayLabel(value) {
    return value === "" || value == null ? "-" : `${value}日`;
  }

  function periodStatus(startDate, actualEndDate, savedStatus) {
    if (actualEndDate) return "完了";
    if (startDate) return "実施中";
    return "未記録";
  }

  function renderWaterPeriodCard(options) {
    const startDate = options.startDate || "";
    const plannedEndDate = options.plannedEndDate || "";
    const actualEndDate = options.actualEndDate || "";
    const targetDays = options.targetDays === "" || options.targetDays == null ? "" : options.targetDays;
    const plannedDays = startDate && plannedEndDate ? U.daysBetween(startDate, plannedEndDate) : targetDays;
    const actualDays = startDate && actualEndDate ? U.daysBetween(startDate, actualEndDate) : "";
    const elapsedDays = startDate && !actualEndDate ? Math.max(0, U.daysBetween(startDate, U.today())) : "";
    const status = periodStatus(startDate, actualEndDate, options.savedStatus);
    const endLabel = actualEndDate ? "実完了" : "終了予定";
    const endValue = actualEndDate || plannedEndDate || "";
    const durationLabel = actualEndDate ? "実績日数" : "経過日数";
    const durationValue = actualEndDate ? actualDays : elapsedDays;
    return `
      <article class="field-water-period ${U.attr(options.tone)} status-${U.attr(status)}">
        <div class="field-water-period-head">
          <span class="field-water-period-icon"><img src="assets/images/menu-icons/${U.attr(options.icon)}" alt=""></span>
          <div><small>${U.escapeHTML(options.kicker)}</small><b>${U.escapeHTML(options.label)}</b></div>
          <strong>${U.escapeHTML(status)}</strong>
        </div>
        <div class="field-water-period-dates">
          <span><small>開始</small><b>${U.escapeHTML(startDate ? U.fd(startDate) : "未記録")}</b></span>
          <span><small>${U.escapeHTML(endLabel)}</small><b>${U.escapeHTML(endValue ? U.fd(endValue) : "未記録")}</b></span>
        </div>
        <div class="field-water-period-days">
          <span>予定 <b>${U.escapeHTML(periodDayLabel(plannedDays))}</b></span>
          <span>${U.escapeHTML(durationLabel)} <b>${U.escapeHTML(periodDayLabel(durationValue))}</b></span>
        </div>
      </article>
    `;
  }

  function renderWaterPeriodOverview(field, dry, irrigation, deepWater) {
    const intermittentStart = irrigation && irrigation.startDate || "";
    return `
      <section class="field-water-overview" aria-label="${U.escapeHTML(currentSeasonYear())}年の水管理期間">
        <div class="field-water-overview-head"><span>${U.escapeHTML(currentSeasonYear())}年の水管理</span><small>記録した期間だけを表示</small></div>
        <div class="field-water-period-grid">
          ${renderWaterPeriodCard({
            label: "中干し",
            kicker: "田面を乾かす期間",
            icon: "dry-period.png",
            tone: "dry",
            startDate: dry.startDate,
            plannedEndDate: dry.plannedEndDate,
            actualEndDate: dry.actualEndDate,
            targetDays: dry.targetDays,
            savedStatus: dry.status
          })}
          ${renderWaterPeriodCard({
            label: "間断灌水",
            kicker: "中干し完了後の水管理",
            icon: "irrigation.png",
            tone: "intermittent",
            startDate: intermittentStart,
            plannedEndDate: irrigation && irrigation.plannedEndDate || "",
            actualEndDate: irrigation && irrigation.actualEndDate || "",
            targetDays: irrigation && irrigation.targetDays || field.intermittentIntervalDays || "",
            savedStatus: irrigation && (irrigation.periodStatus || irrigation.status) || ""
          })}
          ${renderWaterPeriodCard({
            label: "深水管理",
            kicker: "穂ばらみ・出穂期などの実施記録",
            icon: "irrigation.png",
            tone: "deep",
            startDate: deepWater && deepWater.startDate || "",
            plannedEndDate: deepWater && deepWater.plannedEndDate || "",
            actualEndDate: deepWater && deepWater.actualEndDate || "",
            targetDays: "",
            savedStatus: deepWater && (deepWater.periodStatus || deepWater.status) || ""
          })}
        </div>
      </section>
    `;
  }

  function renderCurrentManagementSummary(field) {
    const management = currentWaterManagement(field) || { label: "水管理の記録待ち", tone: "waiting", date: "" };
    const dateLabel = management.date ? `記録日 ${U.fd(management.date)}` : "実績を登録すると現在地に反映されます";
    const detail = management.detail || dateLabel;
    return `
      <section class="field-management-current tone-${U.attr(management.tone || "waiting")}">
        <div><span>現在の水管理（記録上）</span><b>${U.escapeHTML(management.label)}</b><small>${U.escapeHTML(detail)}</small></div>
        <p>期間・編集は年間履歴で確認</p>
      </section>
    `;
  }

  function fieldStatusText(field) {
    const growth = latestGrowthForField(field.fieldId);
    const management = currentWaterManagement(field);
    const dry = drySummary(field);
    const irrigation = latestIrrigationForField(field.fieldId);
    const deepWater = latestDeepWaterForField(field.fieldId);
    if (management && management.key && management.key !== "waterWaiting") return management.label;
    if (deepWater && !deepWater.actualEndDate) return "深水管理 実施中";
    if (irrigation && !irrigation.actualEndDate) return `${irrigation.label || "間断灌水"} 実施中`;
    if (dry.actualEndDate) return "中干し完了・次の水管理は未開始";
    if (dry.startDate && !dry.actualEndDate) return `中干し ${dry.status}`;
    if (growth) return `生育 ${U.fd(growth.date)}`;
    return field.status || "記録待ち";
  }

  function fieldNextRecordInfo(field) {
    const year = currentSeasonYear();
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId, year) : "";
    const growth = latestGrowthForField(field.fieldId);
    const dry = drySummary(field);
    const management = currentWaterManagement(field);
    if (!planting) return { label: "田植え作業を記録", action: "add-work" };
    if (management && management.key === "dryCompleted") return { label: "間断灌水を記録", action: "add-irrigation" };
    if (dry.actualEndDate && !latestIrrigationForField(field.fieldId)) return { label: "間断灌水を記録", action: "add-irrigation" };
    if (!growth) return { label: "生育を記録", action: "add-growth" };
    return null;
  }

  function fieldNextRecord(field) {
    const next = fieldNextRecordInfo(field);
    return next ? next.label : "生育・水管理を記録";
  }

  function renderFieldListCard(field) {
    const variety = state.variety(field.varietyId);
    const stage = fieldStage(field);
    return `
      <button type="button" class="field-hub-card stage-${U.attr(String(stage.number).padStart(2, "0"))}" data-field-open="${U.attr(field.fieldId)}" data-field-search-text="${U.attr(`${field.name} ${variety && variety.name || ""} ${field.district || ""}`.toLowerCase())}">
        <span class="field-hub-card-rice">${groupRiceImage(stage.number)}</span>
        <span class="field-hub-card-main"><b>${U.escapeHTML(field.name)}</b><small>${U.escapeHTML(variety && variety.name || "品種未設定")} / ${U.escapeHTML(String(field.areaA || 0))}a</small><em>${U.escapeHTML(fieldStatusText(field))}</em></span>
        <span class="field-hub-stage"><small>現在 / ${U.escapeHTML(stage.certainty || "記録待ち")}</small><b>${U.escapeHTML(stage.label)}</b></span>
      </button>
    `;
  }

  function renderFieldListView() {
    const groups = groupedFields();
    const groupOptions = [`<option value="all">すべてのグループ</option>`, ...groups.map((group) => `<option value="${U.attr(group.fieldGroupId)}">${U.escapeHTML(group.unassigned ? "グループ未設定" : group.name)} (${group.fields.length})</option>`)].join("");
    const query = fieldSearch.trim().toLowerCase();
    const visible = state.activeFields()
      .filter((field) => fieldGroupFilter === "all" || field.fieldGroupId === fieldGroupFilter || (!field.fieldGroupId && fieldGroupFilter === ""))
      .filter((field) => !query || `${field.name} ${state.variety(field.varietyId) && state.variety(field.varietyId).name || ""} ${field.district || ""}`.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => U.number(a.sortOrder, 0) - U.number(b.sortOrder, 0) || String(a.name).localeCompare(String(b.name)));
    return `
        <section class="field-hub-list">
        <div class="field-hub-intro"><div><span>圃場一覧</span><h3>田んぼを管理する</h3><small>圃場名・品種・面積・グループなど固定情報を整えます。</small></div><button class="primary" type="button" data-action="add-field">＋ 圃場追加</button></div>
        <div class="field-hub-filters"><input type="search" data-field-search placeholder="圃場名・品種・地区で検索" value="${U.attr(fieldSearch)}"><select data-field-group-filter>${groupOptions}</select></div>
        <div class="field-hub-groups">${groups.map((group) => `<div><button type="button" data-field-group-open="${U.attr(group.fieldGroupId)}"><span>${U.escapeHTML(group.unassigned ? "グループ未設定" : group.name)}</span><small>${group.fields.length}圃場 / ${Math.round(group.area * 10) / 10}a</small></button>${group.unassigned ? "" : `<button type="button" data-field-group-bulk="${U.attr(group.fieldGroupId)}">一括作業入力</button>`}</div>`).join("")}</div>
        <div class="field-hub-cards">${visible.length ? visible.map(renderFieldListCard).join("") : '<div class="empty">条件に合う圃場はありません。</div>'}</div>
      </section>
    `;
  }

  function renderFieldDetailView(field) {
    const variety = state.variety(field.varietyId);
    const stage = fieldStage(field);
    const photo = latestPhotoForField(field);
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId, currentSeasonYear()) : "";
    const stageDetail = planting ? `田植後 ${Math.max(0, U.daysBetween(planting, U.today()))}日` : "田植え実績を登録すると表示されます";
    return `
      <section class="field-hub-detail">
        <div class="field-hub-detail-head"><button type="button" class="field-hub-back" data-field-view="list" aria-label="圃場一覧へ戻る">‹</button><div><span>圃場情報</span><h3>${U.escapeHTML(field.name)}</h3><small>${U.escapeHTML(variety && variety.name || "品種未設定")} / ${U.escapeHTML(String(field.areaA || 0))}a</small></div><button type="button" class="secondary" data-field-view="settings">編集</button></div>
        <section class="field-hub-now stage-${U.attr(String(stage.number).padStart(2, "0"))}">
          ${photo && photo.photoData ? `<img src="${U.attr(photo.photoData)}" alt="">` : `<span>${groupRiceImage(stage.number)}</span>`}
          <div><small>現在の生育ステージ / ${U.escapeHTML(stage.certainty)}</small><b>${U.escapeHTML(stage.label)}</b><p>${U.escapeHTML(stageDetail)}</p></div>
        </section>
        ${renderCriticalWaterWindow(field)}
        <section class="field-hub-master-card">
          <div class="field-hub-master-card-head"><b>固定情報</b><span>圃場設定で編集</span></div>
          <div class="field-hub-master-grid">
            <span><small>地区</small><b>${U.escapeHTML(field.district || "未設定")}</b></span>
            <span><small>グループ</small><b>${U.escapeHTML(groupName(field) || "未設定")}</b></span>
            <span><small>土質</small><b>${U.escapeHTML(field.soilType || "未設定")}</b></span>
            <span><small>水持ち</small><b>${U.escapeHTML(field.waterHolding || "未設定")}</b></span>
            <span><small>固定メモ</small><b>${U.escapeHTML(field.fixedMemo || "未設定")}</b></span>
          </div>
        </section>
        ${renderCurrentManagementSummary(field)}
        <section class="field-hub-settings-link"><b>圃場では固定情報を管理します</b><span>作業・生育・水管理・写真の実績と編集は、「振り返り」にまとめています。</span></section>
        <button class="secondary field-history-link" type="button" data-field-action="history" data-field-id="${U.attr(field.fieldId)}">この圃場の年間履歴を見る</button>
      </section>
    `;
  }

  function renderFieldSettingsView(field) {
    return `
      <section class="field-hub-settings" data-field-master-id="${U.attr(field.fieldId)}">
        <div class="field-hub-detail-head"><button type="button" class="field-hub-back" data-field-view="detail" aria-label="圃場詳細へ戻る">‹</button><div><span>圃場設定</span><h3>${U.escapeHTML(field.name)}</h3><small>この圃場の固定情報を編集</small></div></div>
        <details class="form-section" open><summary>基本情報</summary><div class="form-grid dense inline-grid">${input(field, "name", "圃場名")}${input(field, "district", "地区")}<label>品種<select data-field-id="${U.attr(field.fieldId)}" data-field-field="varietyId">${varietyOptions(field.varietyId)}</select></label>${input(field, "areaA", "面積(a)", "number")}<label>状態<select data-field-id="${U.attr(field.fieldId)}" data-field-field="status">${statusOptions(field.status)}</select></label>${input(field, "sortOrder", "表示順", "number")}</div></details>
        <details class="form-section"><summary>栽培条件・圃場カルテ</summary><div class="form-grid dense inline-grid"><label>土質<select data-field-id="${U.attr(field.fieldId)}" data-field-field="soilType">${optionTags(SOIL_TYPES, field.soilType)}</select></label><label>水持ち<select data-field-id="${U.attr(field.fieldId)}" data-field-field="waterHolding">${optionTags(WATER_LEVELS, field.waterHolding)}</select></label>${arrayInput(field, "fieldFeatures", "圃場特徴", FEATURES)}${input(field, "targetCrackCm", "目標ひび割れ幅(cm)")}${input(field, "targetSinkCm", "目標沈み込み(cm)")}</div></details>
        <details class="form-section"><summary>苗箱・田植機の設定</summary><div class="form-grid dense inline-grid">${input(field, "seedlingBoxes", "実使用苗箱数", "number")}<label>栽培レシピ（品種）<select data-field-id="${U.attr(field.fieldId)}" data-field-field="varietyId">${varietyOptions(field.varietyId)}</select></label></div><p class="hint-text">株間・坪あたり株数・基肥などの共通設定は、選択した栽培レシピを参照します。</p></details>
        <details class="form-section"><summary>グループ・水管理目標・メモ</summary><div class="form-grid dense inline-grid"><label>圃場グループ<select data-field-id="${U.attr(field.fieldId)}" data-field-field="fieldGroupId"><option value="">未設定</option>${state.fieldGroups().map((group) => `<option value="${U.attr(group.fieldGroupId)}" ${field.fieldGroupId === group.fieldGroupId ? "selected" : ""}>${U.escapeHTML(group.name)}</option>`).join("")}</select></label>${input(field, "drainageTargetDays", "中干し目安日数", "number")}${input(field, "intermittentIntervalDays", "間断灌水目安日数", "number")}</div><label>固定メモ<textarea data-field-id="${U.attr(field.fieldId)}" data-field-field="fixedMemo">${U.escapeHTML(field.fixedMemo || "")}</textarea></label></details>
        <div class="record-actions single-action"><button class="secondary danger" type="button" data-field-action="delete" data-field-id="${U.attr(field.fieldId)}">圃場を削除</button></div>
      </section>
    `;
  }

  function parseArray(value) {
    return String(value || "")
      .split(/[、,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function jumpToFieldMaster(fieldId) {
    activeFieldId = fieldId;
    render();
    const el = document.querySelector(`[data-field-master-id="${U.attr(fieldId)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("field-karte-focus");
    setTimeout(() => el.classList.remove("field-karte-focus"), 1600);
  }

  function addFieldToGroup(group) {
    const groupNameValue = group || "";
    const groupMaster = groupNameValue ? state.fieldGroup(groupNameValue) : null;
    const defaultName = groupMaster ? `${groupMaster.name} 新規` : "新しい圃場";
    const name = prompt("追加する圃場名を入力してください", defaultName);
    if (name === null) return;
    const cleanName = name.trim() || defaultName;
    const fieldId = state.addField(cleanName);
    if (!fieldId) return;
    if (groupNameValue && !state.updateField(fieldId, { fieldGroupId: groupNameValue })) return;
    activeBulkGroup = group;
    activeFieldId = fieldId;
    render();
    setTimeout(() => jumpToFieldMaster(fieldId), 80);
  }

  function handleBack() {
    if (fieldView === "settings") {
      fieldView = "detail";
      render();
      return true;
    }
    if (fieldView === "detail") {
      fieldView = "list";
      render();
      return true;
    }
    return false;
  }

  function resetNavigation() {
    activeFieldId = "";
    fieldView = "list";
    render();
  }

  function canHandleBack() {
    return fieldView === "settings" || fieldView === "detail";
  }

  function render() {
    const screen = U.$("screen-fields");
    if (screen) screen.classList.toggle("field-hub-subscreen", fieldView !== "list");
    U.$("fieldList").innerHTML = `
      ${datalist("commonWeedsList", WEEDS)}
      ${datalist("fieldFeaturesList", FEATURES)}
      ${fieldView === "settings" && selectedField() ? renderFieldSettingsView(selectedField()) : ""}
      ${fieldView === "detail" && selectedField() ? renderFieldDetailView(selectedField()) : ""}
      ${fieldView === "list" ? renderFieldListView() : ""}
    `;
    if (RiceOS.app && RiceOS.app.syncBackButton) RiceOS.app.syncBackButton();
  }

  function bind() {
    U.$("fieldList").addEventListener("change", (event) => {
      const el = event.target.closest("[data-field-field]");
      if (!el) return;
      const key = el.dataset.fieldField;
      let value = el.value;
      if (el.dataset.arrayField === "1") value = parseArray(value);
      if (["areaA", "sortOrder"].includes(key)) value = U.number(el.value, 0);
      state.updateField(el.dataset.fieldId, { [key]: value });
    });

    U.$("fieldList").addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-field-view]");
      if (viewButton) {
        if (viewButton.dataset.fieldView === "list" && RiceOS.navigation && RiceOS.navigation.current && RiceOS.navigation.current()) {
          RiceOS.app.back();
          return;
        }
        fieldView = viewButton.dataset.fieldView || "list";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const openButton = event.target.closest("[data-field-open]");
      if (openButton) {
        if (RiceOS.navigation && RiceOS.navigation.openField && RiceOS.navigation.openField(openButton.dataset.fieldOpen, { originScreen: "fields" })) return;
        activeFieldId = openButton.dataset.fieldOpen;
        fieldView = "detail";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const groupOpen = event.target.closest("[data-field-group-open]");
      if (groupOpen) {
        fieldGroupFilter = groupOpen.dataset.fieldGroupOpen || "all";
        render();
        return;
      }
      const addGroup = event.target.closest("[data-field-group-add]");
      if (addGroup) {
        const name = prompt("圃場グループ名を入力してください", "");
        if (name === null) return;
        const groupId = state.addFieldGroup(name);
        if (!groupId) return;
        activeBulkGroup = groupId;
        render();
        return;
      }
      const groupBulk = event.target.closest("[data-field-group-bulk]");
      if (groupBulk && RiceOS.app && RiceOS.screens.fieldWork) {
        const ids = fieldsForGroup(groupBulk.dataset.fieldGroupBulk || "").map((field) => field.fieldId);
        RiceOS.app.show("field-work");
        RiceOS.screens.fieldWork.prefillFields(U.today(), ids);
        return;
      }
      const menuButton = event.target.closest("[data-field-master-menu]");
      if (menuButton) {
        const target = menuButton.dataset.jumpScreen;
        if (target && RiceOS.app) RiceOS.app.show(target);
        return;
      }
      const groupButton = event.target.closest("[data-field-group-action]");
      if (groupButton) {
        const group = groupButton.dataset.fieldGroup || "";
        if (groupButton.dataset.fieldGroupAction === "bulk") {
          const ids = fieldsForGroup(group).map((field) => field.fieldId);
          if (RiceOS.app && RiceOS.screens.fieldWork) {
            RiceOS.app.show("field-work");
            RiceOS.screens.fieldWork.prefillFields(U.today(), ids);
          }
          return;
        }
        if (groupButton.dataset.fieldGroupAction === "edit") {
          const master = state.fieldGroup(group);
          if (!master) return;
          const nextName = prompt("グループ名を入力してください", master.name);
          if (nextName === null) return;
          const cleanName = nextName.trim();
          const saved = state.updateFieldGroup(group, { name: cleanName });
          if (!saved) return;
          activeBulkGroup = group;
          render();
          return;
        }
        return;
      }
      const groupFieldButton = event.target.closest("[data-field-group-field]");
      if (groupFieldButton) {
        jumpToFieldMaster(groupFieldButton.dataset.fieldGroupField);
        return;
      }
      const groupCard = event.target.closest("[data-field-group-card]");
      if (groupCard) {
        const group = groupCard.dataset.fieldGroupCard || "";
        activeBulkGroup = activeBulkGroup === group ? "" : group;
        render();
        return;
      }
      const fieldPickButton = event.target.closest("[data-field-pick]");
      if (fieldPickButton) {
        jumpToFieldMaster(fieldPickButton.dataset.fieldPick);
        return;
      }
      const button = event.target.closest("[data-field-action]");
      if (!button) return;
      const field = state.field(button.dataset.fieldId);
      if (!field) return;
      const action = button.dataset.fieldAction;
      if (action === "delete") {
        const ok = confirm(`${field.name} を一覧から外しますか？\n\n過去の作業・生育・水管理・写真は削除せず、年間履歴に残します。`);
        if (!ok) return;
        const saved = state.deleteField(field.fieldId);
        if (!saved) return;
        activeFieldId = "";
        activeBulkGroup = "";
        render();
        return;
      }
      if (action === "history") {
        if (RiceOS.navigation && RiceOS.navigation.openField && RiceOS.navigation.openField(field.fieldId, { originScreen: "fields", destination: "annual-history" })) return;
        RiceOS.app.show("annual");
        if (RiceOS.screens.annual && RiceOS.screens.annual.openField) RiceOS.screens.annual.openField(field.fieldId);
        return;
      }
      if (action === "calendar") RiceOS.alerts.downloadFieldCalendar(field);
      if (action === "add-work" && RiceOS.screens.fieldWork) {
        RiceOS.app.show("field-work");
        RiceOS.screens.fieldWork.prefillDate(U.today(), field.fieldId);
      }
      if (action === "add-growth" && RiceOS.screens.growth) {
        RiceOS.app.show("growth");
        RiceOS.screens.growth.prefillDate(U.today(), field.fieldId);
      }
      if (action === "add-dry" && RiceOS.screens.irrigation) {
        RiceOS.app.show("irrigation");
        RiceOS.screens.irrigation.prefillDate(U.today(), field.fieldId, "dry");
      }
      if (action === "add-irrigation" && RiceOS.screens.irrigation) {
        RiceOS.app.show("irrigation");
        RiceOS.screens.irrigation.prefillDate(U.today(), field.fieldId, "intermittent");
      }
      if (action === "photos" && RiceOS.screens.photos) {
        RiceOS.app.show("photos");
        if (U.$("photoField")) U.$("photoField").value = field.fieldId;
        RiceOS.screens.photos.render();
      }
    });

    U.$("fieldList").addEventListener("input", (event) => {
      const search = event.target.closest("[data-field-search]");
      if (!search) return;
      fieldSearch = search.value || "";
      const query = fieldSearch.trim().toLowerCase();
      U.$$('[data-field-search-text]').forEach((card) => {
        card.hidden = Boolean(query) && !String(card.dataset.fieldSearchText || "").includes(query);
      });
    });

    U.$("fieldList").addEventListener("change", (event) => {
      const group = event.target.closest("[data-field-group-filter]");
      if (group) {
        fieldGroupFilter = group.value || "all";
        render();
      }
    });
  }

  function openField(fieldId, mode) {
    if (!state.field(fieldId)) return;
    activeFieldId = fieldId;
    fieldView = mode === "settings" ? "settings" : "detail";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openGroup(groupName) {
    fieldView = "list";
    fieldSearch = "";
    const master = state.fieldGroup(groupName) || state.fieldGroups().find((group) => group.name === groupName);
    fieldGroupFilter = master ? master.fieldGroupId : "all";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.fields = { render, bind, handleBack, canHandleBack, openField, openGroup, resetNavigation, preserveOnDataChange: true };
})();
