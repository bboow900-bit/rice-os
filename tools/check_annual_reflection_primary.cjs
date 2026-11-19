"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:"block"});
  try{
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date("2026-11-17T03:00:00Z"));await page.route("https://**/*",r=>r.abort());
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const id=await page.evaluate(()=>{
    const S=RiceOS.state,id=S.addField("開パ 下（振り返りUI確認）"),v=S.addVariety("天のつぶ");S.updateField(id,{varietyId:v,areaA:20});
    const d=RiceOS.utils.clone(S.data());for(const year of [2025,2026]){
     d.fieldWorks.push({workId:`reflection-plant-${year}`,date:`${year}-05-14`,cropYear:year,workName:"田植え",fieldIds:[id]},
      {workId:`reflection-harvest-${year}`,date:`${year}-09-20`,cropYear:year,workName:"稲刈り",fieldIds:[id],harvestStatusByField:{[id]:"complete"}});
     d.growthLogs.push({logId:`reflection-panicle-${year}`,fieldId:id,date:`${year}-07-20`,cropYear:year,panicleLengthMm:1});
    }if(!S.replace(d,"Isolated annual reflection fixture"))throw Error("Fixture rejected");
    if(!S.saveSeasonNote({fieldId:id,season:2026,date:"2026-09-20",text:"畦際の残草を来年も見比べたい。"}))throw Error("Note rejected");
    if(!S.saveCarryoverNote({fieldId:id,season:2026,date:"2026-09-20",text:"今年の記録をもとに、来年は畦際の経過を残す。"}))throw Error("Carryover rejected");return id;
   });
   const baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
   await page.locator('.nav-item[data-screen="annual"]:visible').click();await page.locator('#annualYear').selectOption('2026');
   await page.locator('#toast').waitFor({state:'hidden',timeout:10000});
   const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-${name}-${width}.png`)});};
   await shot('hub');
   await page.locator('.annual-field-picker').scrollIntoViewIfNeeded();
   const card=page.locator('.annual-field-pick-card').filter({has:page.locator(`[data-annual-hub-open-field="${id}"]`)});
   const openBounds=await card.locator('.annual-field-pick-open').boundingBox(),statusBounds=await card.locator('.annual-status-badge').boundingBox();
   assert(openBounds&&statusBounds&&statusBounds.y>=openBounds.y+openBounds.height-1,'status stays below the field content');
   assert((await card.locator('.annual-field-plant').boundingBox()).width>=88,'rice illustration remains prominent');
   assert.equal(await card.locator('span.annual-status-badge').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(237, 245, 231)');
   await shot('fields');
   await card.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-card-${width}.png`)});
   await page.locator('[data-annual-hub-view="work"]').click();await shot('summary');
   await page.locator('[data-annual-hub-view="compare"]').click();await shot('compare-picker');
   await page.locator(`[data-annual-hub-compare-field="${id}"]`).click();await page.locator('[data-annual-compare-filter]').first().waitFor();await shot('compare');
   await page.locator('#appBackButton').click();await page.locator('[data-annual-hub-view="fields"]').click();await page.locator(`[data-annual-hub-open-field="${id}"]`).click();
   await page.locator('.annual-story').waitFor();await shot('field-overview');
   await page.locator('.harvest-recap').scrollIntoViewIfNeeded();await shot('harvest-recap');
   await page.locator('.annual-season-notes').scrollIntoViewIfNeeded();await shot('notes');
   assert.match(await page.locator('.annual-season-notes').innerText(),/畦際/);assert.match(await page.locator('.annual-carryover-notes').innerText(),/今年の記録/);
   const noteBounds=await page.locator('.annual-season-notes').boundingBox(),carryBounds=await page.locator('.annual-carryover-notes').boundingBox();assert(noteBounds&&carryBounds&&noteBounds.y+noteBounds.height<=carryBounds.y+1);
   assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline);assert.deepEqual(errors,[]);
   console.log(`PASS annual reflection ${width}: illustrated hub, summary, compare, notes/carryover, no overlap or storage writes`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
