"use strict";
const assert=require("node:assert/strict"), path=require("node:path"),os=require("node:os");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:"block",isMobile:width<600,hasTouch:width<600});
  try{
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());await page.route("https://**/*",r=>r.abort());
   await page.clock.setFixedTime(new Date("2026-11-12T12:00:00+09:00"));
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const ids=await page.evaluate(()=>{
    const S=RiceOS.state,v=S.addVariety("UI 天のつぶ"),f=S.addField("UI 開パ 下");S.updateField(f,{varietyId:v,areaA:120});
    if(!S.saveFieldWork({workId:"ui-plant",date:"2026-05-14",workName:"田植え",fieldIds:[f]}))throw Error("plant");
    if(!S.saveMillingRecord({date:"2026-10-10",season:2026,varietyId:v,fieldIds:[f],packages:[{kg:30,bags:240}],looseKg:0}))throw Error("milling");
    if(!S.saveShipment({date:"2026-10-20",season:2026,varietyId:v,recipient:"販売先A",kind:"sale",riceType:"brown",packages:[{kg:30,bags:200}],pricePer60Kg:20000,grade:"1等"}))throw Error("sale");
    if(!S.saveShipment({date:"2026-10-21",season:2026,varietyId:v,recipient:"親戚",kind:"gift",riceType:"brown",packages:[{kg:30,bags:10}]}))throw Error("gift");
    RiceOS.app.show("data");return{v,f};
   });
   await page.locator("[data-open-harvest-ledger]").click();await page.locator("#screen-harvest-ledger.active").waitFor();
   await page.locator("#harvestLedgerVariety").selectOption(ids.v);
   const baseline=await page.evaluate(()=>JSON.stringify(RiceOS.state.data()));
   const amounts=await page.evaluate(({v})=>RiceOS.harvestLedger.read(2026,v),ids);
   assert.equal(amounts.stock.remainingKg,900);assert.equal(amounts.outgoingKg,6000);assert.equal(amounts.giftKg,300);assert.equal(amounts.salesYen,2000000);assert.equal(amounts.performance.balesPer10a,10);
   const snapshot=async name=>{await page.locator("#toast").waitFor({state:"hidden",timeout:10000});await page.evaluate(()=>scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+" overflow");await page.screenshot({path:path.join(os.tmpdir(),`rice-readable-${name}-${width}.png`),fullPage:true});};
   await snapshot("harvest");
   assert.equal(await page.evaluate(()=>JSON.stringify(RiceOS.state.data())),baseline,"Overview is read-only");
   await page.locator("[data-harvest-ledger-new-milling]").click();await page.locator("#millingForm").waitFor();await page.locator("#appBackButton").click();if(!await page.locator("#screen-harvest-ledger").isVisible())await page.locator("#appBackButton").click();await page.locator("#screen-harvest-ledger.active").waitFor();
   assert.equal(await page.locator("#harvestLedgerVariety").inputValue(),ids.v,"Returning keeps variety");
   await page.evaluate(({v,f})=>{RiceOS.state.saveGrowthLog({fieldId:f,date:"2026-07-22",headingObserved:true});RiceOS.app.show("home");},ids);
   await page.clock.setFixedTime(new Date("2026-07-28T12:00:00+09:00"));await page.evaluate(()=>RiceOS.screens.home.render());
   await snapshot("home");
   const summary=await page.locator(".home-decision-summary > button").evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().y));assert.ok(summary.every((y,i)=>i===0||y>summary[i-1]),"Home quantities are vertical");
   assert.match(await page.locator(`[data-home-stage-card="${ids.f}"]`).innerText(),/出穂から6日/);
   for(const screen of ["fields","annual","outlook","materials","data"]){await page.evaluate(s=>RiceOS.app.show(s),screen);await snapshot(screen);}
   assert.deepEqual(errors,[]);console.log(`PASS readable UI ${width}: real totals, yield, read-only overview, return scope, vertical summary and all main screens`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
