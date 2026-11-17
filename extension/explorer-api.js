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
    async command(command, args = {}) {
      const receipt = await (await request("command", {command, args})).json();
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
    async transfer(args,{onProgress=()=>{}}={}) {
      const previous=(await chrome.storage.session.get({chuteyPendingTransfer:null})).chuteyPendingTransfer;
      if(previous && previous.id!==args.id)throw Error('Check the previous transfer '+previous.id+' before starting another copy.');
      const id=args.id || crypto.randomUUID().replaceAll('-','');
      await chrome.storage.session.set({chuteyPendingTransfer:{id,issuedAt:Date.now()}});
      let job;
      try{job=await window.ChuteyExplorerAPI.command('transfer_start',{...args,id});}
      catch(error){error.message+=' Check transfer '+id+' before retrying; its ID is retained.';throw error;}
      while(['accepted','running'].includes(job.state)){
        onProgress(job);await new Promise(resolve=>setTimeout(resolve,400));
        job=await window.ChuteyExplorerAPI.command('transfer_status',{id});
      }
      if(job.state!=='COMMITTED')throw Error(job.error || 'Transfer did not commit. Check its retained job ID before retrying.');
      if(args.kind==='local_to_live')void chrome.runtime.sendMessage?.({type:'chute-count-changed'})?.catch(()=>{});
      await chrome.storage.session.set({chuteyLastTransferReceipt:{id,state:job.state,receipt:job.receipt}});
      await chrome.storage.session.remove('chuteyPendingTransfer');
      await window.ChuteyExplorerAPI.command('transfer_dismiss',{id}).catch(()=>{});return job.receipt;
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
