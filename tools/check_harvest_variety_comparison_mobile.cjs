"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 },isMobile: true,hasTouch: true,serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror",e => errors.push(e.message)); page.on("dialog",d => d.dismiss());
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(() => {
          const R = RiceOS, year = Number(R.utils.today().slice(0,4)) - 1;
          const fieldId = R.state.addField("QA variety origin"), otherId = R.state.addField("QA variety neighbor"), emptyId = R.state.addField("QA variety unset");
          const varietyId = R.state.varieties()[0].varietyId;
          const specs = [
            { id: "qa-variety-origin",fieldId,assessment: "early",year },
            { id: "qa-variety-neighbor",fieldId: otherId,assessment: "appropriate",year: year - 1 },
            { id: "qa-variety-conflict",fieldId: otherId,assessment: "early",year: year - 2,conflict: true },
            { id: "qa-variety-partial",fieldId,assessment: "early",year: year - 3,status: "partial" },
            { id: "qa-variety-legacy",fieldId,assessment: "early",year: year - 4,legacy: true },
            { id: "qa-variety-pending",fieldId,assessment: "pending",year: year - 5 },
            { id: "qa-variety-unrated",fieldId,year: year - 6 },
            { id: "qa-variety-unknown",fieldId,assessment: "early",year: year - 7,unknown: true }
          ];
          for (const s of specs) {
            R.state.saveGrowthLog({ fieldId: s.fieldId,date: `${s.year}-08-01`,headingObserved: true });
            if (s.conflict) R.state.saveGrowthLog({ fieldId: s.fieldId,date: `${s.year}-08-02`,headingObserved: true });
            const timing = s.assessment ? { assessment: s.assessment,...(s.assessment === "appropriate" || s.assessment === "pending" ? {} : { idealStartDate: `${s.year}-09-12`,idealEndDate: `${s.year}-09-14` }),memo: s.id } : null;
            if (!R.state.saveFieldWork({ workId: s.id,date: `${s.year}-09-10`,fieldIds: [s.fieldId],workName: "稲刈り",
              ...(s.legacy ? {} : { harvestStatusByField: { [s.fieldId]: s.status || "complete" } }),
              ...(timing ? { harvestTimingByField: { [s.fieldId]: timing } } : {}) })) throw Error(`Seed failed ${s.id}`);
          }
          const d = R.utils.clone(R.state.data());
          // Normal heading entry reconciles prior confirmations; import a legacy conflict explicitly.
          for (const s of specs.filter(s => s.conflict)) {
            d.growthLogs.push({ logId: `${s.id}-legacy-heading-a`, fieldId: s.fieldId, date: `${s.year}-08-01`, headingObserved: true });
            d.growthLogs.push({ logId: `${s.id}-legacy-heading-b`, fieldId: s.fieldId, date: `${s.year}-08-02`, headingObserved: true });
          }
          d.fields.find(v => v.fieldId === fieldId).varietyId = varietyId;
          d.fields.find(v => v.fieldId === otherId).varietyId = varietyId;
          d.varieties.push({ varietyId: "qa-variety-no-records", name: "QA no evaluated records" });
          d.fields.find(v => v.fieldId === emptyId).varietyId = "qa-variety-no-records";
          for (const s of specs.filter(s => s.assessment)) {
            const timing = d.fieldWorks.find(w => w.workId === s.id).harvestTimingByField[s.fieldId];
            timing.varietyId = s.unknown ? "" : varietyId;
            timing.varietySource = "assessment-current-master";
          }
          if (!R.state.replace(d,"QA isolated variety comparison")) throw Error("Seed import failed");
          window.qaVarietyFetches = 0;
          for (const key of ["fetchDailyRange","fetchSamePeriodAverage","fetchSamePeriodDailyAverage"]) R.weather[key] = async () => { window.qaVarietyFetches++; throw Error("Comparison must not fetch"); };
          return { fieldId,otherId,emptyId };
        });
        const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY),data: JSON.stringify(RiceOS.state.data()) }));
        const baseline = await snapshot(), root = () => page.locator("[data-harvest-variety-comparison]");
        const card = id => root().locator(`[data-harvest-variety-record="${id}"]`);
        const expand = async () => { if (!await root().evaluate(el => el.open)) await root().locator(":scope > summary").click(); };
        const open = async id => {
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          await page.locator('[data-annual-hub-view="compare"]').click();
          await page.locator(`[data-annual-hub-compare-field="${id}"]`).click(); await root().waitFor();
        };
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,"Horizontal overflow");
          const file = path.join(os.tmpdir(),`rice-harvest-variety-comparison-${label}-${width}.png`);
          await page.screenshot({ path: file }); console.log(file);
        };
        await open(f.fieldId); assert.equal(await root().evaluate(el => el.open),false);
        await root().evaluate(el => el.scrollIntoView({ block: "center" })); await shot("collapsed"); await expand();
        assert.equal(await root().locator("article").count(),3);
        assert.match(await root().innerText(),/過去年の栽培品種確定ではありません/);
        const rows = await page.evaluate(id => RiceOS.state.harvestVarietyComparisonFor(id),f.fieldId);
        assert.equal(rows.rows.find(r => r.workId === "qa-variety-origin").daysAfterHeading,40);
        assert.equal(rows.rows.find(r => r.workId === "qa-variety-neighbor").idealUsesActualDate,true);
        assert.equal(rows.rows.find(r => r.workId === "qa-variety-conflict").daysAfterHeading,"");
        assert.match(await card("qa-variety-origin").innerText(),/出穂から40日/);
        assert.match(await card("qa-variety-neighbor").innerText(),/刈取日を適期と評価/);
        assert.match(await card("qa-variety-conflict").innerText(),/出穂実測の根拠待ち/);
        assert.equal(rows.excluded.filter(row => row.workId.startsWith("qa-variety-")).length,5);
        for (const [id,reason] of [["partial",/部分刈取/],["legacy",/完了区分/],["pending",/保留/],["unrated",/未登録/],["unknown",/品種IDが未登録/]]) {
          assert.match(rows.excluded.find(r => r.workId === `qa-variety-${id}`).reason,reason);
          assert.equal(await card(`qa-variety-${id}`).count(),0);
        }
        await root().locator(":scope > details > summary").click();
        assert.match(await root().innerText(),/部分刈取.*除外/);
        await card("qa-variety-neighbor").evaluate(el => el.scrollIntoView({ block: "center" })); await shot("neighbor");
        await card("qa-variety-neighbor").locator(`[data-annual-record-field="${f.otherId}"]`).click();
        await page.locator(".annual-record-detail").waitFor();
        assert.match(await page.locator(".annual-record-detail").innerText(),/QA variety neighbor/);
        assert.equal(await page.locator("#screen-field-work.active").count(),0);
        await page.locator("[data-annual-record-detail-back]").click(); await root().waitFor(); await expand();
        assert.equal(await card("qa-variety-origin").locator(".annual-variety-record-head").innerText().then(t => t.includes("この圃場")),true);
        assert.equal(await card("qa-variety-neighbor").locator(".annual-variety-record-head").innerText().then(t => t.includes("この圃場")),false);
        assert.deepEqual(await snapshot(),baseline); assert.equal(await page.evaluate(() => window.qaVarietyFetches),0);
        await open(f.emptyId); await expand(); assert.equal(await root().locator("article").count(),0);
        assert.match(await root().innerText(),/比較できる評価付き刈取記録はまだありません/); await shot("empty");
        assert.deepEqual(await snapshot(),baseline);
        await page.reload({ waitUntil: "networkidle" }); assert.equal((await snapshot()).raw,baseline.raw);
        await open(f.fieldId); await expand(); assert.equal(await root().locator("article").count(),3);
        assert.equal((await snapshot()).raw,baseline.raw); assert.deepEqual(errors,[]);
        console.log(`PASS harvest variety comparison ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
