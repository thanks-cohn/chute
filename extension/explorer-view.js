/* Thin read-only client; no paths, writes, site tokens or duplicated file semantics. */
(() => {
  "use strict";
  const host = document.querySelector("#chutey-explorer-view");
  if (!host) return;
  const api = window.ChuteyExplorerAPI;
  host.innerHTML = `<div class="ex-native"><button type="button" data-action="select" aria-label="Choose another Windows folder" title="Browse for another folder">▰ Browse</button><details class="ex-more-settings"><summary title="Folder access and transfers" aria-label="More file options">⚙ <span>Folder Access</span></summary><div class="ex-advanced-actions"><button type="button" data-action="resume">Retry connection</button><button type="button" data-action="write">Allow saving here…</button><button type="button" data-action="live">Copy selected to Chutey</button><button type="button" data-action="reconcile">Check transfer</button><button type="button" data-action="revoke">Remove folder access</button></div></details></div><form class="ex-connect" hidden><label>Local read session <input type="password" autocomplete="off" aria-label="Local read session token" required></label><button title="Connect" aria-label="Connect">↗</button></form>
    <div class="ex-toolbar"><button data-action="back" title="Back" aria-label="Back">‹</button><button data-action="forward" title="Forward" aria-label="Forward">›</button><button data-action="parent" title="Parent folder" aria-label="Parent folder">↑</button><button data-action="roots" title="Approved folders" aria-label="Approved folders">⌂</button><button data-action="refresh" title="Refresh" aria-label="Refresh">↻</button><span class="ex-breadcrumb">Local files</span><button data-action="grid" title="Toggle grid" aria-label="Toggle grid">▦</button></div>
    <div class="ex-filter"><input type="search" placeholder="Search this folder" aria-label="Search this folder"><select aria-label="Sort files"><option value="name">Name</option><option value="type">Type</option><option value="date">Date</option><option value="size">Size</option></select></div>
    <div class="ex-workspace"><aside class="ex-tree" aria-label="Folder navigator"></aside><div class="ex-column-resize" role="separator" tabindex="0" aria-label="Resize folders and files columns" aria-orientation="vertical" aria-valuemin="15" aria-valuemax="75" aria-valuenow="36" title="Drag to resize folders"></div><div class="ex-list" role="listbox" aria-label="Local files" aria-multiselectable="true" tabindex="0"></div></div>
    <div class="ex-status" role="status" aria-live="polite">Choose Browse once to access a local folder.</div>
    <section class="ex-preview" aria-label="File preview" hidden><div class="ex-resize" role="separator" aria-label="Resize preview" aria-orientation="horizontal" tabindex="0"></div><header><strong></strong><button data-action="close" title="Close preview" aria-label="Close preview">×</button></header><div class="ex-preview-body"></div></section><div class="ex-menu" role="menu" hidden></div>`;
  const $ = selector => host.querySelector(selector);
  const list = $(".ex-list"), tree = $(".ex-tree"), preview = $(".ex-preview"), status = $(".ex-status"), menu = $(".ex-menu");
  let current = null, parent = null, rows = [], roots = [], selected = new Set(), back = [], forward = [];
  let offset = 0, requestId = 0, previewId = 0, abort = null, urls = [], grid = false;
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
  const thumbnails = new Map();
  const liveCopies = new Map();
  let writable = false, anchor = null, clipboardFile = null;
  const say = text => { status.textContent = text; };
  const safe = fn => (...args) => { const previousStatus = status.textContent; try { return Promise.resolve(fn(...args)).catch(error => { say(error.code === "CANCELLED" ? previousStatus : error.message); }); } catch (error) { say(error.message); } };
  function button(label, text, fn) {
    const node = document.createElement("button"); node.type = "button"; node.title = label; node.setAttribute("aria-label", label); node.textContent = text; node.onclick = safe(fn); return node;
  }
  function releaseThumbnails() {
    for (const url of thumbnails.values()) URL.revokeObjectURL(url);
    thumbnails.clear();
  }
  function closePreview() {
    ++previewId; abort?.abort(); abort = null;
    $(".ex-preview-body").querySelectorAll("video").forEach(video => { video.pause(); video.removeAttribute("src"); video.load(); });
    $(".ex-preview-body").replaceChildren();
    for (const url of urls) URL.revokeObjectURL(url); urls = []; preview.hidden = true; host.append(preview);
  }
  async function showPreview(row) {
    closePreview(); const id = previewId; preview.hidden = false;
    positionPreview(row);
    $(".ex-preview strong").textContent = row.name;
    const body = $(".ex-preview-body"); body.textContent = "Loading preview…";
    abort = new AbortController(); const signal = abort.signal;
    try {
      const meta = await api.command("preview", {handle: row.handle});
      if (id !== previewId) return;
      // Media controls use bounded in-memory Blobs. HTTP range support is separately tested.
      if (meta.preview === "unavailable" || meta.size > 64 * 1024 * 1024) {
        body.textContent = "Preview unavailable. Large media requires native streaming integration."; return;
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
      if (meta.preview === "video") node.controls = true;
      if (meta.preview === "image") { node.alt = row.name; node.onclick = () => node.classList.toggle("ex-zoom"); }
      node.onerror = () => { body.textContent = "Preview unavailable: this browser could not decode the saved file."; };
      node.src = url; body.append(node);
    } catch (error) { if (id === previewId && error.name !== "AbortError") body.textContent = error.message; }
  }
  function positionPreview(row) {
    const cards = [...list.querySelectorAll(".ex-row")];
    const card = cards.find(node => node.dataset.handle === row.handle);
    if (!card) return;
    // Remove the full-width panel before measuring row geometry.
    host.append(preview);
    let after = card;
    if (grid) for (const node of cards.slice(cards.indexOf(card)+1)) {
      if (Math.abs(node.offsetTop-card.offsetTop)>2) break;
      after = node;
    }
    after.after(preview);
  }
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
  async function copySelection() {
    const row = transferSelection();
    clipboardFile = new File([await api.content(row,{original:true})],row.name,{type:row.mime || "application/octet-stream"});
    say("Copied for Paste inside Chutey. This is not the Windows file clipboard.");
  }
  async function pasteSelection(destination = current) {
    if (!writable) throw Error("To save here, approve this folder in Folder Access settings.");
    if (!clipboardFile) throw Error("Copy a file in Chutey first, or paste actual files from your clipboard.");
    const receipt = await api.receive(destination,clipboardFile);
    await load(current,{remember:false}); say("Verified copy: " + receipt.name);
  }
  async function load(handle, {remember = true, append = false, recovery = true} = {}) {
    const id = ++requestId;
    say("Loading…");
    let result;
    try { result = await api.command("list", {handle, offset:append ? offset : 0,limit:100,sort:$(".ex-filter select").value,query:$(".ex-filter input").value}); }
    catch (error) {
      if (recovery && error.code === "INVALID_HANDLE") { await connect(false); return; }
      throw error;
    }
    if (id !== requestId) return;
    if (!append) {
      if (remember && current && current !== handle) { back.push(current); forward = []; }
      observer.disconnect(); queue.length = 0;
      current = handle; parent = result.parent; selected.clear(); anchor = null; closePreview(); releaseThumbnails(); rows = []; list.replaceChildren();
      await rememberView();
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
      if (row.kind === "file") {
        node.draggable = true;
        node.ondragstart = event => {
          try {
            if (!selected.has(row.handle)) select(row);
            const source = transferSelection();
            if (source.size > 32 * 1024 * 1024) throw Error("Use the file picker for files larger than 32 MiB.");
            const id = "explorer-" + crypto.randomUUID();
            event.dataTransfer.effectAllowed = "copy";
            const token = "CHUTE_ITEM:" + encodeURIComponent(JSON.stringify({id,name:source.name,mime:source.mime,source_kind:"local_explorer"}));
            event.dataTransfer.setData("application/x-chute-item", token);
            event.dataTransfer.setData("text/plain", token);
            // Registration exports no bytes. The receiving adapter reads the
            // guarded original on this first drop, including on a cold worker.
            void chrome.runtime.sendMessage({type:"chutey-register-explorer-drag",id,row:source}).catch(error => { say(error.code === "CANCELLED" ? previousStatus : error.message); });
          } catch (error) { event.preventDefault(); say(error.message); }
        };
      }
      node.onclick = event => select(row, event);
      node.ondblclick = safe(() => row.kind === "directory" ? load(row.handle) : showPreview(row));
      node.oncontextmenu = event => { event.preventDefault(); if (!selected.has(row.handle)) select(row); showMenu(event.clientX, event.clientY, row); };
      node.onkeydown = safe(async event => {
        if (event.key === "Enter") { event.preventDefault(); if (row.kind === "directory") await load(row.handle); else await showPreview(row); }
        if (event.key === " " ) { event.preventDefault(); select(row, event); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const cards = [...list.querySelectorAll(".ex-row")];
          const columns = grid ? Math.max(1,cards.filter(card => Math.abs(card.offsetTop-cards[0].offsetTop)<2).length) : 1;
          const index = Math.max(0,Math.min(cards.length-1,cards.indexOf(node)+(event.key === "ArrowDown" ? columns : -columns)));
          const target = cards[index], next = rows.find(value => value.handle === target.dataset.handle);
          const open = !preview.hidden;
          select(next,event); target.focus({preventScroll:true});
          if (open && next.kind === "file") await showPreview(next);
          else if (open) closePreview();
          target.scrollIntoView({block:"nearest"});
        }
        if (event.key === "Home") list.firstElementChild?.focus();
        if (event.key === "End") list.lastElementChild?.focus();
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = node.getBoundingClientRect(); showMenu(rect.left + 20, rect.top, row); }
      });
      if (row.mime?.match(/^image\/(png|jpeg|gif|webp|bmp)$/)) observer.observe(node);
    }
    if (offset !== null) { const more = button("Load more files", "···", () => load(current, {append: true})); more.className = "ex-more"; list.append(more); }
    say(result.total ? `${rows.length} of ${result.total} items · ${writable ? "Write approved" : "Read only"}` : "This folder is empty · Read only");
  }
  // Lazy thumbnails, max three simultaneous requests; original bytes stay in Python.
  const queue = []; let active = 0;
  async function pump() {
    if (active >= 3 || !queue.length) return;
    const node = queue.shift(); const row = rows.find(row => row.handle === node.dataset.handle);
    if (!row || !node.isConnected) { void pump(); return; }
    active++;
    try {
      const blob = await api.content(row, {thumbnail: true});
      if (node.isConnected) { const url = URL.createObjectURL(blob); thumbnails.set(row.handle, url); const img = document.createElement("img"); img.alt = ""; img.src = url; node.querySelector(".ex-icon").replaceChildren(img); }
    } catch { /* Keep truthful type icon on decode/size failures. */ }
    finally { active--; void pump(); }
  }
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); queue.push(entry.target); void pump(); } }, {root: list});
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
  function showMenu(x, y, row) {
    menu.replaceChildren();
    const actions = row ? [[row.kind === "directory" ? "Open folder" : "Preview", () => row.kind === "directory" ? load(row.handle) : showPreview(row)], ["Properties", async () => { const meta = await api.command("stat", {handle: row.handle}); say(`${meta.name} · ${meta.size.toLocaleString()} bytes · ${new Date(meta.modified_ns / 1e6).toLocaleString()}`); }]] : [["Refresh", () => current && load(current, {remember: false})]];
    for (const [name, fn] of actions) { const node = button(name, name, async () => { menu.hidden = true; await fn(); }); node.role = "menuitem"; menu.append(node); }
    for (const [label, fn] of [["Copy",copySelection],["Paste",() => pasteSelection(row?.kind === "directory" ? row.handle : current)]]) {
      const node = button(label,label,async () => { menu.hidden=true; await fn(); }); node.role="menuitem";
      node.disabled = label === "Copy" ? !rows.some(value => selected.has(value.handle) && value.kind === "file") : !writable || !clipboardFile;
      menu.append(node);
    }
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
    if (event.target.closest("input,textarea,select,[contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault(); selected = new Set(rows.filter(row => row.kind !== "blocked").map(row => row.handle)); paintSelection();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); await copySelection(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && clipboardFile) { event.preventDefault(); await pasteSelection(); }
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
        const data = await chrome.runtime.sendMessage({type:"chutey-read-explorer-drag",id:item.id});
        if (!data?.ok) throw Error(data?.error || "The original is unavailable.");
        return api.receive(destination,new File([Uint8Array.from(atob(data.base64),value => value.charCodeAt(0))],data.name,{type:data.mime}));
      })() : await api.command("receive_from_live",{id:item.id,destination,operation_id:crypto.randomUUID().replaceAll("-","")});
      if (receipt.state !== "COMMITTED") throw new Error("Copy did not commit. Check the destination before retrying.");
      say("Verified copy: " + receipt.name);
    }
    await load(current,{remember:false});
    say("Verified " + (files.length || 1) + " saved copy/copies.");
  }));
  async function copyToLive(items) {
    for (const row of items) {
      if (row.kind !== "file") continue;
      say("Reading original bytes: " + row.name + "…");
      const source = await api.command("prepare_export",{handle:row.handle,identity:row.identity});
      const receipt = await api.command("export_to_live",{capability:source.capability});
      if (receipt.state !== "COMMITTED") throw new Error("Live copy was not verified.");
      liveCopies.set(row.identity + row.handle,receipt.file);
    }
    say("Original files verified in Live. You can drag them using the existing transport.");
  }
  $(".ex-connect").onsubmit = safe(async event => { event.preventDefault(); api.connect($(".ex-connect input").value); $(".ex-connect input").value = ""; await connect(); });
  async function rememberView() {
    if (!current) return;
    try { await api.command("remember_location", {handle:current, view:{sort:$(".ex-filter select").value,
      query:$(".ex-filter input").value, grid, scroll:Math.round(list.scrollTop)}}); }
    catch { /* Older paired companions remain browse-compatible. */ }
  }
  let timer;
  $(".ex-filter input").oninput = () => { clearTimeout(timer); timer = setTimeout(safe(() => current && load(current, {remember: false})), 180); };
  $(".ex-filter select").onchange = safe(() => current && load(current, {remember: false}));
  const actions = {
    reconcile: async () => {
      const recent = await api.command("recent_transfers");
      const last = recent.operations.at(-1);
      if (!last) { say("No saved copy receipts for this approved folder."); return; }
      const receipt = await api.command("reconcile_transfer",{operation_id:last.operation_id});
      say(receipt.state === "COMMITTED" ? "Verified saved copy: " + receipt.name : "This copy needs destination review before retrying. Its completion is uncertain.");
    },
    live: () => copyToLive(rows.filter(row => selected.has(row.handle))),
    write: async () => {
      say("Choose the exact folder to authorize read and write access…");
      const session = await api.nativeSession(true,true); writable = !session.read_only;
      liveCopies.clear(); await connect();
    },
    revoke: async () => {
      await api.command("revoke_access"); ++requestId; ++previewId;
      observer.disconnect(); queue.length = 0; closePreview(); releaseThumbnails();
      writable = false; liveCopies.clear(); current = null; parent = null; rows = []; roots = []; back = []; forward = [];
      list.replaceChildren(); tree.replaceChildren(); api.connect("");
      say("Access revoked. Select a folder to approve access again.");
    },
    select: async () => { say("Opening Windows folder picker…"); const session = await api.nativeSession(true); writable = !session.read_only; liveCopies.clear(); await chrome.storage.local.remove("chuteyExplorerLastHandle"); await connect(); },
    resume: async () => { const session = await api.nativeSession(false); writable = !session.read_only; await connect(); },
    refresh: () => current && load(current, {remember: false}), parent: () => parent && load(parent), roots: () => roots[0] && load(roots[0].handle), close: closePreview,
    back: async () => { if (back.length) { const target = back.pop(); forward.push(current); await load(target, {remember: false}); } },
    forward: async () => { if (forward.length) { const target = forward.pop(); back.push(current); await load(target, {remember: false}); } },
    grid: () => { grid = !grid; list.classList.toggle("ex-grid", grid); void rememberView(); }
  };
  host.querySelectorAll("[data-action]").forEach(node => { node.onclick = safe(actions[node.dataset.action]); });
  void chrome.storage.local.get({chuteyExplorerView: "list"}).then(settings => { grid = settings.chuteyExplorerView === "grid"; list.classList.toggle("ex-grid", grid); }).catch(() => {});
  const resize = $(".ex-resize");
  resize.onpointerdown = event => { resize.setPointerCapture(event.pointerId); };
  resize.onpointermove = event => { if (resize.hasPointerCapture(event.pointerId)) { const bounds = host.getBoundingClientRect(); preview.style.height = Math.max(bounds.height * .3, Math.min(bounds.height * .7, bounds.bottom - event.clientY)) + "px"; } };
  resize.onkeydown = event => { if (["ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const bounds = host.getBoundingClientRect(); preview.style.height = Math.max(bounds.height * .3, Math.min(bounds.height * .7, preview.offsetHeight + (event.key === "ArrowUp" ? 16 : -16))) + "px"; } };
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
  }).observe(host, {attributes: true, attributeFilter: ["hidden"]});
  // Native protected consent remints handles after companion restart; no picker on resume.
  if (chrome.runtime?.sendNativeMessage) void api.nativeSession(false).then(session => { writable = !session.read_only; return connect(); }).catch(error => { say(error.code === "CANCELLED" ? previousStatus : error.message); });
  else $(".ex-connect").hidden = false; // Explicit developer/fixture fallback only.
  new ResizeObserver(() => { if (!preview.hidden) { const row = rows.find(value => value.name === $(".ex-preview strong")?.textContent); if (row) positionPreview(row); } }).observe(list);
  window.addEventListener("pagehide", () => { closePreview(); releaseThumbnails(); api.connect(""); });
})();
