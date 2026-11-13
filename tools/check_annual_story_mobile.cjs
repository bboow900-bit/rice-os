"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const layoutFindings = [];
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [], dialogs = [];
      let stage = "fixture";
      page.on("pageerror", e => errors.push(e.message));
      page.on("dialog", async d => { dialogs.push(d.message()); await d.dismiss(); });
      const stored = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const flow = () => page.locator(".annual-year-flow");
      const card = id => flow().locator(`.annual-year-flow-entry:has([data-annual-record-open-id="${id}"])`);
      const open = id => card(id).locator(`[data-annual-record-open-id="${id}"]`);
      const focus = value => flow().locator(`[data-annual-record-focus="${value}"]`).click();
      const click = selector => page.locator(`${selector}:visible`).click();
      const shot = async name => {
        await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
        const file = path.join(os.tmpdir(), `rice-annual-story-independent-${name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true }); console.log(file);
      };
      const geometry = async () => {
        const failures = await flow().evaluate(root => {
          const bad = [], rows = [...root.querySelectorAll(".annual-year-flow-single-row")];
          const visible = el => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
          const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
          if (!rows.length) bad.push("timeline rows missing");
          rows.forEach((row, i) => {
            const body = row.querySelector(".annual-year-flow-entry"), time = row.querySelector("time");
            const primary = body.querySelector(".annual-year-flow-open"), menu = body.querySelector(".annual-year-flow-menu");
            if (i && row.getBoundingClientRect().top < rows[i - 1].getBoundingClientRect().bottom - 1) bad.push(`rows overlap ${i}`);
            if (visible(time) && overlap(time.getBoundingClientRect(), body.getBoundingClientRect())) bad.push(`date/card overlap ${i}`);
            if (visible(time)) {
              const range = document.createRange(); range.selectNodeContents(time);
              for (const r of range.getClientRects()) if (r.width && r.right > body.getBoundingClientRect().left + 1) bad.push(`date text crosses into card ${i}`);
            }
            if (visible(menu) && overlap(primary.getBoundingClientRect(), menu.getBoundingClientRect())) bad.push(`primary/menu overlap ${i}`);
            if (body.scrollWidth > body.clientWidth + 1) bad.push(`card overflow ${i}`);
            for (const el of body.querySelectorAll("b,em,small,.annual-year-flow-detail,.annual-year-flow-stage-fact,.annual-year-flow-days")) {
              if (!visible(el)) continue;
              const range = document.createRange(); range.selectNodeContents(el);
              const bounds = body.getBoundingClientRect();
              for (const r of range.getClientRects()) if (r.left < bounds.left - 1 || r.right > bounds.right + 1) bad.push(`text outside card ${i}`);
            }
            const lines = [...primary.children].filter(el => visible(el) && el.tagName !== "IMG");
            for (let j = 1; j < lines.length; j++) if (overlap(lines[j - 1].getBoundingClientRect(), lines[j].getBoundingClientRect())) bad.push(`primary text overlap ${i}`);
          });
          if (document.documentElement.scrollWidth > innerWidth) bad.push("page overflow");
          return [...new Set(bad)];
        });
        for (const failure of failures) {
          const finding = `${width}: ${failure}`;
          if (!layoutFindings.includes(finding)) layoutFindings.push(finding);
        }
      };
      try {
        await page.clock.setFixedTime(new Date("2026-11-13T03:00:00Z"));
        await page.route("https://**/*", r => r.abort());
        await page.goto(process.env.ANNUAL_STORY_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
        const ids = await page.evaluate(() => {
          const S = RiceOS.state, a = S.addField("Story <QA> long field name & east"), b = S.addField("Story second field");
          const v = S.addVariety("Story variety");
          S.updateField(a, { varietyId: v, areaA: 20 }); S.updateField(b, { varietyId: v, areaA: 30 });
          const d = RiceOS.utils.clone(S.data());
          const work = (id, date, name, extra = {}) => ({ workId: `story-${id}`, date, cropYear: 2026, workName: name, fieldIds: [a], ...extra });
          d.fieldWorks.push(
            work("plant", "2026-05-14", "田植え"),
            work("plain", "2026-05-15", "耕起"),
            work("facts", "2026-06-05", "追肥", { machine: "Story machine", worker: "Story worker", material: "Story material", memo: "Memo <img src=x onerror=window.storyInjected=1> & literal", custom: { untouched: true } }),
            work("routine", "2026-06-06", "草刈り"),
            work("group", "2026-09-20", "稲刈り", { fieldIds: [a, b], harvestReview: { yieldKg: "1200", yieldBasis: "玄米（乾燥調製後）" } }),
            work("unknown", "2026-09-21", "収穫"),
            work("old", "2025-05-10", "田植え", { cropYear: 2025 }),
            work("cross", "2025-12-20", "耕起"),
            work("otherfield", "2026-05-16", "追肥", { fieldIds: [b] }),
            work("planned", "2026-07-10", "追肥予定")
          );
          const growth = (id, date, extra) => ({ logId: `story-${id}`, fieldId: a, date, cropYear: 2026, ...extra });
          d.growthLogs.push(
            growth("panicle", "2026-07-10", { panicleLengthMm: 1.5 }),
            growth("heading", "2026-08-01", { headingObserved: true }),
            growth("manual", "2026-07-09", { stageConfirmed: true, observedStage: "heading" }),
            growth("escape", "2026-07-08", { stageConfirmed: true, observedStage: '<img src=x onerror="window.storyInjected=1">' })
          );
          d.schedules.push({ scheduleId: "story-schedule", date: "2026-07-12", cropYear: 2026, title: "Story planned schedule", fieldIds: [a] });
          if (!S.replace(d, "Independent annual story fixture")) throw Error("Fixture persistence failed");
          if (!S.saveDryPeriod({ dryPeriodId: "story-dry", fieldId: a, cropYear: 2026, date: "2026-06-20", startDate: "2026-06-20", actualEndDate: "2026-06-30" })) throw Error("Water fixture failed");
          return { a, b };
        });
        const baseline = await stored();
        await click('.nav-item[data-screen="annual"]');
        await page.locator("#annualYear").selectOption("2026");
        await click(`[data-annual-hub-open-field="${ids.a}"]`);
        await flow().waitFor();
        stage = "actual timeline and measured/manual distinction";
        await focus("all");
        for (const id of ["plant", "plain", "facts", "routine", "group", "unknown", "cross", "panicle", "heading", "manual", "escape"]) assert.equal(await card(`story-${id}`).count(), 1, `Visible ${id}`);
        for (const id of ["old", "otherfield", "planned", "schedule"]) assert.equal(await card(`story-${id}`).count(), 0, `Excluded ${id}`);
        const dates = await flow().locator(".annual-year-flow-single-row > time").evaluateAll(nodes => nodes.map(n => n.dateTime));
        assert.deepEqual(dates, [...dates].sort(), "Chronological single-column actual timeline");
        assert.match(await card("story-cross").innerText(), /2025|対象2026|2026年産/);
        for (const id of ["panicle", "heading"]) assert.match(await card(`story-${id}`).innerText(), /実測|実際|確認/);
        assert.match(await card("story-manual").innerText(), /現場|現地|手動/);
        assert.doesNotMatch(await card("story-manual").innerText(), /出穂確認|生育実測|節目/);
        assert.equal(await card("story-manual").locator(".annual-flow-milestone-art").count(), 0, "Manual stage has no measured milestone art");
        assert.equal(await card("story-escape").locator("img,script").count(), 0);
        assert.equal(await page.evaluate(() => Boolean(window.storyInjected)), false);
        assert.equal(await card("story-plain").locator("[data-annual-flow-summary]").count(), 0, "No redundant supplement for plain record");
        stage = "supplement facts and escaped memo";
        const supplement = card("story-facts").locator("[data-annual-flow-summary]");
        assert.equal(await supplement.count(), 1);
        await supplement.click();
        assert.match(await card("story-facts").innerText(), /Story machine/);
        assert.match(await card("story-facts").innerText(), /Memo <img/);
        assert.equal(await card("story-facts").locator("img,script").count(), 0);
        await geometry(); await shot("expanded");
        await card("story-facts").locator("[data-annual-flow-summary]").click();
        stage = "routine filters";
        await focus("important"); assert.equal(await card("story-routine").count(), 0); assert.equal(await card("story-panicle").count(), 1);
        await focus("routine"); assert.equal(await card("story-routine").count(), 1); assert.equal(await card("story-panicle").count(), 0);
        await focus("all"); await geometry(); await shot("timeline");
        stage = "primary detail and back";
        await open("story-facts").click(); await page.locator(".annual-record-detail").waitFor();
        assert.match(await page.locator(".annual-record-detail").innerText(), /Story material/);
        await click("[data-annual-record-detail-back]"); await flow().waitFor();
        await open("story-group").click();
        assert.match(await page.locator(".annual-record-detail").innerText(), /複数圃場|対象圃場合計|配分していません/);
        await click("#appBackButton"); await flow().waitFor();
        await open("story-unknown").click();
        const unknownText = await page.locator(".annual-record-detail").innerText();
        assert.doesNotMatch(unknownText, /NaN|Infinity|undefined|\b0℃/);
        await click("#appBackButton"); await flow().waitFor();
        stage = "menu cancel/delete cancel/edit cancel";
        const menu = () => card("story-facts").locator("[data-annual-flow-menu-kind]");
        await menu().click(); await click('.annual-record-action-sheet [data-annual-record-action="cancel"]');
        assert.equal(await stored(), baseline);
        const nDialogs = dialogs.length;
        await menu().click(); await click('[data-annual-record-action="delete"]');
        assert.equal(dialogs.length, nDialogs + 1, "Delete requires confirmation");
        assert.equal(await stored(), baseline); assert.equal(await card("story-facts").count(), 1);
        await menu().click(); await click('[data-annual-record-action="edit"]');
        await page.locator("#screen-field-work.active").waitFor();
        await page.locator('#fieldWorkForm details').filter({ has: page.locator('#fwMemo') }).locator(':scope > summary').click();
        await page.locator("#fwMemo").fill("Cancelled independent edit");
        await click("#appBackButton");
        await flow().waitFor(); assert.equal(await stored(), baseline);
        stage = "field and crop-year scope";
        await page.locator("[data-annual-field-switch]").selectOption(ids.b);
        await focus("all"); assert.equal(await card("story-facts").count(), 0); assert.equal(await card("story-group").count(), 1);
        await page.locator("[data-annual-field-switch]").selectOption(ids.a);
        await click("#appBackButton");
        await page.locator("#annualYear").selectOption("2025");
        await click(`[data-annual-hub-open-field="${ids.a}"]`); await focus("all");
        assert.equal(await card("story-old").count(), 1); assert.equal(await card("story-panicle").count(), 0); assert.equal(await card("story-cross").count(), 0);
        await click("#appBackButton");
        await page.locator("#annualYear").selectOption("2026");
        await click(`[data-annual-hub-open-field="${ids.a}"]`); await focus("all"); await geometry();
        assert.equal(await stored(), baseline, "All rendering/routes/cancel operations preserve stored JSON exactly");
        assert.deepEqual(errors, []);
        console.log(`PASS independent annual story behavior ${width}: actual timeline, detail/back, menu/edit/delete cancel, meaningful supplements, routine filters, manual/measured distinction, escaping, crop-year/field scope, no writes; geometry findings: ${layoutFindings.filter(item => item.startsWith(`${width}:`)).length}`);
      } catch (error) {
        console.error(`FAIL independent annual story ${width} at ${stage}`);
        await page.screenshot({ path: path.join(os.tmpdir(), `rice-annual-story-independent-failure-${width}.png`), fullPage: true }).catch(() => {});
        throw error;
      } finally { await context.close(); }
    }
    assert.deepEqual(layoutFindings, [], "Independent timeline geometry findings");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
