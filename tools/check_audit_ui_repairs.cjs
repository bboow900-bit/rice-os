"use strict";
const assert=require("node:assert/strict");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try { for(const width of [360,390]) {
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:"block"});
  try {
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("https://**/*",r=>r.abort());await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline=await raw();
   const management=()=>page.locator('.nav-item[data-screen="data"]:visible').click();
   const targets=async selector=>{
    const sizes=await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height));
    assert(sizes.length>0,selector);assert(sizes.every(h=>h>=44),`${selector}: ${sizes}`);
   };
   await management();await page.locator('[data-jump-screen="machines"]').click();
   await targets('#screen-machines .machine-head > button');
   await page.locator('#screen-machines .machine-head > button:visible').first().click();
   await page.locator('#screen-data.active').waitFor();
   await page.locator('[data-jump-screen="notices"]').click();
   await targets('#screen-notices .screen-head > button[data-action="enable-notifications"]');
   await page.locator('#appBackButton').click();
   await page.locator('[data-jump-screen="transplanter-settings"]').click();
   await targets('#screen-transplanter-settings .ts-details > summary');
   await page.locator('#appBackButton').click();
   await page.locator('.common-master-card[data-action="open-system-settings"]').click();
   await page.locator('#dataDiagnostics > summary').click();
   const kpis=await page.locator('#dataStatus .kpi').evaluateAll(nodes=>nodes.map(n=>({radius:getComputedStyle(n).borderRadius,shadow:getComputedStyle(n).boxShadow,label:parseFloat(getComputedStyle(n.querySelector('.label')).fontSize)})));
   assert(kpis.length>0);assert(kpis.every(k=>k.radius==='0px'&&k.shadow==='none'&&k.label>=12));
   await page.locator('#systemSettingsPanel').screenshot({path:`C:/Users/Keisuke/AppData/Local/Temp/rice-audit-repaired-diagnostics-${width}.png`});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await raw(),baseline);assert.deepEqual(errors,[]);
   console.log(`PASS audit UI repairs ${width}: 44px controls, flat readable diagnostics, routes and records unchanged`);
  } finally {await context.close();}
 }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
