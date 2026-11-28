"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const {chromium,devices} = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname,".."), missing = [];
const version = fs.readFileSync(path.join(root,"assets/js/core/schema.js"),"utf8").match(/const APP_VERSION = "([^"]+)"/)[1];
const cacheName = `rice-karte-${version.replace("_ver","-")}`;
let previousPhase = process.argv.includes("--update");
const updateCheck = previousPhase;
const previousVersion = "20261125_ver332", previousCacheName = "rice-karte-20261125-332";
for (const file of ["index.html","mobile.html","service-worker.js","assets/js/core/pwa.js"]) assert(fs.readFileSync(path.join(root,file),"utf8").includes(version),`${file} release version`);
const types = {".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".webmanifest":"application/manifest+json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".webp":"image/webp"};
const server = http.createServer((req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname); } catch { res.writeHead(400);res.end();return; }
  const file = path.resolve(root,"."+(pathname === "/" ? "/index.html" : pathname));
  const relative = path.relative(root,file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) { res.writeHead(403);res.end();return; }
  fs.readFile(file,(error,bytes) => {
    if(error) { missing.push(pathname);res.writeHead(404);res.end();return; }
    if(previousPhase && [".html",".js",".webmanifest"].includes(path.extname(file))) bytes=Buffer.from(bytes.toString("utf8").replaceAll(version,previousVersion).replaceAll(cacheName,previousCacheName));
    res.writeHead(200,{"Content-Type":types[path.extname(file)] || "application/octet-stream","Cache-Control":"no-store"});res.end(bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    const context = await browser.newContext(process.argv.includes('--android') ? {...devices['Pixel 7'],deviceScaleFactor:1} : {viewport:{width:390,height:844}});
    if(process.argv.includes('--android')) console.log('Android Chrome emulation, not a physical device');
    const page = await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("https://**/*",route=>route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:"networkidle"});
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async name => (await caches.keys()).includes(name),previousPhase ? previousCacheName : cacheName);
    await page.reload({waitUntil:"networkidle"});
    assert.equal(await page.evaluate(() => RiceOS.schema.APP_VERSION),previousPhase ? previousVersion : version);
    if(updateCheck) await page.evaluate(()=>RiceOS.state.saveFieldWork({workId:"qa-update-preserved",date:RiceOS.utils.today(),workName:"草刈り",fieldIds:[RiceOS.state.fields()[0].fieldId],memo:"Keep across a simulated version upgrade"}));
    const snapshot = () => page.evaluate(() => JSON.stringify([RiceOS.state.data().fields,RiceOS.state.data().fieldWorks,RiceOS.state.data().growthLogs,RiceOS.state.data().irrigations,RiceOS.state.data().millingRecords]));
    const baseline=await snapshot();
    if(updateCheck) {
      const before=await page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));
      previousPhase=false;
      page.on("dialog",dialog=>dialog.accept());
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator('.common-master-card[data-action="open-system-settings"]').click();
      await page.locator('#systemSettingsPanel .data-settings-fold > summary').filter({hasText:"その他の操作"}).click();
      await page.locator('[data-action="force-update"]').click();
      await page.waitForFunction(expected=>window.RiceOS?.schema?.APP_VERSION===expected,version);
      await page.evaluate(()=>navigator.serviceWorker.ready);
      assert.equal(await snapshot(),baseline,"Update must preserve the registered records");
      assert.equal(await page.evaluate(()=>localStorage.getItem(RiceOS.schema.BACKUP_KEY)),before,"Update button must first preserve the exact previous payload");
      await page.waitForFunction(async name=>(await caches.keys()).includes(name),cacheName);
    }
    const cachePaths=await page.evaluate(async name => (await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname),cacheName);
    for(const asset of ["/assets/css/management-watercolor.css","/assets/css/calendar-watercolor.css","/assets/css/review-outlook-watercolor.css","/assets/images/management/management-watercolor-approved.png"]) assert(cachePaths.includes(asset),asset);
    await context.setOffline(true);
    await page.reload({waitUntil:"networkidle"});
    for(const screen of ["home","fields","calendar","annual","outlook","data"]) {
      await page.locator(`.nav-item[data-screen="${screen}"]:visible`).click();
      await page.locator(`#screen-${screen}.active`).waitFor();
    }
    await page.locator('.common-master-card[data-action="open-system-settings"]').click();
    await page.locator("#systemSettingsPanel").waitFor({state:"visible"});
    assert.equal(await snapshot(),baseline,"Offline navigation must preserve records");
    assert.deepEqual(missing.filter(p=>p!=="/favicon.ico"),[]);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${version}: ${updateCheck ? 'simulated previous-version update with exact backup, ' : ''}real service-worker install, new assets precached, offline reload and six tabs, records unchanged`);
    await context.setOffline(false);
    await context.close();
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
