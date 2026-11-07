(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils, S = R.schema, state = R.state;
  const commonKeys = new Set(["engineRpm","ptoGear","ptoRpm","mainGear","subGear","speedKmh","depthCm","depthDial","ridgeHeightCm","ridgeWidthCm"]);
  let machineId = "", workType = S.TRACTOR_WORK_TYPES[0].value;
  let draft = null, error = "", bound = false;
  let machineDraft = {name:"",maker:"",model:""};
  let addMachineOpen = false;
  let detailId = "";
  const esc = value => U.escapeHTML(String(value ?? ""));
  function fields(type) { return S.TRACTOR_SETTING_FIELDS.filter(field => !field.workTypes || field.workTypes.includes(type)); }
  function settingsFields(type, values, prefix) {
    const input = field => `<label>${esc(field.label)}${field.unit ? `（${esc(field.unit)}）` : ""}<input id="${U.attr(prefix)}-${U.attr(field.key)}" data-tractor-setting="${U.attr(field.key)}" type="${field.type}"${field.min === undefined ? "" : ` min="${field.min}"`}${field.type === "number" ? ` step="${field.step ?? "any"}"` : ""} value="${U.attr(values?.[field.key] ?? "")}"></label>`;
    const rows = fields(type);
    return `<div class="ts-fields">${rows.filter(field => commonKeys.has(field.key)).map(input).join("")}</div><details class="ts-details"><summary>詳細設定・作業機</summary><div class="ts-fields">${rows.filter(field => !commonKeys.has(field.key)).map(input).join("")}</div></details>`;
  }
  function readSettings(host) { return Object.fromEntries([...host.querySelectorAll("[data-tractor-setting]")].map(input => [input.dataset.tractorSetting,input.value])); }
  function profiles() { return state.tractorProfilesFor({}); }
  function tractors() { return state.machines({includeRetired:true}).filter(row => row.category === "トラクター"); }
  function title(row) { return row ? [row.maker,row.name,row.model].filter(Boolean).join(" / ") : "保存済みトラクター"; }
  function summary(row) { return fields(row.workType).filter(field => row.settings[field.key] !== "" && row.settings[field.key] != null).map(field => `${field.label}：${row.settings[field.key]}${field.unit}`).join(" / ") || "設定値は未登録"; }
  function readDraft() {
    const form = U.$("tractorProfileForm"); if (!form || !draft) return;
    Object.assign(draft,{name:form.elements.namedItem("name").value,conditions:form.elements.namedItem("conditions").value,memo:form.elements.namedItem("memo").value,settings:readSettings(form)});
  }
  function renderContent() {
    const root = U.$("tractorSettingsContent"); if (!root) return;
    const machines = tractors();
    if (!machineId && machines.length) machineId = machines.find(row => row.status !== "使用停止")?.machineId || machines[0].machineId;
    const rows = profiles().filter(row => row.machineId === machineId && row.workType === workType);
    const machineOptions = machines.map(row => `<option value="${U.attr(row.machineId)}"${machineId === row.machineId ? " selected" : ""}>${esc(title(row))}${row.status === "使用停止" ? "（使用停止）" : ""}</option>`);
    if (machineId && !machines.some(row => row.machineId === machineId)) machineOptions.push(`<option selected value="${U.attr(machineId)}">保存済みの機械（削除済み）</option>`);
    root.innerHTML = `<div class="screen-head"><h2>トラクター設定</h2></div><div class="ts-toolbar"><label>トラクター<select id="tsMachine">${machineOptions.join("") || '<option value="">未登録</option>'}</select></label><label>作業種別<select id="tsWorkType">${S.TRACTOR_WORK_TYPES.map(row => `<option value="${row.value}"${row.value === workType ? " selected" : ""}>${esc(row.label)}</option>`).join("")}</select></label><button type="button" class="secondary" data-ts-add-machine>トラクターを登録</button><button type="button" class="primary" data-ts-new${state.machine(machineId)?.category === "トラクター" && state.machine(machineId)?.status !== "使用停止" ? "" : " disabled"}>設定を追加</button></div>
      ${addMachineOpen ? `<form id="tsMachineForm" class="ts-form"><h3>機械台帳に登録</h3><div class="ts-fields"><label>機械名<input name="name" required value="${U.attr(machineDraft.name)}"></label><label>メーカー<input name="maker" value="${U.attr(machineDraft.maker)}"></label><label>型式<input name="model" value="${U.attr(machineDraft.model)}"></label></div><div class="ts-actions"><button type="button" class="secondary" data-ts-machine-cancel>取消</button><button type="submit" class="primary">登録</button></div></form>` : ""}
      <p id="tsError" class="ts-error" role="alert">${esc(error)}</p>
      ${draft ? `<form id="tractorProfileForm" class="ts-form" data-profile-id="${U.attr(draft.profileId || "")}"><h3>${draft.profileId ? "設定を編集" : "設定を登録"}</h3><p>${esc(title(state.machine(draft.machineId)))} / ${esc(S.TRACTOR_WORK_TYPES.find(row => row.value === draft.workType)?.label || draft.workType)}</p><label>設定名<input name="name" value="${U.attr(draft.name)}" required></label>${settingsFields(draft.workType,draft.settings,"ts")}<label>条件・使い分け<input name="conditions" value="${U.attr(draft.conditions || "")}"></label><label>メモ<textarea name="memo">${esc(draft.memo)}</textarea></label><div class="ts-actions"><button type="button" class="secondary" data-ts-cancel>編集を取消</button><button type="submit" class="primary">設定を保存</button></div></form>` : ""}
      <section id="tsProfiles" aria-label="保存した設定">${rows.map(row => `<article class="ts-profile" data-ts-profile="${U.attr(row.profileId)}"><h3>${esc(row.name)}</h3>${row.conditions ? `<p>${esc(row.conditions)}</p>` : ""}<details><summary>設定を確認</summary><p>${esc(summary(row))}</p>${row.memo ? `<p>${esc(row.memo)}</p>` : ""}</details><div class="ts-actions"><button type="button" class="secondary" data-ts-edit="${U.attr(row.profileId)}">編集</button><button type="button" class="secondary" data-ts-copy="${U.attr(row.profileId)}">複製</button><button type="button" class="danger" data-ts-delete="${U.attr(row.profileId)}">削除</button></div></article>`).join("") || '<p class="empty">このトラクター・作業種別の設定はまだありません。</p>'}</section>`;
  }
  function render() {
    renderContent();
    const root = U.$("tractorSettingsContent");
    if (!root || !root.querySelector) return;
    const list = root.querySelector("#tsProfiles"), toolbar = root.querySelector(".ts-toolbar");
    const row = profiles().find(item=>item.profileId===detailId);
    if (detailId && !row) detailId="";
    if (list) list.hidden=Boolean(draft || addMachineOpen || row);
    if (toolbar) toolbar.hidden=Boolean(draft || addMachineOpen || row);
    if (!draft && !addMachineOpen && row) {
      root.insertAdjacentHTML("beforeend",`<section class="profile-ledger-detail"><div class="ts-actions"><button type="button" class="secondary" data-ts-list>一覧へ</button><button type="button" class="primary" data-ts-edit="${U.attr(row.profileId)}">編集</button><button type="button" class="secondary" data-ts-copy="${U.attr(row.profileId)}">複製</button><button type="button" class="danger" data-ts-delete="${U.attr(row.profileId)}">削除</button></div><h3>${esc(row.name)}</h3><p>${esc(title(state.machine(row.machineId)))}</p><p>${esc(summary(row))}</p><p>${esc(row.conditions || "")}</p><p>${esc(row.memo || "")}</p></section>`);
    } else if (!draft && !addMachineOpen && list) {
      list.querySelectorAll("[data-ts-profile]").forEach(article=>{article.querySelector("details")?.remove();article.insertAdjacentHTML("beforeend",`<button type="button" class="secondary" data-ts-open="${U.attr(article.dataset.tsProfile)}">詳細を見る ›</button>`);});
    }
    if (R.app && R.app.syncBackButton) R.app.syncBackButton();
  }
  function handleBack() {
    if (draft) {readDraft();if (!confirm("入力中の設定を取り消して戻りますか？")) return true;draft=null;error="";render();return true;}
    if (addMachineOpen) {if (Object.values(machineDraft).some(Boolean) && !confirm("機械登録の入力を取り消しますか？")) return true;addMachineOpen=false;render();return true;}
    if (detailId) {detailId="";render();return true;}
    return false;
  }
  function enter() { render(); }
  function bind() {
    const root = U.$("tractorSettingsContent"); if (!root || bound) return; bound = true;
    root.addEventListener("input",event => {
      if (event.target.closest("#tractorProfileForm")) readDraft();
      if (event.target.closest("#tsMachineForm")) machineDraft[event.target.name] = event.target.value;
    });
    root.addEventListener("change",event => {
      if (event.target.id === "tsMachine" || event.target.id === "tsWorkType") { readDraft(); machineId = U.$("tsMachine").value; workType = U.$("tsWorkType").value; render(); }
    });
    root.addEventListener("click",event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-ts-open")) {detailId=button.dataset.tsOpen;render();return;}
      if (button.hasAttribute("data-ts-list")) {detailId="";render();return;}
      if (button.hasAttribute("data-ts-new") || button.hasAttribute("data-ts-copy")) detailId="";
      if (button.hasAttribute("data-ts-edit")) detailId=button.dataset.tsEdit;
      if (button.hasAttribute("data-ts-add-machine")) { readDraft(); addMachineOpen = true; render(); }
      if (button.hasAttribute("data-ts-machine-cancel")) { addMachineOpen = false; machineDraft = {name:"",maker:"",model:""}; error = ""; render(); }
      if (button.hasAttribute("data-ts-cancel")) { draft = null; error = ""; render(); }
      if (button.hasAttribute("data-ts-new")) {
        if (draft && !confirm("入力中の設定を取り消して新規入力へ切り替えますか？")) return;
        draft = {machineId,workType,name:"",settings:{},conditions:"",memo:""}; error = ""; render();
      }
      const id = button.dataset.tsEdit || button.dataset.tsCopy || button.dataset.tsDelete;
      if (!id) return;
      const row = profiles().find(item => item.profileId === id); if (!row) return;
      if (button.hasAttribute("data-ts-delete")) {
        if (!confirm("この設定を削除しますか？作業実績に保存した設定は残ります。")) return;
        if (!state.deleteTractorProfile(id)) { error = "削除できませんでした。保存内容は変更していません。"; render(); return; }
        if (draft?.profileId === id) draft = null;
      } else {
        if (draft && !confirm("入力中の設定を取り消して切り替えますか？")) return;
        draft = U.clone(row);
        if (button.hasAttribute("data-ts-copy")) { delete draft.profileId; delete draft.createdAt; delete draft.updatedAt; draft.name += "（複製）"; }
      }
      error = ""; render();
    });
    root.addEventListener("submit",event => {
      event.preventDefault();
      if (event.target.id === "tsMachineForm") {
        const id = state.saveMachine({...machineDraft,category:"トラクター"});
        if (!id) { error = "トラクターを登録できませんでした。入力は保持しています。"; render(); return; }
        machineId = id; addMachineOpen = false; machineDraft = {name:"",maker:"",model:""}; error = ""; render(); return;
      }
      if (event.target.id !== "tractorProfileForm") return;
      readDraft();
      if (draft.profileId && !profiles().some(row => row.profileId === draft.profileId)) { error = "編集中の設定は削除されています。新規入力へ切り替えてください。"; render(); return; }
      if (!state.saveTractorProfile(draft)) { error = "設定を保存できませんでした。入力は保持しています。"; render(); return; }
      machineId = draft.machineId; workType = draft.workType; draft = null; error = ""; render();
    });
  }
  R.screens = R.screens || {};
  R.screens.tractorSettings = {render,bind,enter,settingsFields,readSettings,canHandleBack:()=>Boolean(draft || addMachineOpen || detailId),handleBack,preserveOnDataChange:true};
})();
