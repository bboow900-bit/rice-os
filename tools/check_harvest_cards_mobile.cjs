"use strict";
const { chromium }=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict");
const path=require("node:path"),os=require("node:os");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try { for(const width of [360,390]) {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("https://**/*",r=>r.abort());
  await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
  const f=await page.evaluate(()=>{
   const R=window.RiceOS,date=R.utils.today(),year=date.slice(0,4),ids={};
   for(const kind of ["complete","partial","legacy","none","previous","future"]){
    const id=R.state.addField(`QA ${kind} harvest`);ids[kind]=id;
    if(kind==="none")continue;
    R.state.saveFieldWork({workId:`qa-${kind}`,date:kind==="previous"?`${Number(year)-1}-09-10`:kind==="future"?`${Number(year)+1}-09-10`:date,workName:"稲刈り",fieldIds:[id],
     ...(["complete","partial"].includes(kind)?{harvestStatusByField:{[id]:kind}}:["previous","future"].includes(kind)?{harvestStatusByField:{[id]:"complete"}}:{})});
   }
   R.app.show("fields");return {...ids,date,year};
  });
  const stored=()=>page.evaluate(()=>localStorage.getItem("rice_os_v8_stable"));
  const before=await stored();
  const card=kind=>page.locator(`[data-field-open="${f[kind]}"]`);
  assert.match(await card("complete").innerText(),/収穫済み/);
  assert.match(await card("partial").innerText(),/一部実施/);
  assert.match(await card("legacy").innerText(),/完了区分未確認/);
  for(const kind of ["none","previous"])assert.doesNotMatch(await card(kind).innerText(),/収穫済み/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
  await card("complete").screenshot({path:path.join(os.tmpdir(),`harvest-card-fields-${width}.png`)});
  await card("complete").click();
  assert.equal(await page.locator("#appBackButton").isVisible(),true);
  await page.locator("#appBackButton").click();
  await page.locator('.nav-item[data-screen="annual"]:visible').click();
  await page.locator("#annualYear").selectOption(f.year);
  const annual=kind=>page.locator(".annual-field-pick-card").filter({has:page.locator(`[data-annual-open-field="${f[kind]}"]`)});
  assert.match(await annual("complete").innerText(),/収穫済み/);
  assert.doesNotMatch(await annual("complete").innerText(),/生育未入力|中干し候補|記録更新/);
  assert.match(await annual("partial").innerText(),/一部実施/);
  assert.match(await annual("legacy").innerText(),/完了区分未確認/);
  assert.doesNotMatch(await annual("previous").innerText(),/収穫済み/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
  await annual("complete").screenshot({path:path.join(os.tmpdir(),`harvest-card-annual-${width}.png`)});
  await page.locator("#annualYear").selectOption(String(Number(f.year)-1));
  assert.match(await annual("previous").innerText(),/収穫済み/);
  assert.doesNotMatch(await annual("complete").innerText(),/収穫済み/);
  await page.locator("#annualYear").selectOption(String(Number(f.year)+1));
  assert.doesNotMatch(await annual("future").innerText(),/収穫済み/);
  await page.locator("#annualYear").selectOption("all");
  assert.match(await annual("complete").innerText(),/収穫済み/);
  assert.doesNotMatch(await annual("previous").innerText(),/収穫済み/);
  assert.equal(await stored(),before,"Card rendering/year navigation must not mutate farm records");
  assert.deepEqual(errors,[]);
  console.log(`PASS harvest cards ${width}px completed/partial/legacy/none, current/previous/all years, navigation, read-only and no overflow`);
  await context.close();
 }} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
