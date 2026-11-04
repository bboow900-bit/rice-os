"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const memory=new Map();let writes=0;
const c=vm.createContext({console,navigator:{},alert(){},dispatchEvent(){},CustomEvent:class{},document:{getElementById:()=>null,querySelectorAll:()=>[]},localStorage:{getItem:k=>memory.get(k)||null,setItem(k,v){writes++;memory.set(k,String(v));},removeItem:k=>memory.delete(k)}});c.window=c;
for(const n of ["utils","schema","storage","state"])vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../assets/js/core",n+".js"),"utf8"),c);
const R=c.RiceOS,S=R.state;R.utils.today=()=>"2027-12-31";R.utils.now=()=>"2027-12-31T00:00:00Z";
const work=(id,date,cropYear,name,extra={})=>({workId:id,date,cropYear,workName:name,fieldIds:["a"],...extra});
const rows=[
work("autumn-prior-first","2025-10-05",2026,"秋耕起"),work("autumn-prior-last","2025-10-15",2026,"秋耕"),
work("autumn-current-first","2026-10-10",2027,"秋起こし",{fieldIds:["a","b"]}),work("autumn-current-last","2026-10-20",2027,"秋起し"),
work("spring-tillage","2027-03-01",2027,"耕起"),work("spring-tillage-prior","2026-03-02",2026,"耕起"),work("spring-other","2027-03-03",2027,"田起こし"),work("spring-other-alias","2027-03-04",2027,"田起し"),
work("ridge-prior","2026-04-01",2026,"くろぬり"),work("ridge-current","2027-04-01",2027,"畔塗り"),
work("puddle-prior","2026-05-01",2026,"代かき"),work("puddle-current","2027-05-02",2027,"代掻き"),
work("plant-prior","2026-05-10",2026,"田植"),work("plant-current","2027-05-08",2027,"田植え"),
work("harvest-prior","2026-09-10",2026,"稲刈"),work("harvest-current","2027-09-14",2027,"収穫"),
work("mow-prior-first","2026-06-10",2026,"草刈り"),work("mow-prior-last","2026-06-12",2026,"草刈り"),
work("mow-current-first","2027-06-05",2027,"草刈り"),work("mow-current-last","2027-09-01",2027,"草刈り"),
work("mow-other-label","2027-06-06",2027,"草刈"),work("only-prior","2026-07-01",2026,"防除"),work("only-current","2027-07-01",2027,"追肥"),
work("different-field","2027-05-01",2027,"田植え",{fieldIds:["b"],batchFieldIds:["a","b"]}),
work("planned","2027-05-01",2027,"田植え予定"),work("candidate","2027-05-01",2027,"田植え確認候補"),work("planned-prefix","2027-05-01",2027,"計画：田植え"),
work("off-field","2027-06-01",2027,"田植え",{targetScope:"offField",fieldIds:[]}),
work("invalid","2027-02-30",2027,"田植え"),work("future","2028-01-01",2027,"田植え"),work("unrelated-year","2024-05-01",2024,"田植え"),
{workId:"legacy-season",date:"2025-12-01",season:2026,workName:"legacy name",fieldIds:["a"]}
];
assert(S.replace(R.schema.normalize({fields:[{fieldId:"a"},{fieldId:"b"}],fieldWorks:rows,schedules:[{scheduleId:"s",date:"2027-05-02",fieldIds:["a"],title:"田植え"}],growthLogs:[{logId:"g",date:"2027-05-01",fieldId:"a"}]})));
const raw=()=>JSON.stringify([S.data(),[...memory],writes]);let before=raw();let result=S.annualWorkTimingComparisonFor("a",2027);assert.equal(raw(),before);assert.equal(result.year,2027);assert.equal(result.previousYear,2026);assert.equal(result.dateBasis,"crop-year-365-day-feb29-as-feb28");
const by=key=>result.rows.find(r=>r.key===key);
assert.equal(by("autumnTillage").current.firstDate,"2026-10-10");assert.equal(by("autumnTillage").previous.firstDate,"2025-10-05");assert.equal(by("autumnTillage").current.count,2);assert.equal(by("autumnTillage").previous.count,2);assert.equal(by("autumnTillage").firstDeltaDays,5);assert.equal(by("autumnTillage").lastDeltaDays,5);
assert.equal(by("ridgePlastering").firstDeltaDays,0);assert.equal(by("puddling").firstDeltaDays,1);assert.equal(by("planting").firstDeltaDays,-2);assert.equal(by("harvest").firstDeltaDays,4);
assert.equal(by("name:耕起").current.firstDate,"2027-03-01");assert.equal(by("name:耕起").firstDeltaDays,-1);assert.equal(by("name:田起こし").current.count,1);assert.equal(by("name:田起し").current.count,1);
const mow=by("name:草刈り");assert.equal(mow.current.count,2);assert.equal(mow.firstDeltaDays,-5);assert.equal(mow.lastDeltaDays,81);assert.equal(mow.current.records.length,2);assert.equal(mow.current.records[0].workName,"草刈り");assert(by("name:草刈"));
assert.equal(by("name:防除").current,null);assert.equal(by("name:防除").firstDeltaDays,null);assert.equal(by("name:追肥").previous,null);assert.equal(by("name:追肥").lastDeltaDays,null);assert.equal(by("name:legacy name").previous.firstDate,"2025-12-01");
assert.equal(result.excluded.length,2);assert(result.excluded.some(r=>r.workId==="invalid"));assert(result.excluded.some(r=>r.workId==="future"));assert(!result.rows.some(r=>(r.current?.records||[]).some(w=>w.workId==="different-field"||w.workId==="planned")));
const b=S.annualWorkTimingComparisonFor("b",2027).rows.find(r=>r.key==="autumnTillage");assert.equal(b.current.count,1);assert.equal(b.current.records[0].workId,"autumn-current-first");
result.rows[0].label="mutated";result.rows.find(r=>r.current).current.records[0].date="changed";result.excluded[0].reason="changed";assert.equal(raw(),before);
for(const y of [null,"",1899,2201,"2027.0"])assert.equal(S.annualWorkTimingComparisonFor("a",y).rows.length,0);assert.equal(S.annualWorkTimingComparisonFor("missing",2027).rows.length,0);
assert(S.replace(R.schema.normalize({fields:[{fieldId:"a"}],fieldWorks:[work("leap-current","2024-02-29",2024,"田植え"),work("leap-prior","2023-02-28",2023,"田植"),work("march-current","2024-03-01",2024,"草刈り"),work("march-prior","2023-03-01",2023,"草刈り"),work("offset-current","2023-12-31",2024,"他作業"),work("offset-prior","2023-01-01",2023,"他作業")]})));
result=S.annualWorkTimingComparisonFor("a",2024);assert.equal(result.rows.find(r=>r.key==="planting").firstDeltaDays,0);assert.equal(result.rows.find(r=>r.key==="name:草刈り").firstDeltaDays,0);assert.equal(result.rows.find(r=>r.key==="name:他作業").firstDeltaDays,-1);
assert(S.replace({...S.data(),fieldWorks:S.data().fieldWorks.filter(w=>w.workId!=="leap-prior")}));assert.equal(S.annualWorkTimingComparisonFor("a",2024).rows.find(r=>r.key==="planting").previous,null);
const json=JSON.stringify(S.data());assert(S.replace(JSON.parse(json)));before=raw();S.annualWorkTimingComparisonFor("a","2024");assert.equal(raw(),before);assert.equal(JSON.stringify(S.data()),json);
console.log("annual work timing comparison PASS");
