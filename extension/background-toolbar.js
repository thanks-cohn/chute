/* Chrome owns the toolbar gesture. No tab polling, window duplication or replay. */
(() => {
  'use strict';
  const KEY='chuteToolbarEntry';
  let updates=Promise.resolve(),generation=0;
  function apply(value){
    const serial=++generation;
    const task=async()=>{
      const choice=value===undefined?(await chrome.storage.sync.get({[KEY]:'popup'}))[KEY]:value;
      if(serial!==generation)return;
      const shelf=choice==='shelf';
      if(!chrome.action?.setPopup||(shelf&&!chrome.sidePanel?.setPanelBehavior))throw Error('This Chrome version cannot apply Shelf toolbar entry. Popup remains available.');
      try{
        await chrome.action.setPopup({popup:shelf?'':'popup.html'});
        await chrome.sidePanel?.setPanelBehavior?.({openPanelOnActionClick:shelf});
      }catch{
        await chrome.action.setPopup({popup:'popup.html'}).catch(()=>{});
        throw Error('Chrome could not apply toolbar entry. Popup remains available.');
      }
      return shelf?'shelf':'popup';
    };
    updates=updates.catch(()=>{}).then(task);return updates;
  }
  const ready=apply();
  globalThis.ChuteyToolbar=Object.freeze({apply,ready});
  ready.catch(()=>{});
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='sync'&&changes[KEY])void apply(changes[KEY].newValue).catch(()=>{});
  });
  chrome.runtime.onMessage?.addListener((message,sender,respond)=>{
    if(message?.type!=='chutey-toolbar-apply')return;
    if(!sender.url?.startsWith(chrome.runtime.getURL(''))){respond({ok:false,error:'Extension settings required.'});return;}
    apply(message.value).then(entry=>respond({ok:entry===message.value,entry}),error=>respond({ok:false,error:error.message}));return true;
  });
  chrome.runtime.onStartup?.addListener(()=>{void apply().catch(()=>{});});
})();
