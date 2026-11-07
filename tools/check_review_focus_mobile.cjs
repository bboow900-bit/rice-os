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
   const ids=await page.evaluate(()=>{
    const S=RiceOS.state,field=S.addField("QA review focus field"),variety=S.addVariety("QA recipe focus");
    const d=RiceOS.utils.clone(S.data());
    d.fieldWorks.push({workId:"qa-focus-plant",date:"2026-05-14",cropYear:2026,workName:"田植え",fieldIds:[field],memo:"Long private note only in detail"},
      {workId:"qa-focus-mow",date:"2026-06-14",cropYear:2026,workName:"草刈り",fieldIds:[field]},
      {workId:"qa-focus-sow",date:"2026-04-14",cropYear:2026,workName:"播種",targetScope:"offField",fieldIds:[],memo:"Sowing detail"});
    if(!S.replace(d,"QA focus fixture"))throw Error("Fixture failed");
    RiceOS.app.show("annual"); document.getElementById("annualYear").value="2026";RiceOS.screens.annual.render();RiceOS.screens.annual.openField(field,"karte");return{field,variety};
   });
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));const baseline=await raw();
   const flow=page.locator(".annual-year-flow");
   assert.equal(await flow.locator('[data-annual-record-open-id="qa-focus-mow"]').count(),0);
   assert.equal(await flow.locator('[data-annual-record-open-id="qa-focus-plant"]').count(),1);
   await flow.locator('[data-annual-record-focus="routine"]').click();
   assert.equal(await flow.locator('[data-annual-record-open-id="qa-focus-mow"]').count(),1);
   assert.equal(await flow.locator('[data-annual-record-open-id="qa-focus-plant"]').count(),0);
   await flow.locator('[data-annual-record-open-id="qa-focus-mow"]').click();
   assert.match(await page.locator(".annual-record-detail-head h2").innerText(),/草刈/);
   await page.locator("#appBackButton").click();
   await page.evaluate(()=>{RiceOS.screens.annual.resetNavigation();RiceOS.screens.annual.render();});
   await page.locator('[data-annual-hub-view="work"]').click();
   await page.locator('[data-annual-record-focus="all"]').click();
   await page.locator('[data-annual-record-open-id="qa-focus-sow"]').click();
   assert.match(await page.locator(".annual-record-detail-head h2").innerText(),/播種/);
   assert.match(await page.locator(".annual-record-detail").innerText(),/Sowing detail/);
   await page.locator("#appBackButton").click();
   assert.equal(await raw(),baseline,"Focus, detail and back preserve saved records");
   await page.evaluate(()=>RiceOS.app.show("recipes"));
   assert.equal(await page.locator("#recipeList input").count(),0);
   await page.locator(`[data-recipe-open="${ids.variety}"]`).click();assert.equal(await page.locator("#recipeList input").count(),0);
   await page.locator("[data-recipe-edit]").click();
   await page.locator('[data-recipe-field="name"]').fill("QA changed draft");await page.locator('[data-recipe-field="name"]').dispatchEvent("change");
   assert.equal(await raw(),baseline,"Editing is draft-only");
   await page.locator("[data-recipe-cancel]").click();assert.equal(await raw(),baseline);
   await page.locator("[data-recipe-edit]").click();
   await page.locator('[data-recipe-field="name"]').fill("QA saved recipe");await page.locator('[data-recipe-field="name"]').dispatchEvent("change");
   await page.locator("[data-recipe-save]").click();
   assert.equal(await page.evaluate(id=>RiceOS.state.variety(id).name,ids.variety),"QA saved recipe");assert.equal(await page.locator("#recipeList input").count(),0);
   await page.evaluate(()=>RiceOS.app.show("data"));
   const src=selector=>page.locator(selector+" img").getAttribute("src");
   assert.notEqual(await src('[data-jump-screen="materials"]'),await src('[data-jump-screen="herbicide"]'));
   assert.notEqual(await src('[data-jump-screen="machines"]'),await src('[data-jump-screen="tractor-settings"]'));
   assert.notEqual(await src('[data-open-milling-ledger]'),await src('[data-open-shipment-ledger]'));
   for(const img of await page.locator(".common-master-card img").all())await img.evaluate(el=>el.decode());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(os.tmpdir(),`rice-ledger-masters-${width}.png`)});
   assert.deepEqual(errors,[]);console.log(`PASS focus/recipe/masters ${width}`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
