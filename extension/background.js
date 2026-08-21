const BASE_URL = "http://127.0.0.1:17891";
const CONTEXT_MENU_ID = "chute-send";

function safeName(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 180) || fallback;
}

function urlName(url, fallback = "browser-link") {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "");
    return safeName(last || `${parsed.hostname}-${fallback}`, fallback);
  } catch {
    return fallback;
  }
}

function internetShortcut(url) {
  return new Blob([`[InternetShortcut]\r\nURL=${url}\r\n`], {
    type: "application/internet-shortcut"
  });
}

async function uploadBlob(blob, name, source) {
  const response = await fetch(`${BASE_URL}/api/upload`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "X-Chute-Filename": encodeURIComponent(safeName(name, "browser-file")),
      "X-Chute-Mime": blob.type || "application/octet-stream",
      "X-Chute-Source": encodeURIComponent(source || "browser-context-menu")
    },
    body: blob
  });
  if (!response.ok) throw new Error(`Chute server returned ${response.status}`);
  return response.json();
}

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
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: "#111111" });
    }
    await chrome.action.setBadgeText({ text: files.length ? String(files.length) : "" });
  } catch {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#e05d44" });
  }
}

function contextEnabled(mode) {
  return mode === "context" || mode === "both";
}

async function syncContextMenu(mode) {
  await chrome.contextMenus.removeAll();
  if (!contextEnabled(mode)) return;
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Send to Chute",
    contexts: ["image", "link", "selection", "page"]
  });
}

async function openShelf(sender) {
  const windowId = sender.tab?.windowId;
  if (chrome.sidePanel?.open && windowId) {
    await chrome.sidePanel.open({ windowId });
    return;
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("shelf.html") });
}

async function sendContextToChute(info, tab) {
  if (info.selectionText) {
    const text = `${info.selectionText}\n`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await uploadBlob(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
      `selection-${stamp}.txt`,
      tab?.url || "browser-selection"
    );
    return;
  }

  if (info.srcUrl) {
    try {
      const response = await fetch(info.srcUrl, {
        cache: "no-store",
        credentials: "omit"
      });
      if (!response.ok) throw new Error(`Image returned ${response.status}`);
      const blob = await response.blob();
      let name = urlName(info.srcUrl, "browser-image");
      if (!name.includes(".") && blob.type.startsWith("image/")) {
        const subtype = blob.type.split("/")[1]?.split("+")[0] || "img";
        name = `${name}.${subtype === "jpeg" ? "jpg" : subtype}`;
      }
      await uploadBlob(blob, name, info.srcUrl);
      return;
    } catch {
      const name = `${urlName(info.srcUrl, "browser-image")}.url`;
      await uploadBlob(internetShortcut(info.srcUrl), name, info.srcUrl);
      return;
    }
  }

  const url = info.linkUrl || info.pageUrl || tab?.url;
  if (url) {
    const name = `${urlName(url, "browser-link")}.url`;
    await uploadBlob(internetShortcut(url), name, url);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }

  const existing = await chrome.storage.sync.get([
    "chuteDisplayLimit",
    "chuteBinVisible",
    "chuteAccessMode",
    "chuteThumbnails"
  ]);
  const defaults = {};
  if (existing.chuteDisplayLimit === undefined) defaults.chuteDisplayLimit = 50;
  if (existing.chuteThumbnails === undefined) defaults.chuteThumbnails = true;
  if (existing.chuteAccessMode === undefined) {
    defaults.chuteAccessMode = existing.chuteBinVisible === false ? "context" : "floating";
  }
  if (existing.chuteBinVisible === undefined) defaults.chuteBinVisible = true;
  if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);

  const mode = defaults.chuteAccessMode || existing.chuteAccessMode || "floating";
  await syncContextMenu(mode);
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  const { chuteAccessMode = "floating" } = await chrome.storage.sync.get({ chuteAccessMode: "floating" });
  await syncContextMenu(chuteAccessMode);
  await updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.chuteAccessMode) {
    syncContextMenu(changes.chuteAccessMode.newValue || "floating");
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  sendContextToChute(info, tab)
    .then(updateBadge)
    .catch((error) => {
      console.error("Send to Chute failed:", error);
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#e05d44" });
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "badge-refresh") {
    updateBadge().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "open-side-panel") {
    openShelf(sender)
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
