const BASE_URL = "http://127.0.0.1:17891";
const AUTO_PREPARE_LIMIT = 24 * 1024 * 1024;
const AUTO_PREPARE_ROWS = 20;
const prepared = new Map();
let displayLimit = 20;

const listElement = document.querySelector("#files");
const statusElement = document.querySelector("#status");
const clearButton = document.querySelector("#clear");
const refreshButton = document.querySelector("#refresh");

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

function dragFilename(name) {
  return name.replace(/[:\r\n]/g, "_");
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`Local bridge returned ${response.status}`);
  return response;
}

async function prepare(file, row) {
  const state = row.querySelector(".file-state");
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

function createRow(file, index) {
  const autoPrepare = index < AUTO_PREPARE_ROWS && file.size <= AUTO_PREPARE_LIMIT;
  const row = document.createElement("article");
  row.className = "file-row";
  row.innerHTML = `
    <div class="file-icon">${iconFor(file)}</div>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
      <div class="file-meta">${formatSize(file.size)} · <span class="file-state">${autoPrepare ? "Loading" : "Hover to prepare"}</span></div>
    </div>
    <div class="file-tools">
      <button class="secondary-button attach" title="Attach to the active tab">Attach</button>
      <button class="icon-button remove" title="Remove">×</button>
    </div>`;

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

  row.querySelector(".attach").addEventListener("click", async () => {
    const result = await chrome.runtime.sendMessage({ type: "attach-file", file });
    setStatus(result?.ok ? `Attached ${file.name}` : result?.error || "Could not attach.", !result?.ok);
  });

  row.querySelector(".remove").addEventListener("click", async () => {
    await api(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
    prepared.delete(file.id);
    await refresh();
  });

  if (autoPrepare) prepare(file, row).catch(() => {});
  return row;
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({ chuteDisplayLimit: 20 });
  const next = Number(settings.chuteDisplayLimit);
  displayLimit = Number.isFinite(next) && next >= 0 ? next : 20;
}

async function refresh() {
  try {
    const response = await api("/api/files");
    const { files } = await response.json();
    const currentIds = new Set(files.map((file) => file.id));
    for (const id of prepared.keys()) {
      if (!currentIds.has(id)) prepared.delete(id);
    }

    const visibleFiles = displayLimit === 0 ? files : files.slice(0, displayLimit);
    listElement.replaceChildren();
    if (!files.length) {
      listElement.innerHTML = `<div class="empty"><strong>Nothing in the chute.</strong>Run <code>chute ./some-file</code> or drop something into the sticky bin.</div>`;
      setStatus("Local bridge connected");
    } else {
      visibleFiles.forEach((file, index) => listElement.append(createRow(file, index)));
      const shown = visibleFiles.length === files.length ? String(files.length) : `${visibleFiles.length} of ${files.length}`;
      setStatus(`${shown} file${files.length === 1 ? "" : "s"} ready`);
    }
    chrome.runtime.sendMessage({ type: "badge-refresh" });
  } catch {
    listElement.innerHTML = `<div class="empty"><strong>Chute is not running.</strong>Run <code>chute serve</code>, or send a file.</div>`;
    setStatus("Cannot reach 127.0.0.1:17891", true);
  }
}

clearButton?.addEventListener("click", async () => {
  await api("/api/clear", { method: "POST" });
  prepared.clear();
  await refresh();
});
refreshButton?.addEventListener("click", refresh);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.chuteDisplayLimit) {
    const next = Number(changes.chuteDisplayLimit.newValue);
    displayLimit = Number.isFinite(next) && next >= 0 ? next : 20;
    refresh();
  }
});

loadSettings().then(refresh);
setInterval(refresh, 2500);
