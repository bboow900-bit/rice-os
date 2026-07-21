(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;
  let recentScope = localStorage.getItem("riceFieldWorkRecentScope") || "all";
  let pendingScheduleId = "";

  const WORK_PRESETS = {
    "草刈り": { machine: "草刈り機" },
    "溝切り": { machine: "溝切り機" },
    "田植え": { machine: "田植機" },
    "耕起": { machine: "トラクター" },
    "代かき": { machine: "トラクター" },
    "基肥・元肥": { machine: "トラクター" },
    "除草剤": { machine: "散布機" },
    "追肥": { machine: "散布機" },
    "防除": { machine: "動力噴霧機" },
    "稲刈り": { machine: "コンバイン" }
  };

  const WORK_TEMPLATES = [
    { key: "planting", label: "田植え", workName: "田植え", machine: "田植機", hours: 120, memo: "田植え作業。田植日としてカルテへ自動反映。" },
    { key: "herbicide", label: "除草剤", workName: "除草剤", machine: "散布機", material: "recipe", hours: 60, memo: "除草剤散布。薬剤名・水深・風を現場確認。" },
    { key: "mowing", label: "草刈り", workName: "草刈り", machine: "草刈り機", hours: 90, memo: "畦畔・周辺の草刈り。" },
    { key: "dry-start", label: "中干し開始", workName: "中干し開始", machine: "", hours: 30, memo: "中干し開始。ひび割れ・沈み込みは中干し記録で確認。" },
    { key: "fertilizer", label: "追肥", workName: "追肥", machine: "散布機", material: "recipe", hours: 60, memo: "追肥。葉色と生育状況を見て判断。" },
    { key: "pest", label: "防除", workName: "防除", machine: "動力噴霧機", material: "recipe", hours: 90, memo: "防除作業。風・天候を確認。" },
    { key: "heading", label: "出穂確認", workName: "出穂確認", machine: "", hours: 15, memo: "出穂を確認。出穂後積算気温の起点として使用。" },
    { key: "harvest", label: "稲刈り", workName: "稲刈り", machine: "コンバイン", hours: 180, memo: "収穫作業。" }
  ];

  function selectedFieldIds() {
    return U.$$("#fwFields .select-card.selected").map((el) => el.dataset.id);
  }

  function fieldGroupName(field) {
    const raw = String(field && (field.fieldGroupId || field.district) || "").trim();
    if (raw) return raw.replace(/グループ$/, "");
    const first = String(field && field.name || "").split(/[ 　]/)[0];
    return first || "未設定";
  }

  function fieldGroups() {
    const map = new Map();
    state.activeFields().forEach((field) => {
      const name = fieldGroupName(field);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(field);
    });
    return Array.from(map.entries()).map(([name, fields]) => ({ name, fields }));
  }

  function updateFieldSelectionSummary() {
    const summary = U.$("fwFieldSelectionSummary");
    if (!summary) return;
    const ids = selectedFieldIds();
    const fields = ids.map((id) => state.field(id)).filter(Boolean);
    const totalArea = ids.reduce((sum, id) => {
      const field = state.field(id);
      return sum + U.number(field && field.areaA, 0);
    }, 0);
    summary.textContent = ids.length
      ? `${ids.length}圃場 / ${Math.round(totalArea * 10) / 10}a を選択中`
      : "未選択";
    const selectedStrip = U.$("fwSelectedFields");
    if (selectedStrip) {
      selectedStrip.innerHTML = fields.length ? fields.map((field) => `
        <button type="button" data-fw-remove-field="${U.attr(field.fieldId)}">
          ${U.escapeHTML(field.name)}<span>${U.escapeHTML(String(field.areaA || 0))}a</span>
        </button>
      `).join("") : '<span>圃場を選ぶとここに表示されます</span>';
    }
  }

  function setSelectedFieldIds(ids) {
    const selected = new Set(ids || []);
    U.$$("#fwFields .select-card").forEach((el) => el.classList.toggle("selected", selected.has(el.dataset.id)));
    updateFieldSelectionSummary();
  }

  function selectedVarietyForWork() {
    const firstFieldId = selectedFieldIds()[0];
    const field = firstFieldId ? state.field(firstFieldId) : state.activeFields()[0];
    return field ? state.variety(field.varietyId) : null;
  }

  function recommendedMaterial(workName) {
    const variety = selectedVarietyForWork();
    if (!variety) return "";
    if (workName === "基肥・元肥") return [variety.baseFertilizerName, variety.baseFertilizerAmount].filter(Boolean).join(" ");
    if (workName === "除草剤") return variety.initialHerbicide || variety.midHerbicide || "";
    if (workName === "追肥") return [variety.topDressingName, variety.topDressingAmount].filter(Boolean).join(" ");
    if (workName === "防除") return variety.pestControlPlan || variety.initialInsecticide || "";
    return "";
  }

  function learnedPreset(workName) {
    const recent = state.data().fieldWorks
      .filter((work) => work.workName === workName)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (!recent) return {};
    return {
      machine: recent.machine || "",
      material: recent.material || "",
      amount: recent.amount || ""
    };
  }

  function setAutoValue(id, value) {
    const el = U.$(id);
    if (!value || !el) return;
    if (!el.value || el.dataset.autoFilled === "1") {
      el.value = value;
      el.dataset.autoFilled = "1";
    }
  }

  function setDirectValue(id, value, autoFilled) {
    const el = U.$(id);
    if (!el) return;
    el.value = value || "";
    el.dataset.autoFilled = autoFilled ? "1" : "0";
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (!value) return "";
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    if (!hours) return `${mins}分`;
    if (!mins) return `${hours}時間`;
    return `${hours}時間${mins}分`;
  }

  function parseDurationMinutes(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:時間|h|H)/);
    const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:分|m|M)/);
    if (hourMatch || minMatch) {
      return Math.round((hourMatch ? Number(hourMatch[1]) * 60 : 0) + (minMatch ? Number(minMatch[1]) : 0));
    }
    const numeric = Number(text.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric <= 12 ? numeric * 60 : numeric);
  }

  function setDuration(minutes) {
    setDirectValue("fwHours", formatDuration(minutes), false);
  }

  function adjustDuration(delta) {
    const current = parseDurationMinutes(U.$("fwHours").value);
    setDuration(Math.max(0, current + Number(delta || 0)));
  }

  function applyWorkPreset(workName) {
    const preset = WORK_PRESETS[workName] || {};
    const learned = learnedPreset(workName);
    setAutoValue("fwMachine", preset.machine || learned.machine || "");
    setAutoValue("fwMaterial", recommendedMaterial(workName) || learned.material || "");
    setAutoValue("fwAmount", learned.amount || "");
  }

  function templateMaterial(template) {
    if (!template || template.material !== "recipe") return template && template.material || "";
    return recommendedMaterial(template.workName);
  }

  function applyWorkTemplate(key) {
    const template = WORK_TEMPLATES.find((item) => item.key === key);
    if (!template) return;
    U.$("fwName").value = template.workName;
    setDirectValue("fwMachine", template.machine || (WORK_PRESETS[template.workName] && WORK_PRESETS[template.workName].machine) || "", true);
    setDirectValue("fwMaterial", templateMaterial(template), true);
    if (!U.$("fwAmount").value) U.$("fwAmount").dataset.autoFilled = "1";
    if (template.hours) setDuration(template.hours);
    if (!U.$("fwMemo").value || U.$("fwMemo").dataset.templateFilled === "1") {
      U.$("fwMemo").value = template.memo || "";
      U.$("fwMemo").dataset.templateFilled = "1";
    }
  }

  function prefillWorkName(workName) {
    resetForm();
    U.$("fwName").value = workName;
    applyWorkPreset(workName);
  }

  function daysText(fieldIds, date) {
    return (fieldIds || []).map((fieldId) => {
      const field = state.field(fieldId);
      const dap = U.daysAfterPlanting(field, date);
      return dap === "" ? "" : `${field.name}:田植後${dap}日`;
    }).filter(Boolean).join(" / ");
  }

  function workVisual(name) {
    const text = String(name || "");
    if (/田植え|補植/.test(text)) return { key: "planting", src: "assets/images/light-icons/transplanter-light.png", alt: "田植機" };
    if (/追肥|肥料|基肥|元肥/.test(text)) return { key: "fertilizer", src: "assets/images/light-icons/fertilizer-bag.png", alt: "肥料" };
    if (/中干し/.test(text)) return { key: "dry", src: "assets/images/light-icons/dry-paddy.png", alt: "中干しの田面" };
    if (/落水|入水|間断|湿潤|溝切り/.test(text)) return { key: "water", src: "assets/images/light-icons/water-channel.png", alt: "水管理" };
    if (/稲刈り|収穫/.test(text)) return { key: "harvest", src: "assets/images/light-icons/rice-sack.png", alt: "収穫" };
    if (/草刈り/.test(text)) return { key: "mowing", src: "assets/images/light-icons/mowing-worker.png", alt: "草刈り作業" };
    if (/除草|防除/.test(text)) return { key: "spraying", src: "assets/images/light-icons/spraying-worker.png", alt: "散布作業" };
    if (/代かき|耕起/.test(text)) return { key: "tractor", src: "assets/images/light-icons/tractor-puddling.png", alt: "トラクター作業" };
    if (/畦/.test(text)) return { key: "field", src: "assets/images/light-icons/paddy-field.png", alt: "圃場作業" };
    return { key: "other", src: "assets/images/light-icons/karte-notebook.png", alt: "作業記録" };
  }

  function compactWeather(weather) {
    const text = String(weather || "").trim();
    if (!text) return "";
    const label = text.split("/")[0].trim();
    const average = text.match(/平均\s*([\d.]+)℃/);
    return [label, average ? `${average[1]}°C` : ""].filter(Boolean).join(" / ");
  }

  function renderFieldCards() {
    const selected = selectedFieldIds();
    if (U.$("fwGroupPicks")) {
      const current = new Set(selected);
      U.$("fwGroupPicks").innerHTML = fieldGroups().map((group) => `
        <button class="field-group-pick ${group.fields.every((field) => current.has(field.fieldId)) ? "active" : ""}" type="button" data-fw-group="${U.attr(group.name)}">
          ${U.escapeHTML(group.name === "未設定" ? "未設定" : `${group.name}グループ`)}
          <span>${U.escapeHTML(String(group.fields.length))}圃場 / ${U.escapeHTML(String(Math.round(group.fields.reduce((sum, field) => sum + U.number(field.areaA, 0), 0) * 10) / 10))}a</span>
        </button>
      `).join("");
    }
    U.$("fwFields").innerHTML = state.activeFields().map((field) => {
      const variety = state.variety(field.varietyId);
      return `
        <div class="select-card" data-id="${U.attr(field.fieldId)}">
          <b>${U.escapeHTML(field.name)}</b><br>
          <span class="muted">${U.escapeHTML(variety && variety.name || "")} / ${U.escapeHTML(String(field.areaA || 0))}a</span>
        </div>
      `;
    }).join("");
    setSelectedFieldIds(selected);
  }

  function renderTemplates() {
    const root = U.$("fwTemplatePicks");
    if (!root) return;
    root.innerHTML = WORK_TEMPLATES.map((template) => `
      <button type="button" data-fw-template="${U.attr(template.key)}">
        <span>${U.escapeHTML(template.label)}</span>
        <small>${U.escapeHTML(formatDuration(template.hours) || "時間未設定")}</small>
      </button>
    `).join("");
  }

  function syncWorkerPreset() {
    const value = U.$("fwWorker") ? U.$("fwWorker").value : "";
    U.$$("[data-worker-preset]").forEach((button) => {
      button.classList.toggle("active", button.dataset.workerPreset === value);
    });
  }

  function setWorker(value) {
    if (U.$("fwWorker")) U.$("fwWorker").value = value || "";
    syncWorkerPreset();
  }

  function resetForm() {
    U.$("fieldWorkHeading").textContent = "圃場作業入力";
    U.$("editFieldWorkId").value = "";
    U.$("fwDate").value = U.today();
    setWorker("自分");
    U.$("fwName").value = "田植え";
    U.$("fwHours").value = "";
    U.$("fwMachine").value = "";
    U.$("fwMaterial").value = "";
    U.$("fwAmount").value = "";
    U.$("fwWeather").value = "";
    U.$("fwWeatherAutoJson").value = "";
    U.$("fwWeatherStatus").textContent = "位置情報を設定すると、作業日の天気・気温・降水量を自動取得します。";
    U.$("fwMemo").value = "";
    U.$("fwMemo").dataset.templateFilled = "0";
    if (U.$("fwPhoto")) U.$("fwPhoto").value = "";
    if (U.$("fwPhotoFile")) U.$("fwPhotoFile").value = "";
    if (U.$("fwPhotoPreview")) {
      U.$("fwPhotoPreview").src = "";
      U.$("fwPhotoPreview").dataset.photoData = "";
      U.$("fwPhotoPreview").classList.add("hidden");
    }
    pendingScheduleId = "";
    setSelectedFieldIds([]);
  }

  function prefillField(fieldId) {
    resetForm();
    setSelectedFieldIds([fieldId]);
  }

  function prefillDate(date, fieldId) {
    resetForm();
    U.$("fwDate").value = date || U.today();
    if (fieldId) setSelectedFieldIds([fieldId]);
  }

  function prefillFields(date, fieldIds) {
    resetForm();
    U.$("fwDate").value = date || U.today();
    setSelectedFieldIds(fieldIds || []);
  }

  function workNameFromSchedule(schedule) {
    const text = String(schedule && (schedule.title || schedule.scheduleType) || "");
    const names = ["田植え", "代かき", "草刈り", "除草剤", "追肥", "防除", "溝切り", "中干し開始", "中干し終了", "稲刈り", "出穂確認"];
    return names.find((name) => text.includes(name.replace("開始", "").replace("終了", ""))) || text.replace(/予定|確認候補|確認/g, "").trim() || "その他";
  }

  function prefillSchedule(schedule) {
    if (!schedule) return;
    resetForm();
    pendingScheduleId = schedule.scheduleId || "";
    U.$("fieldWorkHeading").textContent = "予定から作業を記録";
    U.$("fwDate").value = U.today();
    U.$("fwName").value = workNameFromSchedule(schedule);
    setSelectedFieldIds(schedule.fieldIds || []);
    applyWorkPreset(U.$("fwName").value);
    if (schedule.memo) {
      U.$("fwMemo").value = schedule.memo;
      U.$("fwMemo").dataset.templateFilled = "1";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderRecentScope() {
    const select = U.$("fieldWorkRecentScope");
    if (!select) return;
    const groups = fieldGroups();
    const options = [
      { value: "all", label: "全圃場" },
      ...groups.map((group) => ({ value: `group:${group.name}`, label: `${group.name}グループ` })),
      ...state.activeFields().map((field) => ({ value: `field:${field.fieldId}`, label: field.name }))
    ];
    if (!options.some((option) => option.value === recentScope)) recentScope = "all";
    U.setOptions(select, options, recentScope);
  }

  function editWork(workId) {
    const work = state.data().fieldWorks.find((item) => item.workId === workId);
    if (!work) return;
    pendingScheduleId = work.sourceScheduleId || "";
    U.$("fieldWorkHeading").textContent = "圃場作業を編集";
    U.$("editFieldWorkId").value = work.workId;
    U.$("fwDate").value = work.date;
    U.$("fwName").value = work.workName;
    setWorker(work.worker || "");
    U.$("fwHours").value = work.hours || "";
    U.$("fwMachine").value = work.machine || "";
    U.$("fwMaterial").value = work.material || "";
    U.$("fwAmount").value = work.amount || "";
    U.$("fwWeather").value = work.weather || "";
    U.$("fwWeatherAutoJson").value = work.weatherAuto ? JSON.stringify(work.weatherAuto) : "";
    if (U.$("fwPhoto")) U.$("fwPhoto").value = work.photo || "";
    if (U.$("fwPhotoPreview")) {
      U.$("fwPhotoPreview").dataset.photoData = work.photoData || "";
      U.$("fwPhotoPreview").src = work.photoData || "";
      U.$("fwPhotoPreview").classList.toggle("hidden", !work.photoData);
    }
    U.$("fwWeatherStatus").textContent = work.weatherAuto ? `${work.weatherAuto.source || "自動取得"}: ${work.weatherAuto.summary || work.weather}` : "必要なら作業日の天気を取得してください。";
    U.$("fwMemo").value = work.memo || "";
    setSelectedFieldIds(work.fieldIds || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList() {
    let rows = state.data().fieldWorks.slice();
    if (recentScope.startsWith("field:")) {
      const fieldId = recentScope.slice("field:".length);
      rows = rows.filter((work) => (work.fieldIds || []).includes(fieldId));
    }
    if (recentScope.startsWith("group:")) {
      const group = recentScope.slice("group:".length);
      rows = rows.filter((work) => (work.fieldIds || []).some((id) => fieldGroupName(state.field(id)) === group));
    }
    rows = rows.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
    U.$("fieldWorkCount").textContent = `${rows.length}件`;
    U.$("fieldWorkList").innerHTML = rows.length ? rows.map((work) => {
      const fieldNames = (work.fieldIds || []).map((id) => state.field(id) && state.field(id).name).filter(Boolean).join("・");
      const dap = daysText(work.fieldIds, work.date);
      const visual = workVisual(work.workName);
      const weather = compactWeather(work.weather);
      const details = [
        work.machine ? `機械: ${work.machine}` : "",
        work.material ? `資材: ${work.material}${work.amount ? ` ${work.amount}` : ""}` : "",
        work.weather ? `天気: ${work.weather}` : "",
        work.weatherAuto ? `自動取得: ${work.weatherAuto.source || ""} / ${work.weatherAuto.label || ""}` : "",
        work.memo || "",
        work.photo && !work.photoData ? `写真: ${work.photo}` : ""
      ].filter(Boolean);
      return `
        <article class="work-log-card work-log-${U.attr(visual.key)}">
          <img class="work-log-icon" src="${U.attr(visual.src)}" alt="${U.attr(visual.alt)}">
          <div class="work-log-main">
            <div class="work-log-title"><b>${U.escapeHTML(work.workName)}</b><span>${U.escapeHTML(U.fd(work.date))}</span></div>
            <div class="work-log-tags"><span class="work-log-field">${U.escapeHTML(fieldNames || "圃場なし")}</span>${work.worker ? `<span>${U.escapeHTML(work.worker)}</span>` : ""}${work.hours ? `<span>${U.escapeHTML(work.hours)}</span>` : ""}</div>
            <div class="work-log-meta">${work.machine ? `<span>${U.escapeHTML(work.machine)}</span>` : ""}${work.material ? `<span>${U.escapeHTML(work.material)}${work.amount ? ` ${U.escapeHTML(work.amount)}` : ""}</span>` : ""}${weather ? `<span>${U.escapeHTML(weather)}</span>` : ""}</div>
            ${dap ? `<small class="work-log-dap">${U.escapeHTML(dap)}</small>` : ""}
          </div>
          ${work.photoData ? `<img class="work-log-photo" src="${U.attr(work.photoData)}" alt="作業写真">` : ""}
          <details class="work-log-menu"><summary aria-label="この作業を操作" title="操作メニュー">…</summary><div><button class="secondary" data-work-action="edit" data-id="${U.attr(work.workId)}">編集</button><button class="secondary" data-work-action="duplicate" data-id="${U.attr(work.workId)}">複製</button><button class="danger" data-work-action="delete" data-id="${U.attr(work.workId)}">削除</button></div></details>
          ${details.length ? `<details class="work-log-detail"><summary>詳細を見る</summary><div>${details.map((detail) => `<p>${U.escapeHTML(detail)}</p>`).join("")}</div></details>` : ""}
        </article>
      `;
    }).join("") : '<div class="empty">圃場作業はまだありません。</div>';
  }

  function render() {
    U.setOptions(U.$("fwName"), S.FIELD_WORK_NAMES, U.$("fwName").value || "田植え");
    renderTemplates();
    renderFieldCards();
    renderRecentScope();
    syncWorkerPreset();
    renderList();
  }

  function setWeatherStatus(message) {
    U.$("fwWeatherStatus").textContent = message;
  }

  function weatherLocationText(location) {
    return RiceOS.weather && RiceOS.weather.locationText
      ? RiceOS.weather.locationText(location)
      : [location && location.label, location && location.latitude, location && location.longitude].filter(Boolean).join(" / ");
  }

  async function useCurrentLocation() {
    try {
      setWeatherStatus("現在地を取得中です。");
      const location = await RiceOS.weather.currentPosition();
      state.updateWeatherLocation(location);
      setWeatherStatus(`位置を保存しました: ${weatherLocationText(location)}`);
      await fetchWorkWeather(false);
    } catch (error) {
      setWeatherStatus(error.message);
      alert(error.message);
    }
  }

  async function setWeatherLocationManually() {
    const current = state.data().meta && state.data().meta.weatherLocation || {};
    const latText = prompt("緯度を入力してください", current.latitude !== undefined ? String(current.latitude) : "");
    if (latText === null) return;
    const lonText = prompt("経度を入力してください", current.longitude !== undefined ? String(current.longitude) : "");
    if (lonText === null) return;
    const latitude = Number(latText);
    const longitude = Number(lonText);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      alert("緯度・経度は数字で入力してください。");
      return;
    }
    const location = { latitude, longitude, label: "手入力位置", source: "manual", updatedAt: U.now() };
    state.updateWeatherLocation(location);
    setWeatherStatus(`位置を保存しました: ${weatherLocationText(location)}`);
    await fetchWorkWeather(false);
  }

  async function searchWeatherPlace() {
    try {
      const place = U.$("weatherPlace").value;
      setWeatherStatus("地名から位置を検索中です。");
      const location = await RiceOS.weather.searchPlace(place);
      state.updateWeatherLocation(location);
      setWeatherStatus(`位置を保存しました: ${weatherLocationText(location)}`);
      await fetchWorkWeather(false);
    } catch (error) {
      setWeatherStatus(error.message);
      alert(error.message);
    }
  }

  async function fetchWorkWeather(showAlert) {
    try {
      const date = U.$("fwDate").value || U.today();
      setWeatherStatus(`${U.fd(date)} の天気を取得中です。`);
      const location = await RiceOS.weather.ensureLocation();
      const weather = await RiceOS.weather.fetchDaily(date, location);
      U.$("fwWeather").value = weather.summary;
      U.$("fwWeather").dataset.autoFilled = "1";
      U.$("fwWeatherAutoJson").value = JSON.stringify(weather);
      setWeatherStatus(`${weather.source}: ${weather.summary} / 位置: ${weatherLocationText(location)}`);
      if (showAlert) U.toast("天気を取得しました");
      return weather;
    } catch (error) {
      setWeatherStatus(error.message);
      if (showAlert) alert(error.message);
      return null;
    }
  }

  function weatherAutoValue() {
    try {
      return U.$("fwWeatherAutoJson").value ? JSON.parse(U.$("fwWeatherAutoJson").value) : null;
    } catch (error) {
      return null;
    }
  }

  function bind() {
    U.$("fwFields").addEventListener("click", (event) => {
      const card = event.target.closest(".select-card");
      if (card) {
        card.classList.toggle("selected");
        updateFieldSelectionSummary();
        applyWorkPreset(U.$("fwName").value);
      }
    });

    const bulkTools = U.$("fieldWorkForm");
    bulkTools.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-fw-select]");
      if (actionButton) {
        const action = actionButton.dataset.fwSelect;
        if (action === "all") setSelectedFieldIds(state.activeFields().map((field) => field.fieldId));
        if (action === "clear") setSelectedFieldIds([]);
        applyWorkPreset(U.$("fwName").value);
        return;
      }
      const templateButton = event.target.closest("[data-fw-template]");
      if (templateButton) {
        applyWorkTemplate(templateButton.dataset.fwTemplate);
        return;
      }
      const hourButton = event.target.closest("[data-fw-hours]");
      if (hourButton) {
        setDuration(Number(hourButton.dataset.fwHours || 0));
        return;
      }
      const hourStepButton = event.target.closest("[data-fw-hours-step]");
      if (hourStepButton) {
        adjustDuration(Number(hourStepButton.dataset.fwHoursStep || 0));
        return;
      }
      const groupButton = event.target.closest("[data-fw-group]");
      if (groupButton) {
        const group = groupButton.dataset.fwGroup || "";
        const current = new Set(selectedFieldIds());
        const ids = state.activeFields()
          .filter((field) => fieldGroupName(field) === group)
          .map((field) => field.fieldId);
        const allSelected = ids.length && ids.every((id) => current.has(id));
        ids.forEach((id) => {
          if (allSelected) current.delete(id);
          else current.add(id);
        });
        setSelectedFieldIds(Array.from(current));
        applyWorkPreset(U.$("fwName").value);
        renderFieldCards();
        return;
      }
      const removeButton = event.target.closest("[data-fw-remove-field]");
      if (removeButton) {
        const current = new Set(selectedFieldIds());
        current.delete(removeButton.dataset.fwRemoveField);
        setSelectedFieldIds(Array.from(current));
        renderFieldCards();
      }
    });

    U.$("fwName").addEventListener("change", () => applyWorkPreset(U.$("fwName").value));
    U.$$("[data-worker-preset]").forEach((button) => {
      button.addEventListener("click", () => setWorker(button.dataset.workerPreset));
    });
    if (U.$("fwWorker")) {
      U.$("fwWorker").addEventListener("input", syncWorkerPreset);
      U.$("fwWorker").addEventListener("change", syncWorkerPreset);
    }

    if (U.$("fwPhotoFile")) {
      U.$("fwPhotoFile").addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await U.imageFileToDataUrl(file);
          U.$("fwPhotoPreview").src = dataUrl;
          U.$("fwPhotoPreview").dataset.photoData = dataUrl;
          U.$("fwPhotoPreview").classList.remove("hidden");
          if (!U.$("fwPhoto").value) U.$("fwPhoto").value = file.name || "写真あり";
        } catch (error) {
          alert(error.message);
        }
      });
    }

    ["fwMachine", "fwMaterial", "fwAmount", "fwWeather"].forEach((id) => {
      U.$(id).addEventListener("input", () => {
        U.$(id).dataset.autoFilled = "0";
      });
    });
    U.$("fwMemo").addEventListener("input", () => {
      U.$("fwMemo").dataset.templateFilled = "0";
    });

    U.$("fwDate").addEventListener("change", () => {
      U.$("fwWeatherAutoJson").value = "";
      const location = state.data().meta && state.data().meta.weatherLocation;
      if (location && location.latitude !== undefined) fetchWorkWeather(false);
    });

    U.$("fieldWorkForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const ids = selectedFieldIds();
      if (!ids.length) {
        alert("対象圃場を選んでください。");
        return;
      }
      state.saveFieldWork({
        workId: U.$("editFieldWorkId").value,
        date: U.$("fwDate").value,
        workName: U.$("fwName").value,
        fieldIds: ids,
        worker: U.$("fwWorker") ? U.$("fwWorker").value : "",
        hours: U.$("fwHours").value,
        machine: U.$("fwMachine").value,
        material: U.$("fwMaterial").value,
        amount: U.$("fwAmount").value,
        sourceScheduleId: pendingScheduleId,
        weather: U.$("fwWeather").value,
        weatherAuto: weatherAutoValue(),
        photo: U.$("fwPhoto") ? U.$("fwPhoto").value : "",
        photoData: U.$("fwPhotoPreview") ? U.$("fwPhotoPreview").dataset.photoData || "" : "",
        memo: U.$("fwMemo").value
      });
      resetForm();
    });

    U.$("fieldWorkList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-work-action]");
      if (!button) return;
      const id = button.dataset.id;
      const work = state.data().fieldWorks.find((item) => item.workId === id);
      if (!work) return;
      if (button.dataset.workAction === "delete") {
        if (confirm("この圃場作業を削除しますか？")) state.deleteFieldWork(id);
        return;
      }
      if (button.dataset.workAction === "duplicate") {
        resetForm();
        U.$("fieldWorkHeading").textContent = "圃場作業を複製";
        U.$("fwDate").value = U.today();
        U.$("fwName").value = work.workName;
        setWorker(work.worker || "自分");
        U.$("fwHours").value = work.hours || "";
        U.$("fwMachine").value = work.machine || "";
        U.$("fwMaterial").value = work.material || "";
        U.$("fwAmount").value = work.amount || "";
        U.$("fwWeather").value = "";
        U.$("fwWeatherAutoJson").value = "";
        if (U.$("fwPhoto")) U.$("fwPhoto").value = work.photo || "";
        if (U.$("fwPhotoPreview")) {
          U.$("fwPhotoPreview").dataset.photoData = work.photoData || "";
          U.$("fwPhotoPreview").src = work.photoData || "";
          U.$("fwPhotoPreview").classList.toggle("hidden", !work.photoData);
        }
        U.$("fwMemo").value = work.memo || "";
        setSelectedFieldIds(work.fieldIds || []);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      U.$("fieldWorkHeading").textContent = "圃場作業を編集";
      pendingScheduleId = work.sourceScheduleId || "";
      U.$("editFieldWorkId").value = work.workId;
      U.$("fwDate").value = work.date;
      U.$("fwName").value = work.workName;
      setWorker(work.worker || "");
      U.$("fwHours").value = work.hours || "";
      U.$("fwMachine").value = work.machine || "";
      U.$("fwMaterial").value = work.material || "";
      U.$("fwAmount").value = work.amount || "";
      U.$("fwWeather").value = work.weather || "";
      U.$("fwWeatherAutoJson").value = work.weatherAuto ? JSON.stringify(work.weatherAuto) : "";
      if (U.$("fwPhoto")) U.$("fwPhoto").value = work.photo || "";
      if (U.$("fwPhotoPreview")) {
        U.$("fwPhotoPreview").dataset.photoData = work.photoData || "";
        U.$("fwPhotoPreview").src = work.photoData || "";
        U.$("fwPhotoPreview").classList.toggle("hidden", !work.photoData);
      }
      U.$("fwWeatherStatus").textContent = work.weatherAuto ? `${work.weatherAuto.source || "自動取得"}: ${work.weatherAuto.summary || work.weather}` : "必要なら作業日の天気を取得してください。";
      U.$("fwMemo").value = work.memo || "";
      setSelectedFieldIds(work.fieldIds || []);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.querySelector('[data-action="reset-field-work"]').addEventListener("click", resetForm);
    if (U.$("fieldWorkRecentScope")) U.$("fieldWorkRecentScope").addEventListener("change", () => {
      recentScope = U.$("fieldWorkRecentScope").value;
      localStorage.setItem("riceFieldWorkRecentScope", recentScope);
      renderList();
    });
    if (document.querySelector('[data-action="clear-work-photo"]')) {
      document.querySelector('[data-action="clear-work-photo"]').addEventListener("click", () => {
        U.$("fwPhotoFile").value = "";
        U.$("fwPhotoPreview").src = "";
        U.$("fwPhotoPreview").dataset.photoData = "";
        U.$("fwPhotoPreview").classList.add("hidden");
      });
    }
    document.querySelector('[data-action="use-current-location"]').addEventListener("click", useCurrentLocation);
    document.querySelector('[data-action="search-weather-place"]').addEventListener("click", searchWeatherPlace);
    document.querySelector('[data-action="set-weather-location"]').addEventListener("click", setWeatherLocationManually);
    document.querySelector('[data-action="fetch-work-weather"]').addEventListener("click", () => fetchWorkWeather(true));
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.fieldWork = { render, bind, resetForm, prefillField, prefillDate, prefillFields, prefillWorkName, prefillSchedule, editWork, daysText };
})();
