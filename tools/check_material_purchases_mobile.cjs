"use strict";
const assert = require("node:assert/strict"), os = require("node:os"), path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {for(const width of [360,390]) {
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
    try {
      const page=await context.newPage(),errors=[];let accept=false;
      page.on("pageerror",e=>errors.push(e.message));
      page.on("dialog",d=>d.type()==="alert" || accept ? d.accept() : d.dismiss());
      await page.route("https://**/*",r=>r.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const f=await page.evaluate(()=>{
        const S=RiceOS.state;
        if(!S.saveMaterial({name:"QA 長い名前の肥料・購入履歴",season:2026,unit:"袋",ordered:"旧購入7",used:"旧使用2",remaining:"旧在庫5"}))throw Error("Seed failed");
        const row=S.data().materials.find(x=>x.name==="QA 長い名前の肥料・購入履歴");
        return {id:row.materialId,protected:JSON.stringify(Object.fromEntries(Object.entries(S.data()).filter(([key])=>key!=="materials" && key!=="meta")))};
      });
      const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      const rows=()=>page.evaluate(id=>RiceOS.materialPurchases.records(id),f.id);
      const form=()=>page.locator("#materialPurchaseForm");
      const field=name=>form().locator(`[name="${name}"]`);
      const save=()=>form().locator('[type="submit"]').click();
      const record=id=>page.locator(`[data-mp-record="${id}"]`);
      const fail=on=>page.evaluate(on=>{
        if(on){window.qaMPSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===RiceOS.schema.STORE_KEY)throw Error("QA write failure");return window.qaMPSetItem.call(this,key,value);};}
        else{Storage.prototype.setItem=window.qaMPSetItem;delete window.qaMPSetItem;}
      },on);
      const shot=async name=>{
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
        const file=path.join(os.tmpdir(),`rice-material-purchases-${name}-${width}.png`);await page.screenshot({path:file});console.log(file);
      };
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator('[data-jump-screen="materials"]').click();
      await page.locator(`[data-material-purchases="${f.id}"]`).click();
      const baseline=await raw();
      await page.locator("[data-mp-new]").click();
      await field("date").fill("2026-04-01");await field("season").fill("2026");await field("supplier").fill("JA 肥料店");
      await field("quantity").fill("2.5");await field("unitPrice").fill("400");await field("totalAmount").fill("980");await field("memo").fill("実額優先の購入");
      assert.match(await page.locator("#mpSubtotal").innerText(),/1,000円.*980円/);
      await page.locator("#mpViewYear").selectOption("all");assert.equal(await field("memo").inputValue(),"実額優先の購入");assert.equal(await raw(),baseline);
      await shot("form");await fail(true);await save();
      assert.equal(await raw(),baseline);assert.equal(await field("quantity").inputValue(),"2.5");assert.ok(await page.locator("#materialPurchases [role=alert]").innerText());
      await fail(false);await save();let saved=(await rows())[0];assert.ok(saved.purchaseId);assert.equal(saved.totalAmount,980);const createdAt=saved.createdAt;
      assert.equal(await page.locator("#mpViewYear").inputValue(),"2026");assert.equal(await record(saved.purchaseId).count(),1);
      await page.locator("[data-mp-new]").click();await field("date").fill("2025-12-31");await field("season").fill("2025");await field("quantity").fill("1");await field("unitPrice").fill("0");await save();
      const free=(await rows()).find(x=>x.unitPrice===0);assert.ok(free);assert.match(await record(free.purchaseId).innerText(),/0円/);
      await page.locator("[data-mp-new]").click();await field("date").fill("2026-04-02");await field("season").fill("2026");await field("quantity").fill("1");await save();
      const unpriced=(await rows()).find(x=>x.unitPrice==="");assert.ok(unpriced);assert.match(await record(unpriced.purchaseId).innerText(),/価格未記録/);
      await page.locator("#mpViewYear").selectOption("2025");assert.equal(await page.locator(".mp-record").count(),1);
      await record(free.purchaseId).locator("[data-mp-edit]").click();await field("memo").fill("Draft survives filter and render");
      let before=await raw();await page.locator("#mpViewYear").selectOption("all");await page.evaluate(()=>RiceOS.screens.materials.render());
      assert.equal(await field("memo").inputValue(),"Draft survives filter and render");assert.equal(await raw(),before);
      await page.locator("[data-mp-cancel]").click();assert.equal(await raw(),before);
      await record(saved.purchaseId).locator("[data-mp-edit]").click();await field("date").fill("");await save();assert.equal(await raw(),before);assert.equal(await form().count(),1);
      await field("date").fill("2026-04-01");await field("season").fill("2024");await field("quantity").fill("3");await field("totalAmount").fill("");await save();
      assert.equal(await page.locator("#mpViewYear").inputValue(),"2024");saved=(await rows()).find(x=>x.purchaseId===saved.purchaseId);assert.equal(saved.quantity,3);assert.equal(saved.createdAt,createdAt);
      await record(saved.purchaseId).locator("[data-mp-delete]").click();before=await raw();assert.equal((await rows()).length,3);
      accept=true;await fail(true);await record(saved.purchaseId).locator("[data-mp-delete]").click();assert.equal(await raw(),before);assert.ok(await page.locator("#materialPurchases [role=alert]").innerText());
      await fail(false);await record(saved.purchaseId).locator("[data-mp-delete]").click();assert.equal((await rows()).length,2);accept=false;
      await page.locator(`[data-material-edit="${f.id}"]`).click();await page.locator("#mName").fill("QA 資材名だけ変更");await page.locator("#materialForm [type=submit]").click();assert.equal((await rows()).length,2);
      const m=await page.evaluate(id=>RiceOS.state.data().materials.find(x=>x.materialId===id),f.id);
      assert.equal(m.ordered,"旧購入7");assert.equal(m.used,"旧使用2");assert.equal(m.remaining,"旧在庫5");
      assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(RiceOS.state.data()).filter(([key])=>key!=="materials" && key!=="meta")))),f.protected,"Other records and snapshots are unchanged (save metadata excluded)");
      await page.locator("#mpViewYear").selectOption("all");await page.locator("#materialPurchases").scrollIntoViewIfNeeded();await shot("history");
      const roundtrip=await raw();await page.reload({waitUntil:"networkidle"});assert.equal(await raw(),roundtrip);assert.equal((await rows()).length,2);
      assert.deepEqual(errors,[]);console.log(`PASS material purchases mobile ${width}`);
    }finally{await context.close();}
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
