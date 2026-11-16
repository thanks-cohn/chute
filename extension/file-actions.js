/* One set of persisted action preferences for popup, Shelf and Explorer. */
(() => {
  "use strict";
  const defaults = {chuteyRevealTarget:"chutey",chuteyOpenTarget:"chutey"};
  let settings = {...defaults}, revision = 0;
  function apply(value) {
    settings = {chuteyRevealTarget:value.chuteyRevealTarget === "system" ? "system":"chutey",
      chuteyOpenTarget:value.chuteyOpenTarget === "system" ? "system":"chutey"};
    document.querySelectorAll('[data-file-preference]').forEach(node => { node.value = settings[node.dataset.filePreference]; });
  }
  const ready = chrome.storage.sync.get(defaults).then(value => { if (!revision) apply(value); }).catch(() => {});
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area !== 'sync') return;
    const patch = Object.fromEntries(Object.keys(defaults).filter(key => changes[key]).map(key => [key,changes[key].newValue]));
    if (Object.keys(patch).length) { ++revision; apply({...settings,...patch}); }
  });
  for (const panel of document.querySelectorAll('[data-file-action-settings]')) {
    panel.innerHTML = `<legend>File actions</legend><label>Reveal / GO TO <select data-file-preference="chuteyRevealTarget"><option value="chutey">Chutey File Explorer</option><option value="system">Windows Explorer (existing Reveal)</option></select></label><label>Open <select data-file-preference="chuteyOpenTarget"><option value="chutey">Inside Chutey</option><option value="system">System associated application</option></select></label><span role="status"></span>`;
    panel.querySelectorAll('select').forEach(node => node.onchange = async () => {
      const patch = {[node.dataset.filePreference]:node.value}; ++revision; apply({...settings,...patch});
      try { await chrome.storage.sync.set(patch); panel.querySelector('[role=status]').textContent = 'Saved'; }
      catch { panel.querySelector('[role=status]').textContent = 'Could not save. Retry.'; }
    });
  }
  async function saved(file,action) {
    await ready;
    if (action === 'reveal' && settings.chuteyRevealTarget === 'system') {
      const response = await fetch('http://127.0.0.1:17891/api/reveal/'+encodeURIComponent(file.id),{method:'POST',cache:'no-store'});
      if (!response.ok) throw Error('Windows Reveal failed. Check the companion connection.');
      return;
    }
    if (window.ChuteyExplorerNavigation) return window.ChuteyExplorerNavigation.saved(file,action);
    const intent = {id:file.id,action,issuedAt:Date.now()};
    // Explicit action only; hand off to the Shelf, never to an arbitrary path.
    const tabs = await chrome.tabs.query({active:true,currentWindow:true});
    if (!chrome.sidePanel?.open || !tabs[0]?.windowId) throw Error('Open the Chutey Shelf to use this file action.');
    await Promise.all([chrome.storage.session.set({chuteyFileActionIntent:intent}),chrome.sidePanel.open({windowId:tabs[0].windowId})]);
  }
  window.ChuteyFileActions = Object.freeze({ready,get:() => ({...settings}),saved});
  apply(settings);
})();
