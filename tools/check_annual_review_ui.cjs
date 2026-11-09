"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("https://**/*", route => route.abort());
      await page.route("http://annual-ui.test/**", async route => {
        const file = path.resolve(root, "." + decodeURIComponent(new URL(route.request().url()).pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "Not found" });
        await route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || "application/octet-stream" });
      });
      await page.goto("http://annual-ui.test/index.html", { waitUntil: "networkidle" });
      const fieldId = await page.evaluate(() => {
        const S = RiceOS.state, fieldId = S.activeFields()[0].fieldId;
        const data = RiceOS.utils.clone(S.data());
        data.fieldWorks.push(
          { workId: "annual-ui-current", date: "2026-05-14", cropYear: 2026, workName: "田植え", fieldIds: [fieldId], material: "年度UI検証用資材", hours: "123456.75" },
          { workId: "annual-ui-cross", date: "2025-12-20", cropYear: 2026, workName: "田植え", fieldIds: [fieldId] },
          { workId: "annual-ui-old", date: "2025-05-10", cropYear: 2025, workName: "耕起", fieldIds: [fieldId] }
        );
        data.growthLogs.push({ logId: "annual-ui-growth", fieldId, date: "2026-06-10", cropYear: 2026, tillerCount: 20, photo: "UI photo fixture" });
        S.replace(data, "Annual UI isolated test fixture");
        S.saveDryPeriod({ dryPeriodId: "annual-ui-water", fieldId, cropYear: 2026, date: "2026-06-24", startDate: "2026-06-24", actualEndDate: "2026-07-11" });
        S.saveDryPeriod({ dryPeriodId: "annual-ui-water-cross", fieldId, cropYear: 2026, date: "2025-12-28", startDate: "2025-12-28", actualEndDate: "2026-01-04" });
        return fieldId;
      });
      const stored = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const baseline = await stored();
      await page.locator('.nav-item[data-screen="annual"]:visible').click();
      const year = page.locator("#annualYear");
      await year.selectOption("2026");
      const bounds = await year.boundingBox();
      assert(bounds.width >= 120 && bounds.height >= 44, `readable year selector at ${width}`);
      assert.equal(await year.getAttribute("aria-label"), "振り返る対象年度");
      await page.screenshot({ path: path.join(os.tmpdir(), `annual-review-year-${width}.png`) });
      await page.locator('[data-annual-hub-view="work"]').click();
      await page.locator(".annual-hub-summary > summary").click();
      await page.locator(".annual-summary-board > details > summary").click();
      await page.locator("[data-annual-work-list] > summary").click();
      await page.locator(".annual-used-materials > summary").first().click();
      await page.locator(".annual-material-group > details > summary").click();
      assert.match(await page.locator('.annual-material-work[data-annual-record-open-id="annual-ui-current"]').innerText(), /^5\/14/);
      const entry = id => page.locator(`.annual-archive-preview[data-annual-record-open-id="annual-ui-${id}"]`);
      assert.equal(await entry("current").locator("time").innerText(), "5/14");
      assert.equal(await entry("cross").locator("time").innerText(), "2025/12/20");
      assert.equal(await entry("old").count(), 0);
      assert.match(await page.locator(".annual-summary-milestones").innerText(), /2025\/12\/20.*2026\/5\/14/s);
      const verifyLayout = async () => {
        const failures = await page.locator("#screen-annual").evaluate(screen => {
          const bad = [], panel = screen.querySelector(".annual-hub-panel");
          const items = [...panel.children].filter(el => el.getBoundingClientRect().height);
          for (let i = 1; i < items.length; i++) {
            if (items[i].getBoundingClientRect().top < items[i - 1].getBoundingClientRect().bottom - 1) bad.push("overlapping panel sections");
          }
          for (const card of screen.querySelectorAll(".annual-summary-card")) {
            if (card.querySelector("span").getBoundingClientRect().bottom > card.querySelector("b").getBoundingClientRect().top + 1) bad.push("overlapping summary text");
            if (card.scrollWidth > card.clientWidth + 1) bad.push("summary overflow");
          }
          if (document.documentElement.scrollWidth > innerWidth) bad.push("page overflow");
          return bad;
        });
        assert.deepEqual(failures, [], `layout at ${width}`);
      };
      await verifyLayout();
      await page.locator(".annual-hub-summary").scrollIntoViewIfNeeded();
      const screenshot = path.join(os.tmpdir(), `annual-review-ui-${width}.png`);
      await page.screenshot({ path: screenshot });
      await entry("current").click();
      await page.locator(".annual-record-detail").waitFor();
      assert.match(await page.locator(".annual-record-detail").innerText(), /2026\/5\/14/);
      await page.locator("#appBackButton").click();
      await year.selectOption("all");
      if (await page.locator("[data-annual-work-list]").getAttribute("open") === null) await page.locator("[data-annual-work-list] > summary").click();
      assert.equal(await entry("current").locator("time").innerText(), "2026/5/14");
      assert.equal(await entry("old").locator("time").innerText(), "2025/5/10");
      await verifyLayout();
      await year.selectOption("2025");
      if (await page.locator("[data-annual-work-list]").getAttribute("open") === null) await page.locator("[data-annual-work-list] > summary").click();
      assert.equal(await entry("old").locator("time").innerText(), "5/10");
      await year.selectOption("2026");
      await page.locator('[data-annual-hub-view="fields"]').click();
      await page.locator(`[data-annual-hub-open-field="${fieldId}"]`).click();
      await page.locator('[data-annual-tab="growth"]').click();
      assert.match(await page.locator(".annual-growth-list").innerText(), /6\/10/);
      assert.doesNotMatch(await page.locator(".annual-growth-list").innerText(), /2026\//);
      await page.locator('[data-annual-tab="water"]').click();
      const currentWater = page.locator(".annual-water-period-dates").filter({ hasText: "6/24" });
      assert.match(await currentWater.innerText(), /7\/11/);
      assert.doesNotMatch(await currentWater.innerText(), /2026\//);
      assert.equal(await page.locator(".annual-water-period-dates").filter({ hasText: "2025/12/28" }).count(), 0, "Direct water retains its existing actual-year filter");
      await page.locator('[data-annual-tab="photos"]').click();
      assert.match(await page.locator(".annual-photo-compare-grid").innerText(), /6\/10/);
      assert.doesNotMatch(await page.locator(".annual-photo-compare-grid").innerText(), /2026\//);
      await page.locator("#appBackButton").click();
      await year.selectOption("all");
      await page.locator(`[data-annual-hub-open-field="${fieldId}"]`).click();
      await page.locator('[data-annual-tab="water"]').click();
      const crossWater = page.locator(".annual-water-period-dates").filter({ hasText: "2025/12/28" });
      assert.match(await crossWater.innerText(), /2026\/1\/4/);
      await page.locator('[data-annual-tab="photos"]').click();
      assert.match(await page.locator(".annual-photo-compare-grid").innerText(), /2026\/6\/10/);
      await page.locator('[data-annual-tab="growth"]').click();
      assert.match(await page.locator(".annual-growth-list").innerText(), /2026\/6\/10/);
      assert.equal(await stored(), baseline, "viewing must not alter stored data");
      assert.deepEqual(errors, []);
      console.log(`PASS annual review ${width}px: year, layout, cross-year summary/water, work/material/growth/water/photo dates, all-year dates, detail/back, immutable data; ${screenshot}`);
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
