"use strict";
const assert=require("node:assert/strict");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block"});
  try {
   const page=await context.newPage();
   await page.route("https://**/*",route=>{
    const host=new URL(route.request().url()).hostname;
    return ["api.open-meteo.com","archive-api.open-meteo.com"].includes(host)?route.continue():route.abort();
   });
   await page.goto("http://127.0.0.1:4182/index.html",{waitUntil:"networkidle"});
   const result=await page.evaluate(async()=>{
    const U=RiceOS.utils,before=localStorage.getItem(RiceOS.schema.STORE_KEY),today=U.today();
    const location={latitude:37.75,longitude:140.47}; // Public reference coordinate, not a user's saved location.
    const fetchRange=(a,b)=>Promise.race([RiceOS.weather.fetchDailyRange(a,b,location),new Promise((_,reject)=>setTimeout(()=>reject(Error("Live weather check timed out")),30000))]);
    const archive=await fetchRange(U.dateAddDays(today,-10),U.dateAddDays(today,-8));
    const forecast=await fetchRange(today,U.dateAddDays(today,6));
    return {archive:{count:archive.count,rows:archive.rows,timezone:archive.timezone},forecast:{count:forecast.count,rows:forecast.rows,timezone:forecast.timezone},unchanged:before===localStorage.getItem(RiceOS.schema.STORE_KEY)};
   });
   assert.equal(result.archive.count,3);assert.equal(result.forecast.count,7);
   for(const [key,source] of [["archive","Open-Meteo Archive"],["forecast","Open-Meteo Forecast"]]) {
    assert.equal(result[key].timezone,"Asia/Tokyo");
    assert(result[key].rows.every(row=>row.source===source&&typeof row.tempMean==='number'&&Number.isFinite(row.tempMean)));
   }
   assert(result.unchanged);
   console.log("PASS live browser weather: archive 3 days, forecast 7 days, finite daily means, timezone/source preserved, no farm-store writes");
  } finally {await context.close();}
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
