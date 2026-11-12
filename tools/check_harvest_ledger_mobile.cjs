"use strict";
const assert = require("node:assert/strict");
const os = require("node:os"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

// Route and editor selectors are intentionally explicit: no direct screen API navigation.
const UI = {
  ledgerEntry: "[data-open-harvest-ledger]",
  ledger: "#screen-harvest-ledger.active",
  millingNew: "[data-harvest-ledger-new-milling]",
  shipmentNew: "[data-harvest-ledger-new-shipment]",
  grade: "#shipmentGrade"
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      let approve = false, stage = "fixture";
      page.on("pageerror", e => errors.push(e.message));
      page.on("dialog", d => approve ? d.accept() : d.dismiss());
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const data = () => page.evaluate(() => JSON.parse(localStorage.getItem(RiceOS.schema.STORE_KEY)));
      const click = selector => page.locator(`${selector}:visible`).click();
      const shot = async name => {
        await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Horizontal overflow");
        const file = path.join(os.tmpdir(), `rice-harvest-ledger-independent-${name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log(file);
      };
      try {
        await page.clock.setFixedTime(new Date("2026-11-12T03:00:00Z"));
        await page.route("https://**/*", r => r.abort());
        await page.goto(process.env.HARVEST_LEDGER_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
        const fixture = await page.evaluate(() => {
          const S = RiceOS.state, v = S.addVariety("QA independent harvest"), other = S.addVariety("QA other harvest");
          const f = S.addField("QA independent field");
          S.updateField(f, { varietyId: v, areaA: 20 });
          if (!S.saveResult({ season: 2026, varietyId: v, yield: "9999", salesAmount: "999999", reflection: "manual source remains separate", totalKg: 9999, packages: [{ kg: 30, bags: 333 }] })) throw Error("Result fixture");
          const result = S.data().varietyResults.at(-1);
          if (Object.hasOwn(result, "totalKg") || Object.hasOwn(result, "packages")) throw Error("Manual-result whitelist regression");
          if (!S.saveMillingRecord({ date: "2026-10-01", season: 2026, varietyId: v, fieldIds: [f], packages: [{ kg: 30, bags: 4 }], looseKg: 0, memo: "QA existing milling" })) throw Error("Milling fixture");
          if (!S.saveMillingRecord({ date: "2026-10-01", season: 2025, varietyId: v, fieldIds: [], packages: [{ kg: 30, bags: 100 }], looseKg: 0 })) throw Error("Year fixture");
          if (!S.saveMillingRecord({ date: "2026-10-01", season: 2026, varietyId: other, fieldIds: [], packages: [{ kg: 30, bags: 100 }], looseKg: 0 })) throw Error("Variety fixture");
          const d = RiceOS.utils.clone(S.data());
          const shipment = (id, extra) => ({ shipmentId: id, date: "2026-10-02", season: 2026, kind: "sale", recipient: "QA historical buyer", varietyId: v, riceType: "brown", packages: [{ kg: 30, bags: 1, unitPrice: 5000, custom: "preserve" }], pricePer60Kg: 20000, custom: { snapshot: true }, ...extra });
          d.shipments.push(shipment("qa-old-brown", { grade: "custom historical grade", destinationName: "historical destination", futureAttribute: { nested: [1, "keep"] } }), shipment("qa-old-white", { riceType: "white", packages: [{ kg: 30, bags: 10 }] }), shipment("qa-unknown-variety", { varietyId: "" }), shipment("qa-unknown-type", { inventoryRiceTypeUnverified: true }), shipment("qa-unknown-quantity", { packages: [], quantity: "handwritten unknown" }));
          d.fieldWorks.push({ workId: "qa-seed-snapshot", date: "2026-04-01", targetScope: "offField", workName: "soaking", seedPreparation: { varietyId: v, process: "soaking", settingsSnapshot: { soakingWaterTemperatureC: "12", custom: "keep" }, memo: "immutable seed" } });
          d.meta.outlookSnapshots = [...(d.meta.outlookSnapshots || []), { snapshotId: "qa-old-prediction", fieldId: f, season: 2025, asOf: "2025-07-01", headingDate: "2025-07-25", headingKind: "master", basis: { custom: "immutable prediction" } }];
          if (!S.replace(d, "Independent harvest fixture")) throw Error("Fixture persistence");
          return { v, f };
        });
        const stock = () => page.evaluate(v => RiceOS.state.riceStockFor(2026, v), fixture.v);
        const checkStock = async (received, dispatched) => {
          const s = await stock();
          assert.equal(s.receivedKg, received); assert.equal(s.dispatchedKg, dispatched); assert.equal(s.remainingKg, received - dispatched);
          assert.equal(s.whiteShipmentCount, 1); assert.equal(s.unclassifiedCount, 1); assert.equal(s.unquantifiedCount, 2);
          const ledger = await page.evaluate(v => RiceOS.harvestLedger.read(2026, v), fixture.v);
          assert.deepEqual(ledger.stock, s, "New ledger must use the existing stock contract");
          assert.equal(ledger.outgoingKg + ledger.giftKg, dispatched);
          assert.equal(ledger.legacyCount, 1, "Manual result retained but never added to stock");
        };
        const initial = await data();
        const protectedData = d => Object.fromEntries(Object.entries(d).filter(([k]) => !["millingRecords", "shipments", "shipmentPrices", "meta"].includes(k)));
        const preserved = async () => {
          const d = await data();
          assert.deepEqual(protectedData(d), protectedData(initial), "Unrelated persisted records changed");
          assert.deepEqual(d.meta.outlookSnapshots, initial.meta.outlookSnapshots, "Old predictions changed");
          for (const old of initial.shipments) {
            const current = d.shipments.find(r => r.shipmentId === old.shipmentId);
            assert.deepEqual({ ...current, updatedAt: old.updatedAt }, old, "Historical shipment snapshot changed");
          }
          for (const old of initial.millingRecords) assert.deepEqual(d.millingRecords.find(r => r.millingId === old.millingId), old);
        };
        await checkStock(120, 30);

        stage = "common master to new ledger";
        await click('.nav-item[data-screen="data"]');
        const beforeOpen = await raw();
        await click(UI.ledgerEntry); await page.locator(UI.ledger).waitFor({ state: "visible" });
        assert.equal(await raw(), beforeOpen, "Opening ledger must not persist or migrate records");
        await page.locator("#harvestLedgerSeason").selectOption("2026");
        await page.locator("#harvestLedgerVariety").selectOption(fixture.v);
        await shot("ledger");

        stage = "milling create and back";
        await click(UI.millingNew);
        await page.locator("#millingDate").fill("2026-10-03"); await page.locator("#millingSeason").fill("2026");
        await page.locator("#millingVariety").selectOption(fixture.v);
        await click('[data-milling-add-package="30"]');
        await page.locator("[data-milling-bags]").last().fill("6");
        await page.locator("#millingLooseKg").fill("5"); await page.locator("#millingMemo").fill("QA independent new milling");
        await shot("milling-form"); await click('#millingForm [type="submit"]');
        const milling = (await data()).millingRecords.find(r => r.memo === "QA independent new milling");
        assert.ok(milling); assert.equal(milling.packages.reduce((n, p) => n + p.kg * p.bags, 0) + milling.looseKg, 185);
        await checkStock(305, 30); await preserved();
        await click("#appBackButton");
        if (!await page.locator(UI.ledger).count()) await click("#appBackButton");
        await page.locator(UI.ledger).waitFor();
        await click("#appBackButton");
        await page.locator("#screen-data.active").waitFor();

        stage = "shipment create cancel";
        await click(UI.ledgerEntry); const beforeCancel = await raw();
        await click(UI.shipmentNew); await page.locator("#shipmentRecipient").fill("QA cancelled new");
        approve = true; await click('#shipmentForm .form-actions [data-shipment-back]'); approve = false;
        assert.equal(await raw(), beforeCancel);

        stage = "shipment new save detail";
        await click("#appBackButton"); await page.locator(UI.ledger).waitFor();
        await click(UI.shipmentNew);
        await page.locator("#shipmentDate").fill("2027-01-02"); await page.locator("#shipmentSeason").fill("2026");
        await page.locator("#shipmentKind").selectOption("sale"); await page.locator("#shipmentRecipient").fill("QA independent buyer");
        await page.locator("#shipmentVariety").selectOption(fixture.v); await page.locator("#shipmentRiceType").selectOption("brown");
        await page.locator("[data-shipment-bags]").first().fill("2"); await page.locator("#shipmentPricePer60Kg").fill("24000");
        const grade = page.locator(UI.grade);
        const gradeValue = await grade.evaluate(el => el.tagName === "SELECT" ? Array.from(el.options).find(o => o.value)?.value : "QA grade 1");
        assert.ok(gradeValue, "Grade control needs a nonblank option");
        if (await grade.evaluate(el => el.tagName === "SELECT")) await grade.selectOption(gradeValue); else await grade.fill(gradeValue);
        await page.locator("#shipmentMemo").fill("QA independent shipment"); await shot("shipment-form");
        await click('#shipmentForm [type="submit"]'); await page.locator("[data-shipment-edit]").waitFor();
        const saved = (await data()).shipments.find(r => r.memo === "QA independent shipment");
        assert.ok(saved); assert.equal(saved.pricePer60Kg, 24000); assert.equal(saved.grade, gradeValue); assert.equal(saved.season, 2026);
        assert.match(await page.locator(".shipment-detail").innerText(), /24,000/);
        assert.ok((await page.locator(".shipment-detail").innerText()).includes(gradeValue));
        await checkStock(305, 90); await preserved(); await shot("shipment-detail");

        stage = "shipment edit cancel and grade price edit";
        const beforeEdit = await raw(); await click("[data-shipment-edit]");
        await page.locator("#shipmentPricePer60Kg").fill("99999");
        approve = true; await click('#shipmentForm .form-actions [data-shipment-back]'); approve = false;
        assert.equal(await raw(), beforeEdit);
        await click("[data-shipment-edit]"); await page.locator("#shipmentPricePer60Kg").fill("26000");
        const changedGrade = await page.locator(UI.grade).evaluate((el, old) => el.tagName === "SELECT" ? Array.from(el.options).find(o => o.value && o.value !== old)?.value : "QA grade 2", gradeValue);
        assert.ok(changedGrade, "Grade editor needs a second grade");
        if (await page.locator(UI.grade).evaluate(el => el.tagName === "SELECT")) await page.locator(UI.grade).selectOption(changedGrade); else await page.locator(UI.grade).fill(changedGrade);
        await click('#shipmentForm [type="submit"]'); await page.locator("[data-shipment-edit]").waitFor();
        const edited = (await data()).shipments.find(r => r.shipmentId === saved.shipmentId);
        assert.equal(edited.grade, changedGrade); assert.equal(edited.pricePer60Kg, 26000); assert.equal(edited.createdAt, saved.createdAt);
        assert.deepEqual(edited.packages, saved.packages); await checkStock(305, 90);

        stage = "master rate must not rewrite saved shipment";
        await click("#appBackButton"); await click("[data-shipment-price-settings] > summary");
        await page.locator("#shipmentPriceSeason").fill("2026"); await page.locator("#shipmentPriceRecipient").fill("QA independent buyer");
        await page.locator("#shipmentPriceRate").fill("30000"); await click("[data-shipment-price-save]");
        assert.deepEqual((await data()).shipments.find(r => r.shipmentId === saved.shipmentId), edited);
        await click(`[data-shipment-open="${saved.shipmentId}"]`);

        stage = "delete cancel and confirm";
        const beforeDelete = await raw(); await click("[data-shipment-delete]"); assert.equal(await raw(), beforeDelete);
        approve = true; await click("[data-shipment-delete]"); approve = false;
        assert.ok(!(await data()).shipments.some(r => r.shipmentId === saved.shipmentId)); await checkStock(305, 30); await preserved();
        await click("#appBackButton"); await page.locator(UI.ledger).waitFor(); await shot("final-stock");
        stage = "history source detail and return";
        const beforeSource = await raw();
        await click(`[data-harvest-ledger-record="${milling.millingId}"]`);
        await page.locator("#screen-results.active").waitFor();
        assert.ok((await page.locator("#screen-results.active").innerText()).includes("QA independent new milling"));
        await shot("source-detail");
        await click("#appBackButton");
        if (!await page.locator(UI.ledger).count()) await click("#appBackButton");
        await page.locator(UI.ledger).waitFor(); assert.equal(await raw(), beforeSource);
        stage = "stored grade destination and unknown fields UI roundtrip";
        await click('[data-harvest-ledger-record="qa-old-brown"]');
        await page.locator("[data-shipment-edit]").waitFor(); await click("[data-shipment-edit]");
        assert.equal(await page.locator("#shipmentGrade").inputValue(), "custom historical grade");
        assert.equal(await page.locator("#shipmentDestinationName").inputValue(), "historical destination");
        await click('#shipmentForm [type="submit"]'); await page.locator("[data-shipment-edit]").waitFor();
        await preserved(); await checkStock(305, 30);
        await click("#appBackButton"); await click("#appBackButton"); await page.locator(UI.ledger).waitFor();

        stage = "milling source CRUD cancel and back";
        await click(`[data-harvest-ledger-record="${milling.millingId}"]`);
        const editMilling = `[data-milling-detail="${milling.millingId}"] [data-milling-action="edit"]`;
        const deleteMilling = `[data-milling-detail="${milling.millingId}"] [data-milling-action="delete"]`;
        const beforeMillingEdit = await raw(); await click(editMilling);
        await page.locator("#millingMemo").fill("QA cancelled source edit");
        await click("[data-milling-cancel]"); assert.equal(await raw(), beforeMillingEdit);
        await click(editMilling); await page.locator("[data-milling-bags]").first().fill("7");
        await click('#millingForm [type="submit"]'); await checkStock(335, 30); await preserved();
        const beforeMillingDelete = await raw(); await click(deleteMilling); assert.equal(await raw(), beforeMillingDelete);
        approve = true; await click(deleteMilling); approve = false;
        assert.ok(!(await data()).millingRecords.some(r => r.millingId === milling.millingId));
        await checkStock(120, 30); await preserved();
        await click("#appBackButton");
        if (!await page.locator(UI.ledger).count()) await click("#appBackButton");
        await page.locator(UI.ledger).waitFor(); await shot("source-crud-final");
        await click("#appBackButton"); await page.locator("#screen-data.active").waitFor();
        const final = await raw(); await page.reload({ waitUntil: "networkidle" }); assert.equal(await raw(), final); await checkStock(120, 30); await preserved();
        assert.deepEqual(errors, []);
        console.log(`PASS harvest ledger independent ${width}: actual routes/milling/shipment/grade/price/cancel/delete/year and variety isolation/stock restrictions/snapshots/reload`);
      } catch (e) {
        console.error(`FAIL harvest ledger independent ${width} at ${stage}`);
        await page.screenshot({ path: path.join(os.tmpdir(), `rice-harvest-ledger-independent-failure-${width}.png`), fullPage: true }).catch(() => {});
        throw e;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
