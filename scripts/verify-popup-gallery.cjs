"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const code = read("extension/popup-gallery.js");

for (const name of [
  "extension/popup-gallery.js", "extension/shelf-gallery-preview.js",
  "extension/popup.js", "extension/shelf.js", "extension/background-sidepanel.js"
]) new vm.Script(read(name), {filename:name});

const manifest = JSON.parse(read("extension/manifest.json"));
assert.equal(manifest.action.default_popup, undefined,
  "Chrome's native action popup must be replaced by the persistent window");
assert.equal(manifest.background.service_worker, "background-entry.js");
assert(read("extension/popup.html").includes('id="gallery-density"'));
assert(read("extension/popup.html").includes('id="history-page-next"'));
assert(read("extension/popup-gallery.css").includes("grid-auto-rows:var(--chutey-gallery-tile-size"));
assert(read("extension/popup-gallery.css").includes("height:var(--chutey-gallery-tile-size"));
assert(read("extension/popup-gallery.css").includes("display:none !important;"));
assert(read("extension/shelf-gallery-preview.js").includes('historyList?.addEventListener("click", openFromHistory)'));
assert(read("extension/shelf-gallery-preview.js").includes("clickedRow"));
assert(read("extension/shelf.js").includes("row.__chuteyFile = file"));
assert(read("extension/shelf.js").includes('location.pathname.endsWith("/popup.html") ? 30'));
assert(read("extension/popup-gallery.css").includes("prefers-reduced-motion:reduce"));

function control(value) {
  return {
    value, textContent:"", handlers:{},
    addEventListener(type, fn) { this.handlers[type] = fn; }
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const dial = control("0"), label = control(""), size = control("half");
  const status = control("");
  const grid = {clientWidth:370,style:{
    values:{},
    setProperty(key,value){this.values[key]=value;}
  }};
  const mapped = {
    "#gallery-density":dial,
    "#gallery-density-value":label,
    "#shelf-viewer-size":size,
    "#status":status,
    "#files":grid
  };
  const props = {}, saved = {}, created = [], opening = [];
  let closed = 0;
  const chrome = {
    action:{},
    runtime:{getURL:path=>"chrome-extension://fixture/"+path},
    storage:{
      sync:{
        get:async()=>({chutePopupGridStep:0,chuteShelfViewerSize:"half"}),
        set:async value=>{saved.settings = {...saved.settings,...value};}
      },
      session:{
        get:async name=>({[name]:saved[name]}),
        set:async value=>{Object.assign(saved,value);}
      },
      onChanged:{addListener(){}}
    },
    windows:{
      getCurrent:async()=>({id:19,left:0,top:0,width:1366,height:750}),
      get:async id=>id===19?{id:19,left:0,top:0,width:1366,height:750}:{id},
      create:async options=>{created.push(options);return{id:42};},
      update:async()=>({id:42})
    },
    sidePanel:{open:async value=>{opening.push(value);}}
  };
  const browserContext = {
    document:{
      body:{style:{setProperty(k,v){props[k]=v;}},dataset:{}},
      querySelector:key=>mapped[key]||null
    },
    chrome,
    location:{pathname:"/popup.html",search:""},
    window:{
      close(){closed++;},
      addEventListener(){}
    },
    URLSearchParams,console,
    getComputedStyle:()=>({
      paddingLeft:"10px",paddingRight:"10px",paddingTop:"8px",
      paddingBottom:"8px",columnGap:"6px",rowGap:"6px"
    }),
    selectedDay:"",currentPage:0,
    createRow:()=>({
      handlers:{},dataset:{},classList:{add(){}},
      addEventListener(type,fn){this.handlers[type]=fn;},
      setAttribute(){}
    })
  };
  vm.runInNewContext(code,browserContext);
  await tick();
  assert.equal(props["--chutey-gallery-columns"],"4");
  assert.equal(label.textContent,"4 × 4");
  assert.equal(grid.style.values["--chutey-gallery-tile-size"],"83px",
    "4 columns must reserve real physical tile height immediately");
  for(const [step,name] of [[1,"5x4"],[2,"5x5"],[3,"6x5"],[0,"4x4"]]) {
    dial.value=String(step);
    dial.handlers.input();
    assert.equal(browserContext.document.body.dataset.galleryLayout,name);
  }
  assert.equal(saved.settings.chutePopupGridStep,0);
  size.value="full";size.handlers.change();
  assert.equal(saved.settings.chuteShelfViewerSize,"full");

  const file={id:"a".repeat(32),name:"lake.png",mime:"image/png",created_at:"2026-11-04T09:00:00Z"};
  const row=browserContext.createRow(file,3);
  row.handlers.click({target:{closest:()=>null},defaultPrevented:false});
  await tick(); await tick();
  assert.equal(opening.length,1);
  assert.deepEqual(opening[0],{windowId:19});
  assert.equal(created.length,1,"Transient launcher must open exactly one persistent gallery");
  assert.match(created[0].url,/popup\.html\?detached=1&browserWindow=19/);
  assert.equal(created[0].left,8,"Gallery should be left of the Shelf");
  assert.equal(closed,1,"Only the transient action popup closes");
  assert.equal(saved.chuteyPopupOpenItem.id,file.id);
  assert.equal(saved.chuteyPopupOpenItem.index,3);
  assert.equal(saved.chuteyPopupOpenItem.windowId,19);

  const ignored=browserContext.createRow(file,4);
  ignored.handlers.click({target:{closest:()=>({})},defaultPrevented:false});
  assert.equal(opening.length,1,"Existing per-item controls must not also open the Shelf");

  // Real toolbar action: opens/focuses a single persistent gallery even before
  // any card click, not Chrome's native temporary popup. Reuses the same worker.
  let onAction = null, openCount=0, focusedCount=0;
  const windows = {};
  const background = {
    chrome:{
      action:{onClicked:{addListener(fn){onAction=fn;}}},
      sidePanel:{open:async()=>{}},
      runtime:{getURL:p=>"chrome-extension://fixture/"+p},
      windows:{
        get:async id=>{
          if (id===19) return {id,left:0,top:0,width:1366,height:750};
          return {id};
        },
        create:async opts=>{openCount++;return{id:100};},
        update:async()=>{focusedCount++;}
      },
      storage:{session:{
        get:async name=>({[name]:windows[name]}),
        set:async obj=>Object.assign(windows,obj)
      }}
    },
    console
  };
  vm.runInNewContext(read("extension/background-sidepanel.js"),background);
  assert.equal(typeof onAction,"function");
  onAction({windowId:19}); await tick(); await tick();
  assert.equal(openCount,1);
  onAction({windowId:19}); await tick(); await tick();
  assert.equal(openCount,1,"A second toolbar click should not create another gallery");
  assert.equal(focusedCount,1);

  console.log("PASS: 4x4→6x5 density, explicit grid dimensions, 30-item cap, full/half, click handoff, persistent toolbar gallery and one-window reuse");
})().catch(error=>{console.error(error);process.exitCode=1;});
