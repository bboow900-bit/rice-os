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
        const page = await context.newPage(), errors = [];
        page.on("pageerror",e => errors.push(e.message));
        page.on("dialog",d => d.dismiss());
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        await page.waitForFunction(() => RiceOS.state && RiceOS.screens.annual);
        const cases = await page.evaluate(() => {
          const R = RiceOS;
          if (typeof R.state.retryHarvestTimingThermal !== "function") throw Error("Timing thermal core API has not landed");
          R.state.updateWeatherLocation({ latitude: 37.75,longitude: 140.47,label: "QA isolated Archive location",source: "manual" });
          window.qaThermalMode = "complete"; window.qaThermalCalls = [];
          R.weather.fetchDailyRange = async (startDate,endDate,location) => {
            window.qaThermalCalls.push({ startDate,endDate,location });
            if (window.qaThermalMode === "offline") throw Error("QA offline");
            const rows = [];
            for (let date = startDate; date <= endDate; date = R.utils.dateAddDays(date,1)) {
              rows.push({ date,tempMean: window.qaThermalMode === "missing" && rows.length === 1 ? "" : 20,
                source: "Open-Meteo Archive",dataset: "Open-Meteo Archive",model: "best_match",retrievedAt: R.utils.now() });
            }
            const valid = rows.filter(r => r.tempMean !== "");
            return { startDate,endDate,rows,count: valid.length,total: valid.length * 20,location,source: "Open-Meteo Archive",retrievedAt: R.utils.now(),fetchedAt: R.utils.now() };
          };
          const currentYear = Number(R.utils.today().slice(0,4)),previousYear = currentYear - 1;
          return ["full","missing","no-heading","future","offline","cancel"].map(kind => {
            const fieldId = R.state.addField(`QA timing thermal ${kind}`),year = kind === "future" ? currentYear : previousYear;
            const date = kind === "future" ? R.utils.today() : `${year}-09-10`;
            const headingDate = kind === "future" ? R.utils.dateAddDays(date,-5) : `${year}-08-01`;
            if (kind !== "no-heading") {
              if (!R.state.saveGrowthLog({ fieldId,date: headingDate,headingObserved: true,memo: "QA explicit heading" })) throw Error("Heading seed failed");
            }
            const idealStartDate = kind === "future" ? R.utils.dateAddDays(date,3) : `${year}-09-03`;
            const idealEndDate = kind === "future" ? R.utils.dateAddDays(date,5) : `${year}-09-06`;
            const workId = `qa-timing-thermal-${kind}`;
            if (!R.state.saveFieldWork({ workId,date,workName: "稲刈り",fieldIds: [fieldId],harvestStatusByField: { [fieldId]: "complete" },
              harvestTimingByField: { [fieldId]: { assessment: kind === "future" ? "early" : "late",idealStartDate,idealEndDate,memo: `Preserve ${kind} timing memo` } },
              photo: "QA existing photo",photoData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=" })) throw Error("Harvest seed failed");
            // Keep an old unverified actual snapshot while testing ideal-period retrieval,
            // including the deliberate no-heading and future fixtures.
            const legacy = JSON.parse(JSON.stringify(R.state.data()));
            const snapshot = legacy.fieldWorks.find(row => row.workId === workId).harvestSnapshots.find(row => row.fieldId === fieldId);
            snapshot.thermal = { headingDate,startDate: R.utils.dateAddDays(headingDate,1),endDate: date,
              total: 980,status: "保存済み",count: "40",expectedDays: "40" };
            if (!R.state.replace(legacy)) throw Error("Actual legacy snapshot import failed");
            return { kind,fieldId,workId,year: String(year),date,idealStartDate,idealEndDate };
          });
        });
        const work = item => page.evaluate(id => RiceOS.state.data().fieldWorks.find(w => w.workId === id),item.workId);
        const thermal = item => page.evaluate(({ workId,fieldId }) => RiceOS.state.data().fieldWorks.find(w => w.workId === workId).harvestTimingByField[fieldId].thermal || null,item);
        const baseline = new Map();
        for (const item of cases) baseline.set(item.kind,await work(item));
        const retry = item => page.locator(`[data-harvest-timing-thermal-retry][data-work-id="${item.workId}"][data-field-id="${item.fieldId}"]`);
        const panel = () => page.locator("[data-harvest-timing-thermal]");
        const open = async item => {
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          await page.locator("#annualYear").selectOption(item.year);
          await page.evaluate(id => RiceOS.screens.annual.openField(id,"work"),item.fieldId);
          await page.locator(`[data-annual-record-open-id="${item.workId}"]`).first().click();
          await page.locator(".annual-record-detail").waitFor();
        };
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px overflow`);
          const file = path.join(os.tmpdir(),`rice-harvest-timing-thermal-${label}-${width}.png`);
          await page.screenshot({ path: file,fullPage: true }); console.log(file);
        };
        const fetch = async (item,mode,status) => {
          await page.evaluate(mode => { window.qaThermalMode = mode; },mode);
          await retry(item).click();
          await page.waitForFunction(({ workId,fieldId,status }) => {
            const t = RiceOS.state.data().fieldWorks.find(w => w.workId === workId)?.harvestTimingByField?.[fieldId]?.thermal;
            return t?.endpoints?.length && t.endpoints.every(e => e.status === status);
          },{ ...item,status });
        };
        const full = cases.find(c => c.kind === "full");
        await open(full); await fetch(full,"complete","complete");
        let t = await thermal(full);
        assert.equal(t.endpoints.length,2); assert.equal(t.endpoints[0].date,full.idealStartDate); assert.equal(t.endpoints[1].date,full.idealEndDate);
        for (const end of t.endpoints) { assert.equal(Number(end.count),Number(end.expectedDays)); assert.equal(Number(end.total),Number(end.count) * 20); }
        assert.match(String(t.source),/Archive/); assert.ok(t.retrievedAt); assert.ok(t.locationLabel);
        for (const e of t.endpoints) assert.ok((await panel().innerText()).includes(String(e.total)));
        await shot("full-endpoints");
        const missing = cases.find(c => c.kind === "missing");
        await open(missing); await fetch(missing,"missing","missing");
        t = await thermal(missing);
        for (const e of t.endpoints) { assert.equal(Number(e.count),Number(e.expectedDays) - 1); assert.equal(Number(e.total),Number(e.count) * 20); assert.ok(Number(e.total) > 0); }
        assert.match(await panel().innerText(),/欠測|不足|未取得/);
        await shot("missing");
        await fetch(missing,"complete","complete");
        const offline = cases.find(c => c.kind === "offline");
        await open(offline); await fetch(offline,"offline","fetch-failed");
        assert.match(await panel().innerText(),/失敗|取得でき|再取得/);
        assert.equal((await work(offline)).harvestTimingByField[offline.fieldId].memo,baseline.get("offline").harvestTimingByField[offline.fieldId].memo);
        await shot("offline");
        await fetch(offline,"complete","complete");
        const cancelled = cases.find(c => c.kind === "cancel");
        await open(cancelled);
        const beforeCancel = await page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY),work: RiceOS.state.data().fieldWorks.find(w => w.workId === "qa-timing-thermal-cancel") }));
        await page.evaluate(() => {
          window.qaThermalOriginalFetch = RiceOS.weather.fetchDailyRange;
          RiceOS.weather.fetchDailyRange = (...args) => new Promise(resolve => { window.qaReleaseThermal = () => window.qaThermalOriginalFetch(...args).then(resolve); });
        });
        await retry(cancelled).click();
        await page.waitForFunction(() => typeof window.qaReleaseThermal === "function");
        await page.locator("[data-harvest-timing-thermal-cancel]").click();
        assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)),beforeCancel.raw);
        await page.evaluate(async () => { await window.qaReleaseThermal(); RiceOS.weather.fetchDailyRange = window.qaThermalOriginalFetch; });
        await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)),beforeCancel.raw);
        assert.deepEqual(await work(cancelled),beforeCancel.work);
        await shot("cancelled");
        for (const kind of ["future","no-heading"]) {
          const item = cases.find(c => c.kind === kind);
          await page.evaluate(item => RiceOS.state.retryHarvestTimingThermal(item.workId,item.fieldId),item);
          await open(item);
          const result = await thermal(item);
          assert.ok(result?.endpoints?.length);
          assert.ok(result.endpoints.every(e => e.status === (kind === "future" ? "future" : "no-heading")));
          assert.ok(result.endpoints.every(e => e.total === "" || e.total == null),"Unavailable totals must not become zero");
          assert.match(await panel().innerText(),kind === "future" ? /未来|未到来|気象実績待ち/ : /出穂.*未|出穂.*必要|出穂.*待/);
          if (kind === "no-heading" && await retry(item).count() && !await retry(item).isDisabled()) {
            const calls = await page.evaluate(() => window.qaThermalCalls.length);
            await retry(item).click();
            await page.waitForTimeout(150);
            assert.equal(await page.evaluate(() => window.qaThermalCalls.length),calls,"No-heading retry must not fetch or guess thermal totals");
            assert.ok((await thermal(item)).endpoints.every(e => e.total === "" || e.total == null));
          }
          await shot(kind);
        }
        for (const item of cases) {
          const after = await work(item),before = baseline.get(item.kind);
          assert.equal(after.photoData,before.photoData); assert.equal(after.photo,before.photo);
          assert.deepEqual(after.harvestSnapshots,before.harvestSnapshots,"Timing retry must preserve actual harvest thermal");
          assert.equal(after.harvestTimingByField[item.fieldId].memo,before.harvestTimingByField[item.fieldId].memo);
        }
        const beforeReload = await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)),beforeReload);
        await open(full);
        assert.ok((await thermal(full)).endpoints.every(e => e.status === "complete"));
        await shot("reload"); assert.deepEqual(errors,[]);
        console.log(`PASS harvest timing thermal ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
