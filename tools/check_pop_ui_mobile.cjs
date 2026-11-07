"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width < 600,hasTouch:width < 600,serviceWorkers:"block"});
    try {
      const page = await context.newPage(), errors = [];
      await page.clock.setFixedTime(new Date("2026-08-20T03:00:00Z"));
      page.on("pageerror",e => errors.push(e.message));
      await page.route("https://**/*",r => r.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const f = await page.evaluate(() => {
        const S = RiceOS.state, v = S.varieties()[0].varietyId, field = S.addField("QA pop rice field");
        const d = RiceOS.utils.clone(S.data());
        Object.assign(d.fields.find(x => x.fieldId === field),{areaA:10,varietyId:v});
        d.fieldWorks.push({workId:"qa-pop-work",date:"2025-10-01",cropYear:2025,workName:"稲刈り",fieldIds:[field],memo:"QA real harvest",harvestCompletionByField:{[field]:"complete"}});
        d.fieldWorks.push({workId:"qa-pop-plant",date:"2025-05-10",cropYear:2025,workName:"田植え",fieldIds:[field],memo:"QA real planting"});
        const growing = S.addField("山あいの用水路沿い・東側の長い名前の圃場");
        d.fields.push(RiceOS.utils.clone(S.field(growing)));
        Object.assign(d.fields.find(x => x.fieldId === growing),{areaA:12,varietyId:v});
        d.fieldWorks.push({workId:"qa-pop-growing",date:"2026-05-10",cropYear:2026,workName:"田植え",fieldIds:[growing]}, {workId:"qa-pop-today",date:"2026-08-20",cropYear:2026,workName:"見回り",fieldIds:[growing]});
        d.growthLogs.push({logId:"qa-pop-heading",date:"2026-08-01",fieldId:growing,headingObserved:true});
        d.irrigations.push({irrigationId:"qa-pop-water",fieldId:growing,startDate:"2026-08-10",date:"2026-08-10",method:"間断灌水",status:"実施中"});
        d.schedules.push({scheduleId:"qa-pop-overdue",date:"2026-08-19",title:"見回り",fieldIds:[growing],status:"予定"});
        if (!S.replace(d,"QA pop fixture")) throw Error("Fixture failed");
        if (!S.saveMillingRecord({date:"2025-10-02",season:2025,varietyId:v,fieldIds:[field],packages:[{kg:30,bags:22}],looseKg:""})) throw Error("Milling failed");
        if (!S.saveHarvestYearReview({season:2025,varietyId:v,areaMode:"manual",areaA:10,completed:true,memo:"QA real review"})) throw Error("Review failed");
        return {v,field};
      });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const baseline = await raw();
      const shot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,"Horizontal overflow");
        const file = path.join(os.tmpdir(),`rice-pop-ui-${name}-${width}.png`);
        await page.screenshot({path:file}); console.log(file);
      };
      const noOverlap = async (first,second) => {
        const a=await first.boundingBox(),b=await second.boundingBox();
        assert.ok(a && b);
        assert.equal(a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height,false,"Visible controls overlap");
      };
      const art = async () => {
        const img = page.locator(".screen.active .annual-pop-rice");
        await img.waitFor();
        await img.evaluate(el => el.decode());
        assert.equal(await img.evaluate(el => el.complete && el.naturalWidth > 0),true);
        assert.equal(await img.evaluate(el => {
          const c = document.createElement("canvas"); c.width=32;c.height=32;
          const ctx=c.getContext("2d");ctx.drawImage(el,0,0,32,32);
          const a=ctx.getImageData(0,0,32,32).data;
          return a.some((x,i) => i%4===3 && x>0);
        }),true,"Blank illustration");
        assert.equal(await img.evaluate(el => { const a=el.getBoundingClientRect(),b=el.previousElementSibling.getBoundingClientRect(); return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }),false,"Heading overlaps art");
      };
      await page.locator('.nav-item[data-screen="home"]:visible').click();
      const homeArt=page.locator(".home-pop-illustration");
      await homeArt.evaluate(el => el.decode());
      assert.equal(await homeArt.evaluate(el => {
        const c=document.createElement("canvas"); c.width=32;c.height=32;
        const ctx=c.getContext("2d");ctx.drawImage(el,0,0,32,32);
        return el.complete && el.naturalWidth>0 && ctx.getImageData(0,0,32,32).data.some((x,i) => i%4===3 && x>0);
      }),true);
      await noOverlap(homeArt,page.locator(".home-pop-header h1"));
      for (const key of ["candidate","overdue","today","water"]) assert.equal(await page.locator(`[data-home-summary-action="${key}"] b`).innerText(),"1",`Actual ${key} count`);
      await shot("home");
      await page.locator("[data-home-summary-action=today]").click();
      assert.equal(await raw(),baseline);
      await page.evaluate(() => RiceOS.bottomSheet.close());
      await page.locator("[data-home-quick-record]").click();
      await page.evaluate(() => RiceOS.bottomSheet.close());
      assert.equal(await raw(),baseline);
      await page.locator('[data-home-water-input]').first().click();
      await page.locator('#screen-irrigation.active').waitFor();
      await page.locator('#appBackButton').click();
      await page.locator('#screen-home.active').waitFor();
      assert.equal(await raw(),baseline,"Opening and cancelling water input must not alter saved records");
      await page.locator('.nav-item[data-screen="annual"]:visible').click();
      await page.locator("#annualYear").selectOption("2025"); await art(); await shot("annual");
      await page.locator(`[data-annual-hub-open-field="${f.field}"]`).click();
      await page.locator(".annual-detail-head").waitFor();
      await page.locator('[data-annual-tab="work"]').click();
      for (const label of ["田植え","稲刈り"]) assert.ok(await page.locator(".annual-archive-preview").filter({hasText:label}).count(),"Important work remains available in compact read-only previews");
      assert.equal(await page.locator(".annual-work-icon").count(),0,"Archive previews avoid repeated decorative icons");
      await shot("machines");
      await page.locator("#appBackButton").click(); await page.locator("[data-annual-harvest-performance]").click();
      await page.locator("#screen-harvest-performance.active").waitFor(); await art();
      await noOverlap(page.locator("#appBackButton"),page.locator(".app-header h1"));
      assert.match(await page.locator(".hp-pop-heading").innerText(),/2025年産の実り/);
      assert.match(await page.locator(".hp-goal-metric").innerText(),/110%/);
      await shot("performance");
      await page.evaluate(() => RiceOS.screens.harvestPerformance.open(1900));
      await page.locator(".hp-empty").waitFor(); assert.equal(await page.locator(".hp-goal").count(),0);
      await shot("empty"); assert.equal(await raw(),baseline);
      assert.deepEqual(errors,[]); console.log(`PASS pop UI ${width}`);
    } finally { await context.close(); }
  } } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
