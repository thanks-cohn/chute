const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 let response;const window={};
 vm.runInNewContext(fs.readFileSync('extension/media-playback.js','utf8'),{window,AbortSignal,fetch:async()=>{if(response instanceof Error)throw response;return response;}});
 const failure=code=>window.ChuteyMediaPlayback.failure({error:{code}},{url:'http://127.0.0.1:17891/api/explorer/v1/media/fixture'});
 response={ok:true};assert.match(await failure(3),/source is available.*could not decode/);
 response={ok:false,status:400,headers:{get:()=> 'STREAM_EXPIRED'}};assert.match(await failure(4),/ticket expired/);
 response={ok:false,status:403,headers:{get:()=> 'UNAUTHORIZED'}};assert.match(await failure(2),/not authorized.*does not prove folder access was revoked/);
 response={ok:false,status:400,headers:{get:()=> 'FILE_CHANGED'}};assert.match(await failure(4),/source changed.*missing/);
 response=new Error('connection');assert.match(await failure(2),/companion is disconnected/);
 // A later successful HEAD must not hide the original media GET failure.
 window.ChuteyExplorerAPI={command:async()=>({original_get:{code:'INVALID_HOST',status:400,origin_present:true}})};
 response={ok:true};assert.match(await window.ChuteyMediaPlayback.failure({error:{code:2}},{url:'http://127.0.0.1/media/fixture',ticket:'fixture'}),/Original media GET failed: INVALID_HOST.*Origin present/);
 const releasedSource={url:'http://127.0.0.1/media/fixture',ticket:'released'};
 // Player cleanup must not turn the original decode failure into self-induced
 // STREAM_EXPIRED, even if the status response arrives after ticket release.
 let finishStatus,headRequests=0;
 const releasedWindow={ChuteyExplorerAPI:{command:()=>new Promise(resolve=>{finishStatus=resolve;})}};
 vm.runInNewContext(fs.readFileSync('extension/media-playback.js','utf8'),{window:releasedWindow,AbortSignal,fetch:async()=>{headRequests++;return {ok:false,status:400,headers:{get:()=> 'STREAM_EXPIRED'}};}});
 const decodedFailure=releasedWindow.ChuteyMediaPlayback.failure({error:{code:3}},releasedSource,{released:true});
 finishStatus({original_get:{code:'OK',status:206}});
 assert.match(await decodedFailure,/Chrome could not decode.*same file to retry/);
 assert.equal(headRequests,0,'Do not probe a ticket released by local cleanup');
 releasedWindow.ChuteyExplorerAPI.command=async()=>({original_get:{code:'BUSY',status:429,origin_present:true}});
 assert.match(await releasedWindow.ChuteyMediaPlayback.failure({error:{code:2}},releasedSource,{released:true}),/Original media GET failed: BUSY.*429/);
 releasedWindow.ChuteyExplorerAPI.command=async()=>({original_get:null});
 assert.match(await releasedWindow.ChuteyMediaPlayback.failure({error:{code:4}},releasedSource,{released:true}),/Chrome could not decode/);
 releasedWindow.ChuteyExplorerAPI.command=async()=>{throw Error('status unavailable');};
 assert.match(await releasedWindow.ChuteyMediaPlayback.failure({error:{code:3}},releasedSource,{released:true}),/Chrome could not decode/);
 assert.equal(headRequests,0);
 let tick,cleared=0,calls=0,reason='BUSY',errors=[];const leaseWindow={};
 vm.runInNewContext(fs.readFileSync('extension/media-playback.js','utf8'),{window:leaseWindow,setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{cleared++;}});
 leaseWindow.ChuteyMediaPlayback.lease({ticket:'fixture'},{nativeSession:async select=>{assert.equal(select,false);},command:async()=>{calls++;throw Object.assign(Error(reason),{code:reason});}},error=>errors.push(error.code));
 await tick();assert.equal(cleared,0,'Transient BUSY must preserve buffered playback and later renewal');
 reason='STREAM_EXPIRED';await tick();assert.equal(cleared,1);await tick();assert.equal(calls,2);assert.deepEqual(errors,['BUSY','STREAM_EXPIRED']);
 console.log('PASS shared media diagnostics: decode, expiry, authorization, changed source, disconnect, original GET priority, immediate-cleanup decode preservation and no released-ticket HEAD; renewal lifecycle');
})().catch(e=>{console.error(e);process.exitCode=1;});
