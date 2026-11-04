const BASE_URL = "http://127.0.0.1:17891";
const THUMB_SIZE = 48;
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
const generatedThumbs = new Set();

let displayLimit = 40;
let currentPage = 0;
let hasMorePages = false;
let historyRequestToken = 0;
let showThumbnails = true;
let dragOutMode = "file";
let selectedDay = "";
let loadedCount = 0;
let previousDate = null;
let nextDate = null;
let currentDate = null;
let loadingHistory = false;
let dragOutActive = false;
let dragGeometrySnapshot = null;
let lastLatestHistorySignature = null;
let latestHistoryCheckInFlight = false;

const listElement = document.querySelector("#files");
const statusElement = document.querySelector("#status");
const clearButton = document.querySelector("#clear");
const refreshButton = document.querySelector("#refresh");
const historyDateInput = document.querySelector("#history-date");
const historyPrevButton = document.querySelector("#history-prev");
const historyNextButton = document.querySelector("#history-next");
const historyLatestButton = document.querySelector("#history-latest");
const sentinel = document.querySelector("#history-sentinel");
const pageNav = document.querySelector("#history-pagination");
const pagePrevButton = document.querySelector("#history-page-prev");
const pageNextButton = document.querySelector("#history-page-next");
const pageLabel = document.querySelector("#history-page-label");

function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = units[0];
  for (const candidate of units) {
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) break;
    value /= 1024;
  }
  return `${value < 10 && unit !== "B" ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Consistent vector fallbacks instead of OS-dependent emoji glyphs.
function fileKind(file) {
  const mime = String(file.mime || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(name)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (/\.(zip|7z|rar|tar|gz)$/.test(name)) return "archive";
  if (name.endsWith(".url") || name.endsWith(".webloc")) return "link";
  if (mime.startsWith("text/") || /\.(txt|md|csv|json|log)$/.test(name)) return "text";
  return "file";
}

function isPreviewableImage(file) {
  // A local image preview needs actual image bytes. .url Internet shortcuts
  // do not contain the original picture and must never be misidentified.
  // Some saved images have application/octet-stream MIME despite a valid
  // image extension; attempt to decode those rather than defaulting to icons.
  return fileKind(file) === "image";
}

function iconFor(file) {
  const kind = fileKind(file);
  const shapes = {
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.3"/><path d="m5 17 5-5 3 3 2-2 4 4"/>',
    pdf: '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5M8 15h8M8 18h5"/>',
    archive: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 4v2m0 2v2m0 2v2M9.5 16h5v3h-5z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.2.4l2.6-2.6a5 5 0 0 0-7.1-7.1l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.2-.4l-2.6 2.6a5 5 0 0 0 7.1 7.1l1.5-1.5"/>',
    text: '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5M8 11h8M8 14h8M8 17h5"/>',
    file: '<path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5"/>'
  };
  return `<svg class="file-type-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind]}</svg>`;
}

function fileUrl(file) {
  return `${BASE_URL}/api/files/${encodeURIComponent(file.id)}`;
}

function thumbnailUrl(file) {
  return `${BASE_URL}/api/thumbnails/${encodeURIComponent(file.id)}`;
}

function dragFilename(name) {
  return String(name || "file").replace(/[:\r\n]/g, "_");
}

function chuteToken(file) {
  return `${CHUTE_DRAG_PREFIX}${encodeURIComponent(JSON.stringify({
    id: file.id,
    name: file.name,
    mime: file.mime || "application/octet-stream"
  }))}`;
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store", ...options });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.error || "";
    } catch {}
    throw new Error(detail || `Local bridge returned ${response.status}`);
  }
  return response;
}

function canvasThumbnail(blob) {
  return createImageBitmap(blob).then((bitmap) => {
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
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (thumb) => thumb ? resolve(thumb) : reject(new Error("Could not generate thumbnail")),
        "image/webp",
        0.42
      );
    });
  });
}

