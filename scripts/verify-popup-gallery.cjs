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

function control(value) {
  return {value, textContent:"",handlers:{}, addEventListener(event,callback){this.handlers[event]=callback;}};
}
(async()=>{
  const dial=control("0"),label=control(""),size=control("half"),status=control("");
  const mapped={"#gallery-density":dial,"#gallery-density-value":label,"#shelf-viewer-size":size,"#status":status};
  const props={},settingWrites=[],sessionWrites=[],messages={};
  const changed={};
  let opened=0,closed=0;
  const document={
    body:{style:{setProperty(key,value){props[key]=value;}},dataset:{}},
    querySelector:key=>mapped[key]||null
  };
  const chrome={
    storage:{
      sync:{get:async()=>({chutePopupGridStep:0,chuteShelfViewerSize:"half"}),set:async value=>settingWrites.push(value)},
      session:{set:async value=>sessionWrites.push(value)},
      onChanged:{addListener(handler){changed.handler=handler;}}
    },
    tabs:{query:async()=>[{windowId:19}]},
    sidePanel:{open:async()=>{opened++;}}
  };
  function makeRow(){
    const handlers={};
    return {handlers,tabIndex:-1,title:"",classList:{add(){}},
      setAttribute(){},addEventListener:(event,fn)=>{handlers[event]=fn;}};
  }
  const context={
    document,chrome,location:{pathname:"/popup.html"},window:{close(){closed++;}},
    selectedDay:"",currentPage:0,
    createRow:()=>makeRow(),console
  };
  vm.runInNewContext(source,context,{filename:"extension/popup-gallery.js"});
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(props["--chutey-gallery-columns"],"4");
  assert.equal(document.body.dataset.galleryLayout,"4x4");
  assert.equal(label.textContent,"4 × 4");
  for(const [step,expected] of [[1,"5x4"],[2,"5x5"],[3,"6x5"],[0,"4x4"]]) {
    dial.value=String(step);dial.handlers.input();
    assert.equal(document.body.dataset.galleryLayout,expected);
  }
  assert(settingWrites.some(x=>x.chutePopupGridStep===3));
  size.value="full";size.handlers.change();
  assert(settingWrites.some(x=>x.chuteShelfViewerSize==="full"));
  const file={id:"a".repeat(32),name:"lake.png",mime:"image/png",created_at:"2026-11-04T09:00:00Z"};
  const row=context.createRow(file,3);
  row.handlers.click({target:{closest:()=>null},defaultPrevented:false});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(opened,1);
  assert.equal(closed,1);
  assert.equal(sessionWrites.length,1);
  const intent=sessionWrites[0].chuteyPopupOpenItem;
  assert.equal(intent.id,file.id);
  assert.equal(intent.windowId,19);
  assert.equal(intent.day,"2026-11-04");
  assert.equal(intent.index,3);
  assert.equal(intent.scope,"live");
  const another=context.createRow(file,4);
  another.handlers.click({target:{closest:tag=>tag==="button,input,a,select"?{}:null},defaultPrevented:false});
  assert.equal(opened,1,"Action buttons must not also open the gallery");
  console.log("PASS: 4x4 default, instant 5x4/5x5/6x5 dial, 30-item popup cap, session-scoped Shelf handoff and button isolation (VM fixture)");
})().catch(error=>{console.error(error);process.exitCode=1;});
