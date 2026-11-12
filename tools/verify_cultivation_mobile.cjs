"use strict";
const assert = require("node:assert/strict"), http = require("node:http"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = path.resolve(__dirname, "..");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".png":"image/png", ".jpg":"image/jpeg", ".webmanifest":"application/manifest+json" };
(async () => {
  const server = http.createServer((req,res) => {
    const name = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const file = path.resolve(base, "." + (name === "/" ? "/index.html" : name));
    if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file,(err,data) => { res.writeHead(err ? 404 : 200,{ "Content-Type":types[path.extname(file)] || "application/octet-stream" }); res.end(err ? "Not found" : data); });
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block" });
      try {
        const page = await context.newPage(), errors = [];
        page.on("pageerror",e => errors.push(e.message)); page.on("dialog",d => d.dismiss());
        await page.route("https://**/*",r => r.abort());
        await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:"networkidle"});
        await page.evaluate(() => {
          const R = RiceOS; R.utils.today = () => "2026-07-20";
          if (!R.cultivation) throw Error("Cultivation script missing from HTML");
          if (!R.state.replace({ varieties:[{varietyId:"qa-v",name:"コシヒカリ",panicleInitiationDaysAfterPlanting:60,headingDaysAfterPlanting:90,topDressingDaysBeforeHeading:20}],
            fields:[{fieldId:"qa-f",name:"試験圃場",varietyId:"qa-v"}],
            fieldWorks:[{workId:"qa-p",date:"2026-05-01",fieldIds:["qa-f"],workName:"田植え"},{workId:"qa-oldp",date:"2025-05-01",fieldIds:["qa-f"],workName:"田植え"}],
            growthLogs:[{logId:"qa-h",date:"2025-08-09",fieldId:"qa-f",headingObserved:true,varietyId:"qa-v",varietyProfile:"コシヒカリ"},{logId:"qa-manual",date:"2026-07-01",fieldId:"qa-f",observedStage:"heading",stageConfirmed:true,headingObserved:false}]
          },"isolated cultivation QA")) throw Error("Fixture rejected");
          R.app.show("outlook");
        });
        const records = () => page.evaluate(() => JSON.stringify([RiceOS.state.data().growthLogs,RiceOS.state.data().fieldWorks]));
        const before = await records();
        const card = page.locator('[data-outlook-field="qa-f"]');
        await card.waitFor(); assert.match(await card.innerText(),/現場記録.*出穂期/s); assert.match(await card.innerText(),/生育推定/);
        const noOverflow = async () => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`${width}px horizontal overflow`);
          const clipped = await page.locator(".outlook-estimates dd").evaluateAll(rows => rows.filter(e => e.scrollWidth > e.clientWidth + 1).length);
          assert.equal(clipped,0,`${width}px clipped dates`);
        };
        await noOverflow();
        const cardShot = path.join(os.tmpdir(),`rice-cultivation-card-${width}.png`);
        await page.screenshot({path:cardShot,fullPage:true}); console.log(cardShot);
        await card.click();
        const evidence = page.locator("[data-outlook-cultivation-evidence]");
        assert.equal(await evidence.getAttribute("open"),null);
        await evidence.locator("summary").click();
        assert.match(await evidence.innerText(),/1年 \/ 1圃場/); assert.match(await evidence.innerText(),/÷ 2/);
        await noOverflow();
        const detailShot = path.join(os.tmpdir(),`rice-cultivation-detail-${width}.png`);
        await page.screenshot({path:detailShot,fullPage:true}); console.log(detailShot);
        const initial = await page.evaluate(() => RiceOS.outlook.forField("qa-f").heading.date);
        await page.evaluate(() => { RiceOS.state.updateVariety("qa-v",{headingDaysAfterPlanting:110}); RiceOS.screens.outlook.render({skipWeather:true}); });
        assert.notEqual(await page.evaluate(() => RiceOS.outlook.forField("qa-f").heading.date),initial);
        assert.match(await page.locator(".outlook-detail-hero").innerText(),/出穂期（現地判断）/);
        assert.equal(await records(),before);
        await page.evaluate(() => RiceOS.app.show("home"));
        await noOverflow();
        const homeShot = path.join(os.tmpdir(),`rice-cultivation-home-${width}.png`);
        await page.screenshot({path:homeShot,fullPage:true}); console.log(homeShot);
        assert.equal(await records(),before); assert.deepEqual(errors,[]);
        console.log(`PASS cultivation mobile ${width}: cards, details disclosure, live master change, separated judgement, home and no factual mutation`);
      } finally { await context.close(); }
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
