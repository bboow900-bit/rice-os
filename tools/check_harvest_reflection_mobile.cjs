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
      await page.route("https://**/*",route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const f = await page.evaluate(() => {
        const S = RiceOS.state, v = S.varieties()[0].varietyId, over = S.addVariety("QA target exceeded"), legacy = S.addVariety("QA historic scope unknown");
        const a = S.addField("QA reflection A"), b = S.addField("QA reflection B");
        const d = RiceOS.utils.clone(S.data());
        Object.assign(d.fields.find(row => row.fieldId === a),{varietyId:v,areaA:6}); Object.assign(d.fields.find(row => row.fieldId === b),{varietyId:v,areaA:4});
        d.fieldWorks.push({workId:"qa-ref-plant",date:"2026-05-10",cropYear:2026,workName:"田植え",fieldIds:[a,b],memo:"QA planting"},{workId:"qa-ref-feed",date:"2026-06-01",cropYear:2026,workName:"追肥",fieldIds:[a],memo:"QA registered fertilizer"},{workId:"qa-ref-weed",date:"2026-06-03",cropYear:2026,workName:"除草",fieldIds:[b],memo:"QA weeds observed"});
        d.growthLogs.push({logId:"qa-ref-heading",fieldId:a,date:"2026-08-01",headingObserved:true,memo:"QA observed heading"});
        d.dryPeriods.push({dryPeriodId:"qa-ref-dry",fieldId:b,date:"2026-06-10",startDate:"2026-06-10",actualEndDate:"2026-06-20",status:"完了",memo:"QA recorded dry"});
        d.schedules.push({scheduleId:"qa-ref-plan",date:"2026-06-01",fieldIds:[a],title:"QA forecast must not be evidence",status:"予定"});
        if (!S.replace(d,"QA isolated reflection fixture")) throw Error("Fixture replace failed");
        const mill = (season,varietyId,kg,fieldIds=[]) => { const r = S.saveMillingRecord({date:`${season}-10-01`,season,varietyId,fieldIds,packages:[],looseKg:kg,memo:"QA quantity"}); if (!r) throw Error("Milling failed"); return r; };
        mill(2025,v,540,[a,b]); const current = mill(2026,v,600,[a,b]); mill(2026,over,660); mill(2024,legacy,300);
        if (!S.saveHarvestYearReview({season:2025,varietyId:v,areaMode:"manual",areaA:10,fieldIds:[a,b],completed:true,memo:"Prior evaluation",plans:{continue:"Prior continue",change:"Prior change",undecided:"Prior undecided"}})) throw Error("Prior review failed");
        if (!S.saveHarvestYearReview({season:2026,varietyId:over,areaMode:"manual",areaA:10,completed:true,memo:"Over target"})) throw Error("Over review failed");
        if (!S.saveHarvestYearReview({season:2024,varietyId:legacy,areaMode:"manual",areaA:10,completed:true,memo:"Legacy manual retained"})) throw Error("Legacy review failed");
        return {v,over,legacy,a,b,current};
      });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const card = id => page.locator(`[data-hp-variety="${id}"]`), form = id => page.locator(`[data-hp-form="${id}"]`);
      const openDetails = async el => { if (!await el.evaluate(node => node.open)) await el.locator(":scope > summary").click(); };
      const history = id => openDetails(card(id).locator('[data-hp-section="history"]'));
      const evaluation = id => openDetails(card(id).locator("[data-hp-review]"));
      const plans = id => openDetails(card(id).locator('[data-hp-section="plans"]'));
      const save = id => form(id).locator('button[type="submit"]').click();
      const review = () => page.evaluate(v => RiceOS.state.harvestYearReviewFor(2026,v),f.v);
      const fail = on => page.evaluate(on => {
        if (on) { window.qaReflectionSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === RiceOS.schema.STORE_KEY) throw Error("QA write failure"); return window.qaReflectionSetItem.call(this,key,value); }; }
        else { Storage.prototype.setItem = window.qaReflectionSetItem; delete window.qaReflectionSetItem; }
      },on);
      const shot = async name => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false); const file = path.join(os.tmpdir(),`rice-harvest-reflection-${name}-${width}.png`); await page.screenshot({path:file}); console.log(file); };
      const baseline = await raw();
      await page.locator('.nav-item[data-screen="annual"]:visible').click(); await page.locator("#annualYear").selectOption("2026"); await page.locator("[data-annual-harvest-performance]").click();
      await page.locator("#screen-harvest-performance.active").waitFor(); assert.equal(await raw(),baseline);
      assert.match(await card(f.v).locator(".hp-primary").innerText(),/10/); assert.match(await card(f.v).locator(".hp-goal").innerText(),/100%/); assert.match(await card(f.v).locator(".hp-goal").innerText(),/暫定/);
      assert.equal(await card(f.over).locator(".hp-goal").getAttribute("data-tier"),"exceeded"); assert.match(await card(f.over).locator(".hp-goal").innerText(),/110%.*目標超過/s);
      await shot("overview"); await history(f.v);
      assert.match(await card(f.v).locator(".hp-evidence-list").first().innerText(),/追肥/); assert.match(await card(f.v).locator(".hp-evidence-list").first().innerText(),/除草/);
      assert.equal(await page.locator('[data-hp-evidence-row="qa-ref-plan"]').count(),0);
      await history(f.over); await card(f.over).locator('[data-hp-evidence-row] [data-hp-source-index]').click();
      await page.locator("#screen-annual.active .annual-record-detail").waitFor(); assert.match(await page.locator(".annual-record-detail").innerText(),/品種集計（圃場指定なし）/);
      await page.locator("#appBackButton").click(); await page.locator("#screen-harvest-performance.active").waitFor(); assert.equal(await raw(),baseline);
      await card(f.v).locator('[data-hp-evidence-row="qa-ref-feed"] [data-hp-source-index]').click(); await page.locator("#screen-annual.active .annual-record-detail").waitFor();
      assert.match(await page.locator(".annual-record-detail").innerText(),/QA registered fertilizer/); await page.locator("[data-annual-record-detail-back]").click(); await page.locator("#screen-harvest-performance.active").waitFor(); assert.equal(await raw(),baseline);
      await history(f.v); await card(f.v).locator(`[data-hp-field="${f.a}"]`).click(); await page.locator("#screen-annual.active").waitFor(); assert.equal(await page.locator("#annualYear").inputValue(),"2026"); await page.locator("#appBackButton").click(); await page.locator("#screen-harvest-performance.active").waitFor(); assert.equal(await raw(),baseline);
      await history(f.v); await card(f.v).locator('[data-hp-trend-select="2025"]').click(); assert.equal(await page.locator("#hpYear").inputValue(),"2025"); assert.match(await card(f.v).locator(".hp-memo").innerText(),/Prior evaluation/);
      await history(f.v); await card(f.v).locator(`[data-hp-field="${f.a}"]`).click(); await page.locator("#screen-annual.active").waitFor(); assert.equal(await page.locator("#annualYear").inputValue(),"2025"); await page.locator("#appBackButton").click(); await page.locator("#screen-harvest-performance.active").waitFor(); assert.equal(await page.locator("#hpYear").inputValue(),"2025"); assert.equal(await raw(),baseline);
      await page.locator("#hpYear").selectOption("2024"); await history(f.legacy); assert.match(await card(f.legacy).innerText(),/原記録に対象圃場の登録がありません/);
      await page.locator("#hpYear").selectOption("2026"); await evaluation(f.v); assert.equal(await form(f.v).locator('[name="areaMode"]').inputValue(),"auto");
      await form(f.v).locator('[name="memo"]').fill("Cancelled evaluation"); await form(f.v).locator("[data-hp-cancel]").click(); assert.equal(await raw(),baseline);
      await evaluation(f.v); await form(f.v).locator('[name="memo"]').fill("Keep timing and compare records"); await form(f.v).locator('[name="conditions"]').fill("Registered season conditions");
      await form(f.v).locator('[data-hp-ref-id="qa-ref-feed"]').check(); await form(f.v).locator('[name="completed"]').check(); await plans(f.v);
      await form(f.v).locator('[name="plan_continue"]').fill("Continue recorded observation"); await form(f.v).locator('[name="plan_change"]').fill("Change one recorded step"); await form(f.v).locator('[name="plan_undecided"]').fill("Keep open question");
      await form(f.v).locator('[name="followUpOutcome"]').selectOption("uncertain"); await form(f.v).locator('[name="followUpMemo"]').fill("No causal conclusion");
      await fail(true); await save(f.v); assert.equal(await raw(),baseline); assert.equal(await form(f.v).locator('[name="memo"]').inputValue(),"Keep timing and compare records"); await fail(false); await save(f.v);
      const saved = await review(); assert.equal(saved.areaA,10); assert.equal(saved.areaSnapshot.length,2); assert.equal(saved.areaMode,"auto"); assert.equal(saved.evidenceRefs[0].id,"qa-ref-feed"); assert.equal(saved.followUpOutcome,"uncertain");
      assert.equal(await card(f.v).locator("[data-hp-status]").getAttribute("data-hp-status"),"complete");
      const afterSave = await raw(); await plans(f.v); await form(f.v).locator('[data-hp-send-category="continue"]').click(); assert.equal(await raw(),afterSave);
      accept = true; await form(f.v).locator('[data-hp-send-category="continue"]').click(); accept = false;
      const idea = await page.evaluate(() => RiceOS.state.nextSeasonIdeas().find(row => row.category === "continue" && row.text === "Continue recorded observation")); assert.ok(idea); assert.equal(idea.targetSeason,2027);
      accept = true; await form(f.v).locator('[data-hp-send-category="continue"]').click(); accept = false;
      assert.equal(await page.evaluate(id => RiceOS.state.nextSeasonIdeas().filter(row => row.ideaId === id).length,idea.ideaId),1);
      await form(f.v).scrollIntoViewIfNeeded(); await shot("reflection");
      const snapshot = JSON.stringify((await review()).areaSnapshot);
      await page.evaluate(id => RiceOS.state.updateField(id,{areaA:60}),f.a); await page.evaluate(() => RiceOS.screens.harvestPerformance.render());
      await evaluation(f.v); await form(f.v).locator('[name="memo"]').fill("Memo keeps saved area"); await save(f.v); assert.equal(JSON.stringify((await review()).areaSnapshot),snapshot);
      await page.evaluate(row => { RiceOS.state.saveMillingRecord({...row,looseKg:660}); RiceOS.screens.harvestPerformance.render(); },f.current);
      assert.equal(await card(f.v).locator("[data-hp-status]").getAttribute("data-hp-status"),"partial"); await evaluation(f.v); assert.equal(await form(f.v).locator('[name="completed"]').isChecked(),false);
      const beforeBack = await raw(); await page.locator("#appBackButton").click(); await page.locator("#screen-annual.active").waitFor(); assert.equal(await page.locator("#annualYear").inputValue(),"2026"); assert.equal(await page.locator("#screen-annual").evaluate(el => el.classList.contains("annual-detail-mode")),false);
      await page.locator("[data-annual-harvest-performance]").click(); assert.equal(await raw(),beforeBack); await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),beforeBack);
      const persisted = await review(); assert.equal(persisted.followUpOutcome,"uncertain"); assert.equal(persisted.followUpMemo,"No causal conclusion"); assert.equal(persisted.plans.continue,"Continue recorded observation");
      assert.deepEqual(errors,[]); console.log(`PASS harvest reflection ${width}`);
    } finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
