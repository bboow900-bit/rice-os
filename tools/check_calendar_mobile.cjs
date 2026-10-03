"use strict";
const {chromium}=require('C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');const os=require('node:os');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  for(const width of [360,390]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.abort());
   await page.goto('http://127.0.0.1:4182/index.html',{waitUntil:'networkidle'});
   const today=await page.evaluate(()=>{
    const R=window.RiceOS;const today=R.utils.today();
    for(const title of ['草刈り','追肥','長い作業予定名の表示確認']) R.state.saveSchedule({date:today,title,targetScope:'offField',fieldIds:[],scheduleType:'作業予定'});
    R.state.saveFieldWork({date:today,workName:'播種',targetScope:'offField',fieldIds:[],memo:'QA calendar actual'});
    return today;
   });
   const before=await page.evaluate(()=>localStorage.getItem('rice_os_v8_stable'));
   await page.locator('.nav-item[data-screen="calendar"]:visible').click();
   assert.equal(await page.locator('#calendarDisplayMode').inputValue(),'planned');
   const cell=()=>page.locator(`#calendarGrid [data-date="${today}"]`);
   assert.equal(await cell().locator('.calendar-event-label').count(),2);
   assert.ok((await cell().innerText()).includes('+1') || (await cell().innerText()).includes('＋1'));
   assert.equal(await page.locator('#selectedDateEntries [data-calendar-action="complete"]').count(),3);
   assert.ok(!(await page.locator('#selectedDateEntries').innerText()).includes('播種'));
   await page.screenshot({path:path.join(os.tmpdir(),`calendar-planned-${width}.png`)});
   await page.locator('#calendarDisplayMode').selectOption('all');
   assert.ok((await page.locator('#selectedDateEntries').innerText()).includes('播種'));
   await page.locator('[data-calendar-move="1"]').click();
   const selected=await page.locator('#calendarGrid .selected').getAttribute('data-date');
   assert.notEqual(selected.slice(0,7),today.slice(0,7));assert.equal(selected.slice(-2),'01');
   await page.locator('#calendarToday').click();assert.equal(await page.locator('#calendarGrid .selected').getAttribute('data-date'),today);
   await page.screenshot({path:path.join(os.tmpdir(),`calendar-all-${width}.png`)});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const overlaps=await page.locator('#calendarGrid .calendar-event-label').evaluateAll(nodes=>nodes.filter(n=>{const a=n.getBoundingClientRect(),b=n.closest('.calendar-day').getBoundingClientRect();return a.left<b.left || a.right>b.right+1;}).length);
   assert.equal(overlaps,0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('rice_os_v8_stable')),before,'Display changes must not mutate farm records');
   await page.locator('#calendarTargetFilter').selectOption('offField');
   assert.ok((await page.locator('#selectedDateEntries').innerText()).includes('播種'));
   await page.locator('#calendarTargetFilter').selectOption('all');
   await page.locator('[data-calendar-add-plan]').click();
   assert.equal(await page.locator('#sheetScheduleForm').isVisible(),true);
   await page.locator('button[data-sheet-close]').click();
   await page.locator('[data-calendar-add-record]').click();
   assert.equal(await page.locator('#dateSheet').isVisible(),true);
   await page.locator('button[data-sheet-close]').click();
   await page.locator('[data-calendar-action="complete"]').first().click();assert.equal(await page.locator('#screen-field-work.active').count(),1);
   await page.locator('#appBackButton').click();assert.equal(await page.locator('#screen-calendar.active').count(),1);
   assert.equal(await page.locator('#calendarDisplayMode').inputValue(),'all');
   assert.deepEqual(errors,[]);console.log(`PASS calendar ${width}px titles/overflow/mode/month/today/complete/back/no data changes`);await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