async function ensureThumbnail(file, img) {
  if (!showThumbnails || !isPreviewableImage(file) || generatedThumbs.has(file.id)) return;

  try {
    const cached = await fetch(thumbnailUrl(file), { cache: "force-cache" });
    if (cached.ok) {
      const blob = await cached.blob();
      if (blob.size) {
        img.src = URL.createObjectURL(blob);
        img.hidden = false;
        generatedThumbs.add(file.id);
        return;
      }
    }

    const response = await api(`/api/files/${encodeURIComponent(file.id)}`);
    const source = await response.blob();
    const thumbnail = await canvasThumbnail(source);
    img.src = URL.createObjectURL(thumbnail);
    img.hidden = false;

    await fetch(thumbnailUrl(file), {
      method: "POST",
      headers: { "Content-Type": "image/webp" },
      body: thumbnail
    });
    generatedThumbs.add(file.id);
  } catch (error) {
    img.hidden = true;
    console.warn("Chute thumbnail generation failed:", error);
  }
}

const thumbObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    // Observe the visible icon box, not a hidden <img> (which cannot intersect).
    const icon = entry.target;
    thumbObserver.unobserve(icon);
    const img = icon.querySelector(".file-thumb");
    const file = img?.__chuteFile;
    if (file && img.isConnected) ensureThumbnail(file, img);
  }
}, { rootMargin: "180px" });

function lockPopupGeometry() {
  if (!location.pathname.endsWith("/popup.html") || dragGeometrySnapshot) return;
  const root = document.documentElement;
  const body = document.body;
  const rect = root.getBoundingClientRect();
  dragGeometrySnapshot = {
    rootStyle: root.getAttribute("style"),
    bodyStyle: body.getAttribute("style")
  };
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  root.style.width = `${width}px`;
  root.style.minWidth = `${width}px`;
  root.style.maxWidth = `${width}px`;
  root.style.height = `${height}px`;
  root.style.minHeight = `${height}px`;
  root.style.maxHeight = `${height}px`;
  body.style.width = `${width}px`;
  body.style.minWidth = `${width}px`;
  body.style.maxWidth = `${width}px`;
  body.style.height = `${height}px`;
  body.style.minHeight = `${height}px`;
  body.style.maxHeight = `${height}px`;
  body.style.overflow = "auto";
}

function unlockPopupGeometry() {
  if (!dragGeometrySnapshot) return;
  const root = document.documentElement;
  const body = document.body;
  if (dragGeometrySnapshot.rootStyle === null) root.removeAttribute("style");
  else root.setAttribute("style", dragGeometrySnapshot.rootStyle);
  if (dragGeometrySnapshot.bodyStyle === null) body.removeAttribute("style");
  else body.setAttribute("style", dragGeometrySnapshot.bodyStyle);
  dragGeometrySnapshot = null;
}

function beginDragOut() {
  dragOutActive = true;
  lockPopupGeometry();
}

function endDragOut() {
  dragOutActive = false;
  setTimeout(unlockPopupGeometry, 120);
}

