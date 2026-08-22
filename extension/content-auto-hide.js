(() => {
  if (window.top !== window) return;

  const HOST_ID = "__chute_sticky_host";
  const INITIAL_VISIBLE_MS = 10000;
  const LEAVE_HIDE_DELAY_MS = 700;
  const DRAG_HIDE_DELAY_MS = 1200;
  const EDGE_TRIGGER_WIDTH = 32;
  const EDGE_TRIGGER_HEIGHT = 150;
  const HIDDEN_TRANSFORM = "translateX(calc(100% + 8px))";

  let host = null;
  let autoHide = true;
  let accessMode = "floating";
  let hidden = false;
  let hostHovered = false;
  let supportActive = false;
  let dragActive = false;
  let hideTimer = null;
  let initialTimer = null;

  function floatingEnabled(mode) {
    return mode === "floating" || mode === "both";
  }

  function clearHideTimer() {
    if (!hideTimer) return;
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function clearInitialTimer() {
    if (!initialTimer) return;
    clearTimeout(initialTimer);
    initialTimer = null;
  }

  function canHide() {
    return Boolean(
      host &&
      autoHide &&
      floatingEnabled(accessMode) &&
      !hostHovered &&
      !supportActive &&
      !dragActive
    );
  }

  function reveal() {
    if (!host) return;
    clearHideTimer();
    hidden = false;
    host.style.transform = "translateX(0)";
  }

  function hide() {
    if (!canHide()) return;
    hidden = true;
    host.style.transform = HIDDEN_TRANSFORM;
  }

  function scheduleHide(delay = LEAVE_HIDE_DELAY_MS) {
    clearHideTimer();
    if (!canHide()) return;
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hide();
    }, delay);
  }

  function beginInitialWindow() {
    clearInitialTimer();
    reveal();
    if (!autoHide || !floatingEnabled(accessMode)) return;
    initialTimer = setTimeout(() => {
      initialTimer = null;
      scheduleHide(0);
    }, INITIAL_VISIBLE_MS);
  }

  function nearRevealZone(x, y) {
    return x >= window.innerWidth - EDGE_TRIGGER_WIDTH &&
      y >= window.innerHeight - EDGE_TRIGGER_HEIGHT;
  }

  function applyPolicy({ freshWindow = false } = {}) {
    if (!host) return;
    if (!floatingEnabled(accessMode)) {
      clearHideTimer();
      clearInitialTimer();
      reveal();
      return;
    }
    if (!autoHide) {
      clearHideTimer();
      clearInitialTimer();
      reveal();
      return;
    }
    if (freshWindow) {
      beginInitialWindow();
      return;
    }
    scheduleHide();
  }

  function attachHost(nextHost) {
    if (!nextHost || host === nextHost) return;
    host = nextHost;
    host.style.transition = "transform 180ms cubic-bezier(.2,.8,.2,1)";
    host.style.willChange = "transform";

    host.addEventListener("mouseenter", () => {
      hostHovered = true;
      reveal();
    });

    host.addEventListener("mouseleave", () => {
      hostHovered = false;
      scheduleHide();
    });

    applyPolicy({ freshWindow: true });
  }

  function findHost() {
    attachHost(document.getElementById(HOST_ID));
  }

  document.addEventListener("mousemove", (event) => {
    if (!host || !autoHide || !floatingEnabled(accessMode) || !hidden) return;
    if (nearRevealZone(event.clientX, event.clientY)) reveal();
  }, true);

  document.addEventListener("dragstart", () => {
    dragActive = true;
    clearHideTimer();
  }, true);

  document.addEventListener("dragenter", () => {
    dragActive = true;
    clearHideTimer();
  }, true);

  document.addEventListener("dragover", (event) => {
    if (!host || !autoHide || !floatingEnabled(accessMode)) return;
    dragActive = true;
    clearHideTimer();
    if (hidden && nearRevealZone(event.clientX, event.clientY)) reveal();
  }, true);

  function finishDrag() {
    dragActive = false;
    scheduleHide(DRAG_HIDE_DELAY_MS);
  }

  document.addEventListener("drop", finishDrag, true);
  document.addEventListener("dragend", finishDrag, true);

  window.addEventListener("message", (event) => {
    if (!host) return;
    if (event.source !== host.querySelector?.("iframe")?.contentWindow && event.data?.type !== "chute-support-hover") {
      // The host uses a closed shadow root, so the iframe cannot be queried here.
      // The message type is specific to Chute and is sufficient for this small UI state.
    }
    if (event.data?.type !== "chute-support-hover") return;
    supportActive = Boolean(event.data.active);
    if (supportActive) reveal();
    else scheduleHide();
  });

  chrome.storage.sync.get({
    chuteAutoHide: true,
    chuteAccessMode: null,
    chuteBinVisible: true
  }, ({ chuteAutoHide, chuteAccessMode, chuteBinVisible }) => {
    autoHide = chuteAutoHide !== false;
    accessMode = chuteAccessMode || (chuteBinVisible ? "floating" : "context");
    findHost();
    applyPolicy({ freshWindow: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    let freshWindow = false;
    if (changes.chuteAutoHide) {
      autoHide = changes.chuteAutoHide.newValue !== false;
      freshWindow = autoHide;
    }
    if (changes.chuteAccessMode) {
      accessMode = changes.chuteAccessMode.newValue || "floating";
      freshWindow = floatingEnabled(accessMode);
    } else if (changes.chuteBinVisible) {
      accessMode = changes.chuteBinVisible.newValue ? "floating" : "context";
      freshWindow = floatingEnabled(accessMode);
    }

    applyPolicy({ freshWindow });
  });

  findHost();
  if (!host) {
    const observer = new MutationObserver(() => {
      findHost();
      if (host) observer.disconnect();
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
  }
})();
