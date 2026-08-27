(() => {
  const bin = document.querySelector("#bin");
  if (!bin) return;

  const IMAGE_KEYS = {
    default: "chuteMascotImageDefault",
    hover: "chuteMascotImageHover",
    grab: "chuteMascotImageGrab"
  };
  const BUNDLED = {
    default: chrome.runtime.getURL("assets/grab/default.png"),
    hover: chrome.runtime.getURL("assets/grab/hover.png"),
    grab: chrome.runtime.getURL("assets/grab/grab.png")
  };
  const TIMING_DEFAULTS = {
    chuteDefaultSwapMinutes: 5,
    chuteHoverSwapSeconds: 1.4,
    chuteHoldingDelaySeconds: 2.5,
    chuteHoldingSwapSeconds: 1.2
  };

  const DECK_EXTENSIONS = ["png", "webp", "gif"];
  const MAX_DECK_FRAMES = 32;
  const DECK_DIRECTORIES = {
    default: "assets/grab/default",
    hover: "assets/grab/hover",
    holding: "assets/grab/holding"
  };

  let pointerOver = false;
  let dragActive = false;
  let customImages = {};
  let timings = { ...TIMING_DEFAULTS };
  let imageLoadToken = 0;

  let defaultFrames = [];
  let defaultIndex = -1;
  let defaultSwapTimer = null;

  let hoverFrames = [];
  let hoverIndex = -1;
  let hoverSwapTimer = null;

  let holdingFrames = [];
  let holdingActive = false;
  let holdingIndex = -1;
  let holdingStartTimer = null;
  let holdingSwapTimer = null;

  const image = document.createElement("img");
  image.id = "chute-mascot-image";
  image.alt = "";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  Object.assign(image.style, {
    position: "absolute",
    inset: "0",
    zIndex: "10",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserDrag: "none",
    display: "none"
  });
  bin.append(image);

  const count = bin.querySelector(".count");
  if (count) {
    bin.append(count);
    Object.assign(count.style, {
      position: "absolute",
      zIndex: "12",
      top: "0px",
      right: "0px"
    });
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomizedAround(seconds, spread = 0.35) {
    const center = Math.max(0.1, Number(seconds) || 0.1);
    return randomBetween(center * (1 - spread), center * (1 + spread)) * 1000;
  }

  function probeImage(src) {
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = src;
    });
  }

  async function discoverDeck(directory) {
    const found = [];
    for (let index = 1; index <= MAX_DECK_FRAMES; index += 1) {
      let frame = null;
      for (const extension of DECK_EXTENSIONS) {
        const src = chrome.runtime.getURL(`${directory}/${index}.${extension}`);
        if (await probeImage(src)) {
          frame = src;
          break;
        }
      }
      if (!frame) break;
      found.push(frame);
    }
    return found;
  }

  function chooseDifferentIndex(frames, currentIndex) {
    if (frames.length <= 1) return 0;
    let next = currentIndex;
    while (next === currentIndex) next = Math.floor(Math.random() * frames.length);
    return next;
  }

  function currentState() {
    if (bin.classList.contains("dragover")) {
      return { kind: "grab", src: customImages[IMAGE_KEYS.grab] || BUNDLED.grab };
    }
    if (holdingActive && dragActive && holdingFrames.length) {
      return { kind: "holding", src: holdingFrames[Math.max(0, holdingIndex)] };
    }
    if (pointerOver && !dragActive) {
      if (customImages[IMAGE_KEYS.hover]) return { kind: "hover", src: customImages[IMAGE_KEYS.hover] };
      if (hoverFrames.length) return { kind: "hover-deck", src: hoverFrames[Math.max(0, hoverIndex)] };
      return { kind: "hover", src: BUNDLED.hover };
    }
    if (customImages[IMAGE_KEYS.default]) return { kind: "default", src: customImages[IMAGE_KEYS.default] };
    if (defaultFrames.length) return { kind: "default-deck", src: defaultFrames[Math.max(0, defaultIndex)] };
    return { kind: "default", src: BUNDLED.default };
  }

  function setFallbackArtVisible(visible) {
    for (const selector of [".tape", ".paper", ".mouth"]) {
      const node = bin.querySelector(selector);
      if (node) {
        node.style.opacity = visible ? "" : "0";
        node.style.visibility = visible ? "" : "hidden";
      }
    }
  }

  function showState() {
    const state = currentState();
    const token = ++imageLoadToken;
    const probe = new Image();
    probe.onload = () => {
      if (token !== imageLoadToken) return;
      image.src = state.src;
      image.style.display = "block";
      setFallbackArtVisible(false);
    };
    probe.onerror = () => {
      if (token !== imageLoadToken) return;
      if (state.kind === "holding") {
        endHolding();
        showState();
        return;
      }
      if (state.kind === "hover-deck") {
        endHoverDeck();
        showState();
        return;
      }
      if (state.kind === "default-deck") {
        defaultFrames = [];
        defaultIndex = -1;
        showState();
        return;
      }
      image.removeAttribute("src");
      image.style.display = "none";
      setFallbackArtVisible(true);
    };
    probe.src = state.src;
  }

  function clearDefaultSwapTimer() {
    if (defaultSwapTimer) clearTimeout(defaultSwapTimer);
    defaultSwapTimer = null;
  }

  function scheduleDefaultSwap() {
    clearDefaultSwapTimer();
    if (customImages[IMAGE_KEYS.default] || defaultFrames.length < 2) return;
    const minutes = Math.max(0.1, Number(timings.chuteDefaultSwapMinutes) || TIMING_DEFAULTS.chuteDefaultSwapMinutes);
    defaultSwapTimer = setTimeout(() => {
      defaultSwapTimer = null;
      defaultIndex = chooseDifferentIndex(defaultFrames, defaultIndex);
      if (!pointerOver && !dragActive && !bin.classList.contains("dragover")) showState();
      scheduleDefaultSwap();
    }, minutes * 60 * 1000);
  }

  function changeDefaultNow() {
    if (customImages[IMAGE_KEYS.default] || defaultFrames.length < 2) return false;
    defaultIndex = chooseDifferentIndex(defaultFrames, defaultIndex);
    if (!pointerOver && !dragActive && !bin.classList.contains("dragover")) showState();
    scheduleDefaultSwap();
    return true;
  }

  function clearHoverSwapTimer() {
    if (hoverSwapTimer) clearTimeout(hoverSwapTimer);
    hoverSwapTimer = null;
  }

  function scheduleHoverSwap() {
    clearHoverSwapTimer();
    if (!pointerOver || dragActive || bin.classList.contains("dragover") || !hoverFrames.length) return;
    if (customImages[IMAGE_KEYS.hover]) return;
    hoverSwapTimer = setTimeout(() => {
      hoverSwapTimer = null;
      if (!pointerOver || dragActive || bin.classList.contains("dragover") || !hoverFrames.length) return;
      hoverIndex = chooseDifferentIndex(hoverFrames, hoverIndex);
      showState();
      scheduleHoverSwap();
    }, randomizedAround(timings.chuteHoverSwapSeconds));
  }

  function beginHoverDeck() {
    if (!pointerOver || dragActive || bin.classList.contains("dragover") || !hoverFrames.length) return;
    if (customImages[IMAGE_KEYS.hover]) return;
    if (hoverIndex < 0) hoverIndex = Math.floor(Math.random() * hoverFrames.length);
    showState();
    scheduleHoverSwap();
  }

  function endHoverDeck() {
    clearHoverSwapTimer();
    hoverIndex = -1;
  }

  function clearHoldingStartTimer() {
    if (holdingStartTimer) clearTimeout(holdingStartTimer);
    holdingStartTimer = null;
  }

  function clearHoldingSwapTimer() {
    if (holdingSwapTimer) clearTimeout(holdingSwapTimer);
    holdingSwapTimer = null;
  }

  function scheduleHoldingSwap() {
    clearHoldingSwapTimer();
    if (!holdingActive || !dragActive || bin.classList.contains("dragover") || !holdingFrames.length) return;
    holdingSwapTimer = setTimeout(() => {
      holdingSwapTimer = null;
      if (!holdingActive || !dragActive || bin.classList.contains("dragover")) return;
      holdingIndex = chooseDifferentIndex(holdingFrames, holdingIndex);
      showState();
      scheduleHoldingSwap();
    }, randomizedAround(timings.chuteHoldingSwapSeconds));
  }

  function beginHoldingCountdown() {
    if (!dragActive || !holdingFrames.length || holdingStartTimer || holdingActive) return;
    holdingStartTimer = setTimeout(() => {
      holdingStartTimer = null;
      if (!dragActive || !holdingFrames.length) return;
      holdingActive = true;
      endHoverDeck();
      holdingIndex = Math.floor(Math.random() * holdingFrames.length);
      showState();
      if (!bin.classList.contains("dragover")) scheduleHoldingSwap();
    }, randomizedAround(timings.chuteHoldingDelaySeconds, 0.2));
  }

  function endHolding() {
    clearHoldingStartTimer();
    clearHoldingSwapTimer();
    holdingActive = false;
    holdingIndex = -1;
  }

  function syncPointerState() {
    if (dragActive) {
      endHoverDeck();
      return;
    }
    if (pointerOver) beginHoverDeck();
    else endHoverDeck();
  }

  function setGlobalDragActive(next) {
    const active = Boolean(next);
    if (dragActive === active) return;
    dragActive = active;
    if (dragActive) {
      endHoverDeck();
      beginHoldingCountdown();
    } else {
      endHolding();
      syncPointerState();
    }
    showState();
  }

  async function loadTheme() {
    const [local, sync, discoveredDefault, discoveredHover, discoveredHolding] = await Promise.all([
      chrome.storage.local.get(Object.values(IMAGE_KEYS)),
      chrome.storage.sync.get(TIMING_DEFAULTS),
      discoverDeck(DECK_DIRECTORIES.default),
      discoverDeck(DECK_DIRECTORIES.hover),
      discoverDeck(DECK_DIRECTORIES.holding)
    ]);
    customImages = local || {};
    timings = { ...TIMING_DEFAULTS, ...(sync || {}) };
    defaultFrames = discoveredDefault;
    hoverFrames = discoveredHover;
    holdingFrames = discoveredHolding;
    if (defaultFrames.length) defaultIndex = Math.floor(Math.random() * defaultFrames.length);
    scheduleDefaultSwap();
    syncPointerState();
    if (dragActive) beginHoldingCountdown();
    showState();
  }

  bin.addEventListener("pointerenter", () => {
    pointerOver = true;
    syncPointerState();
    showState();
  });

  bin.addEventListener("pointerleave", () => {
    pointerOver = false;
    endHoverDeck();
    showState();
  });

  bin.addEventListener("click", () => {
    changeDefaultNow();
  });

  new MutationObserver(() => {
    if (bin.classList.contains("dragover")) {
      clearHoldingSwapTimer();
    } else if (holdingActive && dragActive) {
      showState();
      scheduleHoldingSwap();
    }
    showState();
  }).observe(bin, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type === "chute-page-drag-active") {
      setGlobalDragActive(event.data.active);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      let changed = false;
      for (const key of Object.values(IMAGE_KEYS)) {
        if (!changes[key]) continue;
        customImages[key] = changes[key].newValue;
        changed = true;
      }
      if (changed) {
        scheduleDefaultSwap();
        syncPointerState();
        showState();
      }
      return;
    }

    if (area === "sync") {
      let timingChanged = false;
      for (const key of Object.keys(TIMING_DEFAULTS)) {
        if (!changes[key]) continue;
        timings[key] = changes[key].newValue ?? TIMING_DEFAULTS[key];
        timingChanged = true;
      }
      if (timingChanged) {
        scheduleDefaultSwap();
        if (pointerOver && !dragActive) scheduleHoverSwap();
        if (dragActive && !holdingActive) {
          clearHoldingStartTimer();
          beginHoldingCountdown();
        } else if (holdingActive && !bin.classList.contains("dragover")) {
          scheduleHoldingSwap();
        }
      }
    }
  });

  loadTheme();
})();
