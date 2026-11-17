"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const memory = new Map(); let writes = 0, passed = 0;
const fail = () => { throw Error("Material review must not write, fetch, or bind events"); };
const c = vm.createContext({ console, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {}, fetch: fail,
  document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: fail },
  localStorage: { getItem: key => memory.get(key) || null, setItem(key, value) { writes++; memory.set(key, String(value)); }, removeItem: fail } });
c.window = c;
const load = file => vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js", file), "utf8"), c, { filename: file });
for (const name of ["utils", "schema", "storage", "state", "herbicide"]) load(`core/${name}.js`);
load("ui/material-review.js");
const R = c.RiceOS, S = R.state;
R.utils.today = () => "2026-10-01"; R.utils.now = () => "2026-10-01T00:00:00Z";
const step = (id, category, materialName) => ({ id, category, materialId: "m", materialName, plannedTiming: "田植え後", purpose: "保存した目的" });
const assignment = (assignmentId, patch = {}) => ({ assignmentId, fieldId: "a", year: 2026, programId: "p", name: "保存した体系名", active: true,
  steps: [step("s1", "初期剤", "当時の薬剤A"), step("s2", "追加処理", "当時の薬剤B")], ...patch });
const work = (workId, patch = {}) => ({ workId, date: "2026-06-01", cropYear: 2026, workName: "除草剤", fieldIds: ["a", "b"], materialId: "m", material: "使用時の資材名",
  herbicideCategory: "初期剤", herbicideLinks: [{ fieldId: "a", assignmentId: "current", stepId: "s1" }], ...patch });
assert(S.replace(R.schema.normalize({ fields: [{ fieldId: "a", name: "開パ下<script>" }, { fieldId: "b", name: "Other field" }],
  materials: [{ materialId: "m", name: "改名後のマスター資材" }],
  fieldWorks: [work("linked"), work("unlinked", { herbicideLinks: [] }), work("future", { date: "2026-12-01", herbicideLinks: [{ fieldId: "a", assignmentId: "current", stepId: "s2" }] }),
    work("planned", { workName: "除草剤予定" }), work("prior", { cropYear: 2025 }), work("other-field", { fieldIds: ["b"] }),
    work("old-step", { herbicideLinks: [{ fieldId: "a", assignmentId: "old", stepId: "s1" }] })],
  meta: { herbicidePrograms: [{ programId: "p", name: "改名後の体系", steps: [step("s1", "変わった区分", "改名後の薬剤")] }],
    herbicideAssignments: [assignment("old", { active: false, name: "変更前の体系" }), assignment("current"), assignment("other-field", { fieldId: "b" }), assignment("other-year", { year: 2025 })],
    herbicideObservations: [
      { observationId: "first", assignmentId: "current", fieldId: "a", date: "2026-07-01", status: "経過観察中", weeds: [], memo: "途中" },
      { observationId: "latest", assignmentId: "current", fieldId: "a", date: "2026-09-12", status: "一部残草", weeds: ["ヒエ", "ホタルイ"], memo: "<script>saved</script>\n翌年への記録" },
      { observationId: "wrong-field", assignmentId: "current", fieldId: "b", date: "2026-09-20", status: "良好" },
      { observationId: "wrong-year", assignmentId: "current", fieldId: "a", date: "2025-09-20", status: "良好" },
      { observationId: "old-observation", assignmentId: "old", fieldId: "a", date: "2026-06-20", status: "追加対応あり", memo: "変更前の観察" }
    ] } })));
