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
    }
    d.fieldWorks.push({workId:"reflection-herbicide",date:"2026-06-16",cropYear:2026,workName:"除草剤",fieldIds:[id],material:"確認用粒剤"});
    d.fieldWorks.push({workId:"reflection-sowing",date:"2026-04-16",cropYear:2026,workName:"播種",targetScope:"offField",fieldIds:[]});
    if(!S.replace(d,"Isolated annual reflection fixture"))throw Error("Fixture rejected");
    if(!S.saveSeasonNote({fieldId:id,season:2026,date:"2026-09-20",text:"畦際の残草を来年も見比べたい。"}))throw Error("Note rejected");
    if(!S.saveCarryoverNote({fieldId:id,season:2026,date:"2026-09-20",text:"今年の記録をもとに、来年は畦際の経過を残す。"}))throw Error("Carryover rejected");return id;
   });
   const baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
   await page.locator('.nav-item[data-screen="annual"]:visible').click();await page.locator('#annualYear').selectOption('2026');
   await page.locator('#toast').waitFor({state:'hidden',timeout:10000});
   const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-${name}-${width}.png`)});};
   await shot('hub');
   await page.locator('.annual-field-picker').scrollIntoViewIfNeeded();
   const card=page.locator('.annual-field-card').filter({has:page.locator(`[data-annual-hub-open-field="${id}"]`)});
   assert.equal(await card.getAttribute('data-tone'),'gold');
   const harvestLabel=card.locator('.annual-field-card-harvest[data-harvest-status="complete"]');
   assert.equal(await harvestLabel.innerText(),'収穫済み');
   assert((await harvestLabel.boundingBox()).y>=(await card.locator('.annual-field-card-art').boundingBox()).y+(await card.locator('.annual-field-card-art').boundingBox()).height);
   assert.doesNotMatch(await card.innerText(),/最終更新|作業.*件|天のつぶ/);
   assert((await card.locator('.annual-field-card-art').boundingBox()).width>=88);
   await shot('fields');
   const offField=page.locator('[data-annual-hub-panel="fields"] [data-annual-work-list]');
   await offField.locator('summary').click();
   assert.match(await offField.innerText(),/播種/);
   assert.equal(await offField.locator('[data-annual-record-open-id="reflection-herbicide"]').count(),0);
   await card.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-card-${width}.png`)});
   await page.locator('[data-annual-hub-view="work"]').click();await shot('summary');
   const workPanel=page.locator('[data-annual-hub-panel="work"]');
   await workPanel.locator('.annual-work-heading img').evaluate(img=>img.decode());
   await workPanel.locator('.annual-work-heading').scrollIntoViewIfNeeded();await shot('work');
   assert.equal(await workPanel.locator('[data-annual-harvest-ledger]').count(),0);
   await workPanel.screenshot({path:path.join(os.tmpdir(),`rice-annual-work-panel-${width}.png`)});
   assert.equal(await workPanel.locator('[data-annual-work-list], .annual-hub-summary, .herbicide-review').count(),0);
   const materials=workPanel.locator('details.annual-used-materials:not(.herbicide-review)').first();
   await materials.locator(':scope > summary').click();
   assert.match(await materials.innerText(),/確認用粒剤/);
   await materials.locator('details > summary').first().click();
   await materials.locator('[data-annual-record-open-id="reflection-herbicide"]').click();
   await page.locator('.annual-record-detail').waitFor();
   await page.locator('[data-annual-record-detail-back]:visible').click();
   await workPanel.waitFor();
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
