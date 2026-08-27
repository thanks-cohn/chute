const BASE_URL = "http://127.0.0.1:17891";
const bin = document.querySelector("#bin");
const label = document.querySelector("#label");
const face = document.querySelector("#face");
const count = document.querySelector("#count");
const supportCard = document.querySelector("#support-card");
let busy = false;
let supportHover = false;
let supportTimer = null;
let supportCloseTimer = null;
let pageDragSource = null;
let serverCount = 0;
let pendingSignals = 0;
let optimisticFloor = 0;
let lastSyncOkay = false;
let intakeQueue = Promise.resolve();

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

function firstUriText(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#")) || "";
}

function firstUri(transfer) {
  try {
    return firstUriText(transfer.getData("text/uri-list"));
  } catch {
    return "";
  }
}

function imageFromHtmlText(html) {
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

function imageFromHtml(transfer) {
  try {
    return imageFromHtmlText(transfer.getData("text/html"));
  } catch {
    return null;
  }
}

function canFetchImage(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "data:", "blob:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function fetchImagePayload(candidate) {
  if (!candidate?.url || !canFetchImage(candidate.url)) return null;

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

async function normalizedPayloads({ files = [], uri = "", html = "", text = "", source = null } = {}) {
  const actualFiles = Array.from(files || []).filter((file) => file instanceof Blob);
  if (actualFiles.length) {
    return actualFiles.map((file, index) => ({
      blob: file,
      name: safeName(file.name, `browser-file-${index + 1}`),
      source: "browser-file-drop",
      kind: "file"
    }));
  }

  const htmlImage = imageFromHtmlText(html);
  const candidate = source?.kind === "image" ? source : htmlImage;
  if (candidate?.url) {
    const image = await fetchImagePayload(candidate);
    if (image) return [image];
  }

  const resolvedUri = firstUriText(uri) || candidate?.url || (source?.kind === "link" ? source.url : "");
  if (resolvedUri) {
    const body = `[InternetShortcut]\r\nURL=${resolvedUri}\r\n`;
    return [{
      blob: new Blob([body], { type: "application/internet-shortcut" }),
      name: linkName(resolvedUri),
      source: resolvedUri,
      kind: candidate?.kind === "image" ? "image-link" : "link"
    }];
  }

  const resolvedText = String(text || "").trim() ||
    (source?.kind === "selection" ? String(source.text || "").trim() : "");
  if (resolvedText) {
    return [{
      blob: new Blob([`${resolvedText}\n`], { type: "text/plain;charset=utf-8" }),
      name: `browser-note-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
      source: "browser-selection",
      kind: "text"
    }];
  }

  return [];
}

async function droppedPayloads(transfer) {
  let text = "";
  let html = "";
  try { text = transfer.getData("text/plain"); } catch {}
  try { html = transfer.getData("text/html"); } catch {}
  return normalizedPayloads({
    files: transfer.files ? Array.from(transfer.files) : [],
    uri: firstUri(transfer),
    html,
    text,
    source: pageDragSource || imageFromHtml(transfer)
  });
}

function animate(kind) {
  bin.classList.remove("success", "failure");
  void bin.offsetWidth;
  bin.classList.add(kind);
  setTimeout(() => bin.classList.remove(kind), 420);
}

function renderCount() {
  const total = pendingSignals > 0 ? Math.max(serverCount, optimisticFloor) : serverCount;
  count.hidden = total === 0;
  count.textContent = total > 99 ? "99+" : String(total);
  count.classList.toggle("pending", pendingSignals > 0);
  count.classList.toggle("synced", pendingSignals === 0 && total > 0 && lastSyncOkay);
}

function beginOptimisticIntake(expected = 1) {
  const amount = Math.max(1, Math.trunc(Number(expected) || 1));
  optimisticFloor = Math.max(optimisticFloor, serverCount) + amount;
  pendingSignals += amount;
  lastSyncOkay = false;
  renderCount();
}

function finishOptimisticIntake(expected = 1, succeeded = true) {
  const amount = Math.max(1, Math.trunc(Number(expected) || 1));
  pendingSignals = Math.max(0, pendingSignals - amount);
  if (!succeeded) lastSyncOkay = false;
  if (pendingSignals === 0) optimisticFloor = serverCount;
  renderCount();
}

async function refreshCount() {
  try {
    const response = await fetch(`${BASE_URL}/api/files`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    serverCount = payload.files?.length || 0;
    lastSyncOkay = true;
    renderCount();
    if (!busy && pendingSignals === 0) {
      label.textContent = "CHUTE";
      face.textContent = "•ᴗ•";
    }
  } catch {
    lastSyncOkay = false;
    renderCount();
    if (!busy && pendingSignals === 0) {
      count.hidden = true;
      label.textContent = "OFF";
      face.textContent = "•︵•";
    }
  }
}

function setSupportHover(next) {
  if (supportHover === next) return;
  supportHover = next;
  supportCard.classList.toggle("visible", next);
  supportCard.setAttribute("aria-hidden", String(!next));
  window.parent.postMessage({ type: "chute-support-hover", active: next }, "*");
}

function cancelSupportClose() {
  if (!supportCloseTimer) return;
  clearTimeout(supportCloseTimer);
  supportCloseTimer = null;
}

function scheduleSupportClose() {
  cancelSupportClose();
  supportCloseTimer = setTimeout(() => {
    supportCloseTimer = null;
    setSupportHover(false);
  }, 2000);
}

function setDragVisual(active) {
  bin.classList.toggle("dragover", Boolean(active));
}

bin.addEventListener("pointerenter", () => {
  cancelSupportClose();
  if (supportHover || supportTimer) return;
  supportTimer = setTimeout(() => {
    supportTimer = null;
    setSupportHover(true);
  }, 280);
});

bin.addEventListener("pointerleave", () => {
  if (supportTimer) {
    clearTimeout(supportTimer);
    supportTimer = null;
  }
  if (supportHover) scheduleSupportClose();
});

supportCard.addEventListener("pointerenter", () => {
  cancelSupportClose();
  setSupportHover(true);
});
supportCard.addEventListener("pointerleave", () => scheduleSupportClose());
supportCard.addEventListener("click", (event) => event.stopPropagation());

async function consumePayloadsNow(payloadPromise, expected) {
  busy = true;
  setDragVisual(false);
  cancelSupportClose();
  setSupportHover(false);
  label.textContent = pendingSignals > expected ? "QUEUED" : "READING";
  face.textContent = "•◡•";

  let succeeded = false;
  try {
    const payloads = await payloadPromise;
    if (!payloads.length) throw new Error("No usable drop data");

    label.textContent = payloads.length > 1 ? `0/${payloads.length}` : "EATING";
    let completed = 0;
    let usedImageFallback = false;
    for (const payload of payloads) {
      await uploadBlob(payload.blob, payload.name, payload.source);
      completed += 1;
      usedImageFallback ||= payload.kind === "image-link";
      if (payloads.length > 1) label.textContent = `${completed}/${payloads.length}`;
    }

    await refreshCount();
    succeeded = true;
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
    finishOptimisticIntake(expected, succeeded);
    busy = false;
    pageDragSource = null;
    await refreshCount();
  }
}

function enqueuePayloads(payloadPromise, expected = 1) {
  const amount = Math.max(1, Math.trunc(Number(expected) || 1));
  beginOptimisticIntake(amount);
  intakeQueue = intakeQueue.then(
    () => consumePayloadsNow(payloadPromise, amount),
    () => consumePayloadsNow(payloadPromise, amount)
  );
}

bin.addEventListener("dragenter", (event) => {
  event.preventDefault();
  setDragVisual(true);
});

bin.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  setDragVisual(true);
});

bin.addEventListener("dragleave", (event) => {
  if (!bin.contains(event.relatedTarget)) setDragVisual(false);
});

bin.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const expected = event.dataTransfer?.files?.length || 1;
  enqueuePayloads(droppedPayloads(event.dataTransfer), expected);
});

// A normal click is reserved for cycling Chutey's idle/default expression.
// Double-click keeps the established shortcut for opening the Shelf.
bin.addEventListener("dblclick", () => {
  window.parent.postMessage({ type: "chute-open-side-panel" }, "*");
});

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;

  if (event.data?.type === "chute-page-drag-source") {
    pageDragSource = event.data.source || null;
    return;
  }

  if (event.data?.type === "chute-page-drop-active") {
    setDragVisual(event.data.active);
    return;
  }

  if (event.data?.type === "chute-force-support-closed") {
    if (supportTimer) {
      clearTimeout(supportTimer);
      supportTimer = null;
    }
    cancelSupportClose();
    setSupportHover(false);
    return;
  }

  if (event.data?.type === "chute-page-drop") {
    const drop = event.data.drop || {};
    const expected = Array.from(drop.files || []).length || 1;
    enqueuePayloads(normalizedPayloads(drop), expected);
  }
});

window.parent.postMessage({ type: "chute-request-drag-source" }, "*");
refreshCount();
setInterval(refreshCount, 1200);
