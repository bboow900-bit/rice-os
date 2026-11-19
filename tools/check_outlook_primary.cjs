const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("https://**/*", r => r.abort());
      await page.clock.setFixedTime(new Date("2026-08-10T03:00:00Z"));
      await page.goto("http://127.0.0.1:4182/index.html");
      const id = await page.evaluate(() => {
        const S = RiceOS.state, id = S.addField("開パ下（画面確認用）");
        const d = RiceOS.utils.clone(S.data());
        d.fieldWorks.push({ workId: "outlook-plant", fieldIds:[id], date:"2026-05-14", cropYear:2026, workName:"田植え" });
        d.growthLogs.push({ logId:"outlook-heading",fieldId:id,date:"2026-08-03",cropYear:2026,headingObserved:true });
        if (!S.replace(d,"Isolated outlook fixture")) throw Error("fixture rejected");
        return id;
      });
      const storage = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const before = await storage();
      await page.locator('.nav-item[data-screen="outlook"]:visible').click();
      const card = page.locator(`[data-outlook-field="${id}"]`);
      assert.match(await card.innerText(), /出穂確認済み[\s\S]*収穫の目安/);
      await card.locator("img").evaluate(img=>img.decode());
      const bounds = await card.evaluate(el => {
        const image = el.querySelector(".outlook-preview-art");
        const text = el.querySelector("div").getBoundingClientRect();
        return { textRight:text.right, artLeft:image.getBoundingClientRect().left, mask:getComputedStyle(image).maskImage };
      });
      assert.notEqual(bounds.mask,"none");
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path:path.join(os.tmpdir(),`rice-outlook-list-${width}.png`) });
      await card.click();
      const detail = page.locator(".outlook-detail");
      await detail.waitFor();
      await detail.locator(".outlook-watercolor-head img").evaluate(img=>img.decode());
      assert.match(await detail.innerText(), /見通しの根拠/);
      await detail.locator(".outlook-reference-fold").first().locator(":scope > summary").click();
      assert.equal(await detail.locator(".outlook-reference-fold[open]").count(),1);
      await detail.locator(".outlook-reference-fold[open] > summary").click();
      await detail.locator(".outlook-detail-head").evaluate(el => el.scrollIntoView({block:"start"}));
      await page.screenshot({ path:path.join(os.tmpdir(),`rice-outlook-detail-${width}.png`) });
      await page.locator("#appBackButton").click();
      await card.waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await storage(),before);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(`PASS outlook ${width}: list, actual heading, evidence, reference, back, no writes`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
