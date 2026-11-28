"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390,1280]){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:"block"});
  try{
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("https://**/*",r=>r.abort());await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   await page.locator('.nav-item[data-screen="data"]:visible').click();
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline=await raw();
   const cards=page.locator('#screen-data .common-master-card');
   assert.equal(await cards.count(),12);
   assert.deepEqual(await page.locator('.common-master-group').allTextContents(),['圃場・栽培','機械・整備','資材・除草','記録・お知らせ','収穫・出荷','データ管理']);
   assert.equal(await page.locator('#screen-data [data-jump-screen="irrigation"]').count(),0,'Only the management water entries are removed');
   assert.equal(await page.locator('.management-backup-fold').getAttribute('open'),null);
   assert.equal(await page.locator('.common-master-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
   const geometry=await cards.evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert(geometry.every(r=>r.h>=44));
   for(let i=0;i<10;i+=2){assert(Math.abs(geometry[i].w-geometry[i+1].w)<1);assert(Math.abs(geometry[i].y-geometry[i+1].y)<1);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const clipping=await cards.locator('b,small,em').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+2).map(el=>el.textContent));
   assert.deepEqual(clipping,[],'All menu labels and counts must fit');
   assert((await page.locator('.master-watercolor-art').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundImage))).every(src=>src.includes('management-watercolor-approved.png')));
   await page.evaluate(()=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src='assets/images/management/management-watercolor-approved.png';}));
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await page.screenshot({path:path.join(os.tmpdir(),`rice-management-unified-top-${width}.png`)});
   await page.locator('.common-master-grid').screenshot({path:path.join(os.tmpdir(),`rice-management-unified-menu-${width}.png`)});
   for(const target of ['fields','recipes','tractor-settings','transplanter-settings','seeder-settings','machines','materials','herbicide','photos','notices']){
    await page.locator(`#screen-data .common-master-card[data-jump-screen="${target}"]`).click();
    await page.locator(`#screen-${target}.active`).waitFor();
    if(target==='fields')await page.locator('.nav-item[data-screen="data"]:visible').click();
    else{await page.locator('#appBackButton').click();await page.locator('#screen-data.active').waitFor();}
    assert.equal(await raw(),baseline,'Master navigation does not change records: '+target);
   }
   await page.locator('#screen-data [data-open-harvest-ledger]').click();
   await page.locator('#screen-harvest-ledger.active').waitFor();
   await page.locator('#appBackButton').click();await page.locator('#screen-data.active').waitFor();
   await page.locator('[data-action="open-system-settings"]').click();
   await page.locator('#systemSettingsPanel').waitFor({state:'visible'});
   await page.locator('[data-action="close-system-settings"]').click();
   await page.evaluate(()=>{window.qaManagementShareCalls=0;RiceOS.backupExport={...RiceOS.backupExport,share:async()=>{window.qaManagementShareCalls++;return {status:'cancelled',message:'共有をキャンセルしました。記録は変更していません。'};}};});
   await page.locator('#managementBackupShare').click();
   await page.waitForFunction(()=>window.qaManagementShareCalls===1);
   assert.equal(await page.locator('.management-backup-fold').getAttribute('open'),'');
   assert.equal(await page.locator('#dataBackupShare').isDisabled(),false);
   assert.equal(await raw(),baseline,'Cancelling backup sharing does not change records');
   if(width<900)assert.equal(await page.locator('.nav-item:visible').count(),6);
   assert.deepEqual(errors,[]);
   console.log(`PASS management ${width}: twelve grouped entries, all routes/back, icons, backup/data card, no record changes`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
