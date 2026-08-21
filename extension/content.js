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
    transition: "width 120ms ease, height 120ms ease",
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

  function floatingEnabled(mode) {
    return mode === "floating" || mode === "both";
  }

  function renderVisibility() {
    host.style.display = floatingEnabled(accessMode) ? "block" : "none";
  }

  function renderSize() {
    // The host may grow to make room for auxiliary UI, but the bin inside the
    // frame is bottom-right anchored, so the actual desktop-to-browser drop
    // target never changes position.
    host.style.width = supportHover ? "198px" : "92px";
    host.style.height = supportHover ? "174px" : "104px";
  }

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === "chute-open-side-panel") {
      chrome.runtime.sendMessage({ type: "open-side-panel" });
    }
    if (event.data?.type === "chute-support-hover") {
      supportHover = Boolean(event.data.active);
      renderSize();
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