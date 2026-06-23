(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

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

  function selectedFieldIds() {
    return U.$$("#fwFields .select-card.selected").map((el) => el.dataset.id);
  }

  function setSelectedFieldIds(ids) {
    const selected = new Set(ids || []);
    U.$$("#fwFields .select-card").forEach((el) => el.classList.toggle("selected", selected.has(el.dataset.id)));
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

  function applyWorkPreset(workName) {
    const preset = WORK_PRESETS[workName] || {};
    const learned = learnedPreset(workName);
    setAutoValue("fwMachine", preset.machine || learned.machine || "");
    setAutoValue("fwMaterial", recommendedMaterial(workName) || learned.material || "");
    setAutoValue("fwAmount", learned.amount || "");
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

  function renderFieldCards() {
    U.$("fwFields").innerHTML = state.activeFields().map((field) => {
      const variety = state.variety(field.varietyId);
      return `
        <div class="select-card" data-id="${U.attr(field.fieldId)}">
          <b>${U.escapeHTML(field.name)}</b><br>
          <span class="muted">${U.escapeHTML(variety && variety.name || "")} / ${U.escapeHTML(String(field.areaA || 0))}a</span>
        </div>
      `;
    }).join("");
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
    if (U.$("fwPhoto")) U.$("fwPhoto").value = "";
    if (U.$("fwPhotoFile")) U.$("fwPhotoFile").value = "";
    if (U.$("fwPhotoPreview")) {
      U.$("fwPhotoPreview").src = "";
      U.$("fwPhotoPreview").dataset.photoData = "";
      U.$("fwPhotoPreview").classList.add("hidden");
    }
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

  function editWork(workId) {
    const work = state.data().fieldWorks.find((item) => item.workId === workId);
    if (!work) return;
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
    const rows = state.data().fieldWorks.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
    U.$("fieldWorkCount").textContent = `${state.data().fieldWorks.length}件`;
    U.$("fieldWorkList").innerHTML = rows.length ? rows.map((work) => {
      const fieldNames = (work.fieldIds || []).map((id) => state.field(id) && state.field(id).name).filter(Boolean).join("・");
      const dap = daysText(work.fieldIds, work.date);
      return `
        <article class="record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(U.fd(work.date))} ${U.escapeHTML(work.workName)}</b><br>
              <span class="pill info">${U.escapeHTML(fieldNames || "圃場なし")}</span>
              ${work.worker ? `<span class="pill ok">${U.escapeHTML(work.worker)}</span>` : ""}
              ${work.hours ? `<span class="pill warn">${U.escapeHTML(work.hours)}</span>` : ""}
              ${dap ? `<span class="pill purple">${U.escapeHTML(dap)}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
              ${work.machine ? `<div>機械: ${U.escapeHTML(work.machine)}</div>` : ""}
              ${work.material ? `<div>資材: ${U.escapeHTML(work.material)} ${U.escapeHTML(work.amount || "")}</div>` : ""}
              ${work.weather ? `<div>天気: ${U.escapeHTML(work.weather)}</div>` : ""}
              ${work.photoData ? `<img class="thumb" src="${U.attr(work.photoData)}" alt="">` : ""}
              ${work.photo && !work.photoData ? `<div>写真: ${U.escapeHTML(work.photo)}</div>` : ""}
              ${work.weatherAuto ? `<div class="muted">自動取得: ${U.escapeHTML(work.weatherAuto.source || "")} / ${U.escapeHTML(work.weatherAuto.label || "")}</div>` : ""}
              ${work.memo ? `<div>${U.escapeHTML(work.memo)}</div>` : ""}
          </div>
          <div class="record-actions">
            <button class="secondary" data-work-action="edit" data-id="${U.attr(work.workId)}">編集</button>
            <button class="secondary" data-work-action="duplicate" data-id="${U.attr(work.workId)}">複製</button>
            <button class="danger" data-work-action="delete" data-id="${U.attr(work.workId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">圃場作業はまだありません。</div>';
  }

  function render() {
    U.setOptions(U.$("fwName"), S.FIELD_WORK_NAMES, U.$("fwName").value || "田植え");
    renderFieldCards();
    syncWorkerPreset();
    renderList();
  }

  function setWeatherStatus(message) {
    U.$("fwWeatherStatus").textContent = message;
  }

  async function useCurrentLocation() {
    try {
      setWeatherStatus("現在地を取得中です。");
      const location = await RiceOS.weather.currentPosition();
      state.updateWeatherLocation(location);
      setWeatherStatus(`位置を保存しました: ${location.latitude}, ${location.longitude}`);
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
    const location = { latitude, longitude, label: "手入力位置", updatedAt: U.now() };
    state.updateWeatherLocation(location);
    setWeatherStatus(`位置を保存しました: ${latitude}, ${longitude}`);
    await fetchWorkWeather(false);
  }

  async function searchWeatherPlace() {
    try {
      const place = U.$("weatherPlace").value;
      setWeatherStatus("地名から位置を検索中です。");
      const location = await RiceOS.weather.searchPlace(place);
      state.updateWeatherLocation(location);
      setWeatherStatus(`位置を保存しました: ${location.label}`);
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
      setWeatherStatus(`${weather.source}: ${weather.summary}`);
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
        applyWorkPreset(U.$("fwName").value);
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
  RiceOS.screens.fieldWork = { render, bind, resetForm, prefillField, prefillDate, prefillWorkName, editWork, daysText };
})();
