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
        const f = await page.evaluate(() => {
          const R = RiceOS,year = Number(R.utils.today().slice(0,4)),fieldId = R.state.addField("QA saved forecast field"),otherFieldId = R.state.addField("QA unrelated forecast field");
          if (!R.state.harvestForecastComparisonFor) throw Error("Forecast comparison API has not landed");
          R.state.updateWeatherLocation({ latitude: 37.75,longitude: 140.47,label: "QA isolated comparison location",source: "manual" });
          const specs = [
            { id: "qa-forecast-valid",season: year - 1,thermal: true,delay: "schedule" },
            { id: "qa-forecast-day-only",season: year - 2,thermal: false },
            { id: "qa-forecast-heading-edited",season: year - 3,thermal: true,edited: true },
            { id: "qa-forecast-nonprospective",season: year - 4,invalid: true }
          ];
          const snapshots = [];
          const seed = (spec,id = fieldId) => {
            const season = String(spec.season),date = `${season}-09-20`,headingDate = `${season}-08-01`,asOf = `${season}-09-05`;
            R.state.saveGrowthLog({ fieldId: id,date: spec.edited ? `${season}-08-02` : headingDate,headingObserved: true,memo: "QA observed heading" });
            if (!R.state.saveFieldWork({ workId: spec.id,date,fieldIds: [id],workName: "稲刈り",harvestStatusByField: { [id]: "complete" },
              harvestTimingByField: { [id]: { assessment: "late",idealStartDate: `${season}-09-12`,idealEndDate: `${season}-09-14`,delayReason: spec.delay || "",memo: "QA field-specific ideal range" } } })) throw Error("Harvest fixture failed");
            const startDate = `${season}-08-02`,expectedDays = Number(R.utils.daysBetween(startDate,asOf));
            const thermalProjection = { engineVersion: "harvest-temperature-projection-v1",status: "projected",asOf,headingDate,startDate,endDate: `${season}-09-04`,
              range: { start: `${season}-09-12`,end: `${season}-09-18` },locationKey: "37.75|140.47",retrievedAt: `${asOf}T01:00:00Z`,
              forecastDays: 7,seasonalDays: 7,seasonalMinimumYears: 3,seasonalExpectedYears: 3,
              historical: { complete: true,total: expectedDays * 20,count: expectedDays,expectedDays,source: "Open-Meteo Archive (reanalysis/model)" },
              sources: { historical: ["Open-Meteo Archive"],forecast: ["Open-Meteo Forecast"],seasonal: ["Open-Meteo prior-year daily seasonal reference (reanalysis/model)"] } };
            const snapshot = { snapshotId: `${spec.id}-saved`,fieldId: id,season,asOf,savedAt: `${asOf}T02:00:00Z`,headingKind: "actual",headingDate,actualHeadingDate: headingDate,
              harvestKind: "heading",harvestDate: `${season}-09-12`,harvestRange: { start: `${season}-09-10`,end: `${season}-09-15` },basis: spec.thermal ? { thermalProjection } : {} };
            if (!spec.invalid) snapshots.push(snapshot);
            else snapshots.push(
              { ...snapshot,snapshotId: `${spec.id}-same-day`,asOf: date,savedAt: `${date}T02:00:00Z` },
              { ...snapshot,snapshotId: `${spec.id}-backdated`,savedAt: `${season}-09-21T02:00:00Z` },
              { ...snapshot,snapshotId: `${spec.id}-later`,asOf: `${season}-09-21`,savedAt: `${season}-09-21T02:00:00Z` }
            );
          };
          specs.forEach(spec => seed(spec));
          seed({ id: "qa-forecast-other-field",season: year - 1,thermal: true },otherFieldId);
          const imported = R.utils.clone(R.state.data());
          imported.meta.outlookSnapshots = [...(imported.meta.outlookSnapshots || []),...snapshots];
          if (!R.state.replace(imported,"QA historical saved forecast fixture")) throw Error("Forecast fixture import failed");
          window.qaForecastComparisonFetches = 0;
          for (const key of ["fetchDailyRange","fetchSamePeriodAverage","fetchSamePeriodDailyAverage"]) R.weather[key] = async () => { window.qaForecastComparisonFetches++; throw Error("Read-only comparison must not fetch weather"); };
          return { fieldId,otherFieldId,year: String(year),ids: specs.map(s => s.id) };
        });
        const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY),data: JSON.stringify(RiceOS.state.data()) }));
        const baseline = await snapshot();
        const root = () => page.locator("[data-harvest-forecast-comparison]");
        const article = id => page.locator(`[data-harvest-forecast-record="${id}"]`);
        const expand = async () => { if (!await root().evaluate(el => el.open)) await root().locator(":scope > summary").click(); };
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px overflow`);
          const file = path.join(os.tmpdir(),`rice-harvest-forecast-comparison-${label}-${width}.png`);
          await page.screenshot({ path: file }); console.log(file);
          if (await root().count()) { const focus = path.join(os.tmpdir(),`rice-harvest-forecast-comparison-${label}-focus-${width}.png`); await root().screenshot({ path: focus }); console.log(focus); }
        };
        const openCompare = async id => {
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          await page.locator('[data-annual-hub-view="compare"]').click();
          await page.locator(`[data-annual-hub-compare-field="${id}"]`).click();
          await root().waitFor();
        };
        await openCompare(f.fieldId);
        assert.equal(await root().evaluate(el => el.open),false,"Comparison must initially be collapsed");
        await root().evaluate(el => el.scrollIntoView({ block: "center" })); await shot("collapsed");
        await expand();
        assert.equal(await root().locator("[data-harvest-forecast-record]").count(),4);
        assert.equal(await article("qa-forecast-other-field").count(),0);
        const comparisons = await page.evaluate(id => RiceOS.state.harvestForecastComparisonFor(id),f.fieldId);
        const valid = comparisons.find(r => r.workId === "qa-forecast-valid");
        if (!valid.thermalComparison.available) console.log("Thermal fixture rejected:",valid.thermalComparison.reason,valid.forecast?.basis?.thermalProjection);
        assert.equal(valid.dayComparison.available,true); assert.equal(valid.thermalComparison.available,true);
        assert.equal(valid.dayComparison.actual.days,5); assert.equal(valid.dayComparison.ideal.days,0);
        assert.equal(valid.thermalComparison.actual.days,2); assert.equal(valid.thermalComparison.ideal.days,0);
        const text = await article(valid.workId).innerText();
        assert.match(text,/日数ベース/); assert.match(text,/積算温度の参考幅/); assert.match(text,/実際の刈取: 日程差: 5日遅い/);
        assert.match(text,/現場の見立て: 見立て期間と重なる/); assert.ok(!text.includes("予測誤差"));
        const dayOnly = comparisons.find(r => r.workId === "qa-forecast-day-only");
        assert.equal(dayOnly.dayComparison.available,true); assert.equal(dayOnly.thermalComparison.available,false);
        assert.match(await article(dayOnly.workId).innerText(),/完全な到達範囲.*ありません/);
        const edited = comparisons.find(r => r.workId === "qa-forecast-heading-edited");
        assert.equal(edited.dayComparison.available,false); assert.equal(edited.thermalComparison.available,false);
        assert.match(await article(edited.workId).innerText(),/出穂実測の根拠が変更.*算出しません/);
        const none = comparisons.find(r => r.workId === "qa-forecast-nonprospective");
        assert.equal(none.forecast,null); assert.equal(none.dayComparison.actual,null); assert.equal(none.thermalComparison.actual,null);
        assert.match(await article(none.workId).innerText(),/事前の見通し記録なし/);
        assert.ok(!(await article(none.workId).innerText()).includes("0日")); assert.equal(none.exclusions.length,3);
        await article(none.workId).locator("details > summary").click();
        assert.match(await article(none.workId).innerText(),/当日以降/);
        await article(valid.workId).evaluate(el => el.scrollIntoView({ block: "center" })); await shot("expanded");
        assert.deepEqual(await snapshot(),baseline);
        await article(valid.workId).locator(`[data-annual-record-open-id="${valid.workId}"]`).click();
        await page.locator(".annual-record-detail").waitFor();
        assert.equal(await page.locator("#screen-field-work.active").count(),0,"Detail action must not jump to edit");
        assert.match(await page.locator(".annual-record-detail").innerText(),/QA saved forecast field/);
        await page.locator("[data-annual-record-detail-back]").click(); await root().waitFor(); await expand();
        assert.equal(await article(valid.workId).count(),1);
        assert.deepEqual(await snapshot(),baseline);
        await openCompare(f.otherFieldId); await expand();
        assert.equal(await root().locator("[data-harvest-forecast-record]").count(),1); assert.equal(await article(valid.workId).count(),0);
        await shot("other-field");
        assert.deepEqual(await snapshot(),baseline);
        assert.equal(await page.evaluate(() => window.qaForecastComparisonFetches),0);
        await page.reload({ waitUntil: "networkidle" });
        assert.equal((await snapshot()).raw,baseline.raw);
        await openCompare(f.fieldId); await expand();
        assert.match(await article(valid.workId).innerText(),/日程差: 5日遅い/);
        assert.equal((await snapshot()).raw,baseline.raw);
        assert.deepEqual(errors,[]); console.log(`PASS harvest forecast comparison ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
