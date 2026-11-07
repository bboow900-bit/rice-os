"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.clock.setFixedTime(new Date("2026-10-20T03:00:00Z"));
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const field = await page.evaluate(() => {
        const S = RiceOS.state, id = S.addField("季節確認田");
        const d = RiceOS.utils.clone(S.data());
        d.fieldWorks = [{ workId: "theme-plant", date: "2026-05-14", cropYear: 2026, workName: "田植え", fieldIds: [id] }];
        d.growthLogs = [];
        d.fields = d.fields.filter(f => f.fieldId === id);
        S.replace(d, "QA seasonal fixture");
        return id;
      });
      assert.equal(await page.evaluate(() => document.body.dataset.seasonTheme), "growing");
      await page.evaluate(id => {
        const d = RiceOS.utils.clone(RiceOS.state.data());
        d.growthLogs.push({ logId: "theme-heading", date: "2026-08-01", fieldId: id, headingObserved: true });
        RiceOS.state.replace(d, "QA heading");
      }, field);
      assert.equal(await page.evaluate(() => document.body.dataset.seasonTheme), "heading");
      await page.evaluate(id => {
        const d = RiceOS.utils.clone(RiceOS.state.data());
        d.fieldWorks.push({ workId: "theme-harvest", date: "2026-09-15", cropYear: 2026, workName: "稲刈り", fieldIds: [id], harvestStatusByField: { [id]: "complete" } });
        RiceOS.state.replace(d, "QA completed harvest");
      }, field);
      assert.equal(await page.evaluate(() => document.body.dataset.seasonTheme), "harvested");
      const saved = await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      for (const screen of ["home", "fields", "calendar", "annual", "outlook", "data"]) {
        await page.locator(`.nav-item[data-screen="${screen}"]:visible`).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${screen} overflow`);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(251, 247, 249)", `${screen} background`);
        if (screen === "fields") {
          const card = page.locator(`[data-field-open="${field}"]`);
          assert.match(await card.innerText(), /収穫済み/);
          assert.doesNotMatch(await card.innerText(), /成熟期/);
          await card.click();
          assert.match(await page.locator(".field-hub-now").innerText(), /収穫済み/);
          await page.locator("#appBackButton").click();
          await page.locator(`[data-field-open="${field}"]`).waitFor();
          await page.locator(`[data-field-open="${field}"]`).scrollIntoViewIfNeeded();
        }
        if (screen === "home") {
          await page.locator("[data-home-harvest-completed] > summary").click();
          const card = page.locator(`[data-home-pop-stage="maturity"]`).filter({ hasText: "季節確認田" });
          await card.scrollIntoViewIfNeeded();
          assert.equal(await card.isVisible(), true);
          assert.match(await card.locator(".home-stage-observed").innerText(), /収穫済み/);
          assert.match(await card.locator(".home-stage-outlook").innerText(), /今年の稲刈り完了/);
        }
        if (["home", "fields", "data"].includes(screen)) {
          const shot = path.join(os.tmpdir(), `rice-season-${screen}-${width}.png`);
          await page.screenshot({ path: shot }); console.log(shot);
        }
      }
      assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)), saved, "Viewing must not rewrite farm data");
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("PASS mobile/desktop seasonal palette, harvest card/detail and navigation; saved data unchanged");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
