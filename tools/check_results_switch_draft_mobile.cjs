"use strict";
const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  try{
   const page=await context.newPage();let accept=false,dialogs=0;
   page.on("dialog",d=>{dialogs++;return accept?d.accept():d.dismiss();});await page.route("https://**/*",r=>r.abort());
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   await page.evaluate(()=>{RiceOS.app.show("results");RiceOS.screens.results.openMillingLedger();});
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),before=await raw();
   for(const [kind,field,next] of [["milling","millingMemo","issue"],["issue","shipmentIssueMemo","result"],["result","rReflection","milling"]]){
    await page.locator(`[data-results-new="${kind}"]`).click();
    for (const details of (await page.locator(`#${field}`).locator("xpath=ancestor::details").all()).reverse()) if (!await details.evaluate(el=>el.open)) await details.locator(":scope > summary").click();
    await page.locator(`#${field}`).fill("QA keep draft");
    const count=dialogs;await page.locator(`[data-results-ledger="${next}"]`).click();assert.equal(dialogs,count+1);assert.equal(await page.locator(`#${field}`).inputValue(),"QA keep draft");assert.ok(await page.locator(`#${field}`).isVisible());
    assert.equal(await raw(),before);
    accept=true;await page.locator(`[data-results-ledger="${next}"]`).click();accept=false;
    await page.locator(`[data-results-new="${next}"]`).waitFor();assert.equal(await raw(),before);
   }
   console.log(`PASS result draft switch ${width}: all three ledgers confirm, dismissed switch keeps input, no writes`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
