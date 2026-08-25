const DB_NAME = "chute-browser-shelf-v1";
const DB_VERSION = 1;
const ITEMS = "items";
const KV = "kv";
const FOLDER_KEY = "chute-folder";
const THUMBNAIL_SETTING = "chuteSaveThumbnails";
const DEFAULT_SHELF_IMAGE = "assets/default-shelf.png";
const THUMB_SIZE = 96;
const MAX_BROWSER_ITEM_BYTES = 48 * 1024 * 1024;

const listElement = document.querySelector("#files");
const statusElement = document.querySelector("#status");
const clearButton = document.querySelector("#clear");
const chooseFolderButton = document.querySelector("#choose-folder");
const folderLabel = document.querySelector("#folder-label");
const dropZone = document.querySelector("#drop-zone");
const thumbnailToggle = document.querySelector("#thumbnail-toggle");

let objectUrls = [];
let busy = false;
let saveThumbnails = true;

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

async function withStore(name, mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let result;
    try { result = work(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted."));
  });
}

async function putItem(item) {
  await withStore(ITEMS, "readwrite", (store) => store.put(item));
}

async function deleteItem(id) {
  await withStore(ITEMS, "readwrite", (store) => store.delete(id));
}

async function clearItems() {
  await withStore(ITEMS, "readwrite", (store) => store.clear());
}

async function allItems() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS, "readonly");
    const request = tx.objectStore(ITEMS).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
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

async function writeKv(key, value) {
  await withStore(KV, "readwrite", (store) => store.put(value, key));
}

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
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
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/apng": "apng"
  }[mime] || "img";
}

function timestampName(type, when = Date.now()) {
  const date = new Date(when);
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    "-",
    pad(date.getMilliseconds(), 3)
  ].join("");
  return `chute-${stamp}.${extensionForMime(type)}`;
}

function finalName(value, type, when = Date.now()) {
  const cleaned = safeName(value);
  if (!cleaned) return timestampName(type, when);
  if (/\.[a-z0-9]{2,8}$/i.test(cleaned)) return cleaned;
  return `${cleaned}.${extensionForMime(type)}`;
}

function formatSize(bytes) {
  let value = Number(bytes) || 0;
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (value < 1024 || unit === "GB") return `${value < 10 && unit !== "B" ? value.toFixed(1) : Math.round(value)} ${unit}`;
    value /= 1024;
  }
  return `${bytes} B`;
}

function base64ToBlob(base64, type) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

async function makeThumbnail(blob) {
  if (!(blob instanceof Blob) || !String(blob.type || "").startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    context.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    context.drawImage(
      bitmap,
      Math.floor((THUMB_SIZE - width) / 2),
      Math.floor((THUMB_SIZE - height) / 2),
      width,
      height
    );
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.72));
  } catch {
    return null;
  }
}

async function loadThumbnailPreference() {
  const stored = await chrome.storage.local.get({ [THUMBNAIL_SETTING]: true });
  saveThumbnails = stored?.[THUMBNAIL_SETTING] !== false;
  if (thumbnailToggle) thumbnailToggle.checked = saveThumbnails;
}

async function folderHandle() {
  const handle = await readKv(FOLDER_KEY);
  return handle?.kind === "directory" ? handle : null;
}

async function folderPermission(handle) {
  if (!handle) return "none";
  try { return await handle.queryPermission({ mode: "readwrite" }); } catch { return "none"; }
}

async function refreshFolderLabel() {
  const handle = await folderHandle();
  if (!handle) {
    folderLabel.textContent = "Browser storage only";
    chooseFolderButton.textContent = "Choose Chute folder";
    return;
  }
  const permission = await folderPermission(handle);
  folderLabel.textContent = permission === "granted"
    ? `Saving to: ${handle.name}`
    : `Folder selected: ${handle.name} · reconnect to save`;
  chooseFolderButton.textContent = permission === "granted" ? "Change folder" : "Reconnect folder";
}

async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

function splitName(name) {
  const value = safeName(name, timestampName("image/png"));
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

async function writeBlobToFolder(item, allowPicker = false) {
  let handle = await folderHandle();
  if (!handle && allowPicker) handle = await chooseFolder();
  if (!handle) return { saved: false, reason: "no-folder" };

  let permission = await folderPermission(handle);
  if (permission !== "granted" && allowPicker) {
    try { permission = await handle.requestPermission({ mode: "readwrite" }); } catch {}
  }
  if (permission !== "granted") return { saved: false, reason: "permission" };

  const name = await uniqueFolderName(handle, item.name);
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(item.blob);
  await writable.close();
  return { saved: true, name, folder: handle.name };
}

async function chooseFolder() {
  if (typeof window.showDirectoryPicker !== "function") {
    setStatus("This Chrome build does not expose the folder picker here.", true);
    return null;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "chute-output" });
    await writeKv(FOLDER_KEY, handle);
    await refreshFolderLabel();
    setStatus(`Chute will mirror new items to ${handle.name}.`);
    return handle;
  } catch (error) {
    if (error?.name !== "AbortError") setStatus(error?.message || "Could not select a folder.", true);
    return null;
  }
}

