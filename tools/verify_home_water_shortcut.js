const fs = require("fs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync("assets/js/screens/home.js", "utf8");

assert(source.includes("function activeHomeWaterPeriod"), "home water period resolver is missing");
assert(source.includes('["intermittent", "saturated"]'), "shortcut must be limited to intermittent and saturated water management");
assert(source.includes("data-home-water-input"), "daily water input shortcut is missing");
assert(source.includes("data-home-water-open"), "water-management detail shortcut is missing");
assert(source.includes('RiceOS.app.openInput("irrigation", "home")'), "shortcut must use the shared water-management input route");
assert(source.includes("RiceOS.screens.irrigation.prefillDate(U.today(), fieldId, typeKey)"), "shortcut must preselect today, field, and water type");
assert(!source.includes("state.saveIrrigation(") && !source.includes("state.saveDryPeriod("), "home shortcut must not save or complete water records directly");

console.log("PASS home water shortcut contract");
