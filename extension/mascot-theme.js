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

  const DECK_EXTENSIONS = ["png", "webp", "gif"];
  const MAX_DECK_FRAMES = 32;
  const DECK_DIRECTORIES = {
    hover: "assets/grab/hover",
    holding: "assets/grab/holding"
  };

  let pointerOver = false;
  let customImages = {};
  let imageLoadToken = 0;

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

  // The legacy CSS mascot keeps the count badge inside its .paper body. Move
  // the badge out once so image-backed Chutey can replace the ENTIRE old body
  // without losing the live count. bin.js keeps its existing node reference.
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

    // Extension pages cannot enumerate packaged directories directly. Numbered
    // assets provide a drop-in deck: 1.png, 2.png, 3.png ... Keep numbering
    // contiguous because discovery stops at the first missing number.
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
    while (next === currentIndex) {
      next = Math.floor(Math.random() * frames.length);
    }
    return next;
  }

  function currentState() {
    if (holdingActive && bin.classList.contains("dragover") && holdingFrames.length) {
      return { kind: "holding", src: holdingFrames[Math.max(0, holdingIndex)] };
    }

    if (bin.classList.contains("dragover")) {
      return { kind: "grab", src: customImages[IMAGE_KEYS.grab] || BUNDLED.grab };
    }

    if (pointerOver) {
      if (customImages[IMAGE_KEYS.hover]) {
        return { kind: "hover", src: customImages[IMAGE_KEYS.hover] };
      }
      if (hoverFrames.length) {
        return { kind: "hover-deck", src: hoverFrames[Math.max(0, hoverIndex)] };
      }
      return { kind: "hover", src: BUNDLED.hover };
    }

    return { kind: "default", src: customImages[IMAGE_KEYS.default] || BUNDLED.default };
  }

  function setFallbackArtVisible(visible) {
    // .paper IS the old yellow Chutey body. Hide it as one unit instead of
    // hiding only its face/label, otherwise the PNG gets superimposed on top.
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

      image.removeAttribute("src");
      image.style.display = "none";
      setFallbackArtVisible(true);
    };

    probe.src = state.src;
  }

  function clearHoverSwapTimer() {
    if (!hoverSwapTimer) return;
    clearTimeout(hoverSwapTimer);
    hoverSwapTimer = null;
  }

  function scheduleHoverSwap() {
    clearHoverSwapTimer();
    if (!pointerOver || bin.classList.contains("dragover") || !hoverFrames.length) return;
    if (customImages[IMAGE_KEYS.hover]) return;

    hoverSwapTimer = setTimeout(() => {
      hoverSwapTimer = null;
      if (!pointerOver || bin.classList.contains("dragover") || !hoverFrames.length) return;
      hoverIndex = chooseDifferentIndex(hoverFrames, hoverIndex);
      showState();
      scheduleHoverSwap();
    }, randomBetween(800, 2200));
  }

  function beginHoverDeck() {
    if (!pointerOver || bin.classList.contains("dragover") || !hoverFrames.length) return;
    if (customImages[IMAGE_KEYS.hover]) return;
    hoverIndex = Math.floor(Math.random() * hoverFrames.length);
    showState();
    scheduleHoverSwap();
  }

  function endHoverDeck() {
    clearHoverSwapTimer();
    hoverIndex = -1;
  }

  function clearHoldingStartTimer() {
    if (!holdingStartTimer) return;
    clearTimeout(holdingStartTimer);
    holdingStartTimer = null;
  }

  function clearHoldingSwapTimer() {
    if (!holdingSwapTimer) return;
    clearTimeout(holdingSwapTimer);
    holdingSwapTimer = null;
  }

  function scheduleHoldingSwap() {
    clearHoldingSwapTimer();
    if (!holdingActive || !bin.classList.contains("dragover") || !holdingFrames.length) return;

    holdingSwapTimer = setTimeout(() => {
      holdingSwapTimer = null;
      if (!holdingActive || !bin.classList.contains("dragover")) return;
      holdingIndex = chooseDifferentIndex(holdingFrames, holdingIndex);
      showState();
      scheduleHoldingSwap();
    }, randomBetween(650, 1800));
  }

  function beginHoldingCountdown() {
    if (!holdingFrames.length || holdingStartTimer || holdingActive || !bin.classList.contains("dragover")) return;

    holdingStartTimer = setTimeout(() => {
      holdingStartTimer = null;
      if (!bin.classList.contains("dragover") || !holdingFrames.length) return;

      holdingActive = true;
      holdingIndex = Math.floor(Math.random() * holdingFrames.length);
      showState();
      scheduleHoldingSwap();
    }, randomBetween(2000, 3000));
  }

  function endHolding() {
    clearHoldingStartTimer();
    clearHoldingSwapTimer();
    holdingActive = false;
    holdingIndex = -1;
  }

  function syncHoldingState() {
    if (bin.classList.contains("dragover")) {
      endHoverDeck();
      beginHoldingCountdown();
      return;
    }

    endHolding();
    if (pointerOver) beginHoverDeck();
  }

  async function loadTheme() {
    const [local, discoveredHover, discoveredHolding] = await Promise.all([
      chrome.storage.local.get(Object.values(IMAGE_KEYS)),
      discoverDeck(DECK_DIRECTORIES.hover),
      discoverDeck(DECK_DIRECTORIES.holding)
    ]);

    customImages = local || {};
    hoverFrames = discoveredHover;
    holdingFrames = discoveredHolding;

    syncHoldingState();
    if (pointerOver && !bin.classList.contains("dragover")) beginHoverDeck();
    else showState();
  }

  bin.addEventListener("pointerenter", () => {
    pointerOver = true;
    beginHoverDeck();
    showState();
  });

  bin.addEventListener("pointerleave", () => {
    pointerOver = false;
    endHoverDeck();
    showState();
  });

  new MutationObserver(() => {
    syncHoldingState();
    showState();
  }).observe(bin, {
    attributes: true,
    attributeFilter: ["class"]
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    for (const key of Object.values(IMAGE_KEYS)) {
      if (!changes[key]) continue;
      customImages[key] = changes[key].newValue;
      changed = true;
    }
    if (changed) {
      if (pointerOver && !bin.classList.contains("dragover")) beginHoverDeck();
      showState();
    }
  });

  loadTheme();
})();
