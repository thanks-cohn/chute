const CHUTE_RELAY_DRAG_TYPE = "application/x-chute-item";
const CHUTE_RELAY_PREFIX = "CHUTE_ITEM:";

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

document.addEventListener("dragstart", (event) => {
  if (!event.dataTransfer) return;
  let token = "";
  try {
    token = event.dataTransfer.getData(CHUTE_RELAY_DRAG_TYPE) ||
      event.dataTransfer.getData("text/plain");
  } catch {}
  const item = decodeChuteRelayToken(token);
  if (!item) return;
  chrome.runtime.sendMessage({ type: "chute-drag-out-start", file: item }).catch(() => {});
}, false);
