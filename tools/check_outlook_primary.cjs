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
        const S = RiceOS.state, id = S.addField("開パ 下"), groupId = S.addFieldGroup("見通し確認用");
        const d = RiceOS.utils.clone(S.data());
        Object.assign(d.fields.find(f => f.fieldId === id), { fieldGroupId: groupId, areaA: 20 });
        d.fieldWorks.push({ workId: "outlook-plant", fieldIds:[id], date:"2026-05-14", cropYear:2026, workName:"田植え" });
        d.growthLogs.push({ logId:"outlook-heading",fieldId:id,date:"2026-08-03",cropYear:2026,headingObserved:true });
        if (!S.replace(d,"Isolated outlook fixture")) throw Error("fixture rejected");
        return { id, groupId };
      });
      const storage = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const before = await storage();
      await page.locator('.nav-item[data-screen="outlook"]:visible').click();
      await page.locator('[data-outlook-group]').selectOption(id.groupId);
      await page.locator('#toast').waitFor({state:'hidden',timeout:10000});
      const card = page.locator(`[data-outlook-field="${id.id}"]`);
      assert.match(await card.innerText(), /出穂確認済み[\s\S]*収穫の目安/);
      await card.locator("img").evaluate(img=>img.decode());
      const bounds = await card.evaluate(el => {
        const image = el.querySelector(".outlook-preview-art");
        const text = el.querySelector("div").getBoundingClientRect();
        return { textRight:text.right, artLeft:image.getBoundingClientRect().left, mask:getComputedStyle(image).maskImage };
      });
      assert.notEqual(bounds.mask,"none");
      await card.scrollIntoViewIfNeeded();
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({ path:path.join(os.tmpdir(),`rice-outlook-list-${width}.png`) });
      assert.match(await page.locator('.outlook-head h2').evaluate(el=>getComputedStyle(el).fontFamily),/Mincho|Serif|serif/);
      const clipping=await card.locator('b,small,span').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+2)).map(el=>el.textContent));
      assert.deepEqual(clipping,[],'Outlook card text must fit');
      await card.click();
      const detail = page.locator(".outlook-detail");
      await detail.waitFor();
      await detail.locator(".outlook-watercolor-head img").evaluate(img=>img.decode());
      assert.match(await detail.innerText(), /見通しの根拠/);
      const sourceClipping=await detail.locator('.outlook-source span,.outlook-source small').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+2)).map(el=>el.textContent));
      assert.deepEqual(sourceClipping,[],'Source labels and explanations must wrap');
      await detail.locator(".outlook-reference-fold").first().locator(":scope > summary").click();
      assert.equal(await detail.locator(".outlook-reference-fold[open]").count(),1);
      await detail.locator(".outlook-reference-fold[open] > summary").click();
      await detail.locator(".outlook-detail-head").evaluate(el => el.scrollIntoView({block:"start"}));
      await page.screenshot({ path:path.join(os.tmpdir(),`rice-outlook-detail-${width}.png`) });
      await page.locator("#appBackButton").click();
      await card.waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.equal(await storage(),before);
      await page.evaluate(fieldId=>{
        const d=RiceOS.utils.clone(RiceOS.state.data());
        d.fieldWorks=d.fieldWorks.filter(row=>!(row.fieldIds||[]).includes(fieldId));
        d.growthLogs=d.growthLogs.filter(row=>row.fieldId!==fieldId);
        RiceOS.state.replace(d,'Isolated missing-record fixture');
      },id.id);
      await page.locator('#toast').waitFor({state:'hidden',timeout:10000});
      await page.locator('.nav-item[data-screen="outlook"]:visible').click();
      await page.locator('[data-outlook-group]').selectOption(id.groupId);
      assert.equal(await card.locator('.outlook-preview-date.is-missing').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)),14,'Missing-data wording must not use the large date font');
      await page.screenshot({path:path.join(os.tmpdir(),`rice-outlook-missing-${width}.png`)});
      await page.evaluate(fieldId=>RiceOS.state.updateField(fieldId,{name:'開パ下・用水路沿いの長い名前の圃場'}),id.id);
      assert.equal(await card.locator('h3').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'Long outlook field names must wrap');
      await card.click();
      assert.equal(await page.locator('.outlook-detail-head h2').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'Long outlook detail names must wrap');
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(`PASS outlook ${width}: list, actual heading, evidence, reference, back, no writes`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
