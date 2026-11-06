(function () {
  "use strict";

  const RiceOS = window.RiceOS = window.RiceOS || {};
  const U = RiceOS.utils;
  const S = RiceOS.schema;
  const state = RiceOS.state;
  let purchaseMaterialId = "";
  const purchaseDrafts = new Map(), purchaseYears = new Map(), purchaseErrors = new Map();
  const moneyText = value => typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("ja-JP")}円` : "価格未記録";

  function renderPurchases() {
    const host = U.$("materialPurchases"), api = RiceOS.materialPurchases;
    if (!host || !api) return;
    const material = state.data().materials.find(row => row.materialId === purchaseMaterialId);
    if (!material) { host.innerHTML = '<p class="muted">購入履歴は、保存済み資材の「購入履歴」から開けます。</p>'; return; }
    const rows = api.records(material.materialId), draft = purchaseDrafts.get(material.materialId);
    const year = purchaseYears.get(material.materialId) || "all";
    const years = [...new Set(rows.map(row => String(row.season || String(row.date || "").slice(0,4))).filter(value => /^\d{4}$/.test(value)))].sort().reverse();
    if (year !== "all" && !years.includes(year)) years.unshift(year);
    const shown = rows.filter(row => year === "all" || String(row.season || String(row.date || "").slice(0,4)) === year).sort((a,b) => String(b.date).localeCompare(String(a.date)));
    host.innerHTML = `<section class="mp-ledger"><div class="mp-heading"><h3>${U.escapeHTML(material.name)}の購入履歴</h3><button type="button" class="secondary" data-mp-new>＋ 購入を追加</button></div><p class="muted">購入履歴は旧欄の購入数・使用数・在庫へ自動加算しません。</p><label class="mp-year">表示年度<select id="mpViewYear"><option value="all"${year === "all" ? " selected" : ""}>全年度</option>${years.map(value => `<option value="${U.attr(value)}"${value === year ? " selected" : ""}>${U.escapeHTML(value)}年度</option>`).join("")}</select></label><p class="mp-error" role="alert">${U.escapeHTML(purchaseErrors.get(material.materialId) || "")}</p>${draft ? `<form id="materialPurchaseForm" class="mp-form"><h4>${draft.purchaseId ? "購入記録を編集" : "購入記録を追加"}</h4><div class="mp-grid">${[
      ["date","購入日","date",'required'],["season","年度","number",'min="1900" max="2200" step="1" required'],["supplier","仕入先","text",""],["quantity","数量","number",'min="0" step="any" required'],["unit","単位","text",'required'],["unitPrice","税込単価（円・任意）","number",'min="0" step="1"'],["totalAmount","税込総額（実額・任意）","number",'min="0" step="1"']
    ].map(([name,label,type,attrs]) => `<label>${label}<input id="mp-${name}" name="${name}" type="${type}" ${attrs} value="${U.attr(draft[name] ?? "")}"></label>`).join("")}</div><label>メモ<textarea name="memo">${U.escapeHTML(draft.memo || "")}</textarea></label><p id="mpSubtotal" class="mp-subtotal">単価×数量：${moneyText(api.subtotal(draft))} ／ 記録金額：${moneyText(api.amount(draft))}</p><div class="mp-actions"><button type="button" class="secondary" data-mp-cancel>取消</button><button type="submit" class="primary">購入記録を保存</button></div></form>` : ""}<div class="mp-history">${shown.map(row => `<article class="mp-record" data-mp-record="${U.attr(row.purchaseId || "")}"><div class="mp-heading"><b>${U.escapeHTML(row.date || "購入日未記録")}</b><span>${U.escapeHTML(row.season || String(row.date || "").slice(0,4))}年度</span></div><p>${U.escapeHTML(row.supplier || "仕入先未記録")} ／ ${U.escapeHTML(row.quantity ?? "数量未記録")} ${U.escapeHTML(row.unit || "")}</p><p>税込単価 ${moneyText(typeof row.unitPrice === "number" ? row.unitPrice : null)} ／ ${row.totalAmount !== "" && row.totalAmount != null ? "税込実額" : "計算小計"} ${moneyText(api.amount(row))}</p>${row.memo ? `<p>${U.escapeHTML(row.memo)}</p>` : ""}<div class="mp-actions"><button type="button" class="secondary" data-mp-edit="${U.attr(row.purchaseId || "")}"${row.purchaseId ? "" : " disabled"}>編集</button><button type="button" class="secondary" data-mp-delete="${U.attr(row.purchaseId || "")}"${row.purchaseId ? "" : " disabled"}>削除</button></div></article>`).join("") || '<p class="empty">この年度の購入記録はありません。</p>'}</div></section>`;
  }

  function openPurchases(id) {
    if (!state.data().materials.some(row => row.materialId === id)) return false;
    purchaseMaterialId = id;
    renderPurchases();
    U.$("materialPurchases")?.scrollIntoView({behavior:"smooth",block:"start"});
    return true;
  }

  function bindPurchases() {
    const host = U.$("materialPurchases");
    if (!host) return;
    const capture = () => {
      const form = host.querySelector("#materialPurchaseForm"), draft = purchaseDrafts.get(purchaseMaterialId);
      if (!form || !draft) return;
      for (const name of ["date","season","supplier","quantity","unit","unitPrice","totalAmount","memo"]) draft[name] = form.elements.namedItem(name).value;
      const summary = host.querySelector("#mpSubtotal");
      if (summary) summary.textContent = `単価×数量：${moneyText(RiceOS.materialPurchases.subtotal(draft))} ／ 記録金額：${moneyText(RiceOS.materialPurchases.amount(draft))}`;
    };
    host.addEventListener("input",capture);
    host.addEventListener("change",event => {
      if (event.target.id === "mpViewYear") { purchaseYears.set(purchaseMaterialId,event.target.value); renderPurchases(); }
      else capture();
    });
    host.addEventListener("click",event => {
      const api = RiceOS.materialPurchases;
      const replaceDraft = value => {
        if (purchaseDrafts.has(purchaseMaterialId) && !confirm("入力中の購入記録を破棄しますか？")) return;
        purchaseDrafts.set(purchaseMaterialId,value); purchaseErrors.delete(purchaseMaterialId); renderPurchases();
      };
      if (event.target.closest("[data-mp-new]")) {
        const material = state.data().materials.find(row => row.materialId === purchaseMaterialId);
        if (!material) return;
        replaceDraft({date:U.today(),season:new Date().getFullYear(),supplier:"",quantity:"",unit:material.unit || "",unitPrice:"",totalAmount:"",memo:""}); return;
      }
      if (event.target.closest("[data-mp-cancel]")) { purchaseDrafts.delete(purchaseMaterialId); purchaseErrors.delete(purchaseMaterialId); renderPurchases(); return; }
      const edit = event.target.closest("[data-mp-edit]");
      if (edit) { const row = api.records(purchaseMaterialId).find(item => item.purchaseId === edit.dataset.mpEdit); if (row) replaceDraft(row); return; }
      const del = event.target.closest("[data-mp-delete]");
      if (del && confirm("この購入記録を削除しますか？")) {
        if (api.deletePurchase(purchaseMaterialId,del.dataset.mpDelete)) {
          if (purchaseDrafts.get(purchaseMaterialId)?.purchaseId === del.dataset.mpDelete) purchaseDrafts.delete(purchaseMaterialId);
          purchaseErrors.delete(purchaseMaterialId);
        } else purchaseErrors.set(purchaseMaterialId,api.lastError);
        renderPurchases();
      }
    });
    host.addEventListener("submit",event => {
      if (event.target.id !== "materialPurchaseForm") return;
      event.preventDefault(); capture();
      const api = RiceOS.materialPurchases, saved = api.savePurchase(purchaseMaterialId,purchaseDrafts.get(purchaseMaterialId));
      if (saved) { purchaseDrafts.delete(purchaseMaterialId); purchaseErrors.delete(purchaseMaterialId); purchaseYears.set(purchaseMaterialId,String(saved.season)); }
      else purchaseErrors.set(purchaseMaterialId,api.lastError);
      renderPurchases(); renderList();
    });
  }

  function safeProductUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return "";
    try {
      const url = new URL(value.trim());
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function usageCarte(material) {
    const group = state.materialUsageForYear(material.season).find((item) => item.materialId === material.materialId);
    const works = material.materialId && group ? group.works.filter((work) => work.materialId === material.materialId
      && String(work.date).slice(0, 4) === String(material.season)) : [];
    const fields = state.data().fields || [];
    const fieldName = (id) => {
      const field = fields.find((item) => item.fieldId === id);
      return field ? field.name || id : id;
    };
    const H = RiceOS.herbicide;
    const observations = new Map();
    if (H && typeof H.assignments === "function" && typeof H.observations === "function") {
      const assignments = H.assignments(undefined, material.season);
      works.forEach((work) => {
        (Array.isArray(work.herbicideLinks) ? work.herbicideLinks : []).forEach((link) => {
          if (!link || !Array.isArray(work.fieldIds) || !work.fieldIds.includes(link.fieldId)) return;
          const assignment = assignments.find((a) => a.assignmentId === link.assignmentId && a.fieldId === link.fieldId
            && String(a.year) === String(material.season) && Array.isArray(a.steps)
            && a.steps.some((step) => step && step.id === link.stepId && step.materialId === material.materialId));
          if (!assignment) return;
          H.observations(assignment.assignmentId).forEach((o) => {
            if (o.observationId && o.assignmentId === assignment.assignmentId && o.fieldId === assignment.fieldId
              && String(o.date).slice(0, 4) === String(material.season)) observations.set(o.observationId, { ...o, assignmentName: assignment.name });
          });
        });
      });
    }
    return `<details class="material-carte"><summary>使用カルテ</summary>
      ${works.length ? works.map((work) => `<article class="material-carte-work">
        <b>${U.escapeHTML(U.fd(work.date))}</b>
        <div>対象圃場: ${U.escapeHTML((work.fieldIds || []).map(fieldName).join("・") || "未記録")}</div>
        <div>量: ${U.escapeHTML(work.amount || "未記録")}</div>
        ${work.herbicidePurpose ? `<div>目的: ${U.escapeHTML(work.herbicidePurpose)}</div>` : ""}
        ${work.memo ? `<div>${U.escapeHTML(work.memo)}</div>` : ""}
      </article>`).join("") : '<p class="muted">この年度の関連する使用実績はありません。</p>'}
      <h4>関連する体系の観察</h4>
      ${observations.size ? Array.from(observations.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((o) => `<article class="material-carte-observation">
        <b>${U.escapeHTML(U.fd(o.date))} ${U.escapeHTML(o.status)}</b>
        <div>${U.escapeHTML(fieldName(o.fieldId))} / ${U.escapeHTML(o.assignmentName || "体系名未記録")}</div>
        <div>${U.escapeHTML(Array.isArray(o.weeds) ? o.weeds.join("・") : o.weeds || "")}</div>
        ${o.memo ? `<div>${U.escapeHTML(o.memo)}</div>` : ""}
      </article>`).join("") : '<p class="muted">関連する観察記録はありません。</p>'}
    </details>`;
  }

  function resetForm() {
    U.$("editMaterialId").value = "";
    U.$("saveMaterialButton").textContent = "資材を保存";
    U.$("mFormalName").value = "";
    U.$("mFormulation").value = "";
    U.$("mUnit").value = "";
    U.$("mRegistrationNumber").value = "";
    U.$("mProductUrl").value = "";
    U.$("mSeason").value = new Date().getFullYear();
    U.$("mCategory").value = "肥料";
    U.$("mName").value = "";
    U.$("mDeliveryDate").value = "";
    U.$("mCarryover").value = "";
    U.$("mOrdered").value = "";
    U.$("mUsed").value = "";
    U.$("mRemaining").value = "";
    U.$("mMemo").value = "";
  }

  function renderList() {
    const rows = state.data().materials.slice().sort((a, b) => Number(b.season) - Number(a.season) || String(b.deliveryDate).localeCompare(String(a.deliveryDate)));
    U.$("materialList").innerHTML = rows.length ? rows.map((m) => {
      const productUrl = safeProductUrl(m.productUrl);
      const remaining = m.remaining;
      return `
        <article class="record">
          <div class="record-head">
            <div>
              <b>${U.escapeHTML(m.season)} ${U.escapeHTML(m.category)}・${U.escapeHTML(m.name || "名称未入力")}</b><br>
              ${m.deliveryDate ? `<span class="pill info">納品 ${U.escapeHTML(U.fd(m.deliveryDate))}</span>` : ""}
              ${remaining ? `<span class="pill warn">在庫（手入力） ${U.escapeHTML(remaining)}</span>` : ""}
            </div>
            <button type="button" class="secondary" data-material-edit="${U.attr(m.materialId)}">編集</button>
            <button type="button" class="secondary" data-material-purchases="${U.attr(m.materialId)}">購入履歴</button>
            <button type="button" class="secondary" data-material-delete="${U.attr(m.materialId)}">削除</button>
          </div>
          <div class="record-body">
            <div class="metric-row">
              <span>前年繰越 <b>${U.escapeHTML(m.carryover || "-")}</b></span>
              <span>今年購入 <b>${U.escapeHTML(m.ordered || "-")}</b></span>
              <span>使用数（手入力） <b>${U.escapeHTML(m.used || "-")}</b></span>
            </div>
            <div class="muted">${U.escapeHTML([m.formalName, m.formulation, m.unit].filter(Boolean).join(" / "))}</div>
            ${m.registrationNumber || ["除草剤", "防除剤"].includes(m.category) ? `<p class="muted">登録番号 ${U.escapeHTML(m.registrationNumber || "未登録")}</p>` : ""}
            <div class="material-reference-links">
              ${["除草剤", "防除剤"].includes(m.category) ? '<a href="https://pesticide.maff.go.jp/" target="_blank" rel="noopener noreferrer">農薬登録情報（公式）</a>' : ""}
              ${productUrl ? `<a href="${U.attr(productUrl)}" target="_blank" rel="noopener noreferrer">メーカー登録URL</a>` : ""}
            </div>
            ${usageCarte(m)}
            ${m.nextYearMemo ? `<div>${U.escapeHTML(m.nextYearMemo)}</div>` : ""}
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">資材台帳はまだありません。</div>';
  }

  function render() {
    U.setOptions(U.$("mCategory"), S.MATERIAL_CATEGORIES, U.$("mCategory").value || "肥料");
    if (!U.$("mSeason").value) U.$("mSeason").value = new Date().getFullYear();
    renderList();
    renderPurchases();
  }

  function bind() {
    bindPurchases();
    U.$("cancelMaterialEdit").addEventListener("click", resetForm);
    U.$("materialList").addEventListener("click", (event) => {
      const purchases = event.target.closest("[data-material-purchases]");
      if (purchases) { openPurchases(purchases.dataset.materialPurchases); return; }
      const deleteButton = event.target.closest("[data-material-delete]");
      if (deleteButton) {
        const material = state.data().materials.find((item) => item.materialId === deleteButton.dataset.materialDelete);
        if (!material || !confirm(`資材「${material.name}」を削除しますか？この操作は取り消せません。`)) return;
        if (state.deleteMaterial(material.materialId) && U.$("editMaterialId").value === material.materialId) resetForm();
        return;
      }
      const button = event.target.closest("[data-material-edit]");
      if (!button) return;
      const material = state.data().materials.find((item) => item.materialId === button.dataset.materialEdit);
      if (!material) return;
      U.$("editMaterialId").value = material.materialId;
      const inputs = { mSeason: "season", mCategory: "category", mName: "name", mFormalName: "formalName", mFormulation: "formulation", mUnit: "unit", mDeliveryDate: "deliveryDate", mCarryover: "carryover", mOrdered: "ordered", mUsed: "used", mRemaining: "remaining", mMemo: "nextYearMemo" };
      U.setOptions(U.$("mCategory"), Array.from(new Set([...S.MATERIAL_CATEGORIES, material.category])), material.category);
      Object.entries(inputs).forEach(([id, key]) => { U.$(id).value = material[key] ?? ""; });
      U.$("mRegistrationNumber").value = material.registrationNumber || "";
      U.$("mProductUrl").value = material.productUrl || "";
      U.$("saveMaterialButton").textContent = "資材を更新";
      U.$("materialForm").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    U.$("materialForm").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!U.$("mName").value.trim()) {
        alert("資材名を入力してください。");
        return;
      }
      const rawProductUrl = U.$("mProductUrl").value.trim();
      const productUrl = safeProductUrl(rawProductUrl);
      if (rawProductUrl && !productUrl) {
        alert("メーカー登録URLは、ユーザー名・パスワードを含まないhttpまたはhttpsのURLを入力してください。");
        U.$("mProductUrl").focus();
        return;
      }
      const saved = state.saveMaterial({
        materialId: U.$("editMaterialId").value,
        season: U.$("mSeason").value,
        category: U.$("mCategory").value,
        name: U.$("mName").value,
        formalName: U.$("mFormalName").value,
        formulation: U.$("mFormulation").value,
        unit: U.$("mUnit").value,
        registrationNumber: U.$("mRegistrationNumber").value.trim(),
        productUrl,
        deliveryDate: U.$("mDeliveryDate").value,
        carryover: U.$("mCarryover").value,
        ordered: U.$("mOrdered").value,
        used: U.$("mUsed").value,
        remaining: U.$("mRemaining").value,
        nextYearMemo: U.$("mMemo").value
      });
      if (!saved) return;
      resetForm();
    });
  }

  RiceOS.screens = RiceOS.screens || {};
  RiceOS.screens.materials = { render, bind, resetForm, openPurchases };
})();
