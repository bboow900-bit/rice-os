"use strict";
const assert = require("node:assert/strict");
const path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true,executablePath: process.env.CHROME_EXE || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360,390]) {
      const context = await browser.newContext({ viewport: { width,height: 844 },isMobile: true,hasTouch: true,serviceWorkers: "block" });
      try {
        const page = await context.newPage(), errors = [], alerts = [];
        page.on("pageerror",e => errors.push(e.message));
        page.on("dialog",async d => { alerts.push(d.message()); await d.dismiss(); });
        await page.route("https://**/*",r => r.abort());
        await page.goto("http://127.0.0.1:4182/index.html",{ waitUntil: "networkidle" });
        const f = await page.evaluate(() => {
          const R = RiceOS,date = R.utils.today(),year = date.slice(0,4);
          const a = R.state.addField("QA timing upper"),b = R.state.addField("QA timing lower"),group = R.state.addFieldGroup("QA timing pair");
          [a,b].forEach(id => R.state.updateField(id,{ fieldGroupId: group }));
          R.state.saveSchedule({ scheduleId: "qa-timing-plan",date,title: "稲刈り予定",fieldIds: [a,b] });
          return { a,b,group,date,year,start: R.utils.dateAddDays(date,3),end: R.utils.dateAddDays(date,10),invalid: `${year}-02-30` };
        });
        const raw = () => page.evaluate(() => ({ data: JSON.stringify(RiceOS.state.data()),raw: localStorage.getItem(RiceOS.schema.STORE_KEY) }));
        const row = id => page.evaluate(id => RiceOS.state.data().fieldWorks.find(w => w.workId === id),id);
        const field = id => page.locator(`.harvest-timing-field[data-field-id="${id}"]`);
        const control = (id,key) => field(id).locator(`[data-timing-key="${key}"]`);
        const set = async (id,key,value) => {
          const c = control(id,key);
          if (await c.first().evaluate(el => el.tagName === "SELECT")) await c.selectOption(value);
          else if (await c.first().getAttribute("type") === "radio") await c.locator(`xpath=self::*[@value="${value}"]`).check();
          else await c.fill(value);
        };
        const value = (id,key) => control(id,key).inputValue();
        const expand = async () => {
          await page.locator("#fwHarvestTiming").waitFor();
          if (!await page.locator("#fwHarvestTiming").evaluate(el => el.open)) await page.locator("#fwHarvestTiming > summary").click();
          for (const details of await page.locator("#fwHarvestTimingFields details").all()) {
            if (!await details.evaluate(el => el.open)) await details.locator(":scope > summary").click();
          }
        };
        const shot = async label => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),false,`${width}px horizontal overflow`);
          const file = path.join(os.tmpdir(),`rice-harvest-timing-${label}-${width}.png`);
          await page.screenshot({ path: file,fullPage: true }); console.log(file);
        };
        const submit = () => page.locator('#fieldWorkForm button[type="submit"]').click();
        const openNew = async () => {
          await page.evaluate(date => { RiceOS.app.openInput("field-work","home"); RiceOS.screens.fieldWork.prefillDate(date); },f.date);
          await page.locator("#fwName").selectOption("稲刈り");
          await page.locator(`[data-fw-group="${f.group}"]`).click();
          for (const id of [f.a,f.b]) await page.locator(`[data-harvest-field="${id}"][value="complete"]`).check();
          await expand();
        };
        const beforeNew = await raw();
        await openNew();
        assert.equal(await field(f.a).count(),1); assert.equal(await field(f.b).count(),1);
        for (const id of [f.a,f.b]) for (const key of ["idealStartDate","idealEndDate","moistureDate"]) assert.equal(await value(id,key),"","Dates must not be guessed");
        await set(f.a,"assessment","early");
        await set(f.a,"memo","Upper-only timing memo");
        await field(f.a).locator("[data-timing-offset]").fill("-3");
        const offsetDate = await page.evaluate(date => RiceOS.utils.dateAddDays(date,-3),f.date);
        assert.equal(await value(f.a,"idealStartDate"),offsetDate);
        assert.equal(await value(f.a,"idealEndDate"),offsetDate);
        await page.locator("[data-timing-copy]").click();
        await expand();
        assert.equal(await value(f.b,"assessment"),"early");
        assert.equal(await value(f.b,"idealStartDate"),offsetDate);
        assert.equal(await value(f.b,"memo"),"Upper-only timing memo");
        await field(f.b).locator("[data-timing-clear]").click();
        await expand();
        assert.equal(await value(f.b,"assessment"),"");
        assert.equal(await value(f.b,"idealStartDate"),"");
        assert.equal(await value(f.a,"memo"),"Upper-only timing memo");
        const offset = field(f.a).locator("[data-timing-offset]");
        await offset.fill("3");
        const validOffsetDate = await page.evaluate(date => RiceOS.utils.dateAddDays(date,3),f.date);
        assert.equal(await value(f.a,"idealStartDate"),validOffsetDate);
        assert.equal(await value(f.a,"idealEndDate"),validOffsetDate);
        for (const invalidOffset of ["366","1.5"]) {
          await offset.fill(invalidOffset);
          assert.equal(await offset.evaluate(el => el.checkValidity()),false,`Offset ${invalidOffset} must be invalid`);
          await submit();
          assert.deepEqual(await raw(),beforeNew,"Invalid offset must block saving stale ideal dates");
          assert.equal(await offset.inputValue(),invalidOffset);
          assert.equal(await value(f.a,"idealStartDate"),validOffsetDate);
        }
        await offset.fill("3");
        assert.equal(await offset.evaluate(el => el.checkValidity()),true,"Corrected integer offset must be valid");
        assert.equal(await value(f.a,"idealEndDate"),validOffsetDate);
        await page.locator("#appBackButton").click();
        assert.deepEqual(await raw(),beforeNew,"Back must not save new harvest");
        await openNew();
        await set(f.a,"assessment","early");
        await set(f.b,"assessment","late");
        for (const key of ["idealStartDate","idealEndDate","moistureDate","moisturePct"]) await set(f.b,key,"");
        await set(f.a,"idealStartDate",f.start); await set(f.a,"idealEndDate",f.end);
        await set(f.a,"moisturePct","24.5"); await set(f.a,"moistureDate",f.start);
        await set(f.a,"memo","Upper-only timing memo");
        await set(f.b,"memo","Lower-only timing memo");
        await set(f.b,"delayReason","rain");
        await set(f.a,"yellowing","green");
        await set(f.b,"yellowing","mostlyYellow");
        await shot("group-new");
        await submit();
        if (!await page.evaluate(a => RiceOS.state.data().fieldWorks.some(w => w.fieldIds.includes(a) && w.harvestTimingByField?.[a]?.assessment === "early"),f.a)) {
          console.log("Save diagnostics",alerts,await page.evaluate(() => ({ date: document.getElementById("fwDate").value,timing: Array.from(document.querySelectorAll(".harvest-timing-field")).map(el => ({ fieldId: el.dataset.fieldId,values: Object.fromEntries(Array.from(el.querySelectorAll("[data-timing-key]")).map(input => [input.dataset.timingKey,input.value])) })),error: RiceOS.state.lastSaveError()?.message,invalid: Array.from(document.querySelectorAll("#fieldWorkForm :invalid")).map(el => ({ id: el.id,key: el.dataset.timingKey,value: el.value,message: el.validationMessage })) })));
        }
        await page.waitForFunction(a => RiceOS.state.data().fieldWorks.some(w => w.fieldIds.includes(a) && w.harvestTimingByField?.[a]?.assessment === "early"),f.a);
        const workId = await page.evaluate(a => RiceOS.state.data().fieldWorks.find(w => w.fieldIds.includes(a) && w.harvestTimingByField?.[a]?.assessment === "early").workId,f.a);
        let work = await row(workId);
        assert.equal(work.harvestTimingByField[f.b].assessment,"late");
        assert.equal(String(work.harvestTimingByField[f.a].moisturePct),"24.5");
        await page.evaluate(({ workId,f }) => {
          const R = RiceOS,w = R.state.data().fieldWorks.find(w => w.workId === workId);
          const photoData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=";
          R.state.saveFieldWork({ ...w,photo: "QA existing photo",photoData });
          // Import an unverified historical snapshot, rather than bypassing the new-row coverage gate.
          const legacy = JSON.parse(JSON.stringify(R.state.data()));
          const target = legacy.fieldWorks.find(row => row.workId === workId);
          target.harvestSnapshots.forEach(snapshot => {
            snapshot.thermal = { headingDate: R.utils.dateAddDays(f.date,-40),startDate: R.utils.dateAddDays(f.date,-39),endDate: f.date,total: 980,status: "保存済み",count: "40",expectedDays: "40" };
          });
          if (!R.state.replace(legacy)) throw new Error("Legacy snapshot fixture import failed");
        },{ workId,f });
        const protectedWork = await row(workId);
        assert.ok(protectedWork.photoData); assert.equal(protectedWork.harvestSnapshots.length,2);
        const edit = async () => {
          await page.evaluate(id => { RiceOS.app.openInput("field-work","home"); RiceOS.screens.fieldWork.editWork(id); },workId);
          await expand();
          assert.equal(await page.locator("#editFieldWorkId").inputValue(),workId);
        };
        await edit();
        assert.equal(await value(f.a,"assessment"),"early"); assert.equal(await value(f.b,"assessment"),"late");
        // HTML date rejects impossible strings itself; temporarily change only this isolated input to text to exercise submission rejection.
        await control(f.a,"idealStartDate").evaluate(el => { el.type = "text"; });
        await set(f.a,"idealStartDate",f.invalid);
        await set(f.a,"memo","Invalid draft retained");
        const beforeInvalid = await raw(), alertCount = alerts.length;
        await submit();
        assert.deepEqual(await raw(),beforeInvalid,"Invalid timing date must not save or complete schedules");
        assert.equal(await value(f.a,"idealStartDate"),f.invalid);
        assert.equal(await value(f.a,"memo"),"Invalid draft retained");
        assert.equal(await page.locator("#editFieldWorkId").inputValue(),workId);
        assert.ok(alerts.length > alertCount || await page.locator("#fieldWorkForm").evaluate(el => !el.checkValidity()),"Rejection must be visible");
        await shot("invalid-draft");
        await page.locator("#appBackButton").click();
        assert.deepEqual(await raw(),beforeInvalid);
        await edit();
        await set(f.a,"assessment","appropriate");
        await set(f.a,"idealStartDate",f.date);
        await set(f.a,"memo","Upper appropriate only");
        await submit();
        await page.waitForFunction(({ workId,a }) => RiceOS.state.data().fieldWorks.find(w => w.workId === workId)?.harvestTimingByField?.[a]?.assessment === "appropriate",{ workId,a: f.a });
        const stable = await row(workId);
        assert.deepEqual(stable.harvestTimingByField[f.b],protectedWork.harvestTimingByField[f.b]);
        assert.equal(stable.photoData,protectedWork.photoData); assert.deepEqual(stable.harvestSnapshots,protectedWork.harvestSnapshots);
        for (const [id,own,other] of [[f.a,"Upper appropriate only","Lower-only timing memo"],[f.b,"Lower-only timing memo","Upper appropriate only"]]) {
          await page.locator('.nav-item[data-screen="annual"]:visible').click();
          await page.locator("#annualYear").selectOption(f.year);
          await page.evaluate(id => RiceOS.screens.annual.openField(id,"work"),id);
          await page.locator(`[data-annual-record-open-id="${workId}"]`).first().click();
          const text = await page.locator(".annual-record-detail").innerText();
          assert.ok(text.includes(own),"Selected field timing must appear"); assert.ok(!text.includes(other),"Sibling timing must not leak into selected field detail");
          assert.match(text,id === f.a ? /適期|適切/ : /遅/);
          await shot(id === f.a ? "annual-upper" : "annual-lower");
        }
        await edit();
        const beforeDeleteCancel = await raw();
        const deleteButton = page.locator(`[data-work-action="delete"][data-id="${workId}"]`);
        const menu = deleteButton.locator("xpath=ancestor::details");
        if (!await menu.evaluate(el => el.open)) await menu.locator(":scope > summary").click();
        await deleteButton.click();
        assert.deepEqual(await raw(),beforeDeleteCancel,"Cancelled delete must preserve timing and snapshots");
        assert.equal(await page.locator("#editFieldWorkId").inputValue(),workId);
        await field(f.a).locator("[data-timing-clear]").click();
        await expand();
        assert.equal(await value(f.a,"assessment"),"");
        assert.equal(await value(f.a,"memo"),"");
        assert.equal(await value(f.b,"assessment"),"late");
        await submit();
        const cleared = await row(workId);
        assert.ok(!cleared.harvestTimingByField?.[f.a] || Object.values(cleared.harvestTimingByField[f.a]).every(v => v === "" || v == null));
        assert.deepEqual(cleared.harvestTimingByField[f.b],stable.harvestTimingByField[f.b]);
        assert.equal(cleared.photoData,protectedWork.photoData); assert.deepEqual(cleared.harvestSnapshots,protectedWork.harvestSnapshots);
        const beforeReload = await raw();
        await page.reload({ waitUntil: "networkidle" });
        const afterReload = await raw();
        if (afterReload.raw !== beforeReload.raw) {
          const changes = [];
          const compare = (before, after, key = "$") => {
            if (JSON.stringify(before) === JSON.stringify(after)) return;
            if (before && after && typeof before === "object" && typeof after === "object") {
              for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) compare(before[name], after[name], `${key}.${name}`);
            } else changes.push({ key, before, after });
          };
          try { compare(JSON.parse(beforeReload.raw), JSON.parse(afterReload.raw)); }
          catch (error) { changes.push({ key: "$raw", error: error.message, before: beforeReload.raw, after: afterReload.raw }); }
          console.error("Reload raw data differences", JSON.stringify(changes));
        }
        assert.equal(afterReload.raw,beforeReload.raw);
        const loadedData = JSON.parse(afterReload.data), savedData = JSON.parse(beforeReload.data);
        // Startup normalization refreshes in-memory metadata without changing the stored records.
        delete loadedData.meta.updatedAt; delete savedData.meta.updatedAt;
        assert.deepEqual(loadedData,savedData);
        assert.deepEqual((await row(workId)).harvestTimingByField,cleared.harvestTimingByField);
        assert.deepEqual(errors,[]);
        console.log(`PASS harvest timing ${width}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
