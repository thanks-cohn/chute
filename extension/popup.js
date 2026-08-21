const POPUP_BASE_URL = "http://127.0.0.1:17891";
const openShelfButton = document.querySelector("#open-shelf");
const accessModeSelect = document.querySelector("#access-mode");
const dragOutModeSelect = document.querySelector("#drag-out-mode");
const browserImageCaptureSelect = document.querySelector("#browser-image-capture");
const displayLimitInput = document.querySelector("#display-limit");
const unlimitedButton = document.querySelector("#display-unlimited");
const thumbnailsToggle = document.querySelector("#show-thumbnails");
const clearChuteButton = document.querySelector("#clear-chute");

openShelfButton?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (chrome.sidePanel?.open && tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    await chrome.tabs.create({ url: chrome.runtime.getURL("shelf.html") });
  }
  window.close();
});

async function loadPopupSettings() {
  const settings = await chrome.storage.sync.get({
    chuteDisplayLimit: 50,
    chuteAccessMode: null,
    chuteBinVisible: true,
    chuteThumbnails: true,
    chuteDragOutMode: "file",
    chuteBrowserImageCapture: "full"
  });
  const limit = Number(settings.chuteDisplayLimit);
  const mode = settings.chuteAccessMode || (settings.chuteBinVisible ? "floating" : "context");
  displayLimitInput.value = String(limit > 0 ? limit : 50);
  unlimitedButton.classList.toggle("active", limit === 0);
  accessModeSelect.value = mode;
  dragOutModeSelect.value = settings.chuteDragOutMode === "source" ? "source" : "file";
  browserImageCaptureSelect.value = settings.chuteBrowserImageCapture === "thumbnail" ? "thumbnail" : "full";
  thumbnailsToggle.checked = settings.chuteThumbnails !== false;
}

displayLimitInput?.addEventListener("change", async () => {
  const value = Math.max(1, Math.trunc(Number(displayLimitInput.value) || 50));
  displayLimitInput.value = String(value);
  unlimitedButton.classList.remove("active");
  await chrome.storage.sync.set({ chuteDisplayLimit: value });
});

unlimitedButton?.addEventListener("click", async () => {
  unlimitedButton.classList.add("active");
  await chrome.storage.sync.set({ chuteDisplayLimit: 0 });
});

accessModeSelect?.addEventListener("change", async () => {
  const mode = accessModeSelect.value;
  await chrome.storage.sync.set({
    chuteAccessMode: mode,
    chuteBinVisible: mode === "floating" || mode === "both"
  });
});

dragOutModeSelect?.addEventListener("change", async () => {
  const mode = dragOutModeSelect.value === "source" ? "source" : "file";
  await chrome.storage.sync.set({ chuteDragOutMode: mode });
});

browserImageCaptureSelect?.addEventListener("change", async () => {
  const mode = browserImageCaptureSelect.value === "thumbnail" ? "thumbnail" : "full";
  await chrome.storage.sync.set({ chuteBrowserImageCapture: mode });
});

thumbnailsToggle?.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteThumbnails: thumbnailsToggle.checked });
});

clearChuteButton?.addEventListener("click", async () => {
  clearChuteButton.disabled = true;
  const originalText = clearChuteButton.textContent;
  clearChuteButton.textContent = "Clearing…";
  try {
    const response = await fetch(`${POPUP_BASE_URL}/api/clear`, {
      method: "POST",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Local bridge returned ${response.status}`);
    if (typeof prepared !== "undefined") prepared.clear();
    if (typeof resetHistory === "function") await resetHistory();
    chrome.runtime.sendMessage({ type: "badge-refresh" });
    clearChuteButton.textContent = "Chute cleared ✓";
  } catch (error) {
    clearChuteButton.textContent = "Could not clear Chute";
    console.error("Chute clear failed:", error);
  } finally {
    setTimeout(() => {
      clearChuteButton.disabled = false;
      clearChuteButton.textContent = originalText;
    }, 1200);
  }
});

loadPopupSettings();
