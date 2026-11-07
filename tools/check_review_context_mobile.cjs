"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.clock.setFixedTime(new Date("2026-10-20T03:00:00Z"));
    await page.route("https://**/*", route => route.abort());
    await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
    const fixture = await page.evaluate(() => {
      const S = RiceOS.state, id = S.addField("年度をまたぐ長い名前の圃場・山沿い東側"), empty = S.addField("まだ記録のない田んぼ");
      const d = RiceOS.utils.clone(S.data()), memo = "現場で確認した内容を翌年に引き継ぐための長いメモ。".repeat(100) + "<script>not executable</script>";
      d.fieldWorks.push({ workId: "context-previous", date: "2024-11-10", cropYear: 2025, workName: "秋起こし", fieldIds: [id], memo },
        { workId: "context-current", date: "2026-05-14", cropYear: 2026, workName: "田植え", fieldIds: [id] },
        { workId: "context-harvest", date: "2026-09-20", cropYear: 2026, workName: "稲刈り", fieldIds: [id], harvestStatusByField: { [id]: "complete" } });
      for (let n = 0; n < 12; n++) d.fieldWorks.push({ workId: `context-same-day-${n}`, date: "2025-06-01", cropYear: 2025, workName: `同日の作業確認${n + 1}`, fieldIds: [id] });
      S.replace(d, "QA review context fixture");
      return { id, empty, memo };
    });
    const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
    const before = await raw();
    await page.locator('.nav-item[data-screen="annual"]:visible').click();
    await page.locator("#annualYear").selectOption("2025");
    await page.locator(`[data-annual-hub-open-field="${fixture.id}"]`).click();
    assert.match(await page.locator("[data-annual-view-year]").innerText(), /2025年産/);
    const flow = page.locator(".annual-year-flow");
    assert.equal(await flow.locator('[data-annual-record-open-id^="context-same-day-"]').count(), 12);
    assert.equal(await flow.locator('[data-annual-record-open-id="context-current"]').count(), 0);
    await flow.locator('[data-annual-record-open-id="context-previous"]').click();
    await page.locator(".annual-record-detail").waitFor();
    assert.equal(await page.locator("[data-annual-record-year]").innerText(), "2025年産の記録");
    assert.match(await page.locator(".annual-record-detail-head").innerText(), /2024/);
    assert.equal(await page.locator(".annual-record-detail-memo").innerText(), fixture.memo);
    await page.locator(".annual-record-detail-memo").scrollIntoViewIfNeeded();
    const contextPosition = await page.locator(".annual-field-switcher").evaluate(el => {
      const r = el.getBoundingClientRect();
      const parents = []; for (let p = el.parentElement; p; p = p.parentElement) parents.push({ tag: p.id || p.className || p.tagName, overflow: getComputedStyle(p).overflow, position: getComputedStyle(p).position });
      return { top: r.top, bottom: r.bottom, parents };
    });
    assert(contextPosition.top >= 0 && contextPosition.bottom <= 900, JSON.stringify(contextPosition));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.screenshot({ path: path.join(os.tmpdir(), `rice-review-context-${width}.png`) });
    await page.locator("#appBackButton").click();
    await page.locator(".annual-year-flow").waitFor();
    await page.locator("[data-annual-field-switch]").selectOption(fixture.empty);
    assert.match(await page.locator(".annual-detail-head h2").innerText(), /まだ記録のない/);
    assert.match(await page.locator("[data-annual-view-year]").innerText(), /2025年産/);
    await page.locator('.nav-item[data-screen="home"]:visible').click();
    await page.locator("[data-home-harvest-completed] > summary").click();
    const card = page.locator(`[data-home-stage-card="${fixture.id}"]`);
    await card.scrollIntoViewIfNeeded();
    assert.match(await card.locator(".home-stage-heat").innerText(), /収穫時積算.*出穂日未登録/s);
    assert.equal(await card.locator(".home-stage-water").count(), 0);
    assert.equal(await card.locator(".home-harvest-review-state").innerText(), "振り返りメモ未記録");
    assert.equal(await raw(), before, "Year/field filters and detail viewing must not change saved data");
    await page.evaluate(f => {
      RiceOS.app.openInput("field-work", "home");
      RiceOS.screens.fieldWork.prefillFields("2026-10-20", [f.id, f.empty]);
    }, fixture);
    await page.locator("#fwName").selectOption("草刈り");
    await page.locator("#fieldWorkForm summary").filter({ hasText: "写真・メモ" }).click();
    await page.locator("#fwMemo").fill("QA target feedback from real form");
    await page.locator('#fieldWorkForm button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("toast").textContent.includes("計2圃場"));
    const savedWork = await page.evaluate(() => RiceOS.state.data().fieldWorks.find(row => row.memo === "QA target feedback from real form"));
    assert.deepEqual([...savedWork.fieldIds].sort(), [fixture.id, fixture.empty].sort());
    assert.deepEqual(errors, []);
    console.log(`PASS review context ${width}: crop year vs date, same-day records, sticky long memo, empty field, harvested summary; read-only data preserved; real 2-field save and feedback verified`);
    await context.close();
  } } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
