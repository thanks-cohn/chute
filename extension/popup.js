const DEFAULT_LOVE_URL = "https://www.patreon.com/";
const openShelfButton = document.querySelector("#open-shelf");
const displayLimitSelect = document.querySelector("#display-limit");
const binVisibleToggle = document.querySelector("#bin-visible");
const binLayerSelect = document.querySelector("#bin-layer");
const loveUrlInput = document.querySelector("#love-url");

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
    chuteBinVisible: true,
    chuteBinLayer: "front",
    chuteLoveUrl: DEFAULT_LOVE_URL
  });
  displayLimitSelect.value = String(settings.chuteDisplayLimit);
  binVisibleToggle.checked = Boolean(settings.chuteBinVisible);
  binLayerSelect.value = settings.chuteBinLayer === "back" ? "back" : "front";
  loveUrlInput.value = settings.chuteLoveUrl || DEFAULT_LOVE_URL;
}

displayLimitSelect.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteDisplayLimit: Number(displayLimitSelect.value) });
});

binVisibleToggle.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteBinVisible: binVisibleToggle.checked });
});

binLayerSelect.addEventListener("change", async () => {
  await chrome.storage.sync.set({ chuteBinLayer: binLayerSelect.value === "back" ? "back" : "front" });
});

loveUrlInput.addEventListener("change", async () => {
  const raw = loveUrlInput.value.trim() || DEFAULT_LOVE_URL;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
    loveUrlInput.setCustomValidity("");
    loveUrlInput.value = url.href;
    await chrome.storage.sync.set({ chuteLoveUrl: url.href });
  } catch {
    loveUrlInput.setCustomValidity("Enter a full http:// or https:// support page URL.");
    loveUrlInput.reportValidity();
  }
});

loadPopupSettings();
