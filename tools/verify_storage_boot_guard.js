"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const guard = html.match(/<script id="storageBootGuard">([\s\S]*?)<\/script>/)[1];
assert(html.indexOf('id="storageBootGuard"') > html.indexOf('src="assets/js/core/state.js'));
assert(html.indexOf('id="storageBootGuard"') < html.indexOf('src="assets/js/app.js'));
assert(html.includes('id="storageBootFailure" hidden role="alert"'));
function fixture(state) {
  const listeners = {};
  let reloaded = 0, focused = 0;
  const button = { addEventListener: (type,fn) => { button[type] = fn; }, focus: () => { focused++; } };
  const shell = { tagName: "DIV", hidden: false, inert: false };
  const panel = { hidden: true, contains: target => target === button };
  const context = vm.createContext({ console, RiceOS: { state }, location: { reload: () => { reloaded++; } },
    addEventListener: (type,fn,capture) => { (listeners[type] ||= []).push({ fn,capture }); },
    document: { getElementById: id => id === "storageBootFailure" ? panel : button, body: { children: [shell,panel,{ tagName: "SCRIPT" }] } } });
  context.window = context;
  return { context, listeners, shell, panel, button, counts: () => ({ reloaded,focused }) };
}
{
  const f = fixture({ data() {} }); vm.runInContext(guard,f.context);
  assert.equal(f.panel.hidden,true); assert.equal(f.shell.hidden,false);
  assert.deepEqual(Object.keys(f.listeners),[]);
}
{
  const f = fixture(); const memory = new Map(); let writes = 0;
  f.context.navigator = {};
  f.context.localStorage = { getItem: key => {
    if (key === f.context.RiceOS.schema.STORE_KEY) throw Error("private payload must never appear in UI");
    return memory.get(key) || null;
  }, setItem: () => { writes++; } };
  for (const name of ["utils","schema","storage"]) vm.runInContext(fs.readFileSync(path.resolve(__dirname,`../assets/js/core/${name}.js`),"utf8"),f.context);
  assert.throws(() => vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../assets/js/core/state.js"),"utf8"),f.context));
  vm.runInContext(guard,f.context);
  assert.equal(writes,0);
  assert.equal(f.panel.hidden,false); assert.equal(f.shell.hidden,true); assert.equal(f.shell.inert,true);
  let stopped = false, prevented = false;
  f.listeners.DOMContentLoaded[0].fn({ stopImmediatePropagation: () => { stopped = true; } });
  assert(stopped); assert.equal(f.listeners.DOMContentLoaded[0].capture,true);
  for (const type of ["click","submit","keydown","pointerdown"]) {
    stopped = prevented = false;
    f.listeners[type][0].fn({ target: f.shell, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
    assert(stopped && prevented,type);
    stopped = prevented = false;
    f.listeners[type][0].fn({ target: f.button, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
    assert(!stopped && !prevented,type);
  }
  f.button.click(); assert.deepEqual(f.counts(),{ reloaded: 1, focused: 1 });
  assert(!guard.includes("error.message")); assert(!guard.includes("innerHTML"));
}
for (const minimal of [{}, { document: {} }, { document: { getElementById: () => null } },
  { document: { getElementById: () => ({ hidden: true }) } }]) {
  const context = vm.createContext(minimal); context.window = context;
  assert.doesNotThrow(() => vm.runInContext(guard,context));
}
console.log("Storage boot guard: real state read failure, no writes, blocking, reload, healthy boot, privacy, incomplete mocks PASS");
