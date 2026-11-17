const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 let response;const window={};
 vm.runInNewContext(fs.readFileSync('extension/media-playback.js','utf8'),{window,AbortSignal,fetch:async()=>{if(response instanceof Error)throw response;return response;}});
 const failure=code=>window.ChuteyMediaPlayback.failure({error:{code}},{url:'http://127.0.0.1:17891/api/explorer/v1/media/fixture'});
 response={ok:true};assert.match(await failure(3),/source is available.*could not decode/);
 response={ok:false,status:400,headers:{get:()=> 'STREAM_EXPIRED'}};assert.match(await failure(4),/ticket expired/);
 response={ok:false,status:403,headers:{get:()=> 'UNAUTHORIZED'}};assert.match(await failure(2),/revoked.*session expired/);
 response={ok:false,status:400,headers:{get:()=> 'FILE_CHANGED'}};assert.match(await failure(4),/source changed.*missing/);
 response=new Error('connection');assert.match(await failure(2),/companion is disconnected/);
 console.log('PASS shared media diagnostics: available-source decode failure versus expired ticket, revoked session, changed source and disconnected worker');
})().catch(e=>{console.error(e);process.exitCode=1;});
