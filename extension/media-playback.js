/* Shared diagnostics; distinguish an available source from Chrome decode failure. */
(() => {
  async function failure(node,source) {
    const code=node.error?.code;
    if(source.url.startsWith("blob:"))return "The saved clip was loaded, but Chrome could not decode its container/codec or the file is damaged.";
    try {
      const response=await fetch(source.url,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(2000)});
      if(!response.ok){
        const reason=response.headers.get('X-Chutey-Error');
        if(reason==='STREAM_EXPIRED')return 'Media ticket expired. Select the file again to renew access.';
        if(response.status===403||reason==='UNAUTHORIZED')return 'Media access was revoked or the authorized session expired. Reconnect and select the file again.';
        return 'The local media source changed, is missing or cannot be read (HTTP '+response.status+'). Refresh the folder.';
      }
      if(code===3||code===4)return 'The local source is available, but Chrome could not decode its container/codec or the file is damaged. No transcoding was attempted.';
      if(code===1)return 'Playback was cancelled. Select the file again to retry.';
      return 'Media reading was interrupted while the local source remains available. Retry playback.';
    }catch{return 'The local companion is disconnected or not responding. Reconnect before retrying playback.';}
  }
  window.ChuteyMediaPlayback=Object.freeze({failure});
})();
