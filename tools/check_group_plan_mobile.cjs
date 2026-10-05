"use strict";
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const R = RiceOS, date = R.utils.today();
        const a = R.state.addField("QA group plan A"), b = R.state.addField("QA group plan B");
        if (!R.state.saveSchedule({ scheduleId: "qa-group-plan", date, title: "草刈り", fieldIds: [a, b], status: "予定" })) throw Error("Schedule seed failed");
        for (const [id, fieldId] of [["qa-group-work-a", a], ["qa-group-work-b", b]]) {
          if (!R.state.saveFieldWork({ workId: id, date, fieldIds: [fieldId], workName: "耕起" })) throw Error("Work seed failed");
        }
      });
      const status = () => page.evaluate(() => RiceOS.state.data().schedules.find(row => row.scheduleId === "qa-group-plan").status);
      const edit = async id => {
        await page.evaluate(workId => { RiceOS.app.openInput("field-work", "calendar"); RiceOS.screens.fieldWork.editWork(workId); }, id);
        await page.locator('#fwName').selectOption({ label: '草刈り' });
        await page.locator('#fieldWorkForm button[type="submit"]').click();
      };
      await edit("qa-group-work-a");
      assert.equal(await status(), "予定");
      await edit("qa-group-work-b");
      assert.equal(await status(), "実施済み");
      await page.locator('.work-log-card').filter({ has: page.locator('[data-work-action="delete"][data-id="qa-group-work-a"]') }).locator('.work-log-menu summary').click();
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('[data-work-action="delete"][data-id="qa-group-work-a"]').click();
      assert.equal(await status(), "実施済み");
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-work-action="delete"][data-id="qa-group-work-a"]').click();
      assert.equal(await status(), "予定");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS group plan ${width}px: form A remains pending, B completes, delete cancellation no-op, delete A reopens, no overflow/errors`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
