"use strict";

// Isolated storage and network fixtures only; no real data or API calls.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const memory = new Map();
let writes = 0;
const context = vm.createContext({ console, URL, AbortController, setTimeout, clearTimeout, navigator: {}, alert() {}, CustomEvent: function () {},
  dispatchEvent() {}, localStorage: { getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => { writes++; memory.set(key, String(value)); }, removeItem: (key) => memory.delete(key) } });
context.window = context;
const load = (file) => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
load("assets/js/core/utils.js");
context.RiceOS.utils.today = () => "2026-09-11";
context.RiceOS.utils.now = () => "2026-09-11T12:00:00Z";
load("assets/js/core/schema.js");
const S = context.RiceOS.schema;
const location = { latitude: 35, longitude: 139, label: "fixture" };
const initial = () => S.normalize({ meta: { weatherLocation: location },
  fields: [{ fieldId: "a", name: "A" }, { fieldId: "b", name: "B" }],
  fieldWorks: [{ workId: "w", workName: "\u53ce\u7a6b", fieldIds: ["a", "b"], date: "2026-09-10",
    harvestSnapshots: ["a", "b"].map((fieldId) => ({ fieldId, harvestDate: "2026-09-10", water: { finalDrainDate: "2026-09-08" } })) }] });
memory.set(S.STORE_KEY, JSON.stringify(initial()));
load("assets/js/core/storage.js");
load("assets/js/core/state.js");
load("assets/js/core/harvest-weather.js");
const state = context.RiceOS.state;
const service = context.RiceOS.harvestWeather;
const plain = (value) => JSON.parse(JSON.stringify(value));
const meta = { ...location, locationLabel: location.label, asOfDate: "2026-09-11", fetchedAt: "2026-09-11T12:00:00Z" };
const row = (date, tempMean = 20, precipitation = 1, extra = {}) => ({ date, tempMean, precipitation, source: "Open-Meteo Archive", ...extra });
const summarize = (rows, start = "2026-09-08", end = "2026-09-10", extra = {}) => service.summarize(start, end, rows, { ...meta, ...extra });
const complete = () => summarize([row("2026-09-08"), row("2026-09-09"), row("2026-09-10")]);
const response = (rows) => ({ ok: true, json: async () => ({ daily: {
  time: rows.map(r => r.date), temperature_2m_mean: rows.map(r => r.tempMean), precipitation_sum: rows.map(r => r.precipitation)
} }) });
const snapshot = () => state.data().fieldWorks[0].harvestSnapshots[0];
const save = (payload) => state.saveHarvestWeatherSnapshot("w", "a", "2026-09-10", "2026-09-08", payload);
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

