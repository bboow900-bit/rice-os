"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.clock.setFixedTime(new Date("2026-08-20T03:00:00Z"));
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const baseline = await raw();
      const nav = screen => page.locator(`.nav-item[data-screen="${screen}"]:visible`).click();
      const shot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${name} horizontal overflow`);
        const file = path.join(os.tmpdir(), `rice-ui-rhythm-${name}-${width}.png`);
        await page.screenshot({ path: file }); console.log(file);
      };
      await nav("home"); await shot("home");
      await nav("fields");
      await shot("fields");
      await page.locator("[data-field-open]").first().click();
      await page.locator('[data-field-view="settings"]').click();
      await page.locator(".field-hub-settings").waitFor();
      await shot("field-settings");
      await page.locator("#appBackButton").click();
      await page.locator(".field-hub-list").waitFor();
      await nav("annual");
      await shot("annual");
      const order = await page.locator(".annual-v2-top").evaluate(el => Array.from(el.children).map(x => ({ panel: x.classList.contains("annual-hub-panel"), readiness: x.hasAttribute("data-annual-readiness") })));
      assert(order.findIndex(x => x.panel) < order.findIndex(x => x.readiness), "Main review before auxiliary checks");
      await page.locator('[data-annual-hub-view="work"]').click();
      await page.locator('[data-annual-hub-panel="work"]').waitFor();
      await page.locator('[data-annual-hub-view="compare"]').click();
      await page.locator('[data-annual-hub-panel="compare"]').waitFor();
      await nav("data");
      assert.equal(await page.locator(".common-master-group").count(), 4);
      assert.equal(await page.locator(".common-master-grid > button").count(), 14);
      await shot("masters");
      for (let index = 0; index < 14; index++) {
        await nav("data");
        const button = page.locator(".common-master-grid > button").nth(index);
        const target = await button.getAttribute("data-jump-screen") || (await button.getAttribute("data-open-milling-ledger") !== null ? "results" : "shipments");
        await button.click();
        await page.locator(`#screen-${target}.active`).waitFor();
        const hasBack = await page.locator("#appBackButton").isVisible();
        if (target !== "fields") assert.equal(hasBack, true, `${target} return button`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${target} overflow`);
        if (hasBack) await page.locator("#appBackButton").click();
        else await nav("data");
        await page.locator("#screen-data.active").waitFor();
      }
      await page.locator('[data-action="open-system-settings"]').click();
      assert.equal(await page.locator("#systemSettingsPanel").isVisible(), true);
      await page.locator('[data-action="close-system-settings"]').click();
      assert.equal(await page.locator("#systemSettingsPanel").isVisible(), false);
      await nav("home");
      await page.locator("[data-home-quick-record]").click();
      await page.evaluate(() => RiceOS.bottomSheet.close());
      await page.evaluate(() => RiceOS.app.openInput("field-work", "home"));
      await page.locator("#screen-field-work.active").waitFor();
      assert.equal(await page.locator("#fwDate").evaluate(el => getComputedStyle(el).fontSize), "16px");
      await shot("work-input");
      await page.locator("#appBackButton").click();
      await page.locator("#screen-home.active").waitFor();
      assert.equal(await raw(), baseline, "Viewing, tab switching and cancelled forms must not change records");
      assert.deepEqual(errors, []);
      console.log(`PASS UI rhythm ${width}: 14 master routes/back, field settings, review tabs, input/back, no writes`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
