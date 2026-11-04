"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/background.js','utf8').split('const explorerDragRegistrations = ')[1];
const state = {}, requests = [];
const bytes = Uint8Array.from([0,255,13,10,42]);
function worker() {
  let listener;
  const chrome = {
    runtime:{getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>listener=fn},sendNativeMessage:async(_,message)=>{assert.equal(message.action,'explorer_resume');return {ok:true,token:'private-token'};}},
    tabs:{query:async()=>[{id:10}]},
    storage:{session:{get:async key=>key===null?{...state}:{[key]:state[key]},set:async data=>Object.assign(state,data),remove:async keys=>{for(const key of keys)delete state[key];}}}
  };
  vm.runInNewContext('const explorerDragRegistrations = '+source,{chrome,BASE_URL:'http://127.0.0.1:17891',relayDragOutStart:async()=>{},Date,Map,Uint8Array,String,btoa,fetch:async(url,options)=>{requests.push({url,options});return {ok:true,arrayBuffer:async()=>bytes.buffer};}});
  return (message,sender)=>new Promise((resolve,reject)=>{
    if (!listener(message,sender,resolve)) reject(Error('Unregistered message'));
  });
}
(async()=>{
  let send = worker();
  const id='explorer-12345678-abcd-abcd-abcd-123456789abc';
  const row={handle:'guarded-handle',identity:'version',name:'binary.bin',mime:'application/octet-stream'};
  const sender={url:'chrome-extension://fixture/shelf.html'};
  await assert.rejects(send({type:'chutey-register-explorer-drag',id,row},{url:'https://evil.test'}));
  const pending=send({type:'chutey-register-explorer-drag',id,row},sender);
  const firstDrop=send({type:'chutey-read-explorer-drag',id},{tab:{id:10,active:true},url:'https://receiver.test'});
  await pending;
  const receipt=await firstDrop;
  assert(receipt.ok);
  assert.deepEqual(Buffer.from(receipt.base64,'base64'),Buffer.from(bytes));
  assert.equal(requests.length,1,'No pre-copy/export during drag registration');
  assert.equal(requests[0].options.headers.Authorization,'Bearer private-token');
  assert.equal(JSON.parse(requests[0].options.body).original,true);
  assert(!JSON.stringify(receipt).includes('private-token'));
  // Service worker suspension: the reference survives in session storage.
  send=worker();
  assert((await send({type:'chutey-read-explorer-drag',id},{tab:{id:11,active:true},url:'https://receiver.test'})).ok);
  assert.equal((await send({type:'chutey-read-explorer-drag',id},{tab:{id:12,active:false}})).ok,false);
  state[id].expires=0;
  assert.equal((await send({type:'chutey-read-explorer-drag',id},sender)).ok,false);
  console.log('PASS: first-drop byte relay, registration/drop race, suspended worker, active receiver, expiry; no Live pre-copy or leaked token');
})().catch(error=>{console.error(error);process.exitCode=1;});
