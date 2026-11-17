"use strict";
const assert = require("node:assert/strict"), os = require("node:os"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    let stage = "fixture";
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.dismiss());
    const click = s => page.locator(`${s}:visible`).click();
    const section = () => page.locator('#screen-harvest-ledger.active [data-harvest-ledger-annual-sales]');
    const amount = () => section().locator('[data-harvest-ledger-annual-sales-amount]');
    const yen = async () => {
      const text = await amount().innerText();
      assert.match(text, /\d/, "A computed amount is numeric");
      return Number(text.replace(/[^0-9]/g, ""));
    };
    const shot = async label => {
      await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
      const file = path.join(os.tmpdir(), `rice-harvest-annual-sales-${label}-${width}.png`);
      await page.screenshot({ path: file }); console.log(file);
    };
    try {
      await page.clock.setFixedTime(new Date("2026-11-15T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto(process.env.HARVEST_ANNUAL_SALES_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const ids = await page.evaluate(() => {
        const S = RiceOS.state, a = S.addVariety("Annual sales A"), b = S.addVariety("Annual sales B");
        const save = (kind, recipient, bags, price, season, varietyId, riceType = "brown", date = "2026-10-20") => {
          const saved = S.saveShipment({ kind, recipient, season, varietyId, date, riceType, packages: [{ kg: 30, bags }], ...(price === undefined ? {} : { pricePer60Kg: price }) });
          if (!saved) throw Error(`Fixture rejected: ${recipient}`);
        };
        save("sale", "Buyer A", 2, 20000, 2026, a); // 20,000 yen
        save("shipment", "Buyer B", 4, 30000, 2026, a, "brown", "2027-01-02"); // 60,000 yen, same crop year
        save("sale", "White rice buyer", 2, 15000, 2026, b, "white"); // 15,000 yen, no weight conversion
        save("sale", "Unclassified variety", 1, 2000, 2026, ""); // 1,000 yen
        save("sale", "Explicit zero", 1, 0, 2026, b);
        save("sale", "Missing price", 1, undefined, 2026, a);
        save("gift", "Gift excluded", 10, 99999, 2026, a);
        save("household", "Household excluded", 10, 99999, 2026, b);
        save("sale", "Prior crop", 1, 18000, 2025, b);
        save("shipment", "Unpriced only", 1, undefined, 2024, a);
        save("gift", "No sales crop", 1, 99999, 2023, a);
        save("sale", "Overflow A", 2, 6000000000000000, 2022, a);
        save("shipment", "Overflow B", 2, 6000000000000000, 2022, b);
        window.__annualSalesWrites = [];
        for (const method of ["setItem", "removeItem", "clear"]) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (...args) { if (this === localStorage && (method === "clear" || String(args[0]) === RiceOS.schema.STORE_KEY)) window.__annualSalesWrites.push(method); return original.apply(this, args); };
        }
        return { a, b };
      });
      const stored = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY), data: JSON.stringify(RiceOS.state.data()) }));
      const baseline = await stored();
      const unchanged = async () => { assert.deepEqual(await stored(), baseline); assert.deepEqual(await page.evaluate(() => window.__annualSalesWrites), []); };
      await click('.nav-item[data-screen="annual"]');
      await page.locator("#annualYear").selectOption("2026");
      await click('[data-annual-harvest-ledger]');
      await page.locator("#screen-harvest-ledger.active").waitFor();
      stage = "first harvest screen current crop total in initial viewport";
      assert.equal(await page.locator("#harvestLedgerSeason").inputValue(), "2026");
      assert.equal(await section().count(), 1); assert.equal(await yen(), 96000);
      assert.match(await section().innerText(), /2026/);
      assert.match(await section().innerText(), /全品種/); assert.match(await section().innerText(), /全相手先|すべての相手先|全販売先/);
      assert.match(await section().innerText(), /未計算\s*1件|未登録\s*1件|1件.*未計算/);
      const viewport = await amount().evaluate(el => {
        const r = el.getBoundingClientRect(), nav = document.querySelector(".bottom-nav"), n = nav?.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return { top: r.top, bottom: r.bottom, height: innerHeight, navTop: n && n.height ? n.top : innerHeight - 60, visible: !!hit && (el === hit || el.contains(hit)), closedDetails: !!el.closest("details:not([open])") };
      });
      assert(viewport.top >= 0 && viewport.bottom <= viewport.navTop && viewport.visible && !viewport.closedDetails, "Annual amount is unobscured in first viewport without scrolling");
      assert.equal(await page.locator("#screen-shipments.active").count(), 0, "Nested shipment ledger never opened");
      assert.equal(await page.locator("#screen-harvest-ledger .hl-more").evaluate(el => el.open), false);
      await unchanged(); await shot("first-screen");
      stage = "variety filter cannot change all-variety annual amount";
      await page.locator("#harvestLedgerVariety").selectOption(ids.a); assert.equal(await yen(), 96000);
      assert.match(await page.locator("#screen-harvest-ledger .hl-sales").innerText(), /選択品種の販売額/);
      assert.match(await page.locator("[data-harvest-ledger-sales]").innerText(), /80,000/);
      await page.locator("#harvestLedgerVariety").selectOption(ids.b); assert.equal(await yen(), 96000);
      assert.match(await page.locator("[data-harvest-ledger-sales]").innerText(), /15,000/);
      await unchanged(); await shot("variety-b");
      stage = "crop-year changes and missing-versus-zero";
      await page.locator("#harvestLedgerSeason").selectOption("2025"); assert.equal(await yen(), 9000);
      assert.match(await section().innerText(), /2025/);
      await page.locator("#harvestLedgerSeason").selectOption("2024"); assert.match(await amount().innerText(), /未計算/);
      await page.locator("#harvestLedgerSeason").selectOption("2023"); assert.equal(await yen(), 0);
      await page.locator("#harvestLedgerSeason").selectOption("2022"); assert.equal((await amount().innerText()).trim(), "集計範囲外");
      await page.locator("#harvestLedgerSeason").selectOption("2026"); assert.equal(await yen(), 96000);
      const direct = await page.evaluate(() => RiceOS.harvestLedger.annualSales(2026));
      console.log(`Annual sales DTO ${width}: ${JSON.stringify(direct)}`);
      await unchanged(); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`PASS independent harvest annual sales ${width}: first viewport/first screen, all varieties/recipients, crop-year scope, shipment/sale only, zero/missing, gift/household excluded, no writes`);
    } catch (error) { console.error(`FAIL harvest annual sales ${width} at ${stage}`); await shot("failure").catch(() => {}); throw error; }
    finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
