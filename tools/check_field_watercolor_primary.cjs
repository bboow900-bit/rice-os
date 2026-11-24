"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const legacyCardCss=fs.readFileSync(path.join(__dirname,'../assets/css/app.css'),'utf8');
assert(!legacyCardCss.includes('.field-hub-card-photo'),'Removed photo-card CSS must not return');
assert(!legacyCardCss.includes('.field-hub-stage'),'Removed legacy stage CSS must not return');
assert(!fs.readFileSync(path.join(__dirname,'../assets/css/field-herbicide.css'),'utf8').includes('.field-hub-card-current'),'Obsolete current-stage styles must not return');
const {chromium}=require('C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{for(const width of [360,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-08-03T03:00:00Z'));await page.route('https://**/*',r=>r.abort());
   await page.goto('http://127.0.0.1:4182/index.html',{waitUntil:'networkidle'});
   const ids=await page.evaluate(()=>{
    const S=RiceOS.state,v=S.varieties()[0].varietyId;
    const ids=['開パ 下','亀石 右下（長い圃場名でも文字を省略しない）','収穫を終えた田んぼ','今年の記録がない田んぼ'].map(name=>S.addField(name));
    const d=RiceOS.utils.clone(S.data());d.fields=d.fields.filter(f=>ids.includes(f.fieldId));
    d.fields.forEach(f=>Object.assign(f,{areaA:20,varietyId:v}));
    d.fields.find(f=>f.fieldId===ids[3]).status='休耕';
    d.fieldWorks=ids.slice(0,3).map((id,i)=>({workId:'wc-plant-'+i,fieldIds:[id],date:'2026-05-14',workName:'田植え',cropYear:2026}));
    d.growthLogs=[{logId:'wc-heading',fieldId:ids[0],date:'2026-07-27',headingObserved:true,cropYear:2026},{logId:'wc-panicle',fieldId:ids[1],date:'2026-07-25',panicleLengthMm:1,cropYear:2026},{logId:'wc-harvest-heading',fieldId:ids[2],date:'2026-06-01',headingObserved:true,cropYear:2026}];
    d.fieldWorks.push({workId:'wc-harvest',fieldIds:[ids[2]],date:'2026-07-25',workName:'稲刈り',cropYear:2026,harvestStatusByField:{[ids[2]]:'complete'}});
    d.irrigations=[{irrigationId:'wc-water',fieldId:ids[0],date:'2026-07-28',startDate:'2026-07-28',method:'間断灌水',status:'実施中',cropYear:2026,waterMovements:[{movementId:'wc-wait',phase:'wait',startDate:'2026-08-01'}]}];
    d.irrigations.push({irrigationId:'wc-overlap-a',fieldId:ids[1],date:'2026-07-28',startDate:'2026-07-28',method:'間断灌水',status:'実施中',cropYear:2026,waterMovements:[{movementId:'wc-overlap-wait',phase:'wait',startDate:'2026-08-01'}]}, {irrigationId:'wc-overlap-b',fieldId:ids[1],date:'2026-07-29',startDate:'2026-07-29',method:'深水管理',status:'実施中',cropYear:2026});
    S.replace(d,'Isolated watercolor field fixture');
    RiceOS.weather.ensureLocation=async()=>({latitude:37.5,longitude:140.5});
    RiceOS.weather.fetchDailyRange=async(start,end)=>{const rows=[];for(let date=start;date<=end;date=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10))rows.push({date,tempMean:28,source:'archive'});return{rows};};
    return ids;
   });
   const saved=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
   await page.locator('.nav-item[data-screen="fields"]:visible').click();
   const card=id=>page.locator('[data-field-open="'+id+'"]');
   await card(ids[0]).waitFor();
   await page.waitForFunction(id=>document.querySelector('[data-field-open="'+id+'"] .field-wc-number'),ids[0]);
   assert((await page.locator('.field-wc').count())>=4);
   const first=card(ids[0]);assert.equal(await first.locator('.field-wc-row').count(),4);
   assert((await first.boundingBox()).height<=350,'Normal field card must retain the approved compact height');
   const labelBoxes=await first.locator('.field-wc-label').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{w:r.width,h:r.height,padding:s.padding,align:s.alignItems};}));
   assert(labelBoxes.every(r=>JSON.stringify(r)===JSON.stringify(labelBoxes[0])),'Fact labels must have identical size and alignment');
   assert.match(await first.locator('.field-wc-water').innerText(),/入水待ち/);
   assert.match(await first.locator('.field-wc-water').innerText(),/3日目/);
   assert.match(await first.locator('.field-wc-number').innerText(),/168/);
   const facts=await page.evaluate(id=>RiceOS.fieldProgress.facts(RiceOS.state.field(id)),ids[0]);
   assert.match(await first.locator('.field-wc-observed').innerText(),new RegExp(facts.observed));
   assert.match(await card(ids[1]).locator('.field-wc-observed').innerText(),/幼穂/);
   assert.match(await card(ids[1]).locator('.field-wc-water').innerText(),/要確認/,'Conflict warning must not be replaced by movement phase');
   assert.match(await card(ids[3]).innerText(),/記録待ち|未登録|現場記録なし/);
   assert.match(await card(ids[3]).innerText(),/休耕/);
   assert.equal(await card(ids[3]).locator('.field-wc-estimate').count(),0,'No estimate badge without an estimate');
   assert.match(await card(ids[2]).innerText(),/収穫済み/);
   assert.match(await card(ids[2]).locator('.field-wc-water').innerText(),/管理終了/);
   const harvestedHeat=await card(ids[2]).locator('.field-wc-number').innerText();
   console.log('Field facts verified '+width);
   for(const c of await page.locator('.field-wc').all()){
    await c.locator('img').evaluate(img=>{img.loading='eager';return img.decode();});
    const clipping=await c.locator('.field-hub-card-name,.field-wc-label,.field-wc-value').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+2).map(el=>el.textContent));
    assert.equal(clipping.length,0,clipping.join(' / '));
   }
   await first.scrollIntoViewIfNeeded();
   await first.screenshot({path:path.join(os.tmpdir(),'rice-field-watercolor-actual-card-'+width+'.png')});
   await page.screenshot({path:path.join(os.tmpdir(),'rice-field-watercolor-actual-'+width+'.png')});
   await first.click();await page.locator('.field-hub-detail').waitFor();
   console.log('Field detail opened '+width);
   await page.locator('[data-field-view="settings"]').click();await page.locator('.field-hub-settings').waitFor();
   await page.locator('#appBackButton').click();
   await page.locator('.nav-item[data-screen="fields"]:visible').click();
   await card(ids[0]).waitFor();
   await page.clock.setFixedTime(new Date('2026-08-04T03:00:00Z'));
   await page.evaluate(()=>RiceOS.screens.fields.render());
   await page.waitForFunction(id=>document.querySelector('[data-field-open="'+id+'"] .field-wc-number'),ids[2]);
   assert.equal(await card(ids[2]).locator('.field-wc-number').innerText(),harvestedHeat,'Harvest thermal must stop at harvest');
   for(const screen of ['home','fields','calendar','annual','outlook','data']){
    await page.locator('.nav-item[data-screen="'+screen+'"]:visible').click();
    assert.equal(await page.locator('.nav-item:visible').count(),width<900?6:13);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,screen+' horizontal overflow');
   }
   await page.locator('.side-nav').screenshot({path:path.join(os.tmpdir(),'rice-watercolor-nav-'+width+'.png')});
   assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),saved);
   assert.deepEqual(errors,[]);console.log('PASS real field watercolor '+width+': shared facts, wait phase, frozen harvest, routes, nav and no writes');
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
