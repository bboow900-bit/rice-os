"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), os = require("node:os");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
// The preview mode is retained for visual comparison; normal mode tests actual app routes.
async function runMidpointPreview() {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [], failures = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("requestfailed", r => failures.push({ url: r.url(), error: r.failure()?.errorText }));
    page.on("response", r => { if (r.status() >= 400) failures.push({ url: r.url(), status: r.status() }); });
    await page.addInitScript(() => {
      window.__mrNativeStorageCalls = [];
      for (const key of ["getItem", "setItem", "removeItem", "clear"]) {
        const original = Storage.prototype[key];
        Storage.prototype[key] = function (...args) { window.__mrNativeStorageCalls.push(key); return original.apply(this, args); };
      }
    });
    const state = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY), data: JSON.stringify(RiceOS.state.data()) }));
    const capture = async (mode, label = mode) => {
      const root = page.locator(mode === "entry" ? ".mr-entry" : ".mr-detail");
      await root.waitFor();
      for (const img of await root.locator("img").all()) await img.evaluate(el => el.decode());
      assert.equal(await page.evaluate(() => window.materialReviewPreview.memoryOnly), true);
      assert.equal(await page.evaluate(() => Object.getPrototypeOf(window.localStorage) === Storage.prototype), false);
      assert.deepEqual(await page.evaluate(() => window.__mrNativeStorageCalls), [], "Native storage must never be accessed");
      assert.deepEqual(errors, []); assert.deepEqual(failures, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const layout = await root.evaluate(el => {
        const bad = [], visible = n => n.getClientRects().length && getComputedStyle(n).visibility !== "hidden";
        for (const node of el.querySelectorAll("h2,h3,h4,dt,dd,p,button,small")) {
          if (!visible(node)) continue;
          const bounds = node.getBoundingClientRect();
          if (bounds.left < -1 || bounds.right > innerWidth + 1) bad.push(`outside viewport: ${node.className}`);
          if (node.scrollWidth > node.clientWidth + 1) bad.push(`text overflow: ${node.className}`);
        }
        for (const selector of [".mr-entry-body", ".mr-result-hero"]) {
          const row = el.querySelector(selector); if (!row) continue;
          const [a, b] = [...row.children].map(n => n.getBoundingClientRect());
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(`columns overlap: ${selector}`);
        }
        return { bad, art: [...el.querySelectorAll("img")].map(n => ({ src: n.getAttribute("src"), loaded: n.complete && n.naturalWidth > 0, width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })) };
      });
      assert.deepEqual(layout.bad, []);
      assert(layout.art.every(a => a.loaded && a.width > 0 && a.height > 0));
      const file = path.join(os.tmpdir(), `rice-material-review-midpoint-${label}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true }); console.log(file);
      const viewport = path.join(os.tmpdir(), `rice-material-review-midpoint-${label}-viewport-${width}.png`);
      await page.screenshot({ path: viewport }); console.log(viewport);
      console.log(`LAYOUT ${mode} ${width}: ${JSON.stringify(layout)}`);
    };
    try {
      const base = process.env.MATERIAL_REVIEW_PREVIEW_URL || "http://127.0.0.1:4182/docs/ui-preview/material-review-midpoint.html";
      for (const mode of ["entry", "result"]) {
        await page.goto(`${base}?view=${mode}`, { waitUntil: "networkidle" });
        const baseline = await state();
        await capture(mode);
        const dto = await page.evaluate(() => RiceOS.materialReview.describe(RiceOS.state.field(materialReviewPreview.fieldId), materialReviewPreview.year));
        assert.equal(dto.currentProgram.name, "残草対策A"); assert.equal(dto.latestObservation.status, "残草少なめ");
        assert.equal(dto.materialCount, 4); assert.equal(dto.currentProgram.recordedCount, 2); assert.equal(dto.currentProgram.unrecordedCount, 1);
        console.log(`PROVENANCE ${width}/${mode}: ${JSON.stringify({ current: dto.currentProgram.assignmentId, observation: dto.latestObservation.assignmentId, observationActive: dto.latestObservation.assignmentActive, date: dto.latestObservation.date })}`);
        if (mode === "entry") {
          await page.locator(".mr-entry-open[data-mr-open]").click(); await page.locator(".mr-detail").waitFor();
          await page.locator("[data-mr-back]").click(); await page.locator(".mr-entry").waitFor();
        } else {
          for (const button of await page.locator('[data-mr-tab]:not([data-mr-tab="result"]),[data-mr-edit-observation],[data-mr-delete-observation]').all()) assert.equal(await button.isDisabled(), true);
          await page.locator(".mr-program").scrollIntoViewIfNeeded();
          const scrolled = path.join(os.tmpdir(), `rice-material-review-midpoint-result-program-scrolled-${width}.png`);
          await page.screenshot({ path: scrolled }); console.log(scrolled);
          await page.locator("[data-mr-back]").click(); await page.locator(".mr-entry").waitFor();
        }
        assert.deepEqual(await state(), baseline, "Preview navigation does not mutate in-memory fixture");
        assert.deepEqual(await page.evaluate(() => window.__mrNativeStorageCalls), []);
      }
      console.log(`PASS midpoint preview ${width}: entry/result, loaded artwork, geometry, memory-only storage, entry/back; no full UI or CRUD exercised`);
    } finally { await context.close(); }
  }} finally { await browser.close(); }
}

async function runActualApp() {
  const findings = [], resultOnly = process.env.MATERIAL_REVIEW_RESULT_ONLY === "1";
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try { for (const width of [360, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: "block" });
    const page = await context.newPage(), errors = [], failedAssets = [], dialogs = [];
    let approve = false, stage = "fixture";
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", async d => { dialogs.push(d.message()); await (approve ? d.accept() : d.dismiss()); });
    page.on("response", r => { if (r.status() >= 400 && /\.(?:js|css|png)(?:\?|$)/.test(r.url())) failedAssets.push(`${r.status()} ${r.url()}`); });
    const click = selector => page.locator(selector).filter({ visible: true }).click();
    const root = () => page.locator("#screen-annual.active .mr-detail:visible");
    const form = () => root().locator("[data-mr-observation-form]");
    const tab = value => root().locator(`.mr-tabs [data-mr-tab="${value}"]`).click();
    const data = () => page.evaluate(() => RiceOS.utils.clone(RiceOS.state.data()));
    const snapshot = () => page.evaluate(() => ({ raw: localStorage.getItem(RiceOS.schema.STORE_KEY), data: JSON.stringify(RiceOS.state.data()) }));
    const clearWrites = () => page.evaluate(() => { window.__mrWrites = []; });
    const noWrite = async before => { assert.deepEqual(await snapshot(), before); assert.deepEqual(await page.evaluate(() => window.__mrWrites), []); };
    const nav = async () => assert.deepEqual(await page.locator(".nav-item.active").evaluateAll(nodes => nodes.map(n => n.dataset.screen)), ["annual"]);
    const shot = async name => {
      await page.locator("#toast").waitFor({ state: "hidden", timeout: 10000 });
      const file = path.join(os.tmpdir(), `rice-material-review-app-${name}-${width}.png`);
      await page.screenshot({ path: file }); console.log(file);
    };
    const checkImages = async host => {
      for (const image of await host.locator("img").all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(el => el.decode()); }
      const geometry = await host.evaluate(el => {
        const bad = [];
        for (const node of el.querySelectorAll("h2,h3,h4,dt,dd,p,button,input,select,textarea")) {
          if (!node.getClientRects().length) continue;
          const r = node.getBoundingClientRect();
          if (r.left < -1 || r.right > innerWidth + 1) bad.push(`outside viewport: ${node.className}`);
          if (!/INPUT|SELECT|TEXTAREA/.test(node.tagName) && node.scrollWidth > node.clientWidth + 1) bad.push(`overflow: ${node.className}`);
        }
        return bad;
      });
      assert.deepEqual(geometry, []); assert.deepEqual(failedAssets, []);
    };
    try {
      await page.clock.setFixedTime(new Date("2026-11-15T03:00:00Z"));
      await page.route("https://**/*", r => r.abort());
      await page.goto(process.env.MATERIAL_REVIEW_APP_URL || "http://127.0.0.1:4182/index.html", { waitUntil: "networkidle" });
      const ids = await page.evaluate(() => {
        const S = RiceOS.state, H = RiceOS.herbicide, a = S.addField("Material audit A"), b = S.addField("Material audit B");
        const materials = [];
        for (const [name, category] of [["Saved initial material", "除草剤"], ["Saved middle material", "除草剤"], ["Saved fertilizer", "肥料"], ["Saved protection", "殺虫殺菌剤"]]) {
          if (!S.saveMaterial({ name, category })) throw Error("Material fixture"); materials.push(S.data().materials.at(-1).materialId);
        }
        const steps = [{ id: "mr-first", category: "初期剤", materialId: materials[0] }, { id: "mr-middle", category: "初中期剤", materialId: materials[1] }, { id: "mr-extra", category: "追加処理", materialId: materials[3] }];
        const oldProgram = H.saveProgram({ name: "Historical recorded program", steps });
        const oldAssignments = H.assignProgram({ year: 2026, programId: oldProgram.programId, fieldIds: [a, b] });
        const oldA = oldAssignments.find(r => r.fieldId === a), oldB = oldAssignments.find(r => r.fieldId === b);
        const currentProgram = H.saveProgram({ name: "Current recorded program", steps });
        const current = H.assignProgram({ year: 2026, programId: currentProgram.programId, fieldIds: [a] })[0];
        const prior = H.assignProgram({ year: 2025, programId: oldProgram.programId, fieldIds: [a] })[0];
        const observation = H.saveObservation({ assignmentId: oldA.assignmentId, fieldId: a, date: "2026-09-12", status: "残草少なめ", weeds: ["ヒエ", "ホタルイ"], memo: "Historical A memo <literal>", customSnapshot: { preserve: [1, "old"] } });
        const legacyObservation = H.saveObservation({ assignmentId: oldA.assignmentId, fieldId: a, date: "2026-06-15", status: "経過観察中", memo: "Legacy observation without weeds" });
        H.saveObservation({ assignmentId: current.assignmentId, fieldId: a, date: "2026-08-01", status: "経過観察中", memo: "Current A early observation" });
        H.saveObservation({ assignmentId: oldB.assignmentId, fieldId: b, date: "2026-09-20", status: "一部残草", memo: "Only B observation" });
        H.saveObservation({ assignmentId: prior.assignmentId, fieldId: a, date: "2025-09-01", status: "追加対応あり", memo: "Prior crop observation" });
        const work = (id, date, workName, materialIndex, links = [], cropYear = 2026) => {
          if (!S.saveFieldWork({ workId: id, date, cropYear, fieldIds: [a], workName, materialId: materials[materialIndex], material: ["Saved initial material", "Saved middle material", "Saved fertilizer", "Saved protection"][materialIndex], herbicideLinks: links, memo: `Original work ${id}` })) throw Error(`Work fixture ${id}`);
        };
        const link = stepId => [{ fieldId: a, assignmentId: current.assignmentId, stepId }];
        work("mr-actual-first", "2026-05-17", "除草剤", 0, link("mr-first"));
        work("mr-actual-middle", "2026-06-06", "除草剤", 1, link("mr-middle"));
        work("mr-actual-fertilizer", "2026-07-20", "追肥", 2);
        work("mr-actual-protection", "2026-08-01", "防除", 3);
        work("mr-planned", "2026-08-02", "防除予定", 3);
        work("mr-cross-calendar", "2025-12-20", "除草剤", 3);
        work("mr-legacy-calendar", "2026-07-02", "除草剤", 0, link("mr-first"), 2025);
        const d = RiceOS.utils.clone(S.data());
        // Historical import can contain links which the modern calendar-year editor cannot create.
        d.fieldWorks.find(w => w.workId === "mr-cross-calendar").herbicideLinks = link("mr-extra");
        delete d.meta.herbicideObservations.find(o => o.observationId === legacyObservation.observationId).weeds;
        if (!S.replace(d, "Isolated imported crop-year material fixture")) throw Error("Imported fixture");
        if (!S.saveSeasonNote({ fieldId: a, season: 2026, date: "2026-09-12", text: "Independent preserved season note" })) throw Error("Season note fixture");
        window.__mrWrites = [];
        for (const method of ["setItem", "removeItem", "clear"]) {
          const original = Storage.prototype[method];
          Storage.prototype[method] = function (...args) { if (this === localStorage && (method === "clear" || String(args[0]) === RiceOS.schema.STORE_KEY)) window.__mrWrites.push(method); return original.apply(this, args); };
        }
        return { a, b, current: current.assignmentId, old: oldA.assignmentId, observation: observation.observationId, legacyObservation: legacyObservation.observationId, material: materials[0] };
      });
      let baseline = await snapshot();
      await click('.nav-item[data-screen="annual"]'); await page.locator("#annualYear").selectOption("2026"); await click(`[data-annual-hub-open-field="${ids.a}"]`);
      stage = "actual overview entry and result provenance";
      const entry = page.locator("#screen-annual .mr-entry:visible");
      assert.equal(await entry.count(), 1); assert.equal(await page.locator(".annual-used-materials:visible").count(), 0);
      assert.match(await entry.innerText(), /Current recorded program/); assert.match(await entry.innerText(), /変更前の計画.*Historical recorded program/s);
      assert.match(await entry.innerText(), /残草少なめ/); assert.doesNotMatch(await entry.innerText(), /Only B|Prior crop/);
      await checkImages(entry); await entry.scrollIntoViewIfNeeded(); await shot("entry");
      await entry.locator(".mr-entry-open[data-mr-open]").click(); await root().waitFor(); await nav();
      assert.equal(await root().getAttribute("data-field-id"), ids.a); assert.equal(await root().getAttribute("data-year"), "2026");
      assert.equal(await root().locator(".mr-result-status").innerText(), "残草少なめ");
      assert.equal(await root().locator(".mr-result-status").evaluate(el => el.getClientRects().length), 1, "Result assessment must not orphan its final character");
      assert.equal(await root().locator(".mr-header .mr-heading h2").evaluate(el => getComputedStyle(el).color), "rgb(255, 255, 255)", "Emerald header title remains white");
      assert.match(await root().locator(".mr-result").innerText(), /変更前の計画.*Historical recorded program/s);
      assert.doesNotMatch(await root().innerText(), /未実施|未使用|Only B|Prior crop|NaN|undefined/);
      await checkImages(root()); await page.evaluate(() => scrollTo(0, 0)); await shot("result"); await noWrite(baseline);
      stage = "legacy missing-weeds observation edit/cancel without normalization writes";
      assert.equal(await page.evaluate(id => Object.hasOwn(RiceOS.herbicide.observations().find(o => o.observationId === id), "weeds"), ids.legacyObservation), false);
      await root().locator(".mr-history > summary").click();
      await root().locator(`[data-mr-edit-observation][data-observation-id="${ids.legacyObservation}"]`).click();
      await form().waitFor(); assert.equal(await form().locator('[name="weeds"]').inputValue(), "");
      assert.equal(await form().locator('[name="memo"]').inputValue(), "Legacy observation without weeds");
      const legacyDialogCount = dialogs.length;
      await root().locator('.mr-editor-actions [data-mr-cancel-editor]').click(); await root().locator(".mr-result").waitFor();
      assert.equal(dialogs.length, legacyDialogCount); await noWrite(baseline);
      const model = await page.evaluate(a => RiceOS.materialReview.describe(RiceOS.state.field(a), 2026), ids.a);
      assert.equal(model.materialCount, 4);
      assert(model.currentProgram.steps.some(s => s.works.some(w => w.workId === "mr-legacy-calendar" && w.year === "2025" && w.date === "2026-07-02")), "Legacy calendar-year explicit link retained with its actual crop year/date");
      assert(!model.materials.some(g => g.works.some(w => w.workId === "mr-legacy-calendar")), "Materials remain canonical crop-year scoped");
      assert(!model.currentProgram.steps.some(s => s.works.some(w => ["mr-planned", "mr-actual-protection"].includes(w.workId))), "No planned or same-material auto-links");
      if (!model.currentProgram.steps.some(s => s.works.some(w => w.workId === "mr-cross-calendar"))) {
        const finding = `${width}: crop-year 2026 cross-calendar linked actual appears in materials but is lost from program steps`;
        findings.push(finding); console.error(`FINDING ${finding}`);
      }
      if (!resultOnly) {
        stage = "tabs, actual work detail/back, management/material origins";
        await tab("program"); assert.equal(await root().getAttribute("data-mr-view"), "program");
        await root().locator('[data-annual-record-open-id="mr-actual-first"]').click();
        await page.locator(".annual-record-detail:visible").waitFor(); assert.match(await page.locator(".annual-record-detail").innerText(), /Original work mr-actual-first/);
        await click("[data-annual-record-detail-back]"); await root().waitFor(); assert.equal(await root().getAttribute("data-mr-view"), "program");
        await root().locator('[data-annual-record-open-id="mr-legacy-calendar"]').click();
        await page.locator(".annual-record-detail:visible").waitFor();
        assert.match(await page.locator("[data-annual-record-year]").innerText(), /2025/);
        await click("[data-annual-record-detail-back]"); await root().waitFor(); assert.equal(await root().getAttribute("data-mr-view"), "program");
        await click("[data-mr-management]"); await page.locator("#screen-herbicide.active").waitFor(); await nav(); await click("#appBackButton"); await root().waitFor();
        assert.equal(await root().getAttribute("data-mr-view"), "program"); await nav();
        await tab("materials"); await checkImages(root()); await shot("materials");
        const material = root().locator(".mr-material-group").filter({ has: page.locator(`[data-mr-material-master="${ids.material}"]`) });
        await material.locator(":scope > summary").click();
        await material.locator(`[data-mr-material-master="${ids.material}"]`).click(); await page.locator("#screen-materials.active").waitFor(); await nav();
        await click("#appBackButton");
        await root().waitFor(); assert.equal(await page.locator("#screen-materials.active").count(), 0, "External material detail returns to MR in exactly one back");
        assert.equal(await root().getAttribute("data-mr-view"), "materials"); await nav(); await noWrite(baseline);
        const reopenGroup = root().locator(".mr-material-group").filter({ has: page.locator(`[data-mr-material-master="${ids.material}"]`) });
        if (!await reopenGroup.evaluate(el => el.open)) await reopenGroup.locator(":scope > summary").click();
        await reopenGroup.locator(`[data-mr-material-master="${ids.material}"]`).click();
        await page.locator("#screen-materials.active").waitFor();
        await click(`#screen-materials [data-material-edit="${ids.material}"]`);
        await page.locator("#materialForm:visible").waitFor();
        await click("#appBackButton");
        await page.locator(`#screen-materials.active [data-material-edit="${ids.material}"]:visible`).waitFor();
        assert.equal(await root().count(), 0, "Nested material edit backs to its detail before leaving external origin"); await nav();
        await click("#appBackButton"); await root().waitFor();
        assert.equal(await root().getAttribute("data-mr-view"), "materials"); await noWrite(baseline);
        await tab("result");
        const editOld = () => root().locator(`.mr-memo [data-mr-edit-observation="${ids.old}"][data-observation-id="${ids.observation}"]`).click();
        stage = "dirty editor rejection guards and cancellation";
        await editOld(); await form().waitFor(); assert.equal(await form().locator('[name="memo"]').inputValue(), "Historical A memo <literal>");
        await form().locator('[name="memo"]').fill("Cancelled independent draft");
        const dialogCount = dialogs.length;
        await page.locator("[data-annual-field-switch]").selectOption(ids.b);
        assert.equal(dialogs.length, dialogCount + 1); assert.equal(await page.locator("[data-annual-field-switch]").inputValue(), ids.a);
        if (await page.locator("#annualYear").isVisible()) {
          await page.locator("#annualYear").selectOption("2025"); assert.equal(await page.locator("#annualYear").inputValue(), "2026");
        } else console.log(`COVERAGE ${width}: inline crop-year dirty guard unavailable because existing selector is hidden; year switching uses hub route`);
        await click('.nav-item[data-screen="home"]'); assert.equal(await page.locator("#screen-annual.active").count(), 1); await form().waitFor();
        await click("#appBackButton"); await form().waitFor();
        assert.equal(await form().locator('[name="memo"]').inputValue(), "Cancelled independent draft");
        await root().locator('.mr-editor-actions [data-mr-cancel-editor]').click(); await form().waitFor();
        approve = true; await root().locator('.mr-editor-actions [data-mr-cancel-editor]').click(); approve = false;
        await root().locator(".mr-result").waitFor(); await noWrite(baseline);
        stage = "existing observation save preserves historic fields and all unrelated collections";
        const beforeEdit = await data(); await editOld(); await form().locator('[name="memo"]').fill("Saved independent memo <literal>");
        await form().locator('[type="submit"]').click(); await root().locator(".mr-result").waitFor();
        const afterEdit = await data(), originalObservation = beforeEdit.meta.herbicideObservations.find(o => o.observationId === ids.observation), changedObservation = afterEdit.meta.herbicideObservations.find(o => o.observationId === ids.observation);
        assert.deepEqual({ ...changedObservation, memo: originalObservation.memo, updatedAt: originalObservation.updatedAt }, originalObservation);
        const protectedData = d => { const c = structuredClone(d); delete c.meta.herbicideObservations; delete c.meta.updatedAt; return c; };
        assert.deepEqual(protectedData(afterEdit), protectedData(beforeEdit));
        assert.deepEqual(afterEdit.meta.herbicideObservations.filter(o => o.observationId !== ids.observation), beforeEdit.meta.herbicideObservations.filter(o => o.observationId !== ids.observation));
        baseline = await snapshot(); await clearWrites(); await editOld(); assert.equal(await form().locator('[name="memo"]').inputValue(), "Saved independent memo <literal>");
        await root().locator('.mr-editor-actions [data-mr-cancel-editor]').click(); await root().locator(".mr-result").waitFor(); await noWrite(baseline);
        stage = "new observation save and delete confirm cancellation";
        await root().locator(`.mr-observation-actions [data-mr-new-observation="${ids.current}"]`).click();
        await form().locator('[name="date"]').fill("2026-10-01"); await form().locator('[name="status"]').selectOption({ label: "良好" });
        await form().locator('[name="weeds"]').fill("ヒエ"); await form().locator('[name="memo"]').fill("Independent new observation"); await form().locator('[type="submit"]').click();
        await root().locator(".mr-result").waitFor();
        const afterNew = await data(), newObservation = afterNew.meta.herbicideObservations.find(o => o.memo === "Independent new observation");
        assert(newObservation); assert.equal(newObservation.fieldId, ids.a); assert.equal(newObservation.assignmentId, ids.current);
        assert.equal(afterNew.meta.herbicideObservations.length, afterEdit.meta.herbicideObservations.length + 1);
        assert.deepEqual(protectedData(afterNew), protectedData(afterEdit));
        baseline = await snapshot(); await clearWrites();
        await root().locator(".mr-history > summary").click();
        const deletion = () => root().locator(`[data-mr-delete-observation="${newObservation.observationId}"]`);
        await deletion().click(); await noWrite(baseline);
        approve = true; await deletion().click(); approve = false; await root().waitFor();
        const afterDelete = await data(); assert.deepEqual(afterDelete.meta.herbicideObservations, afterEdit.meta.herbicideObservations); assert.deepEqual(protectedData(afterDelete), protectedData(afterEdit));
        baseline = await snapshot(); await clearWrites(); await shot("saved-result");
      }
      stage = "field/year result switching and overview restoration";
      await page.locator("[data-annual-field-switch]").selectOption(ids.b); await root().waitFor();
      assert.match(await root().innerText(), /Only B observation/); assert.doesNotMatch(await root().innerText(), /Historical A memo|Saved independent memo/);
      await page.locator("[data-annual-field-switch]").selectOption(ids.a);
      const changeYear = async year => {
        if (await page.locator("#annualYear").isVisible()) { await page.locator("#annualYear").selectOption(year); return; }
        await click("[data-mr-back]"); await page.locator(".mr-entry:visible").waitFor();
        await click("#appBackButton"); await page.locator("#annualYear:visible").waitFor();
        await page.locator("#annualYear").selectOption(year); await click(`[data-annual-hub-open-field="${ids.a}"]`);
        await page.locator(".mr-entry-open:visible").click(); await root().waitFor();
      };
      await changeYear("2025"); await root().waitFor();
      assert.equal(await root().getAttribute("data-year"), "2025"); assert.match(await root().innerText(), /Prior crop observation/);
      await changeYear("2026"); await click("[data-mr-back]"); await page.locator(".mr-entry:visible").waitFor();
      await page.locator(".annual-story:visible").waitFor(); await nav(); await noWrite(baseline); assert.deepEqual(errors, []);
      stage = "annual notes, field comparison and hub visual capture";
      const notes = page.locator("#screen-annual .annual-season-notes:visible");
      assert.match(await notes.innerText(), /Independent preserved season note/);
      await notes.scrollIntoViewIfNeeded(); await checkImages(notes); await shot("annual-notes");
      await click("[data-annual-open-compare]"); await page.locator("[data-annual-close-compare]:visible").waitFor();
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250); await shot("annual-field-compare");
      await click("[data-annual-close-compare]"); await page.locator(".mr-entry:visible").waitFor();
      await click("#appBackButton"); await page.locator("#annualYear:visible").waitFor();
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250); await shot("annual-hub");
      await click('[data-annual-hub-view="compare"]'); await page.locator(".annual-hub-compare:visible").waitFor();
      await page.locator(".annual-hub-compare").scrollIntoViewIfNeeded(); await shot("annual-hub-compare");
      await noWrite(baseline); assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(`CHECKED actual material review ${width}: ${resultOnly ? "entry/result/read-only routes" : "tabs/origins/CRUD/guards"}, field/year, images, exact expected data effects; findings=${findings.filter(s => s.startsWith(`${width}:`)).length}`);
    } catch (error) { console.error(`FAIL actual material review ${width} at ${stage}`); await shot("failure").catch(() => {}); throw error; }
    finally { await context.close(); }
  }} finally { await browser.close(); }
  assert.deepEqual(findings, [], "Independent material review data findings");
}
(process.env.MATERIAL_REVIEW_PREVIEW_ONLY === "1" ? runMidpointPreview() : runActualApp()).catch(error => { console.error(error); process.exitCode = 1; });
