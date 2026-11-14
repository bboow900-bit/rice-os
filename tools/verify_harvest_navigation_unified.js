"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const base = path.resolve(__dirname, "../assets/js");
const source = name => fs.readFileSync(path.join(base, name), "utf8");
function element(dataset = {}) {
  const classes = new Set();
  return { dataset, value: "", innerHTML: "", listeners: {},
    classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c),
      toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    dispatchEvent(e) { this.listeners[e.type]?.(e); },
    setAttribute() {}, querySelector() { return null; } };
}
const hosts = new Map();
const get = id => { if (!hosts.has(id)) hosts.set(id, element()); return hosts.get(id); };
const nav = ["home", "calendar", "fields", "annual", "outlook", "data"].map(screen => element({ screen }));
const fields = [{ fieldId: "f", varietyId: "v" }];
let scopeRead, millingCall, shipmentCall, performanceYear, waterCall, annualReturn;
let resetCount = 0, prefills = 0;
const checkbox = element({ millingField: "f" });
checkbox.addEventListener("change", () => prefills++);
const R = { utils: { $: get, $$: s => s === ".nav-item" ? nav : s === "[data-milling-field]" ? [checkbox] : [],
  today: () => "2026-11-14", fd: s => s, attr: String, escapeHTML: String, toast() {} },
  schema: { validCropYear: y => Number.isInteger(Number(y)) && Number(y) >= 1900 && Number(y) <= 2200 },
  state: { field: id => fields.find(f => f.fieldId === id), activeFields: () => fields,
    variety: id => id === "v" ? { varietyId: "v" } : null, defaultShipmentCropYear: () => 2026 },
  harvestLedger: { scopes: () => ({ seasons: [2025, 2026], varieties: [{ varietyId: "v", name: "Rice" }] }),
    read(year, variety) { scopeRead = [year, variety]; return { stock: {}, performance: null, history: [] }; } },
  screens: {
    annual: { render() {}, resetNavigation() { resetCount++; }, openField(...args) { annualReturn = args; } },
    fields: { render() {}, resetNavigation() {}, openField() {} },
    results: { render() {}, resetForm() {}, canHandleBack: () => false,
      openMillingForYear(...args) { millingCall = args; }, openMillingLedger() {}, openShipmentIssues() {} },
    shipments: { render() {}, canHandleBack: () => false, openNew(...args) { shipmentCall = args; } },
    irrigation: { render() {}, resetForm() {}, canHandleBack: () => false, editPeriod(...args) { waterCall = args; } },
    harvestPerformance: { render() {}, open(year) { performanceYear = year; } }
  } };
const c = vm.createContext({ console, URLSearchParams, Event, CustomEvent: class {}, RiceOS: R,
  document: { addEventListener() {}, querySelector: () => null },
  location: { search: "" }, scrollY: 0, scrollTo(opts) { c.scrollY = opts.top; },
  addEventListener() {}, dispatchEvent() {}, setTimeout: () => 1, clearTimeout() {},
  localStorage: { setItem() { throw Error("Navigation must not write storage"); } } });
