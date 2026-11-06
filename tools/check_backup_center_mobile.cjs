"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  try { for (const width of [360,390]) {
    const context = await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block",acceptDownloads:true});
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror",error => errors.push(error.message));
      await page.route("https://**/*",route => route.abort());
      await page.clock.setFixedTime(new Date("2026-11-06T03:00:00Z"));
      await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
      assert.equal(await page.evaluate(() => typeof RiceOS.backupExport?.share),"function","Real backup-export service is loaded");
      await page.evaluate(() => {
        const S = RiceOS.state, d = RiceOS.utils.clone(S.data()), fieldId = S.activeFields()[0].fieldId;
        d.fieldWorks.push({workId:"qa-backup-protected",date:"2026-10-01",cropYear:2026,fieldIds:[fieldId],workName:"見回り",memo:"共有で変更しない記録"});
        d.meta.lastJsonExportAt = "2026-10-01T03:00:00Z";
        if (!S.replace(d,"QA isolated backup center")) throw Error("Fixture save failed");
        window.qaShareMode = "cancel";
        window.qaSharedFiles = [];
        window.qaShareCalls = 0;
        Object.defineProperty(navigator,"canShare",{configurable:true,value:() => window.qaShareMode !== "unsupported"});
        Object.defineProperty(navigator,"share",{configurable:true,value:async payload => {
          window.qaShareCalls++;
          window.qaSharedFiles = await Promise.all((payload.files || []).map(async file => ({name:file.name,type:file.type,text:await file.text()})));
          if (window.qaShareMode === "cancel") throw new DOMException("QA user cancellation","AbortError");
          if (window.qaShareMode === "pending") await new Promise(resolve => { window.qaResolveShare = resolve; });
        }});
      });
      const raw = () => page.evaluate(() => localStorage.getItem(RiceOS.schema.STORE_KEY));
      const stateData = () => page.evaluate(() => RiceOS.utils.clone(RiceOS.state.data()));
      const baseline = await raw(), initial = await stateData();
      const button = page.locator("#dataBackupShare"), message = page.locator("#dataBackupMessage");
      const shot = async name => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,"No horizontal overflow");
        const file = path.join(os.tmpdir(),`rice-backup-center-${name}-${width}.png`);
        await page.screenshot({path:file}); console.log(file);
      };
      const unchanged = async () => {
        assert.equal(await raw(),baseline,"Sharing does not modify the original storage payload");
        assert.deepEqual(await stateData(),initial,"Sharing does not mark export date or change in-memory farm data");
      };
      await page.locator('.nav-item[data-screen="data"]:visible').click();
      await page.locator("#dataBackupCenter").waitFor();
      await page.evaluate(() => window.scrollTo(0,0));
      assert.ok((await page.locator("#dataBackupCenter").boundingBox()).y < 500,"Backup center appears at management top");
      assert.match(await page.locator("#dataBackupCenter").innerText(),/クラウド自動保存：未接続/);
      await shot("initial");
      await button.click();
      await page.waitForFunction(() => !document.getElementById("dataBackupShare").disabled && /キャンセル|取消|取り消/.test(document.getElementById("dataBackupMessage").textContent));
      assert.doesNotMatch(await message.innerText(),/保存済み|保存しました|同期済み|バックアップ完了/);
      await unchanged(); await shot("cancelled");
      await page.evaluate(() => { window.qaShareMode = "pending"; });
      await button.click();
      await page.waitForFunction(() => typeof window.qaResolveShare === "function");
      assert.equal(await button.isDisabled(),true);
      await unchanged();
      await page.evaluate(() => { window.qaShareMode = "success"; window.qaResolveShare(); });
      await page.waitForFunction(() => !document.getElementById("dataBackupShare").disabled);
      assert.match(await message.innerText(),/共有先|渡/);
      assert.doesNotMatch(await message.innerText(),/保存済み|保存しました|同期済み|バックアップ完了/);
      await unchanged();
      const shared = await page.evaluate(() => window.qaSharedFiles);
      assert.equal(shared.length,1); assert.match(shared[0].name,/\.json$/i);
      assert.ok(JSON.parse(shared[0].text).fieldWorks.some(row => row.workId === "qa-backup-protected"));
      assert.equal(await page.evaluate(() => window.qaShareCalls),2);
      await shot("shared");
      await page.evaluate(() => { window.qaShareMode = "unsupported"; });
      await button.click();
      await page.waitForFunction(() => !document.getElementById("dataBackupShare").disabled && /対応|ダウンロード/.test(document.getElementById("dataBackupMessage").textContent));
      assert.equal(await page.evaluate(() => window.qaShareCalls),2,"Unsupported file sharing does not call navigator.share");
      await unchanged(); await shot("unsupported");
      await page.evaluate(() => {
        window.qaOriginalDownload = RiceOS.utils.download;
        RiceOS.utils.download = () => { throw Error("QA download failed"); };
      });
      try {
        await page.locator("#dataBackupDownload").click();
        assert.match(await message.innerText(),/開始できません/);
        assert.doesNotMatch(await message.innerText(),/開始しました|保存済み|保存しました/);
        await unchanged(); await shot("download-failed");
      } finally {
        await page.evaluate(() => {
          RiceOS.utils.download = window.qaOriginalDownload;
          delete window.qaOriginalDownload;
        });
      }
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#dataBackupDownload").click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(),/\.json$/i);
      const stream = await download.createReadStream(), chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      assert.ok(exported.fieldWorks.some(row => row.workId === "qa-backup-protected"));
      const after = await stateData();
      for (const key of Object.keys(initial).filter(key => key !== "meta")) assert.deepEqual(after[key],initial[key],`Download does not change ${key}`);
      assert.notEqual(after.meta.lastJsonExportAt,initial.meta.lastJsonExportAt);
      assert.match(await message.innerText(),/ダウンロード.*開始/);
      assert.doesNotMatch(await message.innerText(),/クラウド.*保存済み|同期済み/);
      await shot("download");
      assert.deepEqual(errors,[]);
      console.log(`PASS backup center ${width}: cancel/shared/failed download unchanged, unsupported fallback, restored real JSON download`);
    } finally { await context.close(); }
  } } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
