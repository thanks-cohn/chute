openShelf = async function(sender) {
  if (!chrome.sidePanel?.open) {
    throw new Error("This browser does not support the Chute side panel.");
  }

  let windowId = sender?.tab?.windowId;
  if (!windowId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    windowId = tab?.windowId;
  }
  if (!windowId) throw new Error("No active browser window found.");

  await chrome.sidePanel.open({ windowId });
};


// The toolbar action intentionally opens a persistent window rather than
// Chrome's short-lived default_popup (which closes on focus loss and overlaps
// the right-hand side panel). Reuse this EXISTING MV3 service worker.
if (chrome.action?.onClicked && chrome.windows?.create) {
  chrome.action.onClicked.addListener(tab => {
    const browserId = tab?.windowId;
    if (!Number.isInteger(browserId) || browserId <= 0) return;
    void (async () => {
      const KEY = "chuteyGalleryWindows";
      const saved = await chrome.storage.session.get(KEY);
      const windows = saved[KEY] && typeof saved[KEY] === "object" ? saved[KEY] : {};
      const existingId = windows[String(browserId)];
      if (Number.isInteger(existingId)) {
        try {
          await chrome.windows.get(existingId);
          await chrome.windows.update(existingId, { focused: true });
          return;
        } catch {
          delete windows[String(browserId)]; // User closed the gallery.
        }
      }

      const browser = await chrome.windows.get(browserId);
      const outerWidth = Math.min(408, Math.max(360, (browser.width || 1000) - 415));
      const outerHeight = Math.max(460, Math.min(610, (browser.height || 700) - 92));
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL("popup.html?detached=1&browserWindow=" + browserId),
        type: "popup",
        focused: true,
        left: Math.round((browser.left || 0) + 8),
        top: Math.round((browser.top || 0) + 70),
        width: outerWidth,
        height: outerHeight
      });
      if (!window?.id) throw new Error("Chutey gallery window was not created");
      windows[String(browserId)] = window.id;
      await chrome.storage.session.set({ [KEY]: windows });
    })().catch(error => console.warn("Chutey gallery window launch failed:", error));
  });
}
