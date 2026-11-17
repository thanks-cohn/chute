"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../extension/explorer-api.js'),'utf8');
function api(host,bridge){
  const window={};
  vm.runInNewContext(source,{window,chrome:{runtime:{sendNativeMessage:async(_name,message)=>message.action==='get_native_capabilities'?host:bridge}}});
  return window.ChuteyExplorerAPI;
}
(async()=>{
  await assert.rejects(api({ok:true},{ok:true,token:'fixture'}).nativeSession(),/needs updating/);
  await assert.rejects(api({ok:true,explorer_protocol:'1.1',safe_recovery:1},{ok:true,token:'fixture'}).nativeSession(),/running Windows companion/);
  const receipt={ok:true,protocol:'1.1',token:'fixture',read_only:true};
  assert.equal((await api({ok:true,explorer_protocol:'1.1',safe_recovery:1},receipt).nativeSession()).protocol,'1.1');
  console.log('PASS: stale helper and stale running bridge are independently rejected; matched Explorer protocol connects');
})().catch(error=>{console.error(error);process.exitCode=1;});
// Renewal is single-flight, retries the rejected operation once, and can never
// turn a background resume into a consent dialog.
(async()=>{
  const actions=[]; let fetches=0;
  const window={};
  vm.runInNewContext(source,{window,fetch:async()=> ++fetches===1 ? {status:403,ok:false,json:async()=>({error:{code:'UNAUTHORIZED'}})} : {status:200,ok:true,json:async()=>({state:'completed',result:{ready:true}})},chrome:{runtime:{sendNativeMessage:async(_name,message)=>{
    actions.push(message.action);
    await Promise.resolve();
    return message.action==='get_native_capabilities' ? {ok:true,explorer_protocol:'1.1',safe_recovery:1} : {ok:true,protocol:'1.1',token:'renewed'};
  }}}});
  await Promise.all([window.ChuteyExplorerAPI.nativeSession(false),window.ChuteyExplorerAPI.nativeSession(false)]);
  assert.deepEqual(actions,['get_native_capabilities','explorer_resume']);
  assert.equal((await window.ChuteyExplorerAPI.command('roots')).ready,true);
  assert.equal(fetches,2);
  assert.equal(actions.filter(value=>value==='explorer_resume').length,2);
  assert(!actions.some(value=>value.includes('select')));
  console.log('PASS: concurrent resume coalesces; expired request retries once without picker');
})().catch(error=>{console.error(error);process.exitCode=1;});

// The installed b0727d5 worker rejects every unknown content key. Reproduce
// that real schema, rather than accepting modern payloads in a permissive mock.
(async()=>{
  const window={}, calls=[];
  vm.runInNewContext(source,{window,fetch:async(_url,options)=>{
    const body=JSON.parse(options.body); calls.push(body);
    const valid=Object.keys(body).every(key=>['handle','identity','thumbnail'].includes(key));
    return {ok:valid,status:valid?200:400,blob:async()=>({decoded:true}),
      json:async()=>({error:{code:'INVALID_ARGUMENT',message:'Expected a file handle.'}})};
  }});
  const row={handle:'authorized-file',identity:'canonical-identity'};
  await window.ChuteyExplorerAPI.content(row);
  await window.ChuteyExplorerAPI.content(row,{thumbnail:true});
  assert(!calls.some(body=>'original' in body));
  await assert.rejects(window.ChuteyExplorerAPI.content({handle:'not-an-identity'}),/Refresh the folder/);
  assert.equal(calls.length,2,'An incomplete identity never reaches the worker');
  await assert.rejects(window.ChuteyExplorerAPI.content(row,{original:true}),/Expected a file handle/);
  console.log('PASS: preserved November 4 content schema, preview/thumbnail compatibility, explicit newer-export incompatibility');
})().catch(error=>{console.error(error);process.exitCode=1;});

(async()=>{
  const window={},actions=[];
  vm.runInNewContext(source,{window,AbortSignal,fetch:async()=>({ok:false}),chrome:{runtime:{sendNativeMessage:async(_host,message)=>{
    actions.push(message.action);return {ok:true,explorer_protocol:'1.1'};
  }}}});
  await assert.rejects(window.ChuteyExplorerAPI.nativeSession(),error=>error.code==='LEGACY_RECOVERY_UNSAFE');
  assert.deepEqual(actions,['get_native_capabilities']);
  console.log('PASS: unavailable legacy helper never receives an automatic resume/wake');
})().catch(error=>{console.error(error);process.exitCode=1;});

(async()=>{
  async function run(states){
    const window={},saved={},events=[];let index=0;
    vm.runInNewContext(source,{window,crypto:require('node:crypto').webcrypto,Date,setTimeout:fn=>queueMicrotask(fn),chrome:{storage:{session:{get:async d=>({...d,...saved}),set:async x=>Object.assign(saved,x),remove:async k=>{delete saved[k];}}},runtime:{sendMessage:async m=>events.push(m.type)}},fetch:async(_url,options)=>{
      const {command}=JSON.parse(options.body);events.push(command);
      const result=command==='transfer_dismiss'?{dismissed:true}:{id:'a'.repeat(32),state:states[Math.min(index++,states.length-1)],size:5,bytes:5,receipt:{state:'COMMITTED',sha256:'0'.repeat(64),file:{id:'b'.repeat(32),size:5}}};
      return {ok:true,json:async()=>({state:'completed',result})};
    }});
    try{await window.ChuteyExplorerAPI.transfer({id:'a'.repeat(32),kind:'local_to_live',handle:'source',identity:'identity'});}catch{}
    return events;
  }
  const completed=await run(['accepted','running','COMMITTED']);
  assert.deepEqual(completed,['transfer_start','transfer_status','transfer_status','chute-count-changed','transfer_dismiss']);
  assert(!(await run(['failed'])).includes('chute-count-changed'));
  assert(!(await run(['UNCERTAIN'])).includes('chute-count-changed'));
  console.log('PASS: native-to-Live copy broadcasts count only after COMMITTED; failed/uncertain jobs never report success');
})().catch(error=>{console.error(error);process.exitCode=1;});
