const BASE_URL = "http://127.0.0.1:17891";
const AUTO_PREPARE_LIMIT = 24 * 1024 * 1024;
const AUTO_PREPARE_ROWS = 20;
const THUMB_SIZE = 48;
const prepared = new Map();
const generatedThumbs = new Set();

let displayLimit = 50;
let showThumbnails = true;
let selectedDay = "";
let loadedCount = 0;
let previousDate = null;
let nextDate = null;
let currentDate = null;
let loadingHistory = false;

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
  return name.replace(/[:\r\n]/g, "_");
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

async function prepare(file, row) {
  const state = row.querySelector(".file-state");
  if (!file.active) return null;
  if (prepared.has(file.id)) {
    state.textContent = "Drag me";
    row.draggable = true;
    row.classList.add("ready");
    return prepared.get(file.id);
  }
  state.textContent = "Preparing";
  row.draggable = false;
  try {
    const response = await api(`/api/files/${encodeURIComponent(file.id)}`);
    const blob = await response.blob();
    const localFile = new File([blob], file.name, {
      type: file.mime || blob.type || "application/octet-stream",
      lastModified: Date.now()
    });
    prepared.set(file.id, localFile);
    state.textContent = "Drag me";
    row.draggable = true;
    row.classList.add("ready");
    return localFile;
  } catch (error) {
    state.textContent = "Failed";
    throw error;
  }
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
  generatedThumbs.add(file.id);

  try {
    const cached = await fetch(thumbnailUrl(file), { cache: "force-cache" });
    if (cached.ok) {
      img.src = URL.createObjectURL(await cached.blob());
      img.hidden = false;
      return;
    }

    let source = prepared.get(file.id);
    if (!source) {
      const response = await api(`/api/files/${encodeURIComponent(file.id)}`);
      source = await response.blob();
    }
    const thumbnail = await canvasThumbnail(source);
    img.src = URL.createObjectURL(thumbnail);
    img.hidden = false;

    await fetch(thumbnailUrl(file), {
      method: "POST",
      headers: { "Content-Type": "image/webp" },
      body: thumbnail
    });
  } catch {
    img.hidden = true;
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

function createRow(file, index) {
  const autoPrepare = file.active && index < AUTO_PREPARE_ROWS && file.size <= AUTO_PREPARE_LIMIT;
  const row = document.createElement("article");
  row.className = `file-row${file.active ? "" : " archived"}`;
  const state = file.active ? (autoPrepare ? "Loading" : "Hover to prepare") : "In history";
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
  if (showThumbnails && file.mime?.startsWith("image/")) {
    const img = document.createElement("img");
    img.className = "file-thumb";
    img.alt = "";
    img.hidden = true;
    img.__chuteFile = file;
    icon.append(img);
    thumbObserver.observe(img);
  }

  const tools = row.querySelector(".file-tools");

  if (file.active) {
    const attach = document.createElement("button");
    attach.className = "secondary-button attach";
    attach.title = "Attach to the active tab";
    attach.textContent = "Attach";

    const remove = document.createElement("button");
    remove.className = "icon-button remove";
    remove.title = "Remove from the live chute";
    remove.textContent = "×";

    tools.append(attach, remove);

    row.addEventListener("pointerenter", () => {
      prepare(file, row).catch(() => {});
    }, { once: true });

    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      prepare(file, row).catch((error) => setStatus(error.message, true));
    });

    row.addEventListener("dragstart", (event) => {
      const localFile = prepared.get(file.id);
      if (!localFile) {
        event.preventDefault();
        setStatus("Hover over the file or click it once, then drag.", true);
        return;
      }

      const transfer = event.dataTransfer;
      const mime = file.mime || localFile.type || "application/octet-stream";
      transfer.effectAllowed = "copy";
      transfer.items.add(localFile);
      transfer.setData("DownloadURL", `${mime}:${dragFilename(file.name)}:${fileUrl(file)}`);
      setStatus(`Dragging ${file.name}`);
    });

    attach.addEventListener("click", async () => {
      const result = await chrome.runtime.sendMessage({ type: "attach-file", file });
      setStatus(result?.ok ? `Attached ${file.name}` : result?.error || "Could not attach.", !result?.ok);
    });

    remove.addEventListener("click", async () => {
      await api(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      prepared.delete(file.id);
      await resetHistory();
    });

    if (autoPrepare) prepare(file, row).catch(() => {});
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
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    chuteDisplayLimit: 50,
    chuteThumbnails: true
  });
  const next = Number(settings.chuteDisplayLimit);
  displayLimit = Number.isFinite(next) && next >= 0 ? Math.trunc(next) : 50;
  showThumbnails = Boolean(settings.chuteThumbnails);
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
  if (loadingHistory) return false;
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
  if (selectedDay || displayLimit !== 0 || !previousDate || loadingHistory) return;
  const day = previousDate;
  await appendDay(day);
  setStatus(`${loadedCount} history items loaded · ∞`);
}, { rootMargin: "300px" });

if (sentinel) historyObserver.observe(sentinel);

clearButton?.addEventListener("click", async () => {
  await api("/api/clear", { method: "POST" });
  prepared.clear();
  await resetHistory();
});

refreshButton?.addEventListener("click", () => resetHistory());

historyDateInput?.addEventListener("change", async () => {
  selectedDay = historyDateInput.value;
  await resetHistory(selectedDay || null);
});

historyLatestButton?.addEventListener("click", async () => {
  selectedDay = "";
  if (historyDateInput) historyDateInput.value = "";
  await resetHistory();
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.chuteDisplayLimit) {
    const next = Number(changes.chuteDisplayLimit.newValue);
    displayLimit = Number.isFinite(next) && next >= 0 ? Math.trunc(next) : 50;
    resetHistory();
  }
  if (changes.chuteThumbnails) {
    showThumbnails = Boolean(changes.chuteThumbnails.newValue);
    resetHistory();
  }
});

loadSettings().then(resetHistory);

setInterval(() => {
  if (!selectedDay && displayLimit > 0 && window.scrollY < 80) resetHistory();
}, 5000);
