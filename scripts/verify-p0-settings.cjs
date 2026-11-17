'use strict';
// Executed product logic, mocked Chrome platform boundary only.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const fileActions=fs.readFileSync('extension/file-actions.js','utf8');
 for(const initial of [{},{chuteyRevealTarget:'chutey',chuteyOpenTarget:'chutey'},{chuteyRevealTarget:'system',chuteyOpenTarget:'system'}]){
  const window={},writes=[];
  const chrome={storage:{sync:{get:async defaults=>({...defaults,...initial}),set:async patch=>writes.push(patch)},onChanged:{addListener(){}}}};
  vm.runInNewContext(fileActions,{window,chrome,document:{querySelectorAll:()=>[]},console});
  await window.ChuteyFileActions.ready;
  const result=window.ChuteyFileActions.get();
  assert.equal(result.chuteyOpenTarget,initial.chuteyOpenTarget||'system');
  assert.equal(result.chuteyRevealTarget,initial.chuteyRevealTarget||'system');
  assert(!writes.some(p=>p.chuteyOpenTarget==='system')||initial.chuteyOpenTarget!=='chutey','An explicit Chutey preference must survive upgrade');
 }
 console.log('PASS P0 file-action defaults: system on unset; explicit Chutey/System preferences preserved');
 const source=fs.readFileSync('extension/background-toolbar.js','utf8');
 for(const saved of ['popup','shelf']){
  const popups=[],behaviors=[],writes=[],events={};
  const chrome={storage:{sync:{get:async defaults=>({...defaults,chuteToolbarEntry:saved}),set:async patch=>writes.push(patch)},onChanged:{addListener:fn=>events.storage=fn}},
   action:{setPopup:async v=>popups.push(v),onClicked:{addListener:fn=>events.click=fn}},
   sidePanel:{setPanelBehavior:async v=>behaviors.push(v),open:async()=>{}},
   runtime:{getURL:path=>'chrome-extension://fixture/'+path,onInstalled:{addListener:fn=>events.installed=fn},onStartup:{addListener:fn=>events.startup=fn},onMessage:{addListener:fn=>events.message=fn}},tabs:{query:async()=>[{windowId:2}]}};
  const context={chrome,console};context.globalThis=context;
  vm.runInNewContext(source,context);
  await context.ChuteyToolbar.ready;
  assert.equal(popups.at(-1).popup,saved==='shelf'?'':'popup.html');
  assert.equal(behaviors.at(-1).openPanelOnActionClick,saved==='shelf');
  await context.ChuteyToolbar.apply(saved==='shelf'?'popup':'shelf');
  assert.equal(popups.at(-1).popup,saved==='shelf'?'popup.html':'');
  assert.equal(behaviors.at(-1).openPanelOnActionClick,saved!=='shelf');
  const before=popups.length;
  const rejected=await new Promise(resolve=>events.message({type:'chutey-toolbar-apply',value:'shelf'},{url:'https://example.test'},resolve));
  assert.equal(rejected.ok,false);assert.equal(popups.length,before);
  const accepted=await new Promise(resolve=>events.message({type:'chutey-toolbar-apply',value:'shelf'},{url:'chrome-extension://fixture/shelf.html'},resolve));
  assert.equal(accepted.ok,true);assert.equal(accepted.entry,'shelf');
 }
 console.log('PASS P0 toolbar: persisted Popup/Shelf modes apply supported Chrome action and sidePanel settings');
})().catch(e=>{console.error(e);process.exitCode=1;});
