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

  function currentState() {
    if (bin.classList.contains("dragover")) return "grab";
    if (pointerOver) return "hover";
    return "default";
  }

  function setFallbackVisible(visible) {
    for (const selector of [".tape", ".paper", ".mouth"]) {
      const node = bin.querySelector(selector);
      if (node) node.style.opacity = visible ? "" : "0";
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
      setFallbackVisible(false);
    };
    probe.onerror = () => {
      if (token !== imageLoadToken) return;
      image.removeAttribute("src");
      image.style.display = "none";
      setFallbackVisible(true);
    };
    probe.src = src;
  }

  function applyColors({ chuteMascotBoxColor, chuteMascotTextColor }) {
    const box = chuteMascotBoxColor || "#ffe87a";
    const text = chuteMascotTextColor || "#4a3a13";
    const paper = bin.querySelector(".paper");
    const face = bin.querySelector(".face");
    const label = bin.querySelector(".label");
    const mouth = bin.querySelector(".mouth");
    if (paper) {
      paper.style.backgroundColor = box;
      paper.style.color = text;
      paper.style.borderColor = text;
    }
    if (face) face.style.color = text;
    if (label) label.style.color = text;
    if (mouth) {
      mouth.style.borderColor = text;
      mouth.style.backgroundColor = text;
    }
  }

  async function loadTheme() {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get(Object.values(IMAGE_KEYS)),
      chrome.storage.sync.get({
        chuteMascotBoxColor: "#ffe87a",
        chuteMascotTextColor: "#4a3a13"
      })
    ]);
    customImages = local || {};
    applyColors(sync);
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
    if (area === "local") {
      let changed = false;
      for (const key of Object.values(IMAGE_KEYS)) {
        if (!changes[key]) continue;
        customImages[key] = changes[key].newValue;
        changed = true;
      }
      if (changed) showState();
      return;
    }
    if (area === "sync" && (changes.chuteMascotBoxColor || changes.chuteMascotTextColor)) {
      chrome.storage.sync.get({
        chuteMascotBoxColor: "#ffe87a",
        chuteMascotTextColor: "#4a3a13"
      }).then(applyColors);
    }
  });

  loadTheme();
})();
