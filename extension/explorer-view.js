/* Thin read-only client; no paths, writes, site tokens or duplicated file semantics. */
(() => {
  "use strict";
  const host = document.querySelector("#chutey-explorer-view");
  if (!host) return;
  const api = window.ChuteyExplorerAPI;
  host.innerHTML = `<div class="ex-native"><button type="button" data-action="select" aria-label="Select folder">▰ Select folder</button><button type="button" data-action="resume" aria-label="Reconnect folder">↻</button></div><form class="ex-connect" hidden><label>Local read session <input type="password" autocomplete="off" aria-label="Local read session token" required></label><button title="Connect" aria-label="Connect">↗</button></form>
    <div class="ex-toolbar"><button data-action="back" title="Back" aria-label="Back">‹</button><button data-action="forward" title="Forward" aria-label="Forward">›</button><button data-action="parent" title="Parent folder" aria-label="Parent folder">↑</button><button data-action="roots" title="Approved folders" aria-label="Approved folders">⌂</button><button data-action="refresh" title="Refresh" aria-label="Refresh">↻</button><span class="ex-breadcrumb">Local files</span><button data-action="grid" title="Toggle grid" aria-label="Toggle grid">▦</button></div>
    <div class="ex-filter"><input type="search" placeholder="Search this folder" aria-label="Search this folder"><select aria-label="Sort files"><option value="name">Name</option><option value="type">Type</option><option value="date">Date</option><option value="size">Size</option></select></div>
    <div class="ex-workspace"><aside class="ex-tree" aria-label="Folder navigator"></aside><div class="ex-list" role="listbox" aria-label="Local files" aria-multiselectable="true" tabindex="0"></div></div>
    <div class="ex-status" role="status" aria-live="polite">Start an owner-approved local read session. Folder writes and browser transfers await native safety validation.</div>
    <section class="ex-preview" aria-label="File preview" hidden><div class="ex-resize" role="separator" aria-label="Resize preview" aria-orientation="horizontal" tabindex="0"></div><header><strong></strong><button data-action="close" title="Close preview" aria-label="Close preview">×</button></header><div class="ex-preview-body"></div></section><div class="ex-menu" role="menu" hidden></div>`;
  const $ = selector => host.querySelector(selector);
  const list = $(".ex-list"), tree = $(".ex-tree"), preview = $(".ex-preview"), status = $(".ex-status"), menu = $(".ex-menu");
  let current = null, parent = null, rows = [], roots = [], selected = new Set(), back = [], forward = [];
  let offset = 0, requestId = 0, previewId = 0, abort = null, urls = [], grid = false;
  const thumbnails = new Map();
  const say = text => { status.textContent = text; };
  const safe = fn => (...args) => { try { return Promise.resolve(fn(...args)).catch(error => say(error.message)); } catch (error) { say(error.message); } };
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
    for (const url of urls) URL.revokeObjectURL(url); urls = []; preview.hidden = true;
  }
  async function showPreview(row) {
    closePreview(); const id = previewId; preview.hidden = false;
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
  function select(row, event = {}) {
    if (!event.ctrlKey && !event.metaKey) selected.clear();
    if (selected.has(row.handle)) selected.delete(row.handle); else selected.add(row.handle);
    for (const node of list.querySelectorAll("[role=option]")) node.setAttribute("aria-selected", String(selected.has(node.dataset.handle)));
    if (row.kind === "file") void showPreview(row);
  }
  async function load(handle, {remember = true, append = false} = {}) {
    const id = ++requestId;
    say("Loading…");
    const result = await api.command("list", {handle, offset: append ? offset : 0, limit: 100, sort: $(".ex-filter select").value, query: $(".ex-filter input").value});
    if (id !== requestId) return;
    if (!append) {
      if (remember && current && current !== handle) { back.push(current); forward = []; }
      observer.disconnect(); queue.length = 0;
      current = handle; parent = result.parent; selected.clear(); closePreview(); releaseThumbnails(); rows = []; list.replaceChildren();
      // Persist opaque native handle only; never put a private filesystem path in browser storage.
      void chrome.storage.local.set({chuteyExplorerLastHandle:handle}).catch(() => {});
    }
    rows.push(...result.entries); offset = result.next_offset;
    $(".ex-breadcrumb").textContent = result.name;
    list.querySelector(".ex-more")?.remove();
    for (const row of result.entries) {
      const node = document.createElement("div"); node.className = "ex-row"; node.tabIndex = 0; node.role = "option"; node.dataset.handle = row.handle; node.setAttribute("aria-selected", "false");
      const icon = document.createElement("span"); icon.className = "ex-icon"; icon.textContent = row.kind === "directory" ? "▰" : row.kind === "blocked" ? "⊘" : "▤"; icon.setAttribute("aria-hidden", "true");
      const name = document.createElement("span"); name.className = "ex-name"; name.textContent = row.name;
      const size = document.createElement("small"); size.textContent = row.kind === "directory" ? "Folder" : `${row.size.toLocaleString()} B`;
      node.append(icon, name, size); list.append(node);
      node.onclick = event => select(row, event);
      node.ondblclick = safe(() => row.kind === "directory" ? load(row.handle) : showPreview(row));
      node.oncontextmenu = event => { event.preventDefault(); select(row); showMenu(event.clientX, event.clientY, row); };
      node.onkeydown = safe(async event => {
        if (event.key === "Enter") { event.preventDefault(); if (row.kind === "directory") await load(row.handle); else await showPreview(row); }
        if (event.key === " " ) { event.preventDefault(); select(row, event); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); (event.key === "ArrowDown" ? node.nextElementSibling : node.previousElementSibling)?.focus(); }
        if (event.key === "Home") list.firstElementChild?.focus();
        if (event.key === "End") list.lastElementChild?.focus();
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); const rect = node.getBoundingClientRect(); showMenu(rect.left + 20, rect.top, row); }
      });
      if (row.mime?.match(/^image\/(png|jpeg|gif|webp|bmp)$/)) observer.observe(node);
    }
    if (offset !== null) { const more = button("Load more files", "···", () => load(current, {append: true})); more.className = "ex-more"; list.append(more); }
    say(result.total ? `${rows.length} of ${result.total} items · Read only` : "This folder is empty · Read only");
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
    const item = document.createElement("div"); item.className = "ex-branch";
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
  async function connect() {
    const data = await api.command("roots"); roots = data.roots; tree.replaceChildren();
    for (const root of roots) await branch(root, tree);
    $(".ex-connect").hidden = true;
    if (roots[0]) {
      // Reopening Shelf resumes the last browsed directory while the native grant is valid.
      // A restarted companion may invalidate opaque handles: use its approved root instead.
      const {chuteyExplorerLastHandle:lastHandle} = await chrome.storage.local.get({chuteyExplorerLastHandle:null});
      if (lastHandle) {
        try { await load(lastHandle,{remember:false}); }
        catch { await load(roots[0].handle,{remember:false}); }
      } else await load(roots[0].handle,{remember:false});
    }
  }
  function showMenu(x, y, row) {
    menu.replaceChildren();
    const actions = row ? [[row.kind === "directory" ? "Open folder" : "Preview", () => row.kind === "directory" ? load(row.handle) : showPreview(row)], ["Properties", async () => { const meta = await api.command("stat", {handle: row.handle}); say(`${meta.name} · ${meta.size.toLocaleString()} bytes · ${new Date(meta.modified_ns / 1e6).toLocaleString()}`); }]] : [["Refresh", () => current && load(current, {remember: false})]];
    for (const [name, fn] of actions) { const node = button(name, name, async () => { menu.hidden = true; await fn(); }); node.role = "menuitem"; menu.append(node); }
    const blocked = button("Native consent required for writes and OS actions", "File actions await native consent", () => {}); blocked.disabled = true; blocked.role = "menuitem"; menu.append(blocked);
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
  host.addEventListener("keydown", event => { if (event.key === "Escape") { menu.hidden = true; closePreview(); list.focus(); } });
  host.addEventListener("dragover", event => { if (event.target.closest(".ex-workspace")) { event.preventDefault(); event.dataTransfer.dropEffect = "none"; } });
  host.addEventListener("drop", event => { if (event.target.closest(".ex-workspace")) { event.preventDefault(); say("No files saved. Folder intake awaits verified native consent and byte-transfer safety."); } });
  $(".ex-connect").onsubmit = safe(async event => { event.preventDefault(); api.connect($(".ex-connect input").value); $(".ex-connect input").value = ""; await connect(); });
  let timer;
  $(".ex-filter input").oninput = () => { clearTimeout(timer); timer = setTimeout(safe(() => current && load(current, {remember: false})), 180); };
  $(".ex-filter select").onchange = safe(() => current && load(current, {remember: false}));
  const actions = {
    select: async () => { say("Opening Windows folder picker…"); await api.nativeSession(true); await chrome.storage.local.remove("chuteyExplorerLastHandle"); await connect(); },
    resume: async () => { await api.nativeSession(false); await connect(); },
    refresh: () => current && load(current, {remember: false}), parent: () => parent && load(parent), roots: () => roots[0] && load(roots[0].handle), close: closePreview,
    back: async () => { if (back.length) { const target = back.pop(); forward.push(current); await load(target, {remember: false}); } },
    forward: async () => { if (forward.length) { const target = forward.pop(); back.push(current); await load(target, {remember: false}); } },
    grid: () => { grid = !grid; list.classList.toggle("ex-grid", grid); void chrome.storage.local.set({chuteyExplorerView: grid ? "grid" : "list"}).catch(() => {}); }
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
  list.addEventListener("scroll", () => { if (!host.hidden) rememberedScroll = list.scrollTop; });
  new MutationObserver(() => {
    if (!host.hidden) list.scrollTop = rememberedScroll;
  }).observe(host, {attributes: true, attributeFilter: ["hidden"]});
  // Existing grants survive Shelf close, but never companion restart or user switch.
  if (chrome.runtime?.sendNativeMessage) void api.nativeSession(false).then(connect).catch(error => say(error.message));
  else $(".ex-connect").hidden = false; // Explicit developer/fixture fallback only.
  window.addEventListener("pagehide", () => { closePreview(); releaseThumbnails(); api.connect(""); });
})();
