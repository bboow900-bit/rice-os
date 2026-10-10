"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true,executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 },isMobile: true,hasTouch: true,serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror",e => errors.push(e.message));
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const baseline = await raw();
        const tapResult = async origin => {
          assert.equal(await page.locator("#sheetField").inputValue(),"","Fresh sheet must not preselect a field");
          await page.locator('[data-sheet-add="result"]').tap();
          await page.locator("#screen-results.active").waitFor({ timeout: 5000 });
          assert.equal(await page.evaluate(() => RiceOS.bottomSheet.isOpen()),false);
          assert.equal(await raw(),baseline);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false);
          const file = path.join(os.tmpdir(),`rice-sheet-result-${origin}-${width}.png`); await page.screenshot({ path: file }); console.log(file);
          await page.locator("#appBackButton").tap();
          await page.locator(`#screen-${origin}.active`).waitFor();
          assert.equal(await raw(),baseline);
        };
        await page.locator("[data-home-quick-record]").tap(); await tapResult("home");
        await page.locator('.nav-item[data-screen="calendar"]:visible').tap();
        await page.locator("[data-calendar-add-record]").tap(); await tapResult("calendar");
        await page.evaluate(() => { RiceOS.app.openInput("results","calendar"); RiceOS.screens.results.resetForm(); });
        await page.locator("#rYield").fill("987");
        const variety = await page.locator("#rVariety").inputValue();
        await page.locator("#appBackButton").tap();
        await page.locator("[data-calendar-add-record]").tap();
        await page.locator('[data-sheet-add="work"]').tap();
        await page.locator("#sheetTargetMode").selectOption("group");
        const group = await page.locator("#sheetGroup option").evaluateAll(options => options.find(o => o.value)?.value);
        assert.ok(group); await page.locator("#sheetGroup").selectOption(group);
        await page.locator('[data-sheet-add="result"]').tap(); await page.locator("#screen-results.active").waitFor();
        assert.equal(await page.locator("#rYield").inputValue(),"987","Existing result draft must survive routing");
        assert.equal(await page.locator("#rVariety").inputValue(),variety,"Group must not bind an arbitrary field variety");
        assert.equal(await raw(),baseline);
        await page.locator("#appBackButton").tap(); await page.locator("#screen-calendar.active").waitFor();
        assert.deepEqual(errors,[]); console.log(`PASS sheet result route ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
