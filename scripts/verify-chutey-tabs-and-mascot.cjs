"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const get = p => fs.readFileSync(path.join(root, p), "utf8");
const tabsCode = get("extension/workspace-tabs.js");
const content = get("extension/content.js");
const hideCode = get("extension/content-auto-hide.js");
const html = get("extension/shelf.html");
const css = get("extension/shared.css");
const tabsCSS = get("extension/workspace-tabs.css");
const explorerCSS = get("extension/explorer-shell.css");
const shell = get("extension/shelf.js");
const before = get("extension/workflow-fixes.js");

assert(html.includes('id="chutey-tab-history"'));
assert(html.includes('id="chutey-tab-explorer"'));
assert(html.includes('role="tabpanel"'));
assert(html.includes('title="Clear Live Chutey" aria-label="Clear Live Chutey"'));
assert(html.includes('Your Everything'));
assert(html.includes('class="logo"><img src="icons/icon32.png"'));
assert(css.includes("background: #11130f;") && css.includes("image-rendering: pixelated;"));
assert(tabsCSS.includes("aria-selected"));
assert(explorerCSS.includes("--chutey-explorer-background"));
assert(before.includes("showThumbnail(img, source)"), "Real saved image preview must remain");
assert(shell.includes("statusElement.hidden = !error"), "Routine 1-40 history count must not be displayed");
assert(!html.includes('class="secondary-button">Clear live chute</button>'));
assert(css.includes(".file-list { padding: 8px 20px 9px 9px;"), "Keep 20px gutter beside native scrollbar");
assert(css.includes("padding: 8px 20px 8px 9px;"), "Calendar row and cards must share exact left/right gutters");
assert(css.includes("grid-template-columns: 31px minmax(0, 1fr) auto 31px;"), "Calendar arrows retain uniform widths");
assert(css.includes("max-width: 195px;"), "Calendar button must be slightly narrower");
assert(css.includes("width: min(330px, calc(100% - 29px));"), "Calendar popover respects scrollbar gutter");
assert(css.includes("min-height: 59px;"), "Cards should be compact without clipping thumbnails");
assert(css.includes(".file-tools button { padding: 5px 7px;"), "Keep action buttons compact in side panel");


