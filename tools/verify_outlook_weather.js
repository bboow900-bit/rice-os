"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
global.window = global;
global.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
if (!global.navigator) global.navigator = {};
global.fetch = async (url) => {
  const parsed = new URL(url);
  const year = Number(parsed.searchParams.get("start_date").slice(0, 4));
  const value = year === 2025 ? 21 : year === 2024 ? 20 : 19;
  return {
    ok: true,
    json: async () => ({
      timezone: "Asia/Tokyo",
      daily: {
        time: [parsed.searchParams.get("start_date")],
        weather_code: [1],
        temperature_2m_max: [value + 4],
        temperature_2m_min: [value - 4],
        temperature_2m_mean: [value],
        precipitation_sum: [0],
        precipitation_hours: [0]
      }
    })
  };
};

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("assets/js/core/utils.js");
load("assets/js/core/weather.js");

(async () => {
  const result = await global.RiceOS.weather.fetchSamePeriodAverage(
    "2026-08-26",
    "2026-09-01",
    { latitude: 37.75, longitude: 140.46, label: "福島" },
    3
  );
  assert(result.mean === 20, "過去3年同時期の平均気温が正しくない");
  assert(result.years === 3 && result.days === 3, "過去年数または日数が正しくない");
  assert(result.label === "過去3年同時期 平均 20℃", "平均気温の表示文言が正しくない");
  console.log("PASS outlook weather context", JSON.stringify(result));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
