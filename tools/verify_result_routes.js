"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.resolve(__dirname,"../assets/js/screens/annual.js"),"utf8");
const route=source.match(/function openHarvestResults\(\) \{[\s\S]*?(?=\n  function openHarvestWork)/)[0];
for(const field of [{fieldId:"a",varietyId:"v"},null]){
  const calls=[], scoped=[];
  const c=vm.createContext({state:{field:()=>field},selectedFieldId:field?.fieldId||"",selectedTab:"karte",reviewView:"compare",compareFromHub:true,compareFilter:"harvest",topView:"fields",
    reviewYearValue:()=>"2026",U:{today:()=>"2026-11-14"},RiceOS:{navigation:{clear:()=>{throw Error("Must not clear review state");}},
      app:{openInput:(screen,origin)=>calls.push([screen,origin])},
      screens:{harvestLedger:{setScope:scope=>scoped.push(JSON.parse(JSON.stringify(scope)))},results:{editResult:()=>{throw Error("No automatic legacy editor");}}}}});
  vm.runInContext(`${route}\nopenHarvestResults();`,c);
  assert.deepEqual(calls,[["harvest-ledger","annual"]]);
  assert.deepEqual(scoped,[{season:"2026",varietyId:field?.varietyId||"",fieldIds:field?[field.fieldId]:[],date:"2026-11-14"}]);
  assert.equal(c.selectedFieldId,field?.fieldId||"");
  assert.equal(c.reviewView,"compare");assert.equal(c.compareFilter,"harvest");assert.equal(c.compareFromHub,true);
}
console.log("PASS annual harvest route: common ledger, selected year/variety, no automatic edits and unchanged review context");
