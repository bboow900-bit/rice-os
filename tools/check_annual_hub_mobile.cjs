"use strict";
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    for (const width of [360,390,1280]) {
      const context = await browser.newContext({viewport:{width,height:900}});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://**/*',r=>r.abort());
      await page.goto('http://127.0.0.1:4182/index.html',{waitUntil:'networkidle'});
      const nav = () => page.locator('.nav-item[data-screen="annual"]:visible').click();
      const stored = () => page.evaluate(()=>localStorage.getItem('rice_os_v8_stable'));
      await nav();
      const baseline = await stored();
      const shot = async view => {
        await page.screenshot({path:path.join(os.tmpdir(),`annual-hub-${view}-${width}.png`)});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${view} overflow at ${width}`);
      };
      assert.equal(await page.locator('[data-annual-hub-panel="fields"]').count(),1);
      assert.equal(await page.locator('.annual-work-archive').count(),0);
      assert.equal(await page.locator('.next-season-ideas:visible').count(),0);
      await shot('fields');
      await page.locator('[data-annual-open-field]').first().click();
      assert.equal(await page.locator('.annual-field-detail').count(),1);
      await page.locator('#appBackButton').click();
      await page.screenshot({path:path.join(os.tmpdir(),`annual-hub-back-${width}.png`)});
      assert.equal(await page.locator('[data-annual-hub-panel="fields"]').count(),1);
      await page.locator('[data-annual-hub-view="work"]').click();
      await page.locator('#annualYear').selectOption('2025');
      await shot('work');
      await page.locator('[data-annual-work-list] > summary').click();
      await page.locator('.annual-work-archive [data-annual-action="edit"]').first().click();
      await page.locator('#appBackButton').click();
      assert.equal(await page.locator('[data-annual-hub-panel="work"]').count(),1,'Editing from work view returns to work view');
      await page.locator('[data-annual-work-scope="offField"]').click();
      assert.equal(await page.locator('[data-annual-work-list]').getAttribute('open'),'');
      await page.locator('[data-annual-hub-notes]').click();
      assert.equal(await page.locator('.next-season-ideas:visible').count(),1);
      await page.locator('[data-annual-hub-notes]').click();
      await page.locator('[data-annual-hub-view="compare"]').click();
      await shot('compare');
      await page.locator('[data-annual-hub-compare-field]').first().click();
      assert.equal(await page.locator('[data-annual-close-compare]').count(),1);
      await page.locator('#appBackButton').click();
      assert.equal(await page.locator('[data-annual-hub-panel="compare"]').count(),1);
      await nav();
      assert.equal(await page.locator('[data-annual-hub-panel="fields"]').count(),1);
      assert.equal(await stored(),baseline,'navigation must not mutate records');
      assert.deepEqual(errors,[]);
      console.log(`PASS annual hub ${width}px: views, notes, field/compare back, filter, data unchanged, no overflow`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
