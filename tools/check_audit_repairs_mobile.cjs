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
        const R = window.RiceOS;
        const fieldId = R.state.fields()[0].fieldId;
        const varietyId = R.state.varieties()[0].varietyId;
        const id = "qa-audit-other";
        if (!R.state.saveOtherWork({ otherWorkId: id, date: R.utils.today(), workName: "種籾注文", relatedFieldIds: [fieldId], varietyIds: [varietyId], memo: "audit original" })) throw Error("Seed failed");
        R.app.openInput("other-work", "annual");
        R.screens.otherWork.editWork(id);
        return { id, fieldId, varietyId };
      });
      const selections = async () => {
        assert.equal(await page.locator(`#owFields .selected[data-id="${seed.fieldId}"]`).count(), 1);
        assert.equal(await page.locator(`#owVarieties .selected[data-id="${seed.varietyId}"]`).count(), 1);
      };
      await selections();
      await page.locator('#owMemo').fill('audit changed');
      await page.locator('.nav-item[data-screen="home"]:visible').click();
      await page.evaluate(() => RiceOS.app.show("other-work"));
      await selections();
      await page.locator('#otherWorkForm button[type="submit"]').click();
      const saved = await page.evaluate(id => RiceOS.state.data().otherWorks.find(row => row.otherWorkId === id), seed.id);
      assert.deepEqual(saved.relatedFieldIds, [seed.fieldId]);
      assert.deepEqual(saved.varietyIds, [seed.varietyId]);
      assert.equal(saved.memo, 'audit changed');
      await page.evaluate(id => RiceOS.screens.otherWork.editWork(id), seed.id);
      const deleteButton = page.locator(`[data-other-action="delete"][data-id="${seed.id}"]`);
      page.once('dialog', dialog => dialog.dismiss());
      await deleteButton.click();
      assert.equal(await page.locator('#editOtherWorkId').inputValue(), seed.id);
      page.once('dialog', dialog => dialog.accept());
      await deleteButton.click();
      assert.equal(await page.locator('#editOtherWorkId').inputValue(), '');
      assert.equal(await page.evaluate(id => RiceOS.state.data().otherWorks.some(row => row.otherWorkId === id), seed.id), false);
      await page.locator('#otherWorkForm button[type="submit"]').click();
      assert.equal(await page.evaluate(id => RiceOS.state.data().otherWorks.some(row => row.otherWorkId === id), seed.id), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      await page.screenshot({ path: path.join(os.tmpdir(), `rice-audit-repairs-${width}.png`) });
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS audit repairs ${width}px: edit navigation preserves field/variety/memo; delete cancellation and editor reset; no resurrection/overflow/errors`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
