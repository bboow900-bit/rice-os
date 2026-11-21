const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path"), os = require("node:os");
const filename = path.join(__dirname, "check_annual_reflection_primary.cjs");
let source = fs.readFileSync(filename, "utf8");
const hook = `const audit=await page.locator('#screen-annual').evaluate(root=>{
  return [...root.querySelectorAll('h2,h3,h4,b,strong,small,time,summary,button,label,dt,dd,p,span,em,input,select')]
    .filter(el=>el.getClientRects().length && el.textContent.trim() && !el.children.length)
    .map(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();
      return {tag:el.tagName,cls:el.className,text:el.textContent.trim().slice(0,90),size:c.fontSize,weight:c.fontWeight,
        family:c.fontFamily,line:c.lineHeight,color:c.color,background:c.backgroundColor,
        width:r.width,height:r.height,overflow:el.scrollWidth>el.clientWidth+1,clipped:el.scrollHeight>el.clientHeight+2};
    });
});
fs.writeFileSync(path.join(os.tmpdir(), 'rice-type-'+name+'-'+width+'.json'),JSON.stringify(audit,null,2));
`;
source = source.replace("await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-${name}-${width}.png`)});", hook + "await page.screenshot({path:path.join(os.tmpdir(),`rice-annual-reflection-${name}-${width}.png`)});");
source = source.replace('await shot(\'work\');', "await shot('work');");
vm.runInNewContext(source,{require,fs,__dirname,__filename:filename,console,process,Buffer,setTimeout,clearTimeout},{filename});
