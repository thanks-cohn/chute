const BASE_URL = "http://127.0.0.1:17891";
const THUMB_SIZE = 48;
const CHUTE_DRAG_TYPE = "application/x-chute-item";
const CHUTE_DRAG_PREFIX = "CHUTE_ITEM:";
const generatedThumbs = new Set();

let displayLimit = 50;
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

const listElement = document.querySelector("#files");
const statusElement = document.querySelector("#status");
const clearButton = document.querySelector("#clear");
const refreshButton = document.querySelector("#refresh");
const historyDateInput = document.querySelector("#history-date");
const historyPrevButton = document.querySelector("#history-prev");
const historyNextButton = document.querySelector("#history-next");
const historyLatestButton = document.querySelector("#history-latest");
const sentinel = document.querySelector("#history-sentinel");

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

function iconFor(file) {
  if (file.mime?.startsWith("image/")) return "🖼️";
  if (file.mime === "application/pdf") return "📕";
  if (file.name?.endsWith(".zip")) return "📦";
  if (file.name?.endsWith(".url")) return "🔗";
  if (file.mime?.startsWith("text/")) return "📝";
  return "📄";
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
  if (!showThumbnails || !file.mime?.startsWith("image/") || generatedThumbs.has(file.id)) return;

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
    const img = entry.target;
    thumbObserver.unobserve(img);
    const file = img.__chuteFile;
    if (file) ensureThumbnail(file, img);
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
    ? dragOutMode === "source" ? "Drag address" : "Drag original"
    : "In history";

  row.innerHTML = `
    <div class="file-icon">
      <span class="file-fallback">${iconFor(file)}</span>
    </div>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
      <div class="file-meta">${formatSize(file.size)} · ${formatWhen(file.created_at)} · <span class="file-state">${state}</span></div>
    </div>
    <div class="file-tools"></div>`;

  const icon = row.querySelector(".file-icon");
  let thumb = null;
  if (showThumbnails && file.mime?.startsWith("image/")) {
    thumb = document.createElement("img");
    thumb.className = "file-thumb";
    thumb.alt = "";
    thumb.hidden = true;
    thumb.draggable = false;
    thumb.__chuteFile = file;
    icon.append(thumb);
    thumbObserver.observe(thumb);
  }

  const tools = row.querySelector(".file-tools");

  if (file.active) {
    row.draggable = true;
    row.classList.add("ready");

    const attach = document.createElement("button");
    attach.className = "secondary-button attach";
    attach.title = "Attach the original file to the active tab";
    attach.textContent = "Attach";

    const remove = document.createElement("button");
    remove.className = "icon-button remove";
    remove.title = "Remove from the live chute";
    remove.textContent = "×";
    tools.append(attach, remove);

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

    attach.addEventListener("click", async () => {
      const result = await chrome.runtime.sendMessage({ type: "attach-file", file });
      setStatus(result?.ok ? `Attached ${file.name}` : result?.error || "Could not attach.", !result?.ok);
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
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    chuteDisplayLimit: 50,
    chuteThumbnails: true,
    chuteDragOutMode: "file"
  });
  const next = Number(settings.chuteDisplayLimit);
  displayLimit = Number.isFinite(next) && next >= 0 ? Math.trunc(next) : 50;
  showThumbnails = settings.chuteThumbnails !== false;
  dragOutMode = settings.chuteDragOutMode === "source" ? "source" : "file";
}

async function fetchHistoryDay(day = null) {
  const suffix = day ? `?date=${encodeURIComponent(day)}` : "";
  const response = await api(`/api/history${suffix}`);
  return response.json();
}

function updateHistoryNavigation(payload) {
  currentDate = payload.date;
  previousDate = payload.previous_date;
  nextDate = payload.next_date;
  if (historyDateInput && currentDate && selectedDay) historyDateInput.value = currentDate;
  if (historyPrevButton) historyPrevButton.disabled = !previousDate;
  if (historyNextButton) historyNextButton.disabled = !nextDate;
}

async function appendDay(day = null) {
  if (loadingHistory || dragOutActive) return false;
  loadingHistory = true;
  try {
    const payload = await fetchHistoryDay(day);
    updateHistoryNavigation(payload);
    if (!payload.date) return false;

    for (const file of payload.files) {
      if (displayLimit > 0 && loadedCount >= displayLimit) break;
      listElement.append(createRow(file, loadedCount));
      loadedCount += 1;
    }
    previousDate = payload.previous_date;
    return Boolean(payload.files.length || payload.previous_date);
  } finally {
    loadingHistory = false;
  }
}

async function fillNumericLimit() {
  while (displayLimit > 0 && loadedCount < displayLimit && previousDate) {
    const day = previousDate;
    await appendDay(day);
  }
}

async function resetHistory(day = selectedDay || null) {
  if (dragOutActive) return;
  try {
    loadedCount = 0;
    previousDate = null;
    nextDate = null;
    currentDate = null;
    generatedThumbs.clear();
    thumbObserver.disconnect();
    listElement.replaceChildren();

    const payload = await fetchHistoryDay(day);
    updateHistoryNavigation(payload);

    if (!payload.date || !payload.files.length) {
      if (day) {
        listElement.innerHTML = `<div class="empty"><strong>No Chute history for ${escapeHtml(day)}.</strong>Choose another day or return to Latest.</div>`;
        setStatus("No history for that day");
      } else {
        listElement.innerHTML = `<div class="empty"><strong>Nothing in Chute history yet.</strong>Drop an image or run <code>chute ./some-file</code>.</div>`;
        setStatus("Local bridge connected");
      }
      return;
    }

    for (const file of payload.files) {
      if (displayLimit > 0 && !selectedDay && loadedCount >= displayLimit) break;
      listElement.append(createRow(file, loadedCount));
      loadedCount += 1;
    }
    previousDate = payload.previous_date;

    if (!selectedDay && displayLimit > 0) await fillNumericLimit();

    const mode = selectedDay
      ? currentDate
      : displayLimit === 0
        ? "bottomless"
        : `latest ${displayLimit}`;
    setStatus(`${loadedCount} item${loadedCount === 1 ? "" : "s"} shown · ${mode}`);
    chrome.runtime.sendMessage({ type: "badge-refresh" });
  } catch {
    listElement.innerHTML = `<div class="empty"><strong>Chute is not running.</strong>Run <code>chute serve</code>, or send a file.</div>`;
    setStatus("Cannot reach 127.0.0.1:17891", true);
  }
}

const historyObserver = new IntersectionObserver(async (entries) => {
  if (!entries.some((entry) => entry.isIntersecting)) return;
  if (selectedDay || displayLimit !== 0 || !previousDate || loadingHistory || dragOutActive) return;
  const day = previousDate;
  await appendDay(day);
  setStatus(`${loadedCount} history items loaded · ∞`);
}, { rootMargin: "300px" });

if (sentinel) historyObserver.observe(sentinel);

historyDateInput?.addEventListener("change", async () => {
  selectedDay = historyDateInput.value || "";
  await resetHistory(selectedDay || null);
});

historyPrevButton?.addEventListener("click", async () => {
  if (!previousDate) return;
  selectedDay = previousDate;
  if (historyDateInput) historyDateInput.value = selectedDay;
  await resetHistory(selectedDay);
});

historyNextButton?.addEventListener("click", async () => {
  if (!nextDate) return;
  selectedDay = nextDate;
  if (historyDateInput) historyDateInput.value = selectedDay;
  await resetHistory(selectedDay);
});

historyLatestButton?.addEventListener("click", async () => {
  selectedDay = "";
  if (historyDateInput) historyDateInput.value = "";
  await resetHistory();
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
  if (changes.chuteDisplayLimit || changes.chuteThumbnails || changes.chuteDragOutMode) {
    await loadSettings();
    await resetHistory();
  }
});

loadSettings().then(() => resetHistory());

setInterval(() => {
  if (!dragOutActive && !selectedDay && window.scrollY < 8) resetHistory();
}, 5000);
