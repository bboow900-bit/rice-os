"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname,"..");
const source = fs.readFileSync(path.join(root,"assets/js/screens/annual.js"),"utf8");
const growth = [
  {logId:"leaf",fieldId:"f",date:"2026-06-01",leafColor:4,memo:"Original leaf observation"},
  {logId:"photo",fieldId:"f",date:"2026-06-02",photoData:"data:image/png;base64,fixture"},
  {logId:"panicle",fieldId:"f",date:"2026-07-20",panicleLengthMm:1},
  {logId:"heading",fieldId:"f",date:"2026-07-27",headingObserved:true}
];
const works = [{workId:"mow",date:"2026-07-01",workName:"草刈り",fieldIds:["f"]}];
const data = {growthLogs:growth,fieldWorks:works};
const before = JSON.stringify(data);
const R = {utils:{number:(value,fallback)=>Number(value)||fallback},state:{
  data:()=>data,
  timelineEntriesForField:()=>({works,headingWorks:[],growth,waterPeriods:[],others:[]})
}};
const c = vm.createContext({window:{RiceOS:R,__RICEOS_TEST__:true},console});
vm.runInContext(source,c);
const T = R.annualTest, field={fieldId:"f"};
const rows=T.fieldYearTimeline(field,"2026");
assert.equal(rows.length,5,"Ordinary growth and photo observations are retained alongside milestones");
assert.equal(rows.find(row=>row.id==='leaf').label,"生育記録");
assert.equal(rows.find(row=>row.id==='leaf').milestone,"");
assert(T.isRoutineRecord(rows.find(row=>row.id==='leaf')));
assert(!T.isRoutineRecord(rows.find(row=>row.id==='heading')));
assert.equal(rows.filter(row=>T.historyMatches(row,field,"growth")).length,4);
assert.equal(rows.filter(row=>T.historyMatches(row,field,"work")).length,1);
assert.equal(rows.filter(row=>T.historyMatches(row,field,"photos")).length,1);
assert.equal(JSON.stringify(data),before,"Filtering and derived timeline preserve all original values");
const tabs=source.slice(source.indexOf('  function renderTabs('),source.indexOf('  function fieldYearRows('));
assert(!tabs.includes('data-annual-tab='),"No duplicate five-tab record surface");
assert(tabs.includes('renderWaterTab(field)'),"Legacy water reconciliation remains reachable");
assert(source.includes('data-annual-history-category'));
assert(source.includes('data-annual-field-settings'));
assert(source.includes('RiceOS.app.openInput("harvest-ledger", "annual")'));
assert(!source.includes('data-annual-results>品種集計の結果へ'));
console.log("PASS unified review: ordinary observations/photos retained, factual milestones, read-only filters, shared destinations");
