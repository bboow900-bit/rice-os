"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const memory = new Map(); let writes = 0;
const hosts = {};
function host() { return { innerHTML: "", dataset: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } }; }
const c = vm.createContext({ console, navigator: {}, alert() {}, confirm: () => true, dispatchEvent() {}, CustomEvent: class {},
  document: { getElementById: id => hosts[id] || null, querySelectorAll: () => [] },
  localStorage: { getItem: k => memory.get(k) || null, setItem(k, v) { writes++; memory.set(k, String(v)); }, removeItem: k => memory.delete(k) } });
c.window = c;
const load = file => vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../assets/js", file), "utf8"), c);
for (const name of ["utils", "schema", "storage", "state", "harvest-ledger"]) load(`core/${name}.js`);
const R = c.RiceOS, S = R.state, L = R.harvestLedger;
R.utils.today = () => "2026-10-17"; R.utils.now = () => "2026-10-17T00:00:00Z";
assert(S.replace(R.schema.normalize({ varieties: [{ varietyId: "v", name: "Rice" }, { varietyId: "x", name: "Other" }],
  fields: [{ fieldId: "a", varietyId: "v", areaA: 100 }],
  fieldWorks: [{ workId: "old-work", date: "2026-09-01", workName: "Existing", fieldIds: ["a"] }],
  varietyResults: [{ resultId: "old", season: 2026, varietyId: "v", yield: "99999", salesAmount: "99999" }],
  shipments: [{ shipmentId: "legacy", season: 2026, date: "2026-10-01", varietyId: "v", recipient: "Old", riceType: "brown", quantity: "handwritten", amount: "9000" }], meta: { custom: "preserve" } })));
