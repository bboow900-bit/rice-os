"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", hasTouch: width < 600 });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date("2026-11-14T03:00:00Z"));
      await page.route("https://**/*", route => route.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const fieldId = await page.evaluate(() => {
        const S = RiceOS.state, id = S.addField("亀石 右下（検証用）");
        const d = RiceOS.utils.clone(S.data());
        d.fieldWorks.push({ workId: "reflection-primary", date: "2026-09-12", cropYear: 2026, fieldIds: [id], workName: "稲刈り",
          harvestStatusByField: { [id]: "complete" },
          harvestTimingByField: { [id]: { assessment: "appropriate", idealStartDate: "2026-09-10", idealEndDate: "2026-09-13", delayReason: "rain", memo: "雨のあと田面が乾くのを待ち、穂の状態を見て刈り取った。" } },
          harvestReview: { surface: "適度", weeds: "少し", weedNote: "畦際に残草", yieldKg: 1800, harvestAreaA: 30, yieldBasis: "玄米（乾燥調製後）" },
          harvestSnapshots: [{ fieldId: id, harvestDate: "2026-09-12", thermal: { total: 1030, status: "一部欠測", count: 40, expectedDays: 47 } }] });
        if (!S.replace(d, "Isolated harvest reflection fixture")) throw Error("Fixture rejected");
        return id;
      });
      const before = await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      await page.locator('.nav-item[data-screen="annual"]:visible').click();
      await page.locator('#annualYear').selectOption('2026');
      await page.locator(`[data-annual-hub-open-field="${fieldId}"]:visible`).click();
      assert.doesNotMatch(await page.locator('#annualTimeline').innerText(), /収穫済み・今年の一区切り/);
      await page.locator('[data-annual-record-open-id="reflection-primary"]:visible').click();
      const detail = page.locator('.annual-record-detail');
      await detail.waitFor();
      const content = await detail.innerText();
      assert.match(content, /現場での最終判断/); assert.match(content, /適期/);
      assert.match(content, /1800/); assert.match(content, /1030/);
      assert.match(content, /データ上の参考比較/); assert.match(content, /比較できません/);
      assert.match(content, /来年に引き継ぐ材料/); assert.match(content, /畦際に残草/);
      assert.doesNotMatch(content, /undefined|NaN|Invalid Date|刈り遅れ/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const bounds = await detail.locator('.harvest-result-metrics > div').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
      assert(bounds[0].right <= bounds[1].left, 'Result metrics do not overlap');
      await page.screenshot({ path: path.join(os.tmpdir(), `harvest-reflection-primary-${width}.png`), fullPage: true });
      await detail.locator('summary').filter({ hasText: '判断の根拠・水管理・天気の詳細' }).click();
      await detail.locator('[data-annual-harvest-edit]:visible').click();
      await page.locator('#screen-field-work.active').waitFor();
      assert(await page.locator('#fwHarvestTiming').evaluate(node => node.open), 'Existing harvest assessment opens');
      await page.locator('#appBackButton').click();
      await page.locator('#screen-annual.active').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)), before);
      if (!await detail.count()) await page.locator('[data-annual-record-open-id="reflection-primary"]:visible').click();
      await detail.locator('[data-annual-record-detail-back]:visible').click();
      await page.locator('.annual-story').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)), before);
      console.log(`PASS primary harvest reflection ${width}: actual timeline/detail/back, operator judgment, yield, legacy thermal, no writes`);
    } finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
