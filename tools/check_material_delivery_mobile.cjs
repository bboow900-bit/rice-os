"use strict";
const assert = require("node:assert/strict"), os = require("node:os"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.RICE_TEST_URL || "http://127.0.0.1:4182/index.html";
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  const failures = [];
  try { for (const width of [360,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width < 600,hasTouch:width < 600,serviceWorkers:"block"});
    const page = await context.newPage(), errors = []; let approve = false;
    page.setDefaultTimeout(10000);
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.type() === "alert" || approve ? d.accept() : d.dismiss());
    try {
      await page.clock.setFixedTime(new Date("2026-11-09T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto(url,{waitUntil:"networkidle"});
      assert.equal(await page.evaluate(() => ["saveReceipt","deleteReceipt","deliverySummary"].every(k => typeof RiceOS.materialPurchases?.[k] === "function")),true,"Delivery core must be ready");
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const data = () => page.evaluate(() => JSON.stringify(RiceOS.state.data()));
      const back = () => page.locator("#appBackButton").click();
      const save = id => page.locator(`#${id} [type=submit]`).click();
      const field = (id,name) => page.locator(`#${id} [name="${name}"]`);
      const fail = on => page.evaluate(on => {
        if (on) {
          window.qaDeliverySet = Storage.prototype.setItem;
          Storage.prototype.setItem = function(k,v) { if(k === RiceOS.schema.STORE_KEY) throw Error("QA delivery write failure"); return window.qaDeliverySet.call(this,k,v); };
        } else { Storage.prototype.setItem = window.qaDeliverySet; delete window.qaDeliverySet; }
      },on);
      const shot = async name => {
        if (name === "supply13") {
          await page.locator("#toast").waitFor({state:"hidden",timeout:15000});
          await page.locator(".ms-current").evaluate(node => node.scrollIntoView({block:"center",behavior:"instant"}));
          const box = await page.locator("[data-material-supply]").boundingBox();
          assert.ok(box && box.y >= 0 && box.y + box.height <= page.viewportSize().height,"Supply formula must be fully visible in screenshot");
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${name}: horizontal overflow`);
        const file = path.join(os.tmpdir(),`rice-material-delivery-${name}-${width}.png`);
        await page.screenshot({path:file}); console.log(file);
      };
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator('[data-jump-screen="materials"]').click();
      await page.locator("[data-material-new]").click();
      await page.locator("#mName").fill("QA delivery long-name fertilizer");
      await page.locator("#mUnit").fill("袋");
      await page.locator("#mStockDate").fill("2026-11-09");
      await page.locator("#mStockQuantity").fill("10");
      await page.locator("#saveMaterialButton").click();
      const mid = await page.locator("[data-material-detail]").getAttribute("data-material-detail");
      const material = () => page.evaluate(mid => RiceOS.state.data().materials.find(m => m.materialId === mid),mid);
      const current = async (quantity,pending,total) => {
        assert.equal(await page.locator("[data-material-stock-quantity]").innerText(),`${quantity} 袋`);
        assert.match(await page.locator("[data-material-supply]").innerText(),new RegExp(`${quantity}\\s*＋\\s*${pending}\\s*＝\\s*${total} 袋`));
        assert.equal(await page.evaluate(mid => RiceOS.materialStock.summary(mid).quantity,mid),quantity);
        const overlap = await page.locator("[data-material-supply]").evaluate(root => {
          const rows = [...root.children].map(node => node.getBoundingClientRect());
          return rows.some((row,i) => i > 0 && row.top < rows[i-1].bottom - 1);
        });
        assert.equal(overlap,false,"Supply label, formula and annual purchase must occupy separate rows");
      };
      const protectedData = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(RiceOS.state.data()).filter(([k]) => k !== "materials" && k !== "meta"))));
      await current(10,0,10);
      await page.locator("[data-ms-purchase]").click();
      for (const [name,value] of Object.entries({date:"2026-11-09",season:"2026",quantity:"6",unitPrice:"400",totalAmount:"2300",expectedDeliveryDate:"2026-11-10",memo:"Order, not stock"})) await field("materialPurchaseForm",name).fill(value);
      await save("materialPurchaseForm");
      const pid = await page.locator("[data-mp-detail]").getAttribute("data-mp-detail");
      let purchase = (await material()).purchases.find(p => p.purchaseId === pid);
      assert.equal(purchase.deliveryMode,"manual"); assert.equal(purchase.expectedDeliveryDate,"2026-11-10");
      const delivery = async (received,pending) => {
        const result = await page.evaluate(({mid,pid}) => RiceOS.materialPurchases.deliverySummary(RiceOS.materialPurchases.records(mid).find(p => p.purchaseId === pid)),{mid,pid});
        assert.equal(result.received,received); assert.equal(result.pending,pending); assert.equal(result.legacy,false);
      };
      await delivery(0,6); await back(); await current(10,6,16);
      const openPurchase = async () => {
        await page.locator("[data-material-purchases]").click();
        assert.match(await page.locator(".mp-year-totals").innerText(),/2026年度[\s\S]*2,300円/);
        await page.locator(`[data-mp-open="${pid}"]`).click();
      };
      const returnMaterial = async () => { await back(); await back(); await page.locator("[data-material-stock-quantity]").waitFor(); };
      const receipt = async quantity => {
        await page.locator("[data-receipt-new]").click();
        await field("materialReceiptForm","date").fill("2026-11-09");
        await field("materialReceiptForm","quantity").fill(String(quantity));
        await field("materialReceiptForm","memo").fill(`Received ${quantity}`);
        await save("materialReceiptForm"); await page.locator("[data-mp-detail]").waitFor();
      };
      await openPurchase();
      let before = await raw(), beforeData = await data();
      await page.locator("[data-receipt-new]").click();
      await field("materialReceiptForm","quantity").fill("2");
      await field("materialReceiptForm","memo").fill("Dirty receipt draft");
      await page.evaluate(() => RiceOS.app.renderAll());
      assert.equal(await field("materialReceiptForm","memo").inputValue(),"Dirty receipt draft");
      await back(); assert.equal(await field("materialReceiptForm","quantity").inputValue(),"2");
      assert.equal(await raw(),before); assert.equal(await data(),beforeData);
      await fail(true);
      try {
        await save("materialReceiptForm");
        assert.equal(await raw(),before); assert.equal(await data(),beforeData);
        assert.equal(await field("materialReceiptForm","quantity").inputValue(),"2");
        assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText());
        await page.evaluate(() => RiceOS.app.renderAll());
        assert.equal(await field("materialReceiptForm","memo").inputValue(),"Dirty receipt draft");
        assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText());
        await shot("failed-save");
      } finally { await fail(false); }
      approve = true; await back(); approve = false;
      assert.equal(await raw(),before); await page.locator("[data-mp-detail]").waitFor();
      await receipt(2); await delivery(2,4);
      const rid = (await material()).purchases.find(p => p.purchaseId === pid).receipts[0].receiptId;
      await shot("partial-receipt"); await returnMaterial(); await current(12,4,16);
      const fields = await page.evaluate(() => {
        const ids = RiceOS.state.activeFields().slice(0,2).map(f => f.fieldId);
        if (!ids.length) throw Error("No fixture fields");
        RiceOS.app.openInput("field-work","materials");
        RiceOS.screens.fieldWork.prefillFields("2026-11-09",ids); return ids;
      });
      await page.locator("#fwName").selectOption("草刈り");
      await page.locator('[data-work-mode-select="detail"]').click();
      await page.locator("#fwMaterialId").selectOption(mid);
      await page.locator("#fwAmount").fill("3袋");
      await save("fieldWorkForm");
      await page.waitForFunction(mid => RiceOS.state.data().fieldWorks.some(w => w.materialId === mid && w.amount === "3袋"),mid);
      assert.equal(await page.evaluate(mid => RiceOS.state.data().fieldWorks.find(w => w.materialId === mid).fieldIds.length,mid),fields.length);
      await back(); await current(9,4,13); await shot("supply13");
      await page.locator("[data-ms-new]").click();
      await field("materialStockForm","quantity").fill("9");
      await field("materialStockForm","memo").fill("Recount after partial delivery");
      await save("materialStockForm"); await current(9,4,13);
      const anchors = JSON.stringify((await material()).stocktakes);
      await openPurchase(); await receipt(1); await delivery(3,3);
      const later = (await material()).purchases.find(p => p.purchaseId === pid).receipts.at(-1).receiptId;
      await returnMaterial(); await current(10,3,13);
      assert.equal(JSON.stringify((await material()).stocktakes),anchors,"Receipt must not rewrite recount snapshots");
      await openPurchase();
      await page.locator(`[data-receipt-edit="${later}"]`).click();
      await field("materialReceiptForm","quantity").fill("2"); await save("materialReceiptForm");
      await delivery(4,2); await returnMaterial(); await current(11,2,13);
      await openPurchase(); before = await raw(); beforeData = await data();
      await page.locator(`[data-receipt-delete="${later}"]`).click(); assert.equal(await raw(),before);
      approve = true; await fail(true);
      try { await page.locator(`[data-receipt-delete="${later}"]`).click(); assert.equal(await raw(),before); assert.equal(await data(),beforeData); assert.ok(await page.locator("#materialsLedgerHost [role=alert]").innerText()); }
      finally { await fail(false); approve = false; }
      approve = true; await page.locator(`[data-receipt-delete="${later}"]`).click(); approve = false;
      assert.equal(await page.locator("#materialsLedgerHost [role=alert]").innerText(),"","Successful cancellation clears the previous failed-write error");
      await delivery(2,4); await returnMaterial(); await current(9,4,13);
      // A receipt already absorbed by the physical recount must not subtract again.
      await openPurchase(); approve = true; await page.locator(`[data-receipt-delete="${rid}"]`).click(); approve = false;
      await delivery(0,6); await returnMaterial(); await current(9,6,15);
      assert.equal(JSON.stringify((await material()).stocktakes),anchors);
      const work = await page.evaluate(mid => RiceOS.state.data().fieldWorks.find(w => w.materialId === mid),mid);
      const remainingProtected = await page.evaluate(id => JSON.stringify(Object.fromEntries(Object.entries(RiceOS.state.data()).filter(([k]) => k !== "materials" && k !== "meta").map(([k,v]) => [k,k === "fieldWorks" ? v.filter(w => w.workId !== id) : v]))),work.workId);
      assert.equal(remainingProtected,protectedData,"Only intended field work may change outside materials");
      const legacy = await page.evaluate(() => {
        const row = {name:"QA legacy delivery",unit:"袋",season:2025,ordered:"old 7",remaining:"old 5",purchases:[{purchaseId:"qa-legacy-p",date:"2026-11-09",season:2026,quantity:5,unit:"袋",unitPrice:0,totalAmount:"",memo:"Preserve legacy"}]};
        if (!RiceOS.state.saveMaterial(row)) throw Error("Legacy seed failed");
        const m = RiceOS.state.data().materials.find(m => m.name === row.name);
        RiceOS.screens.materials.resetForm(); return m.materialId;
      });
      await page.locator(`[data-material-open="${legacy}"]`).click();
      await page.locator("[data-ms-new]").click();
      await field("materialStockForm","quantity").fill("10");
      await save("materialStockForm");
      assert.equal(await page.locator("[data-material-stock-quantity]").innerText(),"10 袋");
      await page.locator("[data-material-purchases]").click();
      await page.locator('[data-mp-open="qa-legacy-p"]').click();
      assert.equal(await page.locator("[data-receipt-new]").count(),0,"Legacy purchase must not acquire manual receiving controls");
      const legacyBefore = await page.evaluate(id => RiceOS.materialPurchases.records(id)[0],legacy);
      assert.equal(await page.evaluate(id => RiceOS.materialPurchases.deliverySummary(RiceOS.materialPurchases.records(id)[0]).legacy,legacy),true);
      await page.locator("[data-mp-edit]").click(); await field("materialPurchaseForm","memo").fill("Legacy memo edited"); await save("materialPurchaseForm");
      const legacyAfter = await page.evaluate(id => RiceOS.materialPurchases.records(id)[0],legacy);
      assert.equal(legacyAfter.deliveryMode,undefined); assert.equal(legacyAfter.quantity,legacyBefore.quantity); assert.equal(legacyAfter.unitPrice,0);
      await back(); await back();
      assert.equal(await page.locator("[data-material-stock-quantity]").innerText(),"10 袋");
      await shot("legacy");
      const collision = await page.evaluate(() => {
        const S = RiceOS.state;
        const data = RiceOS.utils.clone(S.data());
        const purchase = {purchaseId:"qa-shared-purchase",date:"2026-11-09",season:2026,quantity:6,unit:"袋",unitPrice:0,totalAmount:""};
        data.materials.push(
          {materialId:"qa-collision-legacy",name:"QA shared ID legacy",category:"肥料",season:2026,unit:"袋",purchases:[{...purchase}]},
          {materialId:"qa-collision-manual",name:"QA shared ID manual",category:"肥料",season:2026,unit:"袋",purchases:[{...purchase,deliveryMode:"manual",expectedDeliveryDate:"2026-11-10",receipts:[]}]}
        );
        if (!S.replace(data,"QA cross-material purchase ID fixture")) throw Error("Shared purchase ID fixture failed");
        RiceOS.screens.materials.resetForm();
        return {legacy:"qa-collision-legacy",manual:"qa-collision-manual",purchaseId:purchase.purchaseId};
      });
      await page.locator('[data-material-mode="purchases"]').click();
      await page.locator("#mpViewYear").selectOption("all");
      await page.locator("#materialsCategoryFilter").selectOption("all");
      const collisionRow = id => page.locator(`[data-mp-open="${collision.purchaseId}"][data-mp-material="${id}"]`);
      assert.match(await collisionRow(collision.legacy).locator(".mp-delivery-status").innerText(),/旧購入/);
      assert.match(await collisionRow(collision.manual).locator(".mp-delivery-status").innerText(),/未納品 6 袋.*2026-11-10/);
      assert.doesNotMatch(await collisionRow(collision.manual).locator(".mp-delivery-status").innerText(),/旧購入/);
      for (const id of [collision.legacy,collision.manual]) {
        await collisionRow(id).click();
        assert.equal(await page.locator("[data-receipt-new]").count(),id === collision.manual ? 1 : 0);
        await back();
      }
      console.log(`PASS shared purchaseId labels and detail routing ${width}`);
      const stored = await raw(); await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),stored);
      assert.deepEqual(errors,[]);
      console.log(`PASS material delivery ${width}: order6, receipt2, use3/supply13, recount, later receipt/edit/cancel, dirty back, failed writes, annual totals, legacy, reload`);
    } catch (e) {
      failures.push(`${width}: ${e.stack || e}`);
      const file = path.join(os.tmpdir(),`rice-material-delivery-failure-${width}.png`);
      await page.screenshot({path:file,fullPage:true}).catch(() => {}); console.error(`FAIL ${width}: ${e.message}\n${file}`);
    } finally { await context.close(); }
  } } finally { await browser.close(); }
  if (failures.length) throw Error(failures.join("\n\n"));
})().catch(e => { console.error(e); process.exitCode = 1; });
