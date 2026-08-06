const BASE_URL = "http://127.0.0.1:17891";
const AUTO_PREPARE_LIMIT = 24 * 1024 * 1024;
const prepared = new Map();

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
  if (file.mime?.startsWith("text/")) return "📝";
  return "📄";
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store", ...options });
  if (!response.ok) throw new Error(`Local bridge returned ${response.status}`);
  return response;
}

async function prepare(file, row) {
  if (prepared.has(file.id)) return prepared.get(file.id);
  const state = row.querySelector(".file-state");
  state.textContent = "Preparing";
  row.draggable = false;
  try {
    const response = await api(`/api/files/${file.id}`);
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

function createRow(file) {
  const row = document.createElement("article");
  row.className = "file-row";
  row.innerHTML = `
    <div class="file-icon">${iconFor(file)}</div>
    <div class="file-info">
      <div class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
      <div class="file-meta">${formatSize(file.size)} · <span class="file-state">${file.size <= AUTO_PREPARE_LIMIT ? "Loading" : "Click prepare"}</span></div>
    </div>
    <div class="file-tools">
      <button class="secondary-button attach" title="Attach to the active tab">Attach</button>
      <button class="icon-button remove" title="Remove">×</button>
    </div>`;

  row.addEventListener("pointerenter", () => {
    if (file.size <= AUTO_PREPARE_LIMIT) prepare(file, row).catch(() => {});
  }, { once: true });

  row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    prepare(file, row).catch((error) => setStatus(error.message, true));
  });

  row.addEventListener("dragstart", (event) => {
    const localFile = prepared.get(file.id);
    if (!localFile) {
      event.preventDefault();
      setStatus("Click the file once to prepare it, then drag.", true);
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.items.add(localFile);
    event.dataTransfer.setData("text/plain", file.name);
    setStatus(`Dragging ${file.name}`);
  });

  row.querySelector(".attach").addEventListener("click", async () => {
    const result = await chrome.runtime.sendMessage({ type: "attach-file", file });
    setStatus(result?.ok ? `Attached ${file.name}` : result?.error || "Could not attach.", !result?.ok);
  });

  row.querySelector(".remove").addEventListener("click", async () => {
    await api(`/api/files/${file.id}`, { method: "DELETE" });
    prepared.delete(file.id);
    await refresh();
  });

  if (file.size <= AUTO_PREPARE_LIMIT) prepare(file, row).catch(() => {});
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

async function refresh() {
  try {
    const response = await api("/api/files");
    const { files } = await response.json();
    listElement.replaceChildren();
    if (!files.length) {
      listElement.innerHTML = `<div class="empty"><strong>Nothing in the chute.</strong>Run <code>chute ./some-file</code></div>`;
      setStatus("Local bridge connected");
    } else {
      files.forEach((file) => listElement.append(createRow(file)));
      setStatus(`${files.length} file${files.length === 1 ? "" : "s"} ready from the terminal`);
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

refresh();
setInterval(refresh, 2500);
