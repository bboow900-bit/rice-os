(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const state = RiceOS.state;
  let activeBulkGroup = "";
  let activeFieldId = "";

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
    return ["使用中", "休耕", "終了"].map((value) => `<option ${value === selected ? "selected" : ""}>${value}</option>`).join("");
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

  const MASTER_MENU = [
    { key: "field-master", label: "圃場マスター", sub: "土質・面積", icon: "field-master.png", screen: "fields", tone: "green" },
    { key: "recipe", label: "栽培レシピ", sub: "品種単位", icon: "recipe.png", screen: "recipes", tone: "green" },
    { key: "transplanter", label: "田植え機", sub: "株間・箱数", icon: "transplanter.png", screen: "recipes", tone: "amber" },
    { key: "dry", label: "中干し", sub: "目標・記録", icon: "dry-period.png", screen: "dry-period", tone: "amber" },
    { key: "photos", label: "写真", sub: "比較素材", icon: "photos.png", screen: "photos", tone: "" },
    { key: "irrigation", label: "間断/湿潤", sub: "水管理", icon: "irrigation.png", screen: "irrigation", tone: "water" },
    { key: "materials", label: "資材管理", sub: "在庫・使用", icon: "materials.png", screen: "materials", tone: "amber" },
    { key: "harvest", label: "収穫履歴", sub: "収量・販売", icon: "harvest.png", screen: "results", tone: "amber" }
  ];

  function menuIcon(name) {
    return `assets/images/menu-icons/${name}`;
  }

  function groupName(field) {
    const raw = String(field.fieldGroupId || field.district || "").trim();
    if (raw) return raw;
    const first = String(field.name || "").split(/[ 　]/)[0];
    return first || "未設定";
  }

  function groupedFields() {
    const map = new Map();
    state.fields().forEach((field) => {
      const name = groupName(field);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(field);
    });
    return Array.from(map.entries())
      .map(([name, fields]) => ({ name, fields, area: fields.reduce((sum, field) => sum + U.number(field.areaA, 0), 0) }))
      .sort((a, b) => b.fields.length - a.fields.length || a.name.localeCompare(b.name));
  }

  function fieldsForGroup(name) {
    const group = groupedFields().find((item) => item.name === name);
    return group ? group.fields : [];
  }

  function latestGrowthForField(fieldId) {
    if (state.lastGrowthLog) return state.lastGrowthLog(fieldId);
    return (state.growthLogsFor ? state.growthLogsFor(fieldId) : [])
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  }

  function riceStageNumberForField(field) {
    const latest = latestGrowthForField(field.fieldId);
    const planting = state.plantingDateForField ? state.plantingDateForField(field.fieldId) : "";
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
    const fields = state.fields();
    const area = fields.reduce((sum, field) => sum + U.number(field.areaA, 0), 0);
    const groups = groupedFields().length;
    return `
      <section class="field-master-summary">
        <div><small>管理面積</small><b>${U.escapeHTML(String(Math.round(area * 10) / 10))}a</b></div>
        <div><small>圃場数</small><b>${U.escapeHTML(String(fields.length))}</b></div>
        <div><small>グループ</small><b>${U.escapeHTML(String(groups))}</b></div>
      </section>
    `;
  }

  function renderMasterMenu() {
    return `
      <section class="field-master-section">
        <div class="field-master-section-head">
          <h3>管理メニュー</h3>
          <span>項目の本籍地をここに集約</span>
        </div>
        <div class="field-master-menu-grid">
          ${MASTER_MENU.map((item) => `
            <button type="button" class="field-master-menu-button ${U.attr(item.tone || "")}" data-field-master-menu="${U.attr(item.key)}" data-jump-screen="${U.attr(item.screen)}">
              <img src="${U.attr(menuIcon(item.icon))}" alt="">
              <b>${U.escapeHTML(item.label)}</b>
              <small>${U.escapeHTML(item.sub)}</small>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderGroupCards() {
    const groups = groupedFields().slice(0, 4);
    return `
      <section class="field-master-section">
        <div class="field-master-section-head">
          <h3>圃場グループ</h3>
          <span>一括登録の土台</span>
        </div>
        <div class="field-group-list">
          ${groups.map((group) => {
            const riceStage = riceStageNumberForGroup(group);
            const isOpen = activeBulkGroup === group.name;
            return `
            <article class="field-group-card ${isOpen ? "open" : ""}" data-field-group-card="${U.attr(group.name)}">
              <span class="field-group-rice stage-${U.attr(String(riceStage).padStart(2, "0"))}" aria-hidden="true">${groupRiceImage(riceStage)}</span>
              <div class="field-group-main">
                <h4>${U.escapeHTML(group.name === "未設定" ? "未設定グループ" : `${group.name}グループ`)}</h4>
                <p>${U.escapeHTML(String(group.fields.length))}圃場 / ${U.escapeHTML(String(Math.round(group.area * 10) / 10))}a</p>
                <div>${group.fields.slice(0, 5).map((field) => `<span>${U.escapeHTML(field.name)}</span>`).join("")}</div>
              </div>
              <div class="field-group-card-actions">
                <button type="button" data-field-group-action="bulk" data-field-group="${U.attr(group.name)}">一括登録</button>
                <button type="button" data-field-group-action="edit" data-field-group="${U.attr(group.name)}">編集</button>
              </div>
              ${isOpen ? `
                <div class="field-group-field-panel">
                  <b>グループ内の圃場</b>
                  <div>
                    ${group.fields.map((field) => `
                      <button type="button" data-field-group-field="${U.attr(field.fieldId)}">
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

  function photosForField(fieldId) {
    const photos = [
      ...state.growthLogsFor(fieldId).map((row) => ({ date: row.date, photoData: row.photoData, photo: row.photo, title: "生育" })),
      ...state.fieldWorksFor(fieldId).map((row) => ({ date: row.date, photoData: row.photoData, photo: row.photo, title: row.workName || "作業" })),
      ...state.dryPeriodsFor(fieldId).map((row) => ({ date: row.date, photoData: row.photoData, photo: row.photo, title: "中干し" }))
    ].filter((row) => row.photoData || row.photo);
    return photos.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);
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

  function renderFeatureTags(field) {
    const tags = [
      field.soilType,
      field.waterHolding ? `水持ち:${field.waterHolding}` : "",
      ...(Array.isArray(field.fieldFeatures) ? field.fieldFeatures : []),
      ...(Array.isArray(field.commonWeeds) ? field.commonWeeds.map((weed) => `雑草:${weed}`) : [])
    ].filter(Boolean);
    return tags.length ? tags.slice(0, 8).map((tag) => `<span>${U.escapeHTML(tag)}</span>`).join("") : '<span>特徴未設定</span>';
  }

  function renderKarteDashboard(field) {
    const variety = state.variety(field.varietyId);
    const latestWork = state.lastFieldWork(field.fieldId);
    const latestGrowth = state.lastGrowthLog(field.fieldId);
    const latestDry = latestByDate(state.dryPeriodsFor(field.fieldId));
    const latestIrrigation = latestByDate(state.irrigationsFor(field.fieldId));
    const dap = U.daysAfterPlanting(field, U.today());
    const dryStart = state.workDateForField ? state.workDateForField(field.fieldId, "中干し開始") : "";
    const irrigationStart = state.workDateForField ? state.workDateForField(field.fieldId, "間断灌水開始") : "";
    const fixedMemo = String(field.fixedMemo || "").trim();
    return `
      <div class="field-karte-dashboard">
        <section class="field-karte-overview">
          <div class="field-karte-metrics">
            ${renderKarteMetric("品種", variety && variety.name || "未設定", "green")}
            ${renderKarteMetric("田植後", dap !== "" ? `${dap}日` : "田植日未設定", "amber")}
            ${renderKarteMetric("面積", `${field.areaA || 0}a`, "blue")}
            ${renderKarteMetric("分げつ目標", variety && variety.targetTillers || "未設定", "purple")}
          </div>
          <div class="field-karte-tags">${renderFeatureTags(field)}</div>
          ${fixedMemo ? `<div class="field-fixed-note"><b>固定メモ</b><span>${U.escapeHTML(fixedMemo)}</span></div>` : ""}
        </section>
        <section class="field-karte-activity">
          ${renderLatestLog("最新作業", latestWork, [latestWork && latestWork.workName, latestWork && latestWork.hours ? `時間 ${latestWork.hours}` : "", latestWork && latestWork.material], "work")}
          ${renderLatestLog("最新生育", latestGrowth, [latestGrowth && `分げつ ${latestGrowth.tillerCount || "-"}`, latestGrowth && `葉数 ${latestGrowth.leafCount || "-"}`, latestGrowth && `草丈 ${latestGrowth.plantHeightCm || "-"}cm`, latestGrowth && `葉色 ${latestGrowth.leafColor || "-"}`], "growth")}
          ${renderLatestLog("中干し", latestDry || { date: dryStart }, [periodLine(null, dryStart, field.drainageTargetDays)], "water")}
          ${renderLatestLog("間断/湿潤", latestIrrigation || { date: irrigationStart }, [periodLine(null, irrigationStart, field.intermittentIntervalDays)], "water")}
        </section>
        <section class="field-karte-photo-panel">
          <div class="section-title compact">
            <h3>写真</h3>
            <span class="muted">${U.escapeHTML(compactArray(field.commonWeeds, "雑草未設定"))}</span>
          </div>
          ${renderPhotoStrip(field)}
        </section>
        <div class="field-karte-actions">
          <button class="secondary" type="button" data-field-action="add-work" data-field-id="${U.attr(field.fieldId)}">作業</button>
          <button class="secondary" type="button" data-field-action="add-growth" data-field-id="${U.attr(field.fieldId)}">生育</button>
          <button class="secondary" type="button" data-field-action="add-dry" data-field-id="${U.attr(field.fieldId)}">中干し</button>
          <button class="secondary" type="button" data-field-action="add-irrigation" data-field-id="${U.attr(field.fieldId)}">間断/湿潤</button>
          <button class="secondary" type="button" data-field-action="photos" data-field-id="${U.attr(field.fieldId)}">写真一覧</button>
        </div>
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
              ${input(field, "fieldGroupId", "グループ")}
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
              ${input(field, "waterHabit", "水の癖")}
              ${input(field, "weedRisk", "雑草の癖")}
            </div>
          </details>

          <details class="form-section">
            <summary>中干し・水管理目標</summary>
            <div class="form-grid dense inline-grid">
              ${input(field, "targetCrackCm", "目標ひび割れ幅(cm)")}
              ${input(field, "targetSinkCm", "目標沈み込み(cm)")}
              ${input(field, "drainageTargetDays", "中干し予定日数", "number")}
              ${input(field, "intermittentIntervalDays", "間断灌水予定日数", "number")}
              ${input(field, "wetIrrigationTargetDays", "湿潤灌漑予定日数", "number")}
            </div>
            <div class="hint-text">田植日・中干し開始/終了は作業記録から自動表示します。日付を直す場合は作業記録を編集してください。</div>
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
          <button class="secondary" type="button" data-field-action="calendar" data-field-id="${U.attr(field.fieldId)}">水管理予定をカレンダー出力</button>
        </div>
      </article>
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
    const groupNameValue = group === "未設定" ? "" : group;
    const defaultName = groupNameValue ? `${groupNameValue} 新規` : "新しい圃場";
    const name = prompt("追加する圃場名を入力してください", defaultName);
    if (name === null) return;
    const cleanName = name.trim() || defaultName;
    const fieldId = state.addField(cleanName);
    if (groupNameValue) state.updateField(fieldId, { fieldGroupId: groupNameValue });
    activeBulkGroup = group;
    activeFieldId = fieldId;
    render();
    setTimeout(() => jumpToFieldMaster(fieldId), 80);
  }

  function handleBack() {
    if (activeFieldId) {
      activeFieldId = "";
      render();
      const picker = document.querySelector("[data-field-master-picker]");
      if (picker) picker.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    }
    if (activeBulkGroup) {
      activeBulkGroup = "";
      render();
      return true;
    }
    if (window.scrollY > 80) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }
    return false;
  }

  function render() {
    U.$("fieldList").innerHTML = `
      ${datalist("commonWeedsList", WEEDS)}
      ${datalist("fieldFeaturesList", FEATURES)}
      ${renderFieldMasterIntro()}
      <div class="record-grid">${selectedField() ? renderField(selectedField()) : ""}</div>
    `;
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
          addFieldToGroup(group);
          return;
        }
        if (groupButton.dataset.fieldGroupAction === "edit") {
          const fields = fieldsForGroup(group);
          const nextName = prompt("グループ名を入力してください", group === "未設定" ? "" : group);
          if (nextName === null) return;
          const cleanName = nextName.trim();
          state.mutate((d) => {
            const ids = new Set(fields.map((field) => field.fieldId));
            d.fields.forEach((field) => {
              if (ids.has(field.fieldId)) field.fieldGroupId = cleanName;
            });
          }, "圃場グループを更新しました");
          activeBulkGroup = cleanName;
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
      if (action === "calendar") RiceOS.alerts.downloadFieldCalendar(field);
      if (action === "add-work" && RiceOS.screens.fieldWork) {
        RiceOS.app.show("field-work");
        RiceOS.screens.fieldWork.prefillDate(U.today(), field.fieldId);
      }
      if (action === "add-growth" && RiceOS.screens.growth) {
        RiceOS.app.show("growth");
        RiceOS.screens.growth.prefillDate(U.today(), field.fieldId);
      }
      if (action === "add-dry" && RiceOS.screens.dryPeriod) {
        RiceOS.app.show("dry-period");
        RiceOS.screens.dryPeriod.prefillDate(U.today(), field.fieldId);
      }
      if (action === "add-irrigation" && RiceOS.screens.irrigation) {
        RiceOS.app.show("irrigation");
        RiceOS.screens.irrigation.prefillDate(U.today(), field.fieldId);
      }
      if (action === "photos" && RiceOS.screens.photos) {
        RiceOS.app.show("photos");
        if (U.$("photoField")) U.$("photoField").value = field.fieldId;
        RiceOS.screens.photos.render();
      }
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.fields = { render, bind, handleBack, preserveOnDataChange: true };
})();
