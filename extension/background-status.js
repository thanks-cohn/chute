/* One bounded count/health owner for all visible extension clients. */
(() => {
  'use strict';
  const TTL=30000, KEY='chuteyCountStatus';
  let cached=null, checked=0, pending=null, changedPromise=null, legacyUntil=0;
  let revision=0;
  const clients=new Map(), metrics={statusRequests:0,fileListRequests:0,cacheHits:0};
  async function publish(snapshot) {
    const changed=!cached || cached.count!==snapshot.count || cached.connected!==snapshot.connected || cached.reason!==snapshot.reason;
    cached=snapshot;checked=Date.now();
    if (changed) {
      await Promise.allSettled([chrome.storage.session?.set({[KEY]:snapshot}),
        chrome.action.setBadgeBackgroundColor({color:snapshot.connected?'#d7ff3f':'#e05d44'}),
        chrome.action.setBadgeTextColor?.({color:'#111111'}),
        chrome.action.setBadgeText({text:snapshot.connected?(snapshot.count?String(snapshot.count):''):'!'})]);
    }
    return snapshot;
  }
  async function read(force=false) {
    if (pending) return pending;
    if (!force && cached && Date.now()-checked<TTL) {metrics.cacheHits++;return cached;}
    pending=(async()=>{
      try {
        let count;
        if (Date.now()>=legacyUntil) {
          metrics.statusRequests++;
          const response=await fetch('http://127.0.0.1:17891/api/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
          if ([404,405].includes(response.status)) legacyUntil=Date.now()+300000;
          else {
            if (!response.ok) throw Error('Companion unavailable');
            const result=await response.json();
            if (!Number.isSafeInteger(result.count)||result.count<0) throw Error('Invalid count response');
            count=result.count;
          }
        }
        if (count===undefined) {
          metrics.fileListRequests++;
          const response=await fetch('http://127.0.0.1:17891/api/files',{cache:'no-store',signal:AbortSignal.timeout(10000)});
          if (!response.ok) throw Error('Companion unavailable');
          const result=await response.json();if (!Array.isArray(result.files)) throw Error('Invalid file response');
          count=result.files.length;
        }
        return publish({count,connected:true});
      } catch {
        return publish({count:cached?.count||0,connected:false,reason:globalThis.ChuteRecovery?.snapshot().outcome || 'companion_unavailable'});
      }
    })().finally(()=>{pending=null;});
    return pending;
  }
  function changed() {
    revision++;
    if (changedPromise) return changedPromise;
    let observed=0;
    changedPromise=(async()=>{
      let result;
      for (let turn=0;turn<2;turn++) {
        await new Promise(resolve=>setTimeout(resolve,250));
        observed=revision;result=await read(true);
        if (observed===revision) break;
      }
      return result;
    })().finally(()=>{
      changedPromise=null;
      if (observed!==revision) void changed();
    });
    return changedPromise;
  }
  globalThis.ChuteStatus=Object.freeze({read,changed,diagnostics:()=>({...metrics,recentVisibleClients:[...clients.values()].filter(at=>Date.now()-at<75000).length})});
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if (message?.type==='chute-count-changed') {changed().then(reply);return true;}
    if (message?.type!=='chute-count-status') return;
    if (_sender?.tab?.id!==undefined) clients.set(_sender.tab.id+':'+(_sender.frameId||0),Date.now());
    for (const [key,at] of clients) if (Date.now()-at>75000) clients.delete(key);
    if (clients.size>128) clients.delete(clients.keys().next().value);
    read().then(reply);return true;
  });
})();
