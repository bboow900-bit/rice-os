"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const seed = await page.evaluate(() => {
        const R = RiceOS, date = R.utils.today(), start = date.slice(0, 8) + "01";
        const a = R.state.addField("QA harvest water A"), b = R.state.addField("QA harvest water B");
        for (const id of [a, b]) {
          if (!R.state.saveIrrigation({ irrigationId: `qa-water-${id}`, fieldId: id, method: "稲刈り前の落水", date: start, startDate: start })) throw Error("Water seed failed");
        }
        if (!R.state.saveFieldWork({ workId: "qa-water-harvest", date, workName: "稲刈り", fieldIds: [a, b], harvestStatusByField: { [a]: "partial", [b]: "partial" } })) throw Error("Harvest seed failed");
        R.app.show("home");
        return { a, b, date };
      });
      const count = async () => Number(await page.locator('[data-home-summary-action="water"] b').innerText());
      const before = await count();
      await page.evaluate(() => { RiceOS.app.openInput("field-work", "home"); RiceOS.screens.fieldWork.editWork("qa-water-harvest"); });
      await page.locator(`[data-harvest-field="${seed.a}"][value="complete"]`).check();
      await page.locator('#fieldWorkForm button[type="submit"]').click();
      await page.waitForFunction(id => RiceOS.state.data().irrigations.find(row => row.irrigationId === `qa-water-${id}`)?.actualEndDate, seed.a);
      const boundaries = async () => page.evaluate(ids => ids.map(id => RiceOS.state.data().irrigations.find(row => row.irrigationId === `qa-water-${id}`).actualEndDate), [seed.a, seed.b]);
      assert.deepEqual(await boundaries(), [seed.date, ""]);
      await page.locator('.nav-item[data-screen="home"]:visible').click();
      assert.equal(await count(), before - 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      await page.screenshot({ path: path.join(os.tmpdir(), `rice-harvest-water-${width}.png`) });
      await page.evaluate(() => { RiceOS.app.openInput("field-work", "home"); RiceOS.screens.fieldWork.editWork("qa-water-harvest"); });
      await page.locator('.work-log-card').filter({ has: page.locator('[data-work-action="delete"][data-id="qa-water-harvest"]') }).locator('.work-log-menu summary').click();
      page.once("dialog", dialog => dialog.dismiss());
      await page.locator('[data-work-action="delete"][data-id="qa-water-harvest"]').click();
      assert.deepEqual(await boundaries(), [seed.date, ""]);
      page.once("dialog", dialog => dialog.accept());
      await page.locator('[data-work-action="delete"][data-id="qa-water-harvest"]').click();
      assert.deepEqual(await boundaries(), ["", ""]);
      await page.locator('.nav-item[data-screen="home"]:visible').click();
      assert.equal(await count(), before);
      await page.evaluate(({ a, b, date }) => {
        RiceOS.state.saveFieldWork({ workId: "qa-water-harvest", date, workName: "稲刈り", fieldIds: [a, b], harvestStatusByField: { [a]: "complete", [b]: "partial" } });
        RiceOS.app.show("annual");
        RiceOS.screens.annual.openWaterEditor("irrigation", `qa-water-${a}`);
      }, seed);
      await page.locator('[data-annual-water-edit-form] [name="memo"]').fill('audit memo only');
      await page.locator('[data-annual-water-edit-form] .primary[type="submit"]').click();
      assert.equal(await page.evaluate(id => Boolean(RiceOS.state.data().irrigations.find(row => row.irrigationId === `qa-water-${id}`).harvestAutoEnd), seed.a), true);
      await page.evaluate(id => RiceOS.screens.annual.openWaterEditor("irrigation", `qa-water-${id}`), seed.a);
      assert.equal(await page.locator('[data-annual-water-edit-form] button[type="submit"]').first().getAttribute('class'), 'primary');
      await page.locator('[data-annual-water-edit-form] [name="actualEndDate"]').press('Enter');
      assert.equal(await page.evaluate(id => Boolean(RiceOS.state.data().irrigations.find(row => row.irrigationId === `qa-water-${id}`).harvestAutoEnd), seed.a), true);
      await page.evaluate(id => RiceOS.screens.annual.openWaterEditor("irrigation", `qa-water-${id}`), seed.a);
      await page.locator('[data-annual-water-manual-end]').click();
      assert.equal(await page.evaluate(id => Boolean(RiceOS.state.data().irrigations.find(row => row.irrigationId === `qa-water-${id}`).harvestAutoEnd), seed.a), false);
      await page.evaluate(() => RiceOS.state.deleteFieldWork("qa-water-harvest"));
      assert.deepEqual(await boundaries(), [seed.date, ""]);
      await page.locator('.nav-item[data-screen="home"]:visible').click();
      const countBeforeConflict = await count();
      const conflict = await page.evaluate(() => {
        const R = RiceOS, date = R.utils.today();
        const prior = days => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
        const id = R.state.addField("QA harvest conflicting water");
        R.state.saveIrrigation({ irrigationId: "qa-conflict-water", fieldId: id, startDate: prior(4), date: prior(4), method: "間断灌水", waterMovements: [{ movementId: "qa-conflict-movement", phase: "flood", startDate: prior(1) }] });
        R.state.saveFieldWork({ workId: "qa-conflict-harvest", date: prior(2), workName: "稲刈り", fieldIds: [id], harvestStatusByField: { [id]: "complete" } });
        R.screens.home.render();
        return {
          current: R.agro.managementStatus(R.state.field(id), date),
          historical: R.agro.managementStatus(R.state.field(id), prior(3)),
          raw: R.state.data().irrigations.find(row => row.irrigationId === "qa-conflict-water")
        };
      });
      assert.equal(conflict.current.harvestConflict, true);
      assert.match(conflict.current.label, /収穫後/);
      assert.equal(conflict.historical.harvestConflict, undefined);
      assert.equal(conflict.raw.actualEndDate, '');
      assert.equal(conflict.raw.waterMovements.length, 1);
      assert.equal(await count(), countBeforeConflict);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS harvest water ${width}px: form completion, target-only closure, home count, cancel/delete/reopen, memo-only edit, manual end retained, no overflow/errors`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
