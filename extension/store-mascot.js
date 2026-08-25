(() => {
  if (window.top !== window || document.getElementById("__chute_store_mascot")) return;

  const MAX_BYTES = 48 * 1024 * 1024;
  let busy = false;
  let visible = true;
  let feedbackTimer = null;

  const host = document.createElement("div");
  host.id = "__chute_store_mascot";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    right: "18px",
    bottom: "18px",
    width: "92px",
    height: "104px",
    zIndex: "2147483647",
    pointerEvents: "auto",
    isolation: "isolate"
  });

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}button{font:inherit}
      .bin{position:absolute;right:6px;bottom:8px;width:78px;height:88px;padding:0;border:0;background:transparent;cursor:copy;filter:drop-shadow(0 5px 5px rgba(0,0,0,.24));transform:rotate(1.5deg);transform-origin:bottom right;transition:transform 110ms ease,filter 110ms ease}
      .paper{position:absolute;inset:11px 5px 4px;display:grid;align-content:center;justify-items:center;gap:3px;border:1px solid #d3b63f;border-radius:5px 5px 10px 10px;background:linear-gradient(rgba(235,210,94,.23) 1px,transparent 1px) 0 21px/100% 15px,#ffe87a;box-shadow:inset 0 -8px 0 rgba(215,181,43,.16);color:#4a3a13;font-family:"Trebuchet MS",ui-rounded,system-ui,sans-serif}
      .tape{position:absolute;z-index:3;top:2px;left:20px;width:39px;height:16px;background:rgba(235,225,184,.88);border:1px solid rgba(177,158,96,.45);transform:rotate(-4deg);clip-path:polygon(3% 12%,95% 0,100% 88%,7% 100%)}
      .mouth{position:absolute;z-index:4;left:13px;right:13px;top:12px;height:13px;border:2px solid #4b3a13;border-top-width:4px;border-radius:50%;background:#241b0b;box-shadow:inset 0 3px 0 rgba(255,255,255,.12)}
      .face{margin-top:10px;font-size:18px;font-weight:900;letter-spacing:1px}.label{font-size:10px;font-weight:900;letter-spacing:.12em}.count{min-width:21px;height:21px;padding:2px 5px;border-radius:999px;background:#4a3a13;color:#fff8c6;font-size:11px;font-weight:900;line-height:17px}
      .bin.dragover{transform:rotate(-1deg) scale(1.035);filter:drop-shadow(0 7px 7px rgba(0,0,0,.28))}.bin.dragover .paper{background-color:#fff19b}.bin.dragover .mouth{height:18px;top:8px}.bin.dragover .label{font-size:0}.bin.dragover .label::after{content:"DROP!";font-size:11px}
      .bin.success{animation:happy 360ms ease}.bin.failure{animation:nope 300ms ease}@keyframes happy{0%,100%{transform:rotate(1.5deg) scale(1)}50%{transform:rotate(-2deg) scale(1.045)}}@keyframes nope{0%,100%{transform:translateX(0) rotate(1.5deg)}35%{transform:translateX(-2px) rotate(0deg)}70%{transform:translateX(2px) rotate(2deg)}}
    </style>
    <button class="bin" type="button" aria-label="Drop files into Chute" title="Drop files here to send them to Chute">
      <span class="tape"></span><span class="paper"><span class="face">•ᴗ•</span><span class="label">CHUTE</span><span class="count" hidden></span></span><span class="mouth"></span>
    </button>`;

  const bin = shadow.querySelector(".bin");
  const face = shadow.querySelector(".face");
  const label = shadow.querySelector(".label");
  const count = shadow.querySelector(".count");

  function renderVisibility() { host.style.display = visible ? "block" : "none"; }
  function animate(kind) {
    bin.classList.remove("success", "failure");
    void bin.offsetWidth;
    bin.classList.add(kind);
    setTimeout(() => bin.classList.remove(kind), 420);
  }
  function feedback(ok) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    animate(ok ? "success" : "failure");
    face.textContent = ok ? "^ ^" : "×︵×";
    label.textContent = ok ? "YUMMY" : "NOPE";
    feedbackTimer = setTimeout(() => {
      feedbackTimer = null;
      face.textContent = "•ᴗ•";
      label.textContent = "CHUTE";
    }, 850);
  }

  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
  }

  async function refreshCount() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "chute-shelf-count-v2" });
      const total = Number(result?.count || 0);
      count.hidden = total <= 0;
      count.textContent = total > 99 ? "99+" : String(total);
    } catch {}
  }

  async function storeFile(file) {
    if (!(file instanceof File) || !file.size) return false;
    if (file.size > MAX_BYTES) throw new Error("File is larger than Chute's 48 MB browser shelf limit.");
    const result = await chrome.runtime.sendMessage({
      type: "chute-store-file-v2",
      file: {
        name: file.name,
        type: file.type || "application/octet-stream",
        lastModified: file.lastModified,
        base64: bytesToBase64(await file.arrayBuffer()),
        source: "mascot-drop",
        parentPageUrl: location.href
      }
    });
    return Boolean(result?.ok);
  }

  async function consumeDrop(event) {
    if (busy) return;
    busy = true;
    try {
      const files = Array.from(event.dataTransfer?.files || []).filter((file) => file instanceof File && file.size > 0);
      if (files.length) {
        let okay = true;
        for (const file of files) okay = (await storeFile(file)) && okay;
        if (!okay) throw new Error("One or more files could not be stored.");
      } else {
        const result = await chrome.runtime.sendMessage({ type: "chute-store-recent-drag-v2" });
        if (!result?.ok) throw new Error(result?.error || "Chute could not recover that image.");
      }
      feedback(true);
      await refreshCount();
    } catch (error) {
      console.warn("Chute mascot drop failed:", error);
      feedback(false);
    } finally {
      busy = false;
      bin.classList.remove("dragover");
    }
  }

  bin.addEventListener("dragenter", (event) => { event.preventDefault(); bin.classList.add("dragover"); });
  bin.addEventListener("dragover", (event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; bin.classList.add("dragover"); });
  bin.addEventListener("dragleave", (event) => { if (!bin.contains(event.relatedTarget)) bin.classList.remove("dragover"); });
  bin.addEventListener("drop", (event) => { event.preventDefault(); event.stopPropagation(); void consumeDrop(event); });
  bin.addEventListener("click", () => { void chrome.runtime.sendMessage({ type: "chute-open-side-panel-v2" }); });

  chrome.storage.local.get({ chuteMascotVisible: true }, (settings) => {
    visible = settings.chuteMascotVisible !== false;
    renderVisibility();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.chuteMascotVisible) {
      visible = changes.chuteMascotVisible.newValue !== false;
      renderVisibility();
    }
  });

  const mount = () => {
    const root = document.documentElement || document.body;
    if (root && !host.isConnected) root.append(host);
  };
  mount();
  if (document.documentElement) new MutationObserver(mount).observe(document.documentElement, { childList: true });
  void refreshCount();
  setInterval(refreshCount, 2500);
})();
