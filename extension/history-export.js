/* Shelf-only export: durable job ID, bounded polling and native single download. */
(() => {
  const panel=document.querySelector('#history-export');if(!panel)return;
  const scope=panel.querySelector('#export-scope'),dates=panel.querySelector('#export-dates'),button=panel.querySelector('#export-history'),cancel=panel.querySelector('#export-cancel'),status=panel.querySelector('#export-status');
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone,KEY='chuteyHistoryExport';
  panel.querySelector('#export-timezone').textContent='Local dates in '+zone+' (inclusive). Empty periods produce a ZIP with headers and an empty event list.';
  scope.onchange=()=>{dates.hidden=scope.value!=='range';};
  let job=null,download=null,stopped=false,generation=0;
  const save=()=>chrome.storage.session.set({[KEY]:{id:job.id,download}});
  const lock=value=>{scope.disabled=value;panel.querySelectorAll('input').forEach(n=>{n.disabled=value;});};
  async function clear(){job=null;download=null;await chrome.storage.session.remove(KEY);button.textContent='Export History';button.disabled=false;cancel.hidden=true;lock(false);}
  async function completed(){
    status.textContent='Downloaded one ZIP · '+job.count+' events · '+job.filename+' · '+job.timezone;
    const id=job.id;await clear();void ChuteyExplorerAPI.command('history_export_cancel',{id}).catch(()=>{});
  }
  async function watch(token){
    button.disabled=true;cancel.hidden=false;lock(true);
    while(token===generation&&!stopped&&['accepted','running'].includes(job.state)){
      status.textContent='Building one ZIP · '+job.phase+' · '+job.count+' events. You may keep using Chutey.';
      await new Promise(resolve=>setTimeout(resolve,650));if(token!==generation||stopped)return;
      job=await ChuteyExplorerAPI.command('history_export_status',{id:job.id});
    }
    if(token!==generation||stopped)return;
    if(job.state!=='ready')throw Error(job.error||'The single ZIP could not complete. Cancel this job and retry.');
    status.textContent='One verified ZIP ready · '+job.count+' events · '+job.timezone+'. Choose Download ready ZIP.';
    button.disabled=false;button.textContent='Download ready ZIP';
  }
  cancel.onclick=async()=>{
    stopped=true;++generation;
    try{if(download!==null)await chrome.downloads.cancel(download);if(job)await ChuteyExplorerAPI.command('history_export_cancel',{id:job.id});await clear();status.textContent='Export cancelled. History unchanged.';}
    catch(error){status.textContent=error.message;button.disabled=false;}
  };
  chrome.downloads?.onChanged.addListener(delta=>{
    if(delta.id!==download||!job)return;
    if(delta.state?.current==='complete')void completed();
    else if(delta.state?.current==='interrupted'){status.textContent='Download interrupted. The single ZIP did not complete. Retry downloading this archive; History unchanged.';download=null;void save();button.disabled=false;button.textContent='Download ready ZIP';}
  });
  async function downloadReady(){
    if(!/^\/api\/explorer\/v1\/history-download\/[A-Za-z0-9_-]+$/.test(job.url))throw Error('Invalid archive capability.');
    button.disabled=true;status.textContent='One verified ZIP ready · '+job.count+' events. Downloading…';
    download=await chrome.downloads.download({url:'http://127.0.0.1:17891'+job.url,filename:job.filename,saveAs:true,conflictAction:'uniquify'});await save();
  }
  button.onclick=async()=>{
    button.disabled=true;
    try{
      await ChuteyExplorerAPI.nativeSession(false);
      if(job){job=await ChuteyExplorerAPI.command('history_export_status',{id:job.id});if(job.state==='ready'){await downloadReady();return;}await watch(++generation);return;}
      const args={scope:scope.value,timezone:zone};
      if(scope.value==='range'){
        args.from=panel.querySelector('#export-from').value;args.to=panel.querySelector('#export-to').value;
        if(!args.from||!args.to||args.from>args.to){status.textContent='Select valid From/To dates, with From no later than To.';button.disabled=false;return;}
      }
      button.disabled=true;cancel.hidden=false;stopped=false;status.textContent='Preparing one ZIP…';
      job=await ChuteyExplorerAPI.command('history_export_create',args);await save();await watch(++generation);
      if(job?.state==='ready'&&!stopped)await downloadReady();
    }catch(error){status.textContent=error.message||'The single ZIP could not complete. History unchanged.';button.disabled=false;if(job)cancel.hidden=false;}
  };
  void chrome.storage.session.get({[KEY]:null}).then(async value=>{
    const pending=value[KEY];if(!pending)return;
    try{
      await ChuteyExplorerAPI.nativeSession(false);job=await ChuteyExplorerAPI.command('history_export_status',{id:pending.id});download=pending.download??null;cancel.hidden=false;lock(true);
      if(download!==null){
        const found=await chrome.downloads.search({id:download});
        if(found[0]?.state==='complete'){await completed();return;}
        if(found[0]?.state==='in_progress'){button.disabled=true;status.textContent='Downloading one ZIP. Progress is available in Chrome Downloads.';return;}
        download=null;await save();
      }
      await watch(++generation); // Reopened Shelf never auto-starts another download.
    }catch(error){status.textContent=error.message+' Cancel the retained export to retry.';button.disabled=false;cancel.hidden=false;}
  });
})();