const legacy = JSON.stringify(S.data().varietyResults), work = JSON.stringify(S.data().fieldWorks);
const raw = () => JSON.stringify([S.data(), [...memory], writes]);
assert.equal(L.read(2026, "v").stock.hasHarvest, false);
const m = S.saveMillingRecord({ season: 2026, varietyId: "v", date: "2026-10-01", fieldIds: ["a"], packages: [{ kg: 30, bags: 100 }], looseKg: 0 }); assert(m);
assert.equal(L.read(2026, "v").stock.receivedKg, 3000);
const ship = (kind, bags, patch = {}) => S.saveShipment({ season: 2026, varietyId: "v", date: "2027-01-10", recipient: "Buyer", kind, riceType: "brown", packages: [{ kg: 30, bags }], ...patch });
const sale = ship("sale", 60, { pricePer60Kg: 24000 }); assert(sale);
const outgoing = ship("shipment", 2, { pricePer60Kg: 0 }); assert(outgoing);
assert(ship("gift", 2));
assert(ship("sale", 1, { riceType: "white", pricePer60Kg: 24000 }));
assert(ship("shipment", 1, { varietyId: "" }));
assert(ship("gift", 1, { season: 2025 }));
let result = L.read(2026, "v");
assert.equal(result.stock.remainingKg, 1080); assert.equal(result.outgoingKg, 1860); assert.equal(result.giftKg, 60);
assert.equal(result.salesYen, 732000); assert.equal(result.pricedCount, 3); assert.equal(result.unpricedCount, 1);
assert.equal(result.stock.whiteShipmentCount, 1); assert.equal(result.stock.unclassifiedCount, 1);
assert.equal(result.performance.balesPer10a, S.harvestPerformanceFor(2026).find(row => row.varietyId === "v").balesPer10a);
assert.equal(result.legacyCount, 1); assert.equal(L.read(2025, "v").giftKg, 30); assert.equal(L.read(2027, "v").outgoingKg, 0);
assert.equal(L.read(2026, "x").stock.dispatchedKg, 0);
assert(S.saveShipment({ shipmentId: sale.shipmentId, pricePer60Kg: 30000, grade: "1等", destinationName: "Depot" }));
assert.equal(L.read(2026, "v").stock.remainingKg, 1080); assert.equal(L.read(2026, "v").salesYen, 912000);
assert.equal(S.shipments().filter(row => row.shipmentId === sale.shipmentId).length, 1);
assert(S.saveShipmentIssue({ season: 2026, varietyId: "v", date: "2026-10-03", millingId: m.millingId, reason: "Check", costYen: 1000 }));
assert.equal(L.read(2026, "v").stock.remainingKg, 1080);
const routes = [];
R.app = { openInput(...args) { routes.push(args); }, back() { routes.push(["back"]); }, syncBackButton() {} };
load("screens/shipments.js");
hosts.shipmentContent = host(); hosts.harvestLedgerContent = host();
load("screens/harvest-ledger.js");
const screen = R.screens.harvestLedger, shipments = R.screens.shipments;
const before = raw();
screen.setScope({ season: 2026, varietyId: "v" }); screen.bind(); screen.bind();
assert.match(hosts.harvestLedgerContent.innerHTML, /class="hl-balance"/);
assert.match(hosts.harvestLedgerContent.innerHTML, /rice-sack\.png/);
const click = (attribute, dataset = {}) => hosts.harvestLedgerContent.listeners.click({ target: { closest: () => ({ disabled: false, dataset, hasAttribute: name => name === attribute }) } });
click("data-harvest-ledger-new-shipment");
assert.deepEqual(JSON.parse(JSON.stringify(routes.pop())), ["shipments", "harvest-ledger", { nested: true }]);
assert.match(hosts.shipmentContent.innerHTML, /name="season"[^>]*value="2026"/);
assert.match(hosts.shipmentContent.innerHTML, /value="v" selected/);
assert(shipments.handleBack()); assert.equal(raw(), before, "Opening/scoping/rendering/cancelling must not write");
shipments.openNew("2027-02-01", { season: 2025, varietyId: "v", kind: "gift" });
assert.match(hosts.shipmentContent.innerHTML, /value="gift" selected/); assert.match(hosts.shipmentContent.innerHTML, /name="season"[^>]*value="2025"/);
assert(shipments.handleBack()); assert(shipments.openDetail(sale.shipmentId));
assert.match(hosts.shipmentContent.innerHTML, /1等/); assert.match(hosts.shipmentContent.innerHTML, /Depot/);
assert(shipments.openDetail("legacy")); assert.match(hosts.shipmentContent.innerHTML, /等級：不明/);
assert.equal(raw(), before);
let scopeCall;
R.screens.results = { openMillingForYear(...args) { scopeCall = args; }, openMillingDetail(id) { scopeCall = id; }, openMillingLedger() { scopeCall = "ledger"; }, openShipmentIssues() { scopeCall = "issues"; } };
click("data-harvest-ledger-new-milling"); assert.deepEqual(JSON.parse(JSON.stringify(scopeCall)), ["2026", "v", { originOnly: true, fieldIds: [], date: R.utils.today() }]);
click("data-harvest-ledger-record", { harvestLedgerType: "milling", harvestLedgerRecord: m.millingId }); assert.equal(scopeCall, m.millingId);
click("data-harvest-ledger-record", { harvestLedgerType: "shipment", harvestLedgerRecord: sale.shipmentId }); assert.match(hosts.shipmentContent.innerHTML, /1等/);
click("data-harvest-ledger-issues"); assert.equal(scopeCall, "issues");
click("data-harvest-ledger-results"); assert.equal(scopeCall, "ledger");
result = L.read(2026, "v"); result.history.pop(); result.stock.remainingKg = 99999; result.performance.areaA = 1;
L.scopes(); assert.equal(raw(), before, "Pure reader returns isolated derived results");
assert.equal(JSON.stringify(S.data().varietyResults), legacy); assert.equal(JSON.stringify(S.data().fieldWorks), work);
const exported = JSON.stringify(S.data()); assert.equal(JSON.stringify(R.schema.normalize(JSON.parse(exported))), exported);
assert.equal(S.shipments().find(row => row.shipmentId === sale.shipmentId).grade, "1等");
assert.equal(Object.hasOwn(S.shipments().find(row => row.shipmentId === outgoing.shipmentId), "grade"), false);
shipments.bind();
const shipmentClick = attr => hosts.shipmentContent.listeners.click({ target: { closest: () => ({ hasAttribute: key => key === attr }) } });
const values = { date: "2027-01-10", season: "2026", kind: "sale", recipient: "Buyer", varietyId: "v", riceType: "brown", memo: "", pricePer60Kg: "30000", grade: "", destinationName: "Buyer" };
hosts.shipmentForm = { elements: { namedItem: key => ({ value: values[key] }) }, querySelectorAll: () => [{ querySelector: key => ({ value: key === "[data-shipment-kg]" ? "30" : "60" }) }] };
const submit = () => hosts.shipmentContent.listeners.submit({ target: { id: "shipmentForm" }, preventDefault() {} });
shipments.openDetail(sale.shipmentId); shipmentClick("data-shipment-edit"); submit();
let saved = S.shipments().find(row => row.shipmentId === sale.shipmentId);
assert.equal(saved.grade, ""); assert.equal(saved.destinationName, "");
assert.equal(L.read(2026, "v").stock.remainingKg, 1080);
values.grade = "0"; values.destinationName = "  Other depot  ";
shipmentClick("data-shipment-edit"); submit();
saved = S.shipments().find(row => row.shipmentId === sale.shipmentId);
assert.equal(saved.grade, "0", "Explicit grade text zero is distinct from unknown"); assert.equal(saved.destinationName, "Other depot");
assert.equal(L.read(2026, "v").stock.remainingKg, 1080);
shipments.openNew("2027-01-10", { season: 2026, varietyId: "v" });
values.grade = ""; values.destinationName = "Buyer"; submit();
saved = S.shipments().find(row => ![sale.shipmentId, outgoing.shipmentId, "legacy"].includes(row.shipmentId) && row.kind === "sale" && row.pricePer60Kg === 30000);
assert(saved); assert.equal(Object.hasOwn(saved, "grade"), false); assert.equal(Object.hasOwn(saved, "destinationName"), false);
assert.match(hosts.harvestLedgerContent.innerHTML, /<span>1\/10<\/span>/);
assert.doesNotMatch(hosts.harvestLedgerContent.innerHTML, /<span>2027\/1\/10/);

