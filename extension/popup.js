const openShelfButton = document.querySelector("#open-shelf");
const accessModeSelect = document.querySelector("#access-mode");
const displayLimitInput = document.querySelector("#display-limit");
const unlimitedButton = document.querySelector("#display-unlimited");
const thumbnailsToggle = document.querySelector("#show-thumbnails");

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
    chuteThumbnails: true
  });
  const limit = Number(settings.chuteDisplayLimit);
  const mode = settings.chuteAccessMode || (settings.chuteBinVisible ? "floating" : "context");
  displayLimitInput.value = String(limit > 0 ? limit : 50);
  unlimitedButton.classList.toggle("active", limit === 0);
  accessModeSelect.value = mode;
  thumbnailsToggle.checked = Boolean(settings.chuteThumbnails);
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
  if (mode === "context" || mode === "both") {
    try {
      await chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] });
    } catch (error) {
      console.warn("Optional Chute image-capture permission was not granted:", error);
    }
  }
  await chrome.storage.sync.set({
    chuteAccessMode: mode,
    chuteBinVisible: mode === "floating" || mode === "both"
  });
});

thumbnailsToggle?.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteThumbnails: thumbnailsToggle.checked });
});

loadPopupSettings();
