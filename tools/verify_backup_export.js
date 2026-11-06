"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const memory = new Map(), downloads = [];
  let writes = 0, shared = 0, checked = 0;
  const navigator = {};
  const c = vm.createContext({ console, File, Blob, navigator,
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: key => memory.get(key) ?? null, setItem(key, value) { writes++; memory.set(key, value); }, removeItem() { writes++; } } });
  c.window = c;
  for (const name of ["utils", "schema", "storage", "backup-export"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js/core", `${name}.js`), "utf8"), c);
  const R = c.RiceOS, B = R.backupExport;
  R.utils.today = () => "2026-11-06";
  R.utils.now = () => "2026-11-06T03:04:05.678Z";
  R.utils.id = () => "export-fixture";
  R.utils.download = (name, raw, type) => downloads.push({ name, raw, type });
  R.state = { data() { throw Error("Must not read state"); }, save() { throw Error("Must not write state"); } };
  const data = R.schema.normalize({ fields: [{ fieldId: "a", name: "Test field" }], meta: { custom: { keep: true }, lastJsonExportAt: "previous", nextSeasonIdeas: [{ ideaId: "note", text: "Memo < & 日本語", done: false }] }, fieldWorks: [{ workId: "w", date: "2026-10-01", fieldIds: ["a"], workName: "草刈り", memo: "Keep\nnewlines" }] });
  memory.set(R.schema.STORE_KEY, JSON.stringify(data));
  const original = JSON.stringify(data), persisted = JSON.stringify([...memory]);
  const unchanged = () => { assert.equal(JSON.stringify(data), original); assert.equal(JSON.stringify([...memory]), persisted); assert.equal(writes, 0); };

  const file = B.prepare(data);
  assert(file instanceof File);
  assert.equal(file.type, "application/json");
  assert.equal(file.name, "rice_karte_2026-11-06T03-04-05-678Z.json");
  assert.equal(file.lastModified, Date.parse("2026-11-06T03:04:05.678Z"));
  const payload = JSON.parse(await file.text());
  assert.equal(file.size, Buffer.byteLength(await file.text(), "utf8"));
  assert.equal(payload.exportedAt, R.utils.now());
  assert.equal(payload.exportId, "export-fixture");
  assert.equal(payload.meta.lastExportId, payload.exportId);
  assert.equal(payload.meta.lastJsonExportAt, "previous");
  assert.equal(payload.fieldWorks.find(w => w.workId === "w").memo, "Keep\nnewlines");
  assert.equal(payload.meta.custom.keep, true);
  assert.equal(downloads.length, 0); unchanged();
  // Compare the existing explicit download payload, without using it as a share fallback.
  const compatible = R.storage.exportJson(data);
  assert.equal(JSON.stringify(payload), JSON.stringify(compatible));
  assert.equal(downloads.length, 1); unchanged();
  const downloadCount = downloads.length;
  const unavailable = await B.share(data); assert.equal(unavailable.status, "unsupported"); assert(unavailable.message.includes("JSONダウンロード")); unchanged();
  navigator.share = async () => { shared++; };
  assert.equal((await B.share(data)).status, "unsupported"); assert.equal(shared, 0);
  navigator.canShare = request => { checked++; assert(request.files[0] instanceof File); return false; };
  assert.equal((await B.share(data)).status, "unsupported"); assert.equal(shared, 0);
  navigator.canShare = () => "true";
  assert.equal((await B.share(data)).status, "unsupported"); assert.equal(shared, 0);
  navigator.canShare = request => { checked++; assert.equal(request.files.length, 1); return true; };
  let shareRequest;
  navigator.share = async request => { shared++; shareRequest = request; };
  const success = await B.share(data);
  assert.equal(success.status, "shared"); assert(success.message.includes("保存完了は確認できません"));
  assert.equal(JSON.parse(await shareRequest.files[0].text()).exportId, payload.exportId); unchanged();
  navigator.share = async () => { const e = Error("cancel"); e.name = "AbortError"; throw e; };
  assert.equal((await B.share(data)).status, "cancelled"); unchanged();
  for (const name of ["NotAllowedError", "DataError", "TypeError", "UnknownError"]) {
    navigator.share = async () => { const e = Error("private detail"); e.name = name; throw e; };
    const result = await B.share(data); assert.equal(result.status, "error"); assert(!result.message.includes("private detail")); unchanged();
  }
  navigator.canShare = () => { throw Error("capability denied"); };
  assert.equal((await B.share(data)).status, "error"); unchanged();
  navigator.canShare = () => true;
  c.File = undefined;
  assert.throws(() => B.prepare(data), e => e.code === "unsupported");
  assert.equal((await B.share(data)).status, "unsupported"); unchanged();
  c.File = class extends File { constructor(...args) { super(...args); Object.defineProperty(this, "size", { value: B.maxFileBytes + 1 }); } };
  assert.throws(() => B.prepare(data), e => e.code === "too-large");
  assert.equal((await B.share(data)).status, "unsupported"); unchanged();
  c.File = File;
  c.File = class { constructor() { throw Error("File construction failed"); } };
  assert.equal((await B.share(data)).status, "error"); unchanged();
  c.File = File;
  const large = { ...data, meta: { ...data.meta, huge: "x".repeat(B.maxFileBytes) } };
  assert.throws(() => B.prepare(large), e => e.code === "too-large");
  for (const invalid of [null, undefined, [], "json", 1]) {
    assert.throws(() => B.prepare(invalid), e => e.code === "invalid-data");
    assert.equal((await B.share(invalid)).status, "error");
  }
  const circular = {}; circular.self = circular;
  assert.equal((await B.share(circular)).status, "error");
  assert.equal(downloads.length, downloadCount); unchanged();
  assert(checked > 0); assert.equal(shared, 1);
  console.log("backup export PASS: compatible File, native share gating, cancel/error, no fallback, size safety, no state/storage mutation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
