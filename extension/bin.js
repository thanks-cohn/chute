const BASE_URL = "http://127.0.0.1:17891";
const bin = document.querySelector("#bin");
const label = document.querySelector("#label");
const face = document.querySelector("#face");
const count = document.querySelector("#count");
let busy = false;

function safeName(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 180) || fallback;
}

function linkName(url) {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "link");
    return `${safeName(`${parsed.hostname}-${last}`, "browser-link")}.url`;
  } catch {
    return "browser-link.url";
  }
}

async function uploadBlob(blob, name, source = "browser-drop") {
  const response = await fetch(`${BASE_URL}/api/upload`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "X-Chute-Filename": encodeURIComponent(safeName(name, "browser-file")),
      "X-Chute-Mime": blob.type || "application/octet-stream",
      "X-Chute-Source": encodeURIComponent(source)
    },
    body: blob
  });
  if (!response.ok) {
    let message = `Local bridge returned ${response.status}`;
    try {
      const payload = await response.json();
      if (payload.error) message = payload.error;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

function droppedPayloads(transfer) {
  const files = [...(transfer.files || [])];
  if (files.length) {
    return files.map((file) => ({ blob: file, name: file.name, source: "browser-file-drop" }));
  }

  const uri = transfer.getData("text/uri-list")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (uri) {
    const body = `[InternetShortcut]\r\nURL=${uri}\r\n`;
    return [{
      blob: new Blob([body], { type: "application/internet-shortcut" }),
      name: linkName(uri),
      source: uri
    }];
  }

  const text = transfer.getData("text/plain").trim();
  if (text) {
    return [{
      blob: new Blob([`${text}\n`], { type: "text/plain;charset=utf-8" }),
      name: `browser-note-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
      source: location.href
    }];
  }
  return [];
}

function animate(kind) {
  bin.classList.remove("success", "failure");
  void bin.offsetWidth;
  bin.classList.add(kind);
  setTimeout(() => bin.classList.remove(kind), 600);
}

async function refreshCount() {
  try {
    const response = await fetch(`${BASE_URL}/api/files`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    const total = payload.files?.length || 0;
    count.hidden = total === 0;
    count.textContent = total > 99 ? "99+" : String(total);
    label.textContent = "CHUTE";
    face.textContent = "•ᴗ•";
  } catch {
    count.hidden = true;
    label.textContent = "OFF";
    face.textContent = "•︵•";
  }
}

bin.addEventListener("dragenter", (event) => {
  event.preventDefault();
  bin.classList.add("dragover");
});

bin.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  bin.classList.add("dragover");
});

bin.addEventListener("dragleave", () => bin.classList.remove("dragover"));

bin.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  bin.classList.remove("dragover");
  if (busy) return;

  const payloads = droppedPayloads(event.dataTransfer);
  if (!payloads.length) {
    animate("failure");
    label.textContent = "NO FILE";
    setTimeout(refreshCount, 900);
    return;
  }

  busy = true;
  label.textContent = payloads.length > 1 ? `0/${payloads.length}` : "EATING";
  face.textContent = "•◡•";
  try {
    let completed = 0;
    for (const payload of payloads) {
      await uploadBlob(payload.blob, payload.name, payload.source);
      completed += 1;
      if (payloads.length > 1) label.textContent = `${completed}/${payloads.length}`;
    }
    animate("success");
    label.textContent = "GOT IT";
    face.textContent = "^ᴗ^";
    chrome.runtime.sendMessage({ type: "badge-refresh" });
  } catch (error) {
    animate("failure");
    label.textContent = "FAILED";
    face.textContent = "×︵×";
    console.error("Chute drop failed:", error);
  } finally {
    busy = false;
    setTimeout(refreshCount, 900);
  }
});

bin.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "open-side-panel" });
});

window.addEventListener("message", (event) => {
  if (event.data?.type === "chute-drag-active") {
    bin.classList.toggle("active", Boolean(event.data.active));
  }
});

refreshCount();
setInterval(refreshCount, 3000);
