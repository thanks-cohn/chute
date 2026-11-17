'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('extension/explorer-api.js','utf8');
const id='a'.repeat(32),other='b'.repeat(32);
const committed={id,state:'COMMITTED',kind:'local_copy',size:12,bytes:12,receipt:{state:'COMMITTED',size:12,sha256:'c'.repeat(64),name:'file.bin'},verification:{state:'VERIFIED',verified:true}};
function setup(handler,pending={id}){
 const saved={chuteyPendingTransfer:pending},durable={},calls=[],window={};
 const chrome={storage:{session:{get:async defaults=>({...defaults,...saved}),set:async patch=>Object.assign(saved,patch),remove:async key=>{delete saved[key];}}},runtime:{sendMessage:async()=>{}}};
 chrome.storage.local={get:async d=>({...d,...durable}),set:async patch=>Object.assign(durable,patch),remove:async key=>{delete durable[key];}};
 vm.runInNewContext(source,{window,chrome,crypto:require('node:crypto').webcrypto,Date,setTimeout:fn=>queueMicrotask(fn),fetch:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  const value=await handler(body.command,body.args);
  if(value instanceof Error)throw value;
  if(value?.error)return {ok:false,status:400,json:async()=>value};
  return {ok:true,json:async()=>({state:'completed',result:value})};
 }});
 return {api:window.ChuteyExplorerAPI,saved,durable,calls};
}
(async()=>{
 let fixture=setup(command=>command==='transfer_dismiss'?{dismissed:true}:committed);
 const prior=await fixture.api.reviewPending();assert(prior.reconciled&&prior.verified);assert(!fixture.saved.chuteyPendingTransfer);
 assert.equal(fixture.calls.filter(c=>c.command==='transfer_start').length,0,'Reconciliation never replays an accepted copy');
 assert.deepEqual(fixture.calls.map(c=>c.command),['transfer_status','transfer_verify','transfer_dismiss']);
 // A stale committed marker no longer blocks the next intentional copy.
 fixture=setup((command,args)=>command==='transfer_dismiss'?{dismissed:true}:command==='transfer_start'?{...committed,id:args.id}:committed);
 await fixture.api.transfer({id:other,kind:'local_copy',handle:'source',identity:'identity',destination:'write-approved'});
 assert.equal(fixture.calls.filter(c=>c.command==='transfer_start').length,1);
 // Normal GUI clients omit an ID; each deliberate copy gets a fresh durable ID.
 fixture=setup((command,args)=>command==='transfer_dismiss'?{dismissed:true}:{...committed,id:args.id},null);
 for(let i=0;i<2;i++)await fixture.api.transfer({kind:'local_copy',handle:'source',identity:'identity',destination:'write-approved'});
 const starts=fixture.calls.filter(c=>c.command==='transfer_start');
 assert.equal(starts.length,2);assert.match(starts[0].args.id,/^[a-f0-9]{32}$/);assert.notEqual(starts[0].args.id,starts[1].args.id);
 assert(!fixture.saved.chuteyPendingTransfer&&!fixture.durable.chuteyPendingTransfer);
 for(const state of ['accepted','running','failed','cancelled','UNCERTAIN']){
  const job={...committed,state,verification:{state:'REVIEW_REQUIRED',verified:false}};
  fixture=setup(()=>job);
  await assert.rejects(fixture.api.transfer({id:other,kind:'local_copy'}));
  assert.equal(fixture.saved.chuteyPendingTransfer.id,id);assert(!fixture.calls.some(c=>c.command==='transfer_start'));
 }
 fixture=setup(()=>({error:{code:'NOT_FOUND',message:'missing'}}));
 const missing=await fixture.api.reviewPending();assert.equal(missing.state,'MISSING');assert(fixture.saved.chuteyPendingTransfer);
 await fixture.api.dismissPending({reviewed:true});assert(!fixture.saved.chuteyPendingTransfer);assert.equal(fixture.saved.chuteyReviewedTransfers[0].id,id);
 fixture=setup(()=>new Error('connection lost'));
 assert.equal((await fixture.api.reviewPending()).state,'WORKER_UNAVAILABLE');await assert.rejects(fixture.api.dismissPending({reviewed:true}));assert(fixture.saved.chuteyPendingTransfer);
 fixture=setup(command=>command==='transfer_dismiss'?{dismissed:true,evidence_preserved:true}:{...committed,state:'UNCERTAIN',verification:{state:'REVIEW_REQUIRED',verified:false}});
 await assert.rejects(fixture.api.dismissPending());await fixture.api.dismissPending({reviewed:true});assert.equal(fixture.calls.at(-1).args.reviewed,true);
 // Lost acceptance/receipt: one POST, stable marker, never automatic replay.
 fixture=setup(()=>new Error('lost response'),null);
 await assert.rejects(fixture.api.transfer({id,kind:'local_copy'}));assert.equal(fixture.calls.length,1);assert.equal(fixture.calls[0].command,'transfer_start');assert.equal(fixture.saved.chuteyPendingTransfer.id,id);
 fixture=setup(command=>command==='transfer_dismiss'?{dismissed:true}:committed,null);fixture.durable.chuteyPendingTransfer={id};
 const recovered=await fixture.api.reviewPending();assert(recovered.reconciled);assert(!fixture.durable.chuteyPendingTransfer,'Chrome restart recovers and clears the durable marker only after verification');
 fixture=setup(()=>({...committed,receipt:{state:'COMMITTED',size:12}}));
 await assert.rejects(fixture.api.transfer({id:other,kind:'local_copy'}));assert(fixture.saved.chuteyPendingTransfer,'Incomplete receipts cannot clear markers');
 console.log('PASS: stale COMMITTED safely verified; active/failed/cancelled/uncertain/missing/disconnected distinct; no replay; explicit review preserves evidence; next intentional copy works');
})().catch(error=>{console.error(error);process.exitCode=1;});
