/* Popup-only gallery adapter. Existing History renderer and drag/thumbnail code remain authoritative. */
(() => {
  "use strict";
  if (!location.pathname.endsWith("/popup.html")) return;
  const layouts = [{columns:4,rows:4},{columns:5,rows:4},{columns:5,rows:5},{columns:6,rows:5}];
  const dial = document.querySelector("#gallery-density");
  const readout = document.querySelector("#gallery-density-value");
  const viewerSize = document.querySelector("#shelf-viewer-size");
  const popupStatus = document.querySelector("#status");
  let opening = false;
  function applyLayout(value) {
    const n = Number(value);
    const step = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
    const choice = layouts[step];
    try { localStorage.setItem("chuteyPopupGridStep",String(step)); } catch {}
    document.body.style.setProperty("--chutey-gallery-columns", String(choice.columns));
    document.body.style.setProperty("--chutey-gallery-rows", String(choice.rows));
    document.body.dataset.galleryLayout = choice.columns + "x" + choice.rows;
    if (dial) dial.value = String(step);
    if (readout) readout.textContent = choice.columns + " × " + choice.rows;
    window.ChuteyPopupLayout?.paintPlaceholders();


    return step;
  }
  try { applyLayout(localStorage.getItem("chuteyPopupGridStep")); } catch { applyLayout(0); }
  const grid = document.querySelector("#files");
  dial?.addEventListener("input", () => {
    const step = applyLayout(dial.value);
    void chrome.storage.sync.set({chutePopupGridStep:step}).catch(console.warn);
  });
  viewerSize?.addEventListener("change", () => {
    void chrome.storage.sync.set({chuteShelfViewerSize:viewerSize.value === "full" ? "full" : "half"}).catch(console.warn);
  });
  void chrome.storage.sync.get({chutePopupGridStep:0,chuteShelfViewerSize:"half"})
    .then(settings => {
      applyLayout(settings.chutePopupGridStep);
      if (viewerSize) viewerSize.value = settings.chuteShelfViewerSize === "full" ? "full" : "half";
    }).catch(console.warn);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.chutePopupGridStep) applyLayout(changes.chutePopupGridStep.newValue);
    if (changes.chuteShelfViewerSize && viewerSize) {
      viewerSize.value = changes.chuteShelfViewerSize.newValue === "full" ? "full" : "half";
    }
  });

  // Preview is local to the popup. Shelf handoff requires an explicit click.
  const lightbox = document.createElement("section");
  lightbox.className = "chutey-lightbox";
  lightbox.hidden = true;
  lightbox.setAttribute("role","dialog");
  lightbox.setAttribute("aria-modal","true");
  lightbox.setAttribute("aria-label","Image preview");
  lightbox.innerHTML = `
    <header><strong class="chutey-lightbox-title"></strong></header>
    <div class="chutey-lightbox-stage">
      <button type="button" class="chutey-lightbox-prev" aria-label="Previous file">‹</button>
      <img class="chutey-lightbox-image" alt="">
      <div class="chutey-lightbox-reader" hidden><pre tabindex="0" aria-label="Saved text"></pre><nav><button type="button" data-text-back>Previous text page</button><button type="button" data-text-next>Next text page</button></nav><span data-text-position></span></div>
      <button type="button" class="chutey-lightbox-next" aria-label="Next file">›</button>
      <p class="chutey-lightbox-error" hidden>Image unavailable. The History entry is preserved.</p>
    </div>
    <footer><span class="chutey-lightbox-count"></span><button type="button" class="secondary-button chutey-lightbox-shelf" aria-label="Open in Shelf" title="Open in Shelf">↗</button></footer>`;
  document.body.append(lightbox);
  const preview = lightbox.querySelector(".chutey-lightbox-image");
  const errorText = lightbox.querySelector(".chutey-lightbox-error");
  const prev = lightbox.querySelector(".chutey-lightbox-prev");
  const next = lightbox.querySelector(".chutey-lightbox-next");
  let activeId = null, returnFocus = null, serial = 0;
  const mediaFile=file=>/^(video|audio)\//.test(file.mime||'') || /\.(mp4|webm|mp3)$/i.test(file.name||'');
  let mediaTicket=null,stopLease=null;
  const player=document.createElement('div');player.className='chutey-lightbox-player';player.hidden=true;
  lightbox.querySelector('.chutey-lightbox-stage').append(player);
  function releaseMedia(){
    stopLease?.();stopLease=null;
    player.querySelectorAll('video,audio').forEach(node=>{node.onerror=null;node.pause();node.removeAttribute('src');node.load();});player.replaceChildren();player.hidden=true;
    if(mediaTicket){void window.ChuteyExplorerAPI.command('release_media',{ticket:mediaTicket}).catch(()=>{});mediaTicket=null;}
  }
  async function showMedia(file,token){
    try{
      await window.ChuteyExplorerAPI.nativeSession(false);
      const row=file.__local ? file : await window.ChuteyExplorerAPI.command('locate_saved',{id:file.id});
      const source=await window.ChuteyExplorerAPI.mediaSource(row);
      if(token!==serial){void window.ChuteyExplorerAPI.command('release_media',{ticket:source.ticket}).catch(()=>{});return;}
      mediaTicket=source.ticket;stopLease=window.ChuteyMediaPlayback.lease(source,window.ChuteyExplorerAPI,error=>{errorText.textContent='Playback continuation: '+error.message;errorText.hidden=false;});
      const node=document.createElement(source.mime.startsWith('audio/')?'audio':'video');node.controls=true;node.preload='metadata';node.autoplay=false;node.crossOrigin='anonymous';
      if(!node.canPlayType(source.mime))throw Error('This browser does not support the media container/codec.');
      node.onerror=async()=>{const message=await window.ChuteyMediaPlayback.failure(node,source);if(token===serial){releaseMedia();errorText.textContent=message;errorText.hidden=false;}};
      node.src=source.url;player.replaceChildren(node);player.hidden=false;
    }catch(error){if(token===serial){errorText.textContent=error.code==='UNSUPPORTED_COMMAND'?'Local streaming needs the matching candidate worker/helper.':error.message;errorText.hidden=false;}}
  }
  function imageTiles() {
    const viewingLocal=document.querySelector("#popup-local")?.hidden===false;
    return Array.from(document.querySelectorAll("#files .chutey-gallery-tile,.popup-local-media"))
      .filter(tile => !tile.hidden && tile.__galleryFile && Boolean(tile.__galleryFile.__local)===viewingLocal && (isPreviewableImage(tile.__galleryFile) || fileKind(tile.__galleryFile) === "text" || mediaFile(tile.__galleryFile)));
  }
  function activeFile() {
    return imageTiles().find(tile => tile.__galleryFile.id === activeId)?.__galleryFile;
  }
  const reader = lightbox.querySelector('.chutey-lightbox-reader');
  let textFile=null,textNext=null,textOffsets=[0];
  async function textPage(offset,token) {
    reader.querySelector('pre').textContent='Loading saved text…';
    try {
      await window.ChuteyExplorerAPI.nativeSession(false);
      const page=await window.ChuteyExplorerAPI.command('saved_text_page',{id:textFile.id,offset,limit:65536});
      if(token!==serial)return;
      reader.querySelector('pre').textContent=page.text;reader.querySelector('pre').scrollTop=0;
      textNext=page.next;
      reader.querySelector('[data-text-next]').disabled=textNext===null;
      reader.querySelector('[data-text-back]').disabled=textOffsets.length<2;
      reader.querySelector('[data-text-position]').textContent='Bytes '+offset+'–'+(page.next??page.size)+' of '+page.size+' · Escape or click outside to close';
    }catch(error){if(token===serial)reader.querySelector('pre').textContent=error.message || 'Saved text unavailable.';}
  }
  reader.querySelector('[data-text-next]').onclick=()=>{if(textNext!==null){textOffsets.push(textNext);void textPage(textNext,serial);}};
  reader.querySelector('[data-text-back]').onclick=()=>{if(textOffsets.length>1){textOffsets.pop();void textPage(textOffsets.at(-1),serial);}};
  function showImage(id) {
    releaseMedia();
    const tiles = imageTiles();
    const index = tiles.findIndex(tile => tile.__galleryFile.id === id);
    if (index < 0) return;
    const file = tiles[index].__galleryFile;
    activeId = id;
    lightbox.setAttribute("aria-label",mediaFile(file)?"Media preview":fileKind(file)==="text"?"Saved text preview":"Image preview");
    lightbox.querySelector(".chutey-lightbox-shelf").hidden=Boolean(file.__local);
    const token = ++serial;
    errorText.hidden = true;
    errorText.textContent = "Image unavailable. The History entry is preserved.";
    reader.hidden = true;
    preview.hidden = false;
    preview.removeAttribute("src");
    preview.alt = file.name || "Saved image";
    lightbox.querySelector(".chutey-lightbox-title").textContent = file.name || "Saved image";
    lightbox.querySelector(".chutey-lightbox-count").textContent = (index + 1) + " / " + tiles.length;
    prev.disabled = index === 0;
    next.disabled = index === tiles.length - 1;
    preview.onerror = () => {
      if (token !== serial) return;
      preview.hidden = true; errorText.hidden = false;
    };
    if(mediaFile(file)){preview.hidden=true;void showMedia(file,token);}
    else if(fileKind(file)==='text'){
      preview.hidden=true;reader.hidden=false;textFile=file;textOffsets=[0];textNext=null;
      void textPage(0,token);
    }else preview.src = fileUrl(file);
  }
  function openPreview(file, source) {
    if (!isPreviewableImage(file) && fileKind(file)!=="text" && !mediaFile(file)) return;
    returnFocus = source;
    lightbox.hidden = false;
    document.body.classList.add("chutey-lightbox-open");
    showImage(file.id);
    lightbox.tabIndex = -1; lightbox.focus();
    document.querySelectorAll('body > header,body > details,#chutey-popup-gallery,#popup-local').forEach(node=>{node.inert=true;});
  }
  function closePreview() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("chutey-lightbox-open");
    ++serial; releaseMedia();
    preview.removeAttribute("src");
    activeId = null; textFile=null;reader.querySelector('pre').textContent='';
    document.querySelectorAll('body > header,body > details,#chutey-popup-gallery,#popup-local').forEach(node=>{node.inert=false;});
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    returnFocus = null;
  }
  function move(delta) {
    const tiles = imageTiles();
    const index = tiles.findIndex(tile => tile.__galleryFile.id === activeId);
    if (index + delta >= 0 && index + delta < tiles.length) showImage(tiles[index + delta].__galleryFile.id);
  }
  lightbox.addEventListener("click",event => {
    if (event.target === lightbox || event.target === preview || event.target.classList.contains("chutey-lightbox-stage")) closePreview();
  });
  prev.addEventListener("click",() => move(-1));
  next.addEventListener("click",() => move(1));
  document.addEventListener("keydown",event => {
    if (lightbox.hidden) return;
    if(event.key!=="Escape" && event.target.closest("video,audio,input,select,textarea"))return;
    if (event.key === "Escape") { event.preventDefault(); closePreview(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    else if (event.key === "Tab") {
      const controls = Array.from(lightbox.querySelectorAll("button:not(:disabled),pre[tabindex]")).filter(node=>node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  },true);
  lightbox.querySelector(".chutey-lightbox-shelf").addEventListener("click",async () => {
    if (opening) return;
    const file = activeFile();
    if (!file || !/^[0-9a-f]{32}$/i.test(String(file.id || ""))) return;
    opening = true;
    const day = selectedDay || String(file.created_at || "").slice(0,10);
    const intent = {
      id:file.id, name:String(file.name || "Saved image").slice(0,256),
      mime:String(file.mime || ""), day:/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
      page:currentPage, index:imageTiles().findIndex(tile => tile.__galleryFile.id === file.id),
      scope:selectedDay ? "history" : "live",
      requestId:String(Date.now()) + "-" + Math.random().toString(36).slice(2,9),
      issuedAt:Date.now()
    };
    try {
      const tabs = await chrome.tabs.query({active:true,currentWindow:true});
      if (!chrome.sidePanel?.open || !tabs[0]?.windowId) throw new Error("Shelf unavailable");
      intent.windowId = tabs[0].windowId;
      await Promise.all([
        chrome.storage.session.set({chuteyPopupOpenItem:intent}),
        chrome.sidePanel.open({windowId:tabs[0].windowId})
      ]);
      window.close();
    } catch (error) {
      errorText.textContent = "Could not open the Shelf. Preview remains available.";
      errorText.hidden = false;
      console.warn("Explicit Shelf handoff failed:", error);
    } finally { opening = false; }
  });
  new MutationObserver(() => {
    // First-paint skeletons never depend on image decoding; the History
    // renderer replaces them after its data response, not after thumbnails.
    if (grid && !grid.querySelector(".chutey-popup-placeholder")) {
      grid.removeAttribute("aria-busy");
    }
    if (!lightbox.hidden && !activeFile()) closePreview();
  }).observe(document.querySelector("#files"),{childList:true});

  // Live removal reuses the authoritative API. Archive-only hiding is presentation
  // state for this popup session, never a history/file mutation.
  const hiddenArchive = new Set();
  const menu = document.createElement("div");
  menu.className = "chutey-popup-menu"; menu.hidden = true;
  menu.setAttribute("role","menu"); menu.setAttribute("aria-label","Item actions");
  menu.innerHTML = '<button type="button" role="menuitem"><span aria-hidden="true">♜</span> Trash It!</button><small></small>';
  menu.querySelector("span").textContent = "🗑";
  document.body.append(menu);
  let menuFile = null, menuReturn = null;
  function dismissMenu() { menu.hidden = true; if (menuReturn?.isConnected) menuReturn.focus({preventScroll:true}); }
  function openMenu(event,file,row) {
    event.preventDefault(); event.stopPropagation();
    menuFile = file; menuReturn = row; menu.hidden = false;
    menu.querySelector("small").textContent = file.active ? "Live only · kept in dated History" : "Hide here only · History unchanged";
    const box = row.getBoundingClientRect();
    menu.style.left = Math.max(4,Math.min(innerWidth-226,event.clientX || box.left)) + "px";
    menu.style.top = Math.max(4,Math.min(innerHeight-95,event.clientY || box.top)) + "px";
    menu.querySelector("button").focus();
  }
  lightbox.addEventListener("contextmenu",event => {
    if(reader.contains(event.target))return;
    const file = activeFile(), row = imageTiles().find(tile => tile.__galleryFile.id === activeId);
    if (file && row && !file.__local) openMenu(event,file,row);
  });
  document.addEventListener("pointerdown",event => { if (!menu.hidden && !menu.contains(event.target)) dismissMenu(); },true);
  document.addEventListener("keydown",event => { if (event.key === "Escape" && !menu.hidden) { event.preventDefault(); event.stopImmediatePropagation(); dismissMenu(); } },true);
  menu.querySelector("button").addEventListener("click",async () => {
    const file = menuFile; if (!file) return;
    const button = menu.querySelector("button"); button.disabled = true;
    try {
      if (file.active) {
        await api("/api/files/"+encodeURIComponent(file.id),{method:"DELETE"});
        await chrome.runtime.sendMessage({type:"chute-count-changed"}).catch(() => {});
      } else { hiddenArchive.add(file.id); if (menuReturn) menuReturn.hidden = true; }
      dismissMenu(); closePreview();
      await resetHistory();
      imageTiles()[0]?.focus({preventScroll:true});
    } catch (error) { menu.querySelector("small").textContent = error.message || "Could not remove. Retry."; }
    finally { button.disabled = false; }
  });

  // Explicit local browsing is scoped by the same native enrollment and grants
  // as Shelf Explorer. References never import bytes or become Store IDs.
  const local=document.createElement('section');local.id='popup-local';local.hidden=true;
  local.innerHTML='<h2>Authorized local media</h2><p>Preview the original in an approved folder. No import or temporary movie copy.</p><button type="button" data-local-choose>Choose authorized folder…</button><button type="button" data-local-up>Up</button><button type="button" data-local-more hidden>More files</button><p role="status"></p><div id="popup-local-list"></div>';
  document.querySelector('#chutey-popup-gallery').before(local);
  const browse=document.createElement('button');browse.type='button';browse.className='secondary-button';browse.id='popup-local-toggle';browse.textContent='Local media';
  document.querySelector('.topbar .actions').prepend(browse);
  let localHandle=null,localParent=null,localOffset=null,localGeneration=0;
  async function localLoad(handle,append=false){
    const token=++localGeneration;local.querySelector('[role=status]').textContent='Loading approved folder…';
    try{
      const page=await window.ChuteyExplorerAPI.command('list',{handle,offset:append?localOffset:0,limit:100,sort:'name',query:''});
      if(token!==localGeneration)return;
      localHandle=handle;localParent=page.parent;localOffset=page.next_offset;
      local.querySelector('[data-local-up]').disabled=!localParent;
      local.querySelector('[data-local-more]').hidden=localOffset===null;
      const list=local.querySelector('#popup-local-list');if(!append)list.replaceChildren();
      for(const row of page.entries){
        if(row.kind!=='directory' && (row.kind!=='file'||!mediaFile(row)))continue;
        const node=document.createElement('button');node.type='button';node.textContent=(row.kind==='directory'?'▰ ':'▶ ')+row.name;
        if(row.kind==='directory')node.onclick=()=>void localLoad(row.handle);
        else{node.className='popup-local-media';node.__galleryFile={...row,__local:true,id:'local:'+row.handle};node.onclick=()=>openPreview(node.__galleryFile,node);}
        list.append(node);
      }
      local.querySelector('[role=status]').textContent=page.name+' · approved local folder · MP4 / WebM / MP3';
    }catch(error){if(token===localGeneration)local.querySelector('[role=status]').textContent=error.message;}
  }
  async function localConnect(choose=false){
    try{
      const session=await window.ChuteyExplorerAPI.nativeSession(choose);
      if(session.scope==='saved_store'){
        local.querySelector('#popup-local-list').replaceChildren();
        local.querySelector('[role=status]').textContent='Choose an external folder to authorize previewing its original media. Saved Chutey files remain in Saved items.';
        return;
      }
      const roots=await window.ChuteyExplorerAPI.command('roots');
      if(!roots.roots.length){local.querySelector('[role=status]').textContent='Choose a folder to authorize local media access.';return;}
      await localLoad(roots.roots[0].handle);
    }catch(error){local.querySelector('[role=status]').textContent=error.message;}
  }
  browse.onclick=()=>{local.hidden=!local.hidden;document.querySelector('#chutey-popup-gallery').hidden=!local.hidden;browse.textContent=local.hidden?'Local media':'Saved items';if(!local.hidden)void localConnect();};
  local.querySelector('[data-local-choose]').onclick=()=>void localConnect(true);
  local.querySelector('[data-local-up]').onclick=()=>{if(localParent)void localLoad(localParent);};
  local.querySelector('[data-local-more]').onclick=()=>void localLoad(localHandle,true);
  window.addEventListener('pagehide',()=>{++serial;releaseMedia();});

  const original = createRow;
  createRow = function galleryRow(file,index) {
    const row = original(file,index);
    row.hidden = hiddenArchive.has(file.id);
    row.querySelector(".file-tools .remove")?.remove();
    row.addEventListener("contextmenu",event => openMenu(event,file,row));
    row.addEventListener("keydown",event => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openMenu(event,file,row);
    });
    row.__galleryFile = file;
    row.classList.add("chutey-gallery-tile");
    row.tabIndex = 0;
    row.title = file.name;
    row.setAttribute("aria-label","Select " + file.name + " in History");
    row.setAttribute("aria-expanded","false");
    const icon = row.querySelector(".file-icon");
    // A web shortcut is NOT an image. Show the Chutey mascot rather than
    // a generic chain glyph, without pretending we downloaded image bytes.
    // While a real image is loading (or if it cannot decode), the same mascot
    // stays visible beneath the eventual thumbnail.
    if (icon && (fileKind(file) === "link" || isPreviewableImage(file))) {
      const fallback = icon.querySelector(".file-fallback");
      if (fallback) {
        window.ChuteyPresentation?.decorate(icon);
        icon.classList.add("chutey-mascot-fallback");
        if (fileKind(file) === "link") {
          const kindLabel = document.createElement("span");
          kindLabel.className = "chutey-shortcut-kind";
          kindLabel.textContent = "LINK";
          kindLabel.setAttribute("aria-hidden", "true");
          icon.append(kindLabel);
        }
      }
    }
    // Image clicks have ONE deterministic action: open the popup preview.
    // Grid expansion was the competing, visually inconsistent second action.
    if (isPreviewableImage(file) || fileKind(file)==="text" || mediaFile(file)) {
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", "Preview " + file.name);
      row.removeAttribute("aria-expanded");
      row.querySelector(".file-tools .open")?.remove();
      row.addEventListener("click", event => {
        if (event.defaultPrevented || event.target.closest("button,input,a,select")) return;
        openPreview(file, row);
      });
      row.addEventListener("keydown", event => {
        if (event.target !== row || !["Enter", " "].includes(event.key)) return;
        event.preventDefault(); openPreview(file, row);
      });
    } else {
      row.removeAttribute("aria-expanded");
    }

    return row;
  };
})();
