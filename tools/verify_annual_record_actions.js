"use strict";

// Regression contract for the visible record actions in the annual flow.
// It reads source only and never touches localStorage or user records.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const annual = fs.readFileSync(path.join(root, "assets/js/screens/annual.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/app.css"), "utf8");
const app = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /class="annual-year-flow-open"[\s\S]*class="annual-year-flow-menu"/.test(annual),
  "Annual flow cards must expose a visible sibling action menu"
);
assert(
  /data-annual-record-open-kind=[\s\S]*data-annual-record-open-id/.test(annual),
  "A normal annual-flow card must carry a canonical record-detail target"
);
assert(
  /function renderAnnualRecordDetail\(/.test(annual) && /function openAnnualRecordDetail\(/.test(annual),
  "Annual records must have a dedicated read-only detail route"
);
assert(
  /const recordOpen = event\.target\.closest\("\[data-annual-record-open-kind\]"\)/.test(annual) && /openAnnualRecordDetail\(recordOpen\.dataset\.annualRecordOpenKind/.test(annual),
  "Normal card taps must open the read-only detail instead of an editor"
);
assert(
  /data-annual-record-detail-back/.test(annual) && /if \(recordDetail\) \{[\s\S]*recordDetail = null/.test(annual),
  "Record detail must have an in-page return path to the annual flow"
);
assert(
  /isRecordDetailOpen: \(\) => Boolean\(recordDetail\)/.test(annual) && /activeScreen === "annual"[\s\S]*isRecordDetailOpen\(\)/.test(app),
  "The shared back button must close annual record detail before a prior route"
);
assert(
  /activeScreen === "annual"[\s\S]*annual\.resetNavigation\(\)[\s\S]*button\.dataset\.screen === "field-work"/.test(app),
  "Opening record input from the bottom bar must clear annual record-detail state"
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
assert(
  /\.annual-record-detail-back \{[\s\S]*width: 42px[\s\S]*height: 42px/.test(css),
  "Record detail must keep a touch-sized return button"
);

console.log("PASS annual record action contract");
