const BASE_URL = "http://127.0.0.1:17891";

async function getFiles() {
  const response = await fetch(`${BASE_URL}/api/files`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Chute server returned ${response.status}`);
  const payload = await response.json();
  return payload.files || [];
}

async function updateBadge() {
  try {
    const files = await getFiles();
    await chrome.action.setBadgeBackgroundColor({ color: "#d7ff3f" });
    await chrome.action.setBadgeTextColor({ color: "#111111" });
    await chrome.action.setBadgeText({ text: files.length ? String(files.length) : "" });
  } catch {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#e05d44" });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  const existing = await chrome.storage.sync.get(["chuteDisplayLimit", "chuteBinVisible"]);
  const defaults = {};
  if (existing.chuteDisplayLimit === undefined) defaults.chuteDisplayLimit = 20;
  if (existing.chuteBinVisible === undefined) defaults.chuteBinVisible = true;
  if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);
  await updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "badge-refresh") {
    updateBadge().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "open-side-panel") {
    const windowId = sender.tab?.windowId;
    if (!windowId) {
      sendResponse({ ok: false, error: "No browser window found." });
      return false;
    }
    chrome.sidePanel.open({ windowId })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "attach-file") {
    attachFile(message.file)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function attachFile(file) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab found.");

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async (url, name, mime) => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      };
      const inputs = [...document.querySelectorAll('input[type="file"]')];
      const input = inputs.find(visible) || inputs[0];
      if (!input) return { ok: false, error: "This page has no file upload field." };

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return { ok: false, error: `Could not read file (${response.status}).` };
      const blob = await response.blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], name, { type: mime || blob.type, lastModified: Date.now() }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    },
    args: [`${BASE_URL}/api/files/${file.id}`, file.name, file.mime]
  });

  return results[0]?.result || { ok: false, error: "The page rejected the attachment." };
}
