"use strict";
const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try {for(const width of [360,390]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  try{
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("https://**/*",r=>r.abort());
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   let count=0;
   for(const screen of ["home","fields","calendar","annual","outlook","data","materials","herbicide","field-work","growth","dry-period","irrigation","machines","tractor-settings","transplanter-settings","recipes","photos","results","shipments","harvest-performance"]){
    await page.evaluate(id=>RiceOS.app.show(id),screen);
    const root=page.locator(`#screen-${screen}.active`); await root.waitFor();
    const summaries=root.locator("details > summary");
    const n=await summaries.count();
    for(let i=0;i<n;i++){
     const summary=summaries.nth(i);if(!await summary.isVisible())continue;
     const initial=await summary.evaluate(el=>el.parentElement.open);
     await summary.click();assert.equal(await summary.evaluate(el=>el.parentElement.open),!initial,`${screen} disclosure must toggle`);
     await summary.click();assert.equal(await summary.evaluate(el=>el.parentElement.open),initial);count++;
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${screen} width`);
   }
   assert.deepEqual(errors,[]);console.log(`PASS ${width}: ${count} real disclosure controls across 20 screens`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
