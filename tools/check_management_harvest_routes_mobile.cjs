"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360,390]) {
    const context = await browser.newContext({ viewport: { width,height:844 },isMobile:true,hasTouch:true,serviceWorkers:"block" });
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("dialog", dialog => dialog.dismiss());
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil:"networkidle" });
      const f = await page.evaluate(() => {
        const S = RiceOS.state, varietyId = S.varieties()[0].varietyId;
        const result = S.saveResult({ season:2026,varietyId,yield:"900",reflection:"Original" });
        if (!result) throw Error("Result fixture failed");
        const milling = S.saveMillingRecord({ date:"2026-10-01",season:2026,varietyId,fieldIds:[],packages:[{kg:30,bags:4}],looseKg:"",memo:"Fixture" });
        if (!milling) throw Error("Milling fixture failed");
        return { varietyId,resultId:S.data().varietyResults.at(-1).resultId };
      });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const stock = () => page.evaluate(v => RiceOS.state.riceStockFor(2026,v),f.varietyId);
      const manage = async () => { await page.locator('.nav-item[data-screen="data"]:visible').click(); };
      const shot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false);
        const file = path.join(os.tmpdir(),`rice-management-harvest-${name}-${width}.png`);
        await page.screenshot({path:file}); console.log(file);
      };
      const initial = await raw();
      await manage(); await page.locator("[data-open-milling-ledger]").click();
      assert.equal(await page.locator("#legacyHarvestResults").evaluate(el => el.open),false);
      assert.equal(await page.locator("#millingForm").isVisible(),false);
      await shot("ledger");
      await page.locator("#legacyHarvestResults > summary").click();
      await page.locator(`[data-result-id="${f.resultId}"] [data-result-action="edit"]`).click();
      await page.locator("#rYield").fill("999"); await page.locator("#resultReset").click();
      assert.equal(await raw(),initial);
      await page.locator("#appBackButton").click(); await page.locator("#screen-data.active").waitFor();
      await page.locator("[data-open-shipment-ledger]").click();
      await page.locator("[data-shipment-new]").click();
      await page.locator("#shipmentDate").fill("2026-10-02");
      await page.locator("#shipmentSeason").fill("2026");
      await page.locator("#shipmentKind").selectOption("gift");
      await page.locator("#shipmentRecipient").fill("QA 配布先");
      await page.locator("#shipmentVariety").selectOption(f.varietyId);
      await page.locator("[data-shipment-bags]").fill("2");
      await shot("gift");
      await page.locator('#shipmentForm button[type="submit"]').click();
      await page.locator("[data-shipment-edit]").waitFor();
      assert.equal((await stock()).remainingKg,60);
      const saved = await raw();
      await page.locator("[data-shipment-edit]").click(); await page.locator("#shipmentRecipient").fill("Cancelled recipient");
      await page.locator('#shipmentForm').getByRole('button',{name:'取り消す',exact:true}).click();
      assert.equal(await raw(),saved);
      await page.locator("[data-shipment-delete]").click(); assert.equal(await raw(),saved);
      await page.locator("#appBackButton").click(); await page.locator("#appBackButton").click();
      await page.locator("#screen-data.active").waitFor();
      await page.locator("[data-open-milling-ledger]").click();
      assert.match(await page.locator("#millingLedgerStock").innerText(),/差引参考在庫 60kg/);
      assert.equal(await raw(),saved);
      await shot("stock");
      await page.locator("[data-milling-new]").click(); await page.locator("#millingMemo").fill("Keep draft");
      await page.evaluate(() => { RiceOS.screens.results.openMillingLedger(); RiceOS.screens.results.showMillingForm(); });
      assert.equal(await page.locator("#millingMemo").inputValue(),"Keep draft");
      assert.equal(await page.locator("#legacyHarvestResults").evaluate(el => el.open),true);
      await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),saved);
      assert.deepEqual(errors,[]); console.log(`PASS management harvest routes ${width}`);
    } finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
