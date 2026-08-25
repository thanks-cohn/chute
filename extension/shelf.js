const DB_NAME = "chute-browser-shelf-v1";
const DB_VERSION = 1;
const ITEMS = "items";
const KV = "kv";
const FOLDER_KEY = "chute-folder";
const THUMBNAIL_SETTING = "chuteSaveThumbnails";
const AUTO_MIRROR_SETTING = "chuteAutoMirrorFolder";
const MASCOT_SETTING = "chuteMascotVisible";
const PAGE_SIZE_SETTING = "chuteShelfPageSize";
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
const autoMirrorToggle = document.querySelector("#auto-mirror-toggle");
const mascotToggle = document.querySelector("#mascot-toggle");
const searchInput = document.querySelector("#shelf-search");
const pageSizeSelect = document.querySelector("#page-size");
const pageControls = document.querySelector("#page-controls");
const pagePrevButton = document.querySelector("#page-prev");
const pageNextButton = document.querySelector("#page-next");
const pageLabel = document.querySelector("#page-label");

let objectUrls = [];
let dragUrls = [];
let busy = false;
let saveThumbnails = true;
let autoMirror = true;
let mascotVisible = true;
let pageSize = 50;
let pageIndex = 0;
let searchText = "";

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
  if (!statusElement) return;
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
    "image/apng": "apng",
    "application/pdf": "pdf",
    "text/plain": "txt"
  }[mime] || "bin";
}

function timestampName(type, when = Date.now()) {
  const date = new Date(when);
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  const stamp = [
    date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), "-",
    pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds()), "-",
    pad(date.getMilliseconds(), 3)
  ].join("");
  return `chute-${stamp}.${extensionForMime(type)}`;
}

function finalName(value, type, when = Date.now()) {
  const cleaned = safeName(value);
  if (!cleaned) return timestampName(type, when);
  if (/\.[a-z0-9]{1,10}$/i.test(cleaned)) return cleaned;
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
    context.drawImage(bitmap, Math.floor((THUMB_SIZE - width) / 2), Math.floor((THUMB_SIZE - height) / 2), width, height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.72));
  } catch {
    return null;
  }
}

async function loadPreferences() {
  const stored = await chrome.storage.local.get({
    [THUMBNAIL_SETTING]: true,
    [AUTO_MIRROR_SETTING]: true,
    [MASCOT_SETTING]: true,
    [PAGE_SIZE_SETTING]: 50
  });
  saveThumbnails = stored[THUMBNAIL_SETTING] !== false;
  autoMirror = stored[AUTO_MIRROR_SETTING] !== false;
  mascotVisible = stored[MASCOT_SETTING] !== false;
  pageSize = [25, 50, 100, 250].includes(Number(stored[PAGE_SIZE_SETTING])) ? Number(stored[PAGE_SIZE_SETTING]) : 50;
  if (thumbnailToggle) thumbnailToggle.checked = saveThumbnails;
  if (autoMirrorToggle) autoMirrorToggle.checked = autoMirror;
  if (mascotToggle) mascotToggle.checked = mascotVisible;
  if (pageSizeSelect) pageSizeSelect.value = String(pageSize);
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
  if (!autoMirror) {
    folderLabel.textContent = `Folder remembered: ${handle.name} · auto-save off`;
  } else if (permission === "granted") {
    folderLabel.textContent = `Saving to: ${handle.name}`;
  } else {
    folderLabel.textContent = `Folder remembered: ${handle.name} · click reconnect`;
  }
  chooseFolderButton.textContent = permission === "granted" ? "Change folder" : "Reconnect folder";
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

async function writeBlobToFolder(item, allowPrompt = false) {
  let handle = await folderHandle();
  if (!handle && allowPrompt) handle = await chooseFolder();
  if (!handle) return { saved: false, reason: "no-folder" };

  let permission = await folderPermission(handle);
  if (permission !== "granted" && allowPrompt) {
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
    setStatus(autoMirror ? `Chute will keep using ${handle.name} for new items.` : `${handle.name} remembered. Automatic folder saving is off.`);
    return handle;
  } catch (error) {
    if (error?.name !== "AbortError") setStatus(error?.message || "Could not select a folder.", true);
    return null;
  }
}

async function addBlob(blob, name, meta = {}) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error("The dropped file was empty.");
  if (blob.size > MAX_BROWSER_ITEM_BYTES) throw new Error("This file is larger than the current 48 MB Chute shelf limit.");

  const createdAt = Date.now();
  const item = {
    id: crypto.randomUUID(),
    name: finalName(name, blob.type, createdAt),
    mime: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt,
    lastModified: Number(meta.lastModified || createdAt),
    source: String(meta.source || "local"),
    sourceUrl: String(meta.sourceUrl || ""),
    parentPageUrl: String(meta.parentPageUrl || ""),
    thumbnail: saveThumbnails ? await makeThumbnail(blob) : null,
    blob
  };

  await putItem(item);
  let mirrored = { saved: false };
  if (autoMirror) mirrored = await writeBlobToFolder(item, false).catch(() => ({ saved: false }));
  pageIndex = 0;
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
      for (const file of files) await addBlob(file, file.name, { source: "local", lastModified: file.lastModified });
      return;
    }
    await resolveBrowserDrag();
  } catch (error) {
    setStatus(error?.message || "That drag did not contain a file Chute could save.", true);
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

function startDragOut(event, row, item, preview) {
  const transfer = event.dataTransfer;
  if (!transfer) return;
  row.classList.add("dragging-out");
  transfer.effectAllowed = "copy";
  const file = new File([item.blob], item.name, {
    type: item.mime || item.blob.type || "application/octet-stream",
    lastModified: Number(item.lastModified || item.createdAt || Date.now())
  });
  try { transfer.items.add(file); } catch {}

  const url = URL.createObjectURL(item.blob);
  dragUrls.push(url);
  try { transfer.setData("DownloadURL", `${file.type || "application/octet-stream"}:${item.name}:${url}`); } catch {}
  try { transfer.setData("text/plain", item.sourceUrl || item.name); } catch {}
  if (item.sourceUrl) {
    try { transfer.setData("text/uri-list", item.sourceUrl); } catch {}
  }
  if (preview && !preview.hidden) {
    try { transfer.setDragImage(preview, 24, 24); } catch {}
  }
}

function endDragOut(row) {
  row.classList.remove("dragging-out");
  for (const url of dragUrls.splice(0)) URL.revokeObjectURL(url);
}

function filteredItems(items) {
  const query = searchText.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) => `${item.name} ${item.source || ""}`.toLowerCase().includes(query));
}

