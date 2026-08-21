(() => {
  if (window.top !== window || document.getElementById("__chute_sticky_host")) return;

  const BASE_WIDTH = 92;
  const BASE_HEIGHT = 104;

  const host = document.createElement("div");
  host.id = "__chute_sticky_host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    right: "18px",
    bottom: "18px",
    width: `${BASE_WIDTH}px`,
    height: `${BASE_HEIGHT}px`,
    margin: "0",
    padding: "0",
    border: "0",
    zIndex: "2147483647",
    pointerEvents: "auto",
    isolation: "isolate"
  });

  const shadow = host.attachShadow({ mode: "closed" });
  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("bin.html");
  frame.title = "Chute browser bin";
  frame.setAttribute("aria-label", "Chute browser bin");
  Object.assign(frame.style, {
    width: "100%",
    height: "100%",
    display: "block",
    border: "0",
    background: "transparent",
    colorScheme: "normal"
  });
  shadow.append(frame);

  let supportHover = false;
  let accessMode = "floating";
  let pageDragSource = null;
  let clearDragTimer = null;
  let dragRouting = false;
  let dropActive = false;

  function floatingEnabled(mode) {
    return mode === "floating" || mode === "both";
  }

  function renderVisibility() {
    host.style.display = floatingEnabled(accessMode) ? "block" : "none";
  }

  function renderSize() {
    // The visible Chute remains bottom-right anchored. Auxiliary UI may grow
    // upward/left, but the landing zone is always the same BASE_WIDTH/HEIGHT.
    host.style.width = supportHover ? "198px" : `${BASE_WIDTH}px`;
    host.style.height = supportHover ? "174px" : `${BASE_HEIGHT}px`;
  }

  function stableLandingRect() {
    const rect = host.getBoundingClientRect();
    return {
      left: rect.right - BASE_WIDTH,
      right: rect.right,
      top: rect.bottom - BASE_HEIGHT,
      bottom: rect.bottom
    };
  }

  function pointInLandingZone(x, y) {
    if (!floatingEnabled(accessMode) || host.style.display === "none") return false;
    const rect = stableLandingRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function setDropActive(next) {
    if (dropActive === next) return;
    dropActive = next;
    frame.contentWindow?.postMessage({ type: "chute-page-drop-active", active: next }, "*");
  }

  function beginDragRouting() {
    if (dragRouting) return;
    dragRouting = true;
    // Chromium can make an extension iframe an unreliable cross-origin drop
    // receiver. During a drag, let the parent page own Chute's landing zone and
    // hand the payload to the iframe explicitly with structured postMessage.
    frame.style.pointerEvents = "none";
    if (supportHover) {
      supportHover = false;
      renderSize();
      frame.contentWindow?.postMessage({ type: "chute-force-support-closed" }, "*");
    }
  }

  function endDragRouting() {
    dragRouting = false;
    frame.style.pointerEvents = "auto";
    setDropActive(false);
  }

  function safeDragName(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|\r\n]+/g, "_")
      .trim()
      .slice(0, 180);
  }

  function describePageDrag(target) {
    if (!(target instanceof Element)) return null;

    const image = target.closest("img");
    if (image) {
      const url = image.currentSrc || image.src;
      if (url) {
        return {
          kind: "image",
          url,
          name: safeDragName(image.alt || image.getAttribute("aria-label") || "")
        };
      }
    }

    const link = target.closest("a[href]");
    if (link?.href) {
      return {
        kind: "link",
        url: link.href,
        name: safeDragName(link.textContent || "")
      };
    }

    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      return { kind: "selection", text: selection.slice(0, 200000) };
    }

    return null;
  }

  function sendDragSource(source) {
    frame.contentWindow?.postMessage({ type: "chute-page-drag-source", source }, "*");
  }

  function transferText(transfer, type) {
    try {
      return transfer?.getData(type) || "";
    } catch {
      return "";
    }
  }

  function handDropToChute(transfer) {
    const files = transfer?.files ? Array.from(transfer.files) : [];
    frame.contentWindow?.postMessage({
      type: "chute-page-drop",
      drop: {
        files,
        uri: transferText(transfer, "text/uri-list"),
        html: transferText(transfer, "text/html"),
        text: transferText(transfer, "text/plain"),
        source: pageDragSource
      }
    }, "*");
  }

  document.addEventListener("dragstart", (event) => {
    if (clearDragTimer) {
      clearTimeout(clearDragTimer);
      clearDragTimer = null;
    }
    pageDragSource = describePageDrag(event.target);
    sendDragSource(pageDragSource);
    beginDragRouting();
  }, true);

  document.addEventListener("dragenter", () => {
    // This also catches files entering the browser from the desktop, where no
    // page dragstart event exists.
    beginDragRouting();
  }, true);

  document.addEventListener("dragover", (event) => {
    if (!dragRouting) beginDragRouting();
    const overChute = pointInLandingZone(event.clientX, event.clientY);
    setDropActive(overChute);
    if (!overChute) return;

    event.preventDefault();
    event.stopPropagation();
    try {
      event.dataTransfer.dropEffect = "copy";
    } catch {}
  }, true);

  document.addEventListener("drop", (event) => {
    const overChute = pointInLandingZone(event.clientX, event.clientY);
    if (overChute) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handDropToChute(event.dataTransfer);
    }
    pageDragSource = null;
    sendDragSource(null);
    endDragRouting();
  }, true);

  document.addEventListener("dragend", () => {
    // Keep source metadata alive briefly because Chromium may dispatch dragend
    // almost alongside a cross-context drop.
    clearDragTimer = setTimeout(() => {
      pageDragSource = null;
      sendDragSource(null);
      endDragRouting();
    }, 250);
  }, true);

  window.addEventListener("blur", () => {
    if (!dragRouting) return;
    setTimeout(() => {
      if (dragRouting) endDragRouting();
    }, 1000);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === "chute-open-side-panel") {
      chrome.runtime.sendMessage({ type: "open-side-panel" });
    }
    if (event.data?.type === "chute-support-hover") {
      supportHover = Boolean(event.data.active);
      renderSize();
    }
    if (event.data?.type === "chute-request-drag-source") {
      sendDragSource(pageDragSource);
    }
  });

  chrome.storage.sync.get({
    chuteAccessMode: null,
    chuteBinVisible: true
  }, ({ chuteAccessMode, chuteBinVisible }) => {
    accessMode = chuteAccessMode || (chuteBinVisible ? "floating" : "context");
    renderVisibility();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.chuteAccessMode) {
      accessMode = changes.chuteAccessMode.newValue || "floating";
      renderVisibility();
      return;
    }
    if (changes.chuteBinVisible) {
      accessMode = changes.chuteBinVisible.newValue ? "floating" : "context";
      renderVisibility();
    }
  });

  function mount() {
    const root = document.documentElement || document.body;
    if (root && !host.isConnected) root.append(host);
  }

  mount();
  if (document.documentElement) {
    new MutationObserver(mount).observe(document.documentElement, { childList: true });
  }
})();