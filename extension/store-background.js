const CAPTURE_KEY = "chute-recent-image-capture-v2";
const MAX_CAPTURE_AGE_MS = 12000;
const DB_NAME = "chute-browser-shelf-v1";
const DB_VERSION = 1;
const ITEMS = "items";
const KV = "kv";
const FOLDER_KEY = "chute-folder";
const AUTO_MIRROR_SETTING = "chuteAutoMirrorFolder";
const MAX_BYTES = 48 * 1024 * 1024;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS)) {
        const store = db.createObjectStore(ITEMS, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putItem(item) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS, "readwrite");
    tx.objectStore(ITEMS).put(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted."));
  });
}

async function shelfCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS, "readonly");
    const request = tx.objectStore(ITEMS).count();
    request.onsuccess = () => resolve(Number(request.result || 0));
    request.onerror = () => reject(request.error);
  });
}

function base64ToBlob(base64, type) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

function safeName(value, fallback = "") {
  const text = String(value || "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return text || fallback;
}

function extensionForMime(type) {
  const mime = String(type || "").toLowerCase().split(";")[0];
  return {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp", "image/apng": "apng",
    "application/pdf": "pdf", "text/plain": "txt"
  }[mime] || "bin";
}

function timestampName(type, when = Date.now()) {
  const date = new Date(when);
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
  return `chute-${stamp}.${extensionForMime(type)}`;
}

function finalName(value, type, when = Date.now()) {
  const cleaned = safeName(value);
  if (!cleaned) return timestampName(type, when);
  if (/\.[a-z0-9]{1,10}$/i.test(cleaned)) return cleaned;
  return `${cleaned}.${extensionForMime(type)}`;
}

async function storePayload({ base64, name, type, lastModified, source, sourceUrl, parentPageUrl }) {
  const blob = base64ToBlob(base64, type);
  if (!blob.size) throw new Error("The dropped file was empty.");
  if (blob.size > MAX_BYTES) throw new Error("File is larger than Chute's 48 MB browser shelf limit.");
  const createdAt = Date.now();
  const item = {
    id: crypto.randomUUID(),
    name: finalName(name, blob.type, createdAt),
    mime: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt,
    lastModified: Number(lastModified || createdAt),
    source: String(source || "browser"),
    sourceUrl: String(sourceUrl || ""),
    parentPageUrl: String(parentPageUrl || ""),
    thumbnail: null,
    blob
  };
  await putItem(item);
  const mirrored = await mirrorItemIfAllowed(item).catch(() => ({ saved: false }));
  try { new BroadcastChannel("chute-shelf-events-v1").postMessage({ type: "changed" }); } catch {}
  return { id: item.id, name: item.name, mime: item.mime, size: item.size, mirrored };
}

async function readKv(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KV, "readonly");
    const request = tx.objectStore(KV).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function fileExists(directory, name) {
  try { await directory.getFileHandle(name); return true; } catch { return false; }
}

function splitName(name) {
  const value = safeName(name, timestampName("application/octet-stream"));
  const index = value.lastIndexOf(".");
  if (index <= 0 || index === value.length - 1) return { stem: value, ext: "" };
  return { stem: value.slice(0, index), ext: value.slice(index) };
}

async function uniqueFolderName(directory, requested) {
  const { stem, ext } = splitName(requested);
  let candidate = `${stem}${ext}`;
  if (!(await fileExists(directory, candidate))) return candidate;
  for (let number = 2; number < 10000; number += 1) {
    candidate = `${stem} (${number})${ext}`;
    if (!(await fileExists(directory, candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

async function mirrorItemIfAllowed(item) {
  const settings = await chrome.storage.local.get({ [AUTO_MIRROR_SETTING]: true });
  if (settings[AUTO_MIRROR_SETTING] === false) return { saved: false, reason: "disabled" };
  const handle = await readKv(FOLDER_KEY);
  if (!handle || handle.kind !== "directory") return { saved: false, reason: "no-folder" };
  let permission = "none";
  try { permission = await handle.queryPermission({ mode: "readwrite" }); } catch {}
  if (permission !== "granted") return { saved: false, reason: "permission" };
  const name = await uniqueFolderName(handle, item.name);
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(item.blob);
  await writable.close();
  return { saved: true, name, folder: handle.name };
}

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (error) {
    console.warn("Chute could not configure the side panel.", error);
  }
}

async function rememberCapture(message, sender) {
  const capture = message?.capture;
  if (!capture?.urls?.length || !sender?.tab?.id) return { ok: false };
  const record = {
    ...capture,
    source: String(message.source || capture.source || "browser"),
    tabId: sender.tab.id,
    capturedAt: Number(capture.capturedAt || Date.now())
  };
  await chrome.storage.session.set({ [CAPTURE_KEY]: record });
  return { ok: true };
}

async function readRecentCapture() {
  const stored = await chrome.storage.session.get(CAPTURE_KEY);
  const capture = stored?.[CAPTURE_KEY];
  if (!capture?.urls?.length || !Number.isInteger(capture.tabId)) return null;
  const age = Date.now() - Number(capture.capturedAt || 0);
  if (age < 0 || age > MAX_CAPTURE_AGE_MS) return null;
  return capture;
}

async function resolveRecentDrag() {
  const capture = await readRecentCapture();
  if (!capture) return { ok: false, error: "No recent supported image drag was captured." };
  const urls = Array.from(new Set(capture.urls.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 24);
  let lastError = "The source page could not provide that image.";
  for (const url of urls) {
    try {
      const result = await chrome.tabs.sendMessage(capture.tabId, {
        type: "chute-read-page-resource-v2",
        url,
        suggestedName: capture.title || ""
      });
      if (!result?.ok) {
        if (result?.error) lastError = result.error;
        continue;
      }
      if (!String(result.type || "").toLowerCase().startsWith("image/")) continue;
      return {
        ...result,
        ok: true,
        source: capture.source,
        sourceUrl: url,
        parentPageUrl: capture.pageUrl || ""
      };
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }
  return { ok: false, error: lastError };
}

async function storeRecentDrag() {
  const result = await resolveRecentDrag();
  if (!result.ok) return result;
  const item = await storePayload({
    base64: result.base64,
    name: result.name,
    type: result.type,
    source: result.source,
    sourceUrl: result.sourceUrl,
    parentPageUrl: result.parentPageUrl
  });
  return { ok: true, item };
}

async function openShelf(sender) {
  if (!chrome.sidePanel?.open) throw new Error("This Chrome build does not support the Chute side panel.");
  const windowId = sender?.tab?.windowId;
  if (!windowId) throw new Error("No browser window was available.");
  await chrome.sidePanel.open({ windowId });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "chute-capture-source-v2") {
    void rememberCapture(message, sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "chute-resolve-recent-drag-v2") {
    void resolveRecentDrag().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "chute-store-recent-drag-v2") {
    void storeRecentDrag().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "chute-store-file-v2") {
    void storePayload(message.file || {}).then((item) => sendResponse({ ok: true, item })).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "chute-shelf-count-v2") {
    void shelfCount().then((count) => sendResponse({ ok: true, count })).catch((error) => sendResponse({ ok: false, count: 0, error: error?.message || String(error) }));
    return true;
  }
  if (message?.type === "chute-open-side-panel-v2") {
    void openShelf(sender).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => void configureSidePanel());
chrome.runtime.onStartup.addListener(() => void configureSidePanel());
void configureSidePanel();
