const CHUTE_BASE_URL = "http://127.0.0.1:17891";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
const CHUTE_THUMB_SIZE = 48;

let chuteActiveFiles = [];
let chuteSyntheticFile = null;
let chuteThumbnailsEnabled = true;
const chuteThumbRepairs = new WeakSet();

async function refreshChuteActiveFiles() {
  try {
    const response = await fetch(`${CHUTE_BASE_URL}/api/files`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    chuteActiveFiles = payload.files || [];
  } catch {}
}

function matchChuteFile(file) {
  if (!(file instanceof File)) return null;
  return chuteActiveFiles.find((item) =>
    item.name === file.name &&
    Number(item.size) === Number(file.size) &&
    (!item.mime || !file.type || item.mime === file.type)
  ) || chuteActiveFiles.find((item) => item.name === file.name && Number(item.size) === Number(file.size)) || null;
}

function chuteToken(item) {
  const payload = encodeURIComponent(JSON.stringify({
    id: item.id,
    name: item.name,
    mime: item.mime || "application/octet-stream"
  }));
  return `${CHUTE_DRAG_PREFIX}${payload}`;
}

try {
  const originalDataTransferAdd = DataTransferItemList.prototype.add;
  DataTransferItemList.prototype.add = function(value, type) {
    if (value instanceof File) chuteSyntheticFile = matchChuteFile(value);
    return type === undefined
      ? originalDataTransferAdd.call(this, value)
      : originalDataTransferAdd.call(this, value, type);
  };
} catch (error) {
  console.warn("Chute could not wrap DataTransferItemList.add:", error);
}

document.addEventListener("dragstart", () => {
  chuteSyntheticFile = null;
}, true);

document.addEventListener("dragstart", (event) => {
  if (!event.dataTransfer) return;

  // Source-address mode already placed an explicit URL on the drag. Leave it
  // alone. File/image mode is converted to a private Chute token instead.
  try {
    if (event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("DownloadURL")) return;
  } catch {}

  const row = event.target instanceof Element ? event.target.closest(".file-row") : null;
  const rowFile = row?.querySelector("img.file-thumb")?.__chuteFile || null;
  const rowName = row?.querySelector(".file-name")?.textContent || "";
  const namedFile = rowName ? chuteActiveFiles.find((item) => item.name === rowName) : null;
  const item = chuteSyntheticFile || rowFile || namedFile;
  if (!item?.id) return;

  const token = chuteToken(item);
  try {
    event.dataTransfer.setData(CHUTE_DRAG_TYPE, token);
    event.dataTransfer.setData("text/plain", token);
  } catch {}
}, false);

function chuteThumbUrl(file) {
  return `${CHUTE_BASE_URL}/api/thumbnails/${encodeURIComponent(file.id)}`;
}

function chuteFileUrl(file) {
  return `${CHUTE_BASE_URL}/api/files/${encodeURIComponent(file.id)}`;
}

async function makeTinyChuteThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(CHUTE_THUMB_SIZE / bitmap.width, CHUTE_THUMB_SIZE / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = CHUTE_THUMB_SIZE;
  canvas.height = CHUTE_THUMB_SIZE;
  const context = canvas.getContext("2d", { alpha: true });
  context.clearRect(0, 0, CHUTE_THUMB_SIZE, CHUTE_THUMB_SIZE);
  context.drawImage(
    bitmap,
    Math.floor((CHUTE_THUMB_SIZE - width) / 2),
    Math.floor((CHUTE_THUMB_SIZE - height) / 2),
    width,
    height
  );
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (thumb) => thumb ? resolve(thumb) : reject(new Error("thumbnail encoding failed")),
      "image/webp",
      0.42
    );
  });
}

async function cachedThumb(file) {
  if (!chuteThumbnailsEnabled) return null;
  const response = await fetch(chuteThumbUrl(file), { cache: "force-cache" });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.size ? blob : null;
}

async function repairChuteThumbnail(img) {
  if (!chuteThumbnailsEnabled || !img.hidden || chuteThumbRepairs.has(img)) return;
  const file = img.__chuteFile;
  if (!file?.id || !String(file.mime || "").startsWith("image/")) return;
  chuteThumbRepairs.add(img);

  try {
    let thumb = await cachedThumb(file);
    if (thumb) {
      img.src = URL.createObjectURL(thumb);
      img.hidden = false;
      return;
    }

    // Give shelf.js's normal generator another moment before doing any work.
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (!chuteThumbnailsEnabled || !img.hidden) return;
    thumb = await cachedThumb(file);
    if (thumb) {
      img.src = URL.createObjectURL(thumb);
      img.hidden = false;
      return;
    }

    const response = await fetch(chuteFileUrl(file), { cache: "no-store" });
    if (!response.ok || !chuteThumbnailsEnabled) return;
    const original = await response.blob();

    try {
      const generated = await makeTinyChuteThumbnail(original);
      if (!chuteThumbnailsEnabled) return;
      img.src = URL.createObjectURL(generated);
      img.hidden = false;
      try {
        await fetch(chuteThumbUrl(file), {
          method: "POST",
          headers: { "Content-Type": "image/webp" },
          body: generated
        });
      } catch {}
    } catch {
      // Visual fallback only. No derivative is written if encoding fails.
      if (!chuteThumbnailsEnabled) return;
      img.src = URL.createObjectURL(original);
      img.hidden = false;
    }
  } catch (error) {
    console.warn("Chute thumbnail repair failed:", error);
  }
}

function scanChuteThumbnails(root = document) {
  if (!chuteThumbnailsEnabled) return;
  for (const img of root.querySelectorAll?.("img.file-thumb") || []) {
    if (!img.hidden) continue;
    setTimeout(() => repairChuteThumbnail(img), 700);
  }
}

const chuteThumbObserver = new MutationObserver((records) => {
  if (!chuteThumbnailsEnabled) return;
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.("img.file-thumb")) setTimeout(() => repairChuteThumbnail(node), 700);
      scanChuteThumbnails(node);
    }
  }
});

chuteThumbObserver.observe(document.documentElement, { childList: true, subtree: true });

chrome.storage.sync.get({ chuteThumbnails: true }, ({ chuteThumbnails }) => {
  chuteThumbnailsEnabled = chuteThumbnails !== false;
  if (chuteThumbnailsEnabled) setTimeout(() => scanChuteThumbnails(), 200);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.chuteThumbnails) return;
  chuteThumbnailsEnabled = changes.chuteThumbnails.newValue !== false;
  if (chuteThumbnailsEnabled) setTimeout(() => scanChuteThumbnails(), 200);
});

refreshChuteActiveFiles();
setInterval(refreshChuteActiveFiles, 2500);
