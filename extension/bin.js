const BASE_URL = "http://127.0.0.1:17891";
const bin = document.querySelector("#bin");
const label = document.querySelector("#label");
const face = document.querySelector("#face");
const count = document.querySelector("#count");
const supportCard = document.querySelector("#support-card");
let busy = false;
let supportHover = false;
let supportIntroduced = false;
let supportTimer = null;
let pageDragSource = null;

function safeName(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[\\/:*?"<>|\r\n]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 180) || fallback;
}

function urlFileName(url, fallback = "browser-image") {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "");
    return safeName(last, fallback);
  } catch {
    return fallback;
  }
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

function extensionForMime(mime) {
  const subtype = String(mime || "").split("/")[1]?.split("+")[0]?.toLowerCase();
  if (!subtype) return "img";
  if (subtype === "jpeg") return "jpg";
  if (subtype === "svg+xml") return "svg";
  return subtype.replace(/[^a-z0-9]/g, "") || "img";
}

function imageName(url, mime, suggested = "") {
  let name = safeName(suggested, "") || urlFileName(url, "browser-image");
  if (!/\.[a-z0-9]{2,8}$/i.test(name)) {
    name = `${name}.${extensionForMime(mime)}`;
  }
  return name;
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

function firstUri(transfer) {
  return transfer.getData("text/uri-list")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) || "";
}

function imageFromHtml(transfer) {
  const html = transfer.getData("text/html");
  if (!html) return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const image = doc.querySelector("img[src]");
    if (!image) return null;
    return {
      kind: "image",
      url: image.src,
      name: safeName(image.alt || image.getAttribute("aria-label") || "", "")
    };
  } catch {
    return null;
  }
}

function permissionPattern(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return null;
  }
}

async function requestImagePermission(url) {
  const pattern = permissionPattern(url);
  if (!pattern || !chrome.permissions?.request) return true;
  try {
    // Calling request directly from the drop gesture keeps Chromium's user-
    // gesture requirement intact. Already-granted origins resolve silently.
    return await chrome.permissions.request({ origins: [pattern] });
  } catch (error) {
    console.warn("Chute could not request image access:", error);
    return false;
  }
}

async function fetchImagePayload(candidate) {
  if (!candidate?.url) return null;
  const allowed = await requestImagePermission(candidate.url);
  if (!allowed) return null;

  try {
    const response = await fetch(candidate.url, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const mime = blob.type || response.headers.get("Content-Type") || "";
    if (!mime.toLowerCase().startsWith("image/")) return null;
    return {
      blob,
      name: imageName(candidate.url, mime, candidate.name),
      source: candidate.url,
      kind: "image"
    };
  } catch (error) {
    console.warn("Chute could not capture dragged image bytes:", error);
    return null;
  }
}

async function droppedPayloads(transfer) {
  const files = [...(transfer.files || [])];
  if (files.length) {
    return files.map((file) => ({
      blob: file,
      name: file.name,
      source: "browser-file-drop",
      kind: "file"
    }));
  }

  const htmlImage = imageFromHtml(transfer);
  const candidate = pageDragSource?.kind === "image" ? pageDragSource : htmlImage;
  if (candidate?.url) {
    const image = await fetchImagePayload(candidate);
    if (image) return [image];
  }

  const uri = firstUri(transfer) || candidate?.url || (pageDragSource?.kind === "link" ? pageDragSource.url : "");
  if (uri) {
    const body = `[InternetShortcut]\r\nURL=${uri}\r\n`;
    return [{
      blob: new Blob([body], { type: "application/internet-shortcut" }),
      name: linkName(uri),
      source: uri,
      kind: candidate?.kind === "image" ? "image-link" : "link"
    }];
  }

  const text = transfer.getData("text/plain").trim() ||
    (pageDragSource?.kind === "selection" ? pageDragSource.text : "");
  if (text) {
    return [{
      blob: new Blob([`${text}\n`], { type: "text/plain;charset=utf-8" }),
      name: `browser-note-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
      source: "browser-selection",
      kind: "text"
    }];
  }
  return [];
}

function animate(kind) {
  bin.classList.remove("success", "failure");
  void bin.offsetWidth;
  bin.classList.add(kind);
  setTimeout(() => bin.classList.remove(kind), 420);
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

function setSupportHover(next) {
  if (supportHover === next) return;
  supportHover = next;
  supportCard.classList.toggle("visible", next);
  supportCard.setAttribute("aria-hidden", String(!next));
  window.parent.postMessage({ type: "chute-support-hover", active: next }, "*");
}

bin.addEventListener("pointerenter", () => {
  if (supportIntroduced || supportTimer) return;
  supportTimer = setTimeout(() => {
    supportTimer = null;
    supportIntroduced = true;
    setSupportHover(true);
  }, 450);
});

bin.addEventListener("pointerleave", (event) => {
  if (supportTimer) {
    clearTimeout(supportTimer);
    supportTimer = null;
  }
  if (supportCard.contains(event.relatedTarget)) return;
  setSupportHover(false);
});
supportCard.addEventListener("pointerenter", () => setSupportHover(true));
supportCard.addEventListener("pointerleave", () => setSupportHover(false));
supportCard.addEventListener("click", (event) => event.stopPropagation());

bin.addEventListener("dragenter", (event) => {
  event.preventDefault();
  bin.classList.add("dragover");
});

bin.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  bin.classList.add("dragover");
});

bin.addEventListener("dragleave", (event) => {
  if (!bin.contains(event.relatedTarget)) bin.classList.remove("dragover");
});

bin.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  bin.classList.remove("dragover");
  setSupportHover(false);
  if (busy) return;

  busy = true;
  label.textContent = "READING";
  face.textContent = "•◡•";

  try {
    const payloads = await droppedPayloads(event.dataTransfer);
    if (!payloads.length) {
      animate("failure");
      label.textContent = "NO DATA";
      face.textContent = "×︵×";
      return;
    }

    label.textContent = payloads.length > 1 ? `0/${payloads.length}` : "EATING";
    let completed = 0;
    let usedImageFallback = false;
    for (const payload of payloads) {
      await uploadBlob(payload.blob, payload.name, payload.source);
      completed += 1;
      usedImageFallback ||= payload.kind === "image-link";
      if (payloads.length > 1) label.textContent = `${completed}/${payloads.length}`;
    }
    animate("success");
    label.textContent = usedImageFallback ? "LINK SAVED" : "GOT IT";
    face.textContent = "^ᴗ^";
    chrome.runtime.sendMessage({ type: "badge-refresh" });
  } catch (error) {
    animate("failure");
    label.textContent = "FAILED";
    face.textContent = "×︵×";
    console.error("Chute drop failed:", error);
  } finally {
    busy = false;
    pageDragSource = null;
    setTimeout(refreshCount, 1100);
  }
});

bin.addEventListener("click", () => {
  window.parent.postMessage({ type: "chute-open-side-panel" }, "*");
});

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "chute-page-drag-source") {
    pageDragSource = event.data.source || null;
  }
});

window.parent.postMessage({ type: "chute-request-drag-source" }, "*");
refreshCount();
setInterval(refreshCount, 3000);
