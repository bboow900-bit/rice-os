"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const URL = "http://127.0.0.1:4182/index.html";
const formSelector = "[data-annual-water-edit-form]";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [], screenshots = [];
        page.on("pageerror",error => errors.push(error.message));
        await page.route("https://**/*",route => route.abort());
        await page.goto(URL,{ waitUntil: "networkidle" });
        await page.waitForFunction(() => window.RiceOS && RiceOS.app && RiceOS.state);
        const snapshot = () => page.evaluate(() => {
          const S = RiceOS.schema;
          return { data: JSON.stringify(RiceOS.state.data()), raw: [S.STORE_KEY,S.BACKUP_KEY,S.RELEASE_BACKUPS_KEY].map(key => localStorage.getItem(key)) };
        });
        const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px overflow`);
        const screenshot = async label => {
          await noOverflow();
          const file = path.join(os.tmpdir(),`rice-water-schedule-${label}-${width}.png`);
          await page.screenshot({ path: file }); screenshots.push(file);
        };
        const seed = async (kind,scenario) => page.evaluate(({ kind,scenario }) => {
          const R = RiceOS, date = R.utils.today(), startDate = `${date.slice(0,8)}01`;
          const fieldId = R.state.addField(`QA ${kind} ${scenario}`);
          if (!fieldId) throw Error("Field seed failed");
          const id = `qa-water-${kind}-${scenario}`, startId = `${id}-start`, endId = `${id}-end`;
          const waterKind = kind === "dry" ? "dry" : "intermittent";
          const label = kind === "dry" ? "中干し" : "間断灌水";
          for (const [scheduleId,waterPhase,boundary] of [[startId,"start",startDate],[endId,"end",date]]) {
            if (!R.state.saveSchedule({ scheduleId,date: boundary,title: `${label}${waterPhase === "start" ? "開始" : "終了"}予定`,
              targetScope: "field",fieldIds: [fieldId],recordKind: "water",waterKind,waterPhase })) throw Error("Schedule seed failed");
          }
          const save = row => kind === "dry" ? R.state.saveDryPeriod(row) : R.state.saveIrrigation(row);
          const collection = () => kind === "dry" ? R.state.data().dryPeriods : R.state.data().irrigations;
          const key = kind === "dry" ? "dryPeriodId" : "irrigationId";
          const row = { [key]: id,fieldId,date: startDate,startDate,actualEndDate: date,
            method: kind === "dry" ? "中干し" : "間断灌水",status: "完了",periodStatus: "完了",memo: "QA linked water" };
          if (!save({ ...row,sourceScheduleId: startId,sourceSchedulePhase: "start" })) throw Error("Start link seed failed");
          const saved = collection().find(item => item[key] === id);
          if (!save({ ...saved,sourceScheduleId: endId,sourceSchedulePhase: "end" })) throw Error("End link seed failed");
          const schedules = [startId,endId].map(sid => R.state.data().schedules.find(item => item.scheduleId === sid));
          if (schedules.some(item => !item.completedAt || item.completionLink?.recordId !== id)) throw Error("Both linked boundaries must initially be complete");
          return { kind,id,fieldId,date,startDate,startId,endId };
        },{ kind,scenario });
        const rows = item => page.evaluate(item => {
          const d = RiceOS.state.data(), key = item.kind === "dry" ? "dryPeriodId" : "irrigationId";
          return { record: (item.kind === "dry" ? d.dryPeriods : d.irrigations).find(row => row[key] === item.id) || null,
            start: d.schedules.find(row => row.scheduleId === item.startId), end: d.schedules.find(row => row.scheduleId === item.endId) };
        },item);
        const open = async item => {
          await page.evaluate(({ kind,id }) => {
            RiceOS.app.show("annual");
            if (!RiceOS.screens.annual.openWaterEditor(kind,id)) throw Error("Annual water editor route failed");
          },item);
          await page.locator(formSelector).waitFor({ state: "visible" });
          await page.locator(`${formSelector} [name="actualEndDate"]`).scrollIntoViewIfNeeded();
          await noOverflow();
        };
        const dialogClick = async (locator,accept,expected) => {
          const handled = new Promise((resolve,reject) => page.once("dialog",async dialog => {
            try { assert.equal(dialog.type(),"confirm"); assert.match(dialog.message(),expected); await (accept ? dialog.accept() : dialog.dismiss()); resolve(); }
            catch (error) { await dialog.dismiss().catch(() => {}); reject(error); }
          }));
          await locator.click();
          await Promise.race([handled,new Promise((resolve,reject) => {
            const timer = setTimeout(() => reject(Error("Expected confirmation dialog did not arrive")),10000);
            handled.finally(() => clearTimeout(timer)).catch(() => {});
          })]);
        };
        const assertPending = (row,label) => {
          assert.equal(row.status,"予定",label); assert.equal(row.completedAt,"",label);
          assert.equal(row.completedByWaterPeriodId,"",label); assert.equal(row.completionLink,undefined,label);
        };
        for (const kind of ["dry","irrigation"]) {
          const linked = await seed(kind,"auto");
          await open(linked);
          await screenshot(`${kind}-completed-editor`);
          const before = await snapshot(), initial = await rows(linked);
          await page.locator(`${formSelector} [name="actualEndDate"]`).fill("");
          const submit = page.locator(`${formSelector} .primary[type="submit"]`);
          await dialogClick(submit,false,/継続中に戻/);
          assert.deepEqual(await snapshot(),before,`${kind}: retract cancel is no-op`);
          assert.equal(await page.locator(`${formSelector} [name="actualEndDate"]`).inputValue(),"");
          await dialogClick(submit,true,/継続中に戻/);
          await page.waitForFunction(({ kind,id }) => {
            const d = RiceOS.state.data();
            return (kind === "dry" ? d.dryPeriods : d.irrigations).some(row => (kind === "dry" ? row.dryPeriodId : row.irrigationId) === id && row.actualEndDate === "");
          },linked);
          const retracted = await rows(linked);
          assertPending(retracted.end,`${kind}: end reopened`);
          assert.deepEqual(retracted.start,initial.start,`${kind}: start completion unchanged`);
          await screenshot(`${kind}-retracted`);
          await open(linked);
          const deleteButton = page.locator(`${formSelector} [data-annual-water-editor-delete][data-id="${linked.id}"]`);
          const beforeDelete = await snapshot();
          await dialogClick(deleteButton,false,/削除/);
          assert.deepEqual(await snapshot(),beforeDelete,`${kind}: delete cancel is no-op`);
          await dialogClick(deleteButton,true,/削除/);
          await page.waitForFunction(({ kind,id }) => {
            const d = RiceOS.state.data();
            return !(kind === "dry" ? d.dryPeriods : d.irrigations).some(row => (kind === "dry" ? row.dryPeriodId : row.irrigationId) === id);
          },linked);
          const removed = await rows(linked);
          assert.equal(removed.record,null); assertPending(removed.start,`${kind}: auto start reopened`); assertPending(removed.end,`${kind}: auto end pending`);
          await screenshot(`${kind}-deleted`);
          const manual = await seed(kind,"manual");
          await page.evaluate(id => { if (!RiceOS.state.completeSchedule(id)) throw Error("Manual completion failed"); },manual.endId);
          const manualBefore = (await rows(manual)).end;
          assert(manualBefore.completedManuallyAt);
          await open(manual);
          const manualDelete = page.locator(`${formSelector} [data-annual-water-editor-delete][data-id="${manual.id}"]`);
          const beforeManualDelete = await snapshot();
          await dialogClick(manualDelete,false,/削除/);
          assert.deepEqual(await snapshot(),beforeManualDelete,`${kind}: manual-linked delete cancel is no-op`);
          await dialogClick(manualDelete,true,/削除/);
          const manualAfter = await rows(manual);
          assert.equal(manualAfter.record,null);
          assert.deepEqual(manualAfter.end,manualBefore,`${kind}: entire manually completed schedule retained`);
          assertPending(manualAfter.start,`${kind}: remaining auto link reopened`);
          await screenshot(`${kind}-manual-retained`);
        }
        assert.deepEqual(errors,[]);
        console.log(`PASS water schedule ${width}px: dry/irrigation retract cancel/accept, start retained, delete cancel/accept, auto reopened, complete manual rows retained, no overflow/page errors`);
        screenshots.forEach(file => console.log(`SCREENSHOT ${file}`));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
