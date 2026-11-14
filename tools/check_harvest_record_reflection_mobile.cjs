"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [], dialogs = [];
    let stage = "fixture";
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", async d => { dialogs.push(d.message()); await d.dismiss(); });
    const click = s => page.locator(`${s}:visible`).click();
    const detail = () => page.locator(".annual-record-detail:visible");
    const panel = () => detail().locator(".harvest-reflection");
    const shot = async label => {
      await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
      const file = path.join(os.tmpdir(), `rice-harvest-record-reflection-${label}-${width}.png`);
      await page.screenshot({ path: file }); console.log(file);
    };
    try {
      await page.clock.setFixedTime(new Date("2026-11-14T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto(process.env.HARVEST_REFLECTION_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const f = await page.evaluate(() => {
        const R = RiceOS, S = R.state, v = S.addVariety("Reflection test variety"), a = S.addField("Reflection field A"), b = S.addField("Reflection field B");
        S.updateField(a, { varietyId: v, areaA: 10 }); S.updateField(b, { varietyId: v, areaA: 10 });
        S.updateWeatherLocation({ latitude: 37.75, longitude: 140.47, label: "Isolated fixture", source: "manual" });
        const d = R.utils.clone(S.data());
        for (const id of [a, b]) d.growthLogs.push({ logId: `reflection-heading-${id}`, fieldId: id, date: "2026-08-01", cropYear: 2026, headingObserved: true });
        d.fieldWorks.push({ workId: "reflection-group", date: "2026-09-12", cropYear: 2026, workName: "稲刈り", fieldIds: [a, b], memo: "Original shared memo <literal>",
          harvestTimingByField: { [a]: { assessment: "appropriate", memo: "A operator evidence" }, [b]: { assessment: "early", memo: "B operator evidence" } },
          harvestReview: { yieldKg: "1200", harvestAreaA: "20", yieldBasis: "玄米（乾燥調製後）", weeds: "多い", weedNote: "Shared weed observation" },
          harvestSnapshots: [a, b].map(fieldId => ({ fieldId, harvestDate: "2026-09-12", thermal: { coverageVersion: 1, total: 1030, count: 40, expectedDays: 42, headingDate: "2026-08-01", startDate: "2026-08-02", endDate: "2026-09-12", source: "Open-Meteo Archive", status: "一部欠測" } })) },
          { workId: "reflection-missing", date: "2025-09-12", cropYear: 2025, workName: "稲刈り", fieldIds: [a], harvestReview: { yieldKg: "", harvestAreaA: "", yieldBasis: "" }, harvestTimingByField: { [a]: { assessment: "pending", memo: "Missing basis memo" } } });
        d.meta.outlookSnapshots = [...(d.meta.outlookSnapshots || []), ...[a, b].map(fieldId => ({ snapshotId: `reflection-saved-${fieldId}`, fieldId, season: "2026", asOf: "2026-09-05", savedAt: "2026-09-05T02:00:00Z", headingKind: "actual", headingDate: "2026-08-01", actualHeadingDate: "2026-08-01", harvestKind: "heading", harvestRange: { start: "2026-09-07", end: "2026-09-09" }, basis: {} }))];
        if (!S.replace(d, "Isolated harvest record reflection fixture")) throw Error("Fixture rejected");
        window.__reflectionFetches = 0;
        R.weather.fetchDailyRange = async () => { window.__reflectionFetches++; return new Promise(resolve => { window.__releaseReflectionWeather = () => resolve({ rows: [] }); }); };
        window.__reflectionWrites = [];
        for (const key of ["setItem", "removeItem", "clear"]) {
          const original = Storage.prototype[key];
          Storage.prototype[key] = function (...args) { if (this === localStorage && (key === "clear" || String(args[0]) === R.schema.STORE_KEY)) window.__reflectionWrites.push(key); return original.apply(this, args); };
        }
        return { a, b };
      });
      const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY), data: JSON.stringify(RiceOS.state.data()) }));
      const baseline = await snapshot();
      const unchanged = async () => { assert.deepEqual(await snapshot(), baseline); assert.deepEqual(await page.evaluate(() => window.__reflectionWrites), []); };
      await click('.nav-item[data-screen="annual"]'); await page.locator("#annualYear").selectOption("2026");
      await click(`[data-annual-hub-open-field="${f.a}"]`);
      stage = "timeline without independent harvest overview";
      assert.equal(await page.locator("#screen-annual .annual-compare-check:visible").count(), 0);
      assert.doesNotMatch(await page.locator("#screen-annual").innerText(), /収穫済み・今年の一区切り/);
      const open = () => click('[data-annual-record-open-id="reflection-group"]');
      await open(); await panel().waitFor();
      stage = "operator assessment independent of validated reference";
      const model = await page.evaluate(a => RiceOS.harvestReview.describe(RiceOS.state.data().fieldWorks.find(w => w.workId === "reflection-group"), a), f.a);
      assert.equal(model.assessment.code, "appropriate"); assert.equal(model.comparison.day.available, true); assert.equal(model.comparison.day.offsetDays, 3);
      assert.equal(await panel().locator(".harvest-final-judgment h3").innerText(), "適期");
      assert.match(await panel().innerText(), /目安期間の終了から3日後/);
      assert.doesNotMatch(await panel().innerText(), /刈り遅れ/);
      assert.match(await panel().locator(".harvest-result-metrics").innerText(), /1200/);
      assert.match(await panel().locator(".harvest-result-metrics").innerText(), /1030/);
      assert.match(await panel().locator(".harvest-result-metrics").innerText(), /一部欠測|取得済み分/);
      assert.match(await panel().innerText(), /共通の観察/); assert.match(await panel().innerText(), /対象圃場合計/);
      assert.match(await panel().locator(".harvest-handoff-facts").innerText(), /A operator evidence/);
      assert.doesNotMatch(await panel().locator(".harvest-handoff-facts").innerText(), /B operator evidence/);
      assert.match(await panel().locator(".harvest-handoff-facts").innerText(), /Original shared memo <literal>/);
      assert.equal(await page.evaluate(() => window.__reflectionFetches), 0);
      await shot("assessment-top");
      stage = "confirmation cancel and actual thermal retry cancel";
      const beforeDialogs = dialogs.length;
      await click('[data-annual-harvest-confirm="reflection-group"]'); assert.equal(dialogs.length, beforeDialogs + 1); await unchanged();
      await click('[data-harvest-thermal-retry="reflection-group"]');
      await page.locator('[data-harvest-thermal-cancel="reflection-group"]:visible').waitFor();
      assert.equal(await page.evaluate(() => window.__reflectionFetches), 1);
      await click('[data-harvest-thermal-cancel="reflection-group"]');
      await page.evaluate(() => window.__releaseReflectionWeather()); await page.waitForTimeout(100); await unchanged();
      stage = "exact timing editor and unchanged back";
      await click('[data-annual-harvest-edit="reflection-group"][data-harvest-edit-section="timing"]');
      await page.locator("#screen-field-work.active").waitFor();
      assert.equal(await page.locator("#fwHarvestTiming").evaluate(el => el.open), true, "Timing section, not only yield, opens");
      await shot("timing-editor"); await click("#appBackButton");
      await page.locator("#screen-annual.active").waitFor(); await unchanged();
      if (!await detail().count()) await open();
      await detail().locator(".harvest-result-metrics").scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
      await shot("metrics-scrolled");
      const overlap = await detail().locator(".harvest-result-metrics").evaluate(el => {
        const sticky = document.querySelector(".annual-field-switcher, .annual-field-switch, .annual-field-context-bar");
        if (!sticky) return null;
        const a = el.getBoundingClientRect(), b = sticky.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      });
      console.log(`Viewport metrics/sticky overlap ${width}: ${overlap}`);
      await click("[data-annual-record-detail-back]");
      stage = "field-specific assessment and crop-year isolation";
      await page.locator("[data-annual-field-switch]").selectOption(f.b); await open();
      assert.equal(await panel().locator(".harvest-final-judgment h3").innerText(), "早かった");
      assert.doesNotMatch(await panel().locator(".harvest-handoff-facts").innerText(), /A operator evidence/);
      await click("[data-annual-record-detail-back]"); await click("#appBackButton");
      await page.locator("#annualYear").selectOption("2025"); await click(`[data-annual-hub-open-field="${f.a}"]`);
      await click('[data-annual-record-open-id="reflection-missing"]'); await panel().waitFor();
      assert.equal(await panel().locator(".harvest-final-judgment h3").innerText(), "判断保留");
      assert.doesNotMatch(await panel().locator(".harvest-result-metrics").innerText(), /\b0\s*(?:kg|℃)/);
      assert.doesNotMatch(await panel().innerText(), /目安期間の範囲内|3日後|NaN|undefined/);
      assert.match(await panel().innerText(), /比較できません/); await shot("missing-basis");
      await unchanged(); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`PASS independent harvest record reflection ${width}: operator/reference separation, shared metrics/observations, missing basis, timing editor, confirmation/retry cancellation, field/year, no writes`);
    } catch (e) { console.error(`FAIL reflection ${width} at ${stage}`); await shot("failure").catch(() => {}); throw e; }
    finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
