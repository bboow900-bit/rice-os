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
        const page = await context.newPage(), errors = [], alerts = [];
        page.on("pageerror",e => errors.push(e.message));
        page.on("dialog",async d => { alerts.push(d.message()); await d.dismiss(); });
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(() => {
          const R = RiceOS, date = R.utils.today(),year = date.slice(0,4),fieldId = R.state.addField("QA date field");
          R.state.saveSchedule({ scheduleId: "qa-date-pending",date,title: "日付監査予定",fieldIds: [fieldId],recordKind: "growth" });
          return { fieldId,date,year,start: `${year}-06-10`,end: `${year}-06-20`,invalid: `${year}-02-30` };
        });
        const snapshot = () => page.evaluate(() => ({ data: JSON.stringify(RiceOS.state.data()),raw: localStorage.getItem(RiceOS.schema.STORE_KEY) }));
        const schedules = await page.evaluate(() => JSON.stringify(RiceOS.state.data().schedules));
        const rejectWrites = on => page.evaluate(on => {
          if (on) { window.qaDatesSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if (key === RiceOS.schema.STORE_KEY) throw Error("QA write rejected"); return window.qaDatesSetItem.call(this,key,value); }; }
          else { Storage.prototype.setItem = window.qaDatesSetItem; delete window.qaDatesSetItem; }
        },on);
        const shot = async name => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false);
          const file = path.join(os.tmpdir(),`rice-record-dates-${name}-${width}.png`);
          await page.screenshot({ path: file }); console.log(file);
        };
        // Impossible dates cannot be typed into HTML date controls: exercise the real core explicitly.
        const beforeInvalid = await snapshot();
        const rejected = await page.evaluate(f => {
          const R = RiceOS;
          return [R.state.saveGrowthLog({ date: f.invalid,fieldId: f.fieldId,memo: "Impossible" }),
            R.state.saveDryPeriod({ fieldId: f.fieldId,date: f.invalid,startDate: f.invalid }),
            R.state.saveIrrigation({ fieldId: f.fieldId,date: f.invalid,startDate: f.invalid,method: "間断灌水" })].map(value => value === null || value === "" || value === false);
        },f);
        assert.deepEqual(rejected,[true,true,true],"Core must reject impossible dates before normalization");
        assert.deepEqual(await snapshot(),beforeInvalid);
        await page.evaluate(f => { RiceOS.app.openInput("growth","annual"); RiceOS.screens.growth.prefillDate(f.date,f.fieldId); },f);
        await page.locator('[data-growth-mode-select="detail"]').click();
        await page.locator("#gMemo").fill("Valid growth date");
        await page.locator('#growthForm button[type="submit"]').click();
        const logId = await page.evaluate(() => RiceOS.state.data().growthLogs.find(g => g.memo === "Valid growth date")?.logId);
        assert.ok(logId);
        await page.evaluate(id => RiceOS.screens.growth.editLog(id),logId);
        await page.locator("#gDate").fill("");
        await page.locator("#gMemo").fill("Retained growth draft");
        const beforeBlank = await snapshot();
        await page.locator('#growthForm button[type="submit"]').click();
        assert.deepEqual(await snapshot(),beforeBlank);
        assert.equal(await page.locator("#gDate").inputValue(),"");
        assert.equal(await page.locator("#editGrowthId").inputValue(),logId);
        assert.ok(await page.locator("#gDate").evaluate(el => el.validity.valueMissing));
        await shot("growth-blank");
        await page.locator("#gDate").fill(f.start);
        await rejectWrites(true);
        await page.locator('#growthForm button[type="submit"]').click();
        assert.deepEqual(await snapshot(),beforeBlank);
        assert.equal(await page.locator("#gMemo").inputValue(),"Retained growth draft");
        await rejectWrites(false);
        await page.locator('#growthForm button[type="submit"]').click();
        assert.equal(await page.evaluate(id => RiceOS.state.data().growthLogs.find(g => g.logId === id).date,logId),f.start);
        for (const kind of ["dry","irrigation"]) {
          const id = await page.evaluate(({ f,kind }) => {
            const R = RiceOS, record = { fieldId: f.fieldId,date: f.start,startDate: f.start,actualEndDate: f.end,method: "間断灌水",memo: `QA ${kind} dates` };
            const saved = kind === "dry" ? R.state.saveDryPeriod(record) : R.state.saveIrrigation(record);
            if (!saved) throw Error("Water seed failed");
            const rows = kind === "dry" ? R.state.data().dryPeriods : R.state.data().irrigations;
            const row = rows.find(r => r.memo === record.memo);
            return row.dryPeriodId || row.irrigationId;
          },{ f,kind });
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          if (kind === "dry") await page.locator("#annualYear").selectOption(f.year);
          await page.evaluate(({ kind,id }) => { if (!RiceOS.screens.annual.openWaterEditor(kind,id)) throw Error("Water route failed"); },{ kind,id });
          const form = page.locator("[data-annual-water-edit-form]");
          await form.locator('[name="startDate"]').fill("");
          await form.locator('[name="memo"]').fill("Retained water draft");
          const beforeWaterBlank = await snapshot();
          await form.locator('button[type="submit"]').first().click();
          assert.deepEqual(await snapshot(),beforeWaterBlank);
          assert.equal(await form.locator('[name="startDate"]').inputValue(),"");
          await form.locator('[name="startDate"]').fill(f.end);
          await form.locator('[name="actualEndDate"]').fill(f.start);
          const beforeReversed = await snapshot(), alertCount = alerts.length;
          await form.locator('button[type="submit"]').first().click();
          assert.deepEqual(await snapshot(),beforeReversed);
          assert.ok(alerts.slice(alertCount).some(text => /終了日は開始日/.test(text)));
          assert.equal(await form.locator('[name="memo"]').inputValue(),"Retained water draft");
          await shot(`${kind}-rejected`);
          await page.locator("[data-annual-water-cancel]").click();
          assert.deepEqual(await snapshot(),beforeReversed,"Cancel must not save draft");
          await page.evaluate(({ kind,id }) => RiceOS.screens.annual.openWaterEditor(kind,id),{ kind,id });
          await form.locator('[name="memo"]').fill("Valid water edit");
          const beforeWriteFailure = await snapshot();
          await rejectWrites(true);
          await form.locator('button[type="submit"]').first().click();
          assert.deepEqual(await snapshot(),beforeWriteFailure);
          assert.equal(await form.locator('[name="memo"]').inputValue(),"Valid water edit");
          await rejectWrites(false);
          await form.locator('button[type="submit"]').first().click();
          assert.equal(await form.count(),0);
          assert.ok(await page.evaluate(({ kind,id }) => (kind === "dry" ? RiceOS.state.data().dryPeriods : RiceOS.state.data().irrigations).some(r => (r.dryPeriodId || r.irrigationId) === id && r.memo === "Valid water edit"),{ kind,id }));
          await page.evaluate(({ kind,id,f }) => {
            RiceOS.app.openInput(kind === "dry" ? "dry-period" : "irrigation","annual");
            if (kind === "dry") RiceOS.screens.dryPeriod.editDry(id);
            else RiceOS.screens.irrigation.prefillDate(f.date,f.fieldId);
          },{ kind,id,f });
          const dateInput = page.locator(kind === "dry" ? "#dryDate" : "#waterDate");
          const submit = page.locator(kind === "dry" ? '#dryForm button[type="submit"]' : '[data-water-action]:not([disabled])').first();
          await dateInput.fill("");
          const beforeDirectBlank = await snapshot();
          await submit.click();
          assert.deepEqual(await snapshot(),beforeDirectBlank);
          assert.equal(await dateInput.inputValue(),"");
          assert.ok(alerts.some(text => /実施日|開始日/.test(text)));
          await dateInput.fill(f.start);
          if (kind === "dry") await submit.click();
        }
        assert.equal(await page.evaluate(() => JSON.stringify(RiceOS.state.data().schedules)),schedules);
        assert.deepEqual(errors,[]);
        console.log(`PASS record dates ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
