const openShelfButton = document.querySelector("#open-shelf");
const displayLimitSelect = document.querySelector("#display-limit");
const binVisibleToggle = document.querySelector("#bin-visible");

openShelfButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  }
});

async function loadPopupSettings() {
  const settings = await chrome.storage.sync.get({
    chuteDisplayLimit: 20,
    chuteBinVisible: true
  });
  displayLimitSelect.value = String(settings.chuteDisplayLimit);
  binVisibleToggle.checked = Boolean(settings.chuteBinVisible);
}

displayLimitSelect.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteDisplayLimit: Number(displayLimitSelect.value) });
});

binVisibleToggle.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteBinVisible: binVisibleToggle.checked });
});

loadPopupSettings();
