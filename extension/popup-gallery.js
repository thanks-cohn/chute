/* The toolbar popup is transient in Chrome; a tear-off gallery is persistent. */
(() => {
  "use strict";
  if (!location.pathname.endsWith("/popup.html")) return;

  const layouts = Object.freeze([
    { columns: 4, rows: 4 },
    { columns: 5, rows: 4 },
    { columns: 5, rows: 5 },
    { columns: 6, rows: 5 }
  ]);
  const grid = document.querySelector("#files");
  const dial = document.querySelector("#gallery-density");
  const readout = document.querySelector("#gallery-density-value");
  const viewerSize = document.querySelector("#shelf-viewer-size");
  const popupStatus = document.querySelector("#status");
  const parameters = new URLSearchParams(location.search);
  const detached = parameters.get("detached") === "1";
  const sourceId = Number(parameters.get("browserWindow"));
  let browserWindowId = detached && Number.isInteger(sourceId) && sourceId > 0 ? sourceId : null;
  let browserBounds = null;
  let knownGalleryWindow = null;
  let densityStep = 0;
  let opening = false;

  // Resolve the originating browser window before a user clicks, so opening
  // the Shelf can happen *directly* inside the next trusted click gesture.
  if (!browserWindowId) {
    void chrome.windows.getCurrent().then(win => {
      if (!browserWindowId) browserWindowId = win.id;
      browserBounds = win;
      return chrome.storage.session.get("chuteyGalleryWindows");
    }).then(values => {
      knownGalleryWindow = values?.chuteyGalleryWindows?.[String(browserWindowId)] || null;
    }).catch(error => console.warn("Chutey gallery window lookup:", error));
  } else {
    void chrome.windows.get(browserWindowId).then(win => {
      browserBounds = win;
    }).catch(() => {});
  }

  function clampStep(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
  }

  // The CSS tracks are explicitly pixel-sized. An aspect-ratio alone does
  // NOT size Chrome's implicit grid rows reliably when children are overlays:
  // that caused the repeated image stacks in the November 4 screenshot.
  function measureGallery() {
    if (!grid || typeof getComputedStyle !== "function") return;
    const style = getComputedStyle(grid);
    const columns = layouts[densityStep].columns;
    const rows = layouts[densityStep].rows;
    const gap = parseFloat(style.columnGap) || 6;
    const rowGap = parseFloat(style.rowGap) || gap;
    const px = value => parseFloat(value) || 0;
    const innerWidth = grid.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
    const tileSize = Math.max(26, Math.floor((innerWidth - gap * (columns - 1)) / columns));
    const rowHeight = Math.round(rows * tileSize + (rows - 1) * rowGap +
      px(style.paddingTop) + px(style.paddingBottom));
    grid.style.setProperty("--chutey-gallery-tile-size", tileSize + "px");
    grid.style.height = Math.min(386, rowHeight) + "px";
  }

  function applyLayout(value) {
    densityStep = clampStep(value);
    const choice = layouts[densityStep];
    document.body.style.setProperty("--chutey-gallery-columns", String(choice.columns));
    document.body.style.setProperty("--chutey-gallery-rows", String(choice.rows));
    document.body.dataset.galleryLayout = choice.columns + "x" + choice.rows;
    if (dial) dial.value = String(densityStep);
    if (readout) readout.textContent = choice.columns + " × " + choice.rows;
    measureGallery();
    return densityStep;
  }

  applyLayout(0);
  if (typeof ResizeObserver === "function" && grid) {
    // A width change can happen without a window resize (native scrollbar).
    let measuredWidth = -1;
    new ResizeObserver(() => {
      if (measuredWidth === grid.clientWidth) return;
      measuredWidth = grid.clientWidth;
      measureGallery();
    }).observe(grid);
  }
  window.addEventListener("resize", measureGallery);
  dial?.addEventListener("input", () => {
    const step = applyLayout(dial.value); // Reflow immediately, not after storage.
    void chrome.storage.sync.set({ chutePopupGridStep: step }).catch(console.warn);
  });
  viewerSize?.addEventListener("change", () => {
    void chrome.storage.sync.set({
      chuteShelfViewerSize: viewerSize.value === "full" ? "full" : "half"
    }).catch(console.warn);
  });
  void chrome.storage.sync.get({ chutePopupGridStep: 0, chuteShelfViewerSize: "half" })
    .then(settings => {
      applyLayout(settings.chutePopupGridStep);
      if (viewerSize) viewerSize.value =
        settings.chuteShelfViewerSize === "full" ? "full" : "half";
    }).catch(console.warn);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.chutePopupGridStep) applyLayout(changes.chutePopupGridStep.newValue);
    if (changes.chuteShelfViewerSize && viewerSize) {
      viewerSize.value = changes.chuteShelfViewerSize.newValue === "full" ? "full" : "half";
    }
  });

  async function rememberGallery(id, browserId) {
    const key = "chuteyGalleryWindows";
    const existing = await chrome.storage.session.get(key);
    const windows = existing[key] || {};
    windows[String(browserId)] = id;
    await chrome.storage.session.set({ [key]: windows });
  }

  function pinnedGalleryRequest(browserId) {
    if (detached) return Promise.resolve();
    if (knownGalleryWindow) {
      return chrome.windows.update(knownGalleryWindow, { focused: true })
        .catch(() => {
          knownGalleryWindow = null;
          return createPinnedGallery(browserId);
        });
    }
    return createPinnedGallery(browserId);
  }

  function createPinnedGallery(browserId) {
    // A Chrome action popup cannot stay open when the side panel takes focus.
    // Replace it with a normal extension-owned popup WINDOW; position it far
    // LEFT of the Chrome Shelf, which normally occupies the browser's right.
    const bounds = browserBounds;
    const width = 408;
    const height = bounds ? Math.max(480, Math.min(610, bounds.height - 94)) : 600;
    const left = bounds ? Math.round(bounds.left + 12) : 20;
    const top = bounds ? Math.round(bounds.top + 74) : 80;
    return chrome.windows.create({
      url: chrome.runtime.getURL("popup.html?detached=1&browserWindow=" + browserId),
      type: "popup", width, height, left, top, focused: true
    }).then(win => {
      if (win?.id) {
        knownGalleryWindow = win.id;
        return rememberGallery(win.id, browserId);
      }
    });
  }

  async function openShelfWithGallery(file = null, index = 0) {
    if (opening) return;
    opening = true;
    try {
      if (!browserWindowId) {
        const win = await chrome.windows.getCurrent();
        browserWindowId = win.id;
        browserBounds = win;
      }
      if (!browserWindowId || !chrome.sidePanel?.open)
        throw new Error("Chrome Shelf could not be opened.");

      const day = file ? (selectedDay || String(file.created_at || "").slice(0, 10)) : "";
      const intent = file && /^[0-9a-f]{32}$/i.test(String(file.id || "")) ? {
        id: file.id, name: String(file.name || "Saved image").slice(0, 256),
        mime: String(file.mime || ""),
        day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
        page: currentPage, index,
        scope: selectedDay ? "history" : "live", windowId: browserWindowId,
        requestId: Date.now() + "-" + Math.random().toString(36).slice(2, 9),
        issuedAt: Date.now()
      } : null;

      // Initiate all privileged operations in this same user gesture; the
      // original transient popup may disappear before their promises settle.
      const save = intent
        ? chrome.storage.session.set({ chuteyPopupOpenItem: intent })
        : Promise.resolve();
      const shelf = chrome.sidePanel.open({ windowId: browserWindowId });
      const pin = pinnedGalleryRequest(browserWindowId);
      await Promise.all([save, shelf, pin]);
      if (!detached) window.close();
    } catch (error) {
      if (popupStatus) {
        popupStatus.textContent = "Unable to open the Shelf and gallery together.";
        popupStatus.classList.add("error");
      }
      console.warn("Chutey gallery/Shelf handoff:", error);
    } finally {
      opening = false;
    }
  }

  // The original toolbar popup is still available as a short-lived launcher.
  // The new extension-owned gallery window remains visible beside the Shelf.
  window.chuteyOpenShelfWithGallery = () => openShelfWithGallery();

  const original = createRow;
  createRow = function galleryRow(file, index) {
    const row = original(file, index);
    row.classList.add("chutey-gallery-tile");
    row.dataset.galleryGeometry = String(index % 4);
    row.tabIndex = 0;
    row.title = file.name;
    row.setAttribute("aria-label", "Open " + file.name + " in Chutey Shelf");
    row.addEventListener("click", event => {
      if (event.defaultPrevented || event.target.closest("button,input,a,select")) return;
      void openShelfWithGallery(file, index);
    });
    row.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key) ||
          event.target.closest("button,input,a,select")) return;
      event.preventDefault();
      void openShelfWithGallery(file, index);
    });
    return row;
  };
})();
