"use strict";
const assert = require("node:assert/strict");
const {chromium,devices} = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    for (const width of process.argv.includes('--android') ? [360,412] : [360,390,1280]) {
      const context = await browser.newContext({...(process.argv.includes('--android') ? devices['Pixel 7'] : {}),deviceScaleFactor:1,viewport:{width,height:900},serviceWorkers:"block",acceptDownloads:true});
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("https://**/*", route => route.abort());
        await page.goto("http://127.0.0.1:4182/index.html", {waitUntil:"networkidle"});
        await page.locator('.nav-item[data-screen="data"]:visible').click();
        const baseline = await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const entry = page.locator('.common-master-card[data-action="open-system-settings"]');
        assert.equal(await entry.count(),1);
        await entry.screenshot({path:`C:/Users/Keisuke/AppData/Local/Temp/rice-data-management-entry-${width}.png`});
        await page.locator('[data-action="open-system-settings"]').click();
        const panel = page.locator("#systemSettingsPanel");
        await panel.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        assert.equal(await panel.locator("details[open]").count(),0);
        assert.equal(await panel.locator("button:visible").count(),3);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await panel.screenshot({path:`C:/Users/Keisuke/AppData/Local/Temp/rice-data-management-${width}.png`});
        await page.locator('[data-action="open-data-import"]').click();
        assert.equal(await page.locator("#importMode").inputValue(), "inspect");
        assert(await page.locator(".file-button").filter({has:page.locator("#importFile")}).isVisible());
        assert(await page.locator('[data-action="import-json"]').isVisible());
        assert.equal(await page.locator('[data-action="open-data-import"]').getAttribute("aria-expanded"),"true");
        await page.locator("#dataImportOptions > summary").click();
        await page.waitForFunction(() => document.querySelector('[data-action="open-data-import"]').getAttribute('aria-expanded') === 'false');
        await panel.locator("summary").filter({hasText:"その他の操作"}).click();
        for (const action of ["export-csv","import-legacy","restore-backup","undo-last-save","request-persistent-storage","enable-notifications","force-update"]) {
          assert(await panel.locator(`[data-action="${action}"]`).isVisible(),action);
        }
        await panel.locator("summary").filter({hasText:"保存状況・診断"}).click();
        assert(await page.locator("#dataStatus").isVisible());
        assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline);
        const download = page.waitForEvent("download");
        await page.locator('[data-action="export-json"]').click();
        const downloaded=await download;
        assert(downloaded.suggestedFilename().endsWith(".json"));
        if(process.argv.includes('--android')) {
          await page.locator('[data-action="open-data-import"]').click();
          await page.locator('#importFile').setInputFiles(await downloaded.path());
          const beforeImport=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
          await page.locator('[data-action="import-json"]').click();
          await page.locator('#dataImportReport').waitFor({state:'visible'});
          assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),beforeImport);
          await page.locator('#importMode').selectOption('merge');
          let approve=false;
          page.on('dialog',dialog=>approve?dialog.accept():dialog.dismiss());
          await page.locator('[data-action="import-json"]').click();
          assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY)),beforeImport);
          const records=()=>page.evaluate(()=>JSON.stringify(['fields','fieldWorks','growthLogs','irrigations','machines','maintenanceRecords','millingRecords','shipments'].map(key=>RiceOS.state.data()[key])));
          const domain=await records();
          approve=true;
          await page.locator('[data-action="import-json"]').click();
          await page.waitForFunction(()=>document.querySelector('#importFile').value==='');
          assert.equal(await records(),domain,'Reimporting the saved JSON must not duplicate or overwrite registered records');
          console.log(`PASS Android JSON roundtrip ${width}: actual downloaded file, inspect, cancelled merge and confirmed merge without duplicate records`);
        }
        assert.deepEqual(errors,[]);
        console.log(`PASS data management ${width}: compact, import disclosure, preserved advanced actions, actual JSON download`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
