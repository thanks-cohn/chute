'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const id='abcdefghijklmnopabcdefghijklmnop',origin='chrome-extension://'+id;let rules,listener;
 const chrome={runtime:{id,onMessage:{addListener:fn=>{listener=fn;}},onStartup:{addListener(){}}},declarativeNetRequest:{updateSessionRules:async value=>{rules=value;}}};
 vm.runInNewContext(fs.readFileSync('extension/background-media-origin.js','utf8'),{chrome});
 const reply=await new Promise(resolve=>listener({type:'chutey-media-origin-ready'},{id,url:origin+'/shelf.html'},resolve));assert(reply.ok);
 const rule=rules.addRules[0],condition=rule.condition;
 assert.deepEqual(Array.from(condition.initiatorDomains),[id]);assert.deepEqual(Array.from(condition.requestDomains),['127.0.0.1']);assert.deepEqual(Array.from(condition.requestMethods),['get','head']);
 assert.equal(rule.action.requestHeaders[0].header,'Origin');assert.equal(rule.action.requestHeaders[0].value,origin);
 const match=new RegExp(condition.regexFilter);
 assert(match.test('http://127.0.0.1:17891/api/explorer/v1/media/scoped_ticket'));
 for(const url of ['http://127.0.0.1:17891/api/files','http://127.0.0.1:17891/api/explorer/v1/command','http://127.0.0.1:17892/api/explorer/v1/media/x','http://127.0.0.1:17891/api/explorer/v1/media/x?evil','http://example.test/api/explorer/v1/media/x'])assert(!match.test(url),url);
 const denied=await new Promise(resolve=>listener({type:'chutey-media-origin-ready'},{id:'p'.repeat(32),url:'https://website.test/'},resolve));assert.equal(denied.ok,false);
 const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));assert(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
 console.log('PASS scoped Origin rule: own extension initiator, exact loopback media GET/HEAD only; other origins, hosts, ports and general API excluded');
})().catch(e=>{console.error(e);process.exitCode=1;});
