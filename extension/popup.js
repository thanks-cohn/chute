const POPUP_BASE_URL = "http://127.0.0.1:17891";
const openShelfButton = document.querySelector("#open-shelf");
const accessModeSelect = document.querySelector("#access-mode");
const dragOutModeSelect = document.querySelector("#drag-out-mode");
const saveFullToggle = document.querySelector("#browser-image-save-full");
const saveCustomToggle = document.querySelector("#browser-image-save-custom");
const customWidthInput = document.querySelector("#browser-image-width");
const customHeightInput = document.querySelector("#browser-image-height");
const displayLimitInput = document.querySelector("#display-limit");
const unlimitedButton = document.querySelector("#display-unlimited");
const thumbnailsToggle = document.querySelector("#show-thumbnails");
const clearChuteButton = document.querySelector("#clear-chute");

function clampDimension(value, fallback = 512) {
  const next = Math.trunc(Number(value) || fallback);
  return Math.min(4096, Math.max(16, next));
}

openShelfButton?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!chrome.sidePanel?.open || !tab?.windowId) {
    console.error("Chute Shelf requires browser side-panel support.");
    return;
  }
  await chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

async function loadPopupSettings() {
  const settings = await chrome.storage.sync.get({
    chuteDisplayLimit: 50,
    chuteAccessMode: null,
    chuteBinVisible: true,
    chuteThumbnails: true,
    chuteDragOutMode: "file",
    chuteBrowserImageCapture: "full",
    chuteBrowserImageSaveFull: null,
    chuteBrowserImageSaveCustom: null,
    chuteBrowserImageWidth: 512,
    chuteBrowserImageHeight: 512
  });

  const limit = Number(settings.chuteDisplayLimit);
  const mode = settings.chuteAccessMode || (settings.chuteBinVisible ? "floating" : "context");
  const migratedFull = settings.chuteBrowserImageSaveFull === null
    ? settings.chuteBrowserImageCapture !== "thumbnail"
    : settings.chuteBrowserImageSaveFull !== false;
  const migratedCustom = settings.chuteBrowserImageSaveCustom === null
    ? settings.chuteBrowserImageCapture === "thumbnail"
    : settings.chuteBrowserImageSaveCustom === true;

  displayLimitInput.value = String(limit > 0 ? limit : 50);
  unlimitedButton.classList.toggle("active", limit === 0);
  accessModeSelect.value = mode;
  dragOutModeSelect.value = settings.chuteDragOutMode === "source" ? "source" : "file";
  saveFullToggle.checked = migratedFull;
  saveCustomToggle.checked = migratedCustom;
  customWidthInput.value = String(clampDimension(settings.chuteBrowserImageWidth));
  customHeightInput.value = String(clampDimension(settings.chuteBrowserImageHeight));
  thumbnailsToggle.checked = settings.chuteThumbnails !== false;

  if (settings.chuteBrowserImageSaveFull === null || settings.chuteBrowserImageSaveCustom === null) {
    await chrome.storage.sync.set({
      chuteBrowserImageSaveFull: migratedFull,
      chuteBrowserImageSaveCustom: migratedCustom,
      chuteBrowserImageWidth: clampDimension(settings.chuteBrowserImageWidth),
      chuteBrowserImageHeight: clampDimension(settings.chuteBrowserImageHeight)
    });
  }
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

saveFullToggle?.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteBrowserImageSaveFull: saveFullToggle.checked });
});

saveCustomToggle?.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteBrowserImageSaveCustom: saveCustomToggle.checked });
});

async function saveCustomDimensions() {
  const width = clampDimension(customWidthInput.value);
  const height = clampDimension(customHeightInput.value);
  customWidthInput.value = String(width);
  customHeightInput.value = String(height);
  await chrome.storage.sync.set({
    chuteBrowserImageWidth: width,
    chuteBrowserImageHeight: height
  });
}

customWidthInput?.addEventListener("change", saveCustomDimensions);
customHeightInput?.addEventListener("change", saveCustomDimensions);

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
