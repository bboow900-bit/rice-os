"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
const context = vm.createContext({ console, alert() {}, dispatchEvent() {}, CustomEvent: class {}, navigator: {},
  document: { getElementById: () => null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) } });
context.window = context;
for (const name of ["utils", "schema", "storage", "state", "agro"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,"..",`assets/js/core/${name}.js`),"utf8"),context);
}
const { state, schema, utils: U } = context.RiceOS;
const unchanged = () => JSON.stringify([state.data(), [...memory]]);
const work = () => state.data().fieldWorks.find(r => r.workId === "h");
let today = "2026-09-10";
U.today = () => today;
function reset() {
  assert(state.replace(schema.normalize({ meta: { weatherLocation: { latitude: 35, longitude: 139 } },
    fields: [{ fieldId: "a", name: "A", nextSeasonMemo: "old", seasonNotes: [{ noteId: "reflection", season: "2026", date: "2026-09-01", text: "reflection" }] }, { fieldId: "b", name: "B" }],
    growthLogs: [{ logId: "g", fieldId: "a", date: "2026-09-01", headingObserved: true }],
    fieldWorks: [{ workId: "h", date: "2026-09-10", workName: "\u7a32\u5208\u308a", fieldIds: ["a","b"],
      harvestStatusByField: { a: "complete", b: "complete" }, harvestSnapshots: [
        { fieldId: "a", harvestDate: "2026-09-10", savedAt: "old", thermal: { total: 10, count: "1", expectedDays: "9", status: "\u4e00\u90e8\u6b20\u6e2c" } },
        { fieldId: "b", harvestDate: "2026-09-10", savedAt: "keep", thermal: { total: 999, status: "\u78ba\u5b9a" } }] }] })));
}
async function main() {
  reset();
  const id = state.saveCarryoverNote({ fieldId: "a", season: 2026, text: " carry " });
  assert(id);
  assert.equal(state.seasonNotesForField("a",2026).length,1);
  assert.equal(state.carryoverNoteForField("a",2026).text,"carry");
  assert.equal(state.saveCarryoverNote({ fieldId: "a", season: 2026, text: "edit" }),id);
  assert(state.saveCarryoverNote({ fieldId: "a", season: 2025, text: "past" }));
  const before = unchanged();
  assert.equal(state.saveCarryoverNote({ fieldId: "a", season: 2026, date: "2026-02-30", text: "bad" }),"");
  assert.equal(unchanged(),before);
  assert(state.replace(JSON.parse(JSON.stringify(state.data()))));
  assert.equal(state.carryoverNoteForField("a",2025).text,"past");
  assert.equal(state.field("a").nextSeasonMemo,"old");
  assert(state.deleteSeasonNote(id,"a"));
  assert.equal(state.carryoverNoteForField("a",2026),null);
  assert.equal(state.seasonNotesForField("a",2026)[0].text,"reflection");
  reset();
  const sibling = JSON.stringify(work().harvestSnapshots[1]);
  let calls = 0;
  context.RiceOS.weather = { fetchDailyRange: async (start,end) => {
    calls++; return { total: 200, count: Number(U.daysBetween(start,end))+1, rows: [] };
  } };
  assert.equal((await state.retryHarvestThermal("h","a")).status,"saved");
  assert.equal(JSON.stringify(work().harvestSnapshots[1]),sibling);
  assert.equal((await state.retryHarvestThermal("h","a")).status,"unchanged");
  assert.equal(calls,1);
  today = "2026-09-11";
  assert.equal((await state.retryHarvestThermal("h","a")).status,"saved");
  assert.equal(work().harvestSnapshots[0].thermal.status,"\u78ba\u5b9a");
  assert.equal(calls,2);
  assert.equal((await state.retryHarvestThermal("h","a")).status,"unchanged");
  for (const scenario of ["failure","cancel","edit","heading","delete","partial"]) {
    reset(); let resolve;
    context.RiceOS.weather.fetchDailyRange = () => scenario === "failure" ? Promise.reject(new Error("offline")) : new Promise(r => { resolve = r; });
    const controller = new AbortController();
    const pending = state.retryHarvestThermal("h","a",{ signal: controller.signal });
    if (scenario === "cancel") controller.abort();
    if (scenario === "edit") assert(state.saveFieldWork({ ...work(), memo: "new" }));
    if (scenario === "heading") assert(state.saveGrowthLog({ logId: "g", fieldId: "a", date: "2026-09-02", headingObserved: true }));
    if (scenario === "delete") assert(state.deleteFieldWork("h"));
    const expected = unchanged();
    if (resolve) resolve({ total: 300, count: scenario === "partial" ? 1 : 9, rows: [] });
    assert.notEqual((await pending).status,"saved");
    assert.equal(unchanged(),expected,scenario);
  }
  const source = fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/field-work.js"),"utf8");
  const guard = source.match(/const sameInputSession = (\(\) =>[\s\S]*?);/)[1];
  for (const app of [undefined, {}, { currentScreen: () => "field-work" }, { currentScreen: () => "annual" }]) {
    const c = vm.createContext({ RiceOS: { app }, workFormSession: 1, submittedSession: 1 });
    vm.runInContext(`check = ${guard}`,c);
    assert.equal(c.check(),!app || !app.currentScreen || app.currentScreen() === "field-work");
    c.workFormSession = 2; assert.equal(c.check(),false);
  }
  assert(source.includes("if (!sameInputSession()) return;"));
  assert(source.includes("if (sameInputSession()) resetForm();"));
  console.log("Harvest followup: carryover isolation/roundtrip, thermal retry/provisional/stale/cancel/failure, form session guards PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
