"use strict";
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const assert=require("node:assert/strict");
const path=require("node:path");
const os=require("node:os");
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try {
    for(const width of [360,390]) {
      const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});
      const page=await context.newPage(); const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://**/*',r=>r.abort());
      await page.goto('http://127.0.0.1:4182/index.html',{waitUntil:'networkidle'});
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator('[data-jump-screen="materials"]').click();
      await page.locator('#herbicideManagement > summary').click();
      await page.locator('[data-h-new]').click();
      await page.locator('#herbicideProgramForm [name="name"]').fill('QA name program');
      await page.locator('[data-h-category]').fill('初期剤');
      await page.locator('[data-h-material-name]').fill('QA 除草剤 <試験>');
      await page.locator('#herbicideProgramForm button[type="submit"]').click();
      const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rice_os_v8_stable')));
      let data=await saved(); const program=data.meta.herbicidePrograms.find(p=>p.name==='QA name program');
      assert.equal(program.steps[0].materialName,'QA 除草剤 <試験>'); assert.equal(program.steps[0].materialId,'');
      await page.reload({waitUntil:'networkidle'});
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator('[data-jump-screen="materials"]').click();
      if(!await page.locator('[data-h-new]').isVisible()) await page.locator('#herbicideManagement > summary').click();
      await page.locator(`[data-h-edit="${program.programId}"]`).click();
      assert.equal(await page.locator('[data-h-material-name]').inputValue(),'QA 除草剤 <試験>');
      await page.locator('[data-h-material-name]').fill('Cancelled');
      await page.locator('[data-h-cancel-program]').click();
      assert.equal((await saved()).meta.herbicidePrograms.find(p=>p.programId===program.programId).steps[0].materialName,'QA 除草剤 <試験>');
      await page.locator(`[data-h-edit="${program.programId}"]`).click();
      await page.locator('[data-h-material-name]').fill('QA updated');
      await page.locator('#herbicideProgramForm button[type="submit"]').click();
      await page.locator('#herbicideManagement summary').filter({hasText:'年度・圃場へ設定'}).click();
      await page.locator('#herbicideAssignProgram').selectOption(program.programId);
      const target=await page.locator('#herbicideAssignTarget option').evaluateAll(o=>o.find(x=>x.value.startsWith('field:')).value);
      await page.locator('#herbicideAssignTarget').selectOption(target);
      await page.locator('#herbicideAssignmentForm button[type="submit"]').click();
      assert.equal((await saved()).meta.herbicideAssignments.find(a=>a.programId===program.programId).steps[0].materialName,'QA updated');
      await page.locator(`[data-h-edit="${program.programId}"]`).click();
      await page.locator('[data-h-material-name]').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(os.tmpdir(),`herbicide-name-${width}.png`)});
      const size=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
      assert.equal(size[0],size[1]); assert.deepEqual(errors,[]);
      await context.close(); console.log(`PASS ${width}px name create/reload/edit/cancel/assignment and no overflow`);
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
