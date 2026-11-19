"use strict";
const assert = require("node:assert/strict");
const { mkdtemp, readFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const presets = [
  ["田植え予定", "assets/images/annual-story/schedule-planting.png"],
  ["除草剤散布予定", "assets/images/annual-story/schedule-herbicide.png"],
  ["稲刈り予定", "assets/images/annual-story/schedule-harvest.png"],
];

async function verify(browser, url, evidence, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block",
  });
  try {
    const origin = new URL(url).origin;
    await context.route("**/*", async (route) => {
      const request = new URL(route.request().url());
      if (request.origin !== origin) return route.abort();
      const file = path.resolve(root, "." + request.pathname);
      if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403 });
      const body = await readFile(file).catch(() => null);
      return body ? route.fulfill({ body, contentType: mime[path.extname(file)] || "application/octet-stream" })
        : route.fulfill({ status: 404 });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const fixture = await page.evaluate(() => ({
      fieldId: RiceOS.state.addField("QA illustrated schedule field"),
      date: RiceOS.utils.today(),
    }));
    assert.ok(fixture.fieldId);
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem(RiceOS.schema.STORE_KEY)));
    const baseline = await stored();
    const form = page.locator("#sheetScheduleForm");
    const picks = form.locator("#sheetSchedulePresetPicks");
    const add = page.locator("[data-calendar-add-plan]");
    await page.locator('.nav-item[data-screen="calendar"]:visible').tap();
    await page.locator("#calendarTargetFilter").selectOption(`field:${fixture.fieldId}`);
    await add.tap();
    await picks.waitFor();
    assert.equal(await picks.locator("img").count(), 0);
    const layoutIssues = [];
    for (const [title] of presets) {
      const button = picks.locator(`[data-schedule-preset="${title}"]`);
      await button.tap();
      assert.equal(await form.locator("#sheetScheduleTitle").inputValue(), title);
      assert.equal(await picks.locator('[aria-pressed="true"]').count(), 1);
      assert.equal(await button.getAttribute("aria-pressed"), "true");
      const layout = await button.evaluate((node) => {
        const card = node.getBoundingClientRect();
        const label = node.querySelector("span").getBoundingClientRect();
        return {
          viewport: document.documentElement.clientWidth,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          clipped: Object.entries({ label }).flatMap(([part, rect]) => {
            const overhang = Math.max(card.left - rect.left, rect.right - card.right,
              card.top - rect.top, rect.bottom - card.bottom);
            return overhang > 1 ? [{ part, pixels: Math.round(overhang * 10) / 10 }] : [];
          }),
        };
      });
      if (layout.viewport !== width || layout.overflow || layout.clipped.length || layout.overlap) {
        layoutIssues.push({ title, ...layout });
      }
    }
    const screenshot = path.join(evidence, `illustrated-schedule-presets-${width}.png`);
    await picks.screenshot({ path: screenshot });
    console.log(`Screenshot: ${screenshot}`);
    await page.locator("button[data-sheet-close]").tap();
    assert.deepEqual(await stored(), baseline, "Selecting a preset and closing must not write data");

    await add.tap();
    assert.equal(await picks.locator('[aria-pressed="true"]').count(), 0);
    const [title] = presets[width === 360 ? 0 : 1];
    await picks.locator(`[data-schedule-preset="${title}"]`).tap();
    await form.locator('button[type="submit"]').tap();
    await page.waitForFunction((title) => RiceOS.state.data().schedules.some((row) => row.title === title), title);
    const saved = await stored();
    const previous = new Set(baseline.schedules.map((row) => row.scheduleId));
    const added = saved.schedules.filter((row) => !previous.has(row.scheduleId));
    assert.equal(added.length, 1);
    assert.equal(added[0].title, title);
    assert.equal(added[0].date, fixture.date);
    assert.deepEqual(added[0].fieldIds, [fixture.fieldId]);
    assert.deepEqual(saved.schedules.filter((row) => previous.has(row.scheduleId)), baseline.schedules);
    await page.reload();
    assert.deepEqual(await page.evaluate((id) => RiceOS.state.data().schedules.find((row) => row.scheduleId === id),
      added[0].scheduleId), added[0]);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px behavior: artwork, selection, cancellation, save and reload (${title})`);
    assert.deepEqual(layoutIssues, [], `Illustrated preset layout: ${JSON.stringify(layoutIssues)}`);
  } finally {
    await context.close();
  }
}

(async () => {
  let browser;
  try {
    const evidence = await mkdtemp(path.join(process.env.SCREENSHOT_DIR || tmpdir(), "rice-preset-qa-"));
    browser = await chromium.launch({
      headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const url = "http://rice-os.test/index.html";
    for (const width of [360, 390]) {
      try {
        await verify(browser, url, evidence, width);
      } catch (error) {
        console.error(`FAIL ${width}px:`, error);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser?.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
