"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(memory = new Map()) {
  const writes = [];
  const faults = { read: "", write: "" };
  const context = vm.createContext({ console, Blob, navigator: {}, alert() {}, dispatchEvent() {}, CustomEvent: class {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    localStorage: {
      getItem(key) { if (key === faults.read) throw Error("read failure"); return memory.has(key) ? memory.get(key) : null; },
      setItem(key,value) { if (key === faults.write) throw Error("write failure"); writes.push(key); memory.set(key,String(value)); },
      removeItem: key => memory.delete(key)
    } });
  context.window = context;
  const load = name => vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../assets/js/core/${name}.js`),"utf8"),context);
  for (const name of ["utils","schema","storage"]) load(name);
  const { schema: S, storage } = context.RiceOS;
  const seed = () => {
    const data = S.normalize({ fields: [{ fieldId: "a", name: "Actual field" }], shipments: [{ shipmentId: "s", date: "2026-09-01", quantity: "30", memo: "retain" }] });
    data.appVersion = S.APP_VERSION;
    memory.set(S.STORE_KEY,JSON.stringify(data));
    return data;
  };
  return { memory, writes, faults, context, load, S, storage, seed };
}
const dump = f => JSON.stringify([...f.memory]);
for (const readTarget of ["primary","backup","legacy"]) {
  const f = fixture();
  if (readTarget === "primary") f.seed();
  f.faults.read = readTarget === "primary" ? f.S.STORE_KEY : readTarget === "backup" ? f.S.BACKUP_KEY : f.S.LEGACY_STORES[0];
  const before = dump(f);
  assert.throws(() => f.storage.loadData(),/\u8aad\u307f\u53d6\u308c\u307e\u305b\u3093/);
  assert.equal(dump(f),before);
  assert.equal(f.writes.length,0);
}
for (const operation of ["saveData","replaceData","importJsonText"]) {
  for (const fault of ["read","backup"]) {
    const f = fixture(); f.seed();
    f.memory.set(f.S.BACKUP_KEY,"previous-backup");
    f.memory.set(f.S.RELEASE_BACKUPS_KEY,"[]");
    f.faults[fault === "read" ? "read" : "write"] = fault === "read" ? f.S.STORE_KEY : f.S.BACKUP_KEY;
    const before = dump(f);
    const input = f.S.emptyData();
    assert.throws(() => f.storage[operation](operation === "importJsonText" ? JSON.stringify(input) : input));
    assert.equal(dump(f),before,`${operation}/${fault}`);
    assert.equal(f.writes.length,0);
    assert.equal(f.context.__riceMemoryData,undefined);
  }
}
// State's existing failure contract keeps the live cache when storage aborts.
{
  const f = fixture(); f.seed(); f.load("state");
  const before = JSON.stringify(f.context.RiceOS.state.data());
  const stored = dump(f);
  f.faults.write = f.S.BACKUP_KEY;
  assert.equal(f.context.RiceOS.state.replace(f.S.emptyData()),null);
  assert.equal(JSON.stringify(f.context.RiceOS.state.data()),before);
  assert.equal(dump(f),stored);
}
// First boot, normal save, replace and restore still retain the raw predecessor.
{
  const f = fixture();
  const initial = f.storage.loadData();
  assert.equal(initial.fields.length,7);
  assert(f.memory.has(f.S.STORE_KEY));
  let previous = f.memory.get(f.S.STORE_KEY);
  const saved = f.storage.saveData(f.S.normalize({ ...initial, fields: [{ fieldId: "a", name: "A" }] }));
  assert.equal(f.memory.get(f.S.BACKUP_KEY),previous);
  previous = f.memory.get(f.S.STORE_KEY);
  f.storage.replaceData(f.S.emptyData());
  assert.equal(f.memory.get(f.S.BACKUP_KEY),previous);
  const replacedRaw = f.memory.get(f.S.STORE_KEY);
  const restored = f.storage.restoreBackup();
  assert.equal(restored.fields.find(row => row.fieldId === "a").name,"A");
  assert.equal(f.memory.get(f.S.BACKUP_KEY),replacedRaw);
  assert(saved);
}
// Migration does not overwrite the predecessor if its backup cannot be written.
{
  const f = fixture(); const old = f.seed(); old.schemaVersion = 0;
  f.memory.set(f.S.STORE_KEY,JSON.stringify(old));
  const before = dump(f); f.faults.write = f.S.BACKUP_KEY;
  const loaded = f.storage.loadData();
  assert.equal(loaded.fields.find(row => row.fieldId === "a").name,"Actual field");
  assert.equal(dump(f),before);
}
// Recovery must retain the usable backup even if the primary write fails.
for (const mode of ["saveData","replaceData","importJsonText","restoreBackup"]) {
  const f = fixture(); f.seed();
  const goodRaw = f.memory.get(f.S.STORE_KEY);
  f.memory.set(f.S.BACKUP_KEY,goodRaw);
  f.memory.set(f.S.STORE_KEY,"{broken");
  f.load("state");
  const recovered = f.context.RiceOS.state.data();
  assert.equal(recovered.shipments[0].shipmentId,"s");
  const before = dump(f);
  const cacheBefore = JSON.stringify(recovered);
  f.faults.write = f.S.STORE_KEY;
  assert.throws(() => f.storage[mode](mode === "importJsonText" ? JSON.stringify(recovered) : recovered),mode);
  assert.equal(dump(f),before,mode);
  assert.equal(f.memory.get(f.S.BACKUP_KEY),goodRaw,mode);
  assert.equal(JSON.stringify(f.context.RiceOS.state.data()),cacheBefore,mode);
  assert.equal(f.writes.length,0,mode);
  f.faults.write = "";
  assert(f.storage[mode](mode === "importJsonText" ? JSON.stringify(recovered) : recovered),mode);
  assert.equal(f.memory.get(f.S.BACKUP_KEY),goodRaw,mode);
  assert.equal(JSON.parse(f.memory.get(f.S.STORE_KEY)).shipments[0].shipmentId,"s");
  const reopened = fixture(f.memory);
  assert.equal(reopened.storage.loadData().shipments[0].shipmentId,"s");
}
{
  const f = fixture(); f.seed();
  const goodRaw = f.memory.get(f.S.STORE_KEY);
  f.memory.set(f.S.BACKUP_KEY,goodRaw); f.memory.set(f.S.STORE_KEY,"{broken");
  f.load("state");
  const before = dump(f), cacheBefore = JSON.stringify(f.context.RiceOS.state.data());
  f.faults.write = f.S.STORE_KEY;
  assert.equal(f.context.RiceOS.state.replace(f.S.emptyData()),null);
  assert.equal(dump(f),before);
  assert.equal(JSON.stringify(f.context.RiceOS.state.data()),cacheBefore);
}
// Two contexts share a store but retain independent state caches and baselines.
{
  const a = fixture(); a.seed(); a.load("state");
  const b = fixture(a.memory); b.load("state");
  const stale = JSON.stringify(b.context.RiceOS.state.data());
  assert(a.context.RiceOS.state.saveSeasonNote({ fieldId: "a", season: 2026, date: "2026-09-10", text: "A new note" }));
  const before = dump(a);
  const writeCount = b.writes.length;
  assert.equal(b.context.RiceOS.state.saveSeasonNote({ fieldId: "a", season: 2026, date: "2026-09-11", text: "B stale note" }),"");
  assert.equal(dump(a),before);
  assert.equal(b.writes.length,writeCount);
  assert.equal(JSON.stringify(b.context.RiceOS.state.data()),stale);
  assert.match(b.context.RiceOS.state.lastSaveError().message,/\u518d\u8aad\u307f\u8fbc\u307f/);
  b.load("state");
  assert(b.context.RiceOS.state.saveSeasonNote({ fieldId: "a", season: 2026, date: "2026-09-11", text: "B fresh note" }));
  assert.equal(JSON.parse(a.memory.get(a.S.STORE_KEY)).fields.find(row => row.fieldId === "a").seasonNotes.length,2);
}
for (const operation of ["saveData","replaceData","importJsonText","restoreBackup"]) {
  const a = fixture(); const initial = a.seed(); a.storage.loadData();
  const b = fixture(a.memory); b.storage.loadData();
  a.storage.saveData({ ...initial, workers: ["A"] });
  const before = dump(a);
  assert.throws(() => b.storage[operation](operation === "importJsonText" ? JSON.stringify(initial) : initial),/\u5225\u306e\u30bf\u30d6/);
  assert.equal(dump(a),before,operation);
  assert.equal(b.writes.length,0,operation);
}
// Removing/replacing the store externally must also reject an observed cache.
{
  const f = fixture(); const initial = f.seed(); f.storage.loadData();
  f.memory.delete(f.S.STORE_KEY);
  const before = dump(f);
  assert.throws(() => f.storage.saveData(initial));
  assert.equal(dump(f),before);
}
// Migration and legacy initialization must observe their own newly-written raw.
for (const mode of ["migration","legacy","backup-fallback","initial-write-failure","save-write-failure"]) {
  const f = fixture();
  if (mode === "migration") {
    const old = f.seed(); old.appVersion = "old-release";
    f.memory.set(f.S.STORE_KEY,JSON.stringify(old));
  } else if (mode === "legacy") {
    f.memory.set(f.S.LEGACY_STORES[0],JSON.stringify({ fields: [{ fieldId: "a", name: "A" }] }));
  } else if (mode === "backup-fallback") {
    f.memory.set(f.S.BACKUP_KEY,JSON.stringify(f.S.normalize({ fields: [{ fieldId: "a", name: "A" }] })));
  } else if (mode === "initial-write-failure") f.faults.write = f.S.STORE_KEY;
  const loaded = f.storage.loadData();
  f.faults.write = mode === "save-write-failure" ? f.S.STORE_KEY : "";
  if (mode === "save-write-failure") {
    assert.throws(() => f.storage.saveData(loaded));
    f.faults.write = "";
  }
  assert(f.storage.saveData(loaded),mode);
  assert(f.storage.replaceData(loaded),mode);
}
console.log("Storage protection: read/backup failures, stale-tab rejection, cache retention, reload/save/replace/import/restore/migration PASS");
