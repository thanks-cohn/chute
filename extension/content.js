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

  function setActive(next) {
    if (active === next) return;
    active = next;
    host.style.width = next ? "116px" : "92px";
    host.style.height = next ? "132px" : "104px";
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

  chrome.storage.sync.get({ chuteBinVisible: true }, ({ chuteBinVisible }) => {
    host.style.display = chuteBinVisible ? "block" : "none";
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.chuteBinVisible) {
      host.style.display = changes.chuteBinVisible.newValue ? "block" : "none";
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