c.window = c;
const load = file => vm.runInContext(source(file), c, { filename: file });
load("core/navigation.js"); load("screens/harvest-ledger.js"); load("app.js");
R.app.init(); R.screens.harvestLedger.bind();
const selected = () => nav.filter(b => b.classList.contains("active")).map(b => b.dataset.screen);
const clickLedger = attr => get("harvestLedgerContent").listeners.click({ target: { closest: () => ({ disabled: false, hasAttribute: a => a === attr }) } });
for (const origin of ["annual", "data"]) {
  R.app.clearInputOrigin(); R.app.show(origin); c.scrollY = 275;
  R.app.openInput("harvest-ledger", origin);
  R.screens.harvestLedger.setScope({ season: 2025, varietyId: "v", fieldIds: ["f"], date: "2025-10-02" });
  assert.deepEqual(selected(), [origin]);
  c.scrollY = 460;
  clickLedger("data-harvest-ledger-new-milling");
  assert.deepEqual(selected(), [origin]);
  assert.equal(millingCall[0], "2025"); assert.equal(millingCall[1], "v");
  assert.equal(millingCall[2].date, "2025-10-02"); assert.equal(millingCall[2].fieldIds.join(","), "f");
  R.app.show("harvest-ledger"); // Save callbacks may return via show().
  assert.equal(c.scrollY, 460); assert.deepEqual(scopeRead, ["2025", "v"]);
  clickLedger("data-harvest-ledger-new-shipment");
  assert.equal(shipmentCall[0], "2025-10-02"); assert.equal(shipmentCall[1].season, "2025");
  assert.deepEqual(selected(), [origin]); R.app.back();
  assert.equal(R.app.currentScreen(), "harvest-ledger"); assert.equal(c.scrollY, 460);
  clickLedger("data-harvest-ledger-performance"); assert.equal(performanceYear, "2025");
  assert.deepEqual(selected(), [origin]); R.app.back();
  R.app.back(); assert.equal(R.app.currentScreen(), origin); assert.equal(c.scrollY, 275);
}
assert.equal(prefills, 0, "Prefills enter the draft before its baseline, not through dirty DOM events");
// Existing field routes must remain intact under an annual input layer.
R.app.clearInputOrigin();
R.navigation.openField("f", { originScreen: "annual", season: 2025 });
R.app.show("annual"); get("annualYear").value = "2025"; c.scrollY = 650;
R.app.openInput("harvest-ledger", "annual"); R.app.back();
assert.equal(R.app.currentScreen(), "annual"); assert.equal(c.scrollY, 650);
assert.equal(get("annualYear").value, "2025"); assert.equal(R.navigation.snapshot().length, 1);
R.app.openInput("fields", "annual"); R.screens.fields.openField("f", "settings"); R.app.back();
assert.equal(R.app.currentScreen(), "annual"); assert.equal(c.scrollY, 650);
assert.equal(R.navigation.snapshot().length, 1);
for (const kind of ["dry", "irrigation"]) {
  R.navigation.openRecord(kind, "period", { originScreen: "annual", returnToAnnualFieldId: "f", returnToAnnualTab: "water" });
  assert.equal(R.app.currentScreen(), "irrigation"); assert.deepEqual(waterCall, [kind, "period"]);
  R.app.back(); assert.equal(R.app.currentScreen(), "annual"); assert.deepEqual(annualReturn, ["f", "water"]);
}
R.app.openInput("harvest-ledger", "annual");
nav.find(b => b.dataset.screen === "data").listeners.click();
R.app.openInput("harvest-ledger", "data"); clickLedger("data-harvest-ledger-performance");
assert.deepEqual(selected(), ["data"]); R.app.back(); R.app.back();
assert.equal(R.app.currentScreen(), "data"); R.app.back(); assert.equal(R.app.currentScreen(), "data");
assert.equal(resetCount, 1, "Only independent bottom navigation resets annual state");
R.app.openInput("harvest-ledger", "data");
const depth = R.navigation.snapshot().length;
R.navigation.openRecord("dry", "period", { originScreen: "harvest-ledger" });
R.app.back(); assert.equal(R.navigation.snapshot().length, depth, "New record routes still pop before their input origin");
assert.equal(R.app.currentScreen(), "harvest-ledger");
// Date-sheet generic entries share the ledger, but record-specific edit routes remain.
const sheet = source("screens/bottom-sheet.js");
assert.match(sheet, /action === "result" \|\| action === "shipment"/);
assert.match(sheet, /openScreen\("harvest-ledger", fieldIds =>/);
assert.match(sheet, /if \(screen !== "harvest-ledger" && RiceOS.navigation/);
assert.match(sheet, /RiceOS.screens.shipments.openDetail\(id\)/);
assert.match(source("screens/irrigation.js"), /editPeriod: \(kind, id\) => fillEdit\(kind, id\)/);
console.log("PASS unified harvest origin, scope, nested/save/back, field route, water route, bottom navigation safety");

// Optional real-browser verification serves the checkout via request interception,
// without launching a server or touching the user's browser/storage.
if (process.argv.includes("--browser")) (async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    for (const width of [360, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: "block" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
      const checkout = path.resolve(__dirname, "..");
      await page.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== "rice.test") return route.abort();
        const file = path.resolve(checkout, "." + decodeURIComponent(url.pathname));
        if (!file.startsWith(checkout + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "Not found" });
        const types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
        return route.fulfill({ body: fs.readFileSync(file), contentType: types[path.extname(file)] || "application/octet-stream" });
      });
      await page.goto("http://rice.test/index.html", { waitUntil: "networkidle" });
      await page.evaluate(() => {
        const S = RiceOS.state, v = S.addVariety("Navigation QA"), f = S.addField("Navigation QA field");
        S.updateField(f, { varietyId: v, areaA: 20 }); window.qaScope = { season: 2025, varietyId: v, fieldIds: [f], date: "2025-10-02" };
      });
      const before = await page.evaluate(() => JSON.stringify(RiceOS.state.data()));
      for (const origin of ["annual", "data"]) {
        await page.locator(`.nav-item[data-screen="${origin}"]`).click();
        await page.evaluate(origin => { RiceOS.app.openInput("harvest-ledger", origin); RiceOS.screens.harvestLedger.setScope(window.qaScope); }, origin);
        await page.locator("[data-harvest-ledger-new-milling]").click();
        assert.equal(await page.locator("#millingSeason").inputValue(), "2025");
        assert.equal(await page.locator("#millingDate").inputValue(), "2025-10-02");
        assert.equal(await page.locator("[data-milling-field]:checked").count(), 1);
        assert.equal(await page.locator(".nav-item.active").getAttribute("data-screen"), origin);
        await page.locator("#appBackButton").click();
        await page.locator("#screen-harvest-ledger.active").waitFor();
        await page.locator("[data-harvest-ledger-new-shipment]").click();
        assert.equal(await page.locator("#shipmentSeason").inputValue(), "2025");
        assert.equal(await page.locator("#shipmentDate").inputValue(), "2025-10-02");
        await page.locator("#appBackButton").click();
        if (await page.locator("#screen-shipments.active").count()) await page.locator("#appBackButton").click();
        await page.locator("#screen-harvest-ledger.active").waitFor();
        await page.locator("[data-harvest-ledger-performance]").click();
        assert.equal(await page.locator("#hpYear").inputValue(), "2025");
        assert.equal(await page.locator(".nav-item.active").getAttribute("data-screen"), origin);
        await page.locator("#appBackButton").click();
        await page.locator("#screen-harvest-ledger.active").waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const screenshot = path.join(require("node:os").tmpdir(), `rice-harvest-navigation-${origin}-${width}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(screenshot);
        await page.locator("#appBackButton").click(); await page.locator(`#screen-${origin}.active`).waitFor();
      }
      // The current HTML exposes one unified entry; older hosts may still have shipment.
      const sheetActions = ["result"];
      if (await page.locator('[data-sheet-add="shipment"]').count()) sheetActions.push("shipment");
      for (const action of sheetActions) {
        await page.locator('.nav-item[data-screen="calendar"]').click();
        await page.evaluate(() => RiceOS.bottomSheet.open("2025-10-02", window.qaScope.fieldIds[0], { mode: "field", fieldId: window.qaScope.fieldIds[0], season: 2025, varietyId: window.qaScope.varietyId }));
        await page.locator(`[data-sheet-add="${action}"]`).click();
        await page.locator("#screen-harvest-ledger.active").waitFor();
        assert.equal(await page.locator("#harvestLedgerSeason").inputValue(), "2025");
        assert.equal(await page.locator("#harvestLedgerVariety").inputValue(), await page.evaluate(() => window.qaScope.varietyId));
        await page.locator("[data-harvest-ledger-new-milling]").click();
        assert.equal(await page.locator("[data-milling-field]:checked").count(), 1);
        await page.locator("#appBackButton").click(); await page.locator("#screen-harvest-ledger.active").waitFor();
        await page.locator("#appBackButton").click(); await page.locator("#screen-calendar.active").waitFor();
      }
      assert.equal(await page.evaluate(() => JSON.stringify(RiceOS.state.data())), before, "Browser navigation/cancellation must not change records");
      assert.deepEqual(errors, []);
      await context.close(); console.log(`PASS browser navigation ${width}px`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
