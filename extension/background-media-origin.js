/* Chrome omits Origin on privileged extension media GETs. Stamp only requests
 * initiated by this extension to its exact local scoped-media endpoint. The
 * worker keeps strict Origin/Host/ticket checks; websites never match this rule.
 */
(() => {
  'use strict';
  const RULE_ID=1789101;
  const origin='chrome-extension://'+chrome.runtime.id;
  let pending;
  function apply(){
    if(pending)return pending;
    pending=(async()=>{
      if(!/^[a-p]{32}$/.test(chrome.runtime.id||'')||!chrome.declarativeNetRequest?.updateSessionRules)throw Error('Chrome cannot apply the scoped media Origin transport. Check extension permissions.');
      await chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[RULE_ID],addRules:[{
        id:RULE_ID,priority:1,
        action:{type:'modifyHeaders',requestHeaders:[{header:'Origin',operation:'set',value:origin}]},
        condition:{regexFilter:'^http://127\\.0\\.0\\.1:17891/api/explorer/v1/media/[A-Za-z0-9_-]+$',
          initiatorDomains:[chrome.runtime.id],requestDomains:['127.0.0.1'],requestMethods:['get','head'],resourceTypes:['media','xmlhttprequest','other']}
      }]});
      return {ok:true,transport:'exact-origin-media'};
    })().catch(error=>{pending=null;throw error;});return pending;
  }
  void apply().catch(()=>{});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type!=='chutey-media-origin-ready')return;
    if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(origin+'/')){reply({ok:false,error:'This extension media client is required.'});return false;}
    apply().then(reply,error=>reply({ok:false,error:error.message}));return true;
  });
  chrome.runtime.onStartup?.addListener(()=>{pending=null;void apply().catch(()=>{});});
})();
