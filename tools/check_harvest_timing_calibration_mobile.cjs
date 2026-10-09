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
        const page = await context.newPage(),errors = [];
        page.on("pageerror",e => errors.push(e.message));
        page.on("dialog",d => d.dismiss());
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(() => {
          const R = RiceOS,date = R.utils.today(),year = Number(date.slice(0,4));
          const group = R.state.addFieldGroup("QA calibration group");
          const applied = R.state.addField("QA calibration applied"),insufficient = R.state.addField("QA calibration insufficient"),actual = R.state.addField("QA calibration harvested");
          const varietyId = R.state.varieties()[0]?.varietyId;
          if (!varietyId) throw Error("A real master variety is required for calibration fixture");
          [applied,insufficient,actual].forEach(fieldId => {
            R.state.updateField(fieldId,{ fieldGroupId: group,varietyId });
            if (!R.state.saveGrowthLog({ fieldId,date: R.utils.dateAddDays(date,-10),headingObserved: true,memo: "QA current confirmed heading" })) throw Error("Heading fixture failed");
          });
          const historical = (fieldId,offset,assessment) => {
            const season = year - offset,heading = `${season}-07-01`,workId = `qa-calibration-${fieldId}-${season}`;
            if (!R.state.saveGrowthLog({ fieldId,date: heading,headingObserved: true,memo: "QA historical heading" })) throw Error("Historical heading failed");
            if (!R.state.saveFieldWork({ workId,date: `${season}-08-20`,fieldIds: [fieldId],workName: "稲刈り",harvestStatusByField: { [fieldId]: "complete" },
              ...(assessment ? { harvestTimingByField: { [fieldId]: { assessment,idealStartDate: `${season}-08-10`,idealEndDate: `${season}-08-12`,memo: `QA evidence ${season}` } } } : {}) })) throw Error("Historical harvest failed");
            if (assessment) {
              const timing = R.state.data().fieldWorks.find(w => w.workId === workId).harvestTimingByField[fieldId];
              if (timing.varietyId !== varietyId || timing.varietySource !== "assessment-current-master") throw Error("Historical variety provenance fixture failed");
            }
            return workId;
          };
          const accepted = [historical(applied,1,"late"),historical(applied,2,"late")],excluded = historical(applied,3,"");
          historical(insufficient,1,"late");
          historical(actual,1,"late"); historical(actual,2,"late");
          const conflict = R.state.addField("QA calibration heading conflict"),duplicate = R.state.addField("QA calibration same-day heading");
          [conflict,duplicate].forEach(fieldId => {
            R.state.updateField(fieldId,{ fieldGroupId: group,varietyId });
            historical(fieldId,1,"late"); historical(fieldId,2,"late");
          });
          // Import preserves existing duplicate observations; new-entry validation correctly forbids creating them.
          const imported = R.utils.clone(R.state.data()),headingDate = R.utils.dateAddDays(date,-10);
          for (const [fieldId,secondDate] of [[conflict,R.utils.dateAddDays(headingDate,1)],[duplicate,headingDate]]) {
            imported.growthLogs.push({ logId: `qa-heading-${fieldId}-first`,fieldId,date: headingDate,headingObserved: true,memo: "QA imported heading" },
              { logId: `qa-heading-${fieldId}-second`,fieldId,date: secondDate,headingObserved: true,memo: "QA imported second heading" });
          }
          if (!R.state.replace(imported,"QA heading ambiguity fixture")) throw Error("Heading import failed");
          if (!R.state.saveFieldWork({ workId: "qa-calibration-current-actual",date,fieldIds: [actual],workName: "稲刈り",harvestStatusByField: { [actual]: "complete" } })) throw Error("Actual harvest failed");
          const prediction = R.outlook.forField(applied);
          if (!prediction.calibration) throw Error("Outlook calibration core API has not landed");
          return { applied,insufficient,actual,conflict,duplicate,accepted,excluded,group,date,year: String(year) };
        });
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const records = () => page.evaluate(() => JSON.stringify({ fields: RiceOS.state.data().fields,growth: RiceOS.state.data().growthLogs,works: RiceOS.state.data().fieldWorks,dry: RiceOS.state.data().dryPeriods,water: RiceOS.state.data().irrigations }));
        const snapshots = id => page.evaluate(id => (RiceOS.state.data().meta.outlookSnapshots || []).filter(s => s.fieldId === id),id);
        const prediction = id => page.evaluate(id => RiceOS.outlook.forField(id),id);
        const baselineRaw = await raw(),baselineRecords = await records();
        await page.locator('.nav-item[data-screen="outlook"]:visible').click();
        await page.locator("[data-outlook-group]").selectOption(f.group);
        assert.match(await page.locator(`[data-outlook-field="${f.applied}"]`).innerText(),/履歴.*暫定補正/);
        const open = async id => { await page.locator(`[data-outlook-field="${id}"]`).click(); await page.locator("[data-outlook-calibration]").waitFor(); };
        const back = () => page.locator("#appBackButton").click();
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px horizontal overflow`);
          const file = path.join(os.tmpdir(),`rice-harvest-timing-calibration-${label}-${width}.png`);
          await page.screenshot({ path: file,fullPage: true }); console.log(file);
          if (await page.locator("[data-outlook-calibration]").count()) {
            const focus = path.join(os.tmpdir(),`rice-harvest-timing-calibration-${label}-focus-${width}.png`);
            await page.locator("[data-outlook-calibration]").screenshot({ path: focus }); console.log(focus);
          }
        };
        await shot("list");
        await open(f.applied);
        assert.equal(await page.locator('[data-outlook-calibration-status="applied"]').count(),1);
        await page.locator("[data-outlook-calibration-evidence] > summary").click();
        for (const id of f.accepted) assert.equal(await page.locator(`[data-calibration-accepted="${id}"]`).count(),1);
        assert.equal(await page.locator(`[data-calibration-excluded="${f.excluded}"]`).count(),1);
        const p = await prediction(f.applied);
        assert.equal(p.snapshot.confidence,"medium","Historical calibration must not raise heading-only confidence");
        assert.equal(p.calibration.accepted.length,2);
        assert.equal(new Set(p.calibration.accepted.map(r => r.season)).size,2);
        await shot("applied");
        assert.equal(await raw(),baselineRaw,"Reading evidence must not save");
        await back();
        await open(f.insufficient);
        assert.equal(await page.locator('[data-outlook-calibration-status="insufficient"]').count(),1);
        assert.match(await page.locator("[data-outlook-calibration]").innerText(),/一般目安/);
        const one = await prediction(f.insufficient);
        assert.equal(Number(one.calibration.shiftDays || 0),0);
        await shot("insufficient"); await back();
        await open(f.actual);
        assert.equal(await page.locator('[data-outlook-calibration-status="not-applicable"]').count(),1);
        const actual = await prediction(f.actual);
        assert.equal(actual.harvest.kind,"actual"); assert.equal(actual.harvest.date,f.date);
        await shot("actual-override"); await back();
        await open(f.conflict);
        assert.equal(await page.locator('[data-outlook-calibration-status="not-applicable"]').count(),1);
        assert.match(await page.locator("[data-outlook-calibration]").innerText(),/一般目安/);
        const conflict = await prediction(f.conflict);
        assert.equal(Number(conflict.calibration.shiftDays || 0),0);
        assert.deepEqual(conflict.harvest.range,conflict.calibration.baseRange,"Conflicting current heading days must retain the general range");
        await shot("heading-conflict"); await back();
        await open(f.duplicate);
        assert.equal(await page.locator('[data-outlook-calibration-status="applied"]').count(),1);
        assert.equal((await prediction(f.duplicate)).calibration.accepted.length,2,"Same-day observations must not create distinct heading evidence");
        await shot("heading-same-day"); await back();
        assert.equal(await raw(),baselineRaw);
        assert.equal(await records(),baselineRecords);
        await open(f.applied);
        await back();
        await page.locator("[data-outlook-save]").click();
        let saved = await snapshots(f.applied);
        assert.equal(saved.length,1);
        assert.deepEqual(saved[0].basis.harvestCalibration,p.snapshot.basis.harvestCalibration);
        const first = saved[0];
        assert.equal(await records(),baselineRecords,"Snapshot save must not change source records");
        await page.locator("[data-outlook-save]").click();
        assert.equal((await snapshots(f.applied)).length,1,"Unchanged save must not append duplicate");
        await page.evaluate(({ id,fieldId }) => {
          const R = RiceOS,w = R.state.data().fieldWorks.find(w => w.workId === id),t = w.harvestTimingByField[fieldId];
          if (!R.state.saveFieldWork({ ...w,harvestTimingByField: { ...w.harvestTimingByField,[fieldId]: { ...t,idealEndDate: R.utils.dateAddDays(t.idealEndDate,1) } } })) throw Error("Evidence revision failed");
        },{ id: f.accepted[0],fieldId: f.applied });
        const changedRecords = await records();
        await page.locator("[data-outlook-save]").click();
        saved = await snapshots(f.applied);
        assert.equal(saved.length,2,"Same-day evidence revision must append a new snapshot");
        assert.deepEqual(saved[0],first,"Previous saved evidence must remain immutable");
        assert.equal(saved[1].asOf,first.asOf); assert.notDeepEqual(saved[1].basis.harvestCalibration,first.basis.harvestCalibration);
        assert.equal(await records(),changedRecords);
        const beforeReload = await raw(),savedBeforeReload = saved;
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await raw(),beforeReload); assert.deepEqual(await snapshots(f.applied),savedBeforeReload);
        await page.locator('.nav-item[data-screen="outlook"]:visible').click();
        await page.locator("[data-outlook-group]").selectOption(f.group);
        await open(f.applied); await page.locator("[data-outlook-calibration-evidence] > summary").click();
        await shot("reloaded"); await back();
        assert.equal(await raw(),beforeReload); assert.equal(await records(),changedRecords);
        assert.deepEqual(errors,[]); console.log(`PASS harvest timing calibration ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
