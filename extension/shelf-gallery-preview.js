/* Shelf gallery handoff: exact stored Chute item, no native folder permission change. */
(() => {
  "use strict";
  if (!location.pathname.endsWith("/shelf.html")) return;
  const KEY = "chuteyPopupOpenItem";
  const gallery = document.querySelector("#chutey-history-view");
  if (!gallery) return;
  const viewer = document.createElement("section");
  viewer.className = "chutey-shelf-viewer";
  viewer.hidden = true;
  viewer.setAttribute("aria-label","Selected saved file preview");
  viewer.setAttribute("role","region");
  const bar = document.createElement("header");
  const title = document.createElement("strong");
  const size = document.createElement("button");
  const close = document.createElement("button");
  size.type = "button"; size.className = "secondary-button"; size.title = "Switch between half and full preview";
  close.type = "button"; close.className = "icon-button"; close.textContent = "×"; close.setAttribute("aria-label","Close saved image preview");
  bar.append(title,size,close);
  const body = document.createElement("div"); body.className = "chutey-shelf-viewer-body";
  const message = document.createElement("p"); message.className = "chutey-shelf-viewer-message";
  const image = document.createElement("img"); image.alt = ""; image.hidden = true;
  body.append(image,message);
  viewer.append(bar,body);
  function positionViewer(row) {
    if (!row?.isConnected) return;
    viewer.remove();
    const cards = [...gallery.querySelectorAll("#files .file-row")];
    let after = row;
    for (const card of cards.slice(cards.indexOf(row)+1)) {
      if (Math.abs(card.offsetTop-row.offsetTop)>2) break;
      after=card;
    }
    after.after(viewer);
    viewer.style.gridColumn="1 / -1";
  }
  let sizeMode = "half";
  let processing = false, lastRequest = "", pending = null;
  let selectedRow = null;
  let previewRequest = 0;
  const isImage = file => /^image\//i.test(String(file.mime || "")) || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(String(file.name || ""));

  function resizeViewer() {
    if (viewer.hidden) return;
    const calendar = gallery.querySelector(".history-nav");
    const top = calendar ? Math.ceil(calendar.getBoundingClientRect().bottom) : 120;
    const available = Math.max(140,window.innerHeight - Math.max(top,0) - 3);
    viewer.style.height = Math.round(sizeMode === "full" ? available : available * .52) + "px";
    size.textContent = sizeMode === "full" ? "Half" : "Expand";
    size.setAttribute("aria-label",sizeMode === "full" ? "Use half-height preview" : "Expand preview up to calendar");
  }

  function dismiss() {
    ++previewRequest;
    viewer.hidden = true;
    image.hidden = true; image.onload = null; image.onerror = null; image.removeAttribute("src");
    message.textContent = "";
    if (selectedRow) selectedRow.classList.remove("chutey-gallery-selected");
    selectedRow = null;
  }

  // Clicking a Shelf History card previews it in place; command buttons retain
  // their own behavior. The same renderer is shared with the popup.
  function selectRow(file, row) {
    dismiss();
    selectedRow = row;
    selectedRow.classList.add("chutey-gallery-selected");
    title.textContent = file.name || "Saved item";
    image.alt = file.name || "Saved image";
    positionViewer(row);
    viewer.hidden = false;
    resizeViewer();
    if (!isImage(file)) {
      message.textContent = "This item has no image preview.";
      return;
    }
    const request = ++previewRequest;
    message.textContent = "Loading saved image…";
    image.onload = () => {
      if (request !== previewRequest) return;
      image.hidden = false;
      message.textContent = "";
    };
    image.onerror = () => {
      if (request !== previewRequest) return;
      image.hidden = true;
      message.textContent = "Saved image unavailable. The History entry remains accessible.";
    };
    image.src = "http://127.0.0.1:17891/api/files/" + encodeURIComponent(file.id);
  }
  const previousCreateRow = createRow;
  createRow = function shelfSelectableHistoryRow(file, index) {
    const row = previousCreateRow(file, index);
    row.tabIndex = 0;
    row.classList.add("chutey-shelf-selectable");
    row.setAttribute("aria-label", "Preview " + (file.name || "saved item"));
    row.addEventListener("click", event => {
      if (event.defaultPrevented || event.target.closest("button,a,input,select")) return;
      selectRow(file,row);
    });
    row.addEventListener("keydown", event => {
      if (event.target !== row || !["Enter"," "].includes(event.key)) return;
      event.preventDefault();
      selectRow(file,row);
    });
    return row;
  };
  document.addEventListener("keydown", event => {
    if (viewer.hidden || gallery.hidden || !["ArrowLeft","ArrowRight","Escape"].includes(event.key)) return;
    if (event.target.closest("input,textarea,select,[contenteditable=true]")) return;
    if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
    const rows = Array.from(gallery.querySelectorAll("#files .chutey-shelf-selectable"));
    const index = rows.indexOf(selectedRow);
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    if (index < 0 || index + delta < 0 || index + delta >= rows.length) return;
    const target = rows[index + delta];
    event.preventDefault();
    target.click();
    target.focus({preventScroll:true});
    target.scrollIntoView({block:"nearest"});
  });
  new MutationObserver(() => {
    if (selectedRow && !selectedRow.isConnected) dismiss();
  }).observe(gallery.querySelector("#files"),{childList:true});
  close.addEventListener("click",dismiss);
  size.addEventListener("click",() => {
    sizeMode = sizeMode === "full" ? "half" : "full";
    resizeViewer();
    void chrome.storage.sync.set({chuteShelfViewerSize:sizeMode}).catch(console.warn);
  });
  window.addEventListener("resize",() => { positionViewer(selectedRow); resizeViewer(); });
  document.querySelector("#chutey-tab-explorer")?.addEventListener("click",dismiss);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.chuteShelfViewerSize) {
      sizeMode = changes.chuteShelfViewerSize.newValue === "full" ? "full" : "half";
      resizeViewer();
    }
    if (area === "session" && changes[KEY]?.newValue) void consume(changes[KEY].newValue);
  });
  void chrome.storage.sync.get({chuteShelfViewerSize:"half"}).then(settings => {
    sizeMode = settings.chuteShelfViewerSize === "full" ? "full" : "half";
    resizeViewer();
  }).catch(console.warn);

  async function findHistoryRow(intent) {
    if (!intent.day) return null;
    const day = intent.day;
    selectedDay = day;
    if (historyDateInput) historyDateInput.value = day;
    const index = intent.scope === "history" ? intent.page * 30 + intent.index : 0;
    const initialPage = Math.max(0,Math.floor(index / displayLimit));
    const pages = [initialPage];
    for (let p = 0; p < 12; p++) if (p !== initialPage) pages.push(p);
    let hit = -1;
    for (const page of pages) {
      const result = await fetchHistoryPage(day,page);
      if (!Array.isArray(result.files)) break;
      if (result.files.some(row => row.id === intent.id)) { hit = page; break; }
      if (!result.has_more && page >= initialPage) break;
    }
    currentPage = hit >= 0 ? hit : 0;
    await resetHistory(day);
    const row = Array.from(document.querySelectorAll("#chutey-history-view #files .file-row"))
      .find(node => node.dataset.chuteId === intent.id) || null;
    if (row) {
      row.classList.add("chutey-gallery-selected");
      row.scrollIntoView({block:"center",behavior:"instant"});
    }
    return row;
  }

  async function show(intent) {
    dismiss();
    document.querySelector("#chutey-tab-history")?.click();
    title.textContent = intent.name;
    image.alt = intent.name;
    viewer.hidden = false;
    message.textContent = "Finding this item in your Shelf…";
    resizeViewer();
    try {
      selectedRow = await findHistoryRow(intent);
      positionViewer(selectedRow);
      if (!selectedRow) { dismiss(); return; }
    } catch (error) {
      console.warn("Chutey gallery location could not be reached:",error);
    }
    if (isImage(intent)) {
      image.onload = () => { message.textContent = ""; image.hidden = false; };
      image.onerror = () => {
        image.hidden = true;
        message.textContent = "Saved image unavailable. The original file may have been moved or removed.";
      };
      image.src = "http://127.0.0.1:17891/api/files/" + encodeURIComponent(intent.id);
      message.textContent = "Loading your saved image…";
    } else {
      message.textContent = "This item is located in Chutey History. Only images show an in-Shelf picture preview.";
    }
  }

  async function consume(value) {
    if (!value || processing) { if (processing) pending = value; return; }
    if (!/^[0-9a-f]{32}$/i.test(String(value.id || "")) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(value.day || "")) ||
        !Number.isFinite(value.issuedAt) || Math.abs(Date.now()-value.issuedAt)>120000 ||
        !value.requestId || value.requestId===lastRequest) return;
    if (Number.isInteger(value.windowId)) {
      const ownWindow = await chrome.windows.getCurrent();
      if (ownWindow.id !== value.windowId) return;
    }
    const intent = {
      id:value.id,
      name:String(value.name||"Saved item").slice(0,256),
      mime:String(value.mime||""),
      day:value.day,
      scope:value.scope === "history" ? "history" : "live",
      page:Number.isInteger(value.page) && value.page>=0 ? Math.min(10000,value.page) : 0,
      index:Number.isInteger(value.index) && value.index>=0 ? Math.min(29,value.index) : 0
    };
    processing = true;
    lastRequest = value.requestId;
    try {
      await show(intent);
    } finally {
      try { await chrome.storage.session.remove(KEY); } catch {}
      processing = false;
      if (pending) { const next=pending; pending=null; void consume(next); }
    }
  }

  void chrome.storage.session.get(KEY).then(value => {
    if (value[KEY]) void consume(value[KEY]);
  }).catch(console.warn);
})();
