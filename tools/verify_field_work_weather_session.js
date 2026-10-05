"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise,resolve,reject }; }
function fixture() {
  const nodes = new Map(), timers = new Map();
  let timerId = 0, selected = ["a"], writes = 0, notices = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id,{ value: "", textContent: "", dataset: {}, options: [], handlers: {},
      addEventListener(type,fn,capture) { (this.handlers[type] ||= []).push({ fn,capture }); },
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute() {}, removeAttribute() {}, scrollIntoView() {}, focus() {}, closest: () => ({ hidden: false }),
      parentElement: { hidden: false }, querySelector: () => null, querySelectorAll: () => [], insertAdjacentHTML() {} });
    return nodes.get(id);
  };
  const location = { latitude: 35, longitude: 139, label: "A", source: "manual", updatedAt: "old" };
  const data = { meta: { weatherLocation: location }, fields: ["a","b"].map(fieldId => ({ fieldId,name:fieldId,varietyId: "v" })),
    materials: [], fieldWorks: ["A","B"].map((workId,i) => ({ workId,date: "2026-09-10",workName: "\u8349\u5208\u308a",fieldIds: [i ? "b" : "a"],weather: workId,weatherAuto: { source: workId,summary: workId } })) };
  const state = { data: () => data, field: id => data.fields.find(f => f.fieldId === id),
    activeFields: () => data.fields.slice(), fields: () => data.fields.slice(), variety: () => ({ varietyId: "v",name: "V" }),
    groupedFields: () => [], groupForField: () => null, updateWeatherLocation(value) { writes++; data.meta.weatherLocation = value; } };
  const context = vm.createContext({ console, alert: () => { notices++; }, navigator: {},
    setTimeout: fn => { const id = ++timerId; timers.set(id,fn); return id; }, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: node, querySelector: node,
      querySelectorAll(selector) {
        if (selector === "#fwFields .select-card.selected") return selected.map(id => ({ dataset: { id } }));
        return [];
      } }, RiceOS: { state, app: { currentScreen: () => "field-work" } }, scrollTo() {} });
  context.window = context;
  for (const name of ["utils","schema"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../assets/js/core/${name}.js`),"utf8"),context);
  context.RiceOS.utils.toast = () => { notices++; };
  context.RiceOS.utils.setOptions = (el,values,value) => { el.value = value || ""; el.options = values.map(v => ({ value: typeof v === "string" ? v : v.value })); };
  const weatherRequests = [], locationRequests = [];
  context.RiceOS.weather = { ensureLocation: async () => {
    const request = locationRequests.shift(); return request ? request.promise : data.meta.weatherLocation;
  }, fetchDaily: (date,where) => { const request = deferred(); weatherRequests.push({ ...request,date,where }); return request.promise; } };
  const code = fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/field-work.js"),"utf8")
    .replace("  RiceOS.screens = RiceOS.screens || {};", "  window.__weatherTest = { fetchWorkWeather, invalidateWorkWeather };\n  RiceOS.screens = RiceOS.screens || {};");
  vm.runInContext(code,context);
  node("fwDate").value = "2026-09-10";
  node("fwTargetScope").value = "field";
  return { context,node,data,timers,weatherRequests,locationRequests,
    api: context.__weatherTest, screen: context.RiceOS.screens.fieldWork,
    select: ids => { selected = ids; }, counts: () => ({ writes,notices }) };
}
const tick = async () => { for (let i=0;i<5;i++) await Promise.resolve(); };
async function main() {
  for (const mode of ["edit","prefill","reset","date","fields","location","scope","manual","screen","error"]) {
    const f = fixture(); f.screen.editWork("A");
    const pending = f.api.fetchWorkWeather(true); await tick();
    assert.equal(f.weatherRequests.length,1);
    if (mode === "edit" || mode === "error") f.screen.editWork("B");
    if (mode === "prefill") f.screen.prefillFields("2026-09-10",["b"]);
    if (mode === "reset") f.screen.resetForm();
    if (mode === "date") f.node("fwDate").value = "2026-09-11";
    if (mode === "fields") f.select(["b"]);
    if (mode === "location") f.data.meta.weatherLocation = { ...f.data.meta.weatherLocation,longitude: 140 };
    if (mode === "scope") f.node("fwTargetScope").value = "offField";
    if (mode === "manual") f.node("fwWeather").value = "manual";
    if (mode === "screen") f.context.RiceOS.app.currentScreen = () => "annual";
    const before = [f.node("fwWeather").value,f.node("fwWeatherAutoJson").value];
    if (mode === "error") f.weatherRequests[0].reject(Error("stale error"));
    else f.weatherRequests[0].resolve({ summary: "stale A",source: "test" });
    assert.equal(await pending,null,mode);
    assert.deepEqual([f.node("fwWeather").value,f.node("fwWeatherAutoJson").value],before,mode);
    assert(!f.node("fwWeatherStatus").textContent.includes("\u53d6\u5f97\u4e2d"),mode);
    assert.deepEqual(f.counts(),{ writes: 0,notices: 0 });
    assert.equal(f.timers.size,0);
  }
  // Same day/fields/ID after a fresh edit is still a distinct session.
  {
    const f = fixture(); f.screen.editWork("A");
    const pending = f.api.fetchWorkWeather(false); await tick(); f.screen.editWork("A");
    f.weatherRequests[0].resolve({ summary: "stale",source: "test" });
    assert.equal(await pending,null); assert.equal(f.node("fwWeather").value,"A");
  }
  // A late response must not clear B's active loading status or overwrite B.
  {
    const f = fixture(); f.screen.editWork("A");
    const a = f.api.fetchWorkWeather(false); await tick(); f.screen.editWork("B");
    const b = f.api.fetchWorkWeather(false); await tick();
    const loading = f.node("fwWeatherStatus").textContent;
    f.weatherRequests[0].resolve({ summary: "A stale",source: "test" }); assert.equal(await a,null);
    assert.equal(f.node("fwWeatherStatus").textContent,loading);
    f.weatherRequests[1].resolve({ summary: "B fresh",source: "test" }); assert(await b);
    assert.equal(f.node("fwWeather").value,"B fresh"); assert.equal(f.timers.size,0);
  }
  {
    const f = fixture(); const position = deferred(); f.locationRequests.push(position);
    f.screen.editWork("A"); const pending = f.api.fetchWorkWeather(false); await tick();
    f.screen.editWork("B"); position.resolve(f.data.meta.weatherLocation);
    assert.equal(await pending,null); assert.equal(f.weatherRequests.length,0);
  }
  {
    const f = fixture(); f.screen.editWork("A"); const pending = f.api.fetchWorkWeather(false); await tick();
    [...f.timers.values()][0](); assert.equal(await pending,null);
    assert(!f.node("fwWeatherStatus").textContent.includes("\u53d6\u5f97\u4e2d"));
    f.weatherRequests[0].resolve({ summary: "late timeout",source: "test" }); await tick();
    assert.equal(f.node("fwWeather").value,"A"); assert.equal(f.timers.size,0);
  }
  // Production capture listeners cancel edits before date-change auto fetch starts.
  {
    const f = fixture(); f.screen.bind(); f.screen.editWork("A");
    const old = f.api.fetchWorkWeather(false); await tick();
    f.node("fwDate").value = "2026-09-11";
    const formChange = f.node("fieldWorkForm").handlers.change.find(handler => handler.capture);
    assert(formChange);
    formChange.fn({ target: f.node("fwDate") });
    f.node("fwDate").handlers.change[0].fn(); await tick();
    const activeLoading = f.node("fwWeatherStatus").textContent;
    f.weatherRequests[0].resolve({ summary: "old date",source: "test" }); assert.equal(await old,null);
    assert.equal(f.node("fwWeatherStatus").textContent,activeLoading);
    f.weatherRequests[1].resolve({ summary: "new date",source: "test" }); await tick();
    assert.equal(f.node("fwWeather").value,"new date");
    const manual = f.api.fetchWorkWeather(false); await tick();
    f.node("fwWeather").value = "manual wins";
    f.node("fieldWorkForm").handlers.input.find(handler => handler.capture).fn();
    f.weatherRequests[2].resolve({ summary: "auto loses",source: "test" }); assert.equal(await manual,null);
    assert.equal(f.node("fwWeather").value,"manual wins"); assert.equal(f.timers.size,0);
  }
  // Real ensureLocation + state/schema persistence must match both location shapes.
  for (const mode of ["existing","geolocation"]) {
    const f = fixture(), c = f.context, memory = new Map();
    const initial = c.RiceOS.schema.normalize({ ...f.data,
      meta: { weatherLocation: mode === "existing" ? f.data.meta.weatherLocation : null } });
    memory.set(c.RiceOS.schema.STORE_KEY,JSON.stringify(initial));
    c.localStorage = { getItem: key => memory.get(key) || null, setItem: (key,value) => memory.set(key,String(value)), removeItem: key => memory.delete(key) };
    c.Blob = Blob; c.dispatchEvent = () => {}; c.CustomEvent = class {};
    let positions = 0;
    c.navigator.geolocation = { getCurrentPosition(success) {
      positions++; success({ coords: { latitude: 36.123456,longitude: 140.654321,accuracy: 15 } });
    } };
    for (const name of ["storage","state","weather"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../assets/js/core/${name}.js`),"utf8"),c);
    let usedLocation;
    c.RiceOS.weather.fetchDaily = async (date,location) => {
      assert.equal(date,"2026-09-10"); usedLocation = location;
      return { summary: `${mode} normal`,source: "test" };
    };
    const code = fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/field-work.js"),"utf8")
      .replace("  RiceOS.screens = RiceOS.screens || {};", "  window.__weatherTest = { fetchWorkWeather };\n  RiceOS.screens = RiceOS.screens || {};");
    vm.runInContext(code,c);
    c.RiceOS.screens.fieldWork.editWork("A");
    assert(await c.__weatherTest.fetchWorkWeather(false),mode);
    assert.equal(f.node("fwWeather").value,`${mode} normal`);
    const persisted = c.RiceOS.state.data().meta.weatherLocation;
    for (const key of ["latitude","longitude","label","source","updatedAt"]) assert.equal(usedLocation[key],persisted[key],`${mode}/${key}`);
    assert.equal(positions,mode === "existing" ? 0 : 1);
    assert.equal(f.timers.size,0);
  }
  console.log("Field-work weather: edit/session/date/field/location/scope/manual guards, stale errors, overlap, position wait, timeout, no writes PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
