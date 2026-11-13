"use strict";
const assert=require("node:assert/strict"),os=require("node:os"),path=require("node:path");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
try{for(const width of [360,390,1280]){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:"block"});
 try{
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));await page.route("https://**/*",r=>r.abort());
  await page.clock.setFixedTime(new Date("2026-11-13T12:00:00+09:00"));await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
  await page.evaluate(()=>{const S=RiceOS.state,v=S.addVariety("Sales QA");
   const save=(kind,recipient,bags,price,season=2026)=>{if(!S.saveShipment({kind,recipient,season,varietyId:v,date:"2026-10-20",riceType:"brown",packages:[{kg:30,bags}],...(price===undefined?{}:{pricePer60Kg:price})}))throw Error("Fixture save failed");};
   save("sale","Buyer A",2,20000);save("shipment","Buyer B",4,30000);save("sale","Zero",1,0);save("sale","Pending",1,undefined);
   save("gift","Gift",2,99999);save("household","自家用",2,99999);save("sale","Prior",1,18000,2025);
   RiceOS.app.show("shipments");});
  const baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
  await page.locator("#shipmentFilterSeason").selectOption("2026");
  const value=()=>page.locator("[data-shipment-annual-sales-amount]").innerText();
  assert.equal(await value(),"¥80,000");assert.match(await page.locator("[data-shipment-annual-sales]").innerText(),/金額未計算 1件/);
  await page.locator("#shipmentFilterRecipient").fill("Buyer A");assert.equal(await value(),"¥80,000");
  await page.locator("#shipmentFilterKind").selectOption("household");assert.equal(await value(),"¥80,000");
  await page.locator("#shipmentFilterSeason").selectOption("2025");assert.equal(await value(),"¥9,000");
  await page.locator("#shipmentFilterSeason").selectOption("all");assert.equal(await value(),"¥89,000");
  await page.locator("#shipmentFilterSeason").selectOption("2026");await page.locator("#shipmentFilterRecipient").fill("");await page.locator("#shipmentFilterKind").selectOption("all");
  await page.locator("#toast").waitFor({state:"hidden",timeout:10000});await page.evaluate(()=>scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(os.tmpdir(),`rice-shipment-annual-sales-${width}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline,"Browsing totals never changes records");
  await page.evaluate(()=>{const S=RiceOS.state,d=RiceOS.utils.clone(S.data());d.shipments=d.shipments.filter(r=>r.recipient==="Pending");S.replace(d,"QA all unpriced");RiceOS.screens.shipments.render();});assert.equal(await value(),"未計算");
  await page.evaluate(()=>{const S=RiceOS.state,d=RiceOS.utils.clone(S.data());d.shipments=[];S.replace(d,"QA empty");RiceOS.screens.shipments.render();});assert.equal(await value(),"¥0");
  assert.deepEqual(errors,[]);console.log(`PASS annual sales ${width}: year totals, zero/missing, gift/household exclusion, filters, all years, no writes and overflow`);
 }finally{await context.close();}
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
