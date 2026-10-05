"use strict";
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      const before = await page.evaluate(() => localStorage.getItem("rice_os_v8_stable"));
      const count = await page.locator('.common-master-card[data-jump-screen]').count();
      for (let index = 0; index < count; index++) {
        const card = page.locator('.common-master-card[data-jump-screen]').nth(index);
        const target = await card.getAttribute('data-jump-screen');
        await card.click();
        assert.equal(await page.locator(`#screen-${target}`).evaluate(el => el.classList.contains('active')), true);
        if (target !== 'fields') {
          assert.equal(await page.locator('#appBackButton').isVisible(), true, `${target} back`);
          await page.locator('#appBackButton').click();
          assert.equal(await page.locator('#screen-data').evaluate(el => el.classList.contains('active')), true, `${target} return`);
        } else await page.locator('.nav-item[data-screen="data"]:visible').click();
        assert.equal(await page.locator('.nav-item:visible').count(), 6);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      }
      assert.equal(await page.evaluate(() => localStorage.getItem("rice_os_v8_stable")), before);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS masters ${width}px: ${count} entries, child back returns management, field root independent, six navigation items, read-only/no overflow/errors`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
