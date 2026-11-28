"use strict";

// Isolated fixtures only; never use a browser profile containing farm records.
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const NOW = "2026-11-28T03:00:00.000Z";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("dialog", dialog => dialog.dismiss());
        await page.clock.setFixedTime(new Date(NOW));
        await page.route("https://**/*", route => route.abort());
        await page.goto("http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
        await page.evaluate(() => {
          const S = RiceOS.state, d = RiceOS.utils.clone(S.data());
          for (const [id, year] of [["qa-other-legacy", null], ["qa-other-pinned", 2024]]) {
            d.otherWorks.push({ otherWorkId: id, type: "otherWork", date: "2025-03-10", season: 2025,
              ...(year === null ? {} : { cropYear: year }), targetScope: "offField", workName: "\u7a2e\u7c7e\u6ce8\u6587",
              varietyIds: ["qa-deleted-variety"], relatedFieldIds: [], quantity: "10 bags", hours: "1.5", memo: id,
              createdAt: "2020-01-02T03:04:05Z", updatedAt: "2020-01-03T03:04:05Z",
              qaUnknown: { source: "legacy", values: [1, 2] }, legacySource: "old-otherWorks" });
          }
          d.otherWorks.push({ otherWorkId: "qa-other-protected", date: "2025-03-11", season: 2025,
            workName: "\u7a2e\u7c7e\u6ce8\u6587", memo: "protected", varietyIds: [], relatedFieldIds: [] });
          if (!S.replace(d, "Isolated other-work timestamp fixtures")) throw Error("Fixture failed");
        });
        const data = () => page.evaluate(() => RiceOS.utils.clone(RiceOS.state.data()));
        const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
        const unrelated = (d, id) => ({ ...d, meta: null, otherWorks: d.otherWorks.filter(row => row.otherWorkId !== id) });
        const openEditor = async (id, year) => {
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          await page.locator("#annualYear").selectOption(String(year));
          await page.locator('[data-annual-hub-view="fields"]').click();
          const archive = page.locator("[data-annual-work-list]");
          if (!await archive.evaluate(el => el.open)) await archive.locator(":scope > summary").click();
          await archive.locator(`[data-annual-record-open-kind="other"][data-annual-record-open-id="${id}"]`).click();
          await page.locator(".annual-record-detail").waitFor();
          await page.locator("[data-annual-record-detail-edit]").click();
          await page.locator("#screen-other-work.active").waitFor();
          assert.equal(await page.locator("#editOtherWorkId").inputValue(), id);
        };
        for (const [id, year] of [["qa-other-legacy", 2025], ["qa-other-pinned", 2024]]) {
          const before = await data(), stored = await raw();
          const original = before.otherWorks.find(row => row.otherWorkId === id);
          await openEditor(id, year);
          assert.equal(await raw(), stored, "Viewing/editing must not save");
          assert.equal(await page.locator("#owVarieties .selected").getAttribute("data-id"), "qa-deleted-variety");
          await page.locator("#owMemo").fill(`${id} edited`);
          await page.locator('#otherWorkForm button[type="submit"]').click();
          const after = await data(), saved = after.otherWorks.find(row => row.otherWorkId === id);
          assert.equal(saved.createdAt, original.createdAt, "Editing must retain createdAt");
          assert.equal(saved.updatedAt, NOW);
          assert.equal(saved.memo, `${id} edited`);
          const expected = { ...original, memo: `${id} edited`, updatedAt: NOW };
          assert.deepEqual(saved, expected, "Unknown attributes, cropYear absence/value and all other fields must survive");
          assert.deepEqual(unrelated(after, id), unrelated(before, id), "Other records and histories must not change");
          await page.locator("#appBackButton").click();
          await page.locator("#screen-annual.active").waitFor();
          await openEditor(id, year);
          const beforeCancel = await raw();
          await page.locator("#owMemo").fill("discard reset");
          await page.locator('[data-action="reset-other-work"]').click();
          assert.equal(await raw(), beforeCancel);
          await page.locator("#appBackButton").click();
          await page.locator("#screen-annual.active").waitFor();
          await openEditor(id, year);
          await page.locator("#owMemo").fill("discard back");
          await page.locator("#appBackButton").click();
          await page.locator("#screen-annual.active").waitFor();
          assert.equal(await raw(), beforeCancel, "Cancelling/back must preserve saved records");
        }
        await openEditor("qa-other-legacy", 2025);
        await page.locator('[data-action="reset-other-work"]').click();
        const beforeNew = await data();
        await page.locator("#owMemo").fill("QA new timestamp");
        await page.locator('#otherWorkForm button[type="submit"]').click();
        const afterNew = await data(), added = afterNew.otherWorks.filter(row => !beforeNew.otherWorks.some(old => old.otherWorkId === row.otherWorkId));
        assert.equal(added.length, 1);
        assert.equal(added[0].createdAt, NOW);
        assert.equal(added[0].updatedAt, NOW);
        assert.equal(added[0].memo, "QA new timestamp");
        assert.deepEqual(unrelated(afterNew, added[0].otherWorkId), { ...beforeNew, meta: null });
        const supplied = "2019-02-03T04:05:06Z";
        await page.evaluate(({ id, supplied }) => {
          const row = RiceOS.state.data().otherWorks.find(item => item.otherWorkId === id);
          if (!RiceOS.state.saveOtherWork({ ...row, createdAt: supplied })) throw Error("Explicit timestamp save failed");
        }, { id: added[0].otherWorkId, supplied });
        assert.equal((await data()).otherWorks.find(row => row.otherWorkId === added[0].otherWorkId).createdAt, supplied, "Explicit createdAt retains its existing precedence");
        const final = await raw();
        await page.screenshot({ path: path.join(os.tmpdir(), `rice-other-created-at-${width}.png`) });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(await raw(), final, "Reload must preserve saved timestamps and history");
        assert.deepEqual(errors, []);
        console.log(`PASS other-work timestamps ${width}: legacy/pinned year, unknown attributes, unrelated history, cancellation, new record, explicit timestamp, reload`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
