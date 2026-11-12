"use strict";
const assert = require("node:assert/strict"), os = require("node:os"), path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390]) {
    const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
    const page = await context.newPage(), errors = []; let approve = false, stage = "fixture";
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.type() === "alert" || approve ? d.accept() : d.dismiss());
    const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
    const show = screen => page.evaluate(screen => RiceOS.app.show(screen), screen);
    const submit = id => page.locator(`#${id} [type="submit"]`).click();
    const reveal = async selector => {
      const ancestors = page.locator(selector).locator("xpath=ancestor::details");
      for (let i=0;i<await ancestors.count();i++) if (await ancestors.nth(i).getAttribute("open") === null) await ancestors.nth(i).locator(":scope > summary").click();
      await page.locator(selector).waitFor({state:"visible"});
    };
    const shot = async name => {
      await page.locator("#toast").waitFor({state:"hidden",timeout:10000});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
      const file = path.join(os.tmpdir(),`rice-cultivation-independent-${name}-${width}.png`);
      await page.screenshot({path:file,fullPage:true}); console.log(file);
    };
    const fail = on => page.evaluate(on => {
      if (on) { window.qaCultSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if (k === RiceOS.schema.STORE_KEY) throw Error("QA write failure"); return window.qaCultSet.call(this,k,v); }; }
      else { Storage.prototype.setItem = window.qaCultSet; delete window.qaCultSet; }
    },on);
    try {
      await page.clock.setFixedTime(new Date("2026-07-10T03:00:00Z"));
      await page.route("https://**/*",r=>r.abort());
      await page.goto(process.env.CULTIVATION_URL || "http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const ids = await page.evaluate(() => {
        const S=RiceOS.state,v=S.addVariety("QA independent cultivation"),f=S.addField("QA independent field");
        S.updateField(f,{varietyId:v}); S.updateVariety(v,{panicleInitiationDaysAfterPlanting:"60",headingDaysAfterPlanting:"85"});
        const d=RiceOS.utils.clone(S.data());
        d.fieldWorks.push({workId:"qa-independent-plant",date:"2026-05-01",workName:"田植え",fieldIds:[f]}, {workId:"qa-independent-oldplant",date:"2025-05-01",workName:"田植え",fieldIds:[f]});
        d.growthLogs.push({logId:"qa-independent-oldheading",date:"2025-07-25",fieldId:f,headingObserved:true,varietyId:v,varietyProfile:"QA independent cultivation"});
        if (!S.replace(d,"Independent fixture")) throw Error("Fixture failed"); return {v,f};
      });
      const variety = () => page.evaluate(v=>RiceOS.state.variety(v),ids.v);
      const seedWork = () => page.evaluate(() => RiceOS.state.data().fieldWorks.find(w=>w.memo === "QA independent seed"));
      const field = key => page.locator(`[data-recipe-field="${key}"]`);
      const openRecipe = async () => { await show("recipes"); if (await page.locator(`[data-recipe-open="${ids.v}"]`).count()) await page.locator(`[data-recipe-open="${ids.v}"]`).click(); };
      const cancel = async () => { approve=true; await page.locator("[data-recipe-cancel]").click(); approve=false; };

      stage="new growth provenance";
      await page.evaluate(f=>{RiceOS.app.openInput("growth","home");RiceOS.screens.growth.prefillDate("2026-07-10",f);},ids.f);
      await page.locator('[data-growth-mode-select="detail"]').click();
      await reveal("#gPanicleLengthMm"); await page.locator("#gPanicleLengthMm").fill("1.5"); await submit("growthForm");
      const log = await page.evaluate(f=>RiceOS.state.data().growthLogs.find(g=>g.fieldId===f && g.date==="2026-07-10"),ids.f);
      assert.ok(log,"UI saves a new measurement"); assert.equal(log.varietyId,ids.v); assert.equal(log.varietyProfile,"QA independent cultivation");
      await shot("growth");

      stage="master cancel and failed save";
      await openRecipe(); let before=await raw(); const original=await variety();
      await page.locator("[data-recipe-edit]").click(); await reveal('[data-recipe-field="headingDaysAfterPlanting"]'); await field("headingDaysAfterPlanting").fill("95");
      await page.locator("#appBackButton").click(); assert.equal(await field("headingDaysAfterPlanting").inputValue(),"95"); assert.equal(await raw(),before);
      await cancel(); assert.equal(await raw(),before);
      await page.locator("[data-recipe-edit]").click(); await reveal('[data-recipe-field="headingDaysAfterPlanting"]'); await field("headingDaysAfterPlanting").fill("96");
      await fail(true); await page.locator("[data-recipe-save]").click();
      assert.equal(await raw(),before); assert.equal(await field("headingDaysAfterPlanting").inputValue(),"96"); assert.deepEqual(await variety(),original);
      await shot("master-failure"); await fail(false); await cancel();

      stage="history adoption draft and cancel";
      await page.locator('[data-recipe-adopt="headingDaysAfterPlanting"]').click();
      assert.equal(await field("headingDaysAfterPlanting").inputValue(),"85"); assert.equal(await raw(),before);
      await shot("history-draft"); await cancel(); assert.equal(await raw(),before);

      stage="optional seed UI save";
      await page.evaluate(f=>{RiceOS.app.openInput("field-work","recipes");RiceOS.screens.fieldWork.prefillFields("2026-07-10",[f]);},ids.f);
      await page.locator("#fwTargetScope").selectOption("offField");
      await page.locator("#fwName").selectOption("温湯殺菌");
      await page.locator('[data-work-mode-select="detail"]').click();
      await reveal("#fwSeedVariety"); assert.equal(await page.locator("#fwSeedVariety").inputValue(),"");
      await page.locator("#fwSeedVariety").selectOption(ids.v);
      await page.locator("#fwSeed_actualWaterTemperatureC").fill("59.5"); await page.locator("#fwSeed_actualBatchKg").fill("4");
      await page.locator("#fwSeed_startAt").fill("2026-07-10T09:00"); await page.locator("#fwSeed_endAt").fill("2026-07-10T09:10");
      await page.locator("#fwSeed_budState").fill("QA observed state"); await page.locator("#fwSeed_memo").fill("QA seed details");
      await reveal("#fwMemo"); await page.locator("#fwMemo").fill("QA independent seed");
      await shot("seed-form"); await submit("fieldWorkForm");
      const saved=await seedWork(); assert.ok(saved?.seedPreparation); assert.equal(saved.seedPreparation.actualBatchKg,"4");
      const seed= saved.seedPreparation;
      const editSeed = async () => {
        await show("field-work"); const action=page.locator(`[data-work-action="edit"][data-id="${saved.workId}"]`);
        const menu=action.locator("xpath=ancestor::details"); if(await menu.getAttribute("open")===null)await menu.locator(":scope > summary").click(); await action.click();
      };

      stage="master edit and seed snapshot preservation";
      await openRecipe(); await page.locator("[data-recipe-edit]").click(); await reveal('[data-recipe-field="hotWaterTemperatureC"]'); await field("hotWaterTemperatureC").fill("61");
      await page.locator("[data-recipe-save]").click(); assert.equal((await variety()).hotWaterTemperatureC,"61");
      await editSeed(); await reveal("#fwMemo"); await page.locator("#fwMemo").fill("QA independent seed");
      await submit("fieldWorkForm"); assert.deepEqual((await seedWork()).seedPreparation,seed);
      await editSeed(); await reveal("#fwSeedVariety"); await shot("seed-edit");
      assert.equal(await page.locator("#fwSeed_actualWaterTemperatureC").inputValue(),"59.5");

      stage="seed adoption cancel";
      before=await raw(); const masterBefore=await variety(); await page.locator("#fwSeedReference").click();
      await reveal('[data-recipe-field="hotWaterTemperatureC"]'); assert.equal(await field("hotWaterTemperatureC").inputValue(),"59.5");
      assert.equal(await raw(),before); await shot("seed-adoption"); await cancel(); assert.equal(await raw(),before); assert.deepEqual(await variety(),masterBefore);
      const finalSeed=(await seedWork()).seedPreparation; await page.reload({waitUntil:"networkidle"}); assert.deepEqual((await seedWork()).seedPreparation,finalSeed);
      assert.deepEqual(errors,[]);console.log(`PASS cultivation independent ${width}: growth provenance, master cancel/failure, history draft/cancel, seed UI/snapshot/adoption cancel/reload`);
    } catch(e) {console.error(`FAIL cultivation independent ${width} at ${stage}`);await page.screenshot({path:path.join(os.tmpdir(),`rice-cultivation-independent-failure-${width}.png`),fullPage:true}).catch(()=>{});throw e;}
    finally {await context.close();}
  }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
