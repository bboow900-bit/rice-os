"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try{for(const width of [360,390,1280]){
  const context=await browser.newContext({viewport:{width,height:1120},serviceWorkers:"block",hasTouch:width<600});
  try{
   const page=await context.newPage(),errors=[];let accept=false;
   page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>accept?d.accept():d.dismiss());
   await page.clock.setFixedTime(new Date("2026-11-15T03:00:00Z"));await page.route("https://**/*",r=>r.abort());
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const f=await page.evaluate(()=>{
    const S=RiceOS.state,H=RiceOS.herbicide,id=S.addField("開パ 下（UI確認用）"),materials=[];
    for(const [name,category] of [["初期剤A","除草剤"],["初中期剤B","除草剤"],["追肥資材C","肥料"],["防除資材D","殺虫殺菌剤"]]){S.saveMaterial({name,category});materials.push(S.data().materials.at(-1).materialId);}
    const program=H.saveProgram({name:"残草対策A",steps:[{id:"mr-first",category:"初期剤",materialId:materials[0],plannedTiming:"田植え後"},{id:"mr-second",category:"初中期剤",materialId:materials[1]},{id:"mr-extra",category:"追加処理",materialName:"追加用資材"}]});
    const a=H.assignProgram({year:2026,programId:program.programId,fieldIds:[id]})[0],d=RiceOS.utils.clone(S.data());
    d.fieldWorks.push({workId:"mr-primary-plant",workName:"田植え",date:"2026-05-14",cropYear:2026,fieldIds:[id]});
    materials.forEach((materialId,i)=>d.fieldWorks.push({workId:`mr-primary-${i}`,workName:i<2?"除草剤":i===2?"追肥":"防除",date:["2026-05-17","2026-06-06","2026-07-20","2026-08-01"][i],cropYear:2026,fieldIds:[id],materialId,material:["初期剤A","初中期剤B","追肥資材C","防除資材D"][i],herbicideLinks:i<2?[{assignmentId:a.assignmentId,fieldId:id,stepId:a.steps[i].id}]:[]}));
    if(!S.replace(d,"Isolated material review fixture"))throw Error("Fixture rejected");
    const obs=H.saveObservation({assignmentId:a.assignmentId,fieldId:id,date:"2026-09-12",status:"残草少なめ",weeds:["ヒエ","ホタルイ"],memo:"畦際は残草が見られた。来年は同じ場所の経過を残したい。"});
    return{id,assignmentId:a.assignmentId,observationId:obs.observationId};
   });
   const raw=()=>page.evaluate(()=>localStorage.getItem(RiceOS.schema.STORE_KEY));let baseline=await raw();
   await page.locator('.nav-item[data-screen="annual"]:visible').click();await page.locator('#annualYear').selectOption('2026');
   await page.locator(`[data-annual-hub-open-field="${f.id}"]`).click();await page.locator('.mr-entry-open').click();
   const detail=page.locator('.mr-detail');await detail.waitFor();assert.match(await detail.innerText(),/残草少なめ/);
   assert.equal(await detail.locator('.mr-result-status').evaluate(el=>el.getClientRects().length),1,'Recorded result must not leave its final character on a separate line');
   await page.locator('#toast').waitFor({state:'hidden',timeout:10000});await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:path.join(os.tmpdir(),`rice-material-review-result-${width}.png`)});
   for(const image of await detail.locator('img').evaluateAll(nodes=>nodes.map(n=>({loaded:n.complete&&n.naturalWidth>0,width:n.getBoundingClientRect().width}))))assert(image.loaded&&image.width>40);
   await detail.locator('.mr-tabs [data-mr-tab="program"]').click();assert.equal(await detail.getAttribute('data-mr-view'),'program');
   await detail.locator('[data-annual-record-open-id="mr-primary-0"]').click();await page.locator('.annual-record-detail').waitFor();
   await page.locator('[data-annual-record-detail-back]').click();assert.equal(await detail.getAttribute('data-mr-view'),'program');
   await detail.locator('.mr-tabs [data-mr-tab="materials"]').click();assert.equal(await detail.getAttribute('data-mr-view'),'materials');
   assert.match(await detail.innerText(),/初期剤A/);assert.equal(await raw(),baseline);
   const materialGroup=detail.locator('.mr-material-group').first();await materialGroup.locator(':scope > summary').click();
   await materialGroup.locator('[data-mr-material-master]').click();await page.locator('#screen-materials.active').waitFor();
   assert.equal(await page.locator('.nav-item.active').getAttribute('data-screen'),'annual');
   await page.locator('#appBackButton').click();if(await page.locator('#screen-materials.active').count())await page.locator('#appBackButton').click();
   assert.equal(await detail.getAttribute('data-mr-view'),'materials');assert.equal(await raw(),baseline);
   await detail.locator('.mr-tabs [data-mr-tab="result"]').click();
   await detail.locator('.mr-memo [data-mr-edit-observation]').click();const form=page.locator('[data-mr-observation-form]');await form.waitFor();
   assert.equal(await form.locator('[name="status"]').inputValue(),'残草少なめ');await form.locator('[name="memo"]').fill('保存しない変更');
   await page.locator('#appBackButton').click();await form.waitFor();assert.equal(await raw(),baseline);
   accept=true;await page.locator('#appBackButton').click();accept=false;await detail.locator('.mr-tabs').waitFor();assert.equal(await raw(),baseline);
   await detail.locator('.mr-memo [data-mr-edit-observation]').click();await form.locator('[name="status"]').selectOption('良好');await form.locator('[name="memo"]').fill('来年は畦際の経過を記録する。');
   const protectedData=await page.evaluate(()=>({works:JSON.stringify(RiceOS.state.data().fieldWorks),assignments:JSON.stringify(RiceOS.state.data().meta.herbicideAssignments)}));
   await form.locator('button[type="submit"]').click();await detail.locator('.mr-tabs').waitFor();
   assert.match(await detail.innerText(),/来年は畦際の経過を記録する/);
   const saved=await page.evaluate(({id,observationId})=>({obs:RiceOS.herbicide.observations().find(o=>o.observationId===observationId),works:JSON.stringify(RiceOS.state.data().fieldWorks),assignments:JSON.stringify(RiceOS.state.data().meta.herbicideAssignments)}),f);
   assert.deepEqual(saved.obs.weeds,['ヒエ','ホタルイ']);assert.equal(saved.works,protectedData.works);assert.equal(saved.assignments,protectedData.assignments);
   baseline=await raw();await detail.locator('[data-mr-new-observation]').click();await form.locator('[name="memo"]').fill('追加の観察');await form.locator('button[type="submit"]').click();await detail.locator('.mr-tabs').waitFor();
   const newest=await page.evaluate(id=>RiceOS.herbicide.observations(id).at(-1).observationId,f.assignmentId);
   await detail.locator('.mr-history > summary').click();await detail.locator(`[data-mr-delete-observation="${newest}"]`).click();
   assert.equal(await page.evaluate(id=>RiceOS.herbicide.observations(id).length,f.assignmentId),2);
   accept=true;await detail.locator(`[data-mr-delete-observation="${newest}"]`).click();accept=false;
   assert.equal(await page.evaluate(id=>RiceOS.herbicide.observations(id).length,f.assignmentId),1);
   await page.evaluate(observationId=>{const S=RiceOS.state,d=RiceOS.utils.clone(S.data());delete d.meta.herbicideObservations.find(o=>o.observationId===observationId).weeds;if(!S.replace(d,'Isolated legacy missing-weeds fixture'))throw Error('Legacy fixture rejected');},f.observationId);
   baseline=await raw();await detail.locator('.mr-memo [data-mr-edit-observation]').click();await form.waitFor();
   assert.equal(await form.locator('[name="weeds"]').inputValue(),'');await page.locator('#appBackButton').click();await detail.locator('.mr-tabs').waitFor();assert.equal(await raw(),baseline);
   await detail.locator('[data-mr-back]').click();await page.locator('.annual-story').waitFor();await page.locator('.mr-entry').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
   console.log(`PASS primary material review ${width}: entry/tabs/work detail/back, dirty cancel, save/edit/add/delete, protected source data and images`);
  }finally{await context.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
