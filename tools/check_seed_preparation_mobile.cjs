"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),os=require("node:os");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const root=path.resolve(__dirname,"..");
 const server=http.createServer((req,res)=>{const file=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":file.endsWith(".html")?"text/html":"application/octet-stream");res.end(b);});});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 let browser;
 try {
  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  for(const width of [360,390,1280]) {
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:"block"});const page=await context.newPage(),errors=[];
   page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());await page.route("https://**/*",r=>r.abort());
   await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:"networkidle"});
   const id=await page.evaluate(()=>{RiceOS.app.openInput("field-work","home");return RiceOS.state.data().varieties[0].varietyId;});
   await page.locator("#fwTargetScope").selectOption("offField");await page.locator("#fwName").selectOption("温湯殺菌");
   await page.locator("#fwSeedPreparation > summary").click();await page.locator("#fwSeedVariety").selectOption(id);
   await page.locator("#fwSeed_actualWaterTemperatureC").fill("59.5");await page.locator("#fwSeed_actualBatchKg").fill("4");
   await page.locator("#fwSeed_startAt").fill("2026-04-01T09:00");await page.locator("#fwSeed_endAt").fill("2026-04-01T09:10");
   await page.locator("#fwSeed_budState").fill("QA seed");
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"no page overflow");
   const shot=path.join(os.tmpdir(),`rice-seed-preparation-${width}.png`);await page.screenshot({path:shot,fullPage:true});console.log(shot);
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));const before=await raw();
   await page.evaluate(()=>{window.qaSeedSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===RiceOS.schema.STORE_KEY)throw Error("QA write failure");return window.qaSeedSetItem.call(this,k,v);};});
   await page.locator('#fieldWorkForm [type="submit"]').click();assert.equal(await raw(),before);assert.equal(await page.locator("#fwSeed_actualBatchKg").inputValue(),"4");
   await page.evaluate(()=>{Storage.prototype.setItem=window.qaSeedSetItem;});
   await page.locator('#fieldWorkForm [type="submit"]').click();
   const work=await page.evaluate(()=>RiceOS.state.data().fieldWorks.find(w=>w.seedPreparation?.budState==="QA seed"));assert.ok(work);assert.equal(work.seedPreparation.actualWaterTemperatureC,"59.5");assert.equal(work.seedPreparation.settingsSnapshot.hotWaterTemperatureC,"60");
   await page.evaluate(({work,id})=>{RiceOS.state.updateVariety(id,{hotWaterTemperatureC:"61"});RiceOS.app.openInput("field-work","home");RiceOS.screens.fieldWork.editWork(work.workId);},{work,id});
   if(await page.locator("#fwSeedPreparation").getAttribute("open")===null) await page.locator("#fwSeedPreparation > summary").click();assert.equal(await page.locator("#fwSeed_actualBatchKg").inputValue(),"4");
   await page.locator("#fwSeed_memo").fill("memo only");await page.locator('#fieldWorkForm [type="submit"]').click();
   const edited=await page.evaluate(id=>RiceOS.state.data().fieldWorks.find(w=>w.workId===id),work.workId);assert.equal(edited.seedPreparation.settingsSnapshot.hotWaterTemperatureC,"60");
   await page.reload({waitUntil:"networkidle"});assert.equal(await page.evaluate(id=>RiceOS.state.data().fieldWorks.find(w=>w.workId===id).seedPreparation.settingsSnapshot.hotWaterTemperatureC,work.workId),"60");
   await page.evaluate(id=>{RiceOS.app.openInput("field-work","home");RiceOS.screens.fieldWork.editWork(id);},work.workId);
   if(await page.locator("#fwSeedPreparation").getAttribute("open")===null) await page.locator("#fwSeedPreparation > summary").click();
   await page.locator("#fwSeed_memo").fill("unsaved change");assert.ok(await page.locator("#fwSeedReference").isDisabled());
   await page.evaluate(id=>RiceOS.screens.fieldWork.editWork(id),work.workId);
   if(await page.locator("#fwSeedPreparation").getAttribute("open")===null) await page.locator("#fwSeedPreparation > summary").click();
   const beforeAdopt=await raw();await page.locator("#fwSeedReference").click();
   assert.equal(await page.locator('[data-recipe-field="hotWaterTemperatureC"]').inputValue(),"59.5");
   assert.equal(await page.locator('[data-recipe-field="hotWaterDurationMinutes"]').inputValue(),"10");
   assert.equal(await raw(),beforeAdopt,"adoption opens draft only");await page.locator("[data-recipe-cancel]").click();assert.equal(await raw(),beforeAdopt);
   assert.deepEqual(errors,[]);console.log(`PASS seed preparation UI ${width}: off-field selection, optional inputs, save, failed-save draft, immutable settings, reload, no overflow/errors`);await context.close();
  }
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
