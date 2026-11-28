"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" });
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.clock.setFixedTime(new Date("2026-08-03T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const fixture = await page.evaluate(() => {
        const S = RiceOS.state, group = S.addFieldGroup("開パ"), id = S.addField("開パ 下");
        const d = RiceOS.utils.clone(S.data());
        Object.assign(d.fields.find(f => f.fieldId === id), { fieldGroupId: group, areaA: 20 });
        d.schedules = [
          { scheduleId: "calendar-style-mow", date: "2026-08-03", title: "草刈り", fieldIds: [id], status: "予定", cropYear: 2026 },
          { scheduleId: "calendar-style-long", date: "2026-08-03", title: "用水路沿いの畦畔・長い作業名でも表示が重ならない確認", fieldIds: [id], status: "予定", cropYear: 2026 }
        ];
        d.fieldWorks = [{ workId: "calendar-style-actual", date: "2026-08-03", workName: "見回り", fieldIds: [id], cropYear: 2026, memo: "畦際と水の状態を記録。" }];
        d.growthLogs = [{ logId: "calendar-style-heading", date: "2026-08-01", fieldId: id, headingObserved: true }];
        S.replace(d, "Isolated calendar UI fixture");
        return { id, group };
      });
      await page.locator('.nav-item[data-screen="calendar"]:visible').click();
      await page.locator("#calendarTargetFilter").selectOption("group:" + fixture.group);
      await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const baseline = await raw();
      assert.equal(await page.locator("#calendarGrid .calendar-day").count(), 42);
      assert.equal(await page.locator("#calendarGrid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length), 7);
      if (width < 900) assert.equal(await page.locator(".nav-item:visible").count(), 6);
      for (const selector of ["[data-calendar-move]", "#calendarToday", "#calendarDisplayMode", "#calendarTargetFilter"]) {
        assert((await page.locator(selector).evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height))).every(h => h >= 44));
      }
      assert.match(await page.locator("#calendarTitle").evaluate(el => getComputedStyle(el).fontFamily), /Mincho|Serif|serif/);
      const filterBoxes=await page.locator('.calendar-view-tools select,.calendar-view-tools button').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().bottom));
      assert(filterBoxes.every(bottom=>Math.abs(bottom-filterBoxes[0])<2),'Filters and Today stay in one aligned row');
      const screenshot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(os.tmpdir(), `rice-calendar-unified-${name}-${width}.png`) });
      };
      await screenshot("top");
      await page.locator("#calendarDisplayMode").selectOption("all");
      assert.match(await page.locator("#selectedDateEntries").innerText(), /草刈り/);
      assert.match(await page.locator("#selectedDateEntries").innerText(), /見回り/);
      await page.locator("#selectedDateSummary").evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
      await screenshot("entries");
      const clipped = await page.locator("#selectedDateEntries .mini-card > b,#selectedDateEntries .mini-card > span,#selectedDateEntries .mini-card > small").evaluateAll(nodes => nodes.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2).map(el => el.textContent));
      assert.deepEqual(clipped, [], "Record titles and field names must not clip");
      await page.locator("[data-calendar-move='1']").click();
      assert.match(await page.locator("#calendarTitle").innerText(), /9月/);
      await page.locator("#calendarToday").click();
      assert.equal(await page.locator(".calendar-day.selected").getAttribute("data-date"), "2026-08-03");
      await page.locator("[data-calendar-add-plan]").click();
      await page.locator("#sheetScheduleForm").waitFor({ state: "visible" });
      await page.locator("button[data-sheet-close]").click();
      await page.locator("[data-calendar-add-record]").click();
      await page.locator("#dateSheet").waitFor({ state: "visible" });
      await page.locator("button[data-sheet-close]").click();
      assert.equal(await raw(), baseline, "Reading and cancelling must not change saved records");
      assert.deepEqual(errors, []);
      console.log(`PASS calendar watercolor ${width}: typography, targets, grid, filters, routes and no storage writes`);
    } finally { await context.close(); }
  } } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
