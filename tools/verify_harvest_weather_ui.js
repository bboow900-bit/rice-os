"use strict";

// Isolated UI VM: no network, browser storage, or application-file writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
let renders = 0;
const notices = [];
const context = vm.createContext({ console });
context.window = context;
context.RiceOS = { state: {} };
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/core/utils.js"), "utf8"), context);
context.RiceOS.utils.toast = (message) => notices.push(message);
let code = fs.readFileSync(path.join(root, "assets/js/screens/annual.js"), "utf8");
code = code.replace(/\}\)\(\);\s*$/, `
  window.weatherUI = { renderHarvestWeather, fetchHarvestWeather,
    select(field, detail) { selectedFieldId = field; recordDetail = detail; },
    replaceRender(fn) { render = fn; }
  };
})();`);
vm.runInContext(code, context);
const ui = context.weatherUI;
ui.replaceRender(() => renders++);
const row = { workId: "w" };
const snapshot = { water: { finalDrainDate: "2026-08-20" }, weather: {
  status: "partial", startDate: "2026-08-20", endDate: "2026-08-22",
  totalRain: 0, rainCount: 1, meanTemp: null, tempCount: 0, expectedDays: 3,
  source: "<archive>", locationLabel: "<place>"
} };
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

(async () => {
  context.RiceOS.harvestWeather = { capture: async () => {} };
  await test("partial values, actual zero, missing values and source escaping", () => {
    const html = ui.renderHarvestWeather(row, snapshot, "a");
    assert.match(html, /0mm \/ 1日分/);
    assert.match(html, /取得済み分/);
    assert.match(html, /取得できる値なし/);
    assert.doesNotMatch(html, /null℃|0℃/);
    assert.match(html, /&lt;archive&gt;/);
    assert.match(html, /圃場の実測・乾燥日数ではありません/);
    assert.match(html, /当日と未来の予報は含みません/);
  });
  await test("missing snapshot values are not rendered as zero", () => {
    const html = ui.renderHarvestWeather(row, { water: {} }, "a");
    assert.doesNotMatch(html, /0mm|0℃|data-harvest-weather=/);
  });
  await test("duplicate request blocked and busy button disabled", async () => {
    let resolve;
    let calls = 0;
    context.RiceOS.harvestWeather.capture = () => { calls++; return new Promise((done) => { resolve = done; }); };
    ui.select("a", { id: "w", kind: "fieldWork" });
    const request = ui.fetchHarvestWeather("w", "a");
    assert.match(ui.renderHarvestWeather(row, snapshot, "a"), /disabled/);
    await ui.fetchHarvestWeather("w", "a");
    assert.equal(calls, 1);
    const before = renders;
    resolve(); await request;
    assert.equal(renders, before + 1);
    assert.doesNotMatch(ui.renderHarvestWeather(row, snapshot, "a"), /disabled/);
  });
  await test("completion does not rerender another field or record", async () => {
    for (const [field, detail] of [["b", { id: "w" }], ["a", { id: "other" }], ["", null]]) {
      let resolve;
      context.RiceOS.harvestWeather.capture = () => new Promise((done) => { resolve = done; });
      ui.select("a", { id: "w" });
      const request = ui.fetchHarvestWeather("w", "a");
      ui.select(field, detail);
      const before = renders;
      resolve(); await request;
      assert.equal(renders, before);
    }
  });
  await test("capture rejection releases busy state and leaves displayed data unchanged", async () => {
    const before = JSON.stringify(snapshot);
    context.RiceOS.harvestWeather.capture = async () => { throw new Error("fixture"); };
    await ui.fetchHarvestWeather("w", "a");
    assert.equal(JSON.stringify(snapshot), before);
    assert.ok(notices.length);
    assert.doesNotMatch(ui.renderHarvestWeather(row, snapshot, "a"), /disabled/);
  });
  await test("retry offered only while weather is incomplete", () => {
    assert.match(ui.renderHarvestWeather(row, snapshot, "a"), /data-harvest-weather=/);
    const complete = { ...snapshot, weather: { ...snapshot.weather, status: "complete" } };
    assert.doesNotMatch(ui.renderHarvestWeather(row, complete, "a"), /data-harvest-weather=/,
      "Main UI must hide retry for complete cached snapshots");
  });
  console.log(`${passed} harvest weather UI checks PASS (mock capture; persistence and browser QA excluded)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
