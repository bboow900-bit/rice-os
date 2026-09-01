"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
global.window = global;
global.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
if (!global.navigator) global.navigator = {};

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("assets/js/core/utils.js");
load("assets/js/core/agro.js");

const timeline = global.RiceOS.agro.waterMovementTimeline({
  waterMovements: [
    { phase: "flood", startDate: "2026-07-11", endDate: "2026-07-13" },
    { phase: "drain", startDate: "2026-07-14", endDate: "2026-07-17" },
    { phase: "flood", startDate: "2026-07-18", endDate: "2026-07-20" },
    { phase: "drain", startDate: "2026-07-21", endDate: "" }
  ]
}, { asOf: "2026-07-24" });

assert(timeline.segments.length === 4, "水の動きの区間数が正しくない");
assert(timeline.flood.count === 2 && timeline.flood.days === 6, "入水の回数または日数が正しくない");
assert(timeline.drain.count === 2 && timeline.drain.days === 8, "落水の回数または日数が正しくない");
assert(timeline.active && timeline.active.phase === "drain" && timeline.active.days === 4, "継続中の落水期間が正しくない");
console.log("PASS water movement timeline", JSON.stringify(timeline));
