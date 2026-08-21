const openShelfButton = document.querySelector("#open-shelf");
const displayLimitInput = document.querySelector("#display-limit");
const unlimitedButton = document.querySelector("#display-unlimited");
const binVisibleToggle = document.querySelector("#bin-visible");
const thumbnailsToggle = document.querySelector("#show-thumbnails");

openShelfButton?.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  }
});

async function loadPopupSettings() {
  const settings = await chrome.storage.sync.get({
    chuteDisplayLimit: 50,
    chuteBinVisible: true,
    chuteThumbnails: true
  });
  const limit = Number(settings.chuteDisplayLimit);
  displayLimitInput.value = String(limit > 0 ? limit : 50);
  unlimitedButton.classList.toggle("active", limit === 0);
  binVisibleToggle.checked = Boolean(settings.chuteBinVisible);
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

binVisibleToggle?.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteBinVisible: binVisibleToggle.checked });
});

thumbnailsToggle?.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteThumbnails: thumbnailsToggle.checked });
});

loadPopupSettings();
