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
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("https://**/*", (route) => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const fixture = await page.evaluate(() => {
        const R = window.RiceOS;
        const date = R.utils.today();
        const a = R.state.addField("QA harvest upper");
        const b = R.state.addField("QA harvest lower");
        const c = R.state.addField("QA harvest planned");
        const group = R.state.addFieldGroup("QA harvest group");
        [a, b].forEach((id) => R.state.updateField(id, { fieldGroupId: group }));
        R.state.saveSchedule({ scheduleId: "qa-harvest-group", date, fieldIds: [a, b], title: "稲刈り予定" });
        R.state.saveSchedule({ scheduleId: "qa-harvest-plan", date, fieldIds: [c], title: "稲刈り予定" });
        R.app.show("home");
        return { date, year: date.slice(0, 4), a, b, c, group };
      });
      const stored = () => page.evaluate(() => localStorage.getItem("rice_os_v8_stable"));
      const status = (id) => page.evaluate(({ id, year }) => window.RiceOS.state.harvestStatusForField(id, year), { id, year: fixture.year });
      const schedule = (id) => page.evaluate((id) => window.RiceOS.state.data().schedules.find((row) => row.scheduleId === id), id);
      const choose = (id, value) => page.locator(`[data-harvest-field="${id}"][value="${value}"]`).check();
      const openWork = () => page.evaluate((date) => {
        const R = window.RiceOS;
        R.app.openInput("field-work", "home");
        R.screens.fieldWork.prefillDate(date);
      }, fixture.date);
      const submit = () => page.locator('#fieldWorkForm button[type="submit"]').click();
      assert.equal((await status(fixture.a)).status, "none");
      assert.equal((await status(fixture.c)).status, "none", "A plan is not an actual harvest");
      const before = await stored();
      await openWork();
      await page.locator("#fwName").selectOption("稲刈り");
      await page.locator(`[data-fw-group="${fixture.group}"]`).click();
      await choose(fixture.a, "complete");
      await page.locator("#appBackButton").click();
      assert.equal(await stored(), before, "Cancelling the harvest form must not write data");
      await openWork();
      await page.locator("#fwName").selectOption("稲刈り");
      await page.locator(`[data-fw-group="${fixture.group}"]`).click();
      await submit();
      assert.equal(await stored(), before, "Missing completion choices must block saving");
      await choose(fixture.a, "complete");
      await choose(fixture.b, "partial");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      await page.locator("#fwHarvestCompletion").screenshot({ path: path.join(os.tmpdir(), `harvest-choice-${width}.png`) });
      await submit();
      await page.waitForFunction(() => window.RiceOS.state.data().fieldWorks.some((row) => row.harvestStatusByField));
      const work = await page.evaluate((a) => window.RiceOS.state.data().fieldWorks.find((row) => row.harvestStatusByField && row.fieldIds.includes(a)), fixture.a);
      assert.equal(work.harvestStatusByField[fixture.a], "complete");
      assert.equal(work.harvestStatusByField[fixture.b], "partial");
      assert.equal((await status(fixture.a)).status, "complete");
      assert.equal((await status(fixture.b)).status, "partial");
      assert.equal((await schedule("qa-harvest-group")).status, "予定", "A mixed group must not finish the whole plan");
      await page.evaluate(({ workId, a, date }) => {
        const R = window.RiceOS;
        R.state.saveHarvestThermalSnapshots(workId, [{ fieldId: a, headingDate: R.utils.dateAddDays(date, -40),
          startDate: R.utils.dateAddDays(date, -39), endDate: date, total: 980, status: "保存済み", count: "40", expectedDays: "40" }]);
      }, { workId: work.workId, a: fixture.a, date: fixture.date });
      const saved = await stored();
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await stored(), saved);
      assert.equal((await status(fixture.a)).status, "complete");
      assert.equal((await status(fixture.b)).status, "partial");
      await page.locator('.nav-item[data-screen="annual"]:visible').click();
      await page.locator("#annualYear").selectOption(fixture.year);
      await page.evaluate((id) => window.RiceOS.screens.annual.openField(id, "work"), fixture.a);
      assert.match(await page.locator("#screen-annual").innerText(), /収穫済み/);
      assert.match(await page.locator(".annual-harvest-metrics").innerText(), /980/);
      assert.match(await page.locator(".annual-harvest-metrics").innerText(), /40日/);
      await page.screenshot({ path: path.join(os.tmpdir(), `harvest-reflection-${width}.png`), fullPage: true });
      await page.evaluate((id) => {
        const R = window.RiceOS;
        R.navigation.openField(id, { originScreen: "home" });
        R.app.show("annual");
        R.screens.annual.openField(id, "work");
      }, fixture.a);
      await page.locator("[data-annual-results]").click();
      assert.equal(await page.locator("#screen-results.active").count(), 1);
      assert.equal(await page.locator("#rSeason").inputValue(), fixture.year);
      await page.locator("#appBackButton").click();
      assert.equal(await page.locator("#screen-annual.active").count(), 1);
      assert.match(await page.locator(".annual-detail-head").innerText(), /QA harvest upper/);
      assert.equal(await stored(), saved, "Results and back navigation must not write records");
      await page.locator("[data-annual-reflection-focus]").click();
      assert.equal(await page.locator(".annual-season-notes textarea").count(), 1);
      assert.equal(await stored(), saved, "Starting an unsaved season note must not write records");
      await page.evaluate((id) => window.RiceOS.screens.annual.openField(id, "work"), fixture.b);
      assert.match(await page.locator("#screen-annual").innerText(), /一部実施/);
      await page.locator('.nav-item[data-screen="calendar"]:visible').click();
      await page.locator("#calendarTargetFilter").selectOption(`field:${fixture.c}`);
      await page.locator('[data-calendar-action="complete"][data-id="qa-harvest-plan"]').click();
      await choose(fixture.c, "complete");
      await submit();
      await page.waitForFunction(() => window.RiceOS.state.data().schedules.find((row) => row.scheduleId === "qa-harvest-plan").status === "実施済み");
      assert.equal((await status(fixture.c)).status, "complete");
      const plannedWork = await page.evaluate((id) => window.RiceOS.state.data().fieldWorks.find((row) => row.sourceScheduleId === id), "qa-harvest-plan");
      await page.evaluate((id) => {
        const R = window.RiceOS;
        R.app.openInput("field-work", "annual");
        R.screens.fieldWork.editWork(id);
      }, plannedWork.workId);
      await choose(fixture.c, "partial");
      await submit();
      await page.waitForFunction((id) => window.RiceOS.state.data().fieldWorks.find((row) => row.workId === id).harvestStatusByField[window.RiceOS.state.data().schedules.find((row) => row.scheduleId === "qa-harvest-plan").fieldIds[0]] === "partial", plannedWork.workId);
      assert.equal((await status(fixture.c)).status, "partial");
      assert.equal((await schedule("qa-harvest-plan")).status, "予定");
      await page.evaluate((id) => {
        window.RiceOS.app.openInput("field-work", "annual");
        window.RiceOS.screens.fieldWork.editWork(id);
      }, plannedWork.workId);
      await page.locator(`[data-work-action="delete"][data-id="${plannedWork.workId}"]`).locator("xpath=ancestor::details").locator("summary").click();
      const priorDelete = await stored();
      page.once("dialog", (dialog) => dialog.dismiss());
      await page.locator(`[data-work-action="delete"][data-id="${plannedWork.workId}"]`).click();
      assert.equal(await stored(), priorDelete);
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator(`[data-work-action="delete"][data-id="${plannedWork.workId}"]`).click();
      assert.equal((await status(fixture.c)).status, "none");
      assert.equal((await status(fixture.a)).status, "complete", "Deleting a different field's work must preserve the group record");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.deepEqual(errors, []);
      console.log(`PASS harvest ${width}px direct/group/plan/required/cancel/edit/delete/reload/reflection/no overflow`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
