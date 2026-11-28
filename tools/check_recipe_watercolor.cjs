"use strict";
const assert=require('node:assert/strict');
const {chromium,devices}=require('C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try {for(const width of process.argv[2] ? [Number(process.argv[2])] : [360,390,412,1280]) {
  const context=await browser.newContext({...(width===412?devices['Pixel 7']:{}),deviceScaleFactor:1,viewport:{width,height:1000},serviceWorkers:'block'});
  try {
   const page=await context.newPage(),errors=[];let approve=false;
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>approve?d.accept():d.dismiss());
   await page.route('https://**/*',r=>r.abort());await page.goto('http://127.0.0.1:4182/index.html',{waitUntil:'networkidle'});
   const id=await page.evaluate(()=>{
    const S=RiceOS.state,id=S.addVariety('天のつぶ');
    S.updateVariety(id,{panicleInitiationDaysAfterPlanting:'65',headingDaysAfterPlanting:'85',ripeningAccumulatedTempTarget:'1000',targetTillers:'20〜25本',topDressingDaysBeforeHeading:'20',topDressingName:'追肥肥料名がとても長い場合にも省略しない確認',hotWaterTemperatureC:60,hotWaterDurationMinutes:10,hotWaterBatchKg:5,soakingAccumulatedWaterTempMin:100,soakingAccumulatedWaterTempMax:120,transplanterSetting:'機械設定の長いメモを改行せず登録しても全文を読めることを確認します。',memo:'栽培メモの1行目\n2行目も保持。'});
    return id;
   });
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline=await raw();
   await page.locator('.nav-item[data-screen="data"]:visible').click();await page.locator('[data-jump-screen="recipes"]').click();
   await page.locator(`[data-recipe-open="${id}"]`).click();
   await page.locator('.recipe-detail').waitFor();
   assert.equal(await page.locator('#recipeList input').count(),0);
   assert.match(await page.locator('.recipe-growth-values').innerText(),/65/);assert.match(await page.locator('.recipe-growth-values').innerText(),/1,000/);
   const icons=await page.locator('.recipe-section > summary .recipe-watercolor').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
   assert.equal(icons.length,6);assert(icons.every(i=>i.w>=60&&i.h>=50));
   await page.screenshot({path:`C:/Users/Keisuke/AppData/Local/Temp/rice-recipe-detail-${width}.png`});
   await page.locator('.recipe-detail').screenshot({path:`C:/Users/Keisuke/AppData/Local/Temp/rice-recipe-detail-full-${width}.png`});
   if(width===390) {
    await page.setViewportSize({width,height:1400});
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:'C:/Users/Keisuke/AppData/Local/Temp/rice-recipe-overview-390.png'});
    await page.setViewportSize({width,height:1000});
   }
   await page.locator('.recipe-section,.recipe-subsection').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
   const clipped=await page.locator('.recipe-detail :is(h3,h4,h5,b,strong,small,dt,dd,p)').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&(n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+2)).map(n=>n.textContent));
   assert.deepEqual(clipped,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await raw(),baseline);
   await page.locator('[data-recipe-edit]').click();
   const heading=page.locator('[data-recipe-field="headingDaysAfterPlanting"]');await heading.fill('90');
   approve=true;await page.locator('[data-recipe-cancel]').click();approve=false;assert.equal(await raw(),baseline);
   await page.locator('[data-recipe-edit]').click();await heading.fill('90');await page.locator('[data-recipe-save]').click();
   assert.equal(await page.evaluate(id=>RiceOS.state.variety(id).headingDaysAfterPlanting,id),'90');
   await page.evaluate(id=>{RiceOS.state.updateVariety(id,{name:'非常に長い品種名称を登録しても文字を途中で省略しない確認',panicleInitiationDaysAfterPlanting:'',headingDaysAfterPlanting:0,ripeningAccumulatedTempTarget:''});RiceOS.screens.recipes.render();},id);
   assert.match(await page.locator('.recipe-growth-values').innerText(),/未登録/);assert.match(await page.locator('.recipe-growth-values').innerText(),/0/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#appBackButton').click();await page.locator(`[data-recipe-open="${id}"]`).waitFor();
   assert.deepEqual(errors,[]);console.log(`PASS recipe ${width}: art size, long text, all reference groups, draft/cancel/save, empty/zero and back`);
  } finally {await context.close();}
 }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