function node(name) {
  const handlers = {};
  const attributes = {};
  const classes = new Set();
  return {
    name, hidden:false, tabIndex:0, attributes, handlers,
    classList:{
      toggle(k,active){ if(active) classes.add(k); else classes.delete(k); },
      contains(k){return classes.has(k);}
    },
    setAttribute(k,v){attributes[k]=v;},
    addEventListener(type,handler){handlers[type]=handler;},
    focus(){this.focused=true;},
    click(){handlers.click?.();},
    press(key){let prevented=false;handlers.keydown?.({key,preventDefault(){prevented=true;}});return prevented;}
  };
}
async function tabsInstance(store) {
  const history=node("history"),explorer=node("explorer");
  const historyPanel=node("historyPanel"),explorerPanel=node("explorerPanel");
  explorerPanel.hidden=true;
  const refresh=node("refresh"),clear=node("clear");
  const nav={children:[history,explorer],prepend(node){
    this.children=this.children.filter(x=>x!==node);
    this.children.unshift(node);
  }};
  const nodes={
    "#chutey-workspace-tabs":nav,
    "#chutey-tab-history":history,
    "#chutey-tab-explorer":explorer,
    "#chutey-history-view":historyPanel,
    "#chutey-explorer-view":explorerPanel,
    "#refresh":refresh,"#clear":clear
  };
  const chrome={storage:{local:{
    get:async defaults=>Object.assign({},defaults,store),
    set:async item=>Object.assign(store,item)
  }}};
  vm.runInNewContext(tabsCode,{document:{querySelector:k=>nodes[k]||null},chrome});
  await Promise.resolve();await Promise.resolve();
  return {nav,history,explorer,historyPanel,explorerPanel,refresh,clear,store};
}
async function tabsTest(){
  const store={};
  let ui=await tabsInstance(store);
  assert.equal(ui.nav.children[0].name,"history");
  assert.equal(ui.historyPanel.hidden,false);
  assert.equal(ui.explorerPanel.hidden,true);
  ui.explorer.click();
  await Promise.resolve();await Promise.resolve();
  assert.equal(ui.nav.children[0].name,"explorer","Selected Explorer tab must move left");
  assert.equal(ui.historyPanel.hidden,true);
  assert.equal(ui.explorerPanel.hidden,false);
  assert.equal(ui.clear.hidden,true);
  assert.equal(ui.refresh.hidden,true);
  assert.equal(store.chuteyShelfActiveTab,"explorer");
  ui=await tabsInstance(store);
  assert.equal(ui.nav.children[0].name,"explorer","Reopen Shelf at last view");
  assert.equal(ui.explorerPanel.hidden,false);
  assert.equal(ui.explorer.attributes["aria-selected"],"true");
  assert(ui.explorer.press("ArrowRight"),"Keyboard tab nav enabled");
  assert.equal(store.chuteyShelfActiveTab,"history");
  ui=await tabsInstance(store);
  assert.equal(ui.nav.children[0].name,"history");
  assert.equal(ui.clear.hidden,false);
}
function testContentVisibility(){
  const start=content.indexOf("  function renderVisibility() {");
  const end=content.indexOf("\n  function renderSize() {",start);
  assert(start>=0&&end>start);
  const fn=content.slice(start,end);
  for(const [mode,autoHide,visible] of [
    ["floating",true,true],["both",true,true],
    ["floating",false,true],["context",false,true],["context",true,false]
  ]){
    const host={style:{}};
    vm.runInNewContext(fn+"\nrenderVisibility();",{
      host,accessMode:mode,autoHide,
      floatingEnabled:m=>m==="floating"||m==="both"
    });
    assert.equal(host.style.display,visible?"block":"none",`Mascot visibility for ${mode} autoHide=${autoHide}`);
  }
}
function hideTest(mode,autoHide){
  let now=0,sequence=0;
  const timers=new Map();
  function setTimeoutFake(callback,delay){
    const id=++sequence;
    timers.set(id,{at:now+Number(delay),callback});
    return id;
  }
  function clearTimeoutFake(id){timers.delete(id);}
  function tick(ms) {
    const end=now+ms;
    while(true){
      const due=[...timers.entries()].filter(([id,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at);
      if(!due.length)break;
      const [id,t]=due[0];timers.delete(id);now=t.at;t.callback();
    }
    now=end;
  }
  const host={style:{},addEventListener() {},getBoundingClientRect(){return {left:920,right:1010,top:700,bottom:802};}};
  const document={documentElement:{},hidden:false,getElementById:id=>id==="__chute_sticky_host"?host:null,addEventListener(){}};
  const window={innerWidth:1024,innerHeight:768,addEventListener(){},visualViewport:null};
  window.top=window;
  const chrome={storage:{sync:{
    get(_defaults,callback){callback({chuteAutoHide:autoHide,chuteAccessMode:mode,chuteBinVisible:mode!=="context"});},
  },onChanged:{addListener(){}}}};
  // window/document timers are bound to this fake clock, not wall time.
  vm.runInNewContext(hideCode,{document,window,chrome,setTimeout:setTimeoutFake,clearTimeout:clearTimeoutFake,MutationObserver:class{}});
  assert.equal(host.style.transform,"translateX(0)");
  tick(9999);
  assert.equal(host.style.transform,"translateX(0)","Mas cot must remain for first 10 seconds");
  tick(2);
  if(autoHide && mode==="floating") assert(host.style.transform.includes("translateX(calc"),"After 10 seconds, mascot tucks away");
  else assert.equal(host.style.transform,"translateX(0)","Always must never disappear");
}
(async()=>{
  await tabsTest();
  testContentVisibility();
  hideTest("floating",true);
  hideTest("floating",false);
  hideTest("context",false);
  console.log("PASS: last active tab, leftmost active tab, Clear Live Chutey, mascot 10s/Always, image and logo invariants");
})().catch(error=>{console.error(error);process.exitCode=1;});
