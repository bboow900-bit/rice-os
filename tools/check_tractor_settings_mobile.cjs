"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try { for (const width of [360,390]) {
  const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  try {
   const page = await context.newPage(), errors = []; let accept = false;
   page.on("pageerror",error => errors.push(error.message)); page.on("dialog",dialog => accept ? dialog.accept() : dialog.dismiss());
   await page.route("https://**/*",route => route.abort()); await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const f = await page.evaluate(() => { const S = RiceOS.state, a = S.addField("QA tractor A"), b = S.addField("QA tractor B"), group = S.addFieldGroup("QA tractor group"); for (const id of [a,b]) S.updateField(id,{fieldGroupId:group}); return {a,b,group,date:RiceOS.utils.today(),year:RiceOS.utils.today().slice(0,4),machines:S.machines({includeRetired:true}).length}; });
   const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
   const profiles = () => page.evaluate(() => RiceOS.state.tractorProfilesFor({}));
   const master = async () => { await page.locator('.nav-item[data-screen="data"]:visible').click(); await page.locator('[data-jump-screen="tractor-settings"]').click(); await page.locator("#screen-tractor-settings.active").waitFor(); };
   const shot = async name => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false); const file = path.join(os.tmpdir(),`rice-tractor-settings-${name}-${width}.png`); await page.screenshot({path:file}); console.log(file); };
   const fail = on => page.evaluate(on => { if (on) { window.qaTractorSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === RiceOS.schema.STORE_KEY) throw Error("QA persistence failure"); return window.qaTractorSetItem.call(this,key,value); }; } else { Storage.prototype.setItem = window.qaTractorSetItem; delete window.qaTractorSetItem; } },on);
   const fillWorkMemo = async value => { const section = page.locator("#fwMemo").locator("xpath=ancestor::details[1]"); if (!await section.evaluate(el => el.open)) await section.locator(":scope > summary").click(); await page.locator("#fwMemo").fill(value); };
   await master(); assert.equal(await page.locator('.nav-item:visible').count(),6);
   await page.locator("[data-ts-add-machine]").click(); await page.locator('#tsMachineForm [name="name"]').fill("QA shared tractor"); await page.locator('#tsMachineForm [name="maker"]').fill("QA maker"); await page.locator('#tsMachineForm [name="model"]').fill("QA model");
   await page.locator('#tsMachineForm button[type="submit"]').click();
   const machineId = await page.locator("#tsMachine").inputValue(); assert.ok(machineId); assert.equal(await page.evaluate(() => RiceOS.state.machines({includeRetired:true}).length),f.machines+1);
   await page.locator("[data-ts-new]").click(); await page.locator('#tractorProfileForm [name="name"]').fill("QA standard autumn"); await page.locator("#ts-engineRpm").fill("1750"); await page.locator("#ts-mainGear").fill("2"); await page.locator("#ts-speedKmh").fill("1.8"); await page.locator("#ts-depthCm").fill("12");
   await page.locator("#tractorProfileForm .ts-details > summary").click(); await page.locator("#ts-attachmentModel").fill("QA rotary"); await page.locator('#tractorProfileForm [name="conditions"]').fill("Soil condition recorded"); await page.locator('#tractorProfileForm [name="memo"]').fill("No numeric recommendation");
   const beforeFailedProfile = await raw(); await fail(true); await page.locator('#tractorProfileForm button[type="submit"]').click(); assert.equal(await raw(),beforeFailedProfile); assert.equal(await page.locator("#ts-engineRpm").inputValue(),"1750"); await fail(false);
   await page.locator('#tractorProfileForm button[type="submit"]').click(); const first = (await profiles()).find(row => row.name === "QA standard autumn"); assert.ok(first); assert.equal(first.machineId,machineId);
   await page.locator(`[data-ts-copy="${first.profileId}"]`).click(); await page.locator('#tractorProfileForm [name="name"]').fill("QA wet autumn"); await page.locator("#ts-engineRpm").fill("1600"); await page.locator('#tractorProfileForm button[type="submit"]').click(); const copy = (await profiles()).find(row => row.name === "QA wet autumn"); assert.ok(copy); assert.notEqual(copy.profileId,first.profileId);
   await page.locator(`[data-ts-edit="${first.profileId}"]`).click(); await page.locator("#ts-engineRpm").fill("1850"); const beforeCancel = await raw(); await page.locator("[data-ts-cancel]").click(); assert.equal(await raw(),beforeCancel);
   await page.locator(`[data-ts-edit="${first.profileId}"]`).click(); await page.locator("#ts-engineRpm").fill("1850"); await page.locator('#tractorProfileForm button[type="submit"]').click();
   const beforeDelete = await raw(); await page.locator(`[data-ts-delete="${copy.profileId}"]`).click(); assert.equal(await raw(),beforeDelete); accept = true; await page.locator(`[data-ts-delete="${copy.profileId}"]`).click(); accept = false; assert.equal((await profiles()).length,1);
   await shot("master");
   await page.locator("#tsWorkType").selectOption("ridgePlastering"); await page.locator("[data-ts-new]").click(); assert.equal(await page.locator("#ts-ridgeHeightCm").count(),1); assert.equal(await page.locator("#ts-depthCm").count(),0); await page.locator("[data-ts-cancel]").click(); await page.locator("#tsWorkType").selectOption("puddling"); await page.locator("[data-ts-new]").click(); assert.equal(await page.locator("#ts-depthCm").count(),1); await page.locator("[data-ts-cancel]").click();
   await page.locator('.nav-item[data-screen="home"]:visible').click(); await page.locator("[data-home-quick-record]").click(); await page.locator('[data-sheet-add="work"]').click(); await page.locator("#sheetTargetMode").selectOption("group"); await page.locator("#sheetGroup").selectOption(f.group); await page.locator("#sheetOpenRecord").click(); await page.locator("#screen-field-work.active").waitFor();
   await page.locator("#fwName").selectOption("耕起"); await page.locator("#fwTractorProfile").selectOption(first.profileId);
   assert.equal(await page.locator("#fwTractor-engineRpm").inputValue(),"1850"); await page.locator("#fwTractor-engineRpm").fill("1800"); await fillWorkMemo("QA tractor snapshot group"); await page.locator("#fwTractorProfile").scrollIntoViewIfNeeded(); await shot("work");
   const beforeWorkFail = await raw(); await fail(true); await page.locator('#fieldWorkForm button[type="submit"]').click(); assert.equal(await raw(),beforeWorkFail); assert.equal(await page.locator("#fwTractor-engineRpm").inputValue(),"1800"); await fail(false); await page.locator('#fieldWorkForm button[type="submit"]').click();
   const work = await page.evaluate(() => RiceOS.state.data().fieldWorks.find(row => row.memo === "QA tractor snapshot group")); assert.ok(work); assert.deepEqual(work.fieldIds.slice().sort(),[f.a,f.b].sort()); assert.equal(work.machineId,machineId); assert.equal(work.tractorSettingsSnapshot.settings.engineRpm,1800);
   const snapshot = JSON.stringify(work.tractorSettingsSnapshot);
   await master(); await page.locator("#tsWorkType").selectOption("autumnTillage"); await page.locator(`[data-ts-edit="${first.profileId}"]`).click(); await page.locator("#ts-engineRpm").fill("2100"); await page.locator('#tractorProfileForm button[type="submit"]').click();
   assert.equal(await page.evaluate(id => RiceOS.state.data().fieldWorks.find(row => row.workId === id).tractorSettingsSnapshot.settings.engineRpm,work.workId),1800);
   const beforeDeleteFail = await raw(); await fail(true); accept = true; await page.locator(`[data-ts-delete="${first.profileId}"]`).click(); accept = false; assert.equal(await raw(),beforeDeleteFail); assert.match(await page.locator("#tsError").innerText(),/削除できません/); await fail(false);
   accept = true; await page.locator(`[data-ts-delete="${first.profileId}"]`).click(); accept = false; assert.equal((await profiles()).length,0);
   await page.locator('.nav-item[data-screen="annual"]:visible').click(); await page.locator("#annualYear").selectOption(f.year); await page.locator(`[data-annual-open-field="${f.a}"]`).click(); await page.locator(`[data-annual-record-open-kind="fieldWork"][data-annual-record-open-id="${work.workId}"]`).click();
   assert.match(await page.locator(".annual-record-detail").innerText(),/1800|1,800/); assert.equal((await page.locator(".annual-record-detail").innerText()).includes("2100"),false); await page.locator(".annual-record-detail-row").filter({hasText:"エンジン回転数"}).first().scrollIntoViewIfNeeded(); await shot("annual");
   await page.evaluate(id => { RiceOS.app.openInput("field-work","annual"); RiceOS.screens.fieldWork.editWork(id); },work.workId);
   assert.equal(await page.locator("#fwTractor-engineRpm").inputValue(),"1800"); assert.match(await page.locator("#fwTractorProfile option:checked").innerText(),/実績用の保存値/);
   const beforeEditCancel = await raw(); await page.locator("#fwTractor-engineRpm").fill("1900"); await page.locator('[data-action="reset-field-work"]').click(); assert.equal(await raw(),beforeEditCancel);
   await page.evaluate(id => RiceOS.screens.fieldWork.editWork(id),work.workId); await fillWorkMemo("QA historical memo edited"); await page.locator('#fieldWorkForm button[type="submit"]').click();
   const historical = await page.evaluate(id => RiceOS.state.data().fieldWorks.find(row => row.workId === id),work.workId); assert.equal(JSON.stringify(historical.tractorSettingsSnapshot),snapshot); assert.equal(historical.workId,work.workId);
   await page.evaluate(row => { if (!RiceOS.state.saveFieldWork({...row,workName:"秋起こし"})) throw Error("Legacy alias fixture failed"); },historical);
   const aliasEdit = page.locator(`[data-work-action="edit"][data-id="${work.workId}"]`); for (const section of await aliasEdit.locator("xpath=ancestor::details").all()) { if (!await section.evaluate(el => el.open)) await section.locator(":scope > summary").click(); } await aliasEdit.click(); assert.equal(await page.locator("#fwName").inputValue(),"秋起こし"); assert.equal(await page.locator("#fwTractor-engineRpm").inputValue(),"1800");
   await fillWorkMemo("Alias memo only"); await page.locator('#fieldWorkForm button[type="submit"]').click();
   const alias = await page.evaluate(id => RiceOS.state.data().fieldWorks.find(row => row.workId === id),work.workId); assert.equal(alias.workName,"秋起こし"); assert.equal(JSON.stringify(alias.tractorSettingsSnapshot),snapshot);
   const beforeReload = await raw(); await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),beforeReload); assert.deepEqual(errors,[]); console.log(`PASS tractor settings ${width}`);
  } finally { await context.close(); }
 }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
