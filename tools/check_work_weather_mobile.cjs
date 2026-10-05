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
      await page.evaluate(() => {
        const R = RiceOS, fieldId = R.state.fields()[0].fieldId;
        R.state.updateWeatherLocation({ latitude: 37, longitude: 140, label: "QA", source: "manual", updatedAt: R.utils.now() });
        for (const id of ["A", "B"]) R.state.saveFieldWork({ workId: `qa-weather-${id}`, date: R.utils.today(), workName: "草刈り", fieldIds: [fieldId], weather: `saved ${id}`, weatherAuto: { summary: `saved ${id}`, source: "QA" } });
        window.qaWeatherRequests = [];
        R.weather.ensureLocation = async () => R.state.data().meta.weatherLocation;
        R.weather.fetchDaily = (date, location) => new Promise(resolve => window.qaWeatherRequests.push({ date, location, resolve }));
        R.app.openInput("field-work", "home");
        R.screens.fieldWork.editWork("qa-weather-A");
      });
      await page.locator('[data-work-mode-select="detail"]').click();
      await page.locator('[data-action="fetch-work-weather"]').click();
      await page.waitForFunction(() => window.qaWeatherRequests.length === 1);
      const card = page.locator('.work-log-card').filter({ has: page.locator('[data-work-action="edit"][data-id="qa-weather-B"]') });
      await card.locator('.work-log-menu summary').click();
      await card.locator('[data-work-action="edit"]').click();
      await page.evaluate(() => window.qaWeatherRequests[0].resolve({ summary: "stale A", source: "QA" }));
      assert.equal(await page.locator('#fwWeather').inputValue(), 'saved B');
      assert.equal(JSON.parse(await page.locator('#fwWeatherAutoJson').inputValue()).summary, 'saved B');
      assert.doesNotMatch(await page.locator('#fwWeatherStatus').innerText(), /取得中/);
      await page.locator('[data-work-mode-select="detail"]').click();
      await page.locator('[data-action="fetch-work-weather"]').click();
      await page.waitForFunction(() => window.qaWeatherRequests.length === 2);
      await page.evaluate(() => window.qaWeatherRequests[1].resolve({ summary: "fresh B", source: "QA" }));
      await page.waitForFunction(() => document.getElementById('fwWeather').value === 'fresh B');
      await page.locator('#fieldWorkForm button[type="submit"]').click();
      const actual = await page.evaluate(() => RiceOS.state.data().fieldWorks.filter(row => row.workId.startsWith('qa-weather-')).map(row => [row.workId, row.weather]));
      assert.deepEqual(actual, [["qa-weather-A", "saved A"], ["qa-weather-B", "fresh B"]]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS weather ${width}px: real fetch button, pending A/edit B no overwrite, current B result saved, A retained, no overflow/errors`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
