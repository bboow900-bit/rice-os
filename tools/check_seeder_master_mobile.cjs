"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:"block"});
  try{
   const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());await page.route("https://**/*",r=>r.abort());
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   await page.locator('.nav-item[data-screen="data"]:visible').click();await page.locator('[data-jump-screen="seeder-settings"]').click();
   assert.equal(await page.locator("#seederProfileForm").count(),0);
   await page.locator('[data-ss-new="dense"]').click();
   await page.locator('#seederProfileForm [name="name"]').fill("QA 密苗とマットを併用する設定");
   await page.locator('#seederProfileForm [name="cropYear"]').fill("2026");
   await page.locator('#seederProfileForm [name="medium"][value="mat"]').check();
   await page.locator('#seederProfileForm [name="germinatedSeedGPerTray"]').fill("300");
   await page.locator('#seederProfileForm [name="bedThicknessCm"]').fill("0");
   await page.locator('#seederProfileForm [name="coverThicknessCm"]').fill("0.5");
   await page.locator('#seederProfileForm [name="rimGapCm"]').fill("0.4");
   await page.locator('#seederProfileForm button[type="submit"]').click();
   await page.locator(".ss-detail").waitFor();assert.equal(await page.locator("#seederProfileForm").count(),0);
   const profile=await page.evaluate(()=>RiceOS.seederSettings.profilesFor().find(r=>r.name.startsWith("QA 密苗")));
   assert.equal(profile.method,"dense");assert.equal(profile.medium,"mat");assert.equal(profile.bedThicknessCm,0);assert.equal(profile.coverThicknessCm,0.5);assert.equal(profile.rimGapCm,0.4);
   const baseline=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
   await page.locator("[data-ss-edit]").click();await page.locator('#seederProfileForm [name="name"]').fill("QA not saved");
   await page.locator("#appBackButton").click();await page.locator(".ss-detail").waitFor();
   assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(os.tmpdir(),`rice-seeder-detail-${width}.png`)});
   await page.locator("#appBackButton").click();await page.locator(".ss-list").waitFor();await page.locator("#appBackButton").click();await page.locator("#screen-data.active").waitFor();
   assert.deepEqual(errors,[]);console.log(`PASS seeder ${width}: independent modes, exact units, zero, readonly detail, cancel/back`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
