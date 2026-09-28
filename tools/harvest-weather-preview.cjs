"use strict";
// Local-only disposable fixture origin. Never used by the production app.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const fixture = fs.readFileSync(path.join(__dirname, "fixtures/harvest-weather-browser.json"), "utf8");
const mime = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".webp":"image/webp"};
http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4182");
  const name = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.resolve(root, "." + name);
  if (!file.startsWith(root + path.sep) || name === "/service-worker.js") { res.writeHead(404); return res.end(); }
  try {
    let body = fs.readFileSync(file);
    if (name === "/index.html") {
      const seed = `<script>if(location.hostname==='127.0.0.1'&&location.port==='4182'&&!localStorage.getItem('rice_os_v8_stable'))localStorage.setItem('rice_os_v8_stable',${JSON.stringify(fixture).replace(/</g,"\\u003c")});</script>`;
      body = body.toString().replace("<head>", "<head>" + seed);
    }
    res.writeHead(200, {"Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control":"no-store"});
    res.end(body);
  } catch (_) { res.writeHead(404); res.end(); }
}).listen(4182, "127.0.0.1", () => console.log("Fixture-only preview http://127.0.0.1:4182"));
