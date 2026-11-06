"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const phases = [
  ["2026-04-15","rice-sowing"], ["2026-05-15","rice-transplanter"],
  ["2026-07-15","rice-growing"], ["2026-09-15","rice-combine"],
  ["2026-11-15","rice-processing"], ["2026-01-15","rice-winter"]
];
(async () => {
  for (const [,file] of phases) assert.ok(fs.existsSync(path.join(__dirname,"../assets/images/ui-pop",`${file}.png`)),`Asset not ready: ${file}`);
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390,1280]) {
    const context = await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600,serviceWorkers:"block"});
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror",e => errors.push(e.message));
      await page.route("https://**/*",route => route.abort());
      await page.clock.setFixedTime(new Date("2026-08-20T03:00:00Z"));
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      const fieldId = await page.evaluate(() => {
        const S=RiceOS.state, field=S.addField("用水路沿いの長い名前・季節装飾と生育記録を分ける圃場");
        const d=RiceOS.utils.clone(S.data());
        d.fieldWorks.push({workId:"qa-season-plant",date:"2026-05-10",cropYear:2026,workName:"田植え",fieldIds:[field]});
        d.growthLogs.push({logId:"qa-season-heading",date:"2026-08-01",fieldId:field,headingObserved:true,memo:"Observed, not header art"});
        if (!S.replace(d,"QA isolated seasonal illustration")) throw Error("Fixture failed");
        RiceOS.app.show("home"); return field;
      });
      const baseline = await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const stage = () => page.evaluate(id => JSON.stringify(RiceOS.agro.seasonStageForField(RiceOS.state.field(id),"2026-08-20")),fieldId);
      const originalStage = await stage();
      const markers = new Set();
      for (const [date,file] of phases) {
        await page.clock.setFixedTime(new Date(`${date}T03:00:00Z`));
        await page.evaluate(() => RiceOS.screens.home.render());
        const art=page.locator(".home-pop-illustration"), title=page.locator(".home-pop-header h1");
        await art.evaluate(el => el.decode());
        assert.match(await art.getAttribute("src"),new RegExp(`assets/images/ui-pop/${file}\\.png(?:\\?|$)`));
        const marker=await page.locator(".home-pop-header [data-season-art], .home-pop-header[data-season-art]").first().getAttribute("data-season-art");
        assert.ok(marker,"Season marker is exposed"); markers.add(marker);
        const helper=await page.evaluate(date => RiceOS.seasonArt.forDate(date),date);
        assert.ok(JSON.stringify(helper).includes(`${file}.png`),"Header uses the pure date mapping");
        assert.equal(await art.evaluate(el => {
          const c=document.createElement("canvas"); c.width=40;c.height=40;
          const x=c.getContext("2d");x.drawImage(el,0,0,40,40);
          const pixels=x.getImageData(0,0,40,40).data;
          return el.complete && el.naturalWidth>0 && pixels.some((v,i) => i%4===3 && v>0);
        }),true,"Season art is nonblank");
        const a=await art.boundingBox(),b=await title.boundingBox();
        assert.ok(a && b && a.width>0 && a.height>0);
        assert.equal(a.x < b.x+b.width && b.x < a.x+a.width && a.y < b.y+b.height && b.y < a.y+a.height,false,"Header title overlaps seasonal art");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
        assert.equal(await page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY)),baseline,"Clock/render must not save data");
        assert.equal(await stage(),originalStage,"Decorative phase must not change recorded stage at a fixed asOf");
        const output=path.join(os.tmpdir(),`rice-season-art-${file}-${width}.png`);
        await page.screenshot({path:output}); console.log(output);
      }
      assert.equal(markers.size,6,"Six distinct phases");
      assert.deepEqual(errors,[]); console.log(`PASS season art ${width}`);
    } finally { await context.close(); }
  } } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
