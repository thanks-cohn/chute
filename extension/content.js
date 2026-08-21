(() => {
  if (window.top !== window || document.getElementById("__chute_sticky_host")) return;

  const BASE_URL = "http://127.0.0.1:17891";
  const CHUTE_DRAG_TYPE = "application/x-chute-item";
  const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
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
  let dropActiveImage = false;
  let deliveringChuteFile = false;
  let externalChuteDragItem = null;
  let externalChuteDragTimer = null;

  function floatingEnabled(mode) {
    return mode === "floating" || mode === "both";
  }

  function preserveNativeDropLifecycle() {
    const hostname = location.hostname.toLowerCase();
    return hostname === "chatgpt.com" ||
      hostname.endsWith(".chatgpt.com") ||
      hostname === "chat.openai.com" ||
      hostname.endsWith(".chat.openai.com");
  }

  function renderVisibility() {
    host.style.display = floatingEnabled(accessMode) ? "block" : "none";
  }

  function renderSize() {
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

  function transferHasImage(transfer) {
    if (pageDragSource?.kind === "image") return true;
    if (externalChuteDragItem?.mime?.startsWith("image/")) return true;
    try {
      return Array.from(transfer?.items || []).some((item) =>
        item.kind === "file" && String(item.type || "").toLowerCase().startsWith("image/")
      );
    } catch {
      return false;
    }
  }

  function setDropActive(next, imageDrag = false) {
    if (dropActive === next && dropActiveImage === imageDrag) return;
    dropActive = next;
    dropActiveImage = imageDrag;
    frame.contentWindow?.postMessage({
      type: "chute-page-drop-active",
      active: next,
      imageDrag: Boolean(next && imageDrag)
    }, "*");
  }

  function beginDragRouting() {
    if (dragRouting) return;
    dragRouting = true;
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
    setDropActive(false, false);
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
          pageUrl: location.href,
          name: safeDragName(image.alt || image.getAttribute("aria-label") || "")
        };
      }
    }

    const link = target.closest("a[href]");
    if (link?.href) {
      return {
        kind: "link",
        url: link.href,
        pageUrl: location.href,
        name: safeDragName(link.textContent || "")
      };
    }

    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      return { kind: "selection", pageUrl: location.href, text: selection.slice(0, 200000) };
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
        pageUrl: location.href,
        source: pageDragSource
      }
    }, "*");
  }

  function decodeChuteToken(value) {
    const text = String(value || "");
    if (!text.startsWith(CHUTE_DRAG_PREFIX)) return null;
    try {
      const payload = JSON.parse(decodeURIComponent(text.slice(CHUTE_DRAG_PREFIX.length)));
      if (!payload?.id || !payload?.name) return null;
      return {
        id: String(payload.id),
        name: String(payload.name),
        mime: String(payload.mime || "application/octet-stream")
      };
    } catch {
      return null;
    }
  }

  function chuteTokenFromTransfer(transfer) {
    return decodeChuteToken(transferText(transfer, CHUTE_DRAG_TYPE)) ||
      decodeChuteToken(transferText(transfer, "text/plain"));
  }

  function rememberExternalChuteDrag(item) {
    if (!item?.id || !item?.name) return;
    externalChuteDragItem = {
      id: String(item.id),
      name: String(item.name),
      mime: String(item.mime || "application/octet-stream")
    };
    if (externalChuteDragTimer) clearTimeout(externalChuteDragTimer);
    externalChuteDragTimer = setTimeout(() => {
      externalChuteDragItem = null;
      externalChuteDragTimer = null;
    }, 15000);
  }

  function clearExternalChuteDrag() {
    externalChuteDragItem = null;
    if (externalChuteDragTimer) {
      clearTimeout(externalChuteDragTimer);
      externalChuteDragTimer = null;
    }
  }

  async function deliverChuteFile(target, item) {
    if (deliveringChuteFile || !(target instanceof Element)) return;
    deliveringChuteFile = true;
    try {
      const response = await fetch(`${BASE_URL}/api/files/${encodeURIComponent(item.id)}`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Chute returned ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], item.name, {
        type: item.mime || blob.type || "application/octet-stream",
        lastModified: Date.now()
      });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      transfer.effectAllowed = "copy";

      const input = target.matches('input[type="file"]')
        ? target
        : target.closest("label")?.querySelector('input[type="file"]');
      if (input) {
        input.files = transfer.files;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      const options = { bubbles: true, cancelable: true, dataTransfer: transfer };
      target.dispatchEvent(new DragEvent("dragenter", options));
      target.dispatchEvent(new DragEvent("dragover", options));
      target.dispatchEvent(new DragEvent("drop", options));
    } catch (error) {
      console.error("Chute could not deliver dragged file:", error);
    } finally {
      deliveringChuteFile = false;
      clearExternalChuteDrag();
    }
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
    beginDragRouting();
  }, true);

  document.addEventListener("dragover", (event) => {
    if (deliveringChuteFile) return;
    if (!dragRouting) beginDragRouting();

    const chuteItem = chuteTokenFromTransfer(event.dataTransfer) || externalChuteDragItem;
    const overChute = pointInLandingZone(event.clientX, event.clientY);
    const imageDrag = transferHasImage(event.dataTransfer);
    setDropActive(overChute, imageDrag);

    if (chuteItem && !overChute) {
      event.preventDefault();
      // ChatGPT needs to observe the browser's trusted dragover/drop pair so
      // its full-page "Drop anything" state can terminate normally. Chute's
      // private token is not exposed as text/plain, so propagation is safe.
      if (!preserveNativeDropLifecycle()) event.stopPropagation();
      try { event.dataTransfer.dropEffect = "copy"; } catch {}
      return;
    }

    if (!overChute) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.dataTransfer.dropEffect = "copy"; } catch {}
  }, true);

  document.addEventListener("drop", (event) => {
    if (deliveringChuteFile) return;

    const chuteItem = chuteTokenFromTransfer(event.dataTransfer) || externalChuteDragItem;
    const overChute = pointInLandingZone(event.clientX, event.clientY);

    if (chuteItem && !overChute) {
      event.preventDefault();
      if (!preserveNativeDropLifecycle()) event.stopImmediatePropagation();
      const target = event.target;
      endDragRouting();
      deliverChuteFile(target, chuteItem);
      return;
    }

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

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "chute-drag-out-start") {
      rememberExternalChuteDrag(message.file);
      beginDragRouting();
    }
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