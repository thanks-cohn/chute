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

  let pointerOver = false;
  let customImages = {};
  let imageLoadToken = 0;

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

  function currentState() {
    if (bin.classList.contains("dragover")) return "grab";
    if (pointerOver) return "hover";
    return "default";
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
    const src = customImages[IMAGE_KEYS[state]] || BUNDLED[state];
    const token = ++imageLoadToken;
    const probe = new Image();
    probe.onload = () => {
      if (token !== imageLoadToken) return;
      image.src = src;
      image.style.display = "block";
      setFallbackArtVisible(false);
    };
    probe.onerror = () => {
      if (token !== imageLoadToken) return;
      image.removeAttribute("src");
      image.style.display = "none";
      setFallbackArtVisible(true);
    };
    probe.src = src;
  }

  async function loadTheme() {
    customImages = await chrome.storage.local.get(Object.values(IMAGE_KEYS));
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

  new MutationObserver(() => showState()).observe(bin, {
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
