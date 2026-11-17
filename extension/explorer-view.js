/* Thin read-only client; no paths, writes, site tokens or duplicated file semantics. */
(() => {
  "use strict";
  const host = document.querySelector("#chutey-explorer-view");
  if (!host) return;
  const api = window.ChuteyExplorerAPI;
  host.innerHTML = `<div class="ex-native"><button type="button" data-action="select" aria-label="Choose another Windows folder" title="Browse for another folder">▰ Browse</button><details class="ex-more-settings"><summary title="Folder access and transfers" aria-label="More file options">⚙ <span>Folder Access</span></summary><div class="ex-advanced-actions"><label><input type="checkbox" data-setting="thumbnails" checked> Show image thumbnails</label><button type="button" data-action="resume">Retry connection</button><button type="button" data-action="write">Allow saving here…</button><button type="button" data-action="live">Copy selected to Chutey</button><button type="button" data-action="reconcile">Check transfer</button><button type="button" data-action="cancel-transfer">Cancel copy</button><button type="button" data-action="review-transfer">Dismiss reviewed copy warning</button><button type="button" data-action="revoke">Remove folder access</button></div></details></div><form class="ex-connect" hidden><label>Local read session <input type="password" autocomplete="off" aria-label="Local read session token" required></label><button title="Connect" aria-label="Connect">↗</button></form>
    <div class="ex-toolbar"><button data-action="back" title="Back" aria-label="Back">‹</button><button data-action="forward" title="Forward" aria-label="Forward">›</button><button data-action="parent" title="Parent folder" aria-label="Parent folder">↑</button><button data-action="roots" title="Approved folders" aria-label="Approved folders">⌂</button><button data-action="refresh" title="Refresh" aria-label="Refresh">↻</button><span class="ex-breadcrumb">Local files</span><button data-action="grid" title="Toggle grid" aria-label="Toggle grid">▦</button></div>
    <div class="ex-filter"><input type="search" placeholder="Search this folder" aria-label="Search this folder"><select aria-label="Sort files"><option value="name">Name</option><option value="type">Type</option><option value="date">Date</option><option value="size">Size</option></select></div>
    <div class="ex-workspace"><aside class="ex-tree" aria-label="Folder navigator"></aside><div class="ex-column-resize" role="separator" tabindex="0" aria-label="Resize folders and files columns" aria-orientation="vertical" aria-valuemin="15" aria-valuemax="75" aria-valuenow="36" title="Drag to resize folders"></div><div class="ex-list" role="listbox" aria-label="Local files" aria-multiselectable="true" tabindex="0"></div></div>
    <div class="ex-status" role="status" aria-live="polite">Choose Browse once to access a local folder.</div>
    <section class="ex-preview" aria-label="File preview" hidden><div class="ex-resize" role="separator" aria-label="Resize preview" aria-orientation="horizontal" tabindex="0"></div><header><button data-action="previous" title="Previous file" aria-label="Previous file">‹</button><strong></strong><button data-action="next" title="Next file" aria-label="Next file">›</button><button data-action="expand" title="Expand preview" aria-label="Expand preview">Expand</button><button data-action="close" title="Close preview" aria-label="Close preview">×</button></header><div class="ex-preview-body"></div></section><div class="ex-menu" role="menu" hidden></div>`;
  const copyBar=document.createElement('div');copyBar.className='ex-copy-toolbar';copyBar.setAttribute('aria-label','Windows clipboard and copy recovery');
  copyBar.innerHTML='<button type="button" data-copy="copy">Copy</button><button type="button" data-copy="paste">Paste</button><button type="button" data-copy="review">Review previous copy</button><button type="button" data-copy="verify">Verify destination</button><button type="button" data-copy="cancel">Cancel copy</button><button type="button" data-copy="dismiss">Dismiss after review</button>';
  host.querySelector('.ex-workspace').before(copyBar);
  const $ = selector => host.querySelector(selector);
  const list = $(".ex-list"), tree = $(".ex-tree"), preview = $(".ex-preview"), status = $(".ex-status"), menu = $(".ex-menu");
  let current = null, parent = null, rows = [], roots = [], selected = new Set(), back = [], forward = [];
  let offset = 0, requestId = 0, previewId = 0, abort = null, urls = [], grid = false, mediaTicket = null, previewRow = null;
  let lastExplorerSignature = null;
  // Folder navigation can be resized by mouse or keyboard. Persist only a
  // non-sensitive ratio; never store a private root path or access token.
  const workspace = $(".ex-workspace");
  const columnGrip = $(".ex-column-resize");
  let folderWidth = 36;
  function setFolderWidth(value, persist = false) {
    folderWidth = Math.max(15, Math.min(75, Math.round(Number(value) || 36)));
    workspace.style.setProperty("--chutey-folder-width", folderWidth + "%");
    columnGrip.setAttribute("aria-valuenow", String(folderWidth));
    if (persist) void chrome.storage.local.set({chuteyFolderPanePercent:folderWidth}).catch(() => {});
  }
  setFolderWidth(36);
  let resizingColumns = false;
  columnGrip.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    resizingColumns = true;
    columnGrip.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  columnGrip.addEventListener("pointermove", event => {
    if (!resizingColumns || !columnGrip.hasPointerCapture(event.pointerId)) return;
    const bounds = workspace.getBoundingClientRect();
    setFolderWidth((event.clientX - bounds.left) / bounds.width * 100);
  });
  function endColumnResize() {
    if (!resizingColumns) return;
    resizingColumns = false;
    setFolderWidth(folderWidth,true);
  }
  columnGrip.addEventListener("pointerup",endColumnResize);
  columnGrip.addEventListener("pointercancel",endColumnResize);
  columnGrip.addEventListener("lostpointercapture",endColumnResize);
  columnGrip.addEventListener("keydown", event => {
    const delta = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0;
    if (delta) { event.preventDefault(); setFolderWidth(folderWidth + delta,true); }
    else if (event.key === "Home") { event.preventDefault(); setFolderWidth(15,true); }
    else if (event.key === "End") { event.preventDefault(); setFolderWidth(75,true); }
  });
  void chrome.storage.local.get({chuteyFolderPanePercent:36}).then(value => {
    setFolderWidth(value.chuteyFolderPanePercent);
  }).catch(() => {});
  const thumbnails = new Map(), visibleThumbnails = new Set(), activeThumbnails = new Map();
  let showExplorerThumbnails = true;
  let thumbnailAbort = new AbortController(), thumbnailEpoch = 0;
  const isImage = row => /^image\/(png|jpeg|gif|webp|bmp|avif)$/i.test(row.mime || "") || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(row.name || "");
  const liveCopies = new Map();
  let writable = false, anchor = null, clipboardFile = null;
  const savedLocations = new Set();
  const say = text => { status.textContent = text; };
  const safe = fn => (...args) => { const previousStatus = status.textContent; try { return Promise.resolve(fn(...args)).catch(error => { say(error.code === "CANCELLED" ? previousStatus : error.message); }); } catch (error) { say(error.message); } };
  function button(label, text, fn) {
    const node = document.createElement("button"); node.type = "button"; node.title = label; node.setAttribute("aria-label", label); node.textContent = text; node.onclick = safe(fn); return node;
  }
  function releaseThumbnails() {
    thumbnailAbort.abort(); thumbnailAbort = new AbortController(); ++thumbnailEpoch;
    for (const controller of activeThumbnails.values()) controller.abort();
    visibleThumbnails.clear();
    for (const url of thumbnails.values()) URL.revokeObjectURL(url);
    thumbnails.clear();
  }
  function closePreview() {
    ++previewId; abort?.abort(); abort = null; previewRow = null;
    if (mediaTicket) { void api.command("release_media",{ticket:mediaTicket}).catch(() => {}); mediaTicket = null; }
    $(".ex-preview-body").querySelectorAll("video,audio").forEach(video => { video.onerror=null; video.pause(); video.removeAttribute("src"); video.load(); });
    $(".ex-preview-body").replaceChildren();
    for (const url of urls) URL.revokeObjectURL(url); urls = []; preview.hidden = true;
  }
  const pinned=document.createElement('section');pinned.className='ex-pinned-player';pinned.hidden=true;
  pinned.innerHTML='<header><strong>Media player</strong><button type="button" aria-label="Stop playback">Stop / Close</button></header><div class="ex-pinned-body"></div><p role="status"></p>';
  host.append(pinned);
  const pinnedBody=pinned.querySelector('.ex-pinned-body'),pinnedStatus=pinned.querySelector('[role=status]');
  let pinnedId=0,pinnedTicket=null,pinnedSource=null,pinnedRow=null,stopPinnedLease=null,pinnedUrls=[];
  function stopPinned(){++pinnedId;stopPinnedLease?.();stopPinnedLease=null;
    pinned.querySelectorAll('video,audio').forEach(n=>{n.onerror=null;n.pause();n.removeAttribute('src');n.load();});
    if(pinnedTicket)void api.command('release_media',{ticket:pinnedTicket}).catch(()=>{});
    pinnedTicket=null;pinnedRow=null;pinnedBody.replaceChildren();pinned.hidden=true;host.classList.remove('ex-has-pinned');
    for(const url of pinnedUrls)URL.revokeObjectURL(url);pinnedUrls=[];
  }
  pinned.querySelector('button').onclick=stopPinned;
  async function showPinned(row){
    if(pinnedRow?.identity===row.identity&&pinnedRow?.handle===row.handle)return;
    stopPinned();const id=pinnedId;pinnedRow=row;pinned.hidden=false;host.classList.add('ex-has-pinned');
    pinned.querySelector('strong').textContent=row.name;pinnedStatus.textContent='Playback stays here while you browse. Stop explicitly to release access.';
    const body=pinnedBody;body.textContent='Loading media…';
    const signal=new AbortController().signal;
    try{
      const meta=await api.command('preview',{handle:row.handle});
      if(id!==pinnedId)return;
      if(meta.identity!==row.identity)throw Error('The source changed; refresh the file.');
      const audio=meta.preview==='audio';
      if (meta.preview === "video" || audio) {
        const video = document.createElement(audio ? 'audio':'video'); video.controls = true; video.preload = "metadata";
        video.autoplay = false; video.crossOrigin = "anonymous"; video.setAttribute("referrerpolicy","no-referrer");
        if (!video.canPlayType(meta.mime)) { body.textContent = "This browser does not support this video container or codec."; return; }
        try {
          const source = await api.mediaSource(meta);
          if (id !== pinnedId) { void api.command("release_media",{ticket:source.ticket}).catch(() => {}); return; }
          pinnedTicket=source.ticket;pinnedSource=source;video.src=source.url;stopPinnedLease=window.ChuteyMediaPlayback.lease(source,api,error=>{if(window.ChuteyMediaPlayback.terminal(error)){stopPinned();say('Playback stopped: '+error.message);}else pinnedStatus.textContent='Continuation: '+error.message;});
        } catch (error) {
          if (id !== pinnedId) return;
          // The installed worker remains supported for bounded small clips.
          // Never materialize a whole movie as a Blob on an older companion.
          if (error.code !== "UNSUPPORTED_COMMAND" || meta.size > 32 * 1024 * 1024 || meta.preview === "unavailable") {
            body.textContent = error.code === "UNSUPPORTED_COMMAND" ? "This companion supports only small audio/video previews. Range streaming requires the separate test worker; the installed worker has not been changed." : error.message;
            return;
          }
          const blob = await api.content(meta,{signal});
          if (id !== pinnedId) return;
          const url = URL.createObjectURL(blob); pinnedUrls.push(url); video.src = url;
        }
        video.onerror = async () => {
          const message=await window.ChuteyMediaPlayback.failure(video,pinnedSource||{url:video.src});
          if(id!==pinnedId)return;
          if(pinnedTicket){void api.command('release_media',{ticket:pinnedTicket}).catch(()=>{});pinnedTicket=null;}stopPinnedLease?.();
          body.textContent=message;
        };
        body.replaceChildren(video); return;
      }
      body.textContent='Preview unavailable for this media format. Use Reveal / GO TO to locate the file; browser codec support varies.';
    }catch(error){if(id===pinnedId)body.textContent=error.message;}
  }
  function isMedia(row){return /^(video|audio)\//.test(row.mime||'')||/\.(mp4|webm|mp3|m4a|wav|flac|oga)$/i.test(row.name||'');}
  async function showPreview(row, {intentionalMedia = false} = {}) {
    if(isMedia(row)){
      if(pinnedRow && pinnedRow.identity!==row.identity && !intentionalMedia){say('Playback continues. Use Preview or Open inside Chutey to replace the active media.');return;}
      return showPinned(row);
    }
    closePreview(); const id = previewId; previewRow = row; preview.hidden = false;preview.tabIndex=-1;preview.focus({preventScroll:true});
    if (!selected.has(row.handle)) select(row); updateGalleryButtons();
    resizePreview();
    $(".ex-preview strong").textContent = row.name;
    const body = $(".ex-preview-body"); body.textContent = "Loading preview…";
    abort = new AbortController(); const signal = abort.signal;
    try {
      if(row.highlight){
        const page=await api.command('saved_text_page',{id:row.highlight.capture_id,offset:row.highlight.entry_offset,limit:65536});
        if(id!==previewId)return;
        const text=document.createElement('pre');text.textContent=page.text;
        body.replaceChildren(text);body.scrollTop=0;
        if(page.next!==null){
          const more=button('Continue reading','Continue reading',async()=>{
            const next=await api.command('saved_text_page',{id:row.highlight.capture_id,offset:page.next,limit:65536});
            if(id===previewId){text.textContent=next.text;body.scrollTop=0;page.next=next.next;more.disabled=next.next===null;}
          });body.append(more);
        }
        return;
      }
      const meta = await api.command("preview", {handle: row.handle});
      if (meta.handle !== row.handle || (row.identity && meta.identity !== row.identity)) {
        throw new Error("The file changed. Refresh the folder before previewing it.");
      }
      if (id !== previewId) return;
      const audio = meta.preview === "audio" || /^audio\//i.test(meta.mime || '') || /\.(mp3|m4a|wav|flac|oga)$/i.test(row.name);
      // Non-video previews retain the existing bounded content API.
      if (meta.preview === "unavailable" || meta.size > 64 * 1024 * 1024) {
        body.textContent = "This document/image preview is unsupported or exceeds its safe preview size. Use Open or Reveal; supported audio/video uses streaming."; return;
      }
      const blob = await api.content(meta, {signal});
      if (id !== previewId) return;
      body.replaceChildren();
      if (meta.preview === "text") {
        const text = document.createElement("pre"); text.textContent = await blob.text();
        if (id === previewId) body.append(text); return;
      }
      const url = URL.createObjectURL(blob); urls.push(url);
      const node = document.createElement(meta.preview === "image" ? "img" : meta.preview === "video" ? "video" : "iframe");
      if (meta.preview === "pdf") { node.setAttribute("sandbox", ""); node.title = row.name; }
      if (meta.preview === "video") { node.controls = true; node.preload = "metadata"; node.autoplay = false; }
      if (meta.preview === "image") { node.alt = row.name;  }
      node.onerror = () => { if (id !== previewId) return; body.textContent = "Preview unavailable: this browser could not decode the saved file."; };
      node.src = url; body.append(node);
    } catch (error) { if (id === previewId && error.name !== "AbortError") body.textContent = error.message; }
  }
  // The overlay is a sibling of the workspace for its entire lifetime.
  // Only its own box changes; no measuring or insertion among directory rows.
  let previewRatio = 1 / 3, expanded = false;
  const resize = $(".ex-resize");
  function previewBounds() {
    const outer = host.getBoundingClientRect(), content = workspace.getBoundingClientRect();
    return {bottom: outer.bottom, max: Math.max(0, outer.bottom - content.top)};
  }
  function resizePreview() {
    const bounds = previewBounds();
    const height = expanded ? bounds.max : Math.min(bounds.max, Math.max(Math.min(120, bounds.max), host.clientHeight * previewRatio));
    preview.style.height = height + "px";
    resize.setAttribute("aria-valuemin", String(Math.min(120, Math.round(bounds.max))));
    resize.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
    resize.setAttribute("aria-valuenow", String(Math.round(height)));
    const expand = $("[data-action=expand]");
    expand.textContent = expanded ? "Restore" : "Expand";
    expand.setAttribute("aria-label", expanded ? "Restore preview height" : "Expand preview");
  }
  function setPreviewHeight(height, persist = false) {
    expanded = false;
    const maximum = previewBounds().max;
    previewRatio = Math.min(maximum, Math.max(Math.min(120, maximum), height)) / Math.max(1,host.clientHeight);
    resizePreview();
    if (persist) void chrome.storage.local.set({chuteyPreviewRatio:previewRatio}).catch(() => {});
  }
  resize.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); resize.setPointerCapture(event.pointerId);
  };
  resize.onpointermove = event => {
    if (resize.hasPointerCapture(event.pointerId)) setPreviewHeight(previewBounds().bottom - event.clientY);
  };
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) resize.addEventListener(name, () => {
    void chrome.storage.local.set({chuteyPreviewRatio:previewRatio}).catch(() => {});
  });
  resize.onkeydown = event => {
    if (!["ArrowUp","ArrowDown","Home","End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "End") { expanded = true; resizePreview(); }
    else setPreviewHeight(event.key === "Home" ? 120 : preview.offsetHeight + (event.key === "ArrowUp" ? 16 : -16), true);
  };
  void chrome.storage.local.get({chuteyPreviewRatio:1/3}).then(settings => {
    const ratio = settings.chuteyPreviewRatio;
    if (typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 && ratio <= 1) previewRatio = ratio;
    if (!preview.hidden) resizePreview();
  }).catch(() => {});
  function updateGalleryButtons() {
    const files = rows.filter(row => row.kind === "file");
    const index = files.findIndex(row => row.handle === previewRow?.handle);
    $("[data-action=previous]").disabled = index <= 0;
    $("[data-action=next]").disabled = index < 0 || (index === files.length-1 && offset === null);
  }
  let galleryLoading = false;
  async function navigatePreview(delta) {
    if (!previewRow || galleryLoading) return;
    let files = rows.filter(row => row.kind === "file");
    let index = files.findIndex(row => row.handle === previewRow.handle);
    if (delta > 0 && index === files.length-1 && offset !== null) {
      galleryLoading = true;
      try { await load(current,{append:true}); } finally { galleryLoading = false; }
      files = rows.filter(row => row.kind === "file");
    }
    const next = files[index+delta];
    if (!next) return;
    select(next); await showPreview(next);
    const card = [...list.querySelectorAll('.ex-row')].find(node => node.dataset.handle === next.handle);
    if(previewRow?.handle===next.handle)preview.focus({preventScroll:true});
  }
  const thumbnailToggle = $('[data-setting=thumbnails]');
  function applyThumbnails(enabled) {
    showExplorerThumbnails = enabled !== false; thumbnailToggle.checked = showExplorerThumbnails;
    observer.disconnect(); queue.length = 0; releaseThumbnails();
    for (const node of list.querySelectorAll('.ex-row')) {
      node.querySelector('.ex-icon img')?.remove(); delete node.dataset.thumbnail;
      const row = rows.find(value => value.handle === node.dataset.handle);
      if (showExplorerThumbnails && row?.kind === 'file' && isImage(row)) observer.observe(node);
    }
  }
  thumbnailToggle.onchange = safe(async () => {
    applyThumbnails(thumbnailToggle.checked);
    await chrome.storage.sync.set({chuteyExplorerThumbnails:showExplorerThumbnails});
  });
  void chrome.storage.sync.get({chuteyExplorerThumbnails:true}).then(value => applyThumbnails(value.chuteyExplorerThumbnails)).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.chuteyExplorerThumbnails) applyThumbnails(changes.chuteyExplorerThumbnails.newValue);
  });
  function select(row, event = {}) {
    if (row.kind === "blocked") return;
    const eligible = rows.filter(value => value.kind !== "blocked");
    if (event.shiftKey && anchor) {
      const start = eligible.findIndex(value => value.handle === anchor);
      const end = eligible.indexOf(row);
      if (!event.ctrlKey && !event.metaKey) selected.clear();
      for (const value of eligible.slice(Math.min(start,end), Math.max(start,end)+1)) selected.add(value.handle);
    } else {
      if (!event.ctrlKey && !event.metaKey) selected.clear();
      if ((event.ctrlKey || event.metaKey) && selected.has(row.handle)) selected.delete(row.handle);
      else selected.add(row.handle);
      anchor = row.handle;
    }
    paintSelection();
  }
  function paintSelection() {
    for (const node of list.querySelectorAll("[role=option]")) node.setAttribute("aria-selected", String(selected.has(node.dataset.handle)));
    say(`${selected.size} selected · ${rows.length} loaded${offset !== null ? " · More items available" : ""}`);
  }
  function transferSelection() {
    const items = rows.filter(row => selected.has(row.handle) && row.kind === "file");
    if (items.length !== 1) throw Error("Choose one file. Bulk transfers require verified Premium support.");
    return items[0];
  }
  async function copyInside() {
    const row = transferSelection();
    clipboardFile = {handle:row.handle,identity:row.identity,name:row.name};
    say("Copied for Paste inside Chutey. This is not the Windows file clipboard.");
  }
  async function copySelection(){
    const files=rows.filter(r=>selected.has(r.handle)&&r.kind==='file').map(r=>({handle:r.handle,identity:r.identity}));
    if(!files.length)throw Error('Select files to copy.');
    const result=await api.command('clipboard_copy_files',{files,user_gesture:true});
    say('Copied '+result.count+' file reference(s) to Windows clipboard for Explorer or Chutey Paste.');
  }
  async function pasteSelection(destination=current,internal=false){
    if(!writable)throw Error('Approve write access to the destination first.');
    if(internal){if(!clipboardFile)throw Error('Copy inside Chutey first.');const receipt=await api.transfer({kind:'local_copy',handle:clipboardFile.handle,identity:clipboardFile.identity,destination},{onProgress:transferProgress});await load(current,{remember:false});say('Verified internal copy: '+receipt.name);return;}
    const imported=await api.command('clipboard_read_files',{user_gesture:true});
    try{
      for(let index=0;index<imported.files.length;index++){
        const receipt=await api.transfer({kind:'clipboard_to_local',snapshot:imported.snapshot,index,destination},{onProgress:transferProgress});
        say('Verified Windows clipboard file: '+receipt.name);
      }
      await load(current,{remember:false});
    }finally{void api.command('clipboard_release',{snapshot:imported.snapshot}).catch(()=>{});}
  }
  copyBar.querySelector('[data-copy=copy]').onclick=safe(copySelection);
  copyBar.querySelector('[data-copy=paste]').onclick=safe(()=>pasteSelection());
  for(const name of ['review','verify'])copyBar.querySelector('[data-copy='+name+']').onclick=safe(async()=>{const result=await api.reviewPending({destination:current,onProgress:transferProgress});say(result?.error||result?.message||result?.state||'No previous copy needs review.');});
  copyBar.querySelector('[data-copy=cancel]').onclick=safe(async()=>{const result=await api.cancelPending();say(result?.state||'No previous copy to cancel.');});
  copyBar.querySelector('[data-copy=dismiss]').onclick=safe(async()=>{if(confirm('Review the destination first. Dismiss this warning without changing files or repeating any copy?')){await api.dismissPending({reviewed:true});say('Reviewed warning dismissed; job evidence retained.');}});
  let listAbort=null,thumbnailConcurrency=2;
  document.addEventListener('chutey-performance-changed',event=>applyThumbnailBudget(event.detail));
  document.addEventListener('chutey-folder-access-changed',()=>void safe(connect)());
  async function load(handle, {remember = true, append = false, recovery = true} = {}) {
    clearTimeout(timer); // A delayed old-folder search must not cancel an explicit navigation.
    const id = ++requestId;
    listAbort?.abort();listAbort=new AbortController();
    say("Loading…");
    let result;
    try { result = await api.command("list", {handle, offset:append ? offset : 0,limit:100,sort:$(".ex-filter select").value,query:$(".ex-filter input").value},{signal:listAbort.signal}); }
    catch (error) {
      if(error.name==='AbortError'||id!==requestId)return;
      if (recovery && error.code === "INVALID_HANDLE") { await connect(false); return; }
      throw error;
    }
    if (id !== requestId) return;
    if (typeof result.writable === "boolean") writable = result.writable;
    // A refresh of an unchanged folder must not destroy rows, previews,
    // selections, thumbnail URLs or scroll position just to repaint the same data.
    const freshSignature = JSON.stringify([handle, $(".ex-filter select").value,
      $(".ex-filter input").value, result.next_offset,
      result.entries.map(row => [row.handle,row.identity,row.name,row.size,row.mime,row.kind])]);
    if (!append && handle === current && freshSignature === lastExplorerSignature) {
      for (const node of list.querySelectorAll('[data-thumbnail="failed"]')) {
        delete node.dataset.thumbnail; observer.unobserve(node); if (showExplorerThumbnails) observer.observe(node);
      }
      say(result.total ? `${rows.length} of ${result.total} items` : "This folder is empty");
      return;
    }
    if (!append) {
      lastExplorerSignature = freshSignature;
      if (remember && current && current !== handle) { back.push(current); forward = []; }
      observer.disconnect(); queue.length = 0;
      current = handle; parent = result.parent; selected.clear(); anchor = null; closePreview(); releaseThumbnails(); rows = []; list.replaceChildren();
      void rememberView();
    }
    rows.push(...result.entries); offset = result.next_offset;
    $(".ex-breadcrumb").textContent = result.name;
    list.querySelector(".ex-more")?.remove();
    for (const row of result.entries) {
      const node = document.createElement("div"); node.className = "ex-row"; node.tabIndex = 0; node.role = "option"; node.dataset.handle = row.handle; node.setAttribute("aria-selected", "false");
      const icon = document.createElement("span"); icon.className = "ex-icon"; icon.textContent = row.kind === "directory" ? "▰" : row.kind === "blocked" ? "⊘" : "▤"; icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span"); name.className = "ex-name"; name.textContent = row.name; name.title = row.name;
      const size = document.createElement("small"); size.textContent = row.kind === "directory" ? "Folder" : `${row.size.toLocaleString()} B`;
      node.append(icon, name, size); list.append(node);
      if (row.error) { node.title = row.error.message + " (" + row.error.code + ")"; node.setAttribute("aria-disabled","true"); }
      if (row.kind === "file") {
        node.draggable = true;
        node.ondragstart = event => {
          try {
            if (!selected.has(row.handle)) select(row);
            const source = transferSelection();

            const id = "explorer-" + crypto.randomUUID();
            event.dataTransfer.effectAllowed = "copy";
            const token = "CHUTE_ITEM:" + encodeURIComponent(JSON.stringify({id,name:source.name,mime:source.mime,source_kind:"local_explorer"}));
            event.dataTransfer.setData("application/x-chute-item", token);
            event.dataTransfer.setData("text/plain", token);
            // Registration exports no bytes. The receiving adapter reads the
            // guarded original on this first drop, including on a cold worker.
            void chrome.runtime.sendMessage({type:"chutey-register-explorer-drag",id,row:source}).catch(error => { say(error.message); });
          } catch (error) { event.preventDefault(); say(error.message); }
        };
      }
      node.onclick = event => {
        select(row, event);
        if (!preview.hidden) { if (row.kind === "file" && !isMedia(row)) void showPreview(row); else if(row.kind!=="file") closePreview(); }
      };
      node.ondblclick = safe(() => row.kind === "directory" ? load(row.handle) : fileAction(row,"open"));
      node.oncontextmenu = event => { event.preventDefault(); if (!selected.has(row.handle)) select(row); showMenu(event.clientX, event.clientY, row); };
      node.onkeydown = safe(async event => {
        if (event.key === "Enter") { event.preventDefault(); if (row.kind === "directory") await load(row.handle); else await fileAction(row,"open"); }
        if (event.key === " " ) { event.preventDefault(); select(row, event); }
        if (event.key === "Home") list.firstElementChild?.focus();
        if (event.key === "End") list.lastElementChild?.focus();
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = node.getBoundingClientRect(); showMenu(rect.left + 20, rect.top, row); }
      });
      if (showExplorerThumbnails && isImage(row)) observer.observe(node);
    }
    if (offset !== null) { const more = button("Load more files", "···", () => load(current, {append: true})); more.className = "ex-more"; list.append(more); }
    say(result.total ? `${rows.length} of ${result.total} items · ${writable ? "Write approved" : "Read only"}` : "This folder is empty · Read only");
  }
  // Lazy thumbnails, max three simultaneous requests; original bytes stay in Python.
  const queue = []; let active = 0;
  async function pump() {
    if (active >= thumbnailConcurrency || !queue.length) return;
    const node = queue.shift(); const row = rows.find(row => row.handle === node.dataset.handle);
    if (!row || !node.isConnected || !showExplorerThumbnails || !visibleThumbnails.has(node)) { void pump(); return; }
    active++;
    const epoch = thumbnailEpoch, controller = new AbortController(), folderSignal = thumbnailAbort.signal;
    const cancel = () => controller.abort(); folderSignal.addEventListener('abort',cancel,{once:true});
    const signal = controller.signal; activeThumbnails.set(node,controller);
    let url;
    try {
      const blob = await api.content(row, {thumbnail: true, signal});
      if (signal.aborted || epoch !== thumbnailEpoch || !node.isConnected) return;
      url = URL.createObjectURL(blob);
      const img = document.createElement("img"); img.alt = ""; img.src = url;
      await img.decode();
      if (signal.aborted || epoch !== thumbnailEpoch || !node.isConnected) return;
      thumbnails.set(row.handle, url); url = null;
      node.querySelector(".ex-icon").append(img);
      node.dataset.thumbnail = "ready";
    } catch (error) {
      if (!signal.aborted && epoch === thumbnailEpoch && node.isConnected) {
        node.dataset.thumbnail = "failed";
        node.title = row.name + " — Thumbnail unavailable: " + error.message + ". Refresh to retry.";
      }
    } finally {
      if (url) URL.revokeObjectURL(url); folderSignal.removeEventListener('abort',cancel);
      activeThumbnails.delete(node); active--;
      if (signal.aborted && epoch === thumbnailEpoch && visibleThumbnails.has(node)) queue.push(node);
      void pump();
    }
  }
  let observer;
  const observeEntries = entries => {
    for (const entry of entries) {
      const node = entry.target;
      if (!entry.isIntersecting) { visibleThumbnails.delete(node); activeThumbnails.get(node)?.abort(); continue; }
      visibleThumbnails.add(node);
      if (!node.querySelector('.ex-icon img') && node.dataset.thumbnail !== 'failed' && !activeThumbnails.has(node) && !queue.includes(node)) queue.push(node);
    }
    void pump(); void pump(); void pump();
  };
  function applyThumbnailBudget(result){
    const limits=result?.effective_limits;
    thumbnailConcurrency=Math.max(1,Math.min(3,limits?.thumbnail||2));
    observer?.disconnect();visibleThumbnails.clear();
    observer=new IntersectionObserver(observeEntries,{root:list,rootMargin:(Math.max(0,Math.min(3,limits?.thumbnail_prefetch??2))*80)+'px 0px'});
    if(showExplorerThumbnails)for(const node of list.querySelectorAll('.ex-row')){
      const row=rows.find(r=>r.handle===node.dataset.handle);if(row&&isImage(row))observer.observe(node);
    }
    void pump();void pump();void pump();
  }
  applyThumbnailBudget(null);
  async function branch(row, container) {
    const item = document.createElement("div"); item.className = "ex-branch"; item.dataset.destination = row.handle;
    const children = document.createElement("div"); children.className = "ex-children"; children.hidden = true;
    const expand = button("Expand " + row.name, "›", async () => {
      children.hidden = !children.hidden; expand.setAttribute("aria-expanded", String(!children.hidden)); expand.textContent = children.hidden ? "›" : "⌄";
      if (!children.hidden && !children.childElementCount) await treePage(row.handle, children, 0);
    }); expand.setAttribute("aria-expanded", "false");
    item.append(expand, button(row.name, row.name, () => load(row.handle))); container.append(item, children);
  }
  async function treePage(handle, children, page) {
    const data = await api.command("list", {handle, offset: page, limit: 200});
    for (const row of data.entries) if (row.kind === "directory") await branch(row, children);
    if (data.next_offset !== null) { const more = button("More folders", "···", async () => { await treePage(handle, children, data.next_offset); more.remove(); }); children.append(more); }
  }
  async function connect(recovery = true) {
    try{applyThumbnailBudget(await api.command('performance_get'));}catch{} // Old workers retain bounded compatibility defaults.
    const data = await api.command("roots"); roots = data.roots; tree.replaceChildren();
    for (const root of roots) await branch(root, tree);
    $(".ex-connect").hidden = true;
    if (roots[0]) {
      back = []; forward = [];
      let restored;
      try { restored = await api.command("resume_location"); } catch { restored = null; }
      const view = restored?.view || {};
      $(".ex-filter select").value = view.sort || "name";
      $(".ex-filter input").value = view.query || "";
      grid = view.grid ?? grid; list.classList.toggle("ex-grid", grid);
      await load(restored?.handle || roots[0].handle, {remember:false,recovery});
      list.scrollTop = view.scroll || 0;

    }
  }
  async function revealHere(row) {
    const meta = await api.command('stat',{handle:row.handle});
    if (!meta.parent) throw Error('This item has no containing folder.');
    $('.ex-filter input').value = '';
    await load(meta.parent,{remember:false});
    while (!rows.some(value => value.handle === row.handle) && offset !== null) await load(current,{append:true});
    const found = rows.find(value => value.handle === row.handle);
    if (!found) throw Error('The file is no longer in this folder. Refresh to retry.');
    select(found);
    const card = [...list.querySelectorAll('.ex-row')].find(node => node.dataset.handle === found.handle);
    card?.focus({preventScroll:true}); card?.scrollIntoView({block:'nearest'});
  }
  async function fileAction(row,action) {
    await window.ChuteyFileActions.ready;
    const target = window.ChuteyFileActions.get()[action === 'open' ? 'chuteyOpenTarget':'chuteyRevealTarget'];
    if (target === 'system') return api.command(action,{handle:row.handle,identity:row.identity});
    if (action === 'reveal') return revealHere(row);
    return showPreview(row,{intentionalMedia:true}); // Open inside Chutey, separate from explicit Preview.
  }
  async function savedAction(file,action) {
    const meta = await api.command('locate_saved',{id:file.id});
    if (meta.parent) savedLocations.add(meta.parent);
    document.querySelector('#chutey-tab-explorer')?.click();
    await revealHere(meta);
    if (action === 'open') await fileAction(meta,'open');
    else if(meta.highlight) await showPreview(meta);
  }
  window.ChuteyExplorerNavigation = Object.freeze({saved:savedAction});
  async function consumeAction(intent) {
    if (!intent || !/^[a-f0-9]{32}$/.test(intent.id || '') || !['open','reveal'].includes(intent.action) || Math.abs(Date.now()-intent.issuedAt)>60000) return;
    await chrome.storage.session.remove('chuteyFileActionIntent');
    document.querySelector('#chutey-tab-explorer')?.click();
    await api.nativeSession(false); await savedAction({id:intent.id},intent.action);
  }
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area === 'session' && changes.chuteyFileActionIntent?.newValue) void safe(consumeAction)(changes.chuteyFileActionIntent.newValue);
  });
  void chrome.storage.session.get({chuteyFileActionIntent:null}).then(value => safe(consumeAction)(value.chuteyFileActionIntent));
  function showMenu(x, y, row) {
    menu.replaceChildren();
    const actions = row ? [[row.kind === "directory" ? "Open folder" : "Preview", () => row.kind === "directory" ? load(row.handle) : showPreview(row,{intentionalMedia:true})], ["Properties", async () => { const meta = await api.command("stat", {handle: row.handle}); say(`${meta.name} · ${meta.size.toLocaleString()} bytes · ${new Date(meta.modified_ns / 1e6).toLocaleString()}`); }]] : [["Refresh", () => current && load(current, {remember: false})]];
    if (row?.kind === 'file') actions.push(['Open',() => fileAction(row,'open')],['Reveal / GO TO',() => fileAction(row,'reveal')]);
    if(row?.kind==='file')actions.push(['Copy',copySelection],['Copy inside Chutey',copyInside],['Copy image pixels to Windows clipboard',async()=>{const result=await api.command('clipboard_copy_image',{handle:row.handle,identity:row.identity,user_gesture:true});say('Copied image pixels to Windows clipboard · '+result.width+' × '+result.height);}]);
    actions.push(['Paste',()=>pasteSelection(row?.kind==='directory'?row.handle:current)],['Paste inside Chutey',()=>pasteSelection(row?.kind==='directory'?row.handle:current,true)],['Review previous copy',async()=>{const result=await api.reviewPending({destination:current});say(result?.error||result?.message||result?.state||'No previous copy needs review.');}],['Verify destination',async()=>{const result=await api.reviewPending({destination:current});say(result?.error||result?.message||result?.state||'No previous copy needs review.');}],['Cancel previous copy',async()=>{const result=await api.cancelPending();say(result?.state||'No previous copy to cancel.');}],['Dismiss after review',async()=>{if(confirm('Have you reviewed the destination? This changes no files and never repeats a copy.'))await api.dismissPending({reviewed:true});}]);

    for (const [name, fn] of actions) { const node = button(name, name, async () => { menu.hidden = true; await fn(); }); node.role = "menuitem"; menu.append(node); }
    menu.hidden = false;
    const bounds = host.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x - bounds.left, bounds.width - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(y - bounds.top, bounds.height - menu.offsetHeight))}px`;
    menu.querySelector("button:not(:disabled)")?.focus();
  }
  menu.onkeydown = event => {
    const options = [...menu.querySelectorAll("button:not(:disabled)")]; let index = options.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length; options[index]?.focus(); }
  };
  host.addEventListener("contextmenu", event => { if (event.target === list) { event.preventDefault(); showMenu(event.clientX, event.clientY); } });
  document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) menu.hidden = true; });
  list.addEventListener("click",event => { if (event.target === list) { selected.clear(); anchor=null; paintSelection(); } });
  host.addEventListener("keydown", safe(async event => {
    if (event.target.closest("input,textarea,select,video,audio,[role=separator],[role=menu],[contenteditable=true]")) return;
    if (!preview.hidden && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") await navigatePreview(event.key === "ArrowLeft" ? -1 : 1);
      else $(".ex-preview-body").scrollBy({top:event.key === "ArrowDown" ? 48 : -48,behavior:"instant"});
      return;
    }
    if (["ArrowDown","ArrowUp"].includes(event.key)) {
      const cards = [...list.querySelectorAll(".ex-row")].filter(card => rows.find(row => row.handle === card.dataset.handle)?.kind !== "blocked");
      if (!cards.length) return;
      event.preventDefault();
      const columns = grid ? Math.max(1,cards.filter(card => Math.abs(card.offsetTop-cards[0].offsetTop)<2).length) : 1;
      const focused = event.target.closest(".ex-row");
      const prior = focused || cards.find(card => card.dataset.handle === anchor);
      const index = prior ? Math.max(0,Math.min(cards.length-1,cards.indexOf(prior)+(event.key === "ArrowDown" ? columns : -columns))) : 0;
      const target = cards[index], next = rows.find(row => row.handle === target.dataset.handle);
      select(next,event); target.focus({preventScroll:true}); target.scrollIntoView({block:"nearest"});
      if (!preview.hidden) { if (next.kind === "file") await showPreview(next); else closePreview(); }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); selected = new Set(rows.filter(row => row.kind !== "blocked").map(row => row.handle)); paintSelection();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); await copySelection(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); await pasteSelection(); }
  }));
  host.addEventListener("keydown", event => { if (event.key === "Escape") { menu.hidden = true; closePreview(); list.focus(); } });
  function dropDestination(event) {
    const branch = event.target.closest("[data-destination]");
    if (branch) return branch.dataset.destination;
    const rowNode = event.target.closest(".ex-row");
    const row = rowNode && rows.find(value => value.handle === rowNode.dataset.handle);
    return row?.kind === "directory" ? row.handle : current;
  }
  host.addEventListener("dragover", event => {
    if (!event.target.closest(".ex-workspace")) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = writable ? "copy" : "none";
    host.querySelectorAll(".ex-drop-target").forEach(node => node.classList.remove("ex-drop-target"));
    if (writable) (event.target.closest("[data-destination],.ex-row") || list).classList.add("ex-drop-target");
  });
  host.addEventListener("dragleave", event => {
    if (!host.contains(event.relatedTarget)) host.querySelectorAll(".ex-drop-target").forEach(node => node.classList.remove("ex-drop-target"));
  });
  list.addEventListener("paste", safe(async event => {
    if (!writable || !current || !event.clipboardData?.files.length) return;
    event.preventDefault(); event.stopPropagation();
    if (event.clipboardData.files.length > 1) throw Error("Choose one file. Bulk transfers require verified Premium support.");
    for (const file of event.clipboardData.files) await api.receive(current,file);
    await load(current,{remember:false});
  }));
  host.addEventListener("drop", safe(async event => {
    if (!event.target.closest(".ex-workspace")) return;
    event.preventDefault(); event.stopPropagation();
    host.querySelectorAll(".ex-drop-target").forEach(node => node.classList.remove("ex-drop-target"));
    if (!writable) { say("No files saved. Approve writes to a specific folder first."); return; }
    const destination = dropDestination(event);
    if (!destination) return;
    const files = [...event.dataTransfer.files];
    if (files.length > 1) throw Error("Choose one file. Bulk transfers require verified Premium support.");
    if (files.length) {
      for (const file of files) {
        say("Receiving " + file.name + "…");
        const receipt = await api.receive(destination,file);
        say("Verified copy: " + receipt.name);
      }
    } else {
      const text = event.dataTransfer.getData("application/x-chute-item");
      if (!text.startsWith("CHUTE_ITEM:")) { say("No bytes saved. Drop actual files or a Live item; links alone are unsupported."); return; }
      const item = JSON.parse(decodeURIComponent(text.slice(11)));
      const receipt = item.source_kind === "local_explorer" ? await (async () => {
        const data=await chrome.runtime.sendMessage({type:'chutey-resolve-explorer-drag',id:item.id});
        if(!data?.ok)throw Error(data?.error || 'The drag source expired.');
        return api.transfer({kind:'local_copy',handle:data.row.handle,identity:data.row.identity,destination},{onProgress:transferProgress});
      })() : await api.transfer({kind:"live_to_local",live_id:item.id,destination},{onProgress:transferProgress});
      if (receipt.state !== "COMMITTED") throw new Error("Copy did not commit. Check the destination before retrying.");
      say("Verified copy: " + receipt.name);
    }
    await load(current,{remember:false});
    say("Verified " + (files.length || 1) + " saved copy/copies.");
  }));
  function transferProgress(job){say('Copying '+job.bytes.toLocaleString()+' / '+job.size.toLocaleString()+' bytes · '+job.id);}
  async function copyToLive(items) {
    for (const row of items) {
      if (row.kind !== "file") continue;
      say("Reading original bytes: " + row.name + "…");
      const receipt=await api.transfer({kind:'local_to_live',handle:row.handle,identity:row.identity},{onProgress:transferProgress});
      if (receipt.state !== "COMMITTED") throw new Error("Live copy was not verified.");
      liveCopies.set(row.identity + row.handle,receipt.file);
    }
    say("Original files verified in Live.");
  }
  $(".ex-connect").onsubmit = safe(async event => { event.preventDefault(); api.connect($(".ex-connect input").value); $(".ex-connect input").value = ""; await connect(); });
  let viewPersistence=null,viewWanted=false,lastPersistedView='';
  function rememberView(){
    viewWanted=true;if(viewPersistence)return viewPersistence;
    viewPersistence=(async()=>{
      while(viewWanted){viewWanted=false;
        if(!current||savedLocations.has(current))continue;
        const args={handle:current,view:{sort:$('.ex-filter select').value,query:$('.ex-filter input').value,grid,scroll:Math.round(list.scrollTop)}};
        const signature=JSON.stringify(args);if(signature===lastPersistedView)continue;
        try{await api.command('remember_location',args);lastPersistedView=signature;}catch{}
      }
    })().finally(()=>{viewPersistence=null;});return viewPersistence;
  }
  let timer;
  $(".ex-filter input").oninput = () => { clearTimeout(timer); timer = setTimeout(safe(() => current && load(current, {remember: false})), 180); };
  $(".ex-filter select").onchange = safe(() => current && load(current, {remember: false}));
  const actions = {
    reconcile: async () => {
      const pending=(await chrome.storage.session.get({chuteyPendingTransfer:null})).chuteyPendingTransfer;
      if(pending){const job=await api.command('transfer_status',{id:pending.id});say(job.state+' · '+job.bytes+'/'+job.size+' bytes · '+(job.error||'Inspect the verified receipt before retrying.'));return;}
      const final=(await chrome.storage.session.get({chuteyLastTransferReceipt:null})).chuteyLastTransferReceipt;
      if(final){say('Verified '+final.state+' · '+(final.receipt.size??final.receipt.file?.size)+' bytes · '+final.receipt.sha256);return;}
      const recent = await api.command("recent_transfers");
      const last = recent.operations.at(-1);
      if (!last) { say("No saved copy receipts for this approved folder."); return; }
      const receipt = await api.command("reconcile_transfer",{operation_id:last.operation_id});
      say(receipt.state === "COMMITTED" ? "Verified saved copy: " + receipt.name : "This copy needs destination review before retrying. Its completion is uncertain.");
    },
    'review-transfer':async()=>{if(!confirm('Have you reviewed the destination? Dismiss only the warning; files and durable job evidence are preserved.'))return;await api.dismissPending({reviewed:true});say('Reviewed warning dismissed; durable evidence preserved.');},
    'cancel-transfer':async()=>{const job=await api.cancelPending();say(job?'Cancellation requested · '+job.state:'No pending copy.');},
    live: () => copyToLive(rows.filter(row => selected.has(row.handle))),
    write: async () => {
      say("Choose the exact folder to authorize read and write access…");
      const session = await api.nativeSession(true,true);document.dispatchEvent(new CustomEvent('chutey-show-folder-access')); writable = !session.read_only;
      liveCopies.clear(); await connect();
    },
    revoke: async () => {
      await api.command("revoke_access"); ++requestId; ++previewId;
      observer.disconnect(); queue.length = 0; closePreview(); releaseThumbnails();
      stopPinned();writable = false; liveCopies.clear(); current = null; parent = null; rows = []; roots = []; back = []; forward = [];
      list.replaceChildren(); tree.replaceChildren(); api.connect("");
      say("Access revoked. Select a folder to approve access again.");
    },
    select: async () => { say("Opening Windows folder picker…"); const session = await api.nativeSession(true);document.dispatchEvent(new CustomEvent('chutey-show-folder-access')); writable = !session.read_only; liveCopies.clear(); await chrome.storage.local.remove("chuteyExplorerLastHandle"); await connect(); },
    resume: async () => { const session = await api.nativeSession(false); writable = !session.read_only; await connect(); },
    refresh: () => current && load(current, {remember: false}), parent: () => parent && load(parent), roots: () => roots[0] && load(roots[0].handle), close: closePreview,
    previous: () => navigatePreview(-1), next: () => navigatePreview(1),
    expand: () => { expanded = !expanded; resizePreview(); },
    back: async () => { if (back.length) { const target = back.pop(); forward.push(current); await load(target, {remember: false}); } },
    forward: async () => { if (forward.length) { const target = forward.pop(); back.push(current); await load(target, {remember: false}); } },
    grid: () => { grid = !grid; list.classList.toggle("ex-grid", grid); void rememberView(); }
  };
  host.querySelectorAll("[data-action]").forEach(node => { node.onclick = safe(actions[node.dataset.action]); });
  void chrome.storage.local.get({chuteyExplorerView: "list"}).then(settings => { grid = settings.chuteyExplorerView === "grid"; list.classList.toggle("ex-grid", grid); }).catch(() => {});
  // display:none tabs can reset a flex viewport's scroll offset in Chromium.
  let rememberedScroll = 0;
  document.querySelector("#chutey-workspace-tabs")?.addEventListener("click", () => {
    if (!host.hidden) rememberedScroll = list.scrollTop;
  }, true);
  document.querySelector("#chutey-workspace-tabs")?.addEventListener("keydown", () => {
    if (!host.hidden) rememberedScroll = list.scrollTop;
  }, true);
  let scrollTimer;
  list.addEventListener("scroll", () => { if (!host.hidden) {
    rememberedScroll = list.scrollTop; clearTimeout(scrollTimer);
    scrollTimer = setTimeout(rememberView, 180);
  } });
  new MutationObserver(() => {
    if (!host.hidden) list.scrollTop = rememberedScroll;
    else closePreview();
  }).observe(host, {attributes: true, attributeFilter: ["hidden"]});
  // Native protected consent remints handles after companion restart; no picker on resume.
  if (chrome.runtime?.sendNativeMessage) void api.nativeSession(false).then(session => { writable = !session.read_only; return connect(); }).catch(error => { say(error.message); });
  else $(".ex-connect").hidden = false; // Explicit developer/fixture fallback only.
  new ResizeObserver(() => { if (!preview.hidden) resizePreview(); }).observe(host);
  window.addEventListener("pagehide", () => { stopPinned();closePreview(); releaseThumbnails(); api.connect(""); });
})();
