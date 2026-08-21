(() => {
  if (window.top !== window) return;

  let lastContextImage = null;

  function uniqueUrls(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const text = String(value || "").trim();
      if (!text || seen.has(text)) continue;
      try {
        const url = new URL(text, location.href).href;
        if (!/^https?:|^data:|^blob:/i.test(url) || seen.has(url)) continue;
        seen.add(url);
        result.push(url);
      } catch {}
    }
    return result;
  }

  function srcsetUrls(value) {
    return String(value || "")
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function googleLinkDetails(link) {
    if (!link?.href) return { imageUrl: "", pageUrl: "" };
    try {
      const url = new URL(link.href, location.href);
      return {
        imageUrl: url.searchParams.get("imgurl") || "",
        pageUrl: url.searchParams.get("imgrefurl") || ""
      };
    } catch {
      return { imageUrl: "", pageUrl: "" };
    }
  }

  function describeImage(target) {
    if (!(target instanceof Element)) return null;
    const image = target.closest("img");
    if (!image) return null;

    const link = image.closest("a[href]") || target.closest("a[href]");
    const google = googleLinkDetails(link);
    const candidates = uniqueUrls([
      google.imageUrl,
      image.getAttribute("data-iurl"),
      image.getAttribute("data-original"),
      image.getAttribute("data-src"),
      ...srcsetUrls(image.getAttribute("srcset")),
      image.currentSrc,
      image.src,
      image.getAttribute("src")
    ]);

    return {
      kind: "image",
      urls: candidates,
      url: candidates[0] || "",
      pageUrl: google.pageUrl || location.href,
      browserPageUrl: location.href,
      name: String(image.alt || image.getAttribute("aria-label") || "").trim().slice(0, 180)
    };
  }

  document.addEventListener("contextmenu", (event) => {
    lastContextImage = describeImage(event.target);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "chute-context-image-details") return;
    sendResponse({ ok: true, image: lastContextImage });
  });
})();
