"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const memory = new Map(), control = {fail:false};
const c = vm.createContext({Blob, alert(){}, CustomEvent:class {}, dispatchEvent(){}, localStorage:{getItem:k => memory.get(k) ?? null, setItem(k,v){if(control.fail) throw Error("write failed"); memory.set(k,v);}}});
c.window = c;
for (const name of ["utils", "schema", "storage", "state", "material-purchases", "material-stock"]) vm.runInContext(fs.readFileSync(path.join(__dirname,"../assets/js/core",name + ".js"),"utf8"),c);
const R = c.RiceOS, P = R.materialPurchases, S = R.state, plain = x => JSON.parse(JSON.stringify(x));
R.utils.today = () => "2026-11-09"; R.utils.now = () => "2026-11-09T00:00:00Z";
const legacy = {purchaseId:"legacy",date:"2026-11-01",season:2026,quantity:2,unit:"kg",unitPrice:100};
assert.ok(S.replace({materials:[{materialId:"m",name:"Test",unit:"kg",purchases:[legacy]}]},"fixture"));
assert.ok(R.materialStock.saveStocktake("m",{date:"2026-11-01",quantity:10,unit:"kg"}));
const input = {date:"2026-11-02",season:2026,quantity:0.3,unit:"kg",totalAmount:300};
const purchase = P.savePurchase("m",input), pid = purchase.purchaseId;
const get = () => P.records("m").find(p => p.purchaseId === pid);
const raw = () => memory.get(R.schema.STORE_KEY);
const cancellationInput = {date:"2026-11-04",quantity:0.2,reason:"  欠品のため  "};
const receipt = P.saveReceipt("m",pid,{date:"2026-11-03",quantity:0.1,unit:"kg",memo:"delivery"});
const beforeReceipt = plain(get().receipts);
const cancellation = P.saveCancellation("m",pid,cancellationInput);
assert.ok(cancellation); assert.equal(cancellation.reason,"欠品のため");
assert.deepEqual(plain(get().receipts),beforeReceipt); assert.equal(get().quantity,0.3);
assert.deepEqual(plain(P.deliverySummary(get())),{received:0.1,cancelled:0.2,pending:0,legacy:false});
assert.deepEqual(plain(P.deliverySummary(get(),"2026-11-03")),{received:0.1,cancelled:0,pending:0.2,legacy:false});
assert.deepEqual(plain(P.deliverySummary(legacy)),{received:2,cancelled:0,pending:0,legacy:true});
assert.equal(P.amount(get()),300); assert.equal(R.materialStock.summary("m").quantity,10.1);
const baseline = raw();
for (const bad of [{date:"2026-11-10"},{date:"2026-02-30"},{quantity:0},{quantity:-1},{quantity:true},{quantity:Infinity},{quantity:"bad"},{reason:" "},{reason:1},{quantity:0.21},{cancellationId:"missing"}]) {
  assert.equal(P.saveCancellation("m",pid,{...cancellationInput,...bad}),null); assert.equal(raw(),baseline); assert.ok(P.lastError);
}
assert.equal(P.saveCancellation("m","legacy",cancellationInput),null);
assert.equal(P.saveCancellation("missing",pid,cancellationInput),null);
assert.equal(P.deleteCancellation("m",pid,"missing"),false);
assert.equal(P.saveReceipt("m",pid,{...receipt,quantity:0.11}),null);
assert.equal(P.saveReceipt("m",pid,{date:"2026-11-03",quantity:0.01,unit:"kg"}),null);
assert.equal(P.deletePurchase("m",pid),false);
assert.equal(P.savePurchase("m",{...get(),quantity:0.2}),null);
assert.equal(P.savePurchase("m",{...get(),unit:"bag"}),null);
assert.equal(raw(),baseline);
control.fail = true;
assert.equal(P.deleteCancellation("m",pid,cancellation.cancellationId),false);
assert.equal(P.saveCancellation("m",pid,{...cancellation,reason:"failure"}),null);
assert.equal(raw(),baseline); control.fail = false;
// Edits retain IDs, timestamps and unknown attributes after JSON roundtrip.
const extended = plain(S.data());
extended.materials[0].purchases.find(p => p.purchaseId === pid).cancellations[0].custom = {keep:true};
assert.ok(S.replace(extended,"fixture extension"));
const edited = P.saveCancellation("m",pid,{...cancellation,quantity:0.1,reason:"一部取消"});
assert.equal(edited.cancellationId,cancellation.cancellationId); assert.equal(edited.createdAt,cancellation.createdAt);
assert.deepEqual(plain(edited.custom),{keep:true});
assert.ok(P.saveReceipt("m",pid,{...receipt,quantity:0.2}));
assert.equal(P.saveCancellation("m",pid,{...edited,quantity:0.2}),null);
assert.ok(P.deleteCancellation("m",pid,cancellation.cancellationId));
assert.equal(P.deliverySummary(get()).pending,0.1);
assert.equal(P.deleteCancellation("m",pid,cancellation.cancellationId),false);
assert.equal(P.saveCancellation("m",pid,cancellation),null,"tombstone cannot revive");
assert.ok(P.deleteReceipt("m",pid,receipt.receiptId));
assert.equal(R.materialStock.summary("m").quantity,10);
const second = P.saveCancellation("m",pid,{...cancellationInput,quantity:0.3}); assert.ok(second);
assert.equal(P.deliverySummary(get()).pending,0);
assert.equal(P.amount(get()),300);
assert.deepEqual(plain(R.schema.normalize(plain(S.data())).materials),plain(S.data().materials));
const current = plain(S.data()), incoming = plain(current);
const incomingPurchase = incoming.materials[0].purchases.find(p => p.purchaseId === pid);
incomingPurchase.cancellations[0].reason = "stale";
incomingPurchase.cancellations[0].deletedAt = undefined;
incomingPurchase.cancellations[0].quantity = 0.01;
incomingPurchase.cancellations[1].quantity = 0.2;
incomingPurchase.cancellations.push({...second,cancellationId:"new-cancel",quantity:0.05,deletedAt:"2026-11-09T00:00:00Z",extra:"preserved"});
const merged = R.storage.mergeData(current,incoming).data;
const mergedPurchase = merged.materials[0].purchases.find(p => p.purchaseId === pid);
assert.equal(mergedPurchase.cancellations.length,3);
assert.deepEqual(plain(mergedPurchase.cancellations.slice(0,2)),plain(get().cancellations));
assert.equal(mergedPurchase.cancellations[2].extra,"preserved");
assert.deepEqual(plain(R.storage.mergeData(merged,incoming).data.materials),plain(merged.materials));
const invalidMutations = [p => p.cancellations = null,p => p.cancellations[1].reason = " ",p => p.cancellations[1].date = "2026-11-10",p => p.cancellations[1].quantity = 0,p => p.cancellations[1].quantity = 0.31,p => p.cancellations[1].createdAt = "bad",p => p.cancellations[1].deletedAt = "bad",p => p.cancellations.push({...p.cancellations[1]})];
for (const mutate of invalidMutations) {
  const bad = plain(current); mutate(bad.materials[0].purchases.find(p => p.purchaseId === pid));
  assert.throws(() => R.schema.normalize(bad));
}
const legacyBad = plain(current); legacyBad.materials[0].purchases[0].cancellations = []; assert.throws(() => R.schema.normalize(legacyBad));
// Only cancellation history (no receipt or stocktake) still protects purchase and master units.
const onlyCancellation = {...get(),purchaseId:"only-cancel",receipts:[]};
assert.ok(S.saveMaterial({name:"Cancellation only",unit:"kg",purchases:[onlyCancellation]}));
const mid = S.data().materials.find(m => m.name === "Cancellation only").materialId;
const protectedRaw = raw();
for (const change of [{purchases:[]},{purchases:[{...onlyCancellation,quantity:0.2}]},{purchases:[{...onlyCancellation,unit:"bag"}]},{purchases:[{...onlyCancellation,cancellations:[]}]},{unit:"bag"}]) {
  assert.equal(S.saveMaterial({materialId:mid,...change}),null); assert.equal(raw(),protectedRaw);
}
const erasedTombstone = plain(onlyCancellation); delete erasedTombstone.cancellations[0].deletedAt;
assert.equal(S.saveMaterial({materialId:mid,purchases:[erasedTombstone]}),null); assert.equal(raw(),protectedRaw);
// Each side is valid, but combining new IDs must not silently over-cancel.
const branch = plain(current), branchPurchase = branch.materials[0].purchases.find(p => p.purchaseId === pid);
branchPurchase.cancellations = [{...second,cancellationId:"parallel",quantity:0.1}];
assert.throws(() => R.storage.mergeData(current,branch)); assert.equal(raw(),protectedRaw);
console.log("PASS material cancellations: CRUD/tombstones, decimal/as-of totals, legacy, receipt bounds, unchanged money/stock, guards, rollback, schema, unknown attributes and nested merge conflicts");
