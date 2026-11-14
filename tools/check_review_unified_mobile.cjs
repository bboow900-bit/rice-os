"use strict";
const assert = require("node:assert/strict");
const os = require("node:os"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

// Run after integration against the existing preview; never launch a server/profile.
(async () => {
  const findings = [];
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [], dialogs = [];
      let stage = "fixture", discardChanges = false;
      page.on("pageerror", e => errors.push(e.message));
      page.on("dialog", d => {
        dialogs.push(d.message());
        return discardChanges && /取り消|取消|破棄/.test(d.message()) ? d.accept() : d.dismiss();
      });
      const flow = () => page.locator(".annual-story:visible");
      const click = selector => page.locator(selector).filter({ visible: true }).click();
      const record = id => flow().locator(`.annual-year-flow-entry:has([data-annual-record-open-id="${id}"])`);
      const baseline = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const nav = async expected => assert.deepEqual(await page.locator(".nav-item.active").evaluateAll(nodes => nodes.map(n => n.dataset.screen)), [expected], "Exact origin navigation highlight");
      const shot = async name => {
        await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
        const file = path.join(os.tmpdir(), `rice-review-unified-${name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true }); console.log(file);
      };
      const settle = () => page.waitForTimeout(600);
      const category = async value => {
        const menu = flow().locator(".annual-history-filter");
        if (await menu.count()) {
          if (!await menu.evaluate(el => el.open)) await menu.locator(":scope > summary").click();
          await menu.locator(`[data-annual-history-category="${value}"]`).click(); return;
        }
        const labels = { all: "すべて", growth: "生育", work: "作業", water: "水管理", photos: "写真" };
        const explicit = flow().locator(`[data-annual-category="${value}"], [data-annual-record-category="${value}"], [data-annual-category-filter="${value}"]`).filter({ visible: true });
        if (await explicit.count() === 1) { await explicit.click(); return; }
        const selects = flow().locator("select:visible");
        for (let i = 0; i < await selects.count(); i++) {
          const select = selects.nth(i), options = await select.locator("option").evaluateAll(nodes => nodes.map(n => ({ value: n.value, text: n.textContent.trim() })));
          if (!Object.values(labels).every(label => options.some(o => o.text === label))) continue;
          await select.selectOption(options.find(o => o.text === labels[value]).value); return;
        }
        // Semantic fallback still requires one unambiguous category control.
        await flow().getByRole("button", { name: labels[value], exact: true }).click();
      };
      const scrollState = () => flow().evaluate(el => {
        const state = [{ key: "window", top: window.scrollY }];
        for (let n = el; n; n = n.parentElement) {
          if (n.scrollHeight > n.clientHeight + 1 && n !== document.body && n !== document.documentElement) state.push({ key: n.id || `${n.tagName}.${n.className}`, top: n.scrollTop });
        }
        return state;
      });
      try {
        // A non-current crop year catches accidental fallback to today's year.
        await page.clock.setFixedTime(new Date("2027-11-14T03:00:00Z"));
        await page.route("https://**/*", r => r.abort());
        await page.goto(process.env.REVIEW_UNIFIED_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
        const ids = await page.evaluate(() => {
          const S = RiceOS.state, variety = S.addVariety("Unified target variety"), other = S.addVariety("Unified other variety"), field = S.addField("Unified origin field");
          S.updateField(field, { varietyId: variety, areaA: 20 });
          const unharvested = S.addField("Unified unharvested field");
          S.updateField(unharvested, { varietyId: variety, areaA: 10 });
          const d = RiceOS.utils.clone(S.data());
          const work = (id, date, workName, extra = {}) => ({ workId: `unified-${id}`, date, cropYear: 2026, workName, fieldIds: [field], ...extra });
          d.fieldWorks.push(work("cross", "2025-12-20", "耕起"), work("plant", "2026-05-14", "田植え"),
            work("facts", "2026-06-05", "追肥", { machine: "Preserved machine", material: "Preserved material", memo: "Preserved work memo", futureAttribute: { keep: [1, 2] } }),
            work("routine", "2026-06-06", "草刈り"), work("planned", "2026-06-07", "追肥予定"),
            work("old", "2025-05-14", "田植え", { cropYear: 2025 }),
            work("harvest", "2026-09-12", "稲刈り", { memo: "Preserved harvest memo", harvestSnapshots: [{ fieldId: field, harvestDate: "2026-09-12", thermal: { total: 1030, status: "一部欠測", count: 40, expectedDays: 47 } }] }));
          const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=";
          d.growthLogs.push({ logId: "unified-panicle", fieldId: field, date: "2026-07-20", cropYear: 2026, panicleLengthMm: 1, memo: "Preserved growth memo", photoData: photo },
            { logId: "unified-ordinary", fieldId: field, date: "2026-06-10", cropYear: 2026, tillerCount: 20, memo: "Ordinary growth photo", photoData: photo },
            { logId: "unified-heading", fieldId: field, date: "2026-07-27", cropYear: 2026, headingObserved: true });
          d.schedules.push({ scheduleId: "unified-schedule", date: "2026-07-25", cropYear: 2026, title: "追肥予定", fieldIds: [field] });
          d.shipments.push({ shipmentId: "unified-existing-shipment", date: "2027-11-14", season: 2026, kind: "shipment", recipient: "Unified saved recipient", varietyId: variety, riceType: "brown", packages: [{ kg: 30, bags: 1 }] });
          assertFixture(S.replace(d, "Isolated unified review fixture"));
          assertFixture(S.saveDryPeriod({ dryPeriodId: "unified-dry", fieldId: field, cropYear: 2026, date: "2026-06-25", startDate: "2026-06-25", actualEndDate: "2026-07-11" }));
          for (const [season, varietyId, bags] of [[2026, variety, 4], [2025, variety, 100], [2026, other, 100]]) {
            assertFixture(S.saveMillingRecord({ date: "2026-10-01", season, varietyId, fieldIds: season === 2026 && varietyId === variety ? [field] : [], packages: [{ kg: 30, bags }], looseKg: 0, memo: "Preserved milling" }));
          }
          assertFixture(S.saveResult({ season: 2026, varietyId: variety, yield: "9999", reflection: "Legacy result is not stock" }));
          function assertFixture(ok) { if (!ok) throw Error("Fixture rejected"); }
          return { field, variety, unharvested };
        });
        const original = await baseline();
        // Count even byte-identical store writes; setup writes above are intentional.
        await page.evaluate(() => {
          window.__unifiedWrites = [];
          for (const method of ["setItem", "removeItem", "clear"]) {
            const original = Storage.prototype[method];
            Storage.prototype[method] = function (...args) {
              if (this === localStorage && (method === "clear" || String(args[0]) === RiceOS.schema.STORE_KEY)) window.__unifiedWrites.push(method);
              return original.apply(this, args);
            };
          }
        });
        const unchanged = async () => {
          assert.equal(await baseline(), original, "Stored JSON changed during read/cancel");
          assert.deepEqual(await page.evaluate(() => window.__unifiedWrites), [], "Read/cancel called store mutation");
        };
        await click('.nav-item[data-screen="annual"]');
        await page.locator("#annualYear").selectOption("2026");
        await click(`[data-annual-hub-open-field="${ids.field}"]`);
        await flow().waitFor();
        stage = "actual-only category filters";
        assert.equal(await page.locator(".annual-field-tabs:visible, .annual-detail-tabs:visible").count(), 0, "Five field tabs removed");
        const focus = flow().locator('[data-annual-record-focus="all"]');
        if (await focus.count()) await focus.click();
        const expected = { growth: "unified-panicle", work: "unified-facts", water: "unified-dry", photos: "unified-panicle" };
        for (const value of ["all", "growth", "work", "water", "photos"]) {
          await category(value);
          assert.equal(await record("unified-planned").count(), 0); assert.equal(await record("unified-schedule").count(), 0); assert.equal(await record("unified-old").count(), 0);
          if (value !== "all") assert.equal(await record(expected[value]).count(), 1, `${value} retains its actual record`);
          if (["growth", "photos"].includes(value)) assert.equal(await record("unified-facts").count(), 0);
          if (["work", "water"].includes(value)) assert.equal(await record("unified-panicle").count(), 0);
          if (value === "water") assert.equal(await record("unified-facts").count(), 0);
          if (["all", "growth", "photos"].includes(value)) assert.equal(await record("unified-ordinary").count(), 1, "Ordinary actual growth photo retained");
          await unchanged(); await shot(`filter-${value}`);
        }
        await category("all");
        const dateLines = await record("unified-cross").locator("..").locator("time > span").evaluate(el => {
          const r = document.createRange(); r.selectNodeContents(el);
          return { text: el.textContent, lines: [...r.getClientRects()].filter(rect => rect.width > 0).length };
        });
        assert.equal(dateLines.text, "12/20"); assert.equal(dateLines.lines, 1, "Two-digit date remains on one line");
        stage = "art, note and saved partial thermal";
        assert.equal(await flow().locator(".annual-flow-art").count(), 3);
        for (const art of await flow().locator(".annual-flow-art").all()) {
          await art.scrollIntoViewIfNeeded();
          await art.locator("img").evaluate(img => img.decode());
          const good = await art.evaluate(frame => {
            const r = frame.getBoundingClientRect(), open = frame.closest(".annual-year-flow-open"), copy = open.querySelector(".annual-flow-copy").getBoundingClientRect(), t = open.querySelector(".annual-flow-thermal")?.getBoundingClientRect();
            return r.width >= (innerWidth <= 380 ? 88 : 96) && r.height >= (innerWidth <= 380 ? 104 : 112) && copy.right <= r.left + 1 && (!t || t.top >= r.bottom - 1);
          });
          assert(good, "Enlarged artwork and copy/thermal separation retained");
        }
        assert.match(await record("unified-harvest").innerText(), /保存済積算温度 1,030℃（一部取得）/);
        await record("unified-panicle").locator("[data-annual-flow-summary]").click();
        assert.match(await record("unified-panicle").innerText(), /Preserved growth memo/);
        stage = "detail/menu/edit cancel";
        await record("unified-facts").locator("[data-annual-record-open-id]").click();
        await page.locator(".annual-record-detail:visible").waitFor();
        await click("[data-annual-record-detail-back]");
        const menu = () => record("unified-facts").locator("[data-annual-flow-menu-kind]");
        await menu().click(); await click('button[data-annual-record-action="cancel"]');
        await menu().click(); await click('[data-annual-record-action="delete"]'); await unchanged();
        await menu().click(); await click('[data-annual-record-action="edit"]');
        await page.locator("#screen-field-work.active").waitFor();
        const memo = page.locator("#fwMemo");
        await memo.evaluate(el => { for (let n = el.parentElement; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true; });
        await memo.fill("Cancelled unified audit edit"); discardChanges = true;
        await click("#appBackButton"); await flow().waitFor(); discardChanges = false; await unchanged();
        stage = "shared water edit and annual origin";
        await record("unified-dry").locator("[data-annual-flow-menu-kind]").click();
        await click('button[data-annual-record-action="edit"]');
        await page.locator("#screen-irrigation.active").waitFor();
        await page.locator("#waterEditForm:visible").waitFor(); await nav("annual");
        assert.equal(await page.locator("#waterEditType").inputValue(), "dry");
        assert.equal(await page.locator("#waterEditId").inputValue(), "unified-dry");
        assert.equal(await page.locator("#waterEditField").inputValue(), ids.field);
        await shot("shared-water-form");
        await page.locator("#waterEditMemo").fill("Cancelled water edit");
        discardChanges = true; await click("[data-water-cancel-edit]");
        await flow().waitFor(); discardChanges = false; await unchanged();
        stage = "field settings and annual origin";
        await click("[data-annual-field-settings]");
        await page.locator(`#screen-fields.active .field-hub-settings[data-field-master-id="${ids.field}"]`).waitFor();
        await click("#appBackButton"); await flow().waitFor(); await nav("annual"); await unchanged();
        stage = "annual to ledger and exact return";
        const preferredEntry = page.locator('#screen-annual [data-annual-harvest-ledger]:visible');
        const entry = process.env.REVIEW_UNIFIED_ENTRY ? page.locator(process.env.REVIEW_UNIFIED_ENTRY).filter({ visible: true })
          : await preferredEntry.count() ? preferredEntry : page.locator('#screen-annual button[data-annual-results]:visible');
        assert.equal(await entry.count(), 1, "One contextual annual ledger entry (field result redirect or hub primary entry)");
        await entry.scrollIntoViewIfNeeded(); await settle();
        const beforeScroll = await scrollState(), beforeRows = await flow().locator("[data-annual-record-open-id]").evaluateAll(nodes => nodes.map(n => n.dataset.annualRecordOpenId));
        const expanded = await flow().locator('[data-annual-flow-summary][aria-expanded="true"]').evaluateAll(nodes => nodes.map(n => n.dataset.annualFlowSummary));
        await entry.click();
        const ledger = page.locator("#screen-harvest-ledger.active"); await ledger.waitFor(); await nav("annual");
        assert.equal(await page.locator("#harvestLedgerSeason").inputValue(), "2026");
        assert.equal(await page.locator("#harvestLedgerVariety").inputValue(), ids.variety);
        const stock = await page.evaluate(v => RiceOS.harvestLedger.read(2026, v).stock, ids.variety);
        assert.equal(stock.receivedKg, 120, "Other season/variety and legacy result never added to stock");
        stage = "untouched child back and cancel with all dialogs dismissed";
        discardChanges = false;
        for (const child of ["milling", "shipment"]) {
          const cancel = child === "milling" ? "[data-milling-cancel]" : "#shipmentForm .form-actions [data-shipment-back]";
          for (const control of ["#appBackButton", cancel]) {
            await click(`[data-harvest-ledger-new-${child}]`);
            await page.locator(`#${child}Form:visible`).waitFor();
            const dialogCount = dialogs.length;
            await click(control); await ledger.waitFor();
            assert.equal(dialogs.length, dialogCount, `Untouched ${child} must not ask to discard`);
            await nav("annual"); await unchanged();
          }
        }
        for (const child of ["milling", "shipment"]) {
          await click(`[data-harvest-ledger-new-${child}]`);
          const prefix = child === "milling" ? "milling" : "shipment";
          await page.locator(`#${prefix}Form:visible`).waitFor(); await nav("annual");
          assert.equal(await page.locator(`#${prefix}Season`).inputValue(), "2026");
          assert.equal(await page.locator(`#${prefix}Variety`).inputValue(), ids.variety);
          await page.locator(child === "milling" ? "#millingMemo" : "#shipmentRecipient").fill("Cancelled child edit");
          {
            stage = `changed ${child} rejects discard and preserves draft`;
            discardChanges = false;
            const dialogCount = dialogs.length;
            await click("#appBackButton");
            assert.equal(dialogs.length, dialogCount + 1, `Changed ${child} asks before discard`);
            assert.equal(await page.locator(`#${child}Form:visible`).count(), 1);
            assert.equal(await page.locator(child === "milling" ? "#millingMemo" : "#shipmentRecipient").inputValue(), "Cancelled child edit");
            await unchanged(); await shot(`${child}-discard-dismissed`);
          }
          // One app-back per screen state; never hide extra list hops with a loop.
          discardChanges = true;
          stage = `${child} child back`;
          await click("#appBackButton"); await settle();
          if (!await ledger.isVisible()) {
            findings.push(`${width}: ${child} app-back did not return directly to harvest ledger`);
            await unchanged(); await shot(`${child}-back-failure`);
            console.error(`FINDING ${findings.at(-1)}`);
            // Explicit diagnostic recovery, not a passing substitute for direct back.
            await click("#appBackButton"); await ledger.waitFor();
          }
          discardChanges = false; await nav("annual"); await unchanged();
        }
        stage = "failed detail lookup preserves ledger origin";
        await click('[data-harvest-ledger-record="unified-existing-shipment"]');
        await page.locator(".shipment-detail:visible").waitFor(); await nav("annual");
        assert.equal(await page.evaluate(() => RiceOS.screens.shipments.openDetail("unified-missing-id")), false);
        await click("#appBackButton"); await ledger.waitFor(); await unchanged();
        await shot("ledger");
        await click("#appBackButton"); await flow().waitFor(); await settle(); await nav("annual");
        assert.equal(await page.locator("#annualYear").inputValue(), "2026");
        assert.match(await flow().locator(".annual-flow-field-context").innerText(), /Unified origin field/);
        assert.deepEqual(await flow().locator("[data-annual-record-open-id]").evaluateAll(nodes => nodes.map(n => n.dataset.annualRecordOpenId)), beforeRows);
        assert.deepEqual(await flow().locator('[data-annual-flow-summary][aria-expanded="true"]').evaluateAll(nodes => nodes.map(n => n.dataset.annualFlowSummary)), expanded);
        const afterScroll = await scrollState();
        assert.deepEqual(afterScroll.map(r => r.key), beforeScroll.map(r => r.key));
        afterScroll.forEach((r, i) => assert(Math.abs(r.top - beforeScroll[i].top) <= 2, `Origin scroll restored: ${r.key}`));
        await unchanged(); await shot("annual-return");
        stage = "unharvested field has one central ledger entry";
        await page.locator("[data-annual-field-switch]").selectOption(ids.unharvested);
        const unharvestedEntry = page.locator('#screen-annual button[data-annual-results]:visible');
        assert.equal(await unharvestedEntry.count(), 1, "Unharvested field retains one ledger entry");
        await unharvestedEntry.click(); await ledger.waitFor();
        assert.equal(await page.locator("#harvestLedgerSeason").inputValue(), "2026");
        assert.equal(await page.locator("#harvestLedgerVariety").inputValue(), ids.variety);
        await click("#appBackButton"); await flow().waitFor();
        assert.match(await flow().locator(".annual-flow-field-context").innerText(), /Unified unharvested field/);
        await unchanged();
        stage = "same ledger from common master keeps management origin";
        await click('.nav-item[data-screen="data"]');
        await click('#screen-data [data-open-harvest-ledger]'); await ledger.waitFor(); await nav("data");
        await click("[data-harvest-ledger-new-milling]");
        await page.locator("#millingForm:visible").waitFor(); await nav("data");
        await click("#appBackButton"); await ledger.waitFor(); await nav("data");
        await click("#appBackButton"); await page.locator("#screen-data.active").waitFor(); await nav("data");
        await unchanged();
        stage = "standalone calendar shipment and failed lookup cannot inherit ledger origin";
        await click('.nav-item[data-screen="calendar"]');
        await page.locator("#calendarDisplayMode").selectOption("all");
        await click('#calendarGrid [data-date="2027-11-14"]');
        await click('[data-calendar-open-shipment="unified-existing-shipment"]');
        await page.locator(".shipment-detail:visible").waitFor(); await nav("calendar");
        assert.equal(await page.evaluate(() => RiceOS.screens.shipments.openDetail("unified-missing-id", { originOnly: true })), false);
        await click("#appBackButton");
        await page.locator("#screen-shipments.active [data-shipment-new]:visible").waitFor(); await nav("calendar");
        await click("[data-shipment-new]"); await page.locator("#shipmentForm:visible").waitFor();
        const standaloneDialogCount = dialogs.length;
        await click("#appBackButton");
        await page.locator("#screen-shipments.active [data-shipment-new]:visible").waitFor();
        assert.equal(dialogs.length, standaloneDialogCount);
        await click("#appBackButton"); await page.locator("#screen-calendar.active").waitFor(); await nav("calendar");
        await unchanged(); await shot("standalone-origin-restored");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log(`CHECKED unified review ${width}: categories, actual-only, art/thermal, detail/menu/cancel, water/settings, scoped ledger/children, exact annual origin and no store writes; findings=${findings.filter(f => f.startsWith(`${width}:`)).length}`);
      } catch (error) {
        console.error(`FAIL unified review ${width} at ${stage}`);
        await shot("failure").catch(() => {}); throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  assert.deepEqual(findings, [], "Independent unified review route findings");
})().catch(error => { console.error(error); process.exitCode = 1; });
