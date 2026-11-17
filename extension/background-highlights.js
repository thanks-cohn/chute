/* Durable idempotency ID survives uncertain responses; no automatic POST replay. */
const ChuteyHighlights = (() => {
  let busy=false;
  async function capture(text,source) {
    if(busy)throw Error('A highlight is being saved. Try again shortly.');busy=true;
    try {
      const raw=new TextEncoder().encode(text);
      if(!raw.length||raw.length>4*1024*1024)throw Error('Select text up to 4 MiB.');
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(n=>n.toString(16).padStart(2,'0')).join('');
      const old=(await chrome.storage.local.get({chuteyPendingHighlight:null})).chuteyPendingHighlight;
      // The same selection can reconcile by reusing its stable ID. A different
      // pending selection is preserved, rather than silently overwritten.
      if(old && (old.digest!==digest || old.source!==source))throw Error('A previous highlight has an uncertain receipt. Select that same passage again to reconcile it before saving a different passage.');
      const id=old?.id || crypto.randomUUID().replaceAll('-','');
      await chrome.storage.local.set({chuteyPendingHighlight:{id,digest,source}});
      const capabilities=await chrome.runtime.sendNativeMessage('com.thankscohn.chute',{action:'get_native_capabilities'});
      if(capabilities?.safe_recovery!==1)throw Error('Daily highlights require the matching isolated worker/helper test pair.');
      const session=await chrome.runtime.sendNativeMessage('com.thankscohn.chute',{action:'explorer_resume'});
      if(!session?.ok||!session.token)throw Error('Companion unavailable; the highlight ID is retained for retry.');
      let response;
      try {response=await fetch('http://127.0.0.1:17891/api/explorer/v1/highlights',{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+session.token,'Content-Type':'text/plain;charset=utf-8','X-Chute-Capture-ID':id,'X-Chute-Source':encodeURIComponent(source.slice(0,4096))},body:raw});}
      catch {throw Error('Highlight receipt uncertain. Select the same passage again to reconcile safely; do not create a new capture.');}
      const receipt=await response.json();
      if(!response.ok||receipt.state!=='COMMITTED'||receipt.capture_id!==id||receipt.input_size!==raw.length||receipt.input_sha256!==digest)throw Error(receipt.error?.message||'Highlight was not verified. Its ID is retained for safe reconciliation.');
      await chrome.storage.local.remove('chuteyPendingHighlight');
      globalThis.ChuteStatus?.changed();
      return receipt;
    } finally {busy=false;}
  }
  return Object.freeze({capture});
})();
