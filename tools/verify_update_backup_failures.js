"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
const app = read("assets/js/app.js");
const start = app.indexOf('    const updateButton =');
const end = app.indexOf('\n    document.addEventListener("click"', start);
assert.ok(start >= 0 && end > start);
const updateBinding = app.slice(start, end);

const invalidHistories = {
  "history-object": "{}",
  "history-null": "null",
  "history-number": "1",
  "history-string": '"history"',
  "history-boolean": "false",
  "history-empty": "",
  "history-corrupt": "{",
  "history-invalid-entry": '[{"raw":"keep"},{"raw":42}]',
  "history-null-entry": '[{"raw":"keep"},null]'
};
for (const mode of ["ok", "write-fail", "read-fail", "missing-storage", "missing-helper", "invalid-helper", "throws", "undefined", "empty", "corrupt", "absent", "cancel", "reload", "history-read-fail", ...Object.keys(invalidHistories), "history-keep", "history-quota", "history-duplicate", "history-empty-array"]) {
  const events = [];
  const memory = new Map();
  let click;
  const context = vm.createContext({
    Blob,
    localStorage: {
      getItem(key) {
        if (mode === "read-fail") throw new Error("Storage unavailable");
        if (mode === "history-read-fail" && key === context.RiceOS.schema.RELEASE_BACKUPS_KEY) throw new Error("History unavailable");
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem(key, value) {
        events.push(`write:${key}`);
        if (mode === "write-fail") throw new Error("Quota exceeded");
        if (mode === "history-quota" && key === context.RiceOS.schema.RELEASE_BACKUPS_KEY && JSON.parse(value).length > 1) throw new Error("Quota exceeded");
        memory.set(key, value);
      }
    },
    document: { querySelector: () => ({ addEventListener(type, fn) { assert.equal(type, "click"); click = fn; } }) },
    confirm: () => mode !== "cancel",
    alert: (message) => events.push(`alert:${message}`),
    location: { reload: () => events.push("reload") }
  });
  context.window = context;
  for (const file of ["utils", "schema", "storage"]) {
    vm.runInContext(read(`assets/js/core/${file}.js`), context);
  }
  const rice = context.RiceOS;
  const schema = rice.schema;
  const raw = JSON.stringify({ appVersion: schema.APP_VERSION, fields: [{ fieldId: "keep" }], meta: { marker: "saved" } });
  if (mode !== "absent") memory.set(schema.STORE_KEY, mode === "corrupt" ? "{" : mode === "empty" ? "" : raw);
  const original = memory.get(schema.STORE_KEY);
  const history = [{ raw: mode === "history-duplicate" ? raw : "older payload", sourceVersion: schema.APP_VERSION }];
  memory.set(schema.BACKUP_KEY, "existing undo snapshot");
  if (mode.startsWith("history-")) memory.set(schema.RELEASE_BACKUPS_KEY,
    Object.hasOwn(invalidHistories, mode) ? invalidHistories[mode] : mode === "history-empty-array" ? "[]" : JSON.stringify(history));
  const originalHistory = memory.get(schema.RELEASE_BACKUPS_KEY);
  const failedHistory = mode === "history-read-fail" || Object.hasOwn(invalidHistories, mode);
  if (failedHistory) {
    const before = Array.from(memory);
    assert.equal(rice.storage.backupBeforeAppUpdate(), false, mode);
    assert.deepEqual(Array.from(memory), before, mode);
    assert.deepEqual(events, [], "Invalid history must not attempt writes");
    assert.equal(rice.storage.releaseBackupInfo().length, mode.includes("-entry") ? 1 : 0, "Display remains tolerant");
    const oldRaw = JSON.stringify({ appVersion: "old-version", fields: [{ fieldId: "keep" }] });
    memory.set(schema.STORE_KEY, oldRaw);
    const oldState = Array.from(memory);
    const loaded = rice.storage.loadData();
    assert.deepEqual(Array.from(memory), oldState, "Load must preserve data and history");
    assert.throws(() => rice.storage.saveData(loaded));
    assert.deepEqual(Array.from(memory), oldState, "Save must preserve data and history");
    assert.deepEqual(events, [], "Load/save must not attempt writes");
    memory.set(schema.STORE_KEY, original);
  }
  rice.pwa = { forceUpdate: () => events.push("update") };
  if (mode === "missing-storage") delete rice.storage;
  if (mode === "missing-helper") delete rice.storage.backupBeforeAppUpdate;
  if (mode === "invalid-helper") rice.storage.backupBeforeAppUpdate = true;
  if (mode === "throws") rice.storage.backupBeforeAppUpdate = () => { throw new Error("Unexpected failure"); };
  if (mode === "undefined") rice.storage.backupBeforeAppUpdate = () => undefined;
  if (mode === "reload") delete rice.pwa;
  vm.runInContext(updateBinding, context);
  assert.doesNotThrow(() => click());
  assert.equal(memory.get(schema.STORE_KEY), original, "Update must not rewrite current data");
  assert.equal(memory.get(schema.BACKUP_KEY), "existing undo snapshot");
  if (failedHistory) assert.equal(memory.get(schema.RELEASE_BACKUPS_KEY), originalHistory);
  const shouldUpdate = ["ok", "absent", "reload", "history-keep", "history-quota", "history-duplicate", "history-empty-array"].includes(mode);
  assert.equal(events.some((event) => event === "update" || event === "reload"), shouldUpdate, mode);
  if (["ok", "reload"].includes(mode)) {
    const backup = JSON.parse(memory.get(schema.RELEASE_BACKUPS_KEY));
    assert.equal(backup[0].raw, raw);
    assert.equal(events[0], `write:${schema.RELEASE_BACKUPS_KEY}`);
    assert.equal(events.at(-1), mode === "reload" ? "reload" : "update");
  } else if (mode === "cancel") {
    assert.deepEqual(events, []);
  } else if (!shouldUpdate) {
    assert.equal(events.filter((event) => event.startsWith("alert:")).length, 1);
    assert.ok(events.at(-1).includes("\u66f4\u65b0\u3092\u4e2d\u6b62"));
  }
  if (["history-keep", "history-quota", "history-empty-array"].includes(mode)) {
    const backup = JSON.parse(memory.get(schema.RELEASE_BACKUPS_KEY));
    assert.equal(backup[0].raw, raw);
    assert.equal(backup.length, mode === "history-keep" ? 2 : 1);
    if (mode === "history-keep") assert.deepEqual(backup.slice(1), history);
    assert.equal(events.filter((event) => event.startsWith("write:")).length, mode === "history-quota" ? 2 : 1);
  }
  if (mode === "history-duplicate") {
    assert.equal(memory.get(schema.RELEASE_BACKUPS_KEY), originalHistory);
    assert.equal(events.some((event) => event.startsWith("write:")), false);
    assert.equal(events.at(-1), "update");
  }
  console.log(`PASS update backup: ${mode}`);
}
