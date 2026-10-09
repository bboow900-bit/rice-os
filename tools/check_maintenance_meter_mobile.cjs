"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true,executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 },isMobile: true,hasTouch: true,serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror",e => errors.push(e.message));
        await page.route("https://**/*",route => route.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(() => {
          const R = RiceOS;
          const machineId = R.state.saveMachine({ name: "QA meter tractor",category: "トラクター",meterHours: "800",memo: "Isolated fixture" });
          const maintenanceId = R.state.saveMaintenanceRecord({ machineId,date: R.utils.today(),item: "エンジンオイル",kind: "交換",meterHours: "8120",memo: "QA maintenance" });
          if (!machineId || !maintenanceId) throw Error("Machine fixture failed");
          return { machineId,maintenanceId };
        });
        const snapshot = () => page.evaluate(() => ({ data: JSON.stringify(RiceOS.state.data()),raw: localStorage.getItem(RiceOS.schema.STORE_KEY) }));
        const meter = async expected => {
          assert.equal(await page.evaluate(id => String(RiceOS.state.machine(id).meterHours),f.machineId),String(expected));
          assert.match(await page.locator(".machine-summary-card").innerText(),new RegExp(`\\b${expected}h\\b`));
        };
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width} horizontal overflow`);
          const file = path.join(os.tmpdir(),`rice-maintenance-meter-${label}-${width}.png`);
          await page.screenshot({ path: file }); console.log(file);
        };
        const open = async id => page.locator(`[data-maintenance-open="${id}"]`).click();
        const save = () => page.locator('#maintenanceForm button[type="submit"]').click();
        const remove = () => page.locator("[data-maintenance-delete]");
        const confirm = async accept => {
          const handled = new Promise((resolve,reject) => page.once("dialog",async d => {
            try { assert.equal(d.type(),"confirm"); assert.match(d.message(),/整備記録を削除/); await (accept ? d.accept() : d.dismiss()); resolve(); }
            catch (e) { await d.dismiss().catch(() => {}); reject(e); }
          }));
          await remove().click(); await handled;
        };
        const failure = async on => page.evaluate(on => {
          if (on) {
            window.qaMaintenanceSetItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function(key,value) {
              if (key === RiceOS.schema.STORE_KEY) throw Error("QA storage rejection");
              return window.qaMaintenanceSetItem.call(this,key,value);
            };
          } else { Storage.prototype.setItem = window.qaMaintenanceSetItem; delete window.qaMaintenanceSetItem; }
        },on);
        await page.locator('.nav-item[data-screen="data"]:visible').click();
        await page.locator('[data-jump-screen="machines"]').click();
        await page.locator(`[data-machine-open="${f.machineId}"]`).click();
        await meter(8120);
        await open(f.maintenanceId);
        await page.locator('#maintenanceForm [name="meterHours"]').fill("812");
        await page.locator('#maintenanceForm [name="memo"]').fill("Corrected draft");
        const beforeFailure = await snapshot();
        await failure(true);
        await save();
        assert.deepEqual(await snapshot(),beforeFailure,"Failed save must preserve canonical data");
        assert.equal(await page.locator('#maintenanceForm [name="meterHours"]').inputValue(),"812");
        await confirm(true);
        assert.deepEqual(await snapshot(),beforeFailure,"Failed delete must preserve canonical data");
        assert.equal(await page.locator('#maintenanceForm [name="memo"]').inputValue(),"Corrected draft");
        assert.equal(await remove().getAttribute("data-maintenance-delete"),f.maintenanceId);
        await shot("failed-editor");
        await failure(false);
        await save();
        await meter(812);
        await shot("corrected");
        await open(f.maintenanceId);
        const beforeCancel = await snapshot();
        await confirm(false);
        assert.deepEqual(await snapshot(),beforeCancel,"Cancelled deletion must be a no-op");
        assert.equal(await page.locator('#maintenanceForm [name="meterHours"]').inputValue(),"812");
        await confirm(true);
        await meter(800);
        assert.equal(await page.locator(`[data-maintenance-open="${f.maintenanceId}"]`).count(),0);
        await shot("baseline-restored");

        await page.locator(`[data-machine-edit="${f.machineId}"]`).click();
        await page.locator('#machineForm [name="meterHours"]').fill("1200");
        await page.locator('#machineForm button[type="submit"]').click();
        await meter(1200);
        await page.locator('[data-maintenance-add="エンジンオイル"]').click();
        await page.locator('#maintenanceForm [name="meterHours"]').fill("900");
        await save();
        await meter(1200);
        const nextId = await page.evaluate(id => RiceOS.state.maintenanceRecordsFor(id)[0].maintenanceId,f.machineId);
        await open(nextId);
        await page.locator('#maintenanceForm [name="meterHours"]').fill("910");
        await save();
        await meter(1200);
        await open(nextId);
        await confirm(true);
        await meter(1200);
        const beforeReload = await snapshot();
        await page.reload({ waitUntil: "networkidle" });
        assert.equal((await snapshot()).raw,beforeReload.raw);
        await page.locator('.nav-item[data-screen="data"]:visible').click();
        await page.locator('[data-jump-screen="machines"]').click();
        await page.locator(`[data-machine-open="${f.machineId}"]`).click();
        await meter(1200);
        assert.equal(await page.locator(".machine-history-row").count(),0);
        const blankId = await page.evaluate(id => RiceOS.state.saveMaintenanceRecord({ machineId: id,date: RiceOS.utils.today(),item: "空欄の旧履歴",meterHours: "",memo: "Unknown historic hours" }),f.machineId);
        assert.ok(blankId);
        await open(blankId);
        assert.equal(await page.locator('#maintenanceForm [name="meterHours"]').inputValue(),"","Existing blank meter must not inherit current machine hours");
        await page.locator('#maintenanceForm [name="memo"]').fill("Memo-only edit");
        await save();
        assert.equal(await page.evaluate(id => RiceOS.state.maintenanceRecordsFor(RiceOS.state.data().maintenanceRecords.find(r => r.maintenanceId === id).machineId).find(r => r.maintenanceId === id).meterHours,blankId),"");
        await meter(1200);
        await shot("manual-retained-reload");
        assert.deepEqual(errors,[]);
        console.log(`PASS maintenance meter ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
