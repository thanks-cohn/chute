(() => {
  const DEFAULT_ASSET = "assets/grab/default.png";
  const ICON_SIZES = [16, 32, 48, 128];

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function generatedChutey(size, boxColor, inkColor) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d", { alpha: true });
    ctx.clearRect(0, 0, size, size);

    const pad = Math.max(1, Math.round(size * 0.08));
    const bodyTop = Math.round(size * 0.17);
    const bodyHeight = size - bodyTop - pad;
    roundedRect(ctx, pad, bodyTop, size - pad * 2, bodyHeight, Math.max(2, size * 0.16));
    ctx.fillStyle = boxColor;
    ctx.fill();

    ctx.strokeStyle = inkColor;
    ctx.lineWidth = Math.max(1, Math.round(size * 0.055));
    ctx.stroke();

    // Chutey's dark top slot.
    roundedRect(
      ctx,
      Math.round(size * 0.25),
      Math.round(size * 0.08),
      Math.round(size * 0.50),
      Math.max(2, Math.round(size * 0.18)),
      Math.max(1, size * 0.05)
    );
    ctx.fillStyle = inkColor;
    ctx.fill();

    // Eyes.
    const eyeY = Math.round(size * 0.50);
    const eyeR = Math.max(1, size * 0.055);
    ctx.beginPath();
    ctx.arc(size * 0.38, eyeY, eyeR, 0, Math.PI * 2);
    ctx.arc(size * 0.62, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Tiny contented mouth so the toolbar icon still reads as Chutey at 16px.
    ctx.lineWidth = Math.max(1, Math.round(size * 0.045));
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(size * 0.42, size * 0.68);
    ctx.quadraticCurveTo(size * 0.50, size * 0.75, size * 0.58, size * 0.68);
    ctx.stroke();

    return ctx.getImageData(0, 0, size, size);
  }

  async function imageIcon(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Mascot icon returned ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    const images = {};

    try {
      for (const size of ICON_SIZES) {
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext("2d", { alpha: true });
        ctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / bitmap.width, size / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        ctx.drawImage(bitmap, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
        images[size] = ctx.getImageData(0, 0, size, size);
      }
    } finally {
      bitmap.close();
    }

    return images;
  }

  async function refreshChuteyActionIcon() {
    const [local, sync] = await Promise.all([
      chrome.storage.local.get({ chuteMascotImageDefault: "" }),
      chrome.storage.sync.get({
        chuteMascotBoxColor: "#ffe87a",
        chuteMascotTextColor: "#4a3a13"
      })
    ]);

    const candidates = [];
    if (local.chuteMascotImageDefault) candidates.push(local.chuteMascotImageDefault);
    candidates.push(chrome.runtime.getURL(DEFAULT_ASSET));

    for (const candidate of candidates) {
      try {
        const imageData = await imageIcon(candidate);
        await chrome.action.setIcon({ imageData });
        return;
      } catch {}
    }

    const imageData = {};
    for (const size of ICON_SIZES) {
      imageData[size] = generatedChutey(
        size,
        sync.chuteMascotBoxColor || "#ffe87a",
        sync.chuteMascotTextColor || "#4a3a13"
      );
    }
    await chrome.action.setIcon({ imageData });
  }

  globalThis.refreshChuteyActionIcon = refreshChuteyActionIcon;

  refreshChuteyActionIcon().catch((error) => {
    console.warn("Chute could not apply its toolbar mascot icon:", error);
  });

  chrome.runtime.onInstalled.addListener(() => {
    refreshChuteyActionIcon().catch(() => {});
  });
  chrome.runtime.onStartup.addListener(() => {
    refreshChuteyActionIcon().catch(() => {});
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    const mascotImageChanged = area === "local" && Boolean(changes.chuteMascotImageDefault);
    const mascotColorChanged = area === "sync" && Boolean(
      changes.chuteMascotBoxColor || changes.chuteMascotTextColor
    );
    if (mascotImageChanged || mascotColorChanged) {
      refreshChuteyActionIcon().catch(() => {});
    }
  });
})();
