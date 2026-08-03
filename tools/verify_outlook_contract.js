"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

function main() {
  ["assets/js/core/outlook.js", "assets/js/screens/outlook.js", "assets/js/core/state.js", "assets/js/app.js", "service-worker.js"].forEach((file) => {
    cp.execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
  });
  const index = read("index.html");
  const app = read("assets/js/app.js");
  const screen = read("assets/js/screens/outlook.js");
  const engine = read("assets/js/core/outlook.js");
  const state = read("assets/js/core/state.js");
  const worker = read("service-worker.js");
  assert(index.includes('data-screen="outlook"'), "Outlook bottom navigation is missing");
  assert(index.includes('id="screen-outlook"'), "Outlook screen is missing");
  assert(app.includes('"outlook"'), "Outlook route is missing");
  assert(index.includes('data-jump-screen="notices"'), "Notification settings entry is missing");
  assert(worker.includes("core/outlook.js") && worker.includes("screens/outlook.js"), "Outlook files are missing from PWA shell");
  assert(engine.includes("FUKUSHIMA_SOURCES") && engine.includes("RiceOS.outlook"), "Outlook engine separation is missing");
  assert(!screen.includes("persist(all);"), "Viewing outlook must not save a derived snapshot");
  assert(screen.includes("data-outlook-save"), "Explicit snapshot save is missing");
  assert(state.includes("saveOutlookSnapshots"), "Snapshot persistence API is missing");
  console.log("PASS outlook contract");
}

main();
