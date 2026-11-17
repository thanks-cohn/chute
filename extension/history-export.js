/* Shelf-only metadata export. Browser download streams one verified server ZIP. */
(() => {
  const panel=document.querySelector('#history-export');if(!panel)return;
  const scope=panel.querySelector('#export-scope'),dates=panel.querySelector('#export-dates'),button=panel.querySelector('#export-history'),cancel=panel.querySelector('#export-cancel'),status=panel.querySelector('#export-status');
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  panel.querySelector('#export-timezone').textContent='Local dates in '+zone+' (inclusive). Empty periods produce a ZIP with headers and an empty event list.';
  scope.onchange=()=>{dates.hidden=scope.value!=='range';};
  let job=null,download=null,stopped=false;
  cancel.onclick=async()=>{
    stopped=true;
    try{if(download!==null)await chrome.downloads.cancel(download);if(job)await ChuteyExplorerAPI.command('history_export_cancel',{id:job.id});status.textContent='Export cancelled. History unchanged.';}
    catch(error){status.textContent=error.message;}finally{button.disabled=false;cancel.hidden=true;}
  };
  chrome.downloads?.onChanged.addListener(delta=>{
    if(delta.id!==download)return;
    if(delta.state?.current==='complete'){
      status.textContent='Downloaded one ZIP · '+job.count+' events · '+job.filename+' · '+job.timezone;
      cancel.hidden=true;button.disabled=false;
      void ChuteyExplorerAPI.command('history_export_cancel',{id:job.id}).catch(()=>{});
    }else if(delta.state?.current==='interrupted'){status.textContent='Download interrupted. The single ZIP did not complete. Retry; History unchanged.';button.disabled=false;cancel.hidden=true;}
  });
  button.onclick=async()=>{
    const args={scope:scope.value,timezone:zone};
    if(scope.value==='range'){
      args.from=panel.querySelector('#export-from').value;args.to=panel.querySelector('#export-to').value;
      if(!args.from||!args.to||args.from>args.to){status.textContent='Select valid From/To dates, with From no later than To.';return;}
    }
    button.disabled=true;cancel.hidden=false;stopped=false;download=null;status.textContent='Preparing one ZIP…';
    try{
      await ChuteyExplorerAPI.nativeSession(false);
      job=await ChuteyExplorerAPI.command('history_export_create',args);
      while(!stopped&&['accepted','running'].includes(job.state)){
        status.textContent='Building one ZIP · '+job.phase+' · '+job.count+' events. You may keep using Chutey.';
        await new Promise(resolve=>setTimeout(resolve,650));
        if(stopped)return;
        job=await ChuteyExplorerAPI.command('history_export_status',{id:job.id});
      }
      if(stopped)return;
      if(job.state!=='ready')throw Error(job.error||'The single ZIP could not complete. Retry.');
      if(!/^\/api\/explorer\/v1\/history-download\/[A-Za-z0-9_-]+$/.test(job.url))throw Error('Invalid archive capability.');
      status.textContent='One verified ZIP ready · '+job.count+' events. Downloading…';
      download=await chrome.downloads.download({url:'http://127.0.0.1:17891'+job.url,filename:job.filename,saveAs:true,conflictAction:'uniquify'});
    }catch(error){status.textContent=error.message||'The single ZIP could not complete. History unchanged.';button.disabled=false;cancel.hidden=true;}
  };
})();