(async () => {
  await test("null/blank invalid are missing, numeric zero is real data", () => {
    const result = summarize([row("2026-09-08", null, null), row("2026-09-09", 0, 0), row("2026-09-10", "", -1)]);
    assert.equal(result.tempCount, 1); assert.equal(result.rainCount, 1);
    assert.equal(result.meanTemp, 0); assert.equal(result.totalRain, 0);
    assert.equal(result.missing.length, 2); assert.equal(result.status, "partial");
    for (const bad of [null, undefined, "", " ", true, {}, [], Infinity, NaN]) {
      const empty = summarize([row("2026-09-08", 20, 1, { tempMean: bad, precipitation: bad })]);
      assert.equal(empty.meanTemp, ""); assert.equal(empty.totalRain, "");
    }
  });
  await test("duplicates first wins; outside dates and Forecast excluded", () => {
    const result = summarize([row("2026-09-08", 10, 2), row("2026-09-08", 99, 99), row("2026-09-07"), row("2026-09-12"),
      row("2026-09-09", 25, 10, { source: "Open-Meteo Forecast" }), row("2026-09-10", 25, 10, { dataset: "Forecast" })]);
    assert.equal(result.tempCount, 1); assert.equal(result.meanTemp, 10); assert.equal(result.totalRain, 2);
  });
  await test("independent counts, gaps, partial totals, no data blank", () => {
    const result = summarize([row("2026-09-08", 10, null), row("2026-09-10", 20, 0.2)]);
    assert.equal(result.expectedDays, 3); assert.equal(result.tempCount, 2); assert.equal(result.rainCount, 1);
    assert.equal(result.meanTemp, 15); assert.equal(result.totalRain, 0.2);
    assert.equal(result.tempMissing.length, 1); assert.equal(result.rainMissing.length, 2);
    assert.equal(summarize([]).totalRain, ""); assert.equal(summarize([]).status, "no_data");
  });
  await test("date validity, inclusive cap366 and missing drain/location states", () => {
    for (const [start, end] of [["2026-02-30", "2026-03-01"], ["2026-09-10", "2026-09-08"], ["2024-01-01", "2025-01-01"]]) {
      assert.equal(summarize([], start, end).status, "invalid_range");
    }
    assert.equal(summarize([], "2024-01-01", "2024-12-31").expectedDays, 366);
    assert.equal(summarize([], "", "2026-09-10").status, "missing_drain");
    for (const latitude of [null, "", 91]) assert.equal(summarize([], undefined, undefined, { latitude }).status, "location_missing");
  });
  await test("schema JSON roundtrip, optional weather and derived counts", () => {
    const input = initial(); input.fieldWorks[0].harvestSnapshots[0].weather = complete();
    const restored = S.normalize(JSON.parse(JSON.stringify(input)));
    assert.deepEqual(plain(restored.fieldWorks[0].harvestSnapshots[0].weather), plain(complete()));
    assert.equal(restored.fieldWorks[0].harvestSnapshots[1].weather, undefined);
    assert.equal(S.normalizeHarvestWeather(null), null);
    assert.equal(S.normalizeHarvestWeather({ ...complete(), totalRain: 999 }).totalRain, 3);
    assert.match(complete().source, /reanalysis\/model/);
  });
  await test("fetch caps yesterday and leaves current/future dates missing", async () => {
    let called;
    context.fetch = async (url) => { called = url; return response([row("2026-09-10"), row("2026-09-11"), row("2026-09-12")]); };
    const result = await service.fetchSnapshot("2026-09-10", "2026-09-12", location);
    assert.equal(called.hostname, "archive-api.open-meteo.com");
    assert.equal(called.searchParams.get("end_date"), "2026-09-10"); assert.equal(result.expectedDays, 3); assert.equal(result.tempCount, 1);
    assert.deepEqual(plain(result.missing), ["2026-09-11", "2026-09-12"]);
    called = null;
    assert.equal((await service.fetchSnapshot("2026-09-11", "2026-09-12", location)).status, "no_data");
    assert.equal(called, null);
    for (const key of ["status", "startDate", "endDate", "expectedDays", "tempCount", "rainCount", "meanTemp", "totalRain", "source", "locationLabel", "fetchedAt", "rows"]) assert.ok(key in result);
  });
  await test("single raw request preserves null and real zero without shared weather API", async () => {
    let calls = 0;
    context.RiceOS.weather = { fetchDailyRange: () => { throw new Error("shared API forbidden"); } };
    context.fetch = async () => { calls++; return response([row("2026-09-08", null, 0), row("2026-09-09", 0, null)]); };
    const result = await service.fetchSnapshot("2026-09-08", "2026-09-10", location);
    assert.equal(result.tempCount, 1); assert.equal(result.rainCount, 1); assert.equal(result.totalRain, 0);
    assert.equal(result.rows[0].tempMean, ""); assert.equal(result.rows[1].precipitation, "");
    assert.equal(calls, 1);
    context.fetch = async () => { throw new Error("offline"); };
    assert.equal((await service.fetchSnapshot("2026-09-08", "2026-09-10", location)).status, "fetch_failed");
  });
  await test("network failure, unset location, missing drain", async () => {
    context.fetch = async () => { throw new Error("offline"); };
    assert.equal((await service.fetchSnapshot("2026-09-08", "2026-09-10", location)).status, "fetch_failed");
    assert.equal((await service.fetchSnapshot("2026-09-08", "2026-09-10", null)).status, "location_missing");
    assert.equal((await service.fetchSnapshot("", "2026-09-10", location)).status, "missing_drain");
  });
  await test("save one field only, failure/noop do not wipe old or write storage", () => {
    state.replace(initial()); assert.ok(save(complete()));
    assert.equal(state.data().fieldWorks[0].harvestSnapshots[1].weather, undefined);
    const before = JSON.stringify(state.data()); const count = writes;
    assert.equal(save(complete()), null);
    assert.equal(save(summarize([], undefined, undefined, { status: "fetch_failed" })), null);
    assert.equal(save(summarize([row("2026-09-08")])), null);
    assert.equal(JSON.stringify(state.data()), before); assert.equal(writes, count);
  });
  await test("stale guards deleted/renamed/date/field/drain changes", () => {
    const changes = [d => { d.fieldWorks = []; }, d => { d.fieldWorks[0].workName = "\u53ce\u7a6b\u6e96\u5099"; },
      d => { d.fieldWorks[0].date = "2026-09-09"; }, d => { d.fieldWorks[0].fieldIds = ["b"]; },
      d => { d.fields = d.fields.filter(f => f.fieldId !== "a"); },
      d => { d.fieldWorks[0].harvestSnapshots[0].water.finalDrainDate = "2026-09-07"; }];
    for (const change of changes) {
      const d = initial(); change(d); state.replace(d);
      const before = JSON.stringify(state.data()); const count = writes;
      assert.equal(save(complete()), null); assert.equal(JSON.stringify(state.data()), before); assert.equal(writes, count);
    }
  });
  await test("capture reads meta location, dedupes requests, guards async stale response", async () => {
    state.replace(initial()); let resolve; let calls = 0;
    context.fetch = (url) => { calls++; assert.equal(url.searchParams.get("latitude"), "35"); return new Promise(done => { resolve = done; }); };
    const first = service.capture("w", "a"); const second = service.capture("w", "a");
    const d = plain(state.data()); d.fieldWorks[0].date = "2026-09-09"; state.replace(d);
    const count = writes;
    resolve(response(complete().rows));
    assert.equal((await first).status, "not_saved"); await second;
    assert.equal(calls, 1); assert.equal(writes, count);
  });
  await test("capture retains acquired values and only fills gaps; complete skips fetch", async () => {
    state.replace(initial()); save(summarize([row("2026-09-08", 12, 3)]));
    context.fetch = async () => response(complete().rows);
    assert.equal((await service.capture("w", "a")).status, "complete");
    assert.equal(snapshot().weather.rows[0].tempMean, 12); assert.equal(snapshot().weather.rows[0].precipitation, 3);
    context.fetch = () => { throw new Error("must not fetch"); };
    assert.equal((await service.capture("w", "a")).status, "complete");
  });
  await test("raw API strictly filters cells and metric arrays independently", async () => {
    for (const bad of [null, undefined, "0", " ", true, {}, [], Infinity, NaN]) {
      context.fetch = async () => response([row("2026-09-08", 20, 1, { tempMean: bad, precipitation: bad })]);
      const result = await service.fetchSnapshot("2026-09-08", "2026-09-10", location);
      assert.equal(result.tempCount, 0); assert.equal(result.rainCount, 0);
    }
    for (const bad of [null, "123", { 0: 25 }, 42]) {
      context.fetch = async () => ({ ok: true, json: async () => ({ daily: {
        time: ["2026-09-08", "2026-09-09"], temperature_2m_mean: bad, precipitation_sum: [0]
      } }) });
      const result = await service.fetchSnapshot("2026-09-08", "2026-09-10", location);
      assert.equal(result.tempCount, 0); assert.equal(result.rainCount, 1);
    }
    context.fetch = async () => response([row("bad"), row("2026-09-07"), row("2026-09-08", 10, -1), row("2026-09-08", 99, 99)]);
    const filtered = await service.fetchSnapshot("2026-09-08", "2026-09-10", location);
    assert.equal(filtered.tempCount, 1); assert.equal(filtered.meanTemp, 10); assert.equal(filtered.rainCount, 0);
  });
  await test("invalid ranges never fetch; 366 days allowed", async () => {
    let calls = 0;
    context.fetch = async () => { calls++; return response([]); };
    for (const [start, end] of [["2026-02-30", "2026-03-01"], ["2024-01-01", "2025-01-01"], ["2026-09-10", "2026-09-08"]]) {
      assert.equal((await service.fetchSnapshot(start, end, location)).status, "invalid_range");
    }
    assert.equal(calls, 0);
    assert.equal((await service.fetchSnapshot("2024-01-01", "2024-12-31", location)).expectedDays, 366);
    assert.equal(calls, 1);
  });
  await test("HTTP/JSON/API/malformed errors preserve good saved cells", async () => {
    const failures = [async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw Error("json"); } }),
      async () => ({ ok: true, json: async () => ({ error: true }) }),
      async () => ({ ok: true, json: async () => ({ daily: { time: "2026-09-08" } }) })];
    for (const fetch of failures) {
      state.replace(initial()); save(summarize([row("2026-09-08")]));
      const before = JSON.stringify(state.data()); const count = writes;
      context.fetch = fetch;
      assert.equal((await service.capture("w", "a")).status, "not_saved");
      assert.equal(JSON.stringify(state.data()), before); assert.equal(writes, count);
    }
  });
  await test("30 second abort covers body parsing and clears timer", async () => {
    let fire; let cleared = 0;
    context.setTimeout = (fn, ms) => { assert.equal(ms, 30000); fire = fn; return 123; };
    context.clearTimeout = id => { assert.equal(id, 123); cleared++; };
    context.fetch = async (url, { signal }) => ({ ok: true, json: () => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(Error("aborted")), { once: true });
      fire();
    }) });
    assert.equal((await service.fetchSnapshot("2026-09-08", "2026-09-10", location)).status, "fetch_failed");
    assert.equal(cleared, 1);
    context.setTimeout = setTimeout; context.clearTimeout = clearTimeout;
  });
  await test("in-flight deletion/date/field/work/drain/location changes never save", async () => {
    const changes = [d => { d.fieldWorks = []; }, d => { d.fieldWorks[0].date = "2026-09-09"; },
      d => { d.fieldWorks[0].workName = "\u7a32\u5208\u308a"; }, d => { d.fieldWorks[0].fieldIds = ["b"]; },
      d => { d.fields = d.fields.filter(f => f.fieldId !== "a"); },
      d => { d.fieldWorks[0].harvestSnapshots[0].harvestDate = "2026-09-09"; },
      d => { d.fieldWorks[0].harvestSnapshots[0].water.finalDrainDate = "2026-09-07"; },
      d => { d.meta.weatherLocation.latitude = 36; }];
    for (const change of changes) {
      state.replace(initial()); let resolve;
      context.fetch = () => new Promise(done => { resolve = done; });
      const request = service.capture("w", "a");
      const next = plain(state.data()); change(next); state.replace(next);
      const before = JSON.stringify(state.data()); const count = writes;
      resolve(response(complete().rows));
      assert.equal((await request).status, "not_saved");
      assert.equal(JSON.stringify(state.data()), before); assert.equal(writes, count);
    }
  });
  await test("partial retry fills each metric without overwriting acquired values; persisted JSON retains provenance", async () => {
    state.replace(initial()); save(summarize([row("2026-09-08", 12, null), row("2026-09-09", null, 0)]));
    context.fetch = async () => response([row("2026-09-08", null, 3), row("2026-09-09", 22, null)]);
    assert.equal((await service.capture("w", "a")).status, "partial");
    const stored = snapshot().weather;
    assert.equal(stored.rows[0].tempMean, 12); assert.equal(stored.rows[0].precipitation, 3);
    assert.equal(stored.rows[1].tempMean, 22); assert.equal(stored.rows[1].precipitation, 0);
    const restored = S.normalize(JSON.parse(memory.get(S.STORE_KEY))).fieldWorks[0].harvestSnapshots[0].weather;
    assert.deepEqual(plain(restored), plain(stored));
    assert.equal(restored.latitude, 35); assert.equal(restored.longitude, 139);
    assert.equal(restored.locationLabel, "fixture"); assert.equal(restored.asOfDate, "2026-09-11");
    assert.equal(restored.rows[0].source, "Open-Meteo Archive"); assert.equal(restored.fetchedAt, meta.fetchedAt);
    const before = JSON.stringify(state.data()); const count = writes;
    assert.equal(save(summarize(complete().rows, undefined, undefined, { latitude: 36 })), null);
    assert.equal(JSON.stringify(state.data()), before); assert.equal(writes, count);
  });
  await test("public JSON export/import retains daily rows and missing metric metadata", () => {
    state.replace(initial()); save(summarize([row("2026-09-08", 0, null)]));
    const before = plain(snapshot().weather);
    let exported;
    context.RiceOS.utils.download = (name, text) => { assert.match(name, /\.json$/); exported = text; };
    context.RiceOS.storage.exportJson(state.data());
    assert.ok(exported);
    context.RiceOS.storage.importJsonText(exported);
    const restored = JSON.parse(memory.get(S.STORE_KEY)).fieldWorks[0].harvestSnapshots[0].weather;
    assert.deepEqual(restored, before);
  });
  await test("complete cache rejects stale work date or missing field without network/write", async () => {
    for (const change of [d => { d.fieldWorks[0].date = "2026-09-09"; }, d => { d.fields = []; }]) {
      const data = initial(); data.fieldWorks[0].harvestSnapshots[0].weather = complete(); change(data); state.replace(data);
      let calls = 0; context.fetch = async () => { calls++; return response([]); };
      const count = writes;
      assert.equal((await service.capture("w", "a")).status, "stale");
      assert.equal(calls, 0); assert.equal(writes, count);
    }
  });
  await test("delayed capture preserves latest saved cells including zero and fills remaining gaps", async () => {
    state.replace(initial());
    assert.ok(save(summarize([row("2026-09-08", 12, 3)])));
    let resolve;
    context.fetch = () => new Promise(done => { resolve = done; });
    const request = service.capture("w", "a");
    assert.ok(save(summarize([row("2026-09-08", 12, 3), row("2026-09-09", 17, 0), row("2026-09-10", 0, null)])));
    const other = JSON.stringify(state.data().fieldWorks[0].harvestSnapshots[1]);
    resolve(response(complete().rows));
    await request;
    const stored = snapshot().weather;
    assert.equal(stored.status, "complete");
    assert.equal(stored.rows[1].tempMean, 17);
    assert.equal(stored.rows[1].precipitation, 0);
    assert.equal(stored.rows[2].tempMean, 0);
    assert.equal(stored.rows[2].precipitation, 1);
    assert.equal(stored.meanTemp, 9.666667);
    assert.equal(stored.totalRain, 4);
    assert.equal(stored.tempCount, 3); assert.equal(stored.rainCount, 3);
    assert.equal(JSON.stringify(state.data().fieldWorks[0].harvestSnapshots[1]), other);
    const restored = S.normalize(JSON.parse(memory.get(S.STORE_KEY))).fieldWorks[0].harvestSnapshots[0].weather;
    assert.deepEqual(plain(restored), plain(stored));
  });
  console.log(`${passed} harvest weather checks PASS (isolated VM; no live API/UI)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