c.localStorage.setItem = fail;
const M = R.materialReview, field = S.field("a");
const snapshot = () => JSON.stringify([S.data(), [...memory], writes]);
function read(fn) { const before = snapshot(); const result = fn(); assert.equal(snapshot(), before); return result; }
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
test("mandatory field/year scope never leaks all-field or all-year records", () => {
  for (const [f, year] of [[null, 2026], [field, "all"], [field, undefined], [{ fieldId: "missing" }, 2026]]) {
    const model = read(() => M.describe(f, year)); assert.equal(model.valid, false); assert.equal(model.latestObservation, null); assert.equal(model.materialCount, 0);
    assert(!M.renderEntry(f, year).includes("一部残草"));
  }
  assert.equal(read(() => M.describe(S.field("b"), 2026)).latestObservation, null);
  assert.equal(read(() => M.describe(field, 2025)).latestObservation, null);
});
test("active assignment uses snapshot names; inactive history is kept separate", () => {
  const model = read(() => M.describe(field, 2026));
  assert.equal(model.currentProgram.assignmentId, "current"); assert.equal(model.currentProgram.name, "保存した体系名");
  assert.equal(model.currentProgram.steps[0].materialName, "当時の薬剤A");
  assert.equal(model.previousPrograms.length, 1); assert.equal(model.previousPrograms[0].name, "変更前の体系");
  assert(!M.renderDetail(field, 2026, { tab: "result" }).includes("改名後の体系"));
});
test("only explicitly linked actual past work checks a step; no inferred planned-work links", () => {
  const program = read(() => M.describe(field, 2026)).currentProgram;
  assert.equal(program.recordedCount, 1); assert.equal(program.unrecordedCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(program.steps[0].works.map(w => w.workId))), ["linked", "prior"]);
  assert.equal(program.steps[1].recorded, false);
  const html = M.renderDetail(field, 2026, { tab: "result" });
  assert(html.includes("実績未記録")); assert(!html.includes("未実施"));
});
test("latest saved observation stays exact, scoped, and independent of work counts", () => {
  const model = read(() => M.describe(field, "2026"));
  assert.equal(model.latestObservation.observationId, "latest"); assert.equal(model.latestObservation.status, "一部残草");
  assert.equal(model.latestObservation.weeds, "ヒエ・ホタルイ"); assert.equal(model.memo, "<script>saved</script>\n翌年への記録");
  assert.equal(model.observations.length, 3);
  for (const html of [M.renderEntry(field, 2026), M.renderDetail(field, 2026, { tab: "result" })]) {
    assert(html.includes("一部残草")); assert(!html.includes("残草少なめ")); assert(!html.includes("<script>")); assert(html.includes("&lt;script&gt;"));
  }
});
test("material counts use field/crop-year actual work, not quantity or cost allocation", () => {
  const model = read(() => M.describe(field, 2026)); assert.equal(model.materialCount, 1);
  const group = model.materials[0]; assert.equal(group.count, 3); assert.equal(group.name, "使用時の資材名");
  assert.deepEqual(JSON.parse(JSON.stringify(group.works.map(w => w.workId))), ["linked", "unlinked", "old-step"]);
  assert(!Object.hasOwn(group, "quantity")); assert(!Object.hasOwn(group, "cost"));
});
test("entry and result preview expose controller commands without event bindings", () => {
  const entry = read(() => M.renderEntry(field, 2026)); const detail = read(() => M.renderDetail(field, 2026, { tab: "result" }));
  for (const label of ["資材・除草の振り返り", "今年の体系", "使用資材", "最新の効果確認", "来年へのメモ"]) assert(entry.includes(label));
  assert(entry.includes("data-mr-open")); assert(entry.includes("materials-rice.png")); assert(detail.includes("rice-weeds.png"));
  assert(detail.includes("data-mr-back")); assert(detail.includes('data-mr-edit-observation="current" data-observation-id="latest"'));
  assert(detail.includes('data-mr-delete-observation="first"')); assert(detail.includes('data-mr-tab="program"')); assert(detail.includes('data-mr-tab="materials"'));
  assert(detail.includes("観察日")); assert(!detail.includes("残った場所")); assert(detail.includes('<details class="mr-history">'));
  assert(!detail.includes("data-mr-observation-form"), "Result view must not contain an editor");
});
test("returned DTO cannot mutate source snapshots or memos", () => {
  const model = read(() => M.describe(field, 2026)); model.currentProgram.steps[0].category = "changed";
  model.latestObservation.memo = "changed"; model.materials[0].works.pop();
  assert.equal(M.describe(field, 2026).currentProgram.steps[0].category, "初期剤");
  assert.equal(M.describe(field, 2026).latestObservation.memo, "<script>saved</script>\n翌年への記録");
});
test("all saved status choices remain literal, never inferred from weeds or linked steps", () => {
  const latest = S.data().meta.herbicideObservations.find(item => item.observationId === "latest");
  const original = latest.status;
  for (const status of ["経過観察中", "良好", "一部残草", "追加対応あり"]) {
    latest.status = status;
    assert.equal(read(() => M.describe(field, 2026)).latestObservation.status, status);
    assert(read(() => M.renderDetail(field, 2026, { tab: "result" })).includes(`<h4 class="mr-result-status">${status}</h4>`));
  }
  latest.status = original;
});
test("program tab renders saved plans, scoped linked work, and folded inactive history", () => {
  const html = read(() => M.renderDetail(field, 2026, { tab: "program" }));
  assert(html.includes('data-mr-view="program"')); assert(html.includes('data-mr-tab="program" aria-current="page"'));
  for (const saved of ["保存した体系名", "当時の薬剤A", "当時の薬剤B", "田植え後", "保存した目的"]) assert(html.includes(saved));
  assert(html.includes('data-annual-record-open-kind="fieldWork" data-annual-record-open-id="linked" data-annual-record-open-label="除草剤"'));
  assert(!html.includes('data-annual-record-open-id="unlinked"')); assert(!html.includes('data-annual-record-open-id="future"'));
  assert(html.includes('data-annual-record-open-id="prior"')); assert(!html.includes('data-annual-record-open-id="planned"'));
  assert(html.includes('<details class="mr-previous-programs"><summary>変更前の計画'));
  assert(html.includes('data-mr-new-observation="current"')); assert(html.includes('data-mr-new-observation="old"'));
  assert(html.includes('data-mr-edit-observation="old" data-observation-id="old-observation"'));
  assert(html.includes("data-mr-management")); assert(html.includes("実績未記録")); assert(!html.includes("未実施"));
});
test("materials tab keeps unlinked actual materials, saved names, usage dates and work crop years", () => {
  const html = read(() => M.renderDetail(field, 2026, { tab: "materials" }));
  assert(html.includes('data-mr-view="materials"')); assert(html.includes('<details class="mr-material-group">'));
  assert(html.includes("使用時の資材名")); assert(!html.includes("改名後のマスター資材"));
  assert(html.includes("使用日")); assert(html.includes("使用記録 3件")); assert(html.includes("2026年産"));
  for (const id of ["linked", "unlinked", "old-step"]) assert(html.includes(`data-annual-record-open-id="${id}"`));
  for (const id of ["future", "prior", "planned", "other-field"]) assert(!html.includes(`data-annual-record-open-id="${id}"`));
  assert(html.includes('data-mr-material-master="m"'));
  const materials = S.data().materials; S.data().materials = [];
  try {
    const deleted = read(() => M.renderDetail(field, 2026, { tab: "materials" }));
    assert(deleted.includes("使用時の資材名")); assert(!deleted.includes("data-mr-material-master"));
  } finally { S.data().materials = materials; }
});
test("editor is separate, uses only mr form attributes, and preserves original observation fields", () => {
  const editor = { assignmentId: "current", observationId: "latest", error: "<script>error</script>", originalMetadata: { keep: true } };
  const before = JSON.stringify(editor);
  const html = read(() => M.renderDetail(field, 2026, { tab: "materials", editor }));
  assert(html.includes('data-mr-view="editor"')); assert(!html.includes('class="mr-tabs"')); assert(!html.includes('class="mr-result"'));
  assert(html.includes('data-mr-observation-form data-assignment-id="current" data-observation-id="latest" data-field-id="a" data-year="2026"'));
  for (const key of ["date", "status", "weeds", "memo"]) assert(html.includes(`name="${key}"`));
  assert(html.includes('value="2026-09-12"')); assert(html.includes('value="ヒエ・ホタルイ"'));
  assert(html.includes('value="一部残草" selected')); assert(html.includes("&lt;script&gt;saved&lt;/script&gt;\n翌年への記録"));
  assert(html.includes("&lt;script&gt;error&lt;/script&gt;")); assert(!html.includes("<script>"));
  assert(html.includes("data-mr-cancel-editor")); assert(html.includes('type="submit"'));
  assert(!html.includes("data-h-")); assert.equal(JSON.stringify(editor), before);
});
test("unknown stored status, array weeds and empty edits survive without inferred replacements", () => {
  const latest = S.data().meta.herbicideObservations.find(item => item.observationId === "latest"), original = latest.status;
  latest.status = '旧評価<script>保存</script>';
  try {
    const dto = read(() => M.describe(field, 2026));
    assert.deepEqual(JSON.parse(JSON.stringify(dto.latestObservation.weedsRaw)), ["ヒエ", "ホタルイ"]);
    dto.latestObservation.weedsRaw.push("not saved"); assert.equal(latest.weeds.length, 2);
    const html = read(() => M.renderDetail(field, 2026, { editor: { assignmentId: "current", observationId: "latest", weeds: ["コナギ", "ヒエ"], memo: "" } }));
    assert(html.includes('value="旧評価&lt;script&gt;保存&lt;/script&gt;" selected'));
    assert(html.includes('value="コナギ・ヒエ"')); assert(html.includes('<textarea name="memo" rows="6"></textarea>'));
    assert(!html.includes("<script>"));
  } finally { latest.status = original; }
});
test("editor rejects cross-field/year/assignment IDs and supports scoped new observations", () => {
  for (const editor of [{ assignmentId: "other-field" }, { assignmentId: "other-year" }, { assignmentId: "missing" },
    { assignmentId: "old", observationId: "latest" }, { assignmentId: "current", observationId: "wrong-field" }]) {
    const html = read(() => M.renderDetail(field, 2026, { editor }));
    assert(!html.includes("data-mr-observation-form")); assert(html.includes('role="alert"')); assert(html.includes("data-mr-cancel-editor"));
  }
  const html = read(() => M.renderDetail(field, 2026, { editor: { assignmentId: "current", date: "2026-09-30", status: "経過観察中", weeds: [], memo: "" } }));
  assert(html.includes('data-observation-id=""')); assert(html.includes('value="2026-09-30"'));
  const old = read(() => M.renderDetail(field, 2026, { editor: { assignmentId: "old", observationId: "old-observation" } }));
  assert(old.includes("変更前の計画")); assert(old.includes('data-assignment-id="old"')); assert(old.includes("変更前の観察"));
});
test("new-observation command stays on active plan even when latest result belongs to an old plan", () => {
  const old = S.data().meta.herbicideObservations.find(item => item.observationId === "old-observation"), original = old.date;
  old.date = "2026-09-30";
  try {
    const entry = read(() => M.renderEntry(field, 2026)), html = read(() => M.renderDetail(field, 2026, { tab: "result" }));
    assert(entry.includes("変更前の計画：変更前の体系")); assert(html.includes("変更前の計画：変更前の体系"));
    assert(html.includes('data-mr-edit-observation="old" data-observation-id="old-observation"'));
    assert(html.includes('data-mr-new-observation="current"'));
  } finally { old.date = original; }
});
test("empty scoped views expose management without fabricating results or assignments", () => {
  for (const tab of ["result", "program", "materials"]) {
    const html = read(() => M.renderDetail(field, 2024, { tab }));
    assert(html.includes(`data-mr-view="${tab}"`)); assert(!html.includes("data-mr-new-observation"));
    assert(!html.includes("一部残草")); assert(!html.includes('data-annual-record-open-id="linked"'));
    if (tab !== "materials") assert(html.includes("data-mr-management"));
  }
});
test("step strips accommodate arbitrary plan counts and long snapshot text", () => {
  const program = S.data().meta.herbicideAssignments.find(item => item.assignmentId === "current"), original = program.steps;
  for (const count of [1, 3, 5, 8]) {
    program.steps = Array.from({ length: count }, (_, index) => step(`many-${index}`, "長い工程名と保存された計画区分", "保存薬剤名"));
    const html = read(() => M.renderDetail(field, 2026, { tab: "result" }));
    assert.equal((html.match(/class="mr-step(?: mr-step-recorded)?"/g) || []).length, count);
  }
  program.steps = original;
  const css = fs.readFileSync(path.resolve(__dirname, "../assets/css/material-review.css"), "utf8");
  assert(/\.mr-step-strip\s*\{[^}]*repeat\(auto-fit/.test(css));
});
function compatibilityFixture(records = []) {
  const storage = new Map(); let writeCount = 0, locked = false;
  const context = vm.createContext({ console, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {}, fetch: fail,
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: fail },
    localStorage: { getItem: key => storage.get(key) || null,
      setItem(key, value) { if (locked) fail(); writeCount++; storage.set(key, String(value)); }, removeItem: fail } });
  context.window = context;
  for (const file of ["core/utils.js", "core/schema.js", "core/storage.js", "core/state.js", "core/herbicide.js", "ui/material-review.js"]) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js", file), "utf8"), context, { filename: file });
  }
  const Q = context.RiceOS;
  Q.utils.today = () => "2027-10-01"; Q.utils.now = () => "2027-10-01T00:00:00Z";
  const fixture = R.utils.clone(S.data()); fixture.fieldWorks = records; fixture.meta.activeCropYear = 2026;
  assert(Q.state.replace(Q.schema.normalize(fixture)));
  const bytes = () => JSON.stringify([Q.state.data(), [...storage], writeCount]);
  return { Q, bytes, lock() { locked = true; }, read(fn) { const before = bytes(); const result = fn(); assert.equal(bytes(), before); return result; } };
}
test("real accepted legacy calendar-year link remains visible without changing saved crop year or snapshots", () => {
  const f = compatibilityFixture(), { Q } = f;
  const record = work("accepted-legacy", { cropYear: 2025, date: "2026-06-01", memo: "Original legacy memo", herbicidePurpose: "Recorded reason" });
  assert(Q.state.saveFieldWork(record), "Existing calendar-year write contract accepts this record");
  const saved = Q.state.data().fieldWorks.find(item => item.workId === record.workId);
  assert.equal(saved.cropYear, 2025); assert.equal(saved.date, "2026-06-01");
  assert.deepEqual(JSON.parse(JSON.stringify(saved.herbicideLinks)), record.herbicideLinks);
  const original = JSON.stringify(saved); f.lock();
  assert(f.read(() => Q.herbicide.usageForAssignment("current")).steps[0].works.some(item => item.workId === record.workId));
  const model = f.read(() => Q.materialReview.describe(Q.state.field("a"), 2026));
  assert.equal(model.currentProgram.steps[0].works[0].workId, record.workId);
  assert.equal(model.currentProgram.steps[0].works[0].year, "2025");
  assert.equal(model.materialCount, 0, "Materials tab remains canonical crop-year scoped");
  const html = f.read(() => Q.materialReview.renderDetail(Q.state.field("a"), 2026, { tab: "program" }));
  assert(html.includes('data-annual-record-open-id="accepted-legacy"')); assert(html.includes("2025年産 / 2026/6/1"));
  assert.equal(JSON.stringify(Q.state.data().fieldWorks.find(item => item.workId === record.workId)), original);
});
test("imported explicit crop-year link reads across calendar years without enabling new cross-year input", () => {
  const imported = work("imported-cross-calendar", { cropYear: 2026, date: "2027-06-01", memo: "Imported source stays unchanged" });
  const f = compatibilityFixture([imported]), { Q } = f;
  const beforeRejectedSave = f.bytes();
  assert.equal(Q.state.saveFieldWork({ ...imported, workId: "new-cross-calendar" }), null,
    "New input must still respect the unchanged calendar-year assignment validation");
  assert.equal(f.bytes(), beforeRejectedSave); f.lock();
  const model = f.read(() => Q.materialReview.describe(Q.state.field("a"), 2026));
  assert.equal(model.currentProgram.steps[0].works[0].workId, imported.workId);
  assert.equal(model.currentProgram.steps[0].works[0].date, "2027-06-01");
  assert.equal(model.currentProgram.steps[0].works[0].year, "2026");
  assert.equal(model.materials[0].works[0].workId, imported.workId);
  const html = f.read(() => Q.materialReview.renderDetail(Q.state.field("a"), 2026, { tab: "program" }));
  assert(html.includes("2026年産 / 2027/6/1"));
});
test("read compatibility never invents links or includes planned, future, wrong-field or unrelated-year work", () => {
  const records = [
    work("valid-legacy", { cropYear: 2025, date: "2026-06-01" }),
    work("valid-cross", { cropYear: 2026, date: "2027-06-01" }),
    work("unlinked-cross", { cropYear: 2026, date: "2027-06-01", herbicideLinks: [] }),
    work("planned-cross", { cropYear: 2026, date: "2027-06-01", workName: "除草剤予定" }),
    work("future-cross", { cropYear: 2026, date: "2029-06-01" }),
    work("wrong-field-cross", { cropYear: 2026, date: "2027-06-01", fieldIds: ["b"] }),
    work("unrelated-year", { cropYear: 2025, date: "2024-06-01" }),
    work("wrong-step", { herbicideLinks: [{ fieldId: "a", assignmentId: "current", stepId: "unknown" }] }),
    work("wrong-link-field", { herbicideLinks: [{ fieldId: "b", assignmentId: "current", stepId: "s1" }] }),
    work("wrong-assignment", { herbicideLinks: [{ fieldId: "a", assignmentId: "other-year", stepId: "s1" }] })
  ];
  const f = compatibilityFixture(records), { Q } = f; f.lock();
  const model = f.read(() => Q.materialReview.describe(Q.state.field("a"), 2026));
  assert.deepEqual(JSON.parse(JSON.stringify(model.currentProgram.steps[0].works.map(item => item.workId))), ["valid-legacy", "valid-cross"]);
  assert.equal(model.currentProgram.steps[1].recorded, false);
  const otherField = f.read(() => Q.materialReview.describe(Q.state.field("b"), 2026));
  assert.equal(otherField.currentProgram.recordedCount, 0);
  assert.equal(f.read(() => Q.materialReview.describe(Q.state.field("a"), 2025)).currentProgram.recordedCount, 0);
  const html = f.read(() => Q.materialReview.renderDetail(Q.state.field("a"), 2026, { tab: "program" }));
  for (const id of ["unlinked-cross", "planned-cross", "future-cross", "wrong-field-cross", "unrelated-year", "wrong-step", "wrong-link-field", "wrong-assignment"]) {
    assert(!html.includes(`data-annual-record-open-id="${id}"`), id);
  }
});
console.log(`Material review: ${passed} passed; scoped tabs/editor, read compatibility, isolated fixtures, no render writes/fetches/bindings.`);
if (process.argv.includes("--browser")) (async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const root = path.resolve(__dirname, "..");
  try {
    for (const width of [360, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: "block" });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = new URL(route.request().url()), file = path.resolve(root, "." + decodeURIComponent(url.pathname));
        if (url.hostname !== "mr.test" || !file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
        return route.fulfill({ body: fs.readFileSync(file), contentType: path.extname(file) === ".png" ? "image/png" : "text/plain" });
      });
      const styles = fs.readFileSync(path.join(root, "assets/css/app.css"), "utf8") + "\n" + fs.readFileSync(path.join(root, "assets/css/material-review.css"), "utf8");
      for (const view of ["entry", "result", "program", "materials", "editor"]) {
        const html = view === "entry" ? M.renderEntry(field, 2026) : M.renderDetail(field, 2026, view === "editor"
          ? { editor: { assignmentId: "current", observationId: "latest", error: "保存できませんでした。入力内容は保持しています。" } } : { tab: view });
        await page.setContent(`<html lang="ja"><head><meta charset="utf-8"><base href="http://mr.test/"><style>${styles}\nbody{margin:0}#screen-annual{display:block;width:100%;max-width:880px;margin:auto;padding:0}</style></head><body><section id="screen-annual" class="screen active">${html}</section></body></html>`, { waitUntil: "networkidle" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${view} overflow at ${width}px`);
        assert(await page.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0)), `${view} image missing`);
        if (view === "program") { await page.locator(".mr-previous-programs > summary").click(); assert(await page.locator(".mr-previous-programs").getAttribute("open") !== null); }
        if (view === "materials") { await page.locator(".mr-material-group > summary").first().click(); assert(await page.locator(".mr-work-link").first().isVisible()); }
        if (view === "editor") {
          assert.equal(await page.locator('input[name="weeds"]').inputValue(), "ヒエ・ホタルイ");
          assert.equal(await page.locator(".mr-tabs").count(), 0);
        }
        if (process.env.MATERIAL_REVIEW_SHOTS) {
          const file = path.join(process.env.MATERIAL_REVIEW_SHOTS, `material-review-${view}-${width}.png`);
          await page.screenshot({ path: file, fullPage: true }); console.log(file);
        }
      }
      const program = S.data().meta.herbicideAssignments.find(item => item.assignmentId === "current"), original = program.steps;
      try {
        for (const count of [1, 3, 5, 8]) {
          program.steps = Array.from({ length: count }, (_, index) => step(`browser-${index}`, "追加処理", "保存薬剤名"));
          await page.locator("#screen-annual").evaluate((el, html) => { el.innerHTML = html; }, M.renderDetail(field, 2026, { tab: "result" }));
          assert.equal(await page.locator(".mr-step").count(), count);
          assert(await page.locator(".mr-step > span:last-child").evaluateAll(items => items.every(el => el.getBoundingClientRect().width >= 54)), `Step labels too narrow: ${count} at ${width}px`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
      } finally { program.steps = original; }
      assert.deepEqual(errors, []); await page.close(); console.log(`PASS browser material review ${width}px, five views and 1/3/5/8-step strips`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
