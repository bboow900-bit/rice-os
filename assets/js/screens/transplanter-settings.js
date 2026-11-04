(function () {
  "use strict";
  const R = window.RiceOS = window.RiceOS || {};
  const U = R.utils, S = R.schema, state = R.state;
  let cropYear = Number(state.defaultCropYear(U.today()));
  let machineId = "", varietyId = "", draft = null, error = "", bound = false;
  let machineDraft = {name:"",maker:"",model:""}, machineOpen = false;
  const commonKeys = new Set(["rowSpacing","plantSpacing","plantsPerHill","plantsPerTsubo","seedlingBoxesPer10a","seedlingScrapeAmount","transplanterSetting"]);
  const esc = value => U.escapeHTML(String(value ?? ""));
  function definitions() { return S.TRANSPLANTER_SETTING_FIELDS || []; }
  function settingsFields(values,prefix) {
    const input = field => `<label>${esc(field.label)}${field.unit ? `（${esc(field.unit)}）` : ""}<input id="${U.attr(prefix)}-${U.attr(field.key)}" data-transplanter-setting="${U.attr(field.key)}" type="${field.type}"${field.min === undefined ? "" : ` min="${field.min}"`}${field.type === "number" ? ` step="${field.step ?? "any"}"` : ""} value="${U.attr(values?.[field.key] ?? "")}"></label>`;
    return `<div class="ts-fields">${definitions().filter(field => commonKeys.has(field.key)).map(input).join("")}</div><details class="ts-details"><summary>詳細設定・施肥</summary><div class="ts-fields">${definitions().filter(field => !commonKeys.has(field.key)).map(input).join("")}</div></details>`;
  }
  function readSettings(host) { return Object.fromEntries([...host.querySelectorAll("[data-transplanter-setting]")].map(input => [input.dataset.transplanterSetting,input.value])); }
  function profiles() { return typeof state.transplanterProfilesFor === "function" ? state.transplanterProfilesFor({}) : []; }
  function machines() { return state.machines({includeRetired:true}).filter(row => row.category === "田植機"); }
  function machineName(id) { const row = state.machine(id); return row ? [row.maker,row.name,row.model].filter(Boolean).join(" / ") : id ? "保存済みの機械（削除済み）" : "機械未指定"; }
  function varietyName(id) { return state.variety(id)?.name || "保存済みの品種（削除済み）"; }
  function readDraft() {
    const form = U.$("transplanterProfileForm"); if (!form || !draft) return;
    Object.assign(draft,{name:form.elements.namedItem("name").value,intent:form.elements.namedItem("intent").value,memo:form.elements.namedItem("memo").value,settings:readSettings(form)});
  }
  function replaceDraft(row) {
    if (draft && !confirm("入力中の設定を取り消して切り替えますか？")) return false;
    draft = row; error = ""; render(); return true;
  }
  function fresh(row,year) { const value = U.clone(row); delete value.profileId; delete value.createdAt; delete value.updatedAt; value.cropYear = year; return value; }
  function render() {
    const root = U.$("transplanterSettingsContent"); if (!root) return;
    const all = profiles(), varieties = state.varieties(), currentYear = Number(U.today().slice(0,4));
    if (!varietyId && varieties.length) varietyId = varieties[0].varietyId;
    const years = [...new Set([cropYear,Number(state.defaultCropYear(U.today())),...Array.from({length:7},(_,i) => currentYear+1-i),...all.map(row => row.cropYear)])].filter(year => Number.isInteger(year) && year >= 1900 && year <= 2200).sort((a,b) => b-a);
    const rows = all.filter(row => Number(row.cropYear) === cropYear && row.machineId === machineId && row.varietyId === varietyId);
    const prior = all.filter(row => Number(row.cropYear) === cropYear-1 && row.machineId === machineId && row.varietyId === varietyId);
    const machineOptions = machines().map(row => `<option value="${U.attr(row.machineId)}"${row.machineId === machineId ? " selected" : ""}>${esc(machineName(row.machineId))}${row.status === "使用停止" ? "（使用停止）" : ""}</option>`);
    if (machineId && !machines().some(row => row.machineId === machineId)) machineOptions.push(`<option selected value="${U.attr(machineId)}">保存済みの機械（削除済み）</option>`);
    const varietyOptions = varieties.map(row => `<option value="${U.attr(row.varietyId)}"${row.varietyId === varietyId ? " selected" : ""}>${esc(row.name)}</option>`);
    if (varietyId && !varieties.some(row => row.varietyId === varietyId)) varietyOptions.push(`<option selected value="${U.attr(varietyId)}">保存済みの品種（削除済み）</option>`);
    const canCreate = state.variety(varietyId) && (!machineId || state.machine(machineId)?.category === "田植機" && state.machine(machineId)?.status !== "使用停止");
    root.innerHTML = `<div class="screen-head"><h2>年度別の田植え機設定</h2></div><div class="ts-toolbar"><label>対象年度（年産）<select id="tpsYear">${years.map(year => `<option value="${year}"${cropYear === year ? " selected" : ""}>${year}年産</option>`).join("")}</select></label><label>田植機<select id="tpsMachine"><option value=""${machineId ? "" : " selected"}>機械未指定</option>${machineOptions.join("")}</select></label><label>品種<select id="tpsVariety">${varietyOptions.join("")}</select></label><button type="button" class="secondary" data-tps-add-machine>田植機を登録</button><button type="button" class="primary" data-tps-new${canCreate ? "" : " disabled"}>設定を追加</button></div>
      <details class="ts-details"><summary>前年コピー・旧レシピ取込</summary><label>${cropYear-1}年産の設定<select id="tpsPrevious">${prior.map(row => `<option value="${U.attr(row.profileId)}">${esc(row.name)}</option>`).join("") || '<option value="">前年の設定なし</option>'}</select></label><div class="ts-actions"><button type="button" class="secondary" data-tps-copy-previous${prior.length && canCreate ? "" : " disabled"}>前年の設定をコピー</button><button type="button" class="secondary" data-tps-import${canCreate ? "" : " disabled"}>旧栽培レシピから取り込む</button></div><p>コピー・取込後に保存すると、${cropYear}年産の新しい設定になります。元の記録は変更しません。</p></details>
      ${machineOpen ? `<form id="tpsMachineForm" class="ts-form"><h3>機械台帳へ登録</h3><div class="ts-fields"><label>機械名<input name="name" required value="${U.attr(machineDraft.name)}"></label><label>メーカー<input name="maker" value="${U.attr(machineDraft.maker)}"></label><label>型式<input name="model" value="${U.attr(machineDraft.model)}"></label></div><div class="ts-actions"><button type="button" class="secondary" data-tps-machine-cancel>取消</button><button type="submit" class="primary">登録</button></div></form>` : ""}
      <p id="tpsError" class="ts-error" role="alert">${esc(error)}</p>
      ${draft ? `<form id="transplanterProfileForm" class="ts-form" data-profile-id="${U.attr(draft.profileId || "")}"><h3>${draft.profileId ? "設定を編集" : "設定を登録"}</h3><p>${esc(draft.cropYear)}年産 / ${esc(varietyName(draft.varietyId))} / ${esc(machineName(draft.machineId))}</p><label>設定名<input name="name" required value="${U.attr(draft.name)}"></label>${settingsFields(draft.settings,"tps")}<label>設定の意図・条件<textarea name="intent">${esc(draft.intent)}</textarea></label><label>メモ<textarea name="memo">${esc(draft.memo)}</textarea></label><div class="ts-actions"><button type="button" class="secondary" data-tps-cancel>編集を取消</button><button type="submit" class="primary">設定を保存</button></div></form>` : ""}
      <section id="tpsProfiles" aria-label="保存した年度別設定">${rows.map(row => `<article class="ts-profile" data-tps-profile="${U.attr(row.profileId)}"><h3>${esc(row.name)}</h3><p>${esc(row.cropYear)}年産 / ${esc(varietyName(row.varietyId))}</p>${row.intent ? `<p>${esc(row.intent)}</p>` : ""}<details><summary>設定を確認</summary><dl>${definitions().filter(field => row.settings[field.key] !== "" && row.settings[field.key] != null).map(field => `<div><dt>${esc(field.label)}</dt><dd>${esc(row.settings[field.key])}${esc(field.unit)}</dd></div>`).join("")}</dl>${row.memo ? `<p>${esc(row.memo)}</p>` : ""}</details><div class="ts-actions"><button type="button" class="secondary" data-tps-edit="${U.attr(row.profileId)}">編集</button><button type="button" class="secondary" data-tps-copy="${U.attr(row.profileId)}">複製</button><button type="button" class="danger" data-tps-delete="${U.attr(row.profileId)}">削除</button></div></article>`).join("") || '<p class="empty">この年産・田植機・品種の設定はまだありません。</p>'}</section>`;
  }
  function enter(year) { if (Number.isInteger(Number(year)) && Number(year) >= 1900 && Number(year) <= 2200) cropYear = Number(year); render(); }
  function bind() {
    const root = U.$("transplanterSettingsContent"); if (!root || bound) return; bound = true;
    root.addEventListener("input",event => { if (event.target.closest("#transplanterProfileForm")) readDraft(); if (event.target.closest("#tpsMachineForm")) machineDraft[event.target.name] = event.target.value; });
    root.addEventListener("change",event => { if (["tpsYear","tpsMachine","tpsVariety"].includes(event.target.id)) { readDraft(); cropYear = Number(U.$("tpsYear").value); machineId = U.$("tpsMachine").value; varietyId = U.$("tpsVariety").value; render(); } });
    root.addEventListener("click",event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-tps-new")) replaceDraft({cropYear,machineId,varietyId,name:"",settings:{},intent:"",memo:""});
      if (button.hasAttribute("data-tps-cancel")) { draft = null; error = ""; render(); }
      if (button.hasAttribute("data-tps-add-machine")) { readDraft(); machineOpen = true; render(); }
      if (button.hasAttribute("data-tps-machine-cancel")) { machineOpen = false; machineDraft = {name:"",maker:"",model:""}; error = ""; render(); }
      if (button.hasAttribute("data-tps-copy-previous")) {
        const row = profiles().find(item => item.profileId === U.$("tpsPrevious").value); if (row) replaceDraft({...fresh(row,cropYear),name:`${row.name}（前年コピー）`});
      }
      if (button.hasAttribute("data-tps-import")) {
        const variety = state.variety(varietyId); if (!variety) return;
        const settings = Object.fromEntries(definitions().filter(field => commonKeys.has(field.key)).map(field => [field.key,variety[field.key] ?? ""]));
        replaceDraft({cropYear,machineId,varietyId,name:"旧レシピ取込",settings,intent:"",memo:"旧栽培レシピから明示取込。元データの年度は不明です。"});
      }
      const id = button.dataset.tpsEdit || button.dataset.tpsCopy || button.dataset.tpsDelete;
      if (!id) return;
      const row = profiles().find(item => item.profileId === id); if (!row) return;
      if (button.hasAttribute("data-tps-delete")) {
        if (!confirm("この年産の設定を削除しますか？作業実績に保存した設定は残ります。")) return;
        if (!state.deleteTransplanterProfile(id)) { error = "削除できませんでした。保存内容は変更していません。"; render(); return; }
        if (draft?.profileId === id) draft = null; error = ""; render(); return;
      }
      replaceDraft(button.hasAttribute("data-tps-copy") ? {...fresh(row,row.cropYear),name:`${row.name}（複製）`} : U.clone(row));
    });
    root.addEventListener("submit",event => {
      event.preventDefault();
      if (event.target.id === "tpsMachineForm") {
        const id = state.saveMachine({...machineDraft,category:"田植機"});
        if (!id) { error = "田植機を登録できませんでした。入力は保持しています。"; render(); return; }
        machineId = id; machineOpen = false; machineDraft = {name:"",maker:"",model:""}; error = ""; render(); return;
      }
      if (event.target.id !== "transplanterProfileForm") return;
      readDraft();
      if (draft.profileId && !profiles().some(row => row.profileId === draft.profileId)) { error = "編集中の設定は削除されています。新規入力へ切り替えてください。"; render(); return; }
      if (!state.saveTransplanterProfile(draft)) { error = "設定を保存できませんでした。入力は保持しています。"; render(); return; }
      cropYear = Number(draft.cropYear); machineId = draft.machineId; varietyId = draft.varietyId; draft = null; error = ""; render();
    });
  }
  R.screens = R.screens || {};
  R.screens.transplanterSettings = {render,bind,enter,settingsFields,readSettings,preserveOnDataChange:true};
})();
