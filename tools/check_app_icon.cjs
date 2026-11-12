"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),os=require("node:os");
const {chromium}=require("C:/Users/Keisuke/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root=path.resolve(__dirname,".."), manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
const mime={".html":"text/html;charset=utf-8",".js":"text/javascript",".css":"text/css",".png":"image/png",".webmanifest":"application/manifest+json"};
function dimensions(file){const b=fs.readFileSync(path.join(root,file));assert.equal(b.toString("ascii",1,4),"PNG");return[b.readUInt32BE(16),b.readUInt32BE(20)];}
(async()=>{
 for(const size of [32,180,192,512])assert.deepEqual(dimensions(`assets/icons/rice-sun-v1-${size}.png`),[size,size]);
 for(const entry of manifest.icons){assert.equal(entry.purpose,"any");assert.ok(entry.src.includes("rice-sun-v1"));assert.equal(dimensions(entry.src).join("x"),entry.sizes);}
 const server=http.createServer((req,res)=>{const name=new URL(req.url,"http://localhost").pathname;const file=path.resolve(root,"."+(name==="/"?"/index.html":name));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});res.end(err?"Not found":data);});});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
  const p=await browser.newPage({viewport:{width:390,height:600},serviceWorkers:"block"});await p.route("https://**/*",r=>r.abort());
  await p.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"networkidle"});
  assert.match(await p.locator('link[rel="icon"]').getAttribute("href"),/rice-sun-v1-32.png$/);
  assert.match(await p.locator('link[rel="apple-touch-icon"]').getAttribute("href"),/rice-sun-v1-180.png$/);
  assert.equal(await p.locator('link[rel="apple-touch-icon"]').getAttribute("sizes"),"180x180");
  const loaded=await p.evaluate(async()=>{const manifest=await(await fetch(document.querySelector('link[rel="manifest"]').href)).json();for(const icon of manifest.icons){const image=new Image();image.src=icon.src;await image.decode();if(image.naturalWidth!==Number(icon.sizes.split("x")[0]))throw Error("Icon size mismatch");}return manifest.icons.length;});assert.equal(loaded,2);
  await p.setContent(`<html lang="ja"><body style="margin:0;padding:28px;background:#f4f8f5;font-family:system-ui;color:#203c30"><h2 style="font-size:20px">稲作カルテ</h2><p>アイコン表示確認</p><img src="http://127.0.0.1:${server.address().port}/assets/icons/rice-sun-v1-192.png" width="180" height="180" style="border-radius:38px"><div style="display:flex;gap:24px;align-items:center;margin-top:28px">${[64,48,32].map(size=>`<div><img src="http://127.0.0.1:${server.address().port}/assets/icons/rice-sun-v1-192.png" width="${size}" height="${size}" style="border-radius:${Math.round(size*.2)}px"><p>${size}px</p></div>`).join("")}</div></body></html>`);
  for(const img of await p.locator("img").all())await img.evaluate(el=>el.decode());
  const screenshot=path.join(os.tmpdir(),"rice-app-icon-v1-preview.png");await p.screenshot({path:screenshot});console.log(screenshot);console.log("PASS app icon: dimensions, manifest, browser favicon, Apple touch icon, network decoding and small-size preview");
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
