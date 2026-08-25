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
assert(source.includes("function candidateAction"), "candidate input action resolver is missing");
assert(source.includes("data-home-candidate-input"), "candidate direct-input button is missing");
assert(source.includes('kind === "growth" && RiceOS.screens.growth'), "growth candidate must open the growth input");
assert(source.includes('kind === "water" && RiceOS.screens.irrigation'), "water candidate must open the water-management input");
assert(source.includes('data-home-summary-action="candidate"'), "candidate summary must be a button");
assert(source.includes('data-home-summary-action="overdue"'), "overdue summary must be a button");
assert(source.includes('data-home-summary-action="today"'), "today summary must be a button");
assert(source.includes('data-home-summary-action="water"'), "active-water summary must be a button");
assert(source.includes('RiceOS.screens.calendar.focusDate(first.date)'), "overdue summary must focus the overdue date in calendar");

console.log("PASS home water shortcut contract");
