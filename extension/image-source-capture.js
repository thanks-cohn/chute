(() => {
  const MAX_URLS = 24;
  const PRIME_MAX_AGE_MS = 4000;
  let primedCapture = null;

  const host = location.hostname.toLowerCase();
  const source = host === "chatgpt.com" || host === "chat.openai.com"
    ? "chatgpt"
    : /(^|\.)google\.com$/.test(host)
      ? "google"
      : /(^|\.)yandex\./.test(host)
        ? "yandex"
        : "browser";

  function cleanUrl(value) {
    return String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .trim();
  }

  function pushUrl(list, value) {
    const text = cleanUrl(value);
    if (!text || list.includes(text)) return;
    if (!/^(?:https?:|data:image\/|blob:)/i.test(text)) return;
    list.push(text);
  }

  function srcsetUrls(value) {
    return String(value || "")
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function nestedUrls(value) {
    const result = [];
    try {
      const url = new URL(String(value || ""), location.href);
      const keys = source === "yandex"
        ? ["img_url", "imgurl", "image_url", "image", "img", "mediaurl", "orig_url", "origUrl", "original", "url", "rurl"]
        : ["imgurl", "mediaurl", "image_url", "image", "img", "url"];
      for (const key of keys) {
        const nested = url.searchParams.get(key);
        if (!nested) continue;
        try { pushUrl(result, decodeURIComponent(nested)); } catch {}
      }
    } catch {}
    return result;
  }

  function urlsFromAttribute(value) {
    const text = cleanUrl(value);
    const result = [];
    if (!text) return result;
    pushUrl(result, text);
    for (const nested of nestedUrls(text)) pushUrl(result, nested);
    for (const match of text.match(/(?:https?:\/\/|blob:|data:image\/)[^\s"'<>]+/gi) || []) pushUrl(result, match);

    if (source === "yandex") {
      try {
        const parsed = JSON.parse(text);
        const walk = (node, depth = 0) => {
          if (depth > 7 || node == null) return;
          if (typeof node === "string") {
            pushUrl(result, node);
            for (const nested of nestedUrls(node)) pushUrl(result, nested);
            return;
          }
          if (Array.isArray(node)) {
            for (const item of node) walk(item, depth + 1);
            return;
          }
          if (typeof node === "object") {
            for (const [key, item] of Object.entries(node)) {
              if (/url|src|orig|preview|image|img/i.test(key)) walk(item, depth + 1);
            }
          }
        };
        walk(parsed);
      } catch {}
    }
    return result;
  }

  function backgroundUrls(value) {
    const result = [];
    const re = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = re.exec(String(value || "")))) pushUrl(result, match[2]);
    return result;
  }

  function addImageUrls(urls, image) {
    if (!(image instanceof HTMLImageElement)) return;
    for (const value of [
      image.currentSrc,
      image.src,
      image.getAttribute("data-iurl"),
      image.getAttribute("data-src"),
      image.getAttribute("data-url"),
      image.getAttribute("data-image-url"),
      image.getAttribute("data-original"),
      image.getAttribute("data-origin"),
      image.getAttribute("data-thumb"),
      image.getAttribute("data-download-url")
    ]) {
      pushUrl(urls, value);
      for (const nested of nestedUrls(value)) pushUrl(urls, nested);
    }

    for (const attr of ["srcset", "data-srcset"]) {
      for (const value of srcsetUrls(image.getAttribute(attr))) pushUrl(urls, value);
    }

    const picture = image.closest("picture");
    picture?.querySelectorAll("source[srcset], source[data-srcset]").forEach((node) => {
      for (const attr of ["srcset", "data-srcset"]) {
        for (const value of srcsetUrls(node.getAttribute(attr))) pushUrl(urls, value);
      }
    });
  }

  function addElementUrls(urls, element) {
    if (!(element instanceof Element)) return;
    if (element instanceof HTMLImageElement) addImageUrls(urls, element);
    if (element instanceof HTMLAnchorElement && element.href) {
      for (const nested of nestedUrls(element.href)) pushUrl(urls, nested);
      pushUrl(urls, element.href);
    }

    for (const attr of element.attributes || []) {
      if (!/(?:src|url|href|image|img|download|original|orig|asset|file|data-)/i.test(attr.name)) continue;
      for (const candidate of urlsFromAttribute(attr.value)) pushUrl(urls, candidate);
    }

    try {
      for (const value of backgroundUrls(getComputedStyle(element).backgroundImage)) pushUrl(urls, value);
    } catch {}
  }

  function nearbyElements(event) {
    const result = [];
    const add = (node) => {
      if (!(node instanceof Element) || result.includes(node)) return;
      result.push(node);
    };
    for (const node of event?.composedPath?.() || []) add(node);
    add(event?.target);
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      try { add(document.elementFromPoint(event.clientX, event.clientY)); } catch {}
    }
    const seeds = [...result];
    for (const seed of seeds) {
      let node = seed;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) add(node);
    }
    return result;
  }

  function collect(event) {
    const urls = [];
    const elements = nearbyElements(event);
    for (const element of elements) addElementUrls(urls, element);

    for (const element of elements.slice(0, 12)) {
      element.querySelectorAll?.("img, picture img").forEach((image) => addImageUrls(urls, image));
      element.querySelectorAll?.("a[href], [style*='background']").forEach((child) => addElementUrls(urls, child));
      if (urls.length >= MAX_URLS) break;
    }
    return urls.slice(0, MAX_URLS);
  }

  function title(event) {
    for (const element of nearbyElements(event)) {
      if (element instanceof HTMLImageElement) {
        const value = element.alt || element.title;
        if (value) return String(value).replace(/\s+/g, " ").trim().slice(0, 120);
      }
      const value = element.getAttribute?.("aria-label") || element.getAttribute?.("title");
      if (value && !/^(?:download|share|edit|more)$/i.test(String(value).trim())) {
        return String(value).replace(/\s+/g, " ").trim().slice(0, 120);
      }
    }
    return `${source === "chatgpt" ? "ChatGPT" : source === "google" ? "Google" : source === "yandex" ? "Yandex" : "Browser"} image`;
  }

  function sendCapture(capture) {
    if (!capture?.urls?.length) return;
    primedCapture = capture;
    try {
      chrome.runtime.sendMessage({ type: "chute-capture-source-v2", source, capture });
    } catch {}
  }

  function prime(event) {
    if (event.button != null && event.button !== 0) return;
    const urls = collect(event);
    if (!urls.length) return;
    sendCapture({
      capturedAt: Date.now(),
      pageUrl: location.href,
      title: title(event),
      urls,
      dragConfirmed: false
    });
  }

  document.addEventListener("pointerdown", prime, true);
  document.addEventListener("mousedown", (event) => {
    if (typeof PointerEvent !== "undefined") return;
    prime(event);
  }, true);

  document.addEventListener("dragstart", (event) => {
    let urls = collect(event);
    let label = title(event);
    if (!urls.length && primedCapture && Date.now() - Number(primedCapture.capturedAt || 0) <= PRIME_MAX_AGE_MS) {
      urls = primedCapture.urls;
      label = primedCapture.title || label;
    }
    if (!urls.length) return;
    sendCapture({
      capturedAt: Date.now(),
      pageUrl: location.href,
      title: label,
      urls,
      dragConfirmed: true
    });
  }, true);
})();
