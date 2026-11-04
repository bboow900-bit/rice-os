"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try { for (const width of [360,390]) {
  const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  try {
   const page = await context.newPage(), errors = [];
   page.on("pageerror",error => errors.push(error.message)); page.on("dialog",dialog => dialog.dismiss());
   await page.route("https://**/*",route => route.abort()); await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const f = await page.evaluate(() => {
    const S = RiceOS.state, U = RiceOS.utils;
    if (!S.workTimingFor) throw Error("Work timing core API not ready");
    const fieldId = S.addField("QA work timing field"), date = U.today(), planned = U.dateAddDays(date,-6), latest = U.dateAddDays(date,-3), year = Number(date.slice(0,4));
    const data = U.clone(S.data()); delete data.meta.weatherLocation;
    if (!S.replace(data,"QA isolated timing review")) throw Error("Fixture failed");
    if (!S.saveSchedule({scheduleId:"qa-review-source",date:planned,cropYear:year,fieldIds:[fieldId],title:"草刈り予定",memo:"Original source memo"})) throw Error("Schedule fixture failed");
    if (!S.saveSchedule({scheduleId:"qa-review-source",date:latest,cropYear:year,fieldIds:[fieldId],title:"草刈り予定",memo:"Rescheduled before actual"})) throw Error("Reschedule fixture failed");
    return {fieldId,date,planned,latest,year};
   });
   const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
   const workFor = id => page.evaluate(id => RiceOS.state.data().fieldWorks.find(row => row.workId === id),id);
   const openTiming = async () => { const details = page.locator("#fwTimingReview"); if (!await details.evaluate(node => node.open)) await details.locator(":scope > summary").click(); };
   const fillMemo = async text => { for (const details of await page.locator("#fwMemo").locator("xpath=ancestor::details").all()) if (!await details.evaluate(node => node.open)) await details.locator(":scope > summary").click(); await page.locator("#fwMemo").fill(text); };
   const save = () => page.locator('#fieldWorkForm button[type="submit"]').click();
   const action = async (id,kind) => { const button = page.locator(`[data-work-action="${kind}"][data-id="${id}"]`); for (const details of await button.locator("xpath=ancestor::details").all()) if (!await details.evaluate(node => node.open)) await details.locator(":scope > summary").click(); await button.click(); };
   const fail = on => page.evaluate(on => { if (on) { window.qaTimingSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === RiceOS.schema.STORE_KEY) throw Error("QA timing persistence failure"); return window.qaTimingSetItem.call(this,key,value); }; } else { Storage.prototype.setItem = window.qaTimingSetItem; delete window.qaTimingSetItem; } },on);
   const shot = async name => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false); const file = path.join(os.tmpdir(),`rice-work-timing-review-${name}-${width}.png`); await page.screenshot({path:file}); console.log(file); };
   const openSource = async () => {
    await page.locator('.nav-item[data-screen="calendar"]:visible').click(); await page.locator("#calendarTargetFilter").selectOption(`field:${f.fieldId}`); await page.evaluate(date => RiceOS.screens.calendar.focusDate(date),f.latest);
    await page.locator('[data-calendar-action="complete"][data-id="qa-review-source"]').click(); await page.locator("#screen-field-work.active").waitFor(); assert.equal(await page.locator("#fwTimingReview").evaluate(node => node.open),true,"Linked deviation should reveal the optional reason section"); await openTiming();
   };
   const baseline = await raw(); await openSource();
   await page.locator("#fwTimingReview > summary").click(); await page.evaluate(() => RiceOS.screens.fieldWork.render()); assert.equal(await page.locator("#fwTimingReview").evaluate(node => node.open),false,"Rendering must preserve a user-closed optional section"); await openTiming();
   assert.match(await page.locator("#fwTimingSummary").innerText(),new RegExp(f.planned)); assert.match(await page.locator("#fwTimingSummary").innerText(),/6日後/); assert.equal(await page.locator("#fwTimingPlannedDate").inputValue(),f.planned); assert.equal(await page.locator("#fwTimingPlannedDate").isEditable(),false);
   assert.match(await page.locator("#fwTimingSummary").innerText(),new RegExp(f.latest));
   await page.locator("#fwTimingReason").selectOption("rain"); await page.locator("#fwTimingMemo").fill("Cancelled weather reason"); await page.locator("#appBackButton").click(); assert.equal(await raw(),baseline);
   await openSource(); await page.locator("#fwTimingReason").selectOption("rain"); await page.locator("#fwTimingMemo").fill("Waited for rain to stop"); await fillMemo("QA planned work actual");
   await page.locator("#fwTimingReview").scrollIntoViewIfNeeded(); await shot("planned");
   await fail(true); await save(); assert.equal(await raw(),baseline); assert.equal(await page.locator("#fwTimingReason").inputValue(),"rain"); assert.equal(await page.locator("#fwTimingMemo").inputValue(),"Waited for rain to stop"); await fail(false); await save();
   const work = await page.evaluate(() => RiceOS.state.data().fieldWorks.find(row => row.memo === "QA planned work actual")); assert.ok(work); assert.equal(work.scheduleSnapshot.date,f.planned); assert.equal(work.scheduleSnapshot.scheduleId,"qa-review-source"); assert.equal(work.timingReview.reason,"rain"); const snapshot = JSON.stringify(work.scheduleSnapshot);
   assert.equal(await page.evaluate(row => RiceOS.state.workTimingFor(row).deltaDays,work),6);
   await page.evaluate(f => { RiceOS.state.saveSchedule({scheduleId:"qa-review-source",date:f.date,cropYear:f.year,fieldIds:[f.fieldId],title:"Changed plan"}); RiceOS.state.deleteSchedule("qa-review-source"); },f);
   const beforeEdit = await raw(); await page.evaluate(id => RiceOS.screens.fieldWork.editWork(id),work.workId); await openTiming(); assert.match(await page.locator("#fwTimingSummary").innerText(),new RegExp(f.planned)); assert.equal(await page.locator("#fwTimingReason").inputValue(),"rain");
   await page.locator("#fwTimingReason").selectOption("machine"); await page.locator("#fwTimingMemo").fill("Changed reason draft"); await page.evaluate(() => RiceOS.screens.fieldWork.render()); await openTiming(); assert.equal(await page.locator("#fwTimingReason").inputValue(),"machine"); assert.equal(await page.locator("#fwTimingMemo").inputValue(),"Changed reason draft");
   await page.locator('[data-action="reset-field-work"]').click(); assert.equal(await raw(),beforeEdit);
   await page.evaluate(id => RiceOS.screens.fieldWork.editWork(id),work.workId); await openTiming(); await page.locator("#fwTimingReason").selectOption("machine"); await page.locator("#fwTimingMemo").fill("Actual machine problem"); await save();
   const edited = await workFor(work.workId); assert.equal(JSON.stringify(edited.scheduleSnapshot),snapshot); assert.equal(edited.timingReview.reason,"machine");
   await page.evaluate(f => RiceOS.state.saveSchedule({scheduleId:"qa-duplicate-candidate",date:f.planned,cropYear:f.year,fieldIds:[f.fieldId],title:"草刈り"}),f);
   await action(work.workId,"duplicate"); await openTiming(); assert.equal(await page.locator("#fwTimingPlannedDate").inputValue(),""); assert.equal(await page.locator("#fwTimingReason").inputValue(),""); assert.equal(await page.locator("#fwTimingMemo").inputValue(),""); assert.equal((await page.locator("#fwTimingSummary").innerText()).includes(f.planned),false);
   await page.locator("#fwDate").fill(f.planned); await fillMemo("QA clean duplicate timing"); await save(); const duplicate = await page.evaluate(() => RiceOS.state.data().fieldWorks.find(row => row.memo === "QA clean duplicate timing")); assert.ok(duplicate); assert.notEqual(duplicate.workId,work.workId); assert.ok(!duplicate.scheduleSnapshot); assert.ok(!duplicate.sourceScheduleId); assert.ok(!duplicate.timingReview); assert.equal(await page.evaluate(row => RiceOS.state.workTimingFor(row).deltaDays,duplicate),null);
   await action(work.workId,"duplicate"); await openTiming(); await page.locator("#fwTimingPlannedDate").fill(f.planned); await page.locator("#fwTimingReason").selectOption("intentional"); await page.locator("#fwTimingMemo").fill("Explicit new intention"); await fillMemo("QA explicit duplicate timing"); await save();
   const explicit = await page.evaluate(() => RiceOS.state.data().fieldWorks.find(row => row.memo === "QA explicit duplicate timing")); assert.ok(explicit); assert.ok(!explicit.scheduleSnapshot); assert.equal(explicit.timingReview.plannedDate,f.planned); assert.equal(explicit.timingReview.reason,"intentional");
   await page.evaluate(id => RiceOS.screens.fieldWork.editWork(id),work.workId); await openTiming(); assert.equal(await page.locator("#fwTimingPlannedDate").isEditable(),false); assert.match(await page.locator("#fwTimingSummary").innerText(),/6日後/); assert.match(await page.locator("#fwTimingSummary").innerText(),new RegExp(f.planned)); await page.locator("#fwTimingReview").scrollIntoViewIfNeeded(); await shot("manual-override"); await save(); assert.equal(JSON.stringify((await workFor(work.workId)).scheduleSnapshot),snapshot);
   const beforeDetails = await raw(); await page.locator('.nav-item[data-screen="annual"]:visible').click(); await page.locator("#annualYear").selectOption(String(f.year)); await page.locator(`[data-annual-open-field="${f.fieldId}"]`).click(); await page.locator(`[data-annual-record-open-kind="fieldWork"][data-annual-record-open-id="${work.workId}"]`).click(); await page.locator(".annual-record-detail").waitFor();
   assert.match(await page.locator(".annual-record-detail").innerText(),new RegExp(f.planned)); assert.match(await page.locator(".annual-record-detail").innerText(),new RegExp(f.latest)); assert.match(await page.locator(".annual-record-detail").innerText(),/Actual machine problem/);
   await page.locator("[data-annual-record-detail-back]").click(); assert.equal(await raw(),beforeDetails);
   await page.evaluate(f => { const S = RiceOS.state; const row = {scheduleId:"qa-deleted-before-save",date:f.planned,cropYear:f.year,fieldIds:[f.fieldId],title:"草刈り予定"}; if (!S.saveSchedule(row)) throw Error("Deleted-source fixture failed"); RiceOS.app.openInput("field-work","annual"); RiceOS.screens.fieldWork.prefillSchedule(S.data().schedules.find(item => item.scheduleId === row.scheduleId)); S.deleteSchedule(row.scheduleId); },f);
   await openTiming(); assert.match(await page.locator("#fwTimingSummary").innerText(),new RegExp(f.planned)); await page.locator("#fwTimingReason").selectOption("surface"); await fillMemo("QA source deleted before actual save"); await save();
   const deletedSource = await page.evaluate(() => RiceOS.state.data().fieldWorks.find(row => row.memo === "QA source deleted before actual save")); assert.ok(deletedSource); assert.equal(deletedSource.scheduleSnapshot.scheduleId,"qa-deleted-before-save"); assert.equal(deletedSource.scheduleSnapshot.date,f.planned);
   const finalRaw = await raw(); await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),finalRaw); assert.equal(JSON.stringify((await workFor(work.workId)).scheduleSnapshot),snapshot); assert.deepEqual(errors,[]); console.log(`PASS work timing review ${width}`);
  } finally { await context.close(); }
 }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
