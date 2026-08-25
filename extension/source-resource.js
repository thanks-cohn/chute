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

  function safeName(value, fallback = "") {
    const text = String(value || "")
      .replace(/[\\/:*?"<>|\r\n]+/g, "_")
      .replace(/^\.+/, "")
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
      "image/bmp": "bmp",
      "image/apng": "apng"
    };
    return map[mime] || "img";
  }

  function timestampName(type) {
    const date = new Date();
    const pad = (value, width = 2) => String(value).padStart(width, "0");
    const stamp = [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
      "-",
      pad(date.getMilliseconds(), 3)
    ].join("");
    return `chute-${stamp}.${extensionForMime(type)}`;
  }

  function dispositionName(value) {
    const text = String(value || "");
    const utf = text.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf?.[1]) {
      try { return safeName(decodeURIComponent(utf[1].trim().replace(/^"|"$/g, ""))); } catch {}
    }
    const plain = text.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    return safeName(plain?.[1] || plain?.[2] || "");
  }

  function urlName(url) {
    if (!/^https?:/i.test(String(url || ""))) return "";
    try {
      const parsed = new URL(url, location.href);
      const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) || "");
      if (!last || /^\d+$/.test(last)) return "";
      return safeName(last);
    } catch {
      return "";
    }
  }

  function withExtension(name, type) {
    const cleaned = safeName(name);
    if (!cleaned) return "";
    if (/\.[a-z0-9]{2,8}$/i.test(cleaned)) return cleaned;
    return `${cleaned}.${extensionForMime(type)}`;
  }

  function nameFor(url, suggestedName, type, disposition) {
    const fromHeader = dispositionName(disposition);
    if (fromHeader) return withExtension(fromHeader, type);

    const fromUrl = urlName(url);
    if (fromUrl) return withExtension(fromUrl, type);

    // Preserve a supplied name only when it already looks like a real filename.
    const supplied = safeName(suggestedName);
    if (/\.[a-z0-9]{2,8}$/i.test(supplied)) return supplied;

    // If the source exposes no usable filename, use a deterministic timestamp
    // instead of inventing a title-derived filename.
    return timestampName(type);
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
      name: nameFor(url, message?.suggestedName, blob.type, response.headers.get("content-disposition")),
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
