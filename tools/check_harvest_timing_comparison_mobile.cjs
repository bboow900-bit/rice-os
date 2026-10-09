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
          const R = RiceOS,year = Number(R.utils.today().slice(0,4)) - 1;
          if (!R.state.harvestTimingComparisonFor) throw Error("Comparison API has not landed");
          const fieldId = R.state.addField("QA comparison field"),emptyFieldId = R.state.addField("QA comparison empty");
          const specs = [
            { id: "qa-compare-early",year: year - 2,date: "09-01",assessment: "early",ideal: "09-05",memo: "Upper early season" },
            { id: "qa-compare-appropriate",year: year - 1,date: "09-10",assessment: "appropriate",ideal: "09-10",memo: "Appropriate season" },
            { id: "qa-compare-legacy",year,date: "09-01",assessment: "",ideal: "",memo: "" },
            { id: "qa-compare-late",year,date: "09-15",assessment: "late",ideal: "09-10",memo: "Second harvest in same year" }
          ];
          specs.forEach(s => {
            const date = `${s.year}-${s.date}`,headingDate = `${s.year}-08-01`;
            if (s.id !== "qa-compare-legacy") R.state.saveGrowthLog({ fieldId,date: headingDate,headingObserved: true,memo: `QA heading ${s.year}` });
            const timing = s.assessment ? { [fieldId]: { assessment: s.assessment,idealStartDate: `${s.year}-${s.ideal}`,idealEndDate: `${s.year}-${s.ideal}`,memo: s.memo } } : undefined;
            if (!R.state.saveFieldWork({ workId: s.id,date,workName: "稲刈り",fieldIds: [fieldId],
              ...(s.id === "qa-compare-legacy" ? {} : { harvestStatusByField: { [fieldId]: s.id === "qa-compare-late" ? "partial" : "complete" } }),
              ...(timing ? { harvestTimingByField: timing } : {}),memo: `QA ${s.id}` })) throw Error("Harvest seed failed");
            const startDate = `${s.year}-08-02`,expectedDays = Number(R.utils.daysBetween(startDate,date)) + 1;
            const legacy = JSON.parse(JSON.stringify(R.state.data()));
            legacy.fieldWorks.find(row => row.workId === s.id).harvestSnapshots.find(row => row.fieldId === fieldId).thermal = {
              headingDate,startDate,endDate: date,total: s.id === "qa-compare-late" ? 700 : 900,
              count: String(s.id === "qa-compare-late" ? expectedDays - 1 : expectedDays),expectedDays: String(expectedDays),
              status: s.id === "qa-compare-late" ? "一部欠測" : "確定",source: "Open-Meteo Archive",locationLabel: "QA comparison Archive" };
            if (!R.state.replace(legacy)) throw Error("Legacy comparison snapshot import failed");
          });
          const originalVarietyName = R.state.variety(R.state.field(fieldId).varietyId).name;
          const currentVariety = R.state.varieties().find(v => v.varietyId !== R.state.field(fieldId).varietyId);
          if (!currentVariety) throw Error("Two varieties required for provenance fixture");
          const d = R.utils.clone(R.state.data()),stale = d.fieldWorks.find(w => w.workId === "qa-compare-early").harvestTimingByField[fieldId];
          delete stale.varietySource;
          d.fields.find(field => field.fieldId === fieldId).varietyId = currentVariety.varietyId;
          stale.thermal = { headingDate: `${year - 2}-07-01`,startDate: `${year - 2}-07-02`,asOf: R.utils.today(),source: "Open-Meteo Archive",locationLabel: "Old source",retrievedAt: R.utils.now(),
            endpoints: [{ date: `${year - 2}-09-05`,total: 12345,count: 66,expectedDays: 66,status: "complete" }] };
          if (!R.state.replace(d,"QA comparison isolated fixture")) throw Error("Comparison seed failed");
          return { fieldId,emptyFieldId,year: String(year),ids: specs.map(s => s.id),originalVarietyName,currentVarietyName: currentVariety.name };
        });
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const baseline = await raw();
        const section = () => page.locator("[data-harvest-timing-comparison]");
        const card = id => page.locator(`[data-harvest-timing-comparison-record="${id}"]`);
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px overflow`);
          for (const c of await section().locator("button").all()) assert.ok(await c.evaluate(el => el.scrollWidth <= el.clientWidth + 1),"Comparison card content must fit");
          const file = path.join(os.tmpdir(),`rice-harvest-timing-comparison-${label}-${width}.png`);
          await page.screenshot({ path: file,fullPage: true }); console.log(file);
          if (label === "years") {
            const focus = path.join(os.tmpdir(),`rice-harvest-timing-comparison-focus-${width}.png`);
            await section().screenshot({ path: focus }); console.log(focus);
          }
        };
        const hub = async fieldId => {
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          await page.locator('[data-annual-hub-view="compare"]').click();
          await page.locator(`[data-annual-hub-compare-field="${fieldId}"]`).click();
          await section().waitFor();
        };
        await hub(f.fieldId);
        assert.equal(await section().locator("[data-harvest-timing-comparison-record]").count(),4);
        assert.match(await section().innerText(),/刈取時期を年ごとに振り返る/);
        assert.match(await card("qa-compare-early").innerText(),/早かった/);
        assert.match(await card("qa-compare-appropriate").innerText(),/適期/);
        assert.match(await card("qa-compare-legacy").innerText(),/評価未登録/);
        assert.ok(!(await card("qa-compare-legacy").innerText()).includes("評価入力時の品種情報"),"Legacy unevaluated harvest must not guess a variety");
        for (const id of ["qa-compare-early","qa-compare-appropriate","qa-compare-late"]) {
          const text = await card(id).innerText();
          assert.ok(text.includes(f.originalVarietyName),"Stored evaluation variety must remain historical");
          assert.ok(!text.includes(f.currentVarietyName),"Current master variety must not be inferred for an older evaluation");
        }
        assert.match(await card("qa-compare-late").innerText(),/遅かった/);
        assert.match(await card("qa-compare-early").innerText(),/刈取完了/);
        assert.match(await card("qa-compare-late").innerText(),/一部刈取/);
        assert.match(await card("qa-compare-legacy").innerText(),/完了区分未確認/);
        assert.match(await card("qa-compare-early").innerText(),/品種参照（出典未確認）/);
        assert.match(await card("qa-compare-late").innerText(),/取得済み分のみ/);
        assert.match(await card("qa-compare-early").innerText(),/条件変更・再計算待ち/);
        assert.ok(!(await card("qa-compare-early").innerText()).includes("12345"),"Stale ideal thermal total must not be presented as current");
        assert.match(await section().innerText(),/2件の刈取記録/);
        assert.equal(await raw(),baseline);
        await shot("years");
        for (const id of f.ids) {
          await card(id).click();
          await page.locator(".annual-record-detail").waitFor();
          assert.equal(await page.locator("#screen-field-work.active").count(),0,"Comparison card must open detail, not editor");
          assert.match(await page.locator(".annual-record-detail-head").innerText(),/稲刈り/);
          assert.equal(await raw(),baseline);
          await page.locator("[data-annual-record-detail-back]").click();
          await section().waitFor();
        }
        await page.locator('.nav-item[data-screen="annual"]:visible').click();
        await page.locator("#annualYear").selectOption(f.year);
        await page.evaluate(id => RiceOS.screens.annual.openField(id,"work"),f.fieldId);
        await page.locator("[data-annual-open-compare]").click();
        await section().waitFor();
        assert.equal(await section().locator("[data-harvest-timing-comparison-record]").count(),4);
        assert.equal(await raw(),baseline,"Field detail to comparison must not write");
        await shot("field-route");
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await raw(),baseline);
        await hub(f.fieldId);
        assert.equal(await section().locator("[data-harvest-timing-comparison-record]").count(),4);
        assert.match(await card("qa-compare-legacy").innerText(),/評価未登録/);
        await hub(f.emptyFieldId);
        assert.equal(await section().locator("[data-harvest-timing-comparison-record]").count(),0);
        assert.match(await section().innerText(),/刈取記録はまだありません/);
        await shot("empty");
        assert.equal(await raw(),baseline); assert.deepEqual(errors,[]);
        console.log(`PASS harvest timing comparison ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
