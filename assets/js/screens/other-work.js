(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;

  function selected(containerId) {
    return U.$$(`#${containerId} .select-card.selected`).map((el) => el.dataset.id);
  }

  function setSelected(containerId, ids) {
    const set = new Set(ids || []);
    U.$$(`#${containerId} .select-card`).forEach((el) => el.classList.toggle("selected", set.has(el.dataset.id)));
  }

  function renderSelectCards() {
    U.$("owVarieties").innerHTML = state.varieties().map((v) => `<div class="select-card" data-id="${U.attr(v.varietyId)}"><b>${U.escapeHTML(v.name)}</b></div>`).join("");
    U.$("owFields").innerHTML = state.activeFields().map((f) => `<div class="select-card" data-id="${U.attr(f.fieldId)}"><b>${U.escapeHTML(f.name)}</b></div>`).join("");
  }

  function resetForm() {
    U.$("otherWorkHeading").textContent = "その他作業";
    U.$("editOtherWorkId").value = "";
    U.$("owDate").value = U.today();
    U.$("owName").value = "種籾注文";
    U.$("owQuantity").value = "";
    U.$("owHours").value = "";
    U.$("owMemo").value = "";
    setSelected("owVarieties", []);
    setSelected("owFields", []);
  }

  function renderList() {
    const rows = state.data().otherWorks.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
    U.$("otherWorkList").innerHTML = rows.length ? rows.map((work) => {
      const varieties = (work.varietyIds || []).map((id) => state.variety(id) && state.variety(id).name).filter(Boolean).join("・");
      const fields = (work.relatedFieldIds || []).map((id) => state.field(id) && state.field(id).name).filter(Boolean).join("・");
      return `
        <article class="record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(U.fd(work.date))} ${U.escapeHTML(work.workName)}</b><br>
              ${varieties ? `<span class="pill ok">${U.escapeHTML(varieties)}</span>` : ""}
              ${fields ? `<span class="pill info">${U.escapeHTML(fields)}</span>` : ""}
              ${work.hours ? `<span class="pill warn">${U.escapeHTML(work.hours)}</span>` : ""}
            </div>
          </div>
          <div class="record-body">
            ${work.quantity ? `<div>数量: ${U.escapeHTML(work.quantity)}</div>` : ""}
            ${work.memo ? `<div>${U.escapeHTML(work.memo)}</div>` : ""}
          </div>
          <div class="record-actions">
            <button class="secondary" data-other-action="edit" data-id="${U.attr(work.otherWorkId)}">編集</button>
            <button class="danger" data-other-action="delete" data-id="${U.attr(work.otherWorkId)}">削除</button>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">その他作業はまだありません。</div>';
  }

  function render() {
    U.setOptions(U.$("owName"), S.OTHER_WORK_NAMES, U.$("owName").value || "種籾注文");
    renderSelectCards();
    renderList();
  }

  function fillEdit(work) {
    U.$("otherWorkHeading").textContent = "その他作業を編集";
    U.$("editOtherWorkId").value = work.otherWorkId;
    U.$("owDate").value = work.date;
    U.$("owName").value = work.workName;
    U.$("owQuantity").value = work.quantity || "";
    U.$("owHours").value = work.hours || "";
    U.$("owMemo").value = work.memo || "";
    setSelected("owVarieties", work.varietyIds || []);
    setSelected("owFields", work.relatedFieldIds || []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindSelect(containerId) {
    U.$(containerId).addEventListener("click", (event) => {
      const card = event.target.closest(".select-card");
      if (card) card.classList.toggle("selected");
    });
  }

  function bind() {
    bindSelect("owVarieties");
    bindSelect("owFields");

    U.$("otherWorkForm").addEventListener("submit", (event) => {
      event.preventDefault();
      state.saveOtherWork({
        otherWorkId: U.$("editOtherWorkId").value,
        date: U.$("owDate").value,
        workName: U.$("owName").value,
        quantity: U.$("owQuantity").value,
        hours: U.$("owHours").value,
        memo: U.$("owMemo").value,
        varietyIds: selected("owVarieties"),
        relatedFieldIds: selected("owFields")
      });
      resetForm();
    });

    U.$("otherWorkList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-other-action]");
      if (!button) return;
      const id = button.dataset.id;
      const work = state.data().otherWorks.find((item) => item.otherWorkId === id);
      if (!work) return;
      if (button.dataset.otherAction === "delete") {
        if (confirm("このその他作業を削除しますか？")) state.deleteOtherWork(id);
        return;
      }
      fillEdit(work);
    });

    document.querySelector('[data-action="reset-other-work"]').addEventListener("click", resetForm);
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.otherWork = { render, bind, resetForm };
})();
