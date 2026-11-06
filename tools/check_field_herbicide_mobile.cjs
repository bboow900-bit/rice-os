"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:"block"});
    try {
      const page = await context.newPage(), errors=[];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("https://**/*",r=>r.abort());
      await page.clock.setFixedTime(new Date("2026-08-20T03:00:00Z"));
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const ids = await page.evaluate(() => {
        const S=RiceOS.state,H=RiceOS.herbicide;
        const group=S.addFieldGroup("QA group"), one=S.addField("QA long field name for herbicide assignments"), two=S.addField("QA second field");
        S.updateField(one,{fieldGroupId:group}); S.updateField(two,{fieldGroupId:group});
        const p=H.saveProgram({name:"QA annual system",steps:[{category:"初中期一発剤",materialName:"QA material",plannedTiming:"田植え時",purpose:"試験"}]});
        H.assignProgram({year:2026,programId:p.programId,fieldGroupId:group});
        const old=H.saveProgram({name:"QA previous system",steps:[{category:"初期剤",materialName:"QA old material"}]});
        H.assignProgram({year:2025,programId:old.programId,fieldIds:[one]});
        RiceOS.app.show("fields"); return {one,two};
      });
      const raw = () => page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      const baseline=await raw();
      for(const id of [ids.one,ids.two]) assert.match(await page.locator(`[data-field-herbicide="${id}"]`).innerText(),/QA annual system/);
      await page.locator("[data-field-herbicide-year]").selectOption("2025");
      assert.match(await page.locator(`[data-field-herbicide="${ids.one}"]`).innerText(),/QA previous system/);
      assert.match(await page.locator(`[data-field-herbicide="${ids.two}"]`).innerText(),/未設定/);
      await page.locator(`[data-field-open="${ids.one}"]`).click();
      await page.locator("#screen-fields [data-field-herbicide-open]").click();
      await page.locator("#screen-herbicide.active").waitFor();
      await page.locator("#appBackButton").click();
      await page.locator("#screen-fields.active .field-hub-detail").waitFor();
      assert.match(await page.locator(".field-hub-detail-head h3").innerText(),/QA long field name/);
      assert.equal(await raw(),baseline,"Viewing and changing the display year must not mutate data");
      await page.evaluate(()=>RiceOS.app.show("field-work"));
      const arrows=await page.evaluate(()=>{
        const outer=document.createElement("details");outer.className="form-section";outer.open=true;
        outer.innerHTML='<summary>outer</summary><details id="qaNested"><summary>inner</summary>body</details>';
        document.getElementById("screen-field-work").append(outer);
        const content=getComputedStyle(outer.querySelector("#qaNested > summary"),"::before").content;
        outer.remove();return content;
      });
      assert.ok(!arrows.includes("▼"),"A closed nested disclosure must not inherit the outer arrow");
      await page.evaluate(()=>RiceOS.app.show("fields"));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(os.tmpdir(),`rice-field-herbicide-${width}.png`)});
      assert.deepEqual(errors,[]); console.log(`PASS field herbicide ${width}: group, year, missing, route, arrows, no writes`);
    } finally { await context.close(); }
  }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
