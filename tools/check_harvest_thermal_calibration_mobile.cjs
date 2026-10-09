"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"),os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true,executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 },isMobile: true,hasTouch: true,serviceWorkers: "block" });
      try {
        const page = await context.newPage(),errors = [];
        page.on("pageerror",e => errors.push(e.message)); page.on("dialog",d => d.dismiss());
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(async () => {
          const R = RiceOS,date = R.utils.today(),year = Number(date.slice(0,4)),varietyId = R.state.varieties()[0].varietyId;
          const group = R.state.addFieldGroup("QA thermal calibration"),applied = R.state.addField("QA union applied"),insufficient = R.state.addField("QA union candidate"),actual = R.state.addField("QA union harvested"),noheading = R.state.addField("QA union no heading");
          R.state.updateWeatherLocation({ latitude: 37.75,longitude: 140.47,label: "QA isolated thermal union",source: "manual" });
          [applied,insufficient,actual,noheading].forEach(fieldId => {
            R.state.updateField(fieldId,{ fieldGroupId: group,varietyId });
            if (fieldId !== noheading) R.state.saveGrowthLog({ fieldId,date: R.utils.dateAddDays(date,-10),headingObserved: true,memo: "QA current heading" });
          });
          window.qaThermalUnionMode = "projection"; window.qaThermalUnionRows = {};
          const makeRows = (start,end,basis) => {
            const rows = [];
            for (let day = start; day <= end; day = R.utils.dateAddDays(day,1)) {
              if (window.qaThermalUnionMode === "missing" && day === end) continue;
              rows.push({ date: day,tempMean: window.qaThermalUnionMode === "cap" ? 30 : 20,
                source: basis === "historical" ? "Open-Meteo Archive" : basis === "forecast" ? "Open-Meteo Forecast" : "Open-Meteo prior-year daily seasonal reference (reanalysis/model)",
                dataset: basis === "seasonal" ? "same-period-reference" : basis === "historical" ? "Open-Meteo Archive" : "Open-Meteo Forecast",model: "best_match",count: 3,expectedYears: 3,retrievedAt: R.utils.now() });
            }
            window.qaThermalUnionRows[basis] = rows.map(row => ({ ...row,basis })); return rows;
          };
          R.weather.fetchDailyRange = async (start,end,location) => {
            const rows = makeRows(start,end,end < R.utils.today() ? "historical" : "forecast");
            return { startDate: start,endDate: end,rows,count: rows.length,total: rows.reduce((n,row) => n + row.tempMean,0),location,retrievedAt: R.utils.now() };
          };
          R.weather.fetchSamePeriodAverage = async () => ({ days: 7,label: "QA same-period reference" });
          R.weather.fetchSamePeriodDailyAverage = async (start,end) => ({ rows: makeRows(start,end,"seasonal") });
          const historical = async (fieldId,offset,mode) => {
            const season = year - offset,workId = `qa-union-${fieldId}-${season}`;
            R.state.saveGrowthLog({ fieldId,date: `${season}-07-01`,headingObserved: true,memo: "QA historical heading" });
            if (!R.state.saveFieldWork({ workId,date: `${season}-08-20`,workName: "稲刈り",fieldIds: [fieldId],harvestStatusByField: { [fieldId]: "complete" },
              harvestTimingByField: { [fieldId]: { assessment: "late",idealStartDate: `${season}-08-10`,idealEndDate: `${season}-08-12`,memo: `Preserve ${mode} source` } } })) throw Error("Historical fixture failed");
            window.qaThermalUnionMode = mode;
            const result = await R.state.retryHarvestTimingThermal(workId,fieldId);
            if (result.status !== "saved") throw Error("Historic thermal fixture failed");
            return workId;
          };
          const accepted = [await historical(applied,1,"complete"),await historical(applied,2,"complete")];
          const missing = await historical(applied,3,"missing"),cap = await historical(applied,4,"cap");
          const candidate = await historical(insufficient,1,"complete");
          await historical(insufficient,2,"missing"); await historical(insufficient,3,"cap");
          for (const id of [actual,noheading]) { await historical(id,1,"complete"); await historical(id,2,"complete"); }
          R.state.saveFieldWork({ workId: "qa-union-current-actual",date,workName: "稲刈り",fieldIds: [actual],harvestStatusByField: { [actual]: "complete" } });
          window.qaThermalUnionMode = "projection"; window.qaThermalUnionRows = {};
          const result = R.outlook.forField(applied);
          if (!result.thermalCalibration) throw Error("Thermal calibration interface has not landed");
          return { group,applied,insufficient,actual,noheading,accepted,missing,cap,candidate,date };
        });
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const records = () => page.evaluate(() => JSON.stringify([RiceOS.state.data().fields,RiceOS.state.data().growthLogs,RiceOS.state.data().fieldWorks,RiceOS.state.data().dryPeriods,RiceOS.state.data().irrigations]));
        const saved = () => page.evaluate(id => (RiceOS.state.data().meta.outlookSnapshots || []).filter(row => row.fieldId === id),f.applied);
        const panel = () => page.locator("[data-outlook-thermal]");
        const calibration = () => page.locator("[data-outlook-thermal-calibration-status]");
        const open = async id => { await page.locator(`[data-outlook-field="${id}"]`).click(); await panel().waitFor(); };
        const back = () => page.locator("#appBackButton").click();
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px overflow`);
          const file = path.join(os.tmpdir(),`rice-harvest-thermal-calibration-${label}-${width}.png`);
          await page.screenshot({ path: file,fullPage: true }); console.log(file);
          const focus = path.join(os.tmpdir(),`rice-harvest-thermal-calibration-${label}-focus-${width}.png`);
          await panel().screenshot({ path: focus }); console.log(focus);
        };
        const baselineRaw = await raw(),baselineRecords = await records();
        await page.locator('.nav-item[data-screen="outlook"]:visible').click();
        await page.locator("[data-outlook-group]").selectOption(f.group);
        await page.locator("[data-outlook-weather]").click();
        await page.waitForFunction(() => (window.qaThermalUnionRows.seasonal || []).length > 0);
        await open(f.applied);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-calibration-status="applied"]'));
        const p = await page.evaluate(id => RiceOS.outlook.harvestTemperatureProjection(id,{ rows: Object.values(window.qaThermalUnionRows).flat(),locationKey: "37.75|140.47",contextAsOf: RiceOS.utils.today() }),f.applied);
        const c = p.thermalCalibration;
        assert.equal(c.status,"applied"); assert.equal(c.accepted.length,2); assert.equal(new Set(c.accepted.map(r => r.season)).size,2);
        assert.ok(c.range.minimum <= c.baseRange.minimum); assert.ok(c.range.maximum >= c.baseRange.maximum);
        assert.equal(c.policy.regionalUpperLimit,1200);
        assert.ok(c.excluded.some(r => r.workId === f.missing)); assert.ok(c.excluded.some(r => r.workId === f.cap));
        assert.ok(!c.accepted.some(r => [f.cap,f.missing].includes(r.workId)));
        assert.equal(await page.locator("[data-outlook-thermal-evidence]").evaluate(el => el.open),false);
        await panel().evaluate(el => el.scrollIntoView({ block: "start" }));
        await page.evaluate(() => window.scrollBy(0,-64));
        const collapsed = path.join(os.tmpdir(),`rice-harvest-thermal-calibration-collapsed-viewport-${width}.png`);
        await page.screenshot({ path: collapsed }); console.log(collapsed);
        await page.locator("[data-outlook-thermal-evidence] > summary").click();
        for (const id of f.accepted) assert.equal(await page.locator(`[data-thermal-accepted="${id}"]`).count(),1);
        for (const id of [f.missing,f.cap]) assert.equal(await page.locator(`[data-thermal-excluded="${id}"]`).count(),1);
        assert.match(await page.locator(`[data-thermal-excluded="${f.cap}"]`).innerText(),/1200/);
        assert.match(await panel().innerText(),/一般目安の到達/);
        for (const date of [p.generalArrivalMinDate,p.generalArrivalMaxDate]) assert.ok((await panel().innerText()).includes(await page.evaluate(date => RiceOS.utils.fd(date),date)));
        assert.ok(p.arrivalMinDate <= p.generalArrivalMinDate); assert.ok(p.arrivalMaxDate >= p.generalArrivalMaxDate);
        await shot("applied");
        await panel().locator("small").last().evaluate(el => el.scrollIntoView({ block: "center" }));
        const footer = path.join(os.tmpdir(),`rice-harvest-thermal-calibration-footer-viewport-${width}.png`);
        await page.screenshot({ path: footer }); console.log(footer);
        await back();
        await open(f.insufficient);
        assert.equal(await calibration().getAttribute("data-outlook-thermal-calibration-status"),"insufficient");
        await page.locator("[data-outlook-thermal-evidence] > summary").click();
        assert.match(await calibration().innerText(),/候補/);
        assert.equal(await page.locator(`[data-thermal-accepted="${f.candidate}"]`).count(),1);
        for (const id of f.accepted) assert.equal(await page.locator(`[data-thermal-accepted="${id}"]`).count(),0,"Evidence must belong to the selected field only");
        const insufficient = await page.evaluate(id => RiceOS.outlook.forField(id).thermalCalibration,f.insufficient);
        assert.deepEqual(insufficient.range,insufficient.baseRange);
        await shot("insufficient"); await back();
        for (const [id,status] of [[f.actual,"not-applicable"],[f.noheading,"no-heading"]]) {
          await open(id); assert.equal(await panel().getAttribute("data-outlook-thermal-status"),status);
          const top = await page.evaluate(id => RiceOS.outlook.forField(id).thermalCalibration,id);
          assert.equal(top.status,"not-applicable");
          assert.equal(await page.locator('[data-outlook-thermal-calibration-status="applied"]').count(),0);
          await shot(id === f.actual ? "actual" : "no-heading"); await back();
        }
        assert.equal(await raw(),baselineRaw); assert.equal(await records(),baselineRecords,"Browsing must not mutate excluded source years");
        await page.locator("[data-outlook-save]").click();
        const snapshots = await saved(); assert.equal(snapshots.length,1);
        assert.equal(snapshots[0].basis.thermalCalibration.status,"applied");
        assert.deepEqual(snapshots[0].basis.thermalCalibration,c);
        assert.deepEqual(snapshots[0].basis.thermalProjection.thermalCalibration,c);
        const savedRaw = await raw();
        await page.locator("[data-outlook-save]").click(); assert.equal(await raw(),savedRaw);
        assert.equal(await records(),baselineRecords);
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await raw(),savedRaw); assert.deepEqual(await saved(),snapshots); assert.equal(await records(),baselineRecords);
        assert.deepEqual(errors,[]); console.log(`PASS harvest thermal calibration ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
