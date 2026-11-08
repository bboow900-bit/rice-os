"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  const baselineOnly = process.env.SUMMARY_BEFORE === "1";
  try { for (const width of baselineOnly ? [360] : [360,390,430,599,600,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width < 600,hasTouch:width < 600,serviceWorkers:"block"});
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.clock.setFixedTime(new Date("2026-11-08T03:00:00Z"));
    await page.route("https://**/*", route => route.abort());
    await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
    const f = await page.evaluate(() => {
      const S = RiceOS.state, a = S.addField("亀石左下・山あいの用水路沿いの長い名前"), b = S.addField("亀石右上・西側の田んぼ");
      const d = RiceOS.utils.clone(S.data());
      d.fieldWorks.push({workId:"qa-summary-plant",date:"2026-05-14",cropYear:2026,workName:"田植え",fieldIds:[a],hours:"2"},
        {workId:"qa-summary-group",date:"2026-07-21",cropYear:2026,workName:"追肥",fieldIds:[a,b],material:"試験用資材",hours:"123456.75",memo:"詳細だけに残す長いメモ"},
        {workId:"qa-summary-off",date:"2026-04-01",cropYear:2026,workName:"播種",targetScope:"offField",fieldIds:[]},
        {workId:"qa-summary-old",date:"2025-05-10",cropYear:2025,workName:"田植え",fieldIds:[a]});
      S.replace(d,"QA summary fixture"); return {a,b};
    });
    const before = await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
    await page.locator('.nav-item[data-screen="annual"]:visible').click();
    await page.locator("#annualYear").selectOption("2026");
    await page.locator('[data-annual-hub-view="work"]').click();
    const openSummary = async () => {
      await page.locator(".annual-hub-summary > summary").click();
      await page.locator(".annual-summary-board > details > summary").click();
    };
    const verifyLayout = async () => {
      const failures = await page.locator(".annual-summary-board").evaluate(root => {
        const bad = [], cards = [...root.querySelectorAll(".annual-summary-card")];
        const intersects = (a,b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        cards.forEach((card,index) => {
          const bounds = card.getBoundingClientRect(), label = card.querySelector("span"), main = card.querySelector("b");
          if (intersects(label.getBoundingClientRect(),main.getBoundingClientRect())) bad.push(`label/value overlap ${index}`);
          const value = main.querySelector("strong"), unit = main.querySelector("small");
          if (value && unit && intersects(value.getBoundingClientRect(),unit.getBoundingClientRect())) bad.push(`value/unit overlap ${index}`);
          for (const el of card.querySelectorAll("span,strong,small")) {
            const range = document.createRange(); range.selectNodeContents(el);
            for (const rect of range.getClientRects()) if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) bad.push(`text outside card ${index}`);
          }
          if (parseFloat(getComputedStyle(label).fontSize) < 12) bad.push(`tiny label ${index}`);
          if (card.scrollWidth > card.clientWidth + 1) bad.push(`card overflow ${index}`);
        });
        root.querySelectorAll(".annual-summary-milestones > div").forEach((item,index) => {
          if (intersects(item.querySelector("small").getBoundingClientRect(),item.querySelector("b").getBoundingClientRect())) bad.push(`milestone label/date overlap ${index}`);
          if (item.scrollWidth > item.clientWidth + 1) bad.push(`milestone overflow ${index}`);
        });
        return bad;
      });
      assert.deepEqual(failures,[]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false);
    };
    await openSummary();
    assert.match(await page.locator(".annual-summary-board").innerText(),/123458/);
    if (!baselineOnly) await verifyLayout();
    const shot = path.join(os.tmpdir(),`rice-annual-summary-${baselineOnly ? "before" : "after"}-${width}.png`);
    await page.locator(".annual-summary-board").screenshot({path:shot}); console.log(shot);
    if (!baselineOnly) {
      await page.locator(".annual-summary-essential strong").evaluateAll(nodes => nodes.forEach(node => { node.textContent = "123456789"; }));
      await verifyLayout();
      await page.locator("#annualYear").selectOption("all"); await openSummary(); await verifyLayout();
      await page.locator(".annual-summary-board").screenshot({path:path.join(os.tmpdir(),`rice-annual-summary-all-years-${width}.png`)});
      const archive = page.locator("[data-annual-work-list]"); await archive.locator(":scope > summary").click();
      const group = page.locator('.annual-archive-preview[data-annual-record-open-id="qa-summary-group"]');
      assert.match(await group.locator(".annual-archive-target").innerText(),/亀石左下/);
      assert.match(await group.locator(".annual-archive-target").innerText(),/亀石右上/);
      assert.match(await page.locator('.annual-archive-preview[data-annual-record-open-id="qa-summary-off"] .annual-archive-target').innerText(),/圃場外/);
      await group.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-archive-targets-${width}.png`)});
      await group.click(); await page.locator(".annual-record-detail").waitFor();
      assert.match(await page.locator(".annual-record-detail-head").innerText(),/亀石左下/);
      assert.match(await page.locator(".annual-record-detail-head").innerText(),/亀石右上/);
      await page.locator("#appBackButton").click(); await page.locator(".annual-work-archive").waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)),before);
      assert.deepEqual(errors,[]);
      console.log(`PASS annual summary ${width}: readable labels, long duration, all-year dates, field/off-field targets, detail/back, no writes`);
    }
    await context.close();
  } } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