// Exercise the actual scoped workflow and app back functions with DOM rendering stubbed.
const resultsSource = fs.readFileSync(path.resolve(__dirname, "../assets/js/screens/results.js"), "utf8");
const appSource = fs.readFileSync(path.resolve(__dirname, "../assets/js/app.js"), "utf8");
function sourceFunction(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  assert(start >= 0, name);
  const end = source.indexOf("\n  function ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}
const workflow = vm.runInContext(`(function () {
  const RiceOS = window.RiceOS, U = { $: () => ({}) }, state = RiceOS.state;
  let millingOriginOnly = false, ledgerView = "milling-list", detailId = "", editorReturn = null, editorBaseline = "";
  let millingDraft = null, millingOriginal = null, millingLedgerMode = false, millingFormVisible = true, millingViewYear = "all", resultError = "";
  const ledgerHistory = [], viewState = () => ({view: ledgerView, id: detailId});
  function render() {} function syncNavigation() {} function renderMilling() {} function readMilling() {}
  function resetMilling() { millingDraft = {varietyId:"", packages:[], looseKg:0, memo:""}; millingOriginal = null; }
  function resetIssue() {} function resetForm() {}
  ${["startEditor", "finishEditor", "cancelEditor", "editorValue", "canHandleBack", "handleBack", "requestBack", "openMillingForYear"].map(name => sourceFunction(resultsSource, name)).join("\n")}
  let activeScreen = "results", inputOriginScreen = "harvest-ledger";
  let inputReturnContext = null, originPrimary = "";
  const inputOriginParents = [];
  function screenModule() { return {canHandleBack,handleBack}; }
  function updateBackButton() {} function show(screen) { activeScreen = screen; }
  ${sourceFunction(appSource, "hasInputChildRoute")}
  ${sourceFunction(appSource, "returnFromInput")}
  ${sourceFunction(appSource, "back")}
  return { open: openMillingForYear, back, cancel: requestBack, finish: () => finishEditor("milling", "saved"),
    dirty() { millingDraft.memo = "changed"; }, status: () => ({activeScreen, ledgerView, origin: millingOriginOnly, history: ledgerHistory.length}),
    reenter() { activeScreen = "results"; inputOriginScreen = "harvest-ledger"; },
    buttonCancel() { if (millingOriginOnly) requestBack(); else cancelEditor(); } };
})()`, c);
const noWrite = raw();
const previousBack = R.app.back; R.app.back = workflow.back;
assert(workflow.open(2026, "v", { originOnly: true })); workflow.back();
assert.equal(workflow.status().activeScreen, "harvest-ledger"); assert.equal(workflow.status().origin, false);
assert.equal(workflow.status().history, 0);
workflow.reenter(); assert(workflow.open(2026, "v", { originOnly: true })); workflow.dirty();
c.confirm = () => false; workflow.back(); assert.equal(workflow.status().activeScreen, "results"); assert.equal(workflow.status().origin, true);
c.confirm = () => true; workflow.buttonCancel(); assert.equal(workflow.status().activeScreen, "harvest-ledger");
workflow.reenter(); assert(workflow.open(2026, "v")); workflow.back();
assert.equal(workflow.status().activeScreen, "results", "Ordinary entry still cancels to its internal list");
workflow.reenter(); assert(workflow.open(2026, "v", { originOnly: true })); workflow.finish();
assert.equal(workflow.status().origin, false, "Save clears the one-shot cancellation origin");
assert.equal(workflow.status().activeScreen, "harvest-ledger", "Ledger-origin saves return to the common ledger");
workflow.reenter(); c.confirm = () => { throw Error("Completed milling must not be treated as an unsaved draft"); };
assert(workflow.open(2026, "v", { originOnly: true })); workflow.back();
c.confirm = () => true;
assert.equal(raw(), noWrite); R.app.back = previousBack;
assert(S.saveHarvestYearReview({ season: 2026, varietyId: "v", areaA: 50, completed: true }));
const yieldBefore = raw(); screen.render();
assert.match(hosts.harvestLedgerContent.innerHTML, /data-harvest-ledger-yield><strong>10\.0<\/strong>/);
assert.equal(raw(), yieldBefore);
const outsideDetails = () => hosts.harvestLedgerContent.innerHTML.split('<details class="hl-more">')[0];
assert.match(outsideDetails(), /自家用を除いた、玄米の出荷用参考残量/);
assert.match(outsideDetails(), /class="hl-warning" role="status">白米 1件・数量不足 1件・品種未設定 1件は残量に未反映/);
assert.match(outsideDetails(), /class="hl-warning" role="alert">出荷数量が収量を超えています/);
screen.setScope({ season: 2027, varietyId: "x" });
assert.match(outsideDetails(), /自家用を除いた、玄米の出荷用参考残量/);
assert.doesNotMatch(outsideDetails(), /class="hl-warning"/);
assert.equal(raw(), yieldBefore, "Visible warnings and empty-stock helper remain read-only");
console.log("harvest ledger PASS: real state, preservation, incoming/outgoing/gift, price-only edit, cross-year, legacy, read-only, cancellation, scoped routes and optional grade");
