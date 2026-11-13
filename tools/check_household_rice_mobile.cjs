"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      let approve = false, stage = "fixture";
      page.on("pageerror", e => errors.push(e.message));
      page.on("dialog", d => d.type() === "alert" || approve ? d.accept() : d.dismiss());
      const click = selector => page.locator(`${selector}:visible`).click();
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const data = () => page.evaluate(() => JSON.parse(localStorage.getItem(RiceOS.schema.STORE_KEY)));
      const shot = async name => {
        await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const file = path.join(os.tmpdir(), `rice-household-independent-${name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true }); console.log(file);
      };
      try {
        await page.clock.setFixedTime(new Date("2027-01-15T03:00:00Z"));
        await page.route("https://**/*", r => r.abort());
        await page.goto(process.env.HOUSEHOLD_RICE_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
        const ids = await page.evaluate(() => {
          const S = RiceOS.state, v = S.addVariety("QA household rice"), f = S.addField("QA household field");
          S.updateField(f, { varietyId: v, areaA: 20 });
          if (!S.saveMillingRecord({ date: "2026-10-01", season: 2026, varietyId: v, fieldIds: [f], packages: [{ kg: 30, bags: 20 }], looseKg: 0 })) throw Error("Milling fixture failed");
          if (!S.saveResult({ season: 2026, varietyId: v, yield: "9999", salesAmount: "88888", reflection: "Historical manual source" })) throw Error("Result fixture failed");
          if (!S.saveShipment({ date: "2025-10-02", season: 2025, varietyId: v, kind: "sale", recipient: "QA historical buyer", riceType: "brown", packages: [{ kg: 30, bags: 1, unitPrice: 10000, extra: "preserve" }], pricePer60Kg: 20000, grade: "historical custom grade", destinationName: "historical destination", custom: { retained: true } })) throw Error("Shipment fixture failed");
          const d = RiceOS.utils.clone(S.data());
          d.meta.outlookSnapshots = [...(d.meta.outlookSnapshots || []), { snapshotId: "qa-household-prediction", fieldId: f, season: 2026, asOf: "2026-07-01", headingDate: "2026-07-25", basis: { immutable: true } }];
          if (!S.replace(d, "Household independent fixture")) throw Error("Fixture persistence failed");
          return { v, f };
        });
        const initial = await data();
        const baseline = await page.evaluate(v => ({ stock: RiceOS.state.riceStockFor(2026, v), sales: RiceOS.state.cropYearSettlementFor(2026).sales, history2025: RiceOS.state.cropYearSettlementFor(2025), performance: RiceOS.state.harvestPerformanceFor(2026), ledgerSales: RiceOS.harvestLedger.read(2026, v).salesYen }), ids.v);
        const preserved = async () => {
          const now = await data();
          for (const key of Object.keys(initial).filter(k => !["shipments", "meta"].includes(k))) assert.deepEqual(now[key], initial[key], `Unrelated ${key} changed`);
          for (const row of initial.shipments) assert.deepEqual(now.shipments.find(s => s.shipmentId === row.shipmentId), row);
          assert.deepEqual(now.meta.outlookSnapshots, initial.meta.outlookSnapshots);
        };
        const check = async (remainingKg, whiteCount = 0) => {
          const value = await page.evaluate(v => ({ stock: RiceOS.state.riceStockFor(2026, v), closure: RiceOS.state.cropYearClosureFor(2026), settlement: RiceOS.state.cropYearSettlementFor(2026), history2025: RiceOS.state.cropYearSettlementFor(2025), performance: RiceOS.state.harvestPerformanceFor(2026), ledger: RiceOS.harvestLedger.read(2026, v) }), ids.v);
          assert.equal(value.stock.receivedKg, 600); assert.equal(value.stock.remainingKg, remainingKg);
          assert.equal(value.stock.dispatchedKg, 600 - remainingKg, "Inventory outflow includes household allocation");
          assert.equal(value.stock.whiteShipmentCount, whiteCount);
          assert.equal(value.closure.shipmentsCount, 0, "Household must not satisfy annual shipment prerequisite");
          assert.equal(value.closure.closed, false);
          assert.equal(value.settlement.quantity.remainingKg, remainingKg);
          assert.deepEqual(value.settlement.sales, baseline.sales);
          assert.deepEqual(value.history2025, baseline.history2025);
          assert.deepEqual(value.performance, baseline.performance);
          assert.equal(value.ledger.salesYen, baseline.ledgerSales);
          assert.equal(value.ledger.outgoingKg, 0); assert.equal(value.ledger.giftKg, 0);
          assert.equal(value.ledger.householdKg, 600 - remainingKg);
          await preserved();
        };
        const household = async () => (await data()).shipments.find(s => s.kind === "household" && s.season === 2026);
        const openNew = async () => {
          await click("[data-harvest-ledger-new-shipment]");
          await page.locator("#shipmentKind").selectOption("household");
          await page.locator("#shipmentDate").fill("2027-01-10");
          await page.locator("#shipmentSeason").fill("2026");
          await page.locator("#shipmentVariety").selectOption(ids.v);
          await page.locator("[data-shipment-bags]").first().fill("2");
          for (const selector of ["#shipmentRecipient", "#shipmentPricePer60Kg", "#shipmentGrade", "#shipmentDestinationName"]) assert.equal(await page.locator(selector).isVisible(), false, `${selector} is not household input`);
        };
        await click('.nav-item[data-screen="data"]'); await click("[data-open-harvest-ledger]");
        await page.locator("#harvestLedgerSeason").selectOption("2026"); await page.locator("#harvestLedgerVariety").selectOption(ids.v);
        stage = "new allocation cancel";
        let before = await raw(); await openNew(); approve = true;
        await click('#shipmentForm .form-actions [data-shipment-back]'); approve = false; assert.equal(await raw(), before);
        await click("#appBackButton"); await page.locator("#screen-harvest-ledger.active").waitFor();

        stage = "save without recipient price grade destination";
        await openNew(); await shot("editor"); await click('#shipmentForm [type="submit"]');
        await page.locator("[data-shipment-edit]").waitFor(); const saved = await household();
        assert.ok(saved); assert.equal(saved.recipient, "\u81ea\u5bb6\u7528"); assert.equal(saved.pricePer60Kg == null || saved.pricePer60Kg === "", true);
        assert.equal(saved.grade || "", ""); assert.equal(saved.destinationName || "", "");
        assert.equal(saved.date, "2027-01-10"); assert.equal(saved.season, 2026);
        assert.equal(saved.packages.reduce((n, p) => n + p.kg * p.bags, 0), 60);
        assert.equal(await page.locator(".shipment-detail-sales").count(), 0);
        await check(540); await shot("saved");

        stage = "household-only annual close rejected without writes";
        before = await raw();
        const closed = await page.evaluate(() => RiceOS.state.closeCropYear(2026, { switchToNext: true }));
        assert.equal(closed, null); assert.equal(await raw(), before); await check(540);

        stage = "quantity edit cancel";
        before = await raw(); await click("[data-shipment-edit]"); await page.locator("[data-shipment-bags]").first().fill("9");
        approve = true; await click('#shipmentForm .form-actions [data-shipment-back]'); approve = false;
        assert.equal(await raw(), before); await check(540);

        stage = "quantity edit and preserved identity";
        await click("[data-shipment-edit]"); await page.locator("[data-shipment-bags]").first().fill("3");
        await click('#shipmentForm [type="submit"]'); await page.locator("[data-shipment-edit]").waitFor();
        assert.equal((await household()).shipmentId, saved.shipmentId); assert.equal((await household()).createdAt, saved.createdAt);
        await check(510);

        stage = "white rice is not converted into brown rice";
        await click("[data-shipment-edit]"); await page.locator("#shipmentRiceType").selectOption("white");
        await click('#shipmentForm [type="submit"]'); await page.locator("[data-shipment-edit]").waitFor(); await check(600, 1);
        await click("#appBackButton"); await click("#appBackButton"); await page.locator("#screen-harvest-ledger.active").waitFor();
        assert.equal(await page.locator(".hl-warning[role=status]").isVisible(), true); await shot("white-excluded");
        await click(`[data-harvest-ledger-record="${saved.shipmentId}"]`); await click("[data-shipment-edit]");
        await page.locator("#shipmentRiceType").selectOption("brown"); await click('#shipmentForm [type="submit"]');
        await page.locator("[data-shipment-edit]").waitFor(); await check(510);

        stage = "delete cancel and stock restoration";
        before = await raw(); await click("[data-shipment-delete]"); assert.equal(await raw(), before); await check(510);
        approve = true; await click("[data-shipment-delete]"); approve = false;
        assert.equal(await household(), undefined); await check(600);
        await click("#appBackButton"); await page.locator("#screen-harvest-ledger.active").waitFor(); await shot("restored");
        before = await raw(); await page.reload({ waitUntil: "networkidle" }); assert.equal(await raw(), before); await check(600);
        assert.deepEqual(errors, []);
        console.log(`PASS household independent ${width}: actual routes/new/cancel/save/edit/delete/stock restore/white exclusion/annual prerequisite/year separation/immutable snapshots/reload`);
      } catch (e) {
        console.error(`FAIL household independent ${width} at ${stage}`);
        await page.screenshot({ path: path.join(os.tmpdir(), `rice-household-independent-failure-${width}.png`), fullPage: true }).catch(() => {});
        throw e;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
