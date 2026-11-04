"use strict";
// Focused, cheap popup behavior contract; not a substitute for installed Chrome.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const read = name => fs.readFileSync(path.join(root,name),"utf8");
const source = read("extension/popup-gallery.js");
for(const name of ["extension/popup-gallery.js","extension/shelf-gallery-preview.js","extension/popup.js","extension/shelf.js"]) {
  new vm.Script(read(name),{filename:name});
}
assert(read("extension/popup.html").includes('id="gallery-density"'));
assert(read("extension/popup.html").includes('id="shelf-viewer-size"'));
assert(read("extension/popup.html").includes('src="popup-gallery.js"'));
assert(read("extension/shelf.html").includes('src="shelf-gallery-preview.js"'));
assert(read("extension/shelf.html").includes('href="shelf-gallery-preview.css"'));
assert(read("extension/shelf.js").includes('location.pathname.endsWith("/popup.html") ? 30'));
assert(read("extension/popup-gallery.css").includes("aspect-ratio:1 / 1"));
assert(read("extension/popup-gallery.css").includes("overflow-y:auto"));
assert(read("extension/popup-gallery.css").includes("prefers-reduced-motion:reduce"));
assert(read("extension/shelf-gallery-preview.js").includes('fetchHistoryPage(day,page)'));
assert(read("extension/shelf-gallery-preview.js").includes('document.querySelector("#chutey-tab-history")'));
assert(read("extension/shelf-gallery-preview.js").includes("getBoundingClientRect().bottom"));
assert(read("extension/shelf-gallery-preview.js").includes("chrome.storage.session.remove(KEY)"));
assert(read("extension/popup.html").includes('id="history-pagination"'));
assert(read("extension/popup.html").includes('id="history-page-next"'));

// Minimal DOM boundary; production handlers run unchanged. The Chromium oracle
// additionally checks real layout, hit targets, decoded images and screenshots.
class Element {
  constructor() {
    this.handlers={}; this.children=new Map(); this.attributes={}; this.hidden=false;
    this.isConnected=true; this.clientWidth=364; this.value=""; this.dataset={};
    const classes=new Set();
    this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),
      toggle:(x,force)=>{const on=force ?? !classes.has(x);on?classes.add(x):classes.delete(x);return on;}};
    const props={}; this.style={setProperty:(k,v)=>{props[k]=v;},getPropertyValue:k=>props[k]||""};
  }
  addEventListener(event,fn){this.handlers[event]=fn;}
  querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
  querySelectorAll(){return [];}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  append(){} focus(){} getBoundingClientRect(){return {bottom:150};}
}
(async()=>{
  const dial=new Element(),label=new Element(),size=new Element(),status=new Element(),grid=new Element(),body=new Element();
  dial.value="0";size.value="half";
  const mapped={"#gallery-density":dial,"#gallery-density-value":label,"#shelf-viewer-size":size,"#status":status,"#files":grid};
  const rows=[],settingWrites=[],sessionWrites=[],created=[];let opened=0,closed=0;
  const document={body,querySelector:key=>mapped[key]||null,
    querySelectorAll:()=>rows,addEventListener(){},
    createElement(){const node=new Element();created.push(node);return node;}};
  const chrome={storage:{sync:{get:async()=>({chutePopupGridStep:0,chuteShelfViewerSize:"half"}),set:async x=>settingWrites.push(x)},
    session:{set:async x=>sessionWrites.push(x)},onChanged:{addListener(){}}},
    tabs:{query:async()=>[{windowId:19}]},sidePanel:{open:async()=>{opened++;}}};
  const context={document,chrome,location:{pathname:"/popup.html"},
    window:{close(){closed++;},addEventListener(){}},queueMicrotask,
    getComputedStyle:()=>({paddingLeft:"0",paddingRight:"0",columnGap:"6"}),
    MutationObserver:class{observe(){}},selectedDay:"",currentPage:0,
    fileUrl:file=>"http://127.0.0.1:17891/api/files/"+file.id,
    isPreviewableImage:file=>file.mime.startsWith("image/"),
    createRow:()=>{const row=new Element();rows.push(row);return row;},console};
  vm.runInNewContext(source,context,{filename:"extension/popup-gallery.js"});
  await Promise.resolve();await Promise.resolve();
  assert.equal(body.dataset.galleryLayout,"4x4");
  assert.equal(label.textContent,"4 × 4");
  for(const [step,expected] of [[1,"5x4"],[2,"5x5"],[3,"6x5"],[0,"4x4"]]) {
    dial.value=String(step);dial.handlers.input();assert.equal(body.dataset.galleryLayout,expected);
  }
  assert(settingWrites.some(x=>x.chutePopupGridStep===3));
  size.value="full";size.handlers.change();assert(settingWrites.some(x=>x.chuteShelfViewerSize==="full"));
  const file={id:"a".repeat(32),name:"lake.png",mime:"image/png",created_at:"2026-11-04T09:00:00Z"};
  const row=context.createRow(file,0);
  const event={target:{closest:()=>null},defaultPrevented:false,stopPropagation(){}};
  row.handlers.click(event);
  assert(row.classList.contains("chutey-gallery-expanded"));
  assert.equal(opened,0,"Caption selects the card without opening Shelf");
  row.querySelector(".file-icon").handlers.click(event);
  const lightbox=created[0];assert.equal(lightbox.hidden,false);
  assert.equal(opened,0,"Picture opens the local preview only");
  assert.equal(lightbox.querySelector(".chutey-lightbox-image").src,context.fileUrl(file));
  await lightbox.querySelector(".chutey-lightbox-shelf").handlers.click();
  assert.equal(opened,1);assert.equal(closed,1);assert.equal(sessionWrites.length,1);
  const intent=sessionWrites[0].chuteyPopupOpenItem;
  assert.equal(intent.id,file.id);assert.equal(intent.windowId,19);assert.equal(intent.day,"2026-11-04");
  assert.equal(intent.index,0);assert.equal(intent.scope,"live");
  lightbox.querySelector(".chutey-lightbox-close").handlers.click();assert.equal(lightbox.hidden,true);
  const expanded=row.classList.contains("chutey-gallery-expanded");
  row.handlers.click({...event,target:{closest:()=>({})}});
  assert.equal(row.classList.contains("chutey-gallery-expanded"),expanded,"Action buttons remain isolated");
  console.log("PASS: all density controls, caption expansion, local image lightbox, explicit Shelf handoff and action isolation (DOM fixture)");
})().catch(error=>{console.error(error);process.exitCode=1;});
