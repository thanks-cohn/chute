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
