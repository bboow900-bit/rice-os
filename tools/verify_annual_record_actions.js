"use strict";

// Regression contract for the visible record actions in the annual flow.
// It reads source only and never touches localStorage or user records.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const annual = fs.readFileSync(path.join(root, "assets/js/screens/annual.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/app.css"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /class="annual-year-flow-open"[\s\S]*class="annual-year-flow-menu"/.test(annual),
  "Annual flow cards must expose a visible sibling action menu"
);
assert(
  /data-annual-flow-menu-kind=[\s\S]*data-annual-flow-menu-id/.test(annual),
  "Annual flow menu must retain the canonical record kind and id"
);
assert(
  /const flowMenu = event\.target\.closest\("\[data-annual-flow-menu-kind\]"\)/.test(annual),
  "Annual flow menu must be handled before normal card navigation"
);
assert(
  /openTimelineAction\(\{[\s\S]*kind: flowMenu\.dataset\.annualFlowMenuKind/.test(annual),
  "Annual flow menu must open the common edit/delete action sheet"
);
assert(
  !/annual-record-action-sheet[^>]*onclick="event\.stopPropagation\(\)"/.test(annual),
  "Action-sheet buttons must not be blocked by inline event propagation"
);
assert(
  /recordAction\.classList\.contains\("annual-record-action-backdrop"\) && event\.target !== recordAction/.test(annual),
  "Only a backdrop tap may close the action sheet"
);
assert(
  /\.annual-year-flow-menu \{[\s\S]*min-height: 44px/.test(css),
  "Visible annual-flow action menus must retain a touch-sized target"
);

console.log("PASS annual record action contract");
