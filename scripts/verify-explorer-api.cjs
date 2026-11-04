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
  await assert.rejects(api({ok:true,explorer_protocol:'1.1'},{ok:true,token:'fixture'}).nativeSession(),/running Windows companion/);
  const receipt={ok:true,protocol:'1.1',token:'fixture',read_only:true};
  assert.equal((await api({ok:true,explorer_protocol:'1.1'},receipt).nativeSession()).protocol,'1.1');
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
    return message.action==='get_native_capabilities' ? {ok:true,explorer_protocol:'1.1'} : {ok:true,protocol:'1.1',token:'renewed'};
  }}}});
  await Promise.all([window.ChuteyExplorerAPI.nativeSession(false),window.ChuteyExplorerAPI.nativeSession(false)]);
  assert.deepEqual(actions,['get_native_capabilities','explorer_resume']);
  assert.equal((await window.ChuteyExplorerAPI.command('roots')).ready,true);
  assert.equal(fetches,2);
  assert.equal(actions.filter(value=>value==='explorer_resume').length,2);
  assert(!actions.some(value=>value.includes('select')));
  console.log('PASS: concurrent resume coalesces; expired request retries once without picker');
})().catch(error=>{console.error(error);process.exitCode=1;});
