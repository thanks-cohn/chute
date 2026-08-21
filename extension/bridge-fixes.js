const CHUTE_BASE_URL = "http://127.0.0.1:17891";
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
const CHUTE_THUMB_SIZE = 48;

let chuteActiveFiles = [];
let chuteSyntheticFile = null;
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

const originalDataTransferAdd = DataTransferItemList.prototype.add;
DataTransferItemList.prototype.add = function(value, type) {
  if (value instanceof File) chuteSyntheticFile = matchChuteFile(value);
  return type === undefined
    ? originalDataTransferAdd.call(this, value)
    : originalDataTransferAdd.call(this, value, type);
};

document.addEventListener("dragstart", () => {
  chuteSyntheticFile = null;
}, true);

document.addEventListener("dragstart", (event) => {
  if (!chuteSyntheticFile || !event.dataTransfer) return;
  const token = chuteToken(chuteSyntheticFile);
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
  const response = await fetch(chuteThumbUrl(file), { cache: "force-cache" });
  if (!response.ok) return null;
  const blob = await response.blob();
  return blob.size ? blob : null;
}

async function repairChuteThumbnail(img) {
  if (!img.hidden || chuteThumbRepairs.has(img)) return;
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
    if (!img.hidden) return;
    thumb = await cachedThumb(file);
    if (thumb) {
      img.src = URL.createObjectURL(thumb);
      img.hidden = false;
      return;
    }

    const response = await fetch(chuteFileUrl(file), { cache: "no-store" });
    if (!response.ok) return;
    const original = await response.blob();

    try {
      thumb = await makeTinyChuteThumbnail(original);
      img.src = URL.createObjectURL(thumb);
      img.hidden = false;
      try {
        await fetch(chuteThumbUrl(file), {
          method: "POST",
          headers: { "Content-Type": "image/webp" },
          body: thumb
        });
      } catch {}
    } catch {
      // Reuse the already-fetched blob as a visual fallback. This is not a
      // second processed copy and does not replace the original Chute file.
      img.src = URL.createObjectURL(original);
      img.hidden = false;
    }
  } catch (error) {
    console.warn("Chute thumbnail repair failed:", error);
  }
}

function scanChuteThumbnails(root = document) {
  for (const img of root.querySelectorAll?.("img.file-thumb") || []) {
    if (!img.hidden) continue;
    setTimeout(() => repairChuteThumbnail(img), 700);
  }
}

const chuteThumbObserver = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.("img.file-thumb")) setTimeout(() => repairChuteThumbnail(node), 700);
      scanChuteThumbnails(node);
    }
  }
});

chuteThumbObserver.observe(document.documentElement, { childList: true, subtree: true });
refreshChuteActiveFiles();
setInterval(refreshChuteActiveFiles, 2500);
setTimeout(() => scanChuteThumbnails(), 800);
