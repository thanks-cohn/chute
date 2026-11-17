/* Transport only. Python owns capabilities, handles and command semantics. */
(() => {
  "use strict";
  let token = "";
  const base = "http://127.0.0.1:17891/api/explorer/v1/";
  let renewing = null;
  async function request(route, body, signal, retry = true) {
    let response;
    try {
      response = await fetch(base + route, {method:"POST",cache:"no-store",signal,
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},keepalive:body.command==="release_media",body:JSON.stringify(body)});
    } catch (error) {
      const readOnly = route === "content" || ["roots","list","stat","preview","resume_location"].includes(body.command);
      if (!retry || !readOnly || error.name === "AbortError") throw error;
      await window.ChuteyExplorerAPI.nativeSession(false);
      return request(route,body,signal,false);
    }
    if (!response.ok) {
      const receipt = await response.json().catch(() => ({}));
      if ([401,403].includes(response.status) && retry && receipt.error?.code === "UNAUTHORIZED") {
        await window.ChuteyExplorerAPI.nativeSession(false);
        return request(route,body,signal,false);
      }
      const error = new Error(receipt.error?.message || "The local companion is unavailable.");
      error.code = receipt.error?.code;
      throw error;
    }
    return response;
  }
  const PENDING='chuteyPendingTransfer';
  let localAdmission=Promise.resolve();
  function admission(task){
    if(globalThis.navigator?.locks)return navigator.locks.request('chutey-copy-admission',task);
    const next=localAdmission.then(task,task);localAdmission=next.catch(()=>{});return next;
  }
  async function pending(){
    const value=(await chrome.storage.session.get({[PENDING]:null}))[PENDING];
    return value || (chrome.storage.local ? (await chrome.storage.local.get({[PENDING]:null}))[PENDING] : null);
  }
  async function savePending(value){
    await chrome.storage.session.set({[PENDING]:value});
    if(chrome.storage.local)await chrome.storage.local.set({[PENDING]:value});
  }
  async function clearPending(id){
    for(const area of [chrome.storage.session,chrome.storage.local].filter(Boolean)){
      if((await area.get({[PENDING]:null}))[PENDING]?.id===id)await area.remove(PENDING);
    }
  }
  function validReceipt(job){
    const receipt=job?.receipt,size=receipt?.size??receipt?.file?.size;
    return job.state==='COMMITTED' && receipt?.state==='COMMITTED' && /^[a-f0-9]{64}$/.test(receipt.sha256||'') && Number.isSafeInteger(size) && size>=0 && (job.size===undefined || size===job.size) && (!receipt.file || /^[a-f0-9]{32}$/.test(receipt.file.id||''));
  }
  function issue(message,code,job){const error=Error(message);error.code=code;error.job=job;return error;}
  async function finishPending(marker,job){
    if(!validReceipt(job))throw issue('The previous copy receipt is incomplete. Verify its destination before retrying.','RECEIPT_INCOMPLETE',job);
    await chrome.storage.session.set({chuteyLastTransferReceipt:{id:marker.id,state:job.state,receipt:job.receipt}});
    await clearPending(marker.id);
    await window.ChuteyExplorerAPI.command('transfer_dismiss',{id:marker.id}).catch(()=>{});
    return {...job,verified:true,reconciled:true};
  }
  async function inspectPending({destination,onProgress=()=>{}}={}){
    const marker=await pending();if(!marker)return null;
    let job;
    try{job=await window.ChuteyExplorerAPI.command('transfer_status',{id:marker.id});}
    catch(error){return {id:marker.id,state:error.code==='NOT_FOUND'?'MISSING':'WORKER_UNAVAILABLE',verified:false,error:error.code==='NOT_FOUND'?'The worker has no receipt for this ID. Acceptance is unknown; review the destination before dismissal.':'The worker could not inspect the retained copy. Reconnect before retrying.'};}
    if(['accepted','running'].includes(job.state)){onProgress(job);return {...job,verified:false};}
    if(['COMMITTED','UNCERTAIN'].includes(job.state)){
      try{job=await window.ChuteyExplorerAPI.command('transfer_verify',{id:marker.id,...(destination?{destination}:{})});}
      catch(error){return {...job,verified:false,error:error.message,review_required:true};}
      if(job.verification?.state==='VERIFYING')return {...job,state:'VERIFYING',verified:false};
      if(job.verification?.verified===true && validReceipt(job))return finishPending(marker,job);
      return {...job,verified:false,review_required:true,error:job.verification?.message||job.error||'The previous destination has not been verified. Review it before a new copy.'};
    }
    return {...job,verified:false,review_required:true};
  }
  window.ChuteyExplorerAPI = Object.freeze({
    async nativeSession(select = false, writable = false) {
      if (!select && renewing) return renewing;
      const operation = async () => {
      const capabilities = await chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action:"get_native_capabilities"});
      if (!capabilities?.ok || capabilities.explorer_protocol !== "1.1") {
        throw new Error("Your Windows companion needs updating. Install the Windows EXE and Chrome extension from the same test pair.");
      }
      if (capabilities.safe_recovery !== 1) {
        let healthy=false;
        try { healthy=(await fetch('http://127.0.0.1:17891/health',{cache:'no-store',signal:AbortSignal.timeout(1200)})).ok; } catch {}
        if (!healthy) {
          const error=new Error('The companion is unavailable. Start the existing companion normally, or use the isolated matching test pair for safe recovery.');
          error.code='LEGACY_RECOVERY_UNSAFE';throw error;
        }
      }
      let response;
      for (let attempt=0;attempt<3;attempt++) {
        response = await chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action:select ? (writable ? "explorer_select_write_folder" : "explorer_select_folder") : "explorer_resume"});
        if (select || response?.ok || !["BUSY","BRIDGE_UNAVAILABLE"].includes(response?.code) || attempt===2) break;
        await new Promise(resolve => setTimeout(resolve,150*(attempt+1)));
      }
      if (!response?.ok || !response.token) {
        const error = new Error(response?.error || "The local companion could not resume. Retry in Folder Access settings.");
        error.code = response?.code || "BRIDGE_UNAVAILABLE";
        throw error;
      }
      if (response.protocol !== "1.1") {
        throw new Error("The running Windows companion needs updating or restarting. Use the Windows EXE and Chrome extension from the same test pair.");
      }
      token = response.token;
      return response;
      };
      if (select) return operation(); // Never retry an explicit picker gesture.
      renewing = operation();
      try { return await renewing; } finally { renewing = null; }
    },
    connect(value) { token = value.trim(); },
    async command(command, args = {}, {signal} = {}) {
      const receipt = await (await request("command", {command, args}, signal)).json();
      if (receipt.state !== "completed") {
        const error = new Error(receipt.error?.message || "Command failed.");
        error.code = receipt.error?.code; throw error;
      }
      return receipt.result;
    },
    async receive(destination, file) {
      // Renew BEFORE a write; never replay a transfer whose receipt was lost.
      if (chrome.runtime?.sendNativeMessage) await window.ChuteyExplorerAPI.nativeSession(false);
      const response = await fetch(base + "receive", {method:"POST",cache:"no-store",
        headers:{Authorization:"Bearer " + token,"Content-Type":"application/octet-stream",
          "X-Chute-Operation":crypto.randomUUID().replaceAll("-",""),"X-Chute-Destination":destination,"X-Chute-Filename":encodeURIComponent(file.name)},body:file});
      const receipt = await response.json();
      if (!response.ok || receipt.state !== "COMMITTED") throw new Error(receipt.error?.message || "Copy did not commit. Check the destination before retrying.");
      return receipt;
    },
    async reviewPending(options={}) {return admission(()=>inspectPending(options));},
    async cancelPending(){
      const marker=await pending();if(!marker)return null;
      const job=await window.ChuteyExplorerAPI.command('transfer_cancel',{id:marker.id});return job;
    },
    async dismissPending({reviewed=false}={}){
      if(reviewed!==true)throw issue('Review the destination before dismissing this copy.','REVIEW_REQUIRED');
      return admission(async()=>{
        const marker=await pending();if(!marker)return {dismissed:true};
        let job;
        try{job=await window.ChuteyExplorerAPI.command('transfer_status',{id:marker.id});}
        catch(error){if(error.code!=='NOT_FOUND')throw error;job={id:marker.id,state:'MISSING'};}
        if(['accepted','running'].includes(job.state)||job.verification?.state==='VERIFYING')throw issue('The copy or verification is still active. Cancel and wait first.','TRANSFER_ACTIVE',job);
        if(job.state!=='MISSING')await window.ChuteyExplorerAPI.command('transfer_dismiss',{id:marker.id,reviewed:true});
        const history=(await chrome.storage.session.get({chuteyReviewedTransfers:[]})).chuteyReviewedTransfers;
        await chrome.storage.session.set({chuteyReviewedTransfers:[...history.slice(-31),{id:marker.id,state:job.state,reviewedAt:Date.now()}]});
        await clearPending(marker.id);
        return {dismissed:true,evidence_preserved:true,id:marker.id};
      });
    },
    async transfer(args,{onProgress=()=>{}}={}) {
      const started=await admission(async()=>{
        const previous=await inspectPending({onProgress});
        if(previous && !previous.reconciled)throw issue(previous.error||'A previous copy is '+previous.state+'. Use Review previous copy beside Paste.','TRANSFER_'+previous.state.toUpperCase(),previous);
        if(previous && previous.id===args.id)return {job:previous,id:previous.id,reconciled:true};
        const id=args.id || crypto.randomUUID().replaceAll('-','');
        await savePending({id,kind:args.kind,issuedAt:Date.now()});
        try{return {id,job:await window.ChuteyExplorerAPI.command('transfer_start',{...args,id})};}
        catch(error){error.message+=' Its ID '+id+' is retained. Review previous copy before retrying.';throw error;}
      });
      if(started.reconciled)return started.job.receipt;
      const {id}=started;let job=started.job;
      while(['accepted','running'].includes(job.state)){
        onProgress(job);await new Promise(resolve=>setTimeout(resolve,400));
        job=await window.ChuteyExplorerAPI.command('transfer_status',{id});
      }
      if(!validReceipt(job))throw issue(job.error||'Copy did not return a verified receipt. Review previous copy before retrying.','TRANSFER_'+job.state,job);
      if(args.kind==='local_to_live')void chrome.runtime.sendMessage?.({type:'chute-count-changed'})?.catch(()=>{});
      await admission(()=>finishPending({id},job));return job.receipt;
    },
    async mediaSource(row) {
      const source = await window.ChuteyExplorerAPI.command("media_source",{handle:row.handle,identity:row.identity});
      if (!/^\/api\/explorer\/v1\/media\/[A-Za-z0-9_-]+$/.test(source.url)) throw new Error("Invalid local media response.");
      return {...source,url:"http://127.0.0.1:17891" + source.url};
    },
    async content(row, {thumbnail = false, original = false, signal} = {}) {
      if (typeof row?.handle !== "string" || typeof row?.identity !== "string") {
        const error = new Error("This file reference is incomplete. Refresh the folder, then select the file again.");
        error.code = "INVALID_HANDLE"; throw error;
      }
      // The preserved November 4 worker strictly rejects unknown keys, including
      // original:false. Only an explicit export needs the newer original flag.
      const body = {handle:row.handle, identity:row.identity, thumbnail};
      if (original) body.original = true;
      return (await request("content", body, signal)).blob();
    }
  });
})();
