(() => {
  const MAX_BYTES = 48 * 1024 * 1024;

  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
  }

  function safeName(value, fallback = "browser-image") {
    const text = String(value || fallback)
      .replace(/[\\/:*?"<>|\r\n]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    return text || fallback;
  }

  function extensionForMime(type) {
    const mime = String(type || "").toLowerCase().split(";")[0];
    const map = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
      "image/svg+xml": "svg",
      "image/bmp": "bmp"
    };
    return map[mime] || "img";
  }

  function nameFor(url, suggestedName, type) {
    let name = safeName(suggestedName, "browser-image");
    try {
      if (!suggestedName) {
        const parsed = new URL(url, location.href);
        const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "");
        if (last) name = safeName(last, name);
      }
    } catch {}
    if (!/\.[a-z0-9]{2,8}$/i.test(name)) name += `.${extensionForMime(type)}`;
    return name;
  }

  async function readResource(message) {
    const url = String(message?.url || "").trim();
    if (!/^(?:https?:|data:image\/|blob:)/i.test(url)) throw new Error("Unsupported image source.");

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok && /^https?:/i.test(url)) throw new Error(`Image returned ${response.status}.`);
    const blob = await response.blob();
    if (!String(blob.type || "").toLowerCase().startsWith("image/")) throw new Error("Resource was not an image.");
    if (!blob.size) throw new Error("Image was empty.");
    if (blob.size > MAX_BYTES) throw new Error("Image is larger than Chute's 48 MB browser handoff limit.");

    return {
      ok: true,
      name: nameFor(url, message?.suggestedName, blob.type),
      type: blob.type,
      size: blob.size,
      base64: bytesToBase64(await blob.arrayBuffer())
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "chute-read-page-resource-v2") return false;
    void readResource(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
})();
