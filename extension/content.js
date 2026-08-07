(() => {
  if (window.top !== window || document.getElementById("__chute_sticky_host")) return;

  const FRONT_Z_INDEX = "2147483647";
  const BACK_Z_INDEX = "0";

  const host = document.createElement("div");
  host.id = "__chute_sticky_host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    right: "18px",
    bottom: "18px",
    width: "116px",
    height: "132px",
    margin: "0",
    padding: "0",
    border: "0",
    zIndex: FRONT_Z_INDEX,
    pointerEvents: "auto",
    transition: "width 140ms ease, height 140ms ease, transform 140ms ease",
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

  let dragDepth = 0;
  let active = false;
  let layerMode = "front";

  function postLayerState() {
    frame.contentWindow?.postMessage({ type: "chute-layer-state", mode: layerMode }, "*");
  }

  function applyLayer(next, persist = false) {
    layerMode = next === "back" ? "back" : "front";
    host.style.zIndex = layerMode === "back" ? BACK_Z_INDEX : FRONT_Z_INDEX;
    postLayerState();
    if (persist) chrome.storage.sync.set({ chuteBinLayer: layerMode });
  }

  function setActive(next) {
    if (active === next) return;
    active = next;
    host.style.width = next ? "132px" : "116px";
    host.style.height = next ? "154px" : "132px";
    host.style.transform = next ? "translate(-4px, -4px) rotate(-1deg)" : "none";
    frame.contentWindow?.postMessage({ type: "chute-drag-active", active: next }, "*");
  }

  document.addEventListener("dragenter", () => {
    dragDepth += 1;
    setActive(true);
  }, true);

  document.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setActive(false);
  }, true);

  document.addEventListener("drop", () => {
    dragDepth = 0;
    setActive(false);
  }, true);

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;

    if (event.data?.type === "chute-open-side-panel") {
      chrome.runtime.sendMessage({ type: "open-side-panel" });
    }
    if (event.data?.type === "chute-set-layer") {
      applyLayer(event.data.mode, true);
    }
    if (event.data?.type === "chute-request-layer") {
      postLayerState();
    }
  });

  chrome.storage.sync.get({ chuteBinVisible: true, chuteBinLayer: "front" }, ({ chuteBinVisible, chuteBinLayer }) => {
    host.style.display = chuteBinVisible ? "block" : "none";
    applyLayer(chuteBinLayer);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.chuteBinVisible) {
      host.style.display = changes.chuteBinVisible.newValue ? "block" : "none";
    }
    if (changes.chuteBinLayer) {
      applyLayer(changes.chuteBinLayer.newValue);
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
