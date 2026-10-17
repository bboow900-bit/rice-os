"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390]) {
    const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
    try {
      const page = await context.newPage(), errors = []; let accept = false;
      page.on("pageerror",error => errors.push(error.message));
      page.on("dialog",dialog => accept ? dialog.accept() : dialog.dismiss());
      await page.route("https://**/*",route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const f = await page.evaluate(() => {
        const S = RiceOS.state, v = S.varieties()[0].varietyId, missing = S.addVariety("QA quantity missing"), partial = S.addVariety("QA area missing");
        const save = (year,kg,varietyId=v) => {
          const row = S.saveMillingRecord({date:`${year}-10-01`,season:year,varietyId,fieldIds:[],packages:[],looseKg:kg,memo:`QA ${year}`});
          if (!row) throw Error("Milling seed failed"); return row;
        };
        save(2022,600); save(2024,600); save(2025,900); const current = save(2026,1200); save(2026,60,partial);
        for (const year of [2022,2025,2026]) if (!S.saveHarvestYearReview({season:year,varietyId:v,areaA:100,completed:true,memo:`Review ${year}`,fieldIds:[]})) throw Error("Review seed failed");
        if (!S.saveHarvestYearReview({season:2026,varietyId:missing,areaA:20,completed:false,memo:"Missing quantity",fieldIds:[]})) throw Error("Missing seed failed");
        if (!S.saveResult({season:2026,varietyId:v,yield:"999999"})) throw Error("Old result seed failed");
        return {v,missing,partial,current};
      });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const card = id => page.locator(`[data-hp-variety="${id}"]`);
      const form = id => page.locator(`[data-hp-form="${id}"]`);
      const review = async id => { const el = card(id).locator("[data-hp-review]"); if (!await el.evaluate(node => node.open)) await el.locator(":scope > summary").click(); };
      const shot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false);
        const file = path.join(os.tmpdir(),`rice-harvest-performance-${name}-${width}.png`); await page.screenshot({path:file}); console.log(file);
      };
      const fail = on => page.evaluate(on => {
        if (on) { window.qaOriginalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === RiceOS.schema.STORE_KEY) throw Error("QA persistence failure"); return window.qaOriginalSetItem.call(this,key,value); }; }
        else { Storage.prototype.setItem = window.qaOriginalSetItem; delete window.qaOriginalSetItem; }
      },on);
      const baseline = await raw();
      await page.locator('.nav-item[data-screen="annual"]:visible').click(); await page.locator("#annualYear").selectOption("2026");
      await page.locator("[data-annual-harvest-performance]").click(); await page.locator("#screen-harvest-performance.active").waitFor();
      assert.equal(await page.locator("#hpYear").inputValue(),"2026");
      assert.match(await card(f.v).locator(".hp-primary").innerText(),/2/);
      assert.match(await card(f.v).locator(".hp-metrics").innerText(),/1,200kg/);
      assert.match(await card(f.v).locator(".hp-delta").innerText(),/\+0.5俵／10a/);
      assert.equal(await card(f.v).locator("[data-hp-trend-year]").count(),5);
      assert.equal(await card(f.v).locator('[data-hp-trend-year="2023"] .hp-trend-bar').count(),0);
      assert.equal(await card(f.v).locator('[data-hp-trend-year="2024"] .hp-trend-bar').count(),0);
      assert.match(await card(f.partial).innerText(),/面積未確認/);
      assert.match(await card(f.missing).innerText(),/数量未登録・未確認/);
      assert.equal(await raw(),baseline); await shot("overview");
      await page.locator("#hpYear").selectOption("2025"); await page.locator("#hpYear").selectOption("2026"); assert.equal(await raw(),baseline);
      await card(f.partial).locator("[data-hp-edit]").click(); await form(f.partial).locator('[name="areaA"]').fill("10");
      await form(f.partial).locator('[name="memo"]').fill("Unsaved area draft");
      await page.locator("#hpYear").selectOption("2025"); await page.locator("#hpYear").selectOption("2026");
      assert.equal(await form(f.partial).locator('[name="areaA"]').inputValue(),"10");
      await form(f.partial).locator("[data-hp-cancel]").click(); assert.equal(await raw(),baseline);
      await review(f.partial); await form(f.partial).locator('[name="areaA"]').fill("10");
      await form(f.partial).locator('[name="completed"]').check(); await form(f.partial).locator('[name="memo"]').fill("Explicit saved review");
      await fail(true); await form(f.partial).locator('button[type="submit"]').click();
      assert.equal(await raw(),baseline); assert.equal(await form(f.partial).locator('[name="areaA"]').inputValue(),"10");
      assert.match(await form(f.partial).locator("[role=alert]").innerText(),/保存できません/); await fail(false);
      await form(f.partial).locator('button[type="submit"]').click();
      assert.equal(await card(f.partial).locator("[data-hp-status]").getAttribute("data-hp-status"),"complete");
      const afterSave = await raw();
      await review(f.partial); await form(f.partial).locator("[data-hp-delete]").click(); assert.equal(await raw(),afterSave);
      await fail(true); accept = true; await form(f.partial).locator("[data-hp-delete]").click(); accept = false;
      assert.equal(await raw(),afterSave); assert.match(await form(f.partial).locator("[role=alert]").innerText(),/削除できません/); await fail(false);
      accept = true; await form(f.partial).locator("[data-hp-delete]").click(); accept = false;
      assert.equal(await page.evaluate(v => RiceOS.state.millingRecordsFor({season:2026,varietyId:v})[0].looseKg,f.partial),60);
      assert.match(await card(f.partial).innerText(),/面積未確認/);
      await review(f.v); assert.equal(await form(f.v).locator('[name="completed"]').isChecked(),true);
      await form(f.v).locator('[name="memo"]').fill("Review draft before milling memo edit");
      await page.evaluate(row => { if (!RiceOS.state.saveMillingRecord({...row,memo:"Milling memo only"})) throw Error("Memo edit failed"); RiceOS.screens.harvestPerformance.render(); },f.current);
      assert.equal(await form(f.v).locator('[name="completed"]').isChecked(),true);
      assert.equal(await form(f.v).locator('[name="memo"]').inputValue(),"Review draft before milling memo edit");
      await form(f.v).locator('button[type="submit"]').click();
      assert.equal(await card(f.v).locator("[data-hp-status]").getAttribute("data-hp-status"),"complete");
      await review(f.v); await form(f.v).locator('[name="memo"]').fill("Keep draft across quantity edit");
      await page.evaluate(row => { if (!RiceOS.state.saveMillingRecord({...row,looseKg:1260})) throw Error("Quantity edit failed"); RiceOS.screens.harvestPerformance.render(); },f.current);
      assert.equal(await card(f.v).locator("[data-hp-status]").getAttribute("data-hp-status"),"partial");
      const history = card(f.v).locator('[data-hp-section="history"]');
      if (!await history.evaluate(el => el.open)) await history.locator(":scope > summary").click();
      assert.match(await card(f.v).locator('[data-hp-trend-year="2026"]').innerText(),/途中/);
      assert.equal(await card(f.v).locator('[data-hp-trend-year="2026"] .hp-trend-partial').count(),1);
      assert.match(await card(f.v).locator(".hp-delta").innerText(),/比較対象なし/);
      await review(f.v); assert.equal(await form(f.v).locator('[name="completed"]').isChecked(),false);
      assert.equal(await form(f.v).locator('[name="memo"]').inputValue(),"Keep draft across quantity edit");
      await form(f.v).locator('[name="memo"]').fill("Memo must not reconfirm"); await form(f.v).locator('button[type="submit"]').click();
      assert.equal(await card(f.v).locator("[data-hp-status]").getAttribute("data-hp-status"),"partial");
      await review(f.v); await form(f.v).locator('[name="completed"]').check(); await form(f.v).locator('button[type="submit"]').click();
      assert.equal(await card(f.v).locator("[data-hp-status]").getAttribute("data-hp-status"),"complete");
      await card(f.v).scrollIntoViewIfNeeded(); await shot("quantity-changed");
      const beforeRoute = await raw();
      await card(f.missing).locator("[data-hp-quantity]").click(); await page.locator("#screen-results.active").waitFor();
      assert.equal(await page.locator("#millingSeason").inputValue(),"2026"); assert.equal(await page.locator("#millingVariety").inputValue(),f.missing);
      await page.locator("#millingMemo").fill("Keep quantity draft"); await page.locator("#appBackButton").click(); await page.locator("#screen-harvest-performance.active").waitFor();
      await card(f.v).locator("[data-hp-quantity]").click(); assert.equal(await page.locator("#screen-harvest-performance.active").count(),1);
      assert.equal(await raw(),beforeRoute);
      await page.locator("#appBackButton").click(); await page.locator("#screen-annual.active").waitFor(); assert.equal(await page.locator("#annualYear").inputValue(),"2026");
      await page.locator("[data-annual-harvest-performance]").click(); assert.equal(await raw(),beforeRoute);
      await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),beforeRoute); assert.deepEqual(errors,[]);
      console.log(`PASS harvest performance ${width}`);
    } finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
