(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  function resetForm() {
    U.$("growthHeading").textContent = "生育ログ";
    U.$("editGrowthId").value = "";
    U.$("gDate").value = U.today();
    if (state.activeFields()[0]) U.$("gField").value = state.activeFields()[0].fieldId;
    U.$("gLeaf").value = "-";
    U.$("gWeed").value = "-";
    U.$("gGas").value = "-";
    U.$("gWater").value = "-";
    U.$("gPhoto").value = "";
    U.$("gPhotoFile").value = "";
    U.$("gMemo").value = "";
    U.$("gPhotoPreview").src = "";
    U.$("gPhotoPreview").dataset.photoData = "";
    U.$("gPhotoPreview").classList.add("hidden");
  }

  function prefillField(fieldId) {
    resetForm();
    U.$("gField").value = fieldId;
  }

  function renderOptions() {
    U.setOptions(U.$("gField"), state.activeFields().map((f) => ({ value: f.fieldId, label: f.name })), U.$("gField").value);
    U.setOptions(U.$("gLeaf"), S.GROWTH_LEVELS, U.$("gLeaf").value || "-");
    U.setOptions(U.$("gWeed"), S.GROWTH_LEVELS, U.$("gWeed").value || "-");
    U.setOptions(U.$("gGas"), S.GROWTH_LEVELS, U.$("gGas").value || "-");
    U.setOptions(U.$("gWater"), S.WATER_LEVELS, U.$("gWater").value || "-");
  }

  function renderTimeline() {
    const rows = state.data().growthLogs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
    U.$("growthCount").textContent = `${state.data().growthLogs.length}件`;
    U.$("growthTimeline").innerHTML = rows.length ? rows.map((log) => {
      const field = state.field(log.fieldId);
      const dap = U.daysAfterPlanting(field, log.date);
      return `
        <div class="timeline-item growth">
          <b>${U.escapeHTML(U.fd(log.date))} ${U.escapeHTML(field && field.name || "")}</b>
          ${dap !== "" ? `<span class="pill warn">田植後${U.escapeHTML(String(dap))}日</span>` : ""}
          ${log.photoData ? '<span class="pill info">写真あり</span>' : log.photo ? '<span class="pill info">写真メモあり</span>' : ""}
          <br>
          <span class="muted">葉色:${U.escapeHTML(log.leafColor)} / 雑草:${U.escapeHTML(log.weed)} / ガス:${U.escapeHTML(log.gas)} / 水:${U.escapeHTML(log.water)}</span>
          ${log.photoData ? `<img class="thumb" src="${U.attr(log.photoData)}" alt="">` : ""}
          ${log.photo && !log.photoData ? `<div>写真: ${U.escapeHTML(log.photo)}</div>` : ""}
          ${log.memo ? `<div>${U.escapeHTML(log.memo)}</div>` : ""}
          <div class="record-actions">
            <button class="secondary" data-growth-action="edit" data-id="${U.attr(log.logId)}">編集</button>
            <button class="danger" data-growth-action="delete" data-id="${U.attr(log.logId)}">削除</button>
          </div>
        </div>
      `;
    }).join("") : '<div class="empty">生育ログはまだありません。</div>';
  }

  function render() {
    renderOptions();
    renderTimeline();
  }

  function fillEdit(log) {
    U.$("growthHeading").textContent = "生育ログを編集";
    U.$("editGrowthId").value = log.logId;
    U.$("gDate").value = log.date;
    U.$("gField").value = log.fieldId;
    U.$("gLeaf").value = log.leafColor || "-";
    U.$("gWeed").value = log.weed || "-";
    U.$("gGas").value = log.gas || "-";
    U.$("gWater").value = log.water || "-";
    U.$("gPhoto").value = log.photo || "";
    U.$("gMemo").value = log.memo || "";
    U.$("gPhotoFile").value = "";
    U.$("gPhotoPreview").dataset.photoData = log.photoData || "";
    U.$("gPhotoPreview").src = log.photoData || "";
    U.$("gPhotoPreview").classList.toggle("hidden", !log.photoData);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bind() {
    U.$("gPhotoFile").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await U.imageFileToDataUrl(file);
        U.$("gPhotoPreview").src = dataUrl;
        U.$("gPhotoPreview").dataset.photoData = dataUrl;
        U.$("gPhotoPreview").classList.remove("hidden");
        if (!U.$("gPhoto").value) U.$("gPhoto").value = file.name || "写真あり";
        U.toast("写真を追加しました");
      } catch (error) {
        alert(error.message);
      }
    });

    U.$("growthForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!U.$("gField").value) {
        alert("圃場を選んでください。");
        return;
      }
      state.saveGrowthLog({
        logId: U.$("editGrowthId").value,
        date: U.$("gDate").value,
        fieldId: U.$("gField").value,
        leafColor: U.$("gLeaf").value,
        weed: U.$("gWeed").value,
        gas: U.$("gGas").value,
        water: U.$("gWater").value,
        photo: U.$("gPhoto").value,
        photoData: U.$("gPhotoPreview").dataset.photoData || "",
        memo: U.$("gMemo").value
      });
      resetForm();
    });

    U.$("growthTimeline").addEventListener("click", (event) => {
      const button = event.target.closest("[data-growth-action]");
      if (!button) return;
      const id = button.dataset.id;
      const log = state.data().growthLogs.find((item) => item.logId === id);
      if (!log) return;
      if (button.dataset.growthAction === "delete") {
        if (confirm("この生育ログを削除しますか？")) state.deleteGrowthLog(id);
        return;
      }
      fillEdit(log);
    });

    document.querySelector('[data-action="reset-growth"]').addEventListener("click", resetForm);
    document.querySelector('[data-action="clear-growth-photo"]').addEventListener("click", () => {
      U.$("gPhotoFile").value = "";
      U.$("gPhotoPreview").src = "";
      U.$("gPhotoPreview").dataset.photoData = "";
      U.$("gPhotoPreview").classList.add("hidden");
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.growth = { render, bind, resetForm, prefillField };
})();
