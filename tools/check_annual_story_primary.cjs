"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:"block",hasTouch:width<600});
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date("2026-11-13T03:00:00Z"));
      await page.route("https://**/*",r=>r.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const field = await page.evaluate(()=>{
        const S=RiceOS.state, id=S.addField("開パ下（画面確認用）");
        const v=S.addVariety("天のつぶ"); S.updateField(id,{varietyId:v,areaA:33.75});
        const d=RiceOS.utils.clone(S.data());
        d.fieldWorks.push(...[
          ["plant","2026-05-14","田植え",{machine:"田植機"}],
          ["herbicide","2026-06-16","除草剤散布",{material:"登録済み資材"}],
          ["mow","2026-07-22","草刈り",{machine:"草刈り機"}],
          ["harvest","2026-09-12","稲刈り",{machine:"コンバイン",memo:"田面が乾き、作業しやすかった。"}]
        ].map(([key,date,workName,extra])=>({workId:`primary-${key}`,date,workName,fieldIds:[id],cropYear:2026,...extra})));
        d.growthLogs.push({logId:"primary-panicle",fieldId:id,date:"2026-07-20",cropYear:2026,panicleLengthMm:1,memo:"幼穂を確認。来年も同時期に見比べたい。"},
          {logId:"primary-heading",fieldId:id,date:"2026-07-27",cropYear:2026,headingObserved:true});
        assertFixture(S.replace(d,"Isolated primary UI fixture"));
        assertFixture(S.saveDryPeriod({dryPeriodId:"primary-dry",fieldId:id,cropYear:2026,date:"2026-06-25",startDate:"2026-06-25",actualEndDate:"2026-07-11"}));
        function assertFixture(ok){if(!ok)throw Error("Fixture rejected");}
        return id;
      });
      let baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      await page.locator('.nav-item[data-screen="annual"]:visible').click();
      await page.locator('#annualYear').selectOption('2026');
      await page.locator(`[data-annual-hub-open-field="${field}"]:visible`).click();
      const flow=page.locator('.annual-story');
      await flow.waitFor();
      assert.equal(await flow.locator('[data-annual-record-open-id="primary-mow"]').count(),0);
      assert.equal(await flow.locator('.annual-flow-milestone-art').count(),3);
      const artworkChecks=await flow.locator('.annual-flow-art').evaluateAll(nodes=>nodes.map(frame=>{
        const image=frame.querySelector('img'), open=frame.closest('.annual-year-flow-open');
        const bounds=frame.getBoundingClientRect(), copy=open.querySelector('.annual-flow-copy').getBoundingClientRect();
        const thermal=open.querySelector('.annual-flow-thermal')?.getBoundingClientRect();
        return {width:bounds.width,height:bounds.height,loaded:image.complete&&image.naturalWidth>0,
          copyClear:copy.right<=bounds.left+1,thermalClear:!thermal||thermal.top>=bounds.bottom-1};
      }));
      for(const art of artworkChecks){
        assert(art.loaded,'Botanical artwork loads');
        assert(art.width>=(width<=380?88:96)&&art.height>=(width<=380?104:112),'Botanical artwork remains enlarged');
        assert(art.copyClear&&art.thermalClear,'Artwork does not overlap text or thermal total');
      }
      const text=await flow.innerText(); assert.doesNotMatch(text,/undefined|NaN|Invalid Date|1030/);
      assert.match(text,/16日間/);
      assert.match(await flow.locator('.annual-flow-thermal').innerText(),/未取得/);
      assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline);
      await page.evaluate(fieldId=>{
        const S=RiceOS.state,d=RiceOS.utils.clone(S.data());
        d.fieldWorks.find(row=>row.workId==='primary-harvest').harvestSnapshots=[{
          fieldId,harvestDate:'2026-09-12',thermal:{total:1030,status:'一部欠測',count:40,expectedDays:47}
        }];
        if(!S.replace(d,'Isolated partial thermal fixture'))throw Error('Partial fixture rejected');
        RiceOS.screens.annual.render();
      },field);
      assert.match(await flow.locator('.annual-flow-thermal').innerText(),/保存済積算温度 1,030℃（一部取得）/);
      const thermalClear=await flow.locator('.annual-flow-thermal').evaluate(el=>el.getBoundingClientRect().top>=el.parentElement.querySelector('.annual-flow-art').getBoundingClientRect().bottom-1);
      assert(thermalClear,'Saved thermal value stays below enlarged artwork');
      baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      const panicle=flow.locator('.annual-year-flow-entry:has([data-annual-record-open-id="primary-panicle"])');
      await panicle.locator('[data-annual-flow-summary]').click();
      assert.match(await panicle.innerText(),/来年も同時期/);
      await panicle.locator('[data-annual-record-open-id="primary-panicle"]').click();
      await page.locator('.annual-record-detail').waitFor();
      await page.locator('[data-annual-record-detail-back]:visible').click();
      await flow.waitFor();
      await flow.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 78));
      await page.locator('#toast').waitFor({state:'hidden',timeout:10000});
      const file=path.join(os.tmpdir(),`rice-annual-story-primary-${width}.png`);
      await flow.screenshot({path:file}); console.log(file);
      await flow.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 78));
      await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-story-screen-${width}.png`)});
      if (width === 390) {
        await page.setViewportSize({width:390,height:1320});
        const harvest=flow.locator('.annual-year-flow-entry:has([data-annual-record-open-id="primary-harvest"])');
        await harvest.locator('[data-annual-flow-summary]').click();
        await flow.evaluate(el=>{for(let n=el;n;n=n.parentElement)n.scrollTop=0;window.scrollTo(0,0);});
        await page.screenshot({path:path.join(process.env.ANNUAL_STORY_REVIEW_DIR || os.tmpdir(),'annual-story-317-390.png')});
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline);
      console.log(`PASS primary annual story ${width}: actual milestone art, one water period, detail/back, memo and no writes`);
    } finally {await context.close();}
  }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
