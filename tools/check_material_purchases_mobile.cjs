"use strict";
const assert=require("node:assert/strict"),os=require("node:os"),path=require("node:path");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try{for(const width of [360,390]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
    try{
      const page=await context.newPage(),errors=[];let accept=false;
      page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.type()==="alert"||accept?d.accept():d.dismiss());
      await page.route("https://**/*",r=>r.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const f=await page.evaluate(()=>{
        const S=RiceOS.state,P=RiceOS.materialPurchases;
        S.saveMaterial({name:"QA 長い名前の肥料・購入履歴",category:"肥料",season:2026,unit:"袋",ordered:"旧購入7",used:"旧使用2",remaining:"旧在庫5"});
        S.saveMaterial({name:"QA 旧分類を保つ資材",category:"旧分類・特殊資材",season:2023,unit:"箱"});
        const a=S.data().materials.find(m=>m.name==="QA 長い名前の肥料・購入履歴"),b=S.data().materials.find(m=>m.name==="QA 旧分類を保つ資材");
        const free=P.savePurchase(b.materialId,{date:"2025-12-31",season:2025,supplier:"旧仕入先",quantity:1,unit:"箱",unitPrice:0,totalAmount:"",memo:"旧年の無料購入"});
        const unknown=P.savePurchase(b.materialId,{date:"2026-04-02",season:2026,quantity:1,unit:"箱",unitPrice:"",totalAmount:"",memo:"価格未記録"});
        if(!free||!unknown)throw Error("Seed failed");
        return {id:a.materialId,other:b.materialId,free:free.purchaseId,unknown:unknown.purchaseId,protected:JSON.stringify(Object.fromEntries(Object.entries(S.data()).filter(([key])=>key!=="materials"&&key!=="meta")))};
      });
      const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      const rows=()=>page.evaluate(id=>RiceOS.materialPurchases.records(id),f.id);
      const form=()=>page.locator("#materialPurchaseForm"),field=name=>form().locator(`[name="${name}"]`),save=()=>form().locator('[type="submit"]').click();
      const back=()=>page.locator("#appBackButton").click();
      const noForm=async()=>assert.equal(await page.locator("#screen-materials form:visible").count(),0,"Read-only views have no visible forms");
      const fail=on=>page.evaluate(on=>{
        if(on){window.qaMPSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===RiceOS.schema.STORE_KEY)throw Error("QA write failure");return window.qaMPSetItem.call(this,key,value);};}
        else{Storage.prototype.setItem=window.qaMPSetItem;delete window.qaMPSetItem;}
      },on);
      const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);const file=path.join(os.tmpdir(),`rice-material-purchases-${name}-${width}.png`);await page.screenshot({path:file});console.log(file);};
      await page.locator('.nav-item[data-screen="data"]:visible').click();await page.locator('[data-jump-screen="materials"]').click();
      await noForm();assert.equal(await page.locator(".material-carte").count(),0);let baseline=await raw();await shot("list");
      await page.locator('[data-material-mode="purchases"]').click();assert.equal(await page.locator(".mp-record").count(),2);
      await page.locator("#mpViewYear").selectOption("2025");assert.equal(await page.locator(".mp-record").count(),1);assert.match(await page.locator(".mp-record").innerText(),/0円/);
      await page.locator("#materialsCategoryFilter").selectOption("旧分類・特殊資材");assert.equal(await page.locator(".mp-record").count(),1);
      await page.locator("#mpViewYear").selectOption("2026");assert.match(await page.locator(".mp-record").innerText(),/価格未記録/);await shot("cross-year");assert.equal(await raw(),baseline);
      await page.locator(`[data-mp-open="${f.unknown}"]`).click();await noForm();assert.equal(await page.locator("[data-mp-detail]").count(),1);
      await page.locator("[data-mp-edit]").click();await field("memo").fill("Cancel purchase edit");await page.evaluate(()=>RiceOS.app.renderAll());assert.equal(await field("memo").inputValue(),"Cancel purchase edit");
      await back();assert.equal(await form().count(),1,"Back dialog cancel preserves draft");assert.equal(await raw(),baseline);
      await page.locator("[data-mp-cancel]").click();await noForm();assert.equal(await page.locator("[data-mp-detail]").count(),1);assert.equal(await raw(),baseline);await back();
      assert.equal(await page.locator("#mpViewYear").inputValue(),"2026");assert.equal(await page.locator("#materialsCategoryFilter").inputValue(),"旧分類・特殊資材");
      await page.locator("#mpViewYear").selectOption("all");await page.locator("#materialsCategoryFilter").selectOption("all");await page.locator('[data-material-mode="materials"]').click();
      await page.locator(`[data-material-open="${f.other}"]`).click();await noForm();await page.locator(`[data-material-edit="${f.other}"]`).click();
      assert.equal(await page.locator("#mCategory").inputValue(),"旧分類・特殊資材");await page.locator("#mFormalName").fill("Draft keeps legacy category");await page.evaluate(()=>RiceOS.app.renderAll());assert.equal(await page.locator("#mCategory").inputValue(),"旧分類・特殊資材");
      await page.locator("#cancelMaterialEdit").click();await noForm();assert.equal(await raw(),baseline);
      const priorPurchases=await page.evaluate(id=>JSON.stringify(RiceOS.materialPurchases.records(id)),f.other);
      await page.locator(`[data-material-edit="${f.other}"]`).click();await page.locator("#mFormalName").fill("資材情報のみ保存");await page.locator("#materialForm [type=submit]").click();await noForm();
      assert.equal(await page.evaluate(id=>JSON.stringify(RiceOS.materialPurchases.records(id)),f.other),priorPurchases,"Editing material preserves all historical purchase fields");
      assert.equal(await page.evaluate(id=>RiceOS.state.data().materials.find(m=>m.materialId===id).category,f.other),"旧分類・特殊資材");baseline=await raw();await back();
      await page.locator(`[data-material-open="${f.id}"]`).click();await noForm();assert.equal(await page.locator(".material-carte").count(),1);await shot("material-detail");
      await page.locator(`[data-material-purchases="${f.id}"]`).click();await noForm();await page.locator("[data-mp-new]").click();assert.equal(await page.locator("#materialForm").isVisible(),false);
      await field("date").fill("2026-04-01");await field("season").fill("2026");await field("supplier").fill("JA 肥料店");await field("quantity").fill("2.5");await field("unitPrice").fill("400");await field("totalAmount").fill("980");await field("memo").fill("実額優先の購入");
      assert.match(await page.locator("#mpSubtotal").innerText(),/1,000円.*980円/);await page.evaluate(()=>RiceOS.app.renderAll());assert.equal(await field("memo").inputValue(),"実額優先の購入");await shot("form");
      await fail(true);await save();assert.equal(await raw(),baseline);assert.equal(await field("quantity").inputValue(),"2.5");assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText());await page.evaluate(()=>RiceOS.app.renderAll());assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText());
      await fail(false);await save();await noForm();const saved=(await rows())[0];assert.ok(saved.purchaseId);assert.equal(saved.totalAmount,980);assert.equal(await page.locator("[data-mp-detail]").count(),1);await shot("purchase-detail");
      let before=await raw();await page.locator("[data-mp-edit]").click();await field("date").fill("");await save();assert.equal(await raw(),before);await field("date").fill("2026-04-01");await field("season").fill("2024");await field("quantity").fill("3");await field("totalAmount").fill("");await save();await noForm();assert.equal((await rows())[0].createdAt,saved.createdAt);
      await back();assert.equal(await page.locator("#mpViewYear").inputValue(),"2024");await page.locator(`[data-mp-open="${saved.purchaseId}"]`).click();before=await raw();
      await page.locator("[data-mp-delete]").click();assert.equal(await raw(),before);accept=true;await fail(true);await page.locator("[data-mp-delete]").click();assert.equal(await raw(),before);assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText());
      await fail(false);await page.locator("[data-mp-delete]").click();assert.equal((await rows()).length,0);accept=false;await back();
      await page.locator(`[data-material-edit="${f.id}"]`).click();await page.locator("#mName").fill("QA 資材名だけ変更");before=await raw();await fail(true);await page.locator("#materialForm [type=submit]").click();assert.equal(await raw(),before);assert.equal(await page.locator("#mName").inputValue(),"QA 資材名だけ変更");await fail(false);await page.locator("#materialForm [type=submit]").click();await noForm();
      const m=await page.evaluate(id=>RiceOS.state.data().materials.find(x=>x.materialId===id),f.id);assert.equal(m.ordered,"旧購入7");assert.equal(m.used,"旧使用2");assert.equal(m.remaining,"旧在庫5");
      assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(RiceOS.state.data()).filter(([key])=>key!=="materials"&&key!=="meta")))),f.protected);
      const other=await page.evaluate(id=>RiceOS.materialPurchases.records(id),f.other);assert.equal(other.length,2);assert.equal(other.find(x=>x.purchaseId===f.free).unitPrice,0);assert.equal(other.find(x=>x.purchaseId===f.unknown).unitPrice,"");
      await back();await page.locator("[data-material-new]").click();await page.locator("#mName").fill("Cancelled new material");before=await raw();await back();assert.equal(await page.locator("#materialForm").isVisible(),true);accept=true;await back();accept=false;await noForm();assert.equal(await raw(),before);
      const roundtrip=await raw();await page.reload({waitUntil:"networkidle"});assert.equal(await raw(),roundtrip);assert.deepEqual(errors,[]);console.log(`PASS materials ledger ${width}: exclusive views, filters, cross-material purchases, unknown category, drafts/errors/back, CRUD and no-loss`);
    }finally{await context.close();}
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
