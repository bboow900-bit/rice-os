"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const findings = [];
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    let stage = "fixture";
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.dismiss());
    const recap = () => page.locator("#screen-annual .harvest-recap:visible");
    const click = s => page.locator(`${s}:visible`).click();
    const shot = async name => {
      await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
      const file = path.join(os.tmpdir(), `rice-harvest-recap-${name}-${width}.png`);
      await page.screenshot({ path: file }); console.log(file);
    };
    try {
      await page.clock.setFixedTime(new Date("2026-11-14T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto(process.env.HARVEST_RECAP_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const ids = await page.evaluate(() => {
        const R = RiceOS, S = R.state, a = S.addField("Recap field A"), b = S.addField("Recap field B"), c = S.addField("Recap missing basis");
        const d = R.utils.clone(S.data());
        d.growthLogs.push({ logId: "recap-heading", fieldId: a, date: "2026-08-01", cropYear: 2026, headingObserved: true });
        const work = (id, date, fieldId, extra = {}) => ({ workId: id, date, fieldIds: [fieldId], cropYear: 2026, workName: "稲刈り", ...extra });
        d.fieldWorks.push(
          work("recap-older", "2026-09-08", a, { harvestStatusByField: { [a]: "complete" }, harvestTimingByField: { [a]: { assessment: "late", memo: "Older A evidence" } } }),
          work("recap-latest", "2026-09-12", a, { harvestStatusByField: { [a]: "partial" }, harvestTimingByField: { [a]: { assessment: "appropriate", memo: "Latest A evidence" } },
            memo: "Preserved A memo <literal>", harvestReview: { yieldKg: "1800", harvestAreaA: "20", yieldBasis: "玄米（乾燥調製後）" },
            harvestSnapshots: [{ fieldId: a, harvestDate: "2026-09-12", thermal: { coverageVersion: 1, total: 1030, count: 40, expectedDays: 42, headingDate: "2026-08-01", startDate: "2026-08-02", endDate: "2026-09-12", source: "Open-Meteo Archive", status: "一部欠測" } }] }),
          work("recap-foreign", "2026-09-18", b, { harvestTimingByField: { [b]: { assessment: "early", memo: "Only B evidence" } }, harvestReview: { yieldKg: "9999" } }),
          work("recap-planned", "2026-09-30", a, { workName: "稲刈り予定", status: "予定" }),
          work("recap-wrong-year", "2026-10-01", a, { cropYear: 2025, harvestTimingByField: { [a]: { assessment: "pending", memo: "Crop 2025 evidence" } } }),
          work("recap-missing", "2026-09-20", c));
        d.meta.outlookSnapshots = [...(d.meta.outlookSnapshots || []), { snapshotId: "recap-reference", fieldId: a, season: "2026", asOf: "2026-09-05", savedAt: "2026-09-05T02:00:00Z", headingKind: "actual", headingDate: "2026-08-01", actualHeadingDate: "2026-08-01", harvestKind: "heading", harvestRange: { start: "2026-09-07", end: "2026-09-09" }, basis: {} }];
        if (!S.replace(d, "Isolated harvest recap fixture")) throw Error("Fixture rejected");
        window.__recapWrites = [];
        for (const method of ["setItem", "removeItem", "clear"]) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (...args) { if (this === localStorage && (method === "clear" || String(args[0]) === R.schema.STORE_KEY)) window.__recapWrites.push(method); return original.apply(this, args); };
        }
        return { a, b, c };
      });
      const stored = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY), data: JSON.stringify(RiceOS.state.data()) }));
      const baseline = await stored();
      const unchanged = async () => { assert.deepEqual(await stored(), baseline); assert.deepEqual(await page.evaluate(() => window.__recapWrites), []); };
      await click('.nav-item[data-screen="annual"]'); await page.locator("#annualYear").selectOption("2026"); await click(`[data-annual-hub-open-field="${ids.a}"]`);
      stage = "visible overview recap and latest actual crop-year selection";
      assert.equal(await recap().count(), 1);
      await recap().scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
      assert.equal(await page.locator(".annual-record-detail:visible").count(), 0);
      assert.match(await recap().locator("header").innerText(), /2026年産.*Recap field A/s);
      assert.equal(await recap().locator("[data-annual-harvest-detail]").getAttribute("data-annual-harvest-detail"), "recap-latest");
      assert.match(await recap().locator(".harvest-recap-assessment").innerText(), /適期/);
      assert.match(await recap().locator(".harvest-recap-numbers").innerText(), /1800 kg/);
      assert.match(await recap().locator(".harvest-recap-numbers").innerText(), /1030 ℃/);
      assert.match(await recap().innerText(), /玄米（乾燥調製後）/);
      assert.match(await recap().innerText(), /一部欠測|取得済み分/);
      assert.match(await recap().innerText(), /目安期間の終了から3日後/);
      assert.doesNotMatch(await recap().innerText(), /刈り遅れ|9999|Only B|Older A|Crop 2025|今年の一区切り/);
      const statusText = await recap().innerText();
      if (!/一部刈取|一部収穫|一部実施/.test(statusText)) {
        const finding = `${width}: latest harvestStatusByField=partial is not explicitly identified as a partial harvest in recap`;
        findings.push(finding); console.error(`FINDING ${finding}`);
      }
      const layout = await recap().evaluate(el => {
        const r = el.getBoundingClientRect(), entry = document.querySelector('[data-annual-results]'), compare = document.querySelector('[data-annual-open-compare]');
        return { width: r.width, left: r.left, right: r.right, top: r.top, bottom: r.bottom, before: !entry || entry.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING, compareAfter: !compare || el.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING };
      });
      assert(layout.width > 0 && layout.left >= 0 && layout.right <= width + 1 && layout.before && layout.compareAfter);
      await shot("overview");
      await recap().locator("details > summary").click();
      assert.match(await recap().locator(".harvest-handoff-facts").innerText(), /Preserved A memo <literal>/);
      await unchanged();
      stage = "existing record route and exact recap return";
      await recap().locator("[data-annual-harvest-detail]").click();
      await page.locator(".annual-record-detail:visible .harvest-reflection").waitFor();
      assert.equal(await page.locator(".harvest-final-judgment h3:visible").innerText(), "適期");
      assert.match(await page.locator(".harvest-result-metrics:visible").innerText(), /1800/);
      await click("[data-annual-record-detail-back]"); await recap().waitFor(); await unchanged();
      stage = "field isolation and missing basis";
      await page.locator("[data-annual-field-switch]").selectOption(ids.b);
      assert.equal(await recap().locator("[data-annual-harvest-detail]").getAttribute("data-annual-harvest-detail"), "recap-foreign");
      assert.match(await recap().innerText(), /早かった/); assert.doesNotMatch(await recap().innerText(), /Latest A evidence|1800|1030|3日後/);
      await page.locator("[data-annual-field-switch]").selectOption(ids.c);
      assert.match(await recap().innerText(), /未登録|未確認/);
      assert.doesNotMatch(await recap().innerText(), /\b0\s*(?:kg|℃)|目安期間の範囲内|3日後|NaN|undefined/);
      await recap().scrollIntoViewIfNeeded(); await shot("missing");
      await click("#appBackButton"); await page.locator("#annualYear").selectOption("2025"); await click(`[data-annual-hub-open-field="${ids.a}"]`);
      assert.equal(await recap().locator("[data-annual-harvest-detail]").getAttribute("data-annual-harvest-detail"), "recap-wrong-year");
      assert.match(await recap().locator("header").innerText(), /2025年産/); assert.match(await recap().innerText(), /判断保留/);
      await unchanged(); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`CHECKED harvest recap ${width}: visible overview, same DTO, latest actual/field/crop-year, missing basis, detail/back, no store writes; partial findings=${findings.filter(s => s.startsWith(`${width}:`)).length}`);
    } catch (error) { console.error(`FAIL harvest recap ${width} at ${stage}`); await shot("failure").catch(() => {}); throw error; }
    finally { await context.close(); }
  }} finally { await browser.close(); }
  assert.deepEqual(findings, [], "Harvest recap semantic findings");
})().catch(error => { console.error(error); process.exitCode = 1; });
