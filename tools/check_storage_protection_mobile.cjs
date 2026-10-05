"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true });
      await context.route("https://**/*", route => route.abort());
      const a = await context.newPage(), b = await context.newPage();
      await a.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      await b.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      await a.evaluate(() => RiceOS.state.saveFieldWork({ workId: "qa-concurrent-work", date: RiceOS.utils.today(), workName: "草刈り", fieldIds: [RiceOS.state.fields()[0].fieldId] }));
      const before = await a.evaluate(() => localStorage.getItem("rice_os_v8_stable"));
      let message = "";
      b.once("dialog", async dialog => { message = dialog.message(); await dialog.accept(); });
      await b.evaluate(() => RiceOS.state.saveSeasonNote({ fieldId: RiceOS.state.fields()[0].fieldId, season: 2026, date: RiceOS.utils.today(), text: "stale tab" }));
      assert.match(message, /別のタブ/);
      assert.equal(await a.evaluate(() => localStorage.getItem("rice_os_v8_stable")), before);
      await b.reload({ waitUntil: "networkidle" });
      assert.equal(await b.evaluate(() => RiceOS.state.data().fieldWorks.some(row => row.workId === "qa-concurrent-work")), true);
      await context.close();
      const failed = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true });
      await failed.route("https://**/*", route => route.abort());
      await failed.addInitScript(() => {
        const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        window.qaStoreWrites = 0;
        Storage.prototype.getItem = function (key) { if (key === "rice_os_v8_stable") throw Error("test read failure"); return get.call(this, key); };
        Storage.prototype.setItem = function (key, value) { if (key === "rice_os_v8_stable") window.qaStoreWrites++; return set.call(this, key, value); };
      });
      const page = await failed.newPage();
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      assert.equal(await page.locator('#storageBootFailure').isVisible(), true);
      assert.equal(await page.locator('#storageBootReload').isVisible(), true);
      assert.equal(await page.evaluate(() => window.qaStoreWrites), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      await page.screenshot({ path: path.join(os.tmpdir(), `rice-storage-guard-${width}.png`) });
      await failed.close();
      console.log(`PASS storage ${width}px: stale tab cannot overwrite; reload retains work; boot error visible with no writes/overflow`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
