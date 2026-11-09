"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width < 600,hasTouch:width < 600,serviceWorkers:"block"});
    try {
      const page = await context.newPage(), errors = []; let accept = false;
      page.on("pageerror", e => errors.push(e.message));
      page.on("dialog", d => accept ? d.accept() : d.dismiss());
      await page.clock.setFixedTime(new Date("2026-11-09T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const ids = await page.evaluate(() => {
        const R = RiceOS, S = R.state, data = R.utils.clone(S.data());
        const order = (id,q,date,receipts=[]) => ({purchaseId:id,date:"2026-11-02",season:2026,quantity:q,unit:"袋",unitPrice:100,totalAmount:"",supplier:"JA 購入店",deliveryMode:"manual",expectedDeliveryDate:date,receipts});
        const receipt = (id,q) => ({receiptId:id,date:"2026-11-03",quantity:q,unit:"袋",memo:"",createdAt:"2026-11-03T00:00:00Z"});
        data.materials = [{materialId:"qa-controls",name:"長い名前の肥料・在庫内訳確認",season:2026,category:"肥料",unit:"袋",purchases:[
          {purchaseId:"prior",date:"2025-04-10",season:2025,quantity:4,unit:"袋",unitPrice:200,totalAmount:"",supplier:"前年の購入店"},
          order("overdue",10,"2026-11-08",[receipt("eight",8)]),order("partial",2,"2026-11-10",[receipt("one",1)])]},
          {materialId:"qa-controls-other",name:"培土",season:2026,category:"培土",unit:"袋",purchases:[order("waiting",1,"")]}];
        data.fieldWorks = [];
        if (!S.replace(data,"Isolated material controls fixture")) throw Error("fixture failed");
        if (!R.materialStock.saveStocktake("qa-controls",{date:"2026-11-01",quantity:10,unit:"袋"})) throw Error("baseline failed");
        return {fieldId:S.activeFields()[0].fieldId};
      });
      const back = () => page.locator("#appBackButton").click();
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const field = (id,name) => page.locator(`#${id} [name="${name}"]`);
      const save = id => page.locator(`#${id} [type=submit]`).click();
      const shot = async name => {
        await page.locator("#toast").waitFor({state:"hidden",timeout:7000});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
        await page.screenshot({path:path.join(os.tmpdir(),`rice-material-controls-${name}-${width}.png`)});
      };
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator('[data-jump-screen="materials"]').click();
      assert.match(await page.locator('[data-material-row="qa-controls"]').innerText(),/在庫あり[\s\S]*納品待ち/);
      await page.locator('[data-material-mode="pending"]').click();
      assert.equal(await page.locator(".mi-order").count(),3);
      assert.equal(await page.locator(".mi-order").first().locator(".mi-badge").innerText(),"予定日超過");
      await page.locator("#materialPendingStatus").selectOption("partial"); assert.equal(await page.locator(".mi-order").count(),1);
      await page.locator("#materialPendingStatus").selectOption("waiting"); assert.match(await page.locator(".mi-order").innerText(),/培土/);
      await page.locator("#materialPendingStatus").selectOption("all");
      await page.locator("#materialsCategoryFilter").selectOption("肥料"); assert.equal(await page.locator(".mi-order").count(),2);
      await page.locator("#mpViewYear").selectOption("2025"); assert.equal(await page.locator(".mi-order").count(),0);
      await page.locator("#mpViewYear").selectOption("2026"); await shot("pending");
      await page.locator('[data-pending-cancel="overdue"]').click();
      await field("materialCancellationForm","reason").fill("欠品のため残り2袋を取消");
      const before = await raw(); await back(); assert.equal(await page.locator("#materialCancellationForm").count(),1); assert.equal(await raw(),before);
      await page.evaluate(() => { window.qaSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v){if(k===RiceOS.schema.STORE_KEY)throw Error("test failure");return window.qaSet.call(this,k,v);}; });
      await save("materialCancellationForm"); assert.equal(await raw(),before); assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText());
      assert.equal(await field("materialCancellationForm","reason").inputValue(),"欠品のため残り2袋を取消");
      await page.evaluate(() => { Storage.prototype.setItem=window.qaSet;delete window.qaSet; });
      await save("materialCancellationForm");
      assert.match(await page.locator(".mi-cancellations").innerText(),/注文取消済み[\s\S]*請求・返金/);
      assert.equal(await page.evaluate(() => RiceOS.materialStock.summary("qa-controls").quantity),19);
      assert.equal(await page.evaluate(() => RiceOS.materialPurchases.amount(RiceOS.materialPurchases.records("qa-controls").find(p=>p.purchaseId==="overdue"))),1000);
      await back(); assert.equal(await page.locator(".mi-order").count(),1);
      await page.locator('[data-material-mode="purchases"]').click();
      assert.match(await page.locator(".mp-year-totals").innerText(),/注文取消あり/);
      await page.locator('[data-mp-open="overdue"]').click(); accept=true;
      await page.locator("[data-cancellation-undo]").click(); accept=false; await back();
      await page.locator('[data-material-mode="materials"]').click();
      await page.locator('[data-material-open="qa-controls"]').click();
      await page.locator(".mi-previous > summary").click();
      assert.match(await page.locator(".mi-previous").innerText(),/前年の購入店[\s\S]*4 袋[\s\S]*800円/);
      const previousRaw=await raw(); await page.locator('.mi-previous [data-mp-open="prior"]').click(); await back(); assert.equal(await raw(),previousRaw);
      await page.evaluate(({fieldId}) => {
        const S=RiceOS.state,d=RiceOS.utils.clone(S.data());
        d.fieldWorks.push({workId:"qa-unknown-use",date:"2026-11-04",season:2026,cropYear:2026,workName:"追肥",fieldIds:[fieldId],materialId:"qa-controls",material:"長い名前の肥料・在庫内訳確認",amount:"不明",worker:"自分"});
        if(!S.replace(d,"Unknown quantity fixture"))throw Error("unknown fixture failed"); RiceOS.app.renderAll();
      },ids);
      assert.equal(await page.locator("[data-material-stock-quantity]").innerText(),"集計保留");
      await page.locator(".ms-number[data-stock-evidence]").click();
      assert.equal(await page.locator("[data-evidence-stocktake]").count(),1); await shot("evidence");
      await page.locator('[data-stock-work="qa-unknown-use"]').click();
      assert.equal(await page.locator("#editFieldWorkId").inputValue(),"qa-unknown-use");
      assert.equal(await page.locator("#fwAmount").isVisible(),true);
      await page.locator("#fwAmount").fill("3袋"); await save("fieldWorkForm"); await back();
      await page.locator(".mi-evidence").waitFor();
      assert.equal(await page.evaluate(() => RiceOS.materialStock.summary("qa-controls").quantity),16);
      assert.match(await page.locator(".mi-equation").innerText(),/16 袋/);
      await back(); assert.equal(await page.locator("[data-material-stock-quantity]").innerText(),"16 袋");
      await page.locator(".ms-current").scrollIntoViewIfNeeded(); await shot("stock");
      const stored=await raw();await page.reload({waitUntil:"networkidle"});assert.equal(await raw(),stored);assert.deepEqual(errors,[]);
      console.log(`PASS material controls ${width}: pending/status/year/category, cancellation/failure/undo, financial no-guess, previous/detail/back, evidence/source fix/back, reload`);
    } finally {await context.close();}
  }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
