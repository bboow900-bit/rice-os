"use strict";
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => { window.__RICEOS_TEST__ = true; });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const fixture = await page.evaluate(() => {
        const R = window.RiceOS;
        const date = R.utils.today();
        const fieldId = R.state.addField("QA actuals field");
        const addPlan = (id, title, plannedDate = date) => R.state.saveSchedule({ scheduleId: id, date: plannedDate, fieldIds: [fieldId], title });
        addPlan("qa-actuals-delayed", "草刈り予定", R.utils.dateAddDays(date, -1));
        addPlan("qa-actuals-work", "溝切り予定");
        addPlan("qa-actuals-growth", "幼穂確認");
        addPlan("qa-actuals-water", "中干し開始");
        addPlan("qa-actuals-confirm", "中干し確認");
        addPlan("qa-actuals-pending", "防除予定");
        R.state.saveFieldWork({ workId: "qa-actuals-work-row-1", date, fieldIds: [fieldId], workName: "草刈り", sourceScheduleId: "qa-actuals-delayed" });
        R.state.saveFieldWork({ workId: "qa-actuals-work-row-2", date, fieldIds: [fieldId], workName: "溝切り", sourceScheduleId: "qa-actuals-work" });
        R.state.saveGrowthLog({ logId: "qa-actuals-growth-row", date, fieldId, panicleLengthMm: "1.5", sourceScheduleId: "qa-actuals-growth" });
        R.state.saveDryPeriod({ dryPeriodId: "qa-actuals-water-row", date, startDate: date, fieldId, sourceScheduleId: "qa-actuals-water", sourceSchedulePhase: "start" });
        R.state.completeSchedule("qa-actuals-confirm");
        R.state.saveSchedule({ scheduleId: "qa-actuals-stale-water", date, fieldIds: [fieldId], title: "中干し終了", status: "実施済み", completedAt: R.utils.now(),
          completedByWaterPeriodId: "qa-actuals-water-row", completionLink: { kind: "dry", recordId: "qa-actuals-water-row", fieldId, event: "end" } });
        R.state.saveShipment({ shipmentId: "qa-actuals-shipment-row", date, season: Number(date.slice(0, 4)) - 1, recipient: "QA actuals recipient", kind: "gift", riceType: "brown", packages: [{ kg: 30, bags: 1 }] });
        R.app.show("home");
        return { date, fieldId };
      });
      const stored = () => page.evaluate(() => localStorage.getItem("rice_os_v8_stable"));
      const before = await stored();
      assert.equal(await page.locator('[data-home-summary-action="today"] b').innerText(), "5", "Home must count only actual records, not completed plans or traces");
      assert.equal(await page.locator('[data-home-summary-action="overdue"] b').innerText(), "0");
      await page.locator('.nav-item[data-screen="calendar"]:visible').click();
      assert.equal(await page.locator('#selectedDateEntries [data-calendar-action="complete"]').count(), 1);
      await page.locator("#calendarDisplayMode").selectOption("all");
      const actual = page.locator("#selectedDateEntries .calendar-entry-group.actual");
      assert.equal(await actual.locator(".mini-card").count(), 5);
      assert.equal(await actual.locator(".mini-card.schedule, .mini-card.schedule-completed").count(), 0);
      const completed = page.locator("#selectedDateEntries .calendar-entry-group").filter({ has: page.locator("h4", { hasText: "完了した予定" }) });
      assert.equal(await completed.count(), 1);
      assert.ok((await completed.innerText()).includes("中干し確認"), "Manual confirmations must remain visible as completed plans");
      assert.ok((await completed.innerText()).includes("草刈り"), "A delayed-completion trace remains available for audit");
      assert.equal(await page.locator('#selectedDateEntries [data-id="qa-actuals-water"]').count(), 0, "A legacy linked water plan must not duplicate the actual period");
      assert.equal(await page.locator('#selectedDateEntries [data-id="qa-actuals-stale-water"][data-calendar-action="edit"]').count(), 1, "A stale end link without an actual end must remain visible");
      await actual.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `calendar-distinct-actuals-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const annualRows = await page.evaluate(() => RiceOS.annualTest.allRows().map((row) => ({ kind: row.kind, id: row.id })));
      assert.equal(annualRows.filter((row) => row.kind === "schedule" && row.id === "qa-actuals-water").length, 0);
      assert.equal(annualRows.filter((row) => row.id === "qa-actuals-water-row").length, 1);
      assert.equal(annualRows.filter((row) => row.kind === "schedule" && row.id === "qa-actuals-confirm").length, 1);
      assert.equal(annualRows.filter((row) => row.kind === "schedule" && row.id === "qa-actuals-stale-water").length, 1, "Annual history must retain mismatched legacy completion evidence");
      await page.locator('.nav-item[data-screen="annual"]:visible').click();
      await page.locator(`[data-annual-open-field="${fixture.fieldId}"]`).click();
      assert.equal(await page.locator(".annual-field-detail").count(), 1);
      await page.screenshot({ path: path.join(os.tmpdir(), `annual-distinct-actuals-${width}.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator("#appBackButton").click();
      await page.locator('.nav-item[data-screen="home"]:visible').click();
      assert.equal(await page.locator('[data-home-summary-action="today"] b').innerText(), "5");
      assert.equal(await stored(), before, "Displaying and navigating must not modify persisted records");
      assert.deepEqual(errors, []);
      console.log(`PASS actuals ${width}px home counts/calendar groups/legacy water dedup/manual confirmation/annual/back/no data writes`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
