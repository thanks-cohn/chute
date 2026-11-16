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
let successFeedbackTimer = null;
let pageDragSource = null;
let serverCount = 0;
let pendingSignals = 0;
let optimisticFloor = 0;
let lastSyncOkay = false;
let intakeQueue = Promise.resolve();
let countRefresh = null, countTimer = null, lastIntakeProblem = null;

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
    const error=new Error(message);error.status=response.status;throw error;
  }
  const receipt = await response.json();
  if (!/^[a-f0-9]{32}$/.test(receipt?.file?.id || '') || receipt.file.size !== blob.size) {
    throw new Error('Save receipt is incomplete. Check the basket before retrying.');
  }
  return receipt;
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

function showSuccessFeedback() {
  if (successFeedbackTimer) clearTimeout(successFeedbackTimer);
  animate("success");
  label.textContent = "YUMMY";
  face.textContent = "^ ^";
  count.animate([
    { transform: "scale(1)" },
    { transform: "scale(1.28)" },
    { transform: "scale(1)" }
  ], { duration: 420, easing: "ease-out" });
  successFeedbackTimer = setTimeout(() => {
    successFeedbackTimer = null;
    if (lastSyncOkay) {
      label.textContent = "CHUTE";
      face.textContent = "•ᴗ•";
    }
  }, 850);
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

function applyCount(snapshot) {
  if (!snapshot || !Number.isSafeInteger(snapshot.count)) return;
  serverCount = snapshot.count; lastSyncOkay = snapshot.connected === true;
  renderCount();
  if (!busy && pendingSignals === 0 && !successFeedbackTimer) {
    label.textContent = lastSyncOkay ? (lastIntakeProblem === "uncertain" ? "CHECK" : lastIntakeProblem === "failed" ? "FAILED" : "CHUTE"):"OFF";
    face.textContent = lastSyncOkay ? "•ᴗ•":"•︵•";
  }
  if (!lastSyncOkay) bin.title = ({
    legacy_helper_requires_user_action:'Start the existing companion normally. Safe automatic recovery requires the matching isolated test helper.',
    native_forbidden:'The native helper is not authorized for this extension. Check the matching test pair and enrollment.',
    live_process_unresponsive:'The companion is alive but not responding. Chutey has not stopped it or replayed a save.',
    process_identity_unknown:'Recovery paused because the companion process identity could not be verified.',
    circuit_cooldown:'Automatic reconnect is cooling down after repeated failures. Check the companion and available resources.'
  })[snapshot.reason] || "Companion unavailable. Chutey will retry while this tab is active.";
  else bin.title = lastIntakeProblem ? "Save was not confirmed. Check the basket before retrying; no automatic resubmission was made." : "Drop files here to send them to Chute";
}
async function refreshCount(changed = false) {
  if (countRefresh && !changed) return countRefresh;
  const operation = chrome.runtime.sendMessage({type:changed ? 'chute-count-changed':'chute-count-status'})
    .then(applyCount).catch(() => {
      lastSyncOkay = false; renderCount();
      bin.title = 'Extension connection unavailable. Check that Chutey is enabled, then reload this page.';
    });
  if (changed) return operation;
  countRefresh=operation.finally(()=>{countRefresh=null;});return countRefresh;
}
function scheduleCount() {
  clearTimeout(countTimer); countTimer=null;
  if (document.hidden) return;
  countTimer=setTimeout(async()=>{await refreshCount();scheduleCount();},30000);
}
document.addEventListener('visibilitychange',()=>{
  if (!document.hidden) void refreshCount();
  scheduleCount();
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if (area==='session' && changes.chuteyCountStatus?.newValue) applyCount(changes.chuteyCountStatus.newValue);
});

function setSupportHover(next) {
  if (!supportCard) return;
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
  if (!supportCard) return;
  cancelSupportClose();
  supportCloseTimer = setTimeout(() => {
    supportCloseTimer = null;
    setSupportHover(false);
  }, 2000);
}

function setDragVisual(active) {
  bin.classList.toggle("dragover", Boolean(active));
}

// Native context menus can blur the tab and move the pointer out of the frame.
// Pin only visibility; preserve the existing right-click menu and mascot art.
bin.addEventListener("pointerdown", () => { window.parent.postMessage({type:"chute-mascot-context",active:false},"*"); });
bin.addEventListener("contextmenu", () => {
  cancelSupportClose();
  window.parent.postMessage({type:"chute-mascot-context",active:true},"*");
});

bin.addEventListener("pointerenter", () => {
  if (!supportCard) return;
  cancelSupportClose();
  if (supportHover || supportTimer) return;
  supportTimer = setTimeout(() => {
    supportTimer = null;
    setSupportHover(true);
  }, 280);
});

bin.addEventListener("pointerleave", () => {
  if (!supportCard) return;
  if (supportTimer) {
    clearTimeout(supportTimer);
    supportTimer = null;
  }
  if (supportHover) scheduleSupportClose();
});

supportCard?.addEventListener("pointerenter", () => {
  cancelSupportClose();
  setSupportHover(true);
});
supportCard?.addEventListener("pointerleave", () => scheduleSupportClose());
supportCard?.addEventListener("click", (event) => event.stopPropagation());

async function consumePayloadsNow(payloadPromise, expected) {
  busy = true;lastIntakeProblem=null;
  if (successFeedbackTimer) {clearTimeout(successFeedbackTimer);successFeedbackTimer=null;}
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
    for (const payload of payloads) {
      await uploadBlob(payload.blob, payload.name, payload.source);
      completed += 1;
      if (payloads.length > 1) label.textContent = `${completed}/${payloads.length}`;
    }

    // A count request must never delay the original receipt reaction.
    succeeded = true;
    showSuccessFeedback();
    window.parent.postMessage({type:"chute-intake-state",active:true,outcome:"saved"},"*");
    void refreshCount(true);
    await new Promise(resolve=>setTimeout(resolve,420));
  } catch (error) {
    lastIntakeProblem=error.status>=400 && error.status<500 ? "failed":"uncertain";
    animate("failure");
    label.textContent = "FAILED";
    face.textContent = "×︵×";
    bin.title = "Save was not confirmed. Check the basket before retrying; no automatic resubmission was made.";
    console.error("Chute drop was not confirmed.");
  } finally {
    finishOptimisticIntake(expected, succeeded);
    busy = false;
    pageDragSource = null;
    window.parent.postMessage({type:"chute-intake-state",active:pendingSignals>0,outcome:succeeded?"saved":"unconfirmed"},"*");
    if (!succeeded) { void refreshCount(true); void window.ChuteNativeWake?.wake(); }
  }
}

function enqueuePayloads(payloadPromise, expected = 1) {
  const amount = Math.max(1, Math.trunc(Number(expected) || 1));
  beginOptimisticIntake(amount);
  window.parent.postMessage({type:"chute-intake-state",active:true},"*");
  intakeQueue = intakeQueue.then(
    () => consumePayloadsNow(payloadPromise, amount),
    () => consumePayloadsNow(payloadPromise, amount)
  );
}

// Keep direct iframe drops as a fallback. The primary path is routed by
// content.js so Chromium cannot lose the drop at the page/extension boundary.
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

bin.addEventListener("click", () => {
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
scheduleCount();
