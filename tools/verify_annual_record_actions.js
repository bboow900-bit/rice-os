"use strict";

// Regression contract for the visible record actions in the annual flow.
// It reads source only and never touches localStorage or user records.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const annual = fs.readFileSync(path.join(root, "assets/js/screens/annual.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/css/app.css"), "utf8");
const app = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const recordActions = fs.readFileSync(path.join(root, "assets/js/core/record-actions.js"), "utf8");
const switchSection = annual.match(/function switchFieldWithinAnnual\(fieldId\) \{[\s\S]*?\n  \}\n\n  function resetNavigation/)?.[0] || "";

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
  /hasTransientBackState: \(\) => Boolean\(recordDetail \|\| expandedFlowRecord \|\| reviewView === "compare"\)/.test(annual) && /activeScreen === "annual"[\s\S]*hasTransientBackState\(\)/.test(app),
  "The shared back button must close annual detail and inline summaries before a prior route"
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
assert(
  /function renderAnnualFieldSwitcher\(field\)/.test(annual) && /\$\{renderAnnualFieldSwitcher\(field\)\}\$\{recordDetail \? renderAnnualRecordDetail/.test(annual) && /function switchFieldWithinAnnual\(fieldId\)/.test(annual),
  "Annual review must expose the field switcher in both flow and read-only detail views"
);
assert(
  /selectedTab = "karte";[\s\S]*timelineActionRecord = null;[\s\S]*recordDetail = null;/.test(annual),
  "Switching annual fields must clear transient detail and action state"
);
assert(
  /The selector is a review filter, not a new navigation destination/.test(switchSection) && !/RiceOS\.navigation\.openField/.test(switchSection),
  "Switching fields inside review must change the visible review without adding a route"
);
assert(
  /open\.dataset\.annualOpenField, \{[\s\S]*destination: "annual-history"[\s\S]*tab: "karte"/.test(annual),
  "Review-top field cards must open the review detail rather than the field settings screen"
);
assert(
  /returnToAnnualFieldId: selectedFieldId,[\s\S]*returnToAnnualTab: selectedTab/.test(annual) && /returnToAnnualFieldId: routeOptions\.returnToAnnualFieldId/.test(recordActions),
  "Editing a selected review field must carry an explicit return target"
);
assert(
  /\.annual-field-switcher \{[\s\S]*position: sticky/.test(css),
  "Annual field switcher must stay reachable while reviewing a long record"
);
assert(
  /data-annual-flow-summary=[\s\S]*要約を表示/.test(annual) && /const flowSummary = event\.target\.closest\("\[data-annual-flow-summary\]"\)/.test(annual),
  "Annual flow must offer an explicit inline-summary control separate from the normal card tap"
);
assert(
  /expandedFlowRecord = expandedFlowRecord === key \? "" : key;/.test(annual) && /if \(expandedFlowRecord\) \{[\s\S]*expandedFlowRecord = ""/.test(annual),
  "Inline summaries must toggle independently and close through the shared back path"
);
assert(
  /class="annual-year-flow-open"[\s\S]*data-annual-flow-summary/.test(annual),
  "Opening the read-only record detail must remain distinct from opening its inline summary"
);
assert(
  /label: "記録更新", tone: "warn", action: "growth"/.test(annual),
  "Review status must open growth input when the record needs updating"
);
assert(
  /label: "中干し候補", tone: "warn", action: "dry"/.test(annual),
  "Midseason candidate status must open dry-period input"
);
assert(
  /const actualRows = rows\.filter\(\(row\) => row\.kind !== "schedule"/.test(annual),
  "Review status must derive recency from actual records rather than schedules"
);
assert(
  /data-annual-status-action=[\s\S]*data-annual-status-field/.test(annual) && /function openStatusInput\(action, fieldId\)/.test(annual),
  "Review status badges must route to the relevant prefilled input"
);

console.log("PASS annual record action contract");
