"use strict";
const assert = require("node:assert/strict"), path = require("node:path");
const { chromium } = require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname,"..");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390]) {
    const context = await browser.newContext({viewport:{width,height:1120},serviceWorkers:"block"});
    try {
      const page = await context.newPage(), errors=[];
      page.on("pageerror",error=>errors.push(error.message));
      await page.route("https://**/*",route=>route.abort());
      await page.addInitScript(()=>{
        window.__realPreviewStorage=window.localStorage;
        window.__realPreviewStorage.setItem("rice_os_v8_stable","DO NOT REPLACE EXISTING RECORDS");
      });
      await page.goto("http://127.0.0.1:4182/docs/ui-preview/material-review-midpoint.html?view=entry",{waitUntil:"networkidle"});
      await page.locator(".mr-entry").waitFor();
      assert.match(await page.locator(".mr-entry").innerText(),/残草対策A/);
      assert.match(await page.locator(".mr-entry-facts").innerText(),/4\s*種類/);
      assert.equal(await page.evaluate(()=>window.__realPreviewStorage.getItem("rice_os_v8_stable")),"DO NOT REPLACE EXISTING RECORDS");
      await page.screenshot({path:path.join(root,`docs/ui-preview/material-review-entry-${width}.png`)});
      await page.locator(".mr-entry-open").click();
      const detail=page.locator(".mr-detail"); await detail.waitFor();
      assert.match(await detail.innerText(),/残草少なめ/);
      assert.equal(await detail.locator(".mr-step-recorded").count(),2);
      assert.match(await detail.innerText(),/実績未記録/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for (const image of await detail.locator("img").evaluateAll(nodes=>nodes.map(node=>({loaded:node.complete&&node.naturalWidth>0,width:node.getBoundingClientRect().width})))) assert(image.loaded&&image.width>40,"Artwork must load at visible dimensions");
      assert(await detail.locator('[data-mr-tab="program"]').evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>node.disabled)),"Other tabs await user approval");
      assert(await detail.locator('[data-mr-edit-observation]').evaluateAll(nodes=>nodes.length>0&&nodes.every(node=>node.disabled)),"Editing awaits user approval");
      await page.screenshot({path:path.join(root,`docs/ui-preview/material-review-result-${width}.png`)});
      await page.locator("[data-mr-back]").click(); await page.locator(".mr-entry").waitFor();
      assert.equal(await page.evaluate(()=>window.__realPreviewStorage.getItem("rice_os_v8_stable")),"DO NOT REPLACE EXISTING RECORDS");
      assert.deepEqual(errors,[]); console.log(`PASS midpoint ${width}: actual UI components, entry/result/back, illustrations, no real storage access, remaining controls disabled`);
    } finally {await context.close();}
  }
    const page = await browser.newPage({viewport:{width:1000,height:1250},serviceWorkers:"block"});
    await page.goto("http://127.0.0.1:4182/docs/ui-preview/material-review-midpoint.html",{waitUntil:"networkidle"});
    await page.frameLocator('iframe').first().locator('.mr-entry').waitFor();
    await page.frameLocator('iframe').last().locator('.mr-detail').waitFor();
    for (const frame of page.frames().filter(frame=>frame!==page.mainFrame())) await frame.waitForFunction(()=>Array.from(document.images).every(image=>image.complete&&image.naturalWidth>0));
    await page.screenshot({path:path.join(root,"docs/ui-preview/material-review-midpoint-comparison.png"),fullPage:true});
    await page.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
