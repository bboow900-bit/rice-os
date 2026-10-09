"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 }, isMobile: true,hasTouch: true,serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror",error => errors.push(error.message));
        await page.route("https://**/*",route => route.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(() => {
          const R = RiceOS, date = R.utils.today(), year = date.slice(0,4);
          if (!R.state.deleteResult) throw Error("Result core API not ready");
          const fieldId = R.state.addField("QA result field"), varietyId = R.state.varieties()[0].varietyId;
          R.state.updateField(fieldId,{ varietyId });
          const d = R.utils.clone(R.state.data());
          d.fieldWorks.push({ workId: "qa-result-harvest",date,workName: "稲刈り",fieldIds: [fieldId],harvestStatusByField: { [fieldId]: "complete" },harvestSnapshots: [{ fieldId,harvestDate: date,headingDate: `${year}-08-01`,thermal: { total: 1000,count: 60,status: "確定" } }] });
          d.dryPeriods.push({ dryPeriodId: "qa-result-dry",fieldId,startDate: date,actualEndDate: date });
          d.irrigations.push({ irrigationId: "qa-result-water",fieldId,startDate: date,actualEndDate: date,method: "間断灌水" });
          d.varietyResults = [
            { resultId: "qa-result-main",season: year,varietyId,fieldId,yield: "600",grade: "QA grade",createdAt: "2020-01-01T00:00:00Z",qaUnknown: "keep" },
            { resultId: "qa-result-other",season: year,varietyId,yield: "800" },
            { resultId: "qa-result-legacy",season: year,varietyId: "qa-deleted-variety",yield: "400",reflection: "Legacy memo" },
            { resultId: "qa-result-blank",season: year,varietyId: "",yield: "200" }
          ];
          if (!R.state.replace(d,"QA isolated fixture")) throw Error("Seed failed");
          return { fieldId,varietyId,year };
        });
        const data = () => page.evaluate(() => RiceOS.state.data().varietyResults);
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const protectedData = () => page.evaluate(() => JSON.stringify([RiceOS.state.data().fieldWorks,RiceOS.state.data().dryPeriods,RiceOS.state.data().irrigations]));
        const protectedBefore = await protectedData();
        assert.ok(await page.evaluate(() => RiceOS.state.data().fieldWorks.find(w => w.workId === "qa-result-harvest").harvestSnapshots.length),"Snapshot fixture must survive normalization");
        const management = async () => {
          await page.locator('.nav-item[data-screen="data"]:visible').click();
          await page.locator('[data-jump-screen="results"]').click();
        };
        const action = (id,kind) => page.locator(`#resultList [data-result-action="${kind}"][data-id="${id}"]`);
        const dialog = async (locator,accept) => {
          const handled = new Promise(resolve => page.once("dialog",async d => { await (accept ? d.accept() : d.dismiss()); resolve(); }));
          await locator.click(); await handled;
        };
        const screenshot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width} overflow`);
          const file = path.join(os.tmpdir(),`rice-result-${label}-${width}.png`);
          await page.screenshot({ path: file }); console.log(file);
        };
        await management();
        assert.match(await page.locator('[data-result-id="qa-result-main"]').innerText(),/圃場指定: QA result field/);
        assert.match(await page.locator('[data-result-id="qa-result-other"]').innerText(),/品種集計/);
        await action("qa-result-blank","edit").click();
        assert.equal(await page.locator("#rVariety").inputValue(),"");
        await page.locator("#resultForm summary",{ hasText: "品質・反省" }).click();
        await page.locator("#rReflection").fill("Blank variety memo only");
        await page.locator("#resultSave").click();
        assert.equal((await data()).find(r => r.resultId === "qa-result-blank").varietyId,"");
        await action("qa-result-legacy","edit").click();
        assert.equal(await page.locator("#rVariety").inputValue(),"qa-deleted-variety");
        await page.locator("#rYield").fill("401");
        await management();
        assert.equal(await page.locator("#rVariety").inputValue(),"qa-deleted-variety");
        assert.equal(await page.locator("#rYield").inputValue(),"401");
        await screenshot("legacy-editor");
        const beforeCancel = await raw();
        await page.locator("[data-result-reset]").click();
        assert.equal(await raw(),beforeCancel);
        assert.equal(await page.locator("#editResultId").inputValue(),"");
        await action("qa-result-main","edit").click();
        await page.locator("#rYield").fill("1200");
        const beforeDeleteCancel = await raw();
        await dialog(action("qa-result-other","delete"),false);
        assert.equal(await raw(),beforeDeleteCancel);
        await dialog(action("qa-result-other","delete"),true);
        assert.equal(await page.locator("#editResultId").inputValue(),"qa-result-main");
        assert.equal(await page.locator("#rYield").inputValue(),"1200");
        const failWrites = () => page.evaluate(() => {
          window.qaSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key,value) { if (key === RiceOS.schema.STORE_KEY) throw Error("QA write rejected"); return window.qaSetItem.call(this,key,value); };
        });
        const restoreWrites = () => page.evaluate(() => { Storage.prototype.setItem = window.qaSetItem; delete window.qaSetItem; });
        const beforeFailure = await raw(), beforeRows = await data();
        await failWrites();
        await page.locator("#resultSave").click();
        assert.equal(await raw(),beforeFailure); assert.deepEqual(await data(),beforeRows);
        assert.equal(await page.locator("#editResultId").inputValue(),"qa-result-main");
        assert.equal(await page.locator("#rYield").inputValue(),"1200");
        await dialog(action("qa-result-main","delete"),true);
        assert.equal(await raw(),beforeFailure); assert.deepEqual(await data(),beforeRows);
        assert.equal(await page.locator("#rYield").inputValue(),"1200");
        await restoreWrites();
        await page.locator("#resultSave").click();
        let rows = await data(), original = beforeRows.find(r => r.resultId === "qa-result-main");
        assert.equal(rows.filter(r => r.resultId === "qa-result-main").length,1);
        const saved = rows.find(r => r.resultId === "qa-result-main");
        assert.equal(saved.yield,"1200");
        for (const key of ["fieldId","grade","createdAt"]) assert.deepEqual(saved[key],original[key],key);
        await page.locator('.nav-item[data-screen="annual"]:visible').click();
        await page.locator("#annualYear").selectOption(f.year);
        await page.evaluate(id => RiceOS.screens.annual.openField(id,"work"),f.fieldId);
        await page.locator(".annual-harvest-details > summary").click();
        assert.match(await page.locator("#screen-annual").innerText(),/1200/);
        await page.locator("[data-annual-results]").click();
        assert.equal(await page.locator("#editResultId").inputValue(),"qa-result-main");
        await page.locator("#rYield").fill("1250");
        await page.locator("#resultSave").click();
        await page.locator("#appBackButton").click();
        assert.match(await page.locator(".annual-detail-head").innerText(),/QA result field/);
        assert.equal(await page.locator("#annualYear").inputValue(),f.year);
        if (!await page.locator(".annual-harvest-details").evaluate(el => el.open)) await page.locator(".annual-harvest-details > summary").click();
        assert.match(await page.locator("#screen-annual").innerText(),/1250/);
        await screenshot("annual-updated");
        await page.reload({ waitUntil: "networkidle" });
        rows = await data();
        assert.equal(rows.filter(r => r.resultId === "qa-result-main").length,1);
        assert.equal(rows.find(r => r.resultId === "qa-result-main").yield,"1250");
        await management();
        await action("qa-result-main","edit").click();
        const beforeFinalCancel = await raw();
        await dialog(action("qa-result-main","delete"),false);
        assert.equal(await raw(),beforeFinalCancel);
        await dialog(action("qa-result-main","delete"),true);
        assert.equal(await page.locator("#editResultId").inputValue(),"");
        assert.equal(await page.locator("#rYield").inputValue(),"");
        await action("qa-result-legacy","edit").click();
        await page.evaluate(() => RiceOS.state.deleteResult("qa-result-legacy"));
        await dialog(page.locator("#resultSave"),true);
        assert.equal((await data()).some(r => r.resultId === "qa-result-legacy"),false,"Stale editor must not resurrect deleted row");
        await page.locator("[data-result-new]").click();
        assert.equal(await page.locator("#editResultId").inputValue(),"");
        assert.equal(await protectedData(),protectedBefore,"Result CRUD must not alter harvest/snapshots/water");
        await screenshot("deleted");
        assert.deepEqual(errors,[]);
        console.log(`PASS result CRUD ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
