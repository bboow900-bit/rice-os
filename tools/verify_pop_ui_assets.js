"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html"), sw = read("service-worker.js");
for (const file of ["pop-shell.css", "home-pop.css", "annual-pop.css", "annual-review-ui.css"]) {
  assert(index.includes(`assets/css/${file}?v=`), `${file} must be loaded`);
  assert(sw.includes(`./assets/css/${file}?v=`), `${file} must be cached`);
  assert(fs.existsSync(path.join(root, "assets/css", file)));
}
for (const file of ["rice-sowing.png", "rice-growing.png", "rice-processing.png", "rice-winter.png", "harvest-rice.png", "rice-transplanter.png", "rice-combine.png"]) {
  const data = fs.readFileSync(path.join(root, "assets/images/ui-pop", file));
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  assert.equal(data[25], 6, `${file} needs an alpha channel`);
  assert(data.readUInt32BE(16) > 100 && data.readUInt32BE(20) > 100);
  assert(sw.includes(`./assets/images/ui-pop/${file}`), `${file} must be cached`);
}
const version = read("assets/js/core/schema.js").match(/APP_VERSION = "([^"]+)"/)[1];
for (const file of ["index.html", "mobile.html", "service-worker.js", "assets/js/core/pwa.js"]) assert(read(file).includes(version), `${file} version must match`);
assert(read("assets/css/pop-shell.css").includes("prefers-reduced-motion"));
console.log("illustrated UI assets PASS");