function createRow(file, index) {
  const row = document.createElement("article");
  row.className = `file-row${file.active ? "" : " archived"}`;
  row.dataset.chuteId = file.id;
  const state = file.active
    ? dragOutMode === "source" ? "Drag address" : "DRAG ME!"
    : "In history";

  row.innerHTML = `
    <div class="file-icon" data-kind="${fileKind(file)}">
      <span class="file-fallback" aria-hidden="true">${iconFor(file)}</span>
    </div>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
      <div class="file-meta">${formatSize(file.size)} · ${formatWhen(file.created_at)} · <span class="file-state">${state}</span></div>
    </div>
    <div class="file-tools"></div>`;

  const icon = row.querySelector(".file-icon");
  let thumb = null;
  if (showThumbnails && isPreviewableImage(file)) {
    thumb = document.createElement("img");
    thumb.className = "file-thumb";
    thumb.alt = "";
    thumb.hidden = true;
    thumb.draggable = false;
    thumb.__chuteFile = file;
    icon.append(thumb);

    // Browser side panels, popups and headless Chrome can defer an
    // IntersectionObserver callback until after the user sees the Shelf.
    // Eagerly load only the first visible rows; later rows stay lazy.
    // Defer until the row is in the DOM and workflow-fixes.js has loaded.
    if (index < 8) {
      queueMicrotask(() => {
        if (thumb.isConnected) ensureThumbnail(file, thumb);
      });
    } else {
      thumbObserver.observe(icon);
    }
  }

  const tools = row.querySelector(".file-tools");

  if (file.active) {
    row.draggable = true;
    row.classList.add("ready");

    const open = document.createElement("button");
    open.className = "secondary-button open";
    open.title = "Show this saved file in your computer's file manager";
    open.textContent = "Open";

    const remove = document.createElement("button");
    remove.className = "icon-button remove";
    remove.title = "Remove from the live chute";
    remove.textContent = "×";
    tools.append(open, remove);

    row.addEventListener("dragstart", (event) => {
      const transfer = event.dataTransfer;
      if (!transfer) return;
      beginDragOut();

      if (dragOutMode === "source") {
        const url = fileUrl(file);
        const mime = file.mime || "application/octet-stream";
        transfer.effectAllowed = "copyLink";
        transfer.setData("text/uri-list", url);
        transfer.setData("text/plain", url);
        transfer.setData("DownloadURL", `${mime}:${dragFilename(file.name)}:${url}`);
      } else {
        const token = chuteToken(file);
        transfer.effectAllowed = "copy";
        transfer.setData(CHUTE_DRAG_TYPE, token);
      }

      if (thumb && !thumb.hidden) {
        try { transfer.setDragImage(thumb, THUMB_SIZE / 2, THUMB_SIZE / 2); } catch {}
      }
    });

    row.addEventListener("dragend", endDragOut);

    open.addEventListener("click", async () => {
      open.disabled = true;
      try {
        // Successful Open is self-evident in the OS file manager.
        // Preserve the current Shelf status instead of printing internal feedback.
        await api(`/api/reveal/${encodeURIComponent(file.id)}`, { method: "POST" });
      } catch (error) {
        setStatus(error.message || "Could not open the file location.", true);
      } finally {
        open.disabled = false;
      }
    });

    remove.addEventListener("click", async () => {
      await api(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      await resetHistory();
    });
  } else {
    const recall = document.createElement("button");
    recall.className = "secondary-button recall";
    recall.title = "Put this item back into the live Chute";
    recall.textContent = "Recall";
    tools.append(recall);
    recall.addEventListener("click", async () => {
      try {
        await api(`/api/recall/${encodeURIComponent(file.id)}`, { method: "POST" });
        await resetHistory();
        setStatus(`Recalled ${file.name}`);
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  return row;
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function setStatus(message, error = false) {
  if (!statusElement || dragOutActive) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
  if (location.pathname.endsWith("/shelf.html")) statusElement.hidden = !error;
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    chutePageSize: 40,
    chuteThumbnails: true,
    chuteDragOutMode: "file"
  });
  const next = Number(settings.chutePageSize);
  displayLimit = location.pathname.endsWith("/popup.html") ? 30
    : Number.isFinite(next) && next >= 1
      ? Math.min(500, Math.trunc(next)) : 40;
  showThumbnails = settings.chuteThumbnails !== false;
  dragOutMode = settings.chuteDragOutMode === "source" ? "source" : "file";
}

async function fetchHistoryPage(day = null, page = currentPage) {
  const params = new URLSearchParams({
    scope: "history",
    page: String(page),
    limit: String(displayLimit)
  });
  if (day) params.set("date", day);
  const response = await api(`/api/browse?${params}`);
  return response.json();
}

// Only rebuild the current page when a save or its state actually changes.
function latestHistorySignature(payload) {
  return JSON.stringify([
    payload.date || null,
    Boolean(payload.has_more),
    (payload.files || []).map((file) => [file.id, Boolean(file.active)])
  ]);
}

function updatePageControls(payload) {
  hasMorePages = Boolean(payload.has_more);
  if (pagePrevButton) pagePrevButton.disabled = currentPage === 0;
  if (pageNextButton) pageNextButton.disabled = !hasMorePages;
  if (pageLabel) pageLabel.textContent = `Page ${currentPage + 1}`;
  if (pageNav) pageNav.hidden = currentPage === 0 && !hasMorePages;
}

function updateHistoryNavigation(payload) {
  currentDate = payload.date;
  previousDate = payload.previous_date;
  nextDate = payload.next_date;
  if (historyDateInput && currentDate && selectedDay) historyDateInput.value = currentDate;
  if (historyPrevButton) historyPrevButton.disabled = !previousDate;
  if (historyNextButton) historyNextButton.disabled = !nextDate;
}

async function resetHistory(day = selectedDay || null) {
  if (dragOutActive) return;
  const token = ++historyRequestToken;
  try {
    // Fetch first: an unavailable companion should not blank the existing rows.
    const payload = await fetchHistoryPage(day, currentPage);
    if (token !== historyRequestToken) return;
    if (currentPage > 0 && !payload.files.length) {
      currentPage -= 1;
      await resetHistory(day);
      return;
    }
    loadedCount = payload.files.length;
    generatedThumbs.clear();
    thumbObserver.disconnect();
    listElement.replaceChildren();

    updateHistoryNavigation(payload);
    updatePageControls(payload);
    if (!day && currentPage === 0) {
      lastLatestHistorySignature = latestHistorySignature(payload);
    }

    if (!payload.files.length) {
      if (day) {
        listElement.innerHTML = `<div class="empty"><strong>No Chute history for ${escapeHtml(day)}.</strong>Choose another day or return to Latest.</div>`;
        setStatus("No history for that day");
      } else {
        listElement.innerHTML = `<div class="empty"><strong>Nothing in Chute history yet.</strong>Drop an image or run <code>chute ./some-file</code>.</div>`;
        setStatus("Local bridge connected · history preserved");
      }
      return;
    }

    for (const [index, file] of payload.files.entries()) {
      listElement.append(createRow(file, index));
    }
    const from = currentPage * displayLimit + 1;
    const to = from + loadedCount - 1;
    setStatus(`${from}–${to} in ${day || "all history"} · page ${currentPage + 1}`);
    chrome.runtime.sendMessage({ type: "badge-refresh" });
  } catch (error) {
    if (token !== historyRequestToken) return;
    setStatus(error.message || "Cannot reach 127.0.0.1:17891", true);
    console.warn("Chute history page failed:", error);
  }
}

historyDateInput?.addEventListener("change", async () => {
  selectedDay = historyDateInput.value || "";
  currentPage = 0;
  await resetHistory(selectedDay || null);
});

historyPrevButton?.addEventListener("click", async () => {
  if (!previousDate) return;
  selectedDay = previousDate;
  currentPage = 0;
  if (historyDateInput) historyDateInput.value = selectedDay;
  await resetHistory(selectedDay);
});

historyNextButton?.addEventListener("click", async () => {
  if (!nextDate) return;
  selectedDay = nextDate;
  currentPage = 0;
  if (historyDateInput) historyDateInput.value = selectedDay;
  await resetHistory(selectedDay);
});

historyLatestButton?.addEventListener("click", async () => {
  selectedDay = "";
  currentPage = 0;
  if (historyDateInput) historyDateInput.value = "";
  await resetHistory();
});

pagePrevButton?.addEventListener("click", async () => {
  if (currentPage === 0 || dragOutActive) return;
  currentPage -= 1;
  await resetHistory();
  window.scrollTo(0, 0);
});

pageNextButton?.addEventListener("click", async () => {
  if (!hasMorePages || dragOutActive) return;
  currentPage += 1;
  await resetHistory();
  window.scrollTo(0, 0);
});

clearButton?.addEventListener("click", async () => {
  try {
    const response = await api("/api/clear", { method: "POST" });
    const result = await response.json();
    await resetHistory();
    setStatus(`Cleared ${result.removed} item${result.removed === 1 ? "" : "s"} · preserved for Recall`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

refreshButton?.addEventListener("click", () => resetHistory());

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;
  if (changes.chutePageSize || changes.chuteThumbnails || changes.chuteDragOutMode) {
    await loadSettings();
    currentPage = 0;
    await resetHistory();
  }
});

loadSettings().then(() => resetHistory());

async function refreshLatestIfChanged() {
  if (latestHistoryCheckInFlight || dragOutActive || selectedDay || currentPage !== 0 ||
      document.querySelector("#chutey-explorer-view:not([hidden])") ||
      location.pathname.endsWith("/popup.html") || window.scrollY >= 8) return;
  latestHistoryCheckInFlight = true;
  try {
    const payload = await fetchHistoryPage(null, 0);
    if (latestHistorySignature(payload) !== lastLatestHistorySignature) {
      await resetHistory();
    }
  } catch (error) {
    // A transient bridge failure must not repeatedly erase visible history.
    console.warn("Chute background history check failed:", error);
  } finally {
    latestHistoryCheckInFlight = false;
  }
}

setInterval(refreshLatestIfChanged, 5000);
