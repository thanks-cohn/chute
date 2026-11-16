'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');const source=name=>fs.readFileSync(path.join(root,'extension',name),'utf8');
class Clock {
  constructor(){this.now=1000000;this.next=0;this.timers=new Map();}
  set(fn,delay){const id=++this.next;this.timers.set(id,{at:this.now+delay,fn});return id;}
  clear(id){this.timers.delete(id);}
  async tick(ms){const end=this.now+ms;for(;;){const due=[...this.timers].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at);if(!due.length)break;const [id,t]=due[0];this.timers.delete(id);this.now=t.at;await t.fn();for(let i=0;i<12;i++)await Promise.resolve();}this.now=end;}
  globals(){const clock=this;return {Date:class extends Date{static now(){return clock.now;}},setTimeout:(fn,ms)=>clock.set(fn,ms),clearTimeout:id=>clock.clear(id),AbortSignal,AbortController,console,URL,Blob};}
}
function element(){const classes=new Set();return {title:'',textContent:'',hidden:false,handlers:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},addEventListener(name,fn){this.handlers[name]=fn;},animate(){},contains(){return false;}};}
async function benchmark(clients,legacy=false){
 const clock=new Clock(),handlers=[],subscribers=[];let calls=[],count=0,inflight=0,peak=0;
 const chrome={runtime:{onMessage:{addListener:fn=>handlers.push(fn)}},storage:{session:{set:async value=>{for(const fn of subscribers)fn({chuteyCountStatus:{newValue:value.chuteyCountStatus}},'session');}}},action:{setBadgeBackgroundColor:async()=>{},setBadgeText:async()=>{}}};
 const worker=vm.createContext({...clock.globals(),chrome,fetch:async url=>{inflight++;peak=Math.max(peak,inflight);calls.push({at:clock.now,url});await Promise.resolve();inflight--;return {ok:!(legacy&&url.endsWith('/api/status')),status:legacy&&url.endsWith('/api/status')?404:200,json:async()=>url.endsWith('/api/status')?{service:'chute',count}:{files:Array.from({length:count},()=>({id:'fixture'}))}};}});
 vm.runInContext(source('background-status.js'),worker);
 const send=(message,id)=>new Promise((resolve,reject)=>{for(const fn of handlers){const handled=fn(message,{tab:{id},frameId:1},resolve);if(handled===true||handled===false)return;}reject(Error('Missing handler'));});
 const bins=[];
 for(let id=0;id<clients;id++){
  const nodes=Object.fromEntries(['bin','label','face','count'].map(name=>['#'+name,element()]));
  const document={hidden:false,handlers:{},querySelector:key=>nodes[key]||null,addEventListener(name,fn){this.handlers[name]=fn;}};
  const context=vm.createContext({...clock.globals(),document,window:{parent:{postMessage(){}},addEventListener(){}},chrome:{runtime:{sendMessage:message=>send(message,id)},storage:{onChanged:{addListener:fn=>subscribers.push(fn)}}}});
  vm.runInContext(source('bin.js'),context);bins.push({document,nodes,context});
 }
 for(let i=0;i<20;i++)await Promise.resolve();
 await clock.tick(180000);
 const statusCalls=calls.filter(call=>call.url.endsWith('/api/status')).length,fullCalls=calls.filter(call=>call.url.endsWith('/api/files')).length;
 assert.equal(peak,1,'Shared worker owns only one count request in flight');
 assert.equal(legacy?fullCalls:statusCalls,7,'One shared read per 30s, including startup, regardless of tab count');
 assert.equal(legacy?statusCalls:fullCalls,legacy?1:0);
 for(const bin of bins){bin.document.hidden=true;bin.document.handlers.visibilitychange();}
 const prior=calls.length;await clock.tick(60000);assert.equal(calls.length,prior,'Hidden tabs issue no count polling');
 count=5;const changes=Array.from({length:clients},(_,id)=>send({type:'chute-count-changed'},id));
 await clock.tick(250);await Promise.all(changes);
 assert.equal(calls.length,prior+1,'A burst of verified saves causes one debounced authoritative refresh');
 for(const bin of bins)assert.equal(bin.nodes['#count'].textContent,'5');
 return {clients,legacy,simulated_idle_seconds:180,lightweight_reads:statusCalls,full_list_reads:fullCalls,hidden_seconds:60,hidden_reads:0,save_burst_reads:1,peak_requests:peak};
}
async function revisionRace(){
 const clock=new Clock();let count=0,hold=false,release;
 const worker=vm.createContext({...clock.globals(),chrome:{runtime:{onMessage:{addListener(){}}},storage:{},action:{setBadgeBackgroundColor:async()=>{},setBadgeText:async()=>{}}},fetch:async()=>{
  const snapshot=count;
  if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}
  return {ok:true,status:200,json:async()=>({service:'chute',count:snapshot})};
 }});
 vm.runInContext(source('background-status.js'),worker);await worker.ChuteStatus.read();
 count=1;hold=true;const first=worker.ChuteStatus.changed();await clock.tick(250);
 count=2;const second=worker.ChuteStatus.changed();release();for(let i=0;i<15;i++)await Promise.resolve();
 await clock.tick(250);const results=await Promise.all([first,second]);
 assert(results.every(result=>result.count===2),'A save during a pending count response must trigger a fresh snapshot');
 return {save_during_inflight_count:'latest count 2 returned to both clients'};
}
async function provenanceSafety(){
 let mode='network',fallbacks=0;
 const blob=new Blob(['fixture']);
 const context=vm.createContext({Blob,blob,console,uploadBlob:async()=>{fallbacks++;return {file:{id:'a'.repeat(32),size:blob.size}};},consumePayloadsNow:async()=>{},fetch:async()=>{
   if(mode==='network')throw Error('lost response');return {ok:false,status:mode,json:async()=>({error:'unavailable'})};
 }});
 vm.runInContext(source('bin-provenance.js'),context);
 vm.runInContext("chuteActiveUploadCollector={byBlob:new Map([[blob,{chuteArtifactRole:'custom_thumbnail'}]]),uploads:[]}",context);
 await assert.rejects(context.uploadBlob(blob,'fixture.webp'));assert.equal(fallbacks,0);
 mode=500;await assert.rejects(context.uploadBlob(blob,'fixture.webp'));assert.equal(fallbacks,0);
 mode=404;await context.uploadBlob(blob,'fixture.webp');assert.equal(fallbacks,1);
 return {unknown_custom_save_receipt:'never copied again',legacy_missing_endpoint:'one compatible upload'};
}
async function recovery(){
 const clock=new Clock(),handlers=[];let nativeCalls=0,healthy=false,legacy=false,posts=0;
 const context=vm.createContext({...clock.globals(),chrome:{runtime:{onMessage:{addListener:fn=>handlers.push(fn)},onStartup:{addListener(){}},onInstalled:{addListener(){}},sendNativeMessage(_name,msg,done){if(msg.action==='get_native_capabilities'){done({ok:true,safe_recovery:legacy?undefined:1});return;}nativeCalls++;done({ok:false,code:'LIVE_UNRESPONSIVE'});}},storage:{}},fetch:async(input,init)=>{
  if(init?.signal?.aborted){const error=Error('navigation cancelled');error.name='AbortError';throw error;}
  if(init?.method==='POST'){posts++;throw Error('response lost');}
  return {ok:healthy,status:healthy?200:503};
 }});
 vm.runInContext(source('background-native.js'),context);
 for(let i=0;i<20;i++)await Promise.resolve();
 await Promise.all(Array.from({length:50},()=>context.ChuteRecovery.wake()));assert.equal(nativeCalls,1);
 await clock.tick(2000);await context.ChuteRecovery.wake();assert.equal(nativeCalls,2);
 await clock.tick(4000);await context.ChuteRecovery.wake();assert.equal(nativeCalls,3);
 await clock.tick(119999);await context.ChuteRecovery.wake();assert.equal(nativeCalls,3,'Circuit cooldown blocks a fourth helper attempt');
 assert(context.ChuteRecovery.snapshot().events.some(event=>event.reason==='live_process_unresponsive'));
 const controller=new AbortController();controller.abort();const before=context.ChuteRecovery.snapshot().events.length;
 await assert.rejects(context.fetch('http://127.0.0.1:17891/api/files',{signal:controller.signal}),error=>error.name==='AbortError');
 assert.equal(context.ChuteRecovery.snapshot().events.length,before,'User cancellation is not a native failure');
 healthy=true;
 await assert.rejects(context.fetch('http://127.0.0.1:17891/api/upload',{method:'POST'}),/not replayed/);assert.equal(posts,1);
 healthy=false;legacy=true;await clock.tick(120001);await context.ChuteRecovery.wake();assert.equal(nativeCalls,3,'Old helper with broad-kill behavior is never used for automatic recovery');
 assert(context.ChuteRecovery.snapshot().events.length<=20);
 return {concurrent_wakes:50,initial_helper_attempts:1,attempts_before_circuit:3,cooldown_ms:120000,post_transmissions:posts,legacy_unsafe_helper_attempts:0};
}
(async()=>{
 const results=[];for(const clients of [1,4,16])results.push(await benchmark(clients));results.push(await benchmark(16,true));
 const recovered=await recovery(),race=await revisionRace(),provenance=await provenanceSafety();
 const evidence={scope:'deterministic clock executing production bin/count/recovery code; not Windows wall-clock or owner hardware',counts:results,recovery:recovered,race,provenance};
 fs.writeFileSync('/tmp/chutey-efficiency-results.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
