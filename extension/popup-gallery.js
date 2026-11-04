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
    document.body.style.setProperty("--chutey-gallery-columns", String(choice.columns));
    document.body.style.setProperty("--chutey-gallery-rows", String(choice.rows));
    document.body.dataset.galleryLayout = choice.columns + "x" + choice.rows;
    if (dial) dial.value = String(step);
    if (readout) readout.textContent = choice.columns + " × " + choice.rows;
    queueMicrotask(sizeGridCells);
    return step;
  }
  applyLayout(0);
  const grid = document.querySelector("#files");
  // A fixed geometric cell track stops expanded cards from redefining implicit
  // row heights and colliding at every density (4x4 through 6x5).
  function sizeGridCells() {
    if (!grid) return;
    const style = getComputedStyle(grid);
    const columns = Number(document.body.style.getPropertyValue("--chutey-gallery-columns")) || 4;
    const space = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;
    const cell = (space - gap * (columns - 1)) / columns;
    if (cell > 0) grid.style.setProperty("--chutey-gallery-cell", cell + "px");
  }
  if (grid && typeof ResizeObserver !== "undefined") new ResizeObserver(sizeGridCells).observe(grid);
  window.addEventListener("resize",sizeGridCells);
  sizeGridCells();

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
    <header><strong class="chutey-lightbox-title"></strong><button class="chutey-lightbox-close" type="button" aria-label="Close preview">×</button></header>
    <div class="chutey-lightbox-stage">
      <button type="button" class="chutey-lightbox-prev" aria-label="Previous image">‹</button>
      <img class="chutey-lightbox-image" alt="">
      <button type="button" class="chutey-lightbox-next" aria-label="Next image">›</button>
      <p class="chutey-lightbox-error" hidden>Image unavailable. The History entry is preserved.</p>
    </div>
    <footer><span class="chutey-lightbox-count"></span><button type="button" class="secondary-button chutey-lightbox-shelf">Open in Shelf</button></footer>`;
  document.body.append(lightbox);
  const preview = lightbox.querySelector(".chutey-lightbox-image");
  const errorText = lightbox.querySelector(".chutey-lightbox-error");
  const prev = lightbox.querySelector(".chutey-lightbox-prev");
  const next = lightbox.querySelector(".chutey-lightbox-next");
  let activeId = null, returnFocus = null, serial = 0;
  function imageTiles() {
    return Array.from(document.querySelectorAll("#files .chutey-gallery-tile"))
      .filter(tile => tile.__galleryFile && isPreviewableImage(tile.__galleryFile));
  }
  function activeFile() {
    return imageTiles().find(tile => tile.__galleryFile.id === activeId)?.__galleryFile;
  }
  function showImage(id) {
    const tiles = imageTiles();
    const index = tiles.findIndex(tile => tile.__galleryFile.id === id);
    if (index < 0) return;
    const file = tiles[index].__galleryFile;
    activeId = id;
    const token = ++serial;
    errorText.hidden = true;
    errorText.textContent = "Image unavailable. The History entry is preserved.";
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
    preview.src = fileUrl(file);
  }
  function openPreview(file, source) {
    if (!isPreviewableImage(file)) return;
    returnFocus = source;
    lightbox.hidden = false;
    document.body.classList.add("chutey-lightbox-open");
    showImage(file.id);
    lightbox.querySelector(".chutey-lightbox-close").focus();
  }
  function closePreview() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("chutey-lightbox-open");
    ++serial;
    preview.removeAttribute("src");
    activeId = null;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    returnFocus = null;
  }
  function move(delta) {
    const tiles = imageTiles();
    const index = tiles.findIndex(tile => tile.__galleryFile.id === activeId);
    if (index + delta >= 0 && index + delta < tiles.length) showImage(tiles[index + delta].__galleryFile.id);
  }
  lightbox.querySelector(".chutey-lightbox-close").addEventListener("click",closePreview);
  prev.addEventListener("click",() => move(-1));
  next.addEventListener("click",() => move(1));
  document.addEventListener("keydown",event => {
    if (lightbox.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closePreview(); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    else if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    else if (event.key === "Tab") {
      const controls = Array.from(lightbox.querySelectorAll("button:not(:disabled)"));
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
    if (!lightbox.hidden && !activeFile()) closePreview();
  }).observe(document.querySelector("#files"),{childList:true});

  const original = createRow;
  createRow = function galleryRow(file,index) {
    const row = original(file,index);
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
        const mascot = document.createElement("img");
        mascot.className = "chutey-tile-mascot";
        mascot.src = "icons/icon32.png";
        mascot.alt = "";
        mascot.draggable = false;
        fallback.replaceChildren(mascot);
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
    if (isPreviewableImage(file) && icon) {
      icon.setAttribute("role","button");
      icon.tabIndex = 0;
      icon.setAttribute("aria-label","Preview " + file.name);
      icon.addEventListener("click",event => { event.stopPropagation(); openPreview(file,icon); });
      icon.addEventListener("keydown",event => {
        if (!["Enter"," "].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); openPreview(file,icon);
      });
    }
    function toggle() {
      const expanded = !row.classList.contains("chutey-gallery-expanded");
      row.classList.toggle("chutey-gallery-expanded",expanded);
      row.setAttribute("aria-expanded",String(expanded));
    }
    row.addEventListener("click",event => {
      if (event.defaultPrevented || event.target.closest("button,input,a,select") || (isPreviewableImage(file) && event.target.closest(".file-icon"))) return;
      toggle();
    });
    row.addEventListener("keydown",event => {
      if (!["Enter"," "].includes(event.key) || event.target !== row) return;
      event.preventDefault(); toggle();
    });
    return row;
  };
})();
