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
          const R = RiceOS,date = R.utils.today(),headingDate = R.utils.dateAddDays(date,-10);
          if (!R.outlook.harvestTemperatureProjection) throw Error("Temperature projection helper has not landed");
          const group = R.state.addFieldGroup("QA thermal projection"),full = R.state.addField("QA thermal complete"),actual = R.state.addField("QA thermal actual"),conflict = R.state.addField("QA thermal heading conflict"),arrived = R.state.addField("QA thermal already arrived");
          const varietyId = R.state.varieties()[0].varietyId;
          for (const fieldId of [full,actual,conflict]) {
            R.state.updateField(fieldId,{ fieldGroupId: group,varietyId });
            if (!R.state.saveGrowthLog({ fieldId,date: headingDate,headingObserved: true,memo: "QA thermal heading" })) throw Error("Heading fixture failed");
          }
          R.state.updateField(arrived,{ fieldGroupId: group,varietyId });
          if (!R.state.saveGrowthLog({ fieldId: arrived,date: R.utils.dateAddDays(date,-60),headingObserved: true,memo: "QA historic arrival" })) throw Error("Arrival fixture failed");
          R.state.saveFieldWork({ workId: "qa-projection-actual",date,fieldIds: [actual],workName: "稲刈り",harvestStatusByField: { [actual]: "complete" } });
          const d = R.utils.clone(R.state.data());
          d.growthLogs.push({ logId: "qa-projection-conflict",fieldId: conflict,date: R.utils.dateAddDays(headingDate,1),headingObserved: true });
          if (!R.state.replace(d,"QA projection heading conflict")) throw Error("Import failed");
          R.state.updateWeatherLocation({ latitude: 37.75,longitude: 140.47,label: "QA isolated projection location",source: "manual" });
          window.qaProjectionMode = "complete"; window.qaProjectionCalls = []; window.qaProjectionRows = {};
          const rowsFor = (startDate,endDate,basis) => {
            const rows = [];
            for (let date = startDate; date <= endDate; date = R.utils.dateAddDays(date,1)) {
              if (basis === "historical" && window.qaProjectionMode === "missing" && date === R.utils.dateAddDays(headingDate,1)) continue;
              if (basis === "seasonal" && window.qaProjectionMode === "future-missing" && date === startDate) continue;
              rows.push({ date,tempMean: basis === "forecast" ? 25 : 20,
                source: basis === "historical" ? "Open-Meteo Archive" : basis === "forecast" ? "Open-Meteo Forecast" : "Open-Meteo prior-year daily seasonal reference (reanalysis/model)",
                dataset: basis === "seasonal" ? "same-period-reference" : basis === "historical" ? "Open-Meteo Archive" : "Open-Meteo Forecast",
                model: "best_match",count: 3,expectedYears: 3,retrievedAt: R.utils.now() });
            }
            window.qaProjectionRows[basis] = rows.map(row => ({ ...row,basis }));
            window.qaProjectionCalls.push({ basis,startDate,endDate });
            return rows;
          };
          R.weather.fetchDailyRange = async (startDate,endDate,location) => {
            const basis = endDate < R.utils.today() ? "historical" : "forecast";
            if (basis === "forecast" && window.qaProjectionMode === "forecast-offline") { window.qaProjectionRows.forecast = []; window.qaProjectionCalls.push({ basis,startDate,endDate }); throw Error("QA forecast offline"); }
            if (basis === "historical" && window.qaProjectionMode === "historic-offline") { window.qaProjectionRows.historical = []; throw Error("QA historical offline"); }
            const rows = rowsFor(startDate,endDate,basis);
            return { startDate,endDate,rows,count: rows.length,total: rows.reduce((sum,r) => sum + r.tempMean,0),location,retrievedAt: R.utils.now() };
          };
          R.weather.fetchSamePeriodAverage = async () => ({ days: 7,label: "QA past 3-year same-period reference",average: 20 });
          R.weather.fetchSamePeriodDailyAverage = async (startDate,endDate) => ({ rows: rowsFor(startDate,endDate,"seasonal"),startDate,endDate });
          return { full,actual,conflict,arrived,group,date,headingDate };
        });
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const records = () => page.evaluate(() => JSON.stringify([RiceOS.state.data().fields,RiceOS.state.data().growthLogs,RiceOS.state.data().fieldWorks,RiceOS.state.data().dryPeriods,RiceOS.state.data().irrigations]));
        const snap = () => page.evaluate(id => (RiceOS.state.data().meta.outlookSnapshots || []).filter(s => s.fieldId === id),f.full);
        const panel = () => page.locator("[data-outlook-thermal]");
        const open = async id => { await page.locator(`[data-outlook-field="${id}"]`).click(); await panel().waitFor(); };
        const back = () => page.locator("#appBackButton").click();
        const force = async mode => {
          const count = await page.evaluate(mode => { window.qaProjectionMode = mode; window.qaProjectionRows = {}; return window.qaProjectionCalls.length; },mode);
          await page.locator("[data-outlook-weather]").click();
          await page.waitForFunction(count => window.qaProjectionCalls.length > count && (window.qaProjectionRows.seasonal || []).length > 0,count);
        };
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px overflow`);
          const file = path.join(os.tmpdir(),`rice-harvest-temperature-projection-${label}-${width}.png`);
          await page.screenshot({ path: file,fullPage: true }); console.log(file);
          if (await panel().count()) { const focus = path.join(os.tmpdir(),`rice-harvest-temperature-projection-${label}-focus-${width}.png`); await panel().screenshot({ path: focus }); console.log(focus); }
        };
        const before = await raw(),beforeRecords = await records();
        await page.locator('.nav-item[data-screen="outlook"]:visible').click();
        await page.locator("[data-outlook-group]").selectOption(f.group);
        await force("complete"); await open(f.full);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-status="projected"]'));
        const p = await page.evaluate(id => RiceOS.outlook.harvestTemperatureProjection(id,{ rows: Object.values(window.qaProjectionRows).flat(),locationKey: "37.75|140.47",contextAsOf: RiceOS.utils.today() }),f.full);
        assert.equal(p.status,"projected"); assert.equal(p.historical.complete,true);
        assert.equal(p.historical.count,p.historical.expectedDays); assert.equal(p.historical.total,p.historical.count * 20);
        assert.ok(p.trajectory.some(r => r.basis === "historical")); assert.ok(p.trajectory.some(r => r.basis === "forecast")); assert.ok(p.trajectory.some(r => r.basis === "seasonal"));
        const label = await panel().innerText();
        for (const date of [p.arrivalMinDate,p.arrivalMaxDate]) assert.ok(label.includes(await page.evaluate(date => RiceOS.utils.fd(date),date)));
        assert.match(label,/予報/); assert.match(label,/過去3年|同時期|季節参考/); assert.match(label,/気象庁.*ではありません/);
        assert.ok(label.includes(String(p.historical.total)));
        await shot("complete"); await back();
        assert.equal(await raw(),before,"Weather fetch/detail must not write records");
        await force("missing"); await open(f.full);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-status="historical-missing"]'));
        assert.match(await panel().innerText(),/欠測|不足/);
        assert.match(await panel().innerText(),/算出しません|算出できません/);
        const missing = await page.evaluate(id => RiceOS.outlook.harvestTemperatureProjection(id,{ rows: Object.values(window.qaProjectionRows).flat(),locationKey: "37.75|140.47",contextAsOf: RiceOS.utils.today() }),f.full);
        assert.equal(missing.historical.count,missing.historical.expectedDays - 1); assert.ok(missing.historical.total > 0); assert.equal(missing.arrivalMaxDate,"");
        await shot("missing"); await back();
        await force("historic-offline"); await open(f.full);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-status="historical-missing"]'));
        assert.match(await panel().innerText(),/欠測|不足/); await shot("historic-offline"); await back();
        await force("future-missing"); await open(f.full);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-status="future-missing"]'));
        assert.match(await panel().innerText(),/不足|止め/);
        await shot("future-missing"); await back();
        await force("forecast-offline"); await open(f.arrived);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-status="projected"]'));
        const arrived = await page.evaluate(id => RiceOS.outlook.harvestTemperatureProjection(id,{ rows: Object.values(window.qaProjectionRows).flat(),locationKey: "37.75|140.47",contextAsOf: RiceOS.utils.today() }),f.arrived);
        assert.equal(arrived.status,"projected"); assert.ok(arrived.arrivalMaxDate < f.date);
        assert.ok(arrived.trajectory.every(r => r.basis === "historical"));
        await shot("historic-arrived-forecast-offline"); await back();
        await open(f.actual);
        assert.equal(await panel().getAttribute("data-outlook-thermal-status"),"not-applicable"); assert.match(await panel().innerText(),/実績.*優先|刈取実績/);
        await shot("actual"); await back();
        await open(f.conflict);
        assert.equal(await panel().getAttribute("data-outlook-thermal-status"),"heading-conflict"); assert.match(await panel().innerText(),/異なる日付|複数/);
        await shot("heading-conflict"); await back();
        assert.equal(await raw(),before); assert.equal(await records(),beforeRecords);
        await force("complete"); await open(f.full);
        await page.waitForFunction(() => document.querySelector('[data-outlook-thermal-status="projected"]'));
        await back(); await page.locator("[data-outlook-save]").click();
        const saved = await snap(); assert.equal(saved.length,1);
        const locate = value => {
          if (!value || typeof value !== "object") return null;
          if (value.engineVersion === "harvest-temperature-projection-v1") return value;
          for (const child of Object.values(value)) { const found = locate(child); if (found) return found; }
          return null;
        };
        const storedProjection = locate(saved[0]); assert.ok(storedProjection,"Saved snapshot must include the immutable thermal basis");
        assert.equal(storedProjection.status,"projected"); assert.deepEqual(storedProjection.range,p.range);
        const savedRaw = await raw();
        await page.locator("[data-outlook-save]").click(); assert.equal(await raw(),savedRaw,"Unchanged snapshot save must be a no-op");
        assert.equal(await records(),beforeRecords);
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await raw(),savedRaw); assert.deepEqual(await snap(),saved); assert.equal(await records(),beforeRecords);
        assert.deepEqual(errors,[]); console.log(`PASS harvest temperature projection ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
