const CHUTE_RELAY_DRAG_TYPE = "application/x-chute-item";
const CHUTE_RELAY_PREFIX = "CHUTE_ITEM:";
const CHUTE_RELAY_BASE_URL = "http://127.0.0.1:17891";

function decodeChuteRelayToken(value) {
  const text = String(value || "");
  if (!text.startsWith(CHUTE_RELAY_PREFIX)) return null;
  try {
    const item = JSON.parse(decodeURIComponent(text.slice(CHUTE_RELAY_PREFIX.length)));
    if (!item?.id || !item?.name) return null;
    return {
      id: String(item.id),
      name: String(item.name),
      mime: String(item.mime || "")
    };
  } catch {
    return null;
  }
}

function chuteRelayFileUrl(item) {
  return `${CHUTE_RELAY_BASE_URL}/api/files/${encodeURIComponent(item.id)}`;
}

function chuteRelayFilename(name) {
  return String(name || "file").replace(/[:\r\n]/g, "_");
}

function escapeDragAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addImageDragFallback(transfer, item) {
  if (!String(item.mime || "").toLowerCase().startsWith("image/")) return;

  const url = chuteRelayFileUrl(item);
  const mime = item.mime || "application/octet-stream";

  // Keep Chute's private drag token as the primary transport, but also expose
  // ordinary browser drag formats. This lets extension-owned pages such as
  // FrameChute accept the image even though Chute content scripts cannot be
  // injected into another extension's chrome-extension:// page.
  try { transfer.setData("text/uri-list", url); } catch {}
  try { transfer.setData("text/plain", url); } catch {}
  try {
    transfer.setData(
      "text/html",
      `<img src="${escapeDragAttribute(url)}" alt="${escapeDragAttribute(item.name)}">`
    );
  } catch {}
  try {
    transfer.setData("DownloadURL", `${mime}:${chuteRelayFilename(item.name)}:${url}`);
  } catch {}
}

document.addEventListener("dragstart", (event) => {
  if (!event.dataTransfer) return;
  let token = "";
  try {
    token = event.dataTransfer.getData(CHUTE_RELAY_DRAG_TYPE) ||
      event.dataTransfer.getData("text/plain");
  } catch {}
  const item = decodeChuteRelayToken(token);
  if (!item) return;

  addImageDragFallback(event.dataTransfer, item);
  chrome.runtime.sendMessage({ type: "chute-drag-out-start", file: item }).catch(() => {});
}, false);
