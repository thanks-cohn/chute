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

  const HOLDING_DIRECTORY = "assets/grab/holding";
  const HOLDING_EXTENSIONS = ["png", "webp", "gif"];
  const MAX_HOLDING_FRAMES = 32;

  let pointerOver = false;
  let customImages = {};
  let imageLoadToken = 0;
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

  async function discoverHoldingFrames() {
    const found = [];

    // Runtime extension pages cannot enumerate packaged directories directly.
    // Numbered files give us a drop-in deck: 1.png, 2.png, 3.png ...
    // Discovery stops at the first missing number, so keep numbering contiguous.
    for (let index = 1; index <= MAX_HOLDING_FRAMES; index += 1) {
      let frame = null;
      for (const extension of HOLDING_EXTENSIONS) {
        const src = chrome.runtime.getURL(`${HOLDING_DIRECTORY}/${index}.${extension}`);
        if (await probeImage(src)) {
          frame = src;
          break;
        }
      }
      if (!frame) break;
      found.push(frame);
    }

    holdingFrames = found;
  }

  function currentState() {
    if (holdingActive && bin.classList.contains("dragover") && holdingFrames.length) {
      return { kind: "holding", src: holdingFrames[Math.max(0, holdingIndex)] };
    }
    if (bin.classList.contains("dragover")) return { kind: "grab", src: customImages[IMAGE_KEYS.grab] || BUNDLED.grab };
    if (pointerOver) return { kind: "hover", src: customImages[IMAGE_KEYS.hover] || BUNDLED.hover };
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

      // A holding frame is optional. If one disappears, fall straight back to
      // grab.png instead of flashing the legacy CSS mascot mid-drag.
      if (state.kind === "holding") {
        endHolding();
        showState();
        return;
      }

      image.removeAttribute("src");
      image.style.display = "none";
      setFallbackArtVisible(true);
    };

    probe.src = state.src;
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

  function chooseDifferentHoldingIndex() {
    if (holdingFrames.length <= 1) return 0;

    let next = holdingIndex;
    while (next === holdingIndex) {
      next = Math.floor(Math.random() * holdingFrames.length);
    }
    return next;
  }

  function scheduleHoldingSwap() {
    clearHoldingSwapTimer();
    if (!holdingActive || !bin.classList.contains("dragover") || !holdingFrames.length) return;

    // Irregular timing keeps the expression deck from feeling like a tiny GIF.
    holdingSwapTimer = setTimeout(() => {
      holdingSwapTimer = null;
      if (!holdingActive || !bin.classList.contains("dragover")) return;
      holdingIndex = chooseDifferentHoldingIndex();
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
      beginHoldingCountdown();
      return;
    }
    endHolding();
  }

  async function loadTheme() {
    const [local] = await Promise.all([
      chrome.storage.local.get(Object.values(IMAGE_KEYS)),
      discoverHoldingFrames()
    ]);
    customImages = local || {};
    syncHoldingState();
    showState();
  }

  bin.addEventListener("pointerenter", () => {
    pointerOver = true;
    showState();
  });

  bin.addEventListener("pointerleave", () => {
    pointerOver = false;
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
    if (changed) showState();
  });

  loadTheme();
})();
