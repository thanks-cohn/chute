/* Shared diagnostics; distinguish an available source from Chrome decode failure. */
(() => {
  async function failure(node,source,{released=false}={}) {
    const code=node.error?.code;
    const stoppedFailure=()=>{
      if(code===3||code===4)return 'Chrome could not decode this media container/codec or the file is damaged. Select the same file to retry. No transcoding was attempted.';
      if(code===1)return 'Playback was cancelled. Select the file again to retry.';
      return 'Media reading was interrupted. The failed player has been stopped; select the same file to retry.';
    };
    if(source.url.startsWith("blob:"))return "The saved clip was loaded, but Chrome could not decode its container/codec or the file is damaged.";
    try {
      if(source.ticket && window.ChuteyExplorerAPI){
        const status=await window.ChuteyExplorerAPI.command('media_status',{ticket:source.ticket},{signal:AbortSignal.timeout(2000)});
        const original=status.original_get;
        if(original && original.code!=='OK')return 'Original media GET failed: '+original.code+' (HTTP '+original.status+', Origin '+(original.origin_present?'present':'missing')+'). Folder approval has not been assumed revoked.';
      }
      // Error handlers release the player immediately. A later HEAD of that
      // ticket would diagnose our own cleanup as expiry, masking the failure.
      if(released)return stoppedFailure();
      const response=await fetch(source.url,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(2000)});
      if(!response.ok){
        const reason=response.headers.get('X-Chutey-Error');
        if(reason==='STREAM_EXPIRED')return 'Media ticket expired. Select the file again to renew access.';
        if(reason==='UNAUTHORIZED')return 'This media request was not authorized. Check the original stream diagnostic; this alone does not prove folder access was revoked.';
        if(reason==='EXPLORER_DISABLED')return 'The companion lost its browsing session. Reconnect without changing folder approval.';
        if(reason==='INVALID_HOST')return 'The media request used an invalid loopback host.';
        if(reason==='BUSY'||response.status===429)return 'The media lane is busy. Stop an unused stream and retry; folder access remains unchanged.';
        return 'The local media source changed, is missing or cannot be read (HTTP '+response.status+'). Refresh the folder.';
      }
      if(code===3||code===4)return 'The local source is available, but Chrome could not decode its container/codec or the file is damaged. No transcoding was attempted.';
      if(code===1)return 'Playback was cancelled. Select the file again to retry.';
      return 'Media reading was interrupted while the local source remains available. Retry playback.';
    }catch{return released?stoppedFailure():'The local companion is disconnected or not responding. Reconnect before retrying playback.';}
  }
  const terminal=error=>['STREAM_EXPIRED','UNAUTHORIZED','MEDIA_CONSENT_REQUIRED','EXPLORER_DISABLED','CONSENT_INVALID','NEEDS_SELECTION'].includes(error?.code);
  function lease(source,api,onError){
    let stopped=false,busy=false;
    const renew=async()=>{if(stopped||busy)return;busy=true;
      try{await api.nativeSession(false);if(!stopped)await api.command('renew_media',{ticket:source.ticket});}
      catch(error){if(!stopped){if(terminal(error)){stopped=true;clearInterval(timer);}onError?.(error);}}finally{busy=false;}};
    const timer=setInterval(renew,45000);
    return ()=>{stopped=true;clearInterval(timer);};
  }
  window.ChuteyMediaPlayback=Object.freeze({failure,lease,terminal});
})();
