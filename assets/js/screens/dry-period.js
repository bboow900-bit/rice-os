(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  function firstFieldId() {
    const field = state.activeFields()[0] || state.fields()[0];
    return field ? field.fieldId : "";
  }

  function currentField() {
    return state.field(U.$("dryField").value) || state.field(firstFieldId());
  }

  function setEndFromDays() {
    const start = U.$("dryStartDate").value;
    const days = U.number(U.$("dryTargetDays").value, 0);
    if (start && days > 0 && !U.$("editDryId").value) {
      U.$("dryEndDate").value = U.dateAddDays(start, days);
    }
  }

  function renderTargetCompare() {
    const field = currentField();
    const start = U.$("dryStartDate").value;
    const end = U.$("dryEndDate").value;
    const observed = U.$("dryDate").value || U.today();
    const elapsed = start ? U.daysBetween(start, observed) : "";
    const remaining = end ? U.daysBetween(observed, end) : "";
    const crack = U.$("dryCrackCm").value || "-";
    const sink = U.$("drySinkCm").value || "-";
    U.$("dryTargetCompare").innerHTML = `
      <div class="mini-card">
        <b>${U.escapeHTML(field && field.name || "圃場")}</b>
        <span>ひび割れ 目標 ${U.escapeHTML(field && field.targetCrackCm || "-")}cm / 現在 ${U.escapeHTML(crack)}cm</span>
        <span>沈み込み 目標 ${U.escapeHTML(field && field.targetSinkCm || "-")}cm / 現在 ${U.escapeHTML(sink)}cm</span>
        ${elapsed !== "" ? `<span>中干し ${U.escapeHTML(String(elapsed))}日目</span>` : ""}
        ${remaining !== "" ? `<span class="${remaining <= 1 ? "warn-text" : ""}">終了目安まであと ${U.escapeHTML(String(remaining))}日</span>` : ""}
      </div>
    `;
  }

  function resetForm() {
    const field = state.field(firstFieldId());
    U.$("dryHeading").textContent = "中干し管理";
    U.$("editDryId").value = "";
    U.$("dryDate").value = U.today();
    U.$("dryField").value = field ? field.fieldId : "";
    U.$("dryStartDate").value = field && field.drainageStartDate || U.today();
    U.$("dryTargetDays").value = field && field.drainageTargetDays || "7";
    U.$("dryEndDate").value = "";
    setEndFromDays();
    U.$("dryCrackCm").value = "";
    U.$("drySinkCm").value = "";
    U.$("drySurface").value = "-";
    U.$("dryGas").value = "-";
    U.$("dryPhoto").value = "";
    U.$("dryPhotoFile").value = "";
    U.$("dryPhotoPreview").src = "";
    U.$("dryPhotoPreview").dataset.photoData = "";
    U.$("dryPhotoPreview").classList.add("hidden");
    U.$("dryMemo").value = "";
    renderTargetCompare();
  }

  function renderOptions() {
    const fieldValue = U.$("dryField").value || firstFieldId();
    U.setOptions(U.$("dryField"), state.activeFields().map((field) => ({ value: field.fieldId, label: field.name })), fieldValue);
    U.setOptions(U.$("drySurface"), S.DRY_SURFACE_LEVELS, U.$("drySurface").value || "-");
    U.setOptions(U.$("dryGas"), S.DRY_GAS_LEVELS, U.$("dryGas").value || "-");
  }

  function fillEdit(item) {
    U.$("dryHeading").textContent = "中干し記録を編集";
    U.$("editDryId").value = item.dryPeriodId;
    U.$("dryField").value = item.fieldId;
    U.$("dryDate").value = item.date;
    U.$("dryStartDate").value = item.startDate || "";
    U.$("dryEndDate").value = item.endDate || "";
    U.$("dryTargetDays").value = item.targetDays || "";
    U.$("dryCrackCm").value = item.crackCm || "";
    U.$("drySinkCm").value = item.sinkCm || "";
    U.$("drySurface").value = item.surface || "-";
    U.$("dryGas").value = item.gas || "-";
    U.$("dryPhoto").value = item.photo || "";
    U.$("dryMemo").value = item.memo || "";
    U.$("dryPhotoFile").value = "";
    U.$("dryPhotoPreview").dataset.photoData = item.photoData || "";
    U.$("dryPhotoPreview").src = item.photoData || "";
    U.$("dryPhotoPreview").classList.toggle("hidden", !item.photoData);
    renderTargetCompare();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderList() {
    const rows = (state.data().dryPeriods || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 60);
    U.$("dryList").innerHTML = rows.length ? rows.map((item) => {
      const field = state.field(item.fieldId);
      const elapsed = item.startDate ? U.daysBetween(item.startDate, item.date) : "";
      const remaining = item.endDate ? U.daysBetween(item.date, item.endDate) : "";
      return `
        <article class="record water-record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(U.fd(item.date))} 中干し</b><br>
              <span class="pill info">${U.escapeHTML(field && field.name || "圃場")}</span>
              ${elapsed !== "" ? `<span class="pill ok">${U.escapeHTML(String(elapsed))}日目</span>` : ""}
              ${remaining !== "" ? `<span class="pill warn">終了目安まで${U.escapeHTML(String(remaining))}日</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            <div class="metric-row">
              <span>ひび <b>${U.escapeHTML(item.crackCm || "-")}</b>cm</span>
              <span>沈み込み <b>${U.escapeHTML(item.sinkCm || "-")}</b>cm</span>
              <span>田面 <b>${U.escapeHTML(item.surface || "-")}</b></span>
              <span>ガス <b>${U.escapeHTML(item.gas || "-")}</b></span>
            </div>
            ${item.photoData ? `<img class="thumb" src="${U.attr(item.photoData)}" alt="">` : ""}
            ${item.memo ? `<div>${U.escapeHTML(item.memo)}</div>` : ""}
          </div>
          <div class="record-actions">
            <button class="secondary" data-dry-action="edit" data-id="${U.attr(item.dryPeriodId)}">編集</button>
            <button class="danger" data-dry-action="delete" data-id="${U.attr(item.dryPeriodId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">中干し記録はまだありません。</div>';
  }

  function render() {
    renderOptions();
    renderTargetCompare();
    renderList();
  }

  function prefillDate(date, fieldId) {
    resetForm();
    U.$("dryDate").value = date || U.today();
    if (fieldId) U.$("dryField").value = fieldId;
    const field = currentField();
    if (field) {
      U.$("dryStartDate").value = field.drainageStartDate || U.$("dryStartDate").value;
      U.$("dryTargetDays").value = field.drainageTargetDays || U.$("dryTargetDays").value;
      setEndFromDays();
    }
    renderTargetCompare();
  }

  function editDry(dryPeriodId) {
    const item = (state.data().dryPeriods || []).find((row) => row.dryPeriodId === dryPeriodId);
    if (item) fillEdit(item);
  }

  function bind() {
    U.$("dryForm").addEventListener("submit", (event) => {
      event.preventDefault();
      state.saveDryPeriod({
        dryPeriodId: U.$("editDryId").value,
        fieldId: U.$("dryField").value,
        date: U.$("dryDate").value,
        startDate: U.$("dryStartDate").value,
        endDate: U.$("dryEndDate").value,
        targetDays: U.$("dryTargetDays").value,
        crackCm: U.$("dryCrackCm").value,
        sinkCm: U.$("drySinkCm").value,
        surface: U.$("drySurface").value,
        gas: U.$("dryGas").value,
        photo: U.$("dryPhoto").value,
        photoData: U.$("dryPhotoPreview").dataset.photoData || "",
        memo: U.$("dryMemo").value
      });
      resetForm();
    });

    U.$("dryPhotoFile").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await U.imageFileToDataUrl(file);
        U.$("dryPhotoPreview").src = dataUrl;
        U.$("dryPhotoPreview").dataset.photoData = dataUrl;
        U.$("dryPhotoPreview").classList.remove("hidden");
        if (!U.$("dryPhoto").value) U.$("dryPhoto").value = file.name || "写真あり";
      } catch (error) {
        alert(error.message);
      }
    });

    U.$("dryList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-dry-action]");
      if (!button) return;
      const id = button.dataset.id;
      const item = (state.data().dryPeriods || []).find((row) => row.dryPeriodId === id);
      if (!item) return;
      if (button.dataset.dryAction === "delete") {
        if (confirm("この中干し記録を削除しますか？")) state.deleteDryPeriod(id);
        return;
      }
      fillEdit(item);
    });

    ["dryField", "dryDate", "dryCrackCm", "drySinkCm", "drySurface", "dryGas"].forEach((id) => U.$(id).addEventListener("change", renderTargetCompare));
    ["dryStartDate", "dryTargetDays"].forEach((id) => U.$(id).addEventListener("change", () => {
      setEndFromDays();
      renderTargetCompare();
    }));
    U.$("dryEndDate").addEventListener("change", renderTargetCompare);

    document.querySelector('[data-action="reset-dry"]').addEventListener("click", resetForm);
    document.querySelector('[data-action="clear-dry-photo"]').addEventListener("click", () => {
      U.$("dryPhotoFile").value = "";
      U.$("dryPhotoPreview").src = "";
      U.$("dryPhotoPreview").dataset.photoData = "";
      U.$("dryPhotoPreview").classList.add("hidden");
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.dryPeriod = { render, bind, resetForm, prefillDate, editDry };
})();
