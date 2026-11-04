"use strict";
// Isolated smoke tests for Chute's Shelf icon/thumbnail logic. No user files.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const shelf = fs.readFileSync(path.join(root, "extension/shelf.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, "extension/workflow-fixes.js"), "utf8");
const css = fs.readFileSync(path.join(root, "extension/shared.css"), "utf8");

assert(shelf.includes("thumbObserver.observe(icon)"), "Observe visible icon container");
assert(!shelf.includes("thumbObserver.observe(thumb)"), "Hidden thumbnail must not be observed");
assert(shelf.includes("if (index < 8)"), "First visible image rows must start without observer callbacks");
assert(shelf.includes("queueMicrotask(() =>"), "Visible image loading must be scheduled after DOM attachment");
assert(shelf.includes("createRow(file, index)"), "Pass the actual row index, not the page size");
assert(workflow.includes("if (!await showThumbnail(img, source)) return"), "Original saved image must display before cache encoding");
assert(workflow.indexOf("showThumbnail(img, source)") < workflow.indexOf("await persistThumbnail(file, thumbnail)"), "Thumbnails must display before cache persistence");

assert(css.includes(".file-thumb[hidden] { display: none !important; }"));
assert(css.includes(".file-icon.has-thumbnail .file-fallback"));
assert(!shelf.includes("Showing ${file.name} in your file manager"), "No developer success status");

const funcs = shelf.slice(
  shelf.indexOf("function fileKind(file) {"),
  shelf.indexOf("function fileUrl(file) {")
);
assert(funcs.includes("function isPreviewableImage"), "Image gate missing");
const imageContext = vm.createContext({});
vm.runInContext(funcs, imageContext);
assert(imageContext.isPreviewableImage({name:"photo.PNG",mime:"application/octet-stream"}));
assert(imageContext.isPreviewableImage({name:"photo",mime:"image/jpeg"}));
assert(!imageContext.isPreviewableImage({name:"options.html.url",mime:"application/octet-stream"}));
assert.equal(imageContext.fileKind({name:"options.html.url"}),"link");
for(const name of ["photo.png","hello.pdf","pack.zip","options.html.url","notes.txt","unknown.foo"]) {
  const icon=imageContext.iconFor({name});
  assert(icon.includes('class="file-type-svg"'), "Vector fallback missing for "+name);
}

async function scenario(name, {badCached=false, offline=false, disconnected=false}={}) {
  let fetches = [], revoked = [], shown = false, sequence = 0, sourceReads=0;
  const icon = { classList: {
    add(value){if(value==="has-thumbnail")shown=true;},
    remove(value){if(value==="has-thumbnail")shown=false;}
  } };
  const img = {
    hidden: true, isConnected: !disconnected,
    closest(){return icon;},
    _source:"",
    get src(){return this._source;},
    set src(value){
      this._source=value;
      const fail=badCached&&++sequence===1;
      queueMicrotask(()=>fail ? this.onerror?.() : this.onload?.());
    }
  };
  const cached = {size:12, valid:!badCached};
  const ctx=vm.createContext({
    location:{pathname:"/shelf.html"},
    resetHistory:()=>undefined,
    generatedThumbs: new Set(),
    showThumbnails:true,
    THUMB_SIZE:48,
    isPreviewableImage:imageContext.isPreviewableImage,
    setTimeout,
    clearTimeout,
    console,
    URL:{createObjectURL:blob=>"blob:fake-"+blob.valid, revokeObjectURL:url=>revoked.push(url)},
    fetch: async(url,opts)=>{
      fetches.push({url,method:opts?.method||"GET"});
      if(opts?.method==="POST")return {ok:true};
      return {ok:!offline,blob:async()=>cached};
    },
    thumbnailUrl:file=>"/api/thumbnails/"+file.id,
    api:async()=>{sourceReads++;return {blob:async()=>({size:88})};},
    canvasThumbnail:async()=>({size:8,valid:true}),
    Image: function(){}
  });
  vm.runInContext(workflow,ctx,{filename:"workflow-fixes.js"});
  const promise=ctx.ensureThumbnail({id:"unit",name:"photo.PNG",mime:"application/octet-stream"},img);
  assert.equal(img.hidden,true,"Thumbnail should remain hidden until load event");
  await promise;
  if(disconnected) {
    assert.equal(fetches.length,0);
    assert(!shown);
  } else {
    assert.equal(img.hidden,false,"Visible image must be loaded");
    assert(shown,"Decoded thumbnail should replace vector fallback");
    assert.equal(revoked.length,badCached?2:1,"Object URLs should be released");
    assert.equal(sourceReads,badCached||offline?1:0,"Original image should only be read when cache is unavailable/broken");
    assert.equal(fetches.filter(x=>x.method==="POST").length,badCached||offline?1:0);
  }
  return {name,fetches:fetches.length,sourceReads};
}
(async()=>{
  const out=[];
  out.push(await scenario("healthy cached thumbnail"));
  out.push(await scenario("broken thumbnail rebuild",{badCached:true}));
  out.push(await scenario("thumbnail cache miss",{offline:true}));
  out.push(await scenario("page changed",{disconnected:true}));
  console.log("PASS: Chute Shelf file-type vectors + lazy thumbnail decode/rebuild",out);
})().catch(e=>{console.error(e);process.exitCode=1;});
