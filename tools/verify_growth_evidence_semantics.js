"use strict";

// Regression contract for the distinction between a field-stage judgement and
// factual panicle / heading observations. Reads source only; it never touches
// localStorage or saved records.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const schema = read("assets/js/core/schema.js");
const state = read("assets/js/core/state.js");
const agro = read("assets/js/core/agro.js");
const growth = read("assets/js/screens/growth.js");
const annual = read("assets/js/screens/annual.js");
const home = read("assets/js/screens/home.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!/String\(g\.memo \|\| ""\)\.includes\("出穂"\)/.test(schema), "Memo text must not create an explicit heading observation");
assert(/stageEvidenceType/.test(schema), "Growth records must retain their evidence type for future extensions");
assert(/filter\(\(log\) => onOrBefore\(log\) && log\.headingObserved\)/.test(state), "Heading-date anchors must use explicit heading observations only");
assert(!/fieldWorksByNameFor\(fieldId, "出穂"/.test(state), "Field-work names must not be biological heading-date anchors");
assert(/const headingLog = logs\.find\(\(log\) => log\.headingObserved\)/.test(state), "Growth summary must keep heading observations separate from stage selection");
assert(/if \(row\.headingObserved\)[\s\S]*else if \(Number\(row\.panicleLengthMm \|\| 0\) > 0\)[\s\S]*else if \(row\.stageConfirmed/.test(agro), "Measured heading and panicle evidence must take precedence over manual stage selection");
assert(/manual-stage-observation", "heading", "harvest/.test(agro), "A later manual stage judgement must update the current stage without becoming a heading fact");
assert(!/works\.filter\(\(row\) => \/出穂\//.test(agro), "Work labels must not create heading-stage evidence");
assert(/find\(\(log\) => log\.headingObserved\)/.test(growth), "The growth screen must use only explicit heading observation as its anchor");
assert(/function isObservedHeading\(row\) \{\s*return Boolean\(row && row\.headingObserved\);/.test(annual), "Annual history must not call a manual stage selection an observed heading");
assert(/label: "現場ステージ"/.test(annual) && /category: fact\.kind === "manual-stage" \? "現場判定" : "生育実測"/.test(annual), "Annual history must visibly distinguish field judgement from measurement");
assert(!/headingObserved \|\| log\.stageConfirmed && log\.observedStage === "heading"/.test(state), "Deleting a heading record must not promote a manual heading stage into a factual observation");

assert(/evidenceKind: usePrediction \? "prediction" : displayedEvidence && displayedEvidence\.kind \|\| ""/.test(agro), "Stage service must expose display evidence kind without changing records");
assert(/fieldStage:\s*\{[\s\S]*outlookStage:\s*\{/.test(agro), "Stage service must expose separate factual and forecast layers for Home");
assert(/latestManualEvidence[\s\S]*latestMeasuredEvidence[\s\S]*latestFieldEvidence/.test(agro), "Manual field-stage judgement must remain separate from measured evidence");
assert(/function homeStageEvidenceLabel\(stage\)/.test(home), "Home must translate stage evidence into an explicit display label");
assert(/function homeStageOutlook\(field, stage, focus, dateText\)/.test(home), "Home must render the forecast layer separately from the field stage");
assert(/function homeStageHeat\(field, dateText\)/.test(home), "Home must render accumulated temperature from read-only weather data");
assert(/data-home-stage-card/.test(home), "Home heat hydration must refresh only its own field card");
assert(/manual-stage-observation"\) return "現地判断"/.test(home), "Manual field stage must not be displayed as confirmed measurement on Home");
assert(/\["panicle", "tiller"\]\.includes\(stage\.evidenceKind\)\) return "実測"/.test(home), "Measured growth records must remain visibly measured on Home");
assert(/\["dry", "intermittent", "saturated", "deep", "drain"\]/.test(home), "Home water history must include saturated management");
assert(/"saturated", "deepWater"/.test(home), "Active saturated management must be counted in Home status cards");

console.log("PASS growth evidence semantics");
