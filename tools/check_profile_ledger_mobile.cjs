"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  try{
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());await page.route("https://**/*",r=>r.abort());
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const ids=await page.evaluate(()=>{
    const S=RiceOS.state,tractor=S.saveMachine({category:"トラクター",name:"QA tractor"}),planter=S.saveMachine({category:"田植機",name:"QA planter"});
    const t=S.saveTractorProfile({machineId:tractor,workType:RiceOS.schema.TRACTOR_WORK_TYPES[0].value,name:"QA tractor setting",settings:{},memo:"Detail only"});
    const p=S.saveTransplanterProfile({cropYear:2026,machineId:planter,varietyId:S.varieties()[0].varietyId,name:"QA planter setting",settings:{},memo:"Detail only"});
    return {t:t.profileId,p:p.profileId,tractor,planter};
   });
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline=await raw();
   for(const [screen,prefix,id,form,list] of [["tractor-settings","ts",ids.t,"tractorProfileForm","tsProfiles"],["transplanter-settings","tps",ids.p,"transplanterProfileForm","tpsProfiles"]]){
    await page.evaluate(()=>RiceOS.app.show("data"));await page.locator(`[data-jump-screen="${screen}"]`).click();
    if(prefix==="tps"){await page.locator("#tpsYear").selectOption("2026");await page.locator("#tpsMachine").selectOption(ids.planter);}
    else await page.locator("#tsMachine").selectOption(ids.tractor);
    await page.locator(`[data-${prefix}-open="${id}"]`).click();assert.equal(await page.locator(".profile-ledger-detail input").count(),0);assert.ok(!await page.locator(`#screen-${screen} .ts-toolbar`).isVisible());
    await page.locator(`.profile-ledger-detail [data-${prefix}-edit="${id}"]`).click();
    assert.ok(await page.locator(`#${form}`).isVisible());assert.ok(!await page.locator(`#${list}`).isVisible());
    await page.locator(`#${form} [name="name"]`).fill("QA discarded draft");await page.locator("#appBackButton").click();
    await page.locator(".profile-ledger-detail").waitFor();assert.equal(await raw(),baseline);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(os.tmpdir(),`rice-profile-${prefix}-${width}.png`)});
    await page.locator("#appBackButton").click();await page.locator(`#${list}`).waitFor({state:"visible"});
    await page.locator("#appBackButton").click();await page.locator("#screen-data.active").waitFor();
   }
   assert.deepEqual(errors,[]);console.log(`PASS profile ledger ${width}: list/detail/editor, cancel/back, no writes`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
