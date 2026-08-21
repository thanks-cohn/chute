(() => {
  if (window.top !== window || document.getElementById("__chute_sticky_host")) return;

  const host = document.createElement("div");
  host.id = "__chute_sticky_host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    right: "18px",
    bottom: "18px",
    width: "92px",
    height: "104px",
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

  function floatingEnabled(mode) {
    return mode === "floating" || mode === "both";
  }

  function renderVisibility() {
    host.style.display = floatingEnabled(accessMode) ? "block" : "none";
  }

  function renderSize() {
    // The browser landing point stays physically fixed. Auxiliary UI is
    // allowed to grow upward/left, but the bottom-right bin never moves.
    host.style.width = supportHover ? "198px" : "92px";
    host.style.height = supportHover ? "174px" : "104px";
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

  document.addEventListener("dragstart", (event) => {
    if (clearDragTimer) {
      clearTimeout(clearDragTimer);
      clearDragTimer = null;
    }
    pageDragSource = describePageDrag(event.target);
    sendDragSource(pageDragSource);
  }, true);

  document.addEventListener("dragend", () => {
    // Keep the source metadata alive briefly because the drop inside the
    // extension iframe and the page's dragend can be delivered very close
    // together by Chromium.
    clearDragTimer = setTimeout(() => {
      pageDragSource = null;
      sendDragSource(null);
    }, 1200);
  }, true);

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