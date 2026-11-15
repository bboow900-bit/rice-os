"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [], dialogs = [];
    let stage = "fixture";
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", async d => { dialogs.push(d.message()); await d.dismiss(); });
    const click = selector => page.locator(`${selector}:visible`).click();
    const recap = () => page.locator(".harvest-recap:visible");
    const data = () => page.evaluate(() => RiceOS.utils.clone(RiceOS.state.data()));
    const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
    const shot = async name => {
      await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
      const file = path.join(os.tmpdir(), `rice-harvest-delay-reason-${name}-${width}.png`);
      await page.screenshot({ path: file }); console.log(file);
    };
    try {
      await page.clock.setFixedTime(new Date("2026-11-15T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto(process.env.HARVEST_DELAY_REASON_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const ids = await page.evaluate(() => {
        const R = RiceOS, S = R.state, v = S.addVariety("Delay reason variety"), a = S.addField("Delay group first A"), b = S.addField("Delay selected second B");
        S.updateField(a, { varietyId: v, areaA: 10 }); S.updateField(b, { varietyId: v, areaA: 10 });
        S.updateWeatherLocation({ latitude: 37.75, longitude: 140.47, label: "Isolated delay fixture", source: "manual" });
        for (const fieldId of [a, b]) if (!S.saveGrowthLog({ fieldId, date: "2026-08-01", cropYear: 2026, headingObserved: true, memo: "Preserved heading" })) throw Error("Heading fixture");
        if (!S.saveFieldWork({ workId: "delay-group", date: "2026-09-12", cropYear: 2026, fieldIds: [a, b], workName: "稲刈り", memo: "Preserved shared work memo", worker: "自分",
          harvestStatusByField: { [a]: "complete", [b]: "complete" },
          harvestTimingByField: { [a]: { assessment: "pending", idealStartDate: "2026-09-12", idealEndDate: "2026-09-12", delayReason: "machine", memo: "Only A evidence" }, [b]: { assessment: "appropriate", idealStartDate: "2026-09-12", idealEndDate: "2026-09-12", delayReason: "", memo: "Original B evidence" } },
          harvestReview: { surface: "適度", weeds: "少し", weedNote: "Preserved shared weeds", yieldKg: "1200", harvestAreaA: "20", yieldBasis: "玄米（乾燥調製後）" } })) throw Error("Harvest fixture");
        const d = R.utils.clone(S.data()), work = d.fieldWorks.find(w => w.workId === "delay-group"), token = JSON.stringify(d.meta.weatherLocation);
        const source = "Open-Meteo Archive (reanalysis/model)";
        for (const fieldId of [a, b]) work.harvestTimingByField[fieldId].thermal = { source, headingDate: "2026-08-01", startDate: "2026-08-02", locationToken: token, asOf: "2026-11-15", retrievedAt: "2026-09-13T02:00:00Z", endpoints: [{ date: "2026-09-12", status: "complete", total: 1030, count: 42, expectedDays: 42, source }] };
        work.harvestSnapshots = [a, b].map(fieldId => ({ fieldId, harvestDate: "2026-09-12", savedAt: "2026-09-13T02:00:00Z", weather: { status: "saved", custom: "retain weather" }, water: { finalDrainDate: "2026-09-01", custom: "retain water" }, outlook: { status: "保存時点の根拠", custom: "retain outlook" }, thermal: { status: "確定", coverageVersion: 1, locationToken: token, total: 1030, count: 42, expectedDays: 42, headingDate: "2026-08-01", startDate: "2026-08-02", endDate: "2026-09-12", source: "Open-Meteo Archive", retrievedAt: "2026-09-13T02:00:00Z" } }));
        if (!S.replace(d, "Isolated reason edit snapshot fixture")) throw Error("Fixture replace");
        for (const fieldId of [a, b]) if (!S.isHarvestThermalComplete("delay-group", fieldId) || !S.harvestTimingThermalIsCurrent("delay-group", fieldId)) throw Error("Fixture thermal coverage must be current before editing");
        window.__delayWrites = [];
        for (const method of ["setItem", "removeItem", "clear"]) { const original = Storage.prototype[method]; Storage.prototype[method] = function (...args) { if (this === localStorage && (method === "clear" || String(args[0]) === R.schema.STORE_KEY)) window.__delayWrites.push(method); return original.apply(this, args); }; }
        window.__delayWeatherCalls = 0;
        R.weather.fetchDailyRange = async () => { window.__delayWeatherCalls++; throw Error("Existing complete snapshots must not refetch"); };
        return { a, b };
      });
      const initial = await data(), initialRaw = await raw(), originalWork = initial.fieldWorks.find(w => w.workId === "delay-group");
      await click('.nav-item[data-screen="annual"]'); await page.locator("#annualYear").selectOption("2026"); await click(`[data-annual-hub-open-field="${ids.b}"]`);
      const field = () => page.locator(`#fwHarvestTiming .harvest-timing-field[data-field-id="${ids.b}"]`);
      const reason = () => field().locator('[data-timing-key="delayReason"]');
      const memo = () => field().locator('[data-timing-key="memo"]');
      const open = async () => {
        await recap().locator('[data-annual-harvest-edit="delay-group"][data-harvest-edit-section="reason"]').click();
        await page.locator("#screen-field-work.active").waitFor();
        await page.waitForTimeout(350);
        assert.equal(await page.locator("#editFieldWorkId").inputValue(), "delay-group");
        assert.equal(await page.locator("#fwHarvestTiming").evaluate(n => n.open), true);
        assert.equal(await reason().isVisible(), true); assert.equal(await memo().isVisible(), true);
        const state = await reason().evaluate(el => {
          const r = el.getBoundingClientRect(), closed = [];
          for (let n = el.parentElement; n; n = n.parentElement) if (n.tagName === "DETAILS" && !n.open) closed.push(n.id || "inner-details");
          return { focused: document.activeElement === el, closed, top: r.top, bottom: r.bottom, height: innerHeight };
        });
        assert.deepEqual(state.closed, []); assert.equal(state.focused, true, "Selected second field reason receives focus");
        assert(state.top >= 0 && state.bottom <= state.height - 50, "Reason control in actual mobile viewport");
        assert.equal(await memo().evaluate(el => !!el.closest('.harvest-timing-field details')), false, "Memo outside inner details");
      };
      stage = "exact overview reason entry and cancel";
      await open(); assert.equal(await reason().inputValue(), ""); assert.equal(await memo().inputValue(), "Original B evidence");
      await shot("reason-entry");
      await reason().selectOption("schedule"); await memo().fill("Cancelled B memo"); await click("#appBackButton"); await recap().waitFor();
      assert.equal(await raw(), initialRaw); assert.deepEqual(await data(), initial); assert.deepEqual(await page.evaluate(() => window.__delayWrites), []);
      stage = "explicit existing-record save and group snapshot preservation";
      await open(); assert.equal(await reason().inputValue(), ""); assert.equal(await memo().inputValue(), "Original B evidence");
      await reason().selectOption("rain"); await memo().fill("雨で日程を調整したが、現場判断は適期。Bだけの追記。");
      await click('#fieldWorkForm button[type="submit"]');
      await page.waitForFunction(b => RiceOS.state.data().fieldWorks.find(w => w.workId === "delay-group")?.harvestTimingByField[b]?.delayReason === "rain", ids.b);
      await page.waitForFunction(() => document.querySelector("#editFieldWorkId").value === "");
      const saved = await data(), current = saved.fieldWorks.find(w => w.workId === "delay-group");
      assert.equal(current.harvestTimingByField[ids.b].memo, "雨で日程を調整したが、現場判断は適期。Bだけの追記。");
      assert.equal(current.harvestTimingByField[ids.b].assessment, "appropriate");
      assert.deepEqual(current.harvestTimingByField[ids.a], originalWork.harvestTimingByField[ids.a], "Other field timing untouched");
      assert.deepEqual(current.harvestSnapshots, originalWork.harvestSnapshots, "All actual snapshots byte-equivalent");
      assert.deepEqual(current.harvestReview, originalWork.harvestReview, "Shared review/yield untouched");
      assert.deepEqual(current.harvestTimingByField[ids.b].thermal, originalWork.harvestTimingByField[ids.b].thermal, "Selected field timing thermal retained");
      const protectedWork = w => { const c = structuredClone(w); delete c.updatedAt; for (const key of ["delayReason", "memo", "evaluatedAt"]) delete c.harvestTimingByField[ids.b][key]; return c; };
      assert.deepEqual(protectedWork(current), protectedWork(originalWork), "Only selected reason/memo and timestamps may change");
      for (const key of Object.keys(initial).filter(k => !["fieldWorks", "meta"].includes(k))) assert.deepEqual(saved[key], initial[key], `Unrelated collection ${key}`);
      assert.equal(saved.fieldWorks.length, initial.fieldWorks.length);
      assert.equal(await page.evaluate(() => window.__delayWeatherCalls), 0);
      if (await page.locator("#screen-field-work.active").count()) await click("#appBackButton");
      await recap().waitFor(); assert.equal(await page.locator("#annualYear").inputValue(), "2026");
      assert.match(await recap().innerText(), /雨/); assert.match(await recap().innerText(), /Bだけの追記/); assert.match(await recap().locator(".harvest-recap-assessment").innerText(), /適期/);
      assert.doesNotMatch(await recap().innerText(), /刈り遅れ/); await shot("saved-recap");
      const afterSaveRaw = await raw(); await page.evaluate(() => { window.__delayWrites = []; });
      stage = "reopen saved reason and unchanged cancel";
      await open(); assert.equal(await reason().inputValue(), "rain"); assert.match(await memo().inputValue(), /Bだけの追記/);
      await click("#appBackButton"); await recap().waitFor(); assert.equal(await raw(), afterSaveRaw);
      assert.deepEqual(await page.evaluate(() => window.__delayWrites), []); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`PASS independent delay reason ${width}: exact overview/selected second field/focus/visible controls, cancel no writes, save/reopen, group/timing/actual snapshots preserved, no inferred late`);
    } catch (error) { console.error(`FAIL delay reason ${width} at ${stage}`); await shot("failure").catch(() => {}); throw error; }
    finally { await context.close(); }
  }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