async function render() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  const items = filteredItems(await allItems());
  listElement.replaceChildren();

  if (!items.length) {
    listElement.innerHTML = `<div class="empty"><strong>${searchText ? "No matching shelf items." : "Nothing in Chute yet."}</strong><br>${searchText ? "Try another search." : "Drag a file here, or drop an image from Google Images, Yandex Images, ChatGPT, or the little Chute mascot."}</div>`;
    pageControls.hidden = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  pageIndex = Math.min(pageIndex, totalPages - 1);
  const start = pageIndex * pageSize;
  const visible = items.slice(start, start + pageSize);

  for (const item of visible) {
    const row = document.createElement("article");
    row.className = "file-row";
    row.draggable = true;
    row.title = "Drag this file out of Chute";

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
    save.draggable = false;
    save.addEventListener("click", async (event) => {
      event.stopPropagation();
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
    remove.draggable = false;
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteItem(item.id);
      await render();
      setStatus(`Removed ${item.name} from the browser shelf.`);
    });

    tools.append(save, remove);
    row.append(icon, info, tools);
    row.addEventListener("dragstart", (event) => startDragOut(event, row, item, img));
    row.addEventListener("dragend", () => endDragOut(row));
    listElement.append(row);
  }

  pageControls.hidden = totalPages <= 1;
  pagePrevButton.disabled = pageIndex <= 0;
  pageNextButton.disabled = pageIndex >= totalPages - 1;
  pageLabel.textContent = `Page ${pageIndex + 1} of ${totalPages} · ${items.length}`;
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
autoMirrorToggle?.addEventListener("change", async () => {
  autoMirror = autoMirrorToggle.checked;
  await chrome.storage.local.set({ [AUTO_MIRROR_SETTING]: autoMirror });
  await refreshFolderLabel();
  setStatus(autoMirror ? "New shelf items will also save to your remembered folder when Chrome permission is available." : "Automatic folder saving is off. Chute remains browser-only until you press Save.");
});
mascotToggle?.addEventListener("change", async () => {
  mascotVisible = mascotToggle.checked;
  await chrome.storage.local.set({ [MASCOT_SETTING]: mascotVisible });
  setStatus(mascotVisible ? "The little Chute mascot is enabled on supported sites." : "The little Chute mascot is hidden.");
});
searchInput?.addEventListener("input", () => {
  searchText = searchInput.value;
  pageIndex = 0;
  void render();
});
pageSizeSelect?.addEventListener("change", async () => {
  pageSize = Number(pageSizeSelect.value) || 50;
  pageIndex = 0;
  await chrome.storage.local.set({ [PAGE_SIZE_SETTING]: pageSize });
  await render();
});
pagePrevButton?.addEventListener("click", () => { if (pageIndex > 0) { pageIndex -= 1; void render(); } });
pageNextButton?.addEventListener("click", () => { pageIndex += 1; void render(); });
clearButton.addEventListener("click", async () => {
  await clearItems();
  pageIndex = 0;
  await render();
  setStatus("Cleared the private browser shelf. Files already written to your chosen folder were not deleted.");
});

void (async () => {
  await loadPreferences();
  await refreshFolderLabel();
  await render();
})();
