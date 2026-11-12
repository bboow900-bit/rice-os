"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    for (const width of [360,390,1280]) {
      const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:"block"});
      const page = await context.newPage(), errors=[];
      page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
      await page.route("https://**/*",r=>r.abort());
      await page.clock.setFixedTime(new Date("2026-07-10T12:00:00+09:00"));
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const ids = await page.evaluate(()=>{
        const S=RiceOS.state,v=S.addVariety("QA 平均設定"),f=S.addField("QA 目安圃場");
        S.updateField(f,{varietyId:v});S.updateVariety(v,{panicleInitiationDaysAfterPlanting:"60",headingDaysAfterPlanting:"85",topDressingDaysBeforeHeading:"18"});
        const data=RiceOS.utils.clone(S.data());
        data.fieldWorks.push({workId:"qa-cult-plant",date:"2026-05-14",workName:"田植え",fieldIds:[f],cropYear:2026});
        data.fieldWorks.push({workId:"qa-cult-oldplant",date:"2025-05-14",workName:"田植え",fieldIds:[f],cropYear:2025});
        data.growthLogs.push({logId:"qa-cult-oldheading",fieldId:f,date:"2025-08-07",headingObserved:true,varietyId:v,varietyProfile:"QA 平均設定"});
        if(!S.replace(data,"QA cultivation fixture"))throw Error("Fixture failed");
        RiceOS.app.show("recipes");return{v,f};
      });
      const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      const model=()=>page.evaluate(f=>RiceOS.cultivation.forField(f,"2026-07-10"),ids.f);
      const original=await model(), before=await raw();
      await page.locator(`[data-recipe-open="${ids.v}"]`).click();
      assert.equal(await page.locator("#recipeList input").count(),0);
      assert.match(await page.locator("#recipeList").innerText(),/これまでの実績/);
      await page.locator("[data-recipe-edit]").click();
      for(const key of ["initialHerbicide","midHerbicide","panicleAccumulatedTempTarget","headingAccumulatedTempTarget","harvestDaysAfterHeadingMin"])
        assert.equal(await page.locator(`[data-recipe-field="${key}"]`).count(),0);
      const heading=page.locator('[data-recipe-field="headingDaysAfterPlanting"]');
      if(await heading.locator("xpath=ancestor::details").getAttribute("open") === null) await heading.locator("xpath=ancestor::details/summary").click();
      await heading.fill("95");assert.equal(await raw(),before,"Draft does not save");
      await page.locator("[data-recipe-cancel]").click();assert.equal(await raw(),before,"Cancel preserves data");
      await page.locator("[data-recipe-edit]").click();
      if(await heading.locator("xpath=ancestor::details").getAttribute("open") === null) await heading.locator("xpath=ancestor::details/summary").click();
      await heading.fill("20");await page.locator("[data-recipe-save]").click();
      assert.ok(await page.locator("#recipeValidationError").innerText());assert.equal(await raw(),before,"Invalid settings do not save");
      await heading.fill("95");await page.locator("[data-recipe-save]").click();
      const changed=await model();assert.notEqual(changed.heading.date,original.heading.date,"Master changes current forecast");
      assert.equal(changed.history.heading.rows[0].date,"2025-08-07","Historical observation unchanged");
      assert.equal(await page.locator("#recipeList input").count(),0);
      await page.locator("#toast").waitFor({state:"hidden",timeout:10000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const shot=path.join(os.tmpdir(),`rice-cultivation-primary-${width}.png`);
      await page.screenshot({path:shot,fullPage:true});console.log(shot);
      await page.evaluate(()=>RiceOS.app.show("home"));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(os.tmpdir(),`rice-cultivation-home-${width}.png`),fullPage:true});
      await page.evaluate(()=>RiceOS.app.show("outlook"));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(os.tmpdir(),`rice-cultivation-outlook-${width}.png`),fullPage:true});
      assert.deepEqual(errors,[]);console.log(`PASS cultivation primary ${width}`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
