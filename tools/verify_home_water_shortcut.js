const fs = require("fs");
const vm = require("vm");

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
assert(source.includes("function homeWaterMovementPresentation"), "home water movement display resolver is missing");
assert(source.includes("function renderHomeWaterMovementTimeline"), "home water movement timeline renderer is missing");
assert(source.includes("RiceOS.agro.waterMovementTimeline(period.raw"), "home must reuse the shared water movement timeline");
assert(source.includes("function candidateAction"), "candidate input action resolver is missing");
assert(source.includes("data-home-candidate-input"), "candidate direct-input button is missing");
assert(source.includes('kind === "growth" && RiceOS.screens.growth'), "growth candidate must open the growth input");
assert(source.includes('kind === "water" && RiceOS.screens.irrigation'), "water candidate must open the water-management input");
assert(source.includes('data-home-summary-action="candidate"'), "candidate summary must be a button");
assert(source.includes('data-home-summary-action="overdue"'), "overdue summary must be a button");
assert(source.includes('data-home-summary-action="today"'), "today summary must be a button");
assert(source.includes('data-home-summary-action="water"'), "active-water summary must be a button");
assert(source.includes('RiceOS.screens.calendar.focusDate(first.date)'), "overdue summary must focus the overdue date in calendar");

const context = {
  window: {
    __RICEOS_TEST__: true,
    RiceOS: {
      utils: {
        today: () => "2026-08-01",
        daysBetween: (start, end) => Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000),
        attr: (value) => String(value),
        escapeHTML: (value) => String(value),
        fd: (value) => String(value)
      },
      agro: {
        waterMovementTimeline: () => ({
          flood: { count: 1, days: 3 },
          drain: { count: 1, days: 2 },
          wait: { count: 1, days: 3 },
          active: { phase: "wait" },
          segments: [
            { phase: "flood", days: 3, startDate: "2026-07-20", displayEndDate: "2026-07-22", active: false },
            { phase: "drain", days: 2, startDate: "2026-07-23", displayEndDate: "2026-07-24", active: false },
            { phase: "wait", days: 3, startDate: "2026-07-25", displayEndDate: "", active: true }
          ]
        })
      }
    }
  }
};
vm.createContext(context);
vm.runInContext(source, context);
const present = context.window.RiceOS.homeTest.homeWaterMovementPresentation;
const saturatedWait = present({ kind: "saturated", startDate: "2026-07-20" }, { phase: "wait", startDate: "2026-07-24" }, "2026-07-26");
assert(saturatedWait.currentLabel === "給水待ち" && saturatedWait.nextLabel === "給水を入力" && saturatedWait.dayText === "3日目", "給水待ちがホームで正しく表示されない");
const saturatedFlood = present({ kind: "saturated", startDate: "2026-07-20" }, { phase: "flood", startDate: "2026-07-24" }, "2026-07-26");
assert(saturatedFlood.currentLabel === "給水中" && saturatedFlood.nextLabel === "自然落水を入力", "給水中がホームで正しく表示されない");
const intermittentWait = present({ kind: "intermittent", startDate: "2026-07-20" }, { phase: "wait", startDate: "2026-07-24" }, "2026-07-26");
assert(intermittentWait.currentLabel === "入水待ち" && intermittentWait.nextLabel === "入水を入力", "入水待ちがホームで正しく表示されない");
const label = context.window.RiceOS.homeTest.homeWaterMovementLabel;
assert(label({ kind: "saturated" }, "wait") === "給水待ち" && label({ kind: "intermittent" }, "drain") === "落水", "ホームの水の動き名称が水管理画面と一致しない");
const timelineHtml = context.window.RiceOS.homeTest.renderHomeWaterMovementTimeline({ kind: "saturated", label: "飽水管理", raw: {} }, "2026-07-27");
assert(timelineHtml.includes("給水") && timelineHtml.includes("自然落水") && timelineHtml.includes("給水待ち") && timelineHtml.includes("3日"), "ホームに水の動きの横棒を表示できない");

console.log("PASS home water shortcut contract");
