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
     d.growthLogs.push({logId:`reflection-heading-${year}`,fieldId:id,date:`${year}-07-${year===2026?27:30}`,cropYear:year,headingObserved:true});
    }
    d.fieldWorks.push({workId:"reflection-herbicide",date:"2026-06-16",cropYear:2026,workName:"除草剤",fieldIds:[id],material:"確認用粒剤"},
      {workId:"reflection-herbicide-2",date:"2026-06-18",cropYear:2026,workName:"除草剤",fieldIds:[id],material:"確認用粒剤"},
      {workId:"reflection-fertilizer",date:"2026-07-15",cropYear:2026,workName:"追肥",fieldIds:[id],material:"確認用肥料"});
    d.fieldWorks.push({workId:"reflection-sowing",date:"2026-04-16",cropYear:2026,workName:"播種",targetScope:"offField",fieldIds:[]});
    if(!S.replace(d,"Isolated annual reflection fixture"))throw Error("Fixture rejected");
    if(!S.saveSeasonNote({fieldId:id,season:2026,date:"2026-09-20",text:"畦際の残草を来年も見比べたい。"}))throw Error("Note rejected");
    if(!S.saveCarryoverNote({fieldId:id,season:2026,date:"2026-09-20",text:"今年の記録をもとに、来年は畦際の経過を残す。"}))throw Error("Carryover rejected");return id;
   });
   const baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
   await page.locator('.nav-item[data-screen="annual"]:visible').click();await page.locator('#annualYear').selectOption('2026');
   await page.locator('#toast').waitFor({state:'hidden',timeout:10000});
   const menuTarget=await page.locator('.annual-menu-button:visible').boundingBox();
   assert(menuTarget && menuTarget.width>=44 && menuTarget.height>=44,'Legacy CSS must not shrink the annual menu target');
   const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-${name}-${width}.png`)});};
   const headerMetrics=[];
   const checkHeader=async (panel,name)=>{
    const header=panel.locator('.annual-tab-art-head');
    await header.locator('img').evaluate(img=>img.decode());
    headerMetrics.push(await header.evaluate(el=>{
     const r=el.getBoundingClientRect(),title=el.querySelector('h3'),badge=el.querySelector('.annual-tab-year');
     const metric=node=>{const b=node.getBoundingClientRect(),s=getComputedStyle(node);return{x:b.x-r.x,y:b.y-r.y,h:b.height,size:s.fontSize,weight:s.fontWeight,family:s.fontFamily,line:s.lineHeight,color:s.color,border:s.border,background:s.backgroundColor};};
     const nav=document.querySelector('.annual-hub-nav').getBoundingClientRect();
     return{height:r.height,width:r.width,left:r.left,navGap:r.top-nav.bottom,title:metric(title),badge:metric(badge)};
    }));
    await header.screenshot({path:path.join(os.tmpdir(),`rice-unified-header-${name}-${width}.png`)});
   };
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
   const fieldsPanel=page.locator('.annual-field-picker');
   await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   await shot('overview');
   const harvestEntry=page.locator('.annual-v2-top > [data-annual-harvest-ledger]');
   assert.equal(await harvestEntry.evaluate(el=>[...el.parentElement.children].filter(child=>!child.matches('.annual-fab')&&!child.hidden&&getComputedStyle(child).display!=='none').at(-1)===el),true,'Harvest and shipments must be the last normal-flow entry');
   await harvestEntry.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
   assert.equal(await page.locator('#screen-annual .annual-fab').count(),0,'Reflection does not show a floating add button');
   await shot('harvest-entry-bottom');
   await harvestEntry.click();
   await page.locator('#screen-harvest-ledger.active').waitFor();
   await page.locator('#appBackButton').click();
   await page.locator('#screen-annual.active').waitFor();
   await checkHeader(fieldsPanel,'fields');
   await fieldsPanel.locator('.annual-fields-art-head img').evaluate(img=>img.decode());
   await fieldsPanel.screenshot({path:path.join(os.tmpdir(),`rice-annual-fields-panel-${width}.png`)});
   await page.locator('#annualSearch').fill('振り返りUI確認');
   assert.equal(await fieldsPanel.locator('.annual-field-card').count(),1);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'annualSearch');
   await page.locator('#annualSearch').fill('');
   const offField=page.locator('[data-annual-hub-panel="fields"] [data-annual-work-list]');
   await offField.locator('summary').click();
   assert.match(await offField.innerText(),/播種/);
   assert.equal(await offField.locator('[data-annual-record-open-id="reflection-herbicide"]').count(),0);
   await card.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-card-${width}.png`)});
   await page.locator('[data-annual-hub-view="work"]').click();await shot('summary');
   const workPanel=page.locator('[data-annual-hub-panel="work"]');
   await checkHeader(workPanel,'work');
   await workPanel.locator('.annual-work-heading img').evaluate(img=>img.decode());
   await workPanel.locator('.annual-work-heading').scrollIntoViewIfNeeded();await shot('work');
   assert.equal(await workPanel.locator('[data-annual-harvest-ledger]').count(),0);
   await workPanel.screenshot({path:path.join(os.tmpdir(),`rice-annual-work-panel-${width}.png`)});
   assert.equal(await workPanel.locator('[data-annual-work-list], .annual-hub-summary, .herbicide-review').count(),0);
   const materials=workPanel.locator('.annual-usage-group').filter({hasText:'確認用粒剤'});
   await materials.locator(':scope > summary').click();
   assert.match(await materials.innerText(),/使用2回/);
   await workPanel.screenshot({path:path.join(os.tmpdir(),`rice-annual-materials-expanded-${width}.png`)});
   await materials.locator('[data-annual-record-open-id="reflection-herbicide"]').click();
   await page.locator('.annual-record-detail').waitFor();
   await page.locator('[data-annual-record-detail-back]:visible').click();
   await workPanel.waitFor();
   assert.equal(await materials.getAttribute('open'),'');
   assert.equal(await page.evaluate(()=>document.activeElement?.dataset.annualRecordOpenId),'reflection-herbicide');
   await page.locator('[data-annual-hub-view="compare"]').click();await shot('compare-picker');
   await checkHeader(page.locator('.annual-hub-compare'),'compare');
   assert.deepEqual(headerMetrics[1],headerMetrics[0],'Fields and materials headers must share geometry and typography');
   assert.deepEqual(headerMetrics[2],headerMetrics[0],'Compare header must use the same geometry and typography');
   await page.locator(`[data-annual-hub-compare-field="${id}"]`).click();
   const compare=page.locator('.annual-compare-experience');
   assert.equal(await compare.locator('.annual-compare-highlight').count(),3);
   assert.match(await compare.locator('[data-tone="gold"]').innerText(),/前年と同じ/);
   assert.match(await compare.locator('[data-tone="green"]').innerText(),/前年より3日早い/);
   const compareAlignment=await compare.locator('.annual-compare-highlight').evaluateAll(rows=>rows.map(row=>{
    const cells=[...row.children].slice(1);
    return cells.map(cell=>{const year=cell.querySelector('span').getBoundingClientRect(),value=cell.querySelector('strong').getBoundingClientRect();return{yearTop:year.top,valueTop:value.top,valueHeight:value.height};});
   }));
   for(const cells of compareAlignment){
    assert(Math.abs(cells[0].yearTop-cells[1].yearTop)<1,'Comparison year labels must align');
    assert(Math.abs(cells[0].valueTop-cells[1].valueTop)<1,'Comparison values must align');
   }
   await compare.screenshot({path:path.join(os.tmpdir(),`rice-annual-compare-panel-${width}.png`)});
   await compare.locator('.annual-compare-experience-head').scrollIntoViewIfNeeded();await shot('compare');
   await compare.locator('.annual-compare-more > summary').click();
   await page.locator('[data-annual-compare-filter]').first().waitFor();
   const filterType = await page.locator('[data-annual-compare-filter]').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
   assert(filterType.every(size => size >= 12), 'Comparison filters must remain readable on phones');
   const recordDates = await compare.locator('.annual-compare-record:not(.empty) > span:first-child').evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
   assert(recordDates.length > 0, 'Comparison date check must cover real records');
   assert(recordDates.every(size => size >= 12), 'Comparison record dates must not regress to tiny text');
   await compare.locator('[data-annual-compare-filter="harvest"]').click();
   assert.equal(await compare.locator('.annual-compare-more').getAttribute('open'),'');
   await page.locator('#appBackButton').click();await page.locator('[data-annual-hub-view="fields"]').click();await page.locator(`[data-annual-hub-open-field="${id}"]`).click();
   await page.locator('.annual-story').waitFor();await shot('field-overview');
   await page.locator('.harvest-recap').scrollIntoViewIfNeeded();await shot('harvest-recap');
   assert.equal(await page.locator('.annual-compare-launch').count(),0);
   await page.locator('[data-annual-open-compare]').click();
   await page.locator('.annual-compare-experience').waitFor();
   assert.match(await page.locator('.annual-compare-memos').innerText(),/来年は畦際/);
   await page.locator('[data-annual-close-compare]').click();
   await page.locator('[data-annual-hub-panel="compare"]').waitFor();
   await page.locator('[data-annual-hub-view="fields"]').click();
   await page.locator(`[data-annual-hub-open-field="${id}"]`).click();
   assert.equal(await page.locator('#screen-annual .annual-fab').count(),0,'Field history does not show a floating add button');
   await page.locator('.annual-season-notes').scrollIntoViewIfNeeded();await shot('notes');
   assert.match(await page.locator('.annual-season-notes').innerText(),/畦際/);assert.match(await page.locator('.annual-carryover-notes').innerText(),/今年の記録/);
   const noteBounds=await page.locator('.annual-season-notes').boundingBox(),carryBounds=await page.locator('.annual-carryover-notes').boundingBox();assert(noteBounds&&carryBounds&&noteBounds.y+noteBounds.height<=carryBounds.y+1);
   assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline);assert.deepEqual(errors,[]);
   console.log(`PASS annual reflection ${width}: illustrated hub, summary, compare, notes/carryover, no overlap or storage writes`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
