/* Shared product settings. Worker state is acknowledged before showing it active. */
(() => {
  'use strict';
  const destination=document.querySelector('.chutey-gallery-popup .settings')||document.querySelector('.chutey-shared-options');if(!destination)return;
  const root=document.createElement('section');root.dataset.coreSettings='';
  root.innerHTML=`<button id="restore-ui-defaults" type="button" class="secondary-button">Restore Defaults</button>
    <p class="settings-description">Restore appearance, toolbar, browsing/capture preferences, file-action defaults and Balanced performance. History, saved files, folder approvals, playback consent and credentials are unchanged.</p>
    <p id="restore-defaults-status" role="status" aria-live="polite"></p>
    <fieldset><legend>Toolbar</legend><label>When I click Chutey’s Chrome toolbar icon
      <select id="toolbar-entry"><option value="popup">Popup</option><option value="shelf">Shelf</option></select></label><p id="toolbar-status" role="status" aria-live="polite"></p></fieldset>
    <fieldset><legend>Performance</legend><label>Performance mode
      <select id="performance-mode" disabled><option value="efficiency">Efficiency</option><option value="balanced" selected>Balanced (default)</option><option value="turbo">Turbo</option></select></label>
      <p id="performance-description" class="settings-description">Balanced adapts resources for everyday browsing and playback.</p><p id="performance-status" role="status" aria-live="polite">Checking active worker mode…</p><details><summary>Effective resource limits</summary><p id="performance-limits" class="settings-description">Available after worker acknowledgment.</p></details></fieldset>
    <fieldset id="settings-folder-access"><legend>Folder Access</legend><p id="folder-access-status" role="status" aria-live="polite">Checking approved folder…</p>
      <label class="settings-checkbox"><input id="movie-media-allowed" type="checkbox" disabled> <span>Allow movie media playback</span></label>
      <p class="settings-description">Optional playback for the approved folder. This does not grant another folder or change read/write access.</p>
      <button id="settings-folder-choose" type="button" class="secondary-button">Choose another approved folder…</button><button id="settings-worker-refresh" type="button" class="secondary-button">Refresh connection status</button>
      <p id="movie-media-status" role="status" aria-live="polite"></p></fieldset>`;
  destination.prepend(root);
  // File actions follow the core settings, ahead of decorative presentation.
  const actions=destination.querySelector('[data-file-action-settings]');if(actions)root.after(actions);
  const mode=root.querySelector('#performance-mode'),modeStatus=root.querySelector('#performance-status'),movie=root.querySelector('#movie-media-allowed'),movieStatus=root.querySelector('#movie-media-status'),folderStatus=root.querySelector('#folder-access-status'),toolbar=root.querySelector('#toolbar-entry');
  const descriptions={efficiency:'Efficiency reduces background work and thumbnail prefetch while protecting playback and controls.',balanced:'Balanced adapts resources for everyday browsing, copying and playback.',turbo:'Turbo uses more available resources within safe hardware limits; playback and controls retain priority.'};
  let appliedMode=null,refreshing=null,refreshGeneration=0;
  const api=()=>window.ChuteyExplorerAPI;
  function unsupported(error){return error?.code==='UNSUPPORTED_COMMAND'?'The running worker does not support these settings. Use the matching repair test pair.':error.message||'Worker unavailable. Retry connection status.';}
  function showMode(result){
    if(!['efficiency','balanced','turbo'].includes(result?.mode))throw Error('The worker did not acknowledge a valid applied performance mode.');
    appliedMode=result.mode;mode.value=result.mode;mode.disabled=false;
    root.querySelector('#performance-description').textContent=descriptions[result.mode];
    const limits=result.effective_limits;
    const values=limits&&typeof limits==='object'?Object.entries(limits).filter(([,value])=>typeof value==='number').map(([key,value])=>key.replaceAll('_',' ')+' '+value).join(' · '):'';
    modeStatus.textContent='Active worker mode: '+result.mode+'.';
    root.querySelector('#performance-limits').textContent=values||'The worker acknowledged this mode; no numeric limits were returned.';
    document.dispatchEvent(new CustomEvent('chutey-performance-changed',{detail:result}));
  }
  async function refresh(force=false){
    if(refreshing&&!force)return refreshing;
    const serial=++refreshGeneration;
    refreshing=(async()=>{
      try{
        const transport=api();if(!transport)throw Error('The Explorer transport is unavailable.');
        const session=await transport.nativeSession(false);
        const results=await Promise.allSettled([transport.command('performance_get'),transport.command('media_policy_get'),transport.command('roots')]);
        if(serial!==refreshGeneration)return;
        if(results[0].status==='fulfilled')showMode(results[0].value);
        else{mode.disabled=true;modeStatus.textContent=unsupported(results[0].reason);}
        const roots=results[2].status==='fulfilled'?results[2].value.roots||[]:[];
        const names=roots[0]?.name||'';
        folderStatus.textContent=session.scope==='saved_store'?'Saved Chutey files only. Choose a folder to approve external browsing.':(names?'Approved folder: '+names:'Approved folder connected')+' · '+(session.read_only===false?'read and write':'read only');
        if(results[1].status==='fulfilled'&&typeof results[1].value?.allowed==='boolean'){
          const policy=results[1].value;movie.checked=policy.allowed;movie.disabled=session.scope==='saved_store';
          movieStatus.textContent=movie.disabled?'Approve an external folder before enabling movie playback.':policy.migrated?'Existing approval retained its previous playback behavior. You can change it here.':policy.allowed?'Movie playback is enabled for this folder.':'Movie playback is off for this folder. Enable it here without selecting the folder again.';
        }else{movie.disabled=true;movieStatus.textContent=results[1].status==='rejected'?unsupported(results[1].reason):'The worker did not acknowledge the movie policy.';}
      }catch(error){if(serial===refreshGeneration){mode.disabled=true;movie.disabled=true;modeStatus.textContent=unsupported(error);folderStatus.textContent=error.message||'Folder access unavailable.';}}
      finally{if(serial===refreshGeneration)refreshing=null;}
    })();return refreshing;
  }
  mode.onchange=async()=>{
    const requested=mode.value;mode.disabled=true;modeStatus.textContent='Applying '+requested+'…';
    try{
      const result=await api().command('performance_set',{mode:requested});showMode(result);
      await chrome.storage.sync.set({chuteyPerformanceMode:result.mode});
    }catch(error){mode.value=appliedMode||'balanced';mode.disabled=appliedMode===null;modeStatus.textContent=unsupported(error);}
  };
  movie.onchange=async()=>{
    const allowed=movie.checked;movie.disabled=true;movieStatus.textContent='Updating folder playback choice…';
    try{
      const result=await api().command('media_policy_set',{allowed});
      if(typeof result?.allowed!=='boolean')throw Error('The worker did not acknowledge the playback choice.');
      movie.checked=result.allowed;movieStatus.textContent=result.allowed?'Movie playback enabled for this approved folder.':'Movie playback disabled. Existing folder access is unchanged.';
    }catch(error){movie.checked=!allowed;movieStatus.textContent=unsupported(error);}
    finally{movie.disabled=false;}
  };
  root.querySelector('#settings-folder-choose').onclick=async()=>{
    try{
      await api().nativeSession(true);await refresh(true);
      // The policy checkbox remains visible and explicit at this first approval.
      movie.focus({preventScroll:false});
      document.dispatchEvent(new CustomEvent('chutey-folder-access-changed'));
    }catch(error){folderStatus.textContent=error.message||'No folder was approved. Existing access remains unchanged.';}
  };
  root.querySelector('#settings-worker-refresh').onclick=()=>void refresh(true);
  void chrome.storage.sync.get({chuteToolbarEntry:'popup'}).then(value=>{toolbar.value=value.chuteToolbarEntry==='shelf'?'shelf':'popup';});
  toolbar.onchange=async()=>{
    const choice=toolbar.value;toolbar.disabled=true;
    try{
      await chrome.storage.sync.set({chuteToolbarEntry:choice});
      const ack=await chrome.runtime.sendMessage({type:'chutey-toolbar-apply',value:choice});
      if(ack?.ok!==true||ack.entry!==choice)throw Error(ack?.error||'Chrome did not acknowledge this toolbar choice. The preference is saved; check the next click.');
      root.querySelector('#toolbar-status').textContent='Applied. The next toolbar click opens '+(choice==='shelf'?'Shelf.':'the popup.');
    }catch(error){root.querySelector('#toolbar-status').textContent=error.message||'Could not save toolbar choice. Retry.';}
    finally{toolbar.disabled=false;}
  };
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='sync')return;
    if(changes.chuteToolbarEntry)toolbar.value=changes.chuteToolbarEntry.newValue==='shelf'?'shelf':'popup';
    if(changes.chuteyPerformanceMode&&changes.chuteyPerformanceMode.newValue!==appliedMode)void refresh(true);
  });
  root.querySelector('#restore-ui-defaults').onclick=async()=>{
    if(!confirm('Restore appearance, toolbar, browsing/capture preferences, file actions and Balanced performance? Saved files, History, folder approvals, playback consent and credentials will not be changed.'))return;
    const status=root.querySelector('#restore-defaults-status');
    try{
      await chrome.storage.sync.set({chuteToolbarEntry:'popup',chutePopupGridStep:0,chuteShelfViewerSize:'half',chuteyExplorerThumbnails:true,chuteAutoHide:true,chuteAccessMode:'floating',chuteThumbnails:true,chuteDragOutMode:'file',chuteBrowserImageSaveFull:true,chuteBrowserImageSaveCustom:false,chuteBrowserImageWidth:512,chuteBrowserImageHeight:512,chutePageSize:40,chuteyRevealTarget:'system',chuteyOpenTarget:'system'});
      await window.ChuteyPresentation?.reset();
      if(typeof loadPopupSettings==='function')await loadPopupSettings();
      const result=await api().command('performance_set',{mode:'balanced'});showMode(result);
      await chrome.storage.sync.set({chuteyPerformanceMode:result.mode});
      status.textContent='Defaults restored. History, saved content, approvals, playback consent and credentials were preserved.';
    }catch(error){status.textContent='Presentation defaults restored; worker performance could not be reset: '+unsupported(error);}
  };
  document.addEventListener('chutey-folder-access-changed',()=>void refresh(true));
  document.addEventListener('chutey-show-folder-access',()=>{
    if(details)details.open=true;
    root.querySelector('#settings-folder-access').scrollIntoView({block:'nearest'});
    void refresh(true).then(()=>{if(!movie.disabled)movie.focus({preventScroll:true});});
  });
  window.ChuteySettings=Object.freeze({refresh});
  // Opening Settings asks for status; ordinary popup first paint stays independent
  // of native startup and this panel never silently applies a stored Turbo label.
  const details=destination.closest('details');
  details?.addEventListener('toggle',()=>{if(details.open)void refresh();});
  if(details?.open)void refresh();
})();
