"use strict";
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const url = process.env.MATERIAL_PLANNING_URL || "http://127.0.0.1:4182/index.html";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      let approve = false, stage = "startup";
      page.on("pageerror", error => errors.push(error.message));
      page.on("dialog", dialog => dialog.type() === "alert" || approve ? dialog.accept() : dialog.dismiss());
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const back = () => page.locator("#appBackButton").click();
      const submit = id => page.locator(`#${id} [type="submit"]`).click();
      const fill = (id, name, value) => page.locator(`#${id} [name="${name}"]`).fill(String(value));
      const revealField = async selector => {
        const field = page.locator(selector);
        const ancestors = field.locator("xpath=ancestor::details");
        for (let i = 0; i < await ancestors.count(); i++) {
          const details = ancestors.nth(i);
          if (await details.getAttribute("open") === null) await details.locator(":scope > summary").click();
        }
        await field.waitFor({ state: "visible" });
      };
      const openPackaging = async () => {
        const details = page.locator("#materialPackaging");
        if (await details.getAttribute("open") === null) {
          await page.locator("#materialPackaging > summary").click();
        }
        await page.locator("#mPackUnit").waitFor({ state: "visible" });
      };
      const failWrites = on => page.evaluate(on => {
        if (on) {
          window.qaPlanningSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === RiceOS.schema.STORE_KEY) throw Error("QA planning write failure");
            return window.qaPlanningSetItem.call(this, key, value);
          };
        } else if (window.qaPlanningSetItem) {
          Storage.prototype.setItem = window.qaPlanningSetItem;
          delete window.qaPlanningSetItem;
        }
      }, on);
      const shot = async name => {
        await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${stage}: horizontal overflow`);
        const file = path.join(os.tmpdir(), `rice-material-planning-${name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
      };
      try {
        await page.clock.setFixedTime(new Date("2026-11-11T03:00:00Z"));
        await page.route("https://**/*", route => route.abort());
        await page.goto(url, { waitUntil: "networkidle" });
        await page.waitForFunction(() => window.RiceOS?.materialPlanning && RiceOS.materialQuantities);
        const unrelated = await page.evaluate(() => JSON.stringify(RiceOS.state.data().materials));
        stage = "master and baseline";
        await page.locator('.nav-item[data-screen="data"]:visible').click();
        await page.locator('[data-jump-screen="materials"]').click();
        await page.locator("[data-material-new]").click();
        await page.locator("#mName").fill("QA planning long-name fertilizer");
        await page.locator("#mUnit").fill("kg");
        await openPackaging();
        await page.locator("#mPackUnit").fill("袋");
        await page.locator("#mPackQuantity").fill("20");
        await page.locator("#mPackBaseUnit").fill("kg");
        await page.locator("#mStockDate").fill("2026-11-10");
        await page.locator("#mStockQuantity").fill("0");
        await page.locator("#saveMaterialButton").click();
        const mid = await page.locator("[data-material-detail]").getAttribute("data-material-detail");
        assert.ok(mid);
        const material = () => page.evaluate(id => RiceOS.state.data().materials.find(m => m.materialId === id), mid);
        const stock = () => page.evaluate(id => RiceOS.materialStock.summary(id).quantity, mid);
        const costs = () => page.evaluate(id => RiceOS.materialPlanning.annualCosts(id, 2026), mid);
        const works = () => page.evaluate(id => RiceOS.state.data().fieldWorks.filter(w => w.materialId === id), mid);
        assert.deepEqual((await material()).packaging, { unit: "袋", quantity: 20, baseUnit: "kg" });
        assert.equal(await stock(), 0);

        stage = "bag purchase and manual receipt";
        await page.locator("[data-ms-purchase]").click();
        assert.equal(await page.locator('#materialPurchaseForm [name="unit"]').inputValue(), "袋");
        await fill("materialPurchaseForm", "date", "2026-11-10");
        await fill("materialPurchaseForm", "season", 2026);
        await fill("materialPurchaseForm", "quantity", 2);
        await fill("materialPurchaseForm", "unitPrice", 2000);
        await submit("materialPurchaseForm");
        await page.locator("[data-mp-detail]").waitFor();
        const pid = await page.locator("[data-mp-detail]").getAttribute("data-mp-detail");
        assert.equal(await stock(), 0, "Pending orders are not actual stock");
        await page.locator("[data-receipt-new]").click();
        await fill("materialReceiptForm", "date", "2026-11-10");
        await fill("materialReceiptForm", "quantity", 1);
        await submit("materialReceiptForm");
        await page.locator("[data-mp-detail]").waitFor();
        assert.equal(await stock(), 20);
        await back();

        stage = "new work through existing form";
        await page.evaluate(() => {
          const ids = RiceOS.state.activeFields().slice(0, 1).map(f => f.fieldId);
          if (!ids.length) throw Error("No active field fixture");
          RiceOS.app.openInput("field-work", "materials");
          RiceOS.screens.fieldWork.prefillFields("2026-11-11", ids);
        });
        await page.locator("#fwName").selectOption("草刈り");
        await page.locator('[data-work-mode-select="detail"]').click();
        await page.locator("#fwMaterialId").selectOption(mid);
        await page.locator("#fwAmount").fill("5kg");
        await submit("fieldWorkForm");
        await page.waitForFunction(id => RiceOS.state.data().fieldWorks.some(w => w.materialId === id && w.amount === "5kg"), mid);
        const original = (await works())[0], snapshot = original.materialUsageSnapshot;
        assert.ok(snapshot, "New work must capture a usage snapshot");
        assert.equal(snapshot.quantity, 5); assert.equal(snapshot.unit, "kg");
        assert.equal(snapshot.cost, 500); assert.equal(snapshot.sourcePurchaseId, pid);
        assert.equal(await stock(), 15);
        await back();

        stage = "cost view and preparation";
        await page.locator(`[data-material-costs="${mid}"]`).click();
        await page.locator("#materialCostYear").selectOption("2026");
        assert.equal(await page.locator(".mp-costs").count(), 1);
        assert.equal((await costs()).purchaseCost, 4000); assert.equal((await costs()).usageCost, 500);
        assert.match(await page.locator(".mp-costs").innerText(), /4,000/);
        assert.match(await page.locator(".mp-costs").innerText(), /500/);
        await shot("costs"); await back();
        await page.locator("[data-material-preparation]").click();
        await page.locator("#materialPlanYear").selectOption("2027");
        const row = () => page.locator(`[data-material-plan="${mid}"]`);
        assert.equal(await page.locator(".mp-preparation").count(), 1);
        const planning = await page.evaluate(id => RiceOS.materialPlanning.planning(id, 2027), mid);
        assert.equal(planning.previousUsage, 5); assert.equal(planning.stock, 15);
        assert.equal(planning.pending, 20); assert.equal(planning.secured, 35);
        await shot("preparation");

        stage = "plan draft back and write failure";
        const beforePlan = await raw();
        await page.locator(`[data-plan-edit="${mid}"]`).click();
        await fill("materialPlanForm", "quantity", 7);
        await fill("materialPlanForm", "memo", "Keep this planning draft");
        await page.evaluate(() => RiceOS.app.renderAll());
        assert.equal(await page.locator('#materialPlanForm [name="memo"]').inputValue(), "Keep this planning draft");
        await back();
        assert.equal(await page.locator("#materialPlanForm").count(), 1);
        assert.equal(await raw(), beforePlan);
        await page.locator("[data-plan-cancel]").click();
        assert.equal(await page.locator("#materialPlanForm").count(), 1);
        await failWrites(true); await submit("materialPlanForm");
        assert.equal(await raw(), beforePlan);
        assert.equal(await page.locator('#materialPlanForm [name="quantity"]').inputValue(), "7");
        assert.ok(await page.locator('#screen-materials [role="alert"]').innerText());
        await page.evaluate(() => RiceOS.app.renderAll());
        assert.equal(await page.locator('#materialPlanForm [name="memo"]').inputValue(), "Keep this planning draft");
        await shot("failed-plan"); await failWrites(false); await submit("materialPlanForm");
        await row().waitFor(); assert.match(await row().innerText(), /7 kg/);
        assert.equal(await stock(), 15); assert.equal((await costs()).purchaseCost, 4000);
        await page.locator(`[data-plan-edit="${mid}"]`).click();
        await fill("materialPlanForm", "quantity", 9);
        const savedPlanRaw = await raw(); approve = true; await back(); approve = false;
        await row().waitFor(); assert.equal(await raw(), savedPlanRaw);
        await page.locator(`[data-plan-edit="${mid}"]`).click();
        await fill("materialPlanForm", "memo", "Discard local back draft");
        approve = true; await page.locator("[data-plan-cancel]").click(); approve = false;
        assert.equal(await raw(), savedPlanRaw);
        await back();

        stage = "master packaging change preserves history";
        const purchaseBefore = JSON.stringify((await material()).purchases);
        await page.locator(`[data-material-edit="${mid}"]`).click();
        await openPackaging();
        await page.locator("#mPackQuantity").fill("25");
        await page.locator("#saveMaterialButton").click();
        assert.equal(JSON.stringify((await material()).purchases), purchaseBefore);
        assert.deepEqual((await works())[0].materialUsageSnapshot, snapshot);
        assert.equal(await stock(), 15); assert.equal((await costs()).usageCost, 500);

        stage = "memo edit and duplicate snapshots";
        await page.evaluate(() => RiceOS.app.openInput("field-work", "materials"));
        const action = name => page.locator(`[data-work-action="${name}"][data-id="${original.workId}"]`);
        const openMenu = async () => {
          const menu = action("edit").locator("xpath=ancestor::details");
          if (await menu.getAttribute("open") === null) await menu.locator("summary").click();
        };
        await openMenu(); await action("edit").click();
        await revealField("#fwMemo");
        await page.locator("#fwMemo").fill("Memo-only edit after packaging change");
        await submit("fieldWorkForm");
        assert.deepEqual((await works()).find(w => w.workId === original.workId).materialUsageSnapshot, snapshot);
        await openMenu(); await action("duplicate").click();
        assert.equal(await page.locator("#fwMaterialId").inputValue(), mid, "Duplicate retains material linkage");
        await revealField("#fwAmount");
        assert.equal(await page.locator("#fwAmount").inputValue(), "5kg");
        await revealField("#fwMemo");
        await page.locator("#fwMemo").fill("New duplicate snapshot");
        await submit("fieldWorkForm");
        await page.waitForFunction(id => RiceOS.state.data().fieldWorks.filter(w => w.materialId === id).length === 2, mid);
        const duplicate = (await works()).find(w => w.workId !== original.workId);
        assert.ok(duplicate.materialUsageSnapshot);
        assert.equal(duplicate.materialUsageSnapshot.packaging.quantity, 25);
        assert.equal(duplicate.materialUsageSnapshot.quantity, 5);
        assert.deepEqual((await works()).find(w => w.workId === original.workId).materialUsageSnapshot, snapshot);
        assert.equal(await stock(), 10);
        await back(); await back();

        stage = "root links and reload";
        await page.locator('[data-material-costs=""]').click();
        await page.locator("#materialCostYear").selectOption("2026");
        await shot("all-costs"); await back();
        await page.locator("[data-material-preparation]").click();
        await page.locator("#materialPlanYear").selectOption("2027"); await row().waitFor();
        await shot("all-preparation");
        const final = { material: await material(), works: await works(), stock: await stock(), costs: await costs() };
        const beforeReload = await raw(); await page.reload({ waitUntil: "networkidle" });
        assert.equal(await raw(), beforeReload);
        assert.deepEqual(await material(), final.material); assert.deepEqual(await works(), final.works);
        assert.equal(await stock(), final.stock); assert.deepEqual(await costs(), final.costs);
        assert.equal(await page.evaluate(id => JSON.stringify(RiceOS.state.data().materials.filter(m => m.materialId !== id)), mid), unrelated);
        assert.deepEqual(errors, []);
        console.log(`PASS material planning ${width}: UI packaging, receipts, usage, costs, plans, back/failure, historical snapshots, duplicate, reload`);
      } catch (error) {
        console.error(`FAIL ${width} at ${stage}`);
        await page.screenshot({ path: path.join(os.tmpdir(), `rice-material-planning-failure-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
