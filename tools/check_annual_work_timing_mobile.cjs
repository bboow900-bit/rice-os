"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try { for (const width of [360,390]) {
  const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
  try {
   const page = await context.newPage(), errors = []; let externalRequests = 0;
   page.on("pageerror",error => errors.push(error.message)); page.on("dialog",dialog => dialog.dismiss());
   await page.clock.setFixedTime(new Date("2029-01-15T03:00:00Z"));
   await page.route("https://**/*",route => { externalRequests++; return route.abort(); });
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const f = await page.evaluate(() => {
    const S = RiceOS.state, a = S.addField("QA annual timing A"), b = S.addField("QA annual timing empty");
    const d = RiceOS.utils.clone(S.data());
    const records = [
     {workId:"qa-time-prior-first",cropYear:2027,date:"2026-10-10",workName:"秋起し",memo:"Previous crop-year actual, first"},
     {workId:"qa-time-prior-last",cropYear:2027,date:"2026-10-20",workName:"秋起こし",memo:"Previous crop-year actual, last"},
     {workId:"qa-time-now-first",cropYear:2028,date:"2027-11-12",workName:"秋起こし",memo:"Current crop-year actual, first"},
     {workId:"qa-time-now-last",cropYear:2028,date:"2027-11-22",workName:"秋耕",memo:"Current crop-year actual, last"},
     {workId:"qa-time-plant-prior",cropYear:2027,date:"2027-05-02",workName:"田植え",memo:"Previous planting"},
     {workId:"qa-time-plant-first",cropYear:2028,date:"2028-04-30",workName:"田植え",memo:"Current planting first"},
     {workId:"qa-time-plant-last",cropYear:2028,date:"2028-05-01",workName:"田植",memo:"Current planting last"},
     {workId:"qa-time-prior-only",cropYear:2027,date:"2027-04-01",workName:"くろぬり",memo:"Previous only"},
     {workId:"qa-time-current-only",cropYear:2028,date:"2028-04-25",workName:"代掻き",memo:"Current only"},
     {workId:"qa-time-planned",cropYear:2028,date:"2027-10-01",workName:"耕起予定"},
     {workId:"qa-time-future",cropYear:2028,date:"2030-01-01",workName:"耕起"},
     {workId:"qa-time-offfield",cropYear:2028,date:"2027-10-02",workName:"耕起",targetScope:"offField"},
     {workId:"qa-time-invalid",cropYear:2028,date:"2028-02-30",workName:"耕起"},
     {workId:"qa-time-other-field",cropYear:2028,date:"2027-10-03",workName:"耕起",fieldIds:[b]}
    ];
    for (const record of records) d.fieldWorks.push({fieldIds:[a],targetScope:"field",...record});
    if (!S.replace(d,"QA isolated annual work timing")) throw Error("Timing fixture failed");
    if (RiceOS.utils.today() !== "2029-01-15") throw Error("Fixture clock not applied");
    return {a,b,excluded:["qa-time-planned","qa-time-future","qa-time-offfield","qa-time-invalid","qa-time-other-field"]};
   });
   const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
   const section = () => page.locator("[data-annual-work-timing]");
   const row = key => section().locator(`[data-work-timing="${key}"]`);
   const shot = async name => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false);
    for (const el of await section().locator("article,button").all()) assert.ok(await el.evaluate(node => node.scrollWidth <= node.clientWidth+1),"Comparison content must fit its container");
    const file = path.join(os.tmpdir(),`rice-annual-work-timing-${name}-${width}.png`); await page.screenshot({path:file}); console.log(file);
   };
   const baseline = await raw(), baselineRequests = externalRequests;
   await page.locator('.nav-item[data-screen="annual"]:visible').click(); await page.locator("#annualYear").selectOption("2028");
   await page.locator(`[data-annual-open-field="${f.a}"]`).click(); await page.locator("[data-annual-open-compare]").click(); await section().waitFor();
   assert.match(await section().innerText(),/実施日で比較・対象年産で分類/);
   assert.match(await row("autumnTillage").innerText(),/2027年産 \/ 2件/); assert.match(await row("autumnTillage").innerText(),/2028年産 \/ 2件/);
   for (const date of ["2026-10-10","2026-10-20","2027-11-12","2027-11-22"]) assert.match(await row("autumnTillage").innerText(),new RegExp(date));
   assert.match(await row("autumnTillage").locator(".annual-work-timing-delta").innerText(),/初回：前年より33日遅い/);
   assert.match(await row("autumnTillage").locator(".annual-work-timing-delta").innerText(),/最終：前年より33日遅い/);
   assert.match(await row("planting").locator(".annual-work-timing-delta").innerText(),/初回：前年より2日早い/);
   assert.match(await row("planting").locator(".annual-work-timing-delta").innerText(),/最終：前年より1日早い/);
   assert.match(await row("puddling").innerText(),/実績なし/); assert.match(await row("puddling").innerText(),/比較できません/);
   assert.match(await row("ridgePlastering").innerText(),/実績なし/); assert.match(await row("ridgePlastering").innerText(),/比較できません/);
   for (const id of f.excluded) assert.equal(await section().locator(`[data-annual-record-open-id="${id}"]`).count(),0,`Excluded record ${id}`);
   await row("autumnTillage").scrollIntoViewIfNeeded(); await shot("comparison");
   await row("autumnTillage").locator("details > summary").click();
   assert.equal(await row("autumnTillage").locator('[data-annual-record-open-kind="fieldWork"]').count(),4);
   await row("autumnTillage").locator('[data-annual-record-open-id="qa-time-now-first"]').click(); await page.locator(".annual-record-detail").waitFor();
   assert.match(await page.locator(".annual-record-detail").innerText(),/Current crop-year actual, first/); assert.match(await page.locator(".annual-record-detail").innerText(),/2028年度/);
   await page.locator("[data-annual-record-detail-back]").click(); await section().waitFor(); assert.equal(await page.locator("#annualYear").inputValue(),"2028"); assert.equal(await raw(),baseline);
   const details = row("autumnTillage").locator("details"); if (!await details.evaluate(node => node.open)) await details.locator(":scope > summary").click();
   await row("autumnTillage").locator('[data-annual-record-open-id="qa-time-prior-first"]').click(); await page.locator(".annual-record-detail").waitFor(); assert.match(await page.locator(".annual-record-detail").innerText(),/Previous crop-year actual, first/); assert.match(await page.locator(".annual-record-detail").innerText(),/2027年度/); await page.locator("#appBackButton").click(); await section().waitFor();
   assert.equal(await raw(),baseline); assert.equal(externalRequests,baselineRequests,"Read-only timing review must not fetch weather");
   const priorOnlyLabel = await row("ridgePlastering").locator(".annual-work-timing-delta").innerText();
   assert.equal(priorOnlyLabel.includes("前年記録なし"),false,"Previous-only row must not claim previous-year records are missing");
   await page.locator("[data-annual-close-compare]").click(); await page.locator("#appBackButton").click(); await page.locator(`[data-annual-open-field="${f.b}"]`).click(); await page.locator("[data-annual-open-compare]").click(); await section().waitFor();
   assert.equal(await section().locator('[data-annual-record-open-id="qa-time-now-first"]').count(),0,"Other fields must not leak in"); assert.equal(await raw(),baseline);
   await page.reload({waitUntil:"networkidle"}); assert.equal(await raw(),baseline); assert.deepEqual(errors,[]); console.log(`PASS annual work timing ${width}`);
  } finally { await context.close(); }
 }} finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