async function addBlob(blob, name, meta = {}) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error("The dropped image was empty.");
  if (blob.size > MAX_BROWSER_ITEM_BYTES) throw new Error("This image is larger than the current 48 MB Chute shelf limit.");

  const createdAt = Date.now();
  const item = {
    id: crypto.randomUUID(),
    name: finalName(name, blob.type, createdAt),
    mime: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt,
    source: String(meta.source || "local"),
    sourceUrl: String(meta.sourceUrl || ""),
    parentPageUrl: String(meta.parentPageUrl || ""),
    thumbnail: saveThumbnails ? await makeThumbnail(blob) : null,
    blob
  };

  await putItem(item);
  const mirrored = await writeBlobToFolder(item, false).catch(() => ({ saved: false }));
  await render();

  if (mirrored.saved) setStatus(`Saved ${item.name} to Chute and ${mirrored.folder}.`);
  else setStatus(`Saved ${item.name} to the private Chute shelf.`);
  return item;
}

async function resolveBrowserDrag() {
  const result = await chrome.runtime.sendMessage({ type: "chute-resolve-recent-drag-v2" });
  if (!result?.ok) throw new Error(result?.error || "Chute could not recover that browser image.");
  const blob = base64ToBlob(result.base64, result.type);
  return addBlob(blob, result.name, {
    source: result.source,
    sourceUrl: result.sourceUrl,
    parentPageUrl: result.parentPageUrl
  });
}

async function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove("dragging");
  if (busy) return;
  busy = true;

  try {
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file instanceof File && file.size > 0);
    if (files.length) {
      for (const file of files) await addBlob(file, file.name, { source: "local" });
      return;
    }
    await resolveBrowserDrag();
  } catch (error) {
    setStatus(error?.message || "That drag did not contain an image Chute could save.", true);
  } finally {
    busy = false;
  }
}

function placeholderThumb(shell) {
  const fallback = document.createElement("span");
  fallback.className = "file-fallback";
  fallback.textContent = "↓";

  const img = document.createElement("img");
  img.className = "file-thumb";
  img.alt = "";
  img.src = DEFAULT_SHELF_IMAGE;
  img.addEventListener("load", () => { fallback.hidden = true; }, { once: true });
  img.addEventListener("error", () => { img.hidden = true; fallback.hidden = false; }, { once: true });
  shell.append(fallback, img);
  return img;
}

async function ensureThumbnail(item, img) {
  if (!saveThumbnails || !String(item.mime || "").startsWith("image/")) return;
  let thumbnail = item.thumbnail instanceof Blob && item.thumbnail.size ? item.thumbnail : null;
  if (!thumbnail) {
    thumbnail = await makeThumbnail(item.blob);
    if (thumbnail) {
      item.thumbnail = thumbnail;
      await putItem(item).catch(() => {});
    }
  }
  if (!thumbnail) return;
  const url = URL.createObjectURL(thumbnail);
  objectUrls.push(url);
  img.hidden = false;
  img.src = url;
}

async function render() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  const items = await allItems();
  listElement.replaceChildren();

  if (!items.length) {
    listElement.innerHTML = `<div class="empty"><strong>Nothing in Chute yet.</strong><br>Drag an image from Google Images, Yandex Images, ChatGPT, or your computer.</div>`;
    return;
  }

  for (const item of items) {
    const row = document.createElement("article");
    row.className = "file-row";

    const icon = document.createElement("div");
    icon.className = "thumb-shell";
    const img = placeholderThumb(icon);
    if (saveThumbnails && String(item.mime || "").startsWith("image/")) void ensureThumbnail(item, img);

    const info = document.createElement("div");
    info.className = "file-info";
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = item.name;
    name.title = item.name;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${formatSize(item.size)} · ${item.source || "local"}`;
    info.append(name, meta);

    const tools = document.createElement("div");
    tools.className = "file-tools";

    const save = document.createElement("button");
    save.className = "secondary-button";
    save.type = "button";
    save.textContent = "Save";
    save.title = "Save this item to your chosen Chute folder";
    save.addEventListener("click", async () => {
      try {
        const result = await writeBlobToFolder(item, true);
        if (result.saved) setStatus(`Saved ${result.name} to ${result.folder}.`);
      } catch (error) {
        setStatus(error?.message || "Could not save that item.", true);
      }
      await refreshFolderLabel();
    });

    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Remove from browser shelf";
    remove.addEventListener("click", async () => {
      await deleteItem(item.id);
      await render();
      setStatus(`Removed ${item.name} from the browser shelf.`);
    });

    tools.append(save, remove);
    row.append(icon, info, tools);
    listElement.append(row);
  }
}

for (const target of [document.documentElement, document.body, dropZone]) {
  target.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    dropZone.classList.add("dragging");
  });
  target.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) dropZone.classList.remove("dragging");
  });
}

document.addEventListener("drop", handleDrop, true);
chooseFolderButton.addEventListener("click", () => void chooseFolder());
thumbnailToggle?.addEventListener("change", async () => {
  saveThumbnails = thumbnailToggle.checked;
  await chrome.storage.local.set({ [THUMBNAIL_SETTING]: saveThumbnails });
  await render();
  setStatus(saveThumbnails ? "Small shelf thumbnails are enabled." : "Thumbnail saving is disabled. Chute will use the default shelf image.");
});
clearButton.addEventListener("click", async () => {
  await clearItems();
  await render();
  setStatus("Cleared the private browser shelf. Files already written to your chosen folder were not deleted.");
});

void (async () => {
  await loadThumbnailPreference();
  await refreshFolderLabel();
  await render();
})();
