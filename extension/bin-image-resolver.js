(() => {
  const baseImageFromHtmlText = imageFromHtmlText;
  const baseFetchImagePayload = fetchImagePayload;

  function uniqueUrls(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      const text = String(value || "").trim();
      if (!text) continue;
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
    if (!link) return { imageUrl: "", pageUrl: "" };
    try {
      const url = new URL(link, location.href);
      return {
        imageUrl: url.searchParams.get("imgurl") || "",
        pageUrl: url.searchParams.get("imgrefurl") || ""
      };
    } catch {
      return { imageUrl: "", pageUrl: "" };
    }
  }

  imageFromHtmlText = function(html) {
    if (!html) return null;
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const image = doc.querySelector("img");
      if (!image) return baseImageFromHtmlText(html);
      const link = image.closest("a[href]")?.getAttribute("href") || doc.querySelector("a[href]")?.getAttribute("href") || "";
      const google = googleLinkDetails(link);
      const urls = uniqueUrls([
        google.imageUrl,
        image.getAttribute("data-iurl"),
        image.getAttribute("data-original"),
        image.getAttribute("data-src"),
        ...srcsetUrls(image.getAttribute("srcset")),
        image.getAttribute("src")
      ]);
      if (!urls.length) return baseImageFromHtmlText(html);
      return {
        kind: "image",
        url: urls[0],
        urls,
        pageUrl: google.pageUrl || "",
        name: safeName(image.getAttribute("alt") || image.getAttribute("aria-label") || "", "")
      };
    } catch {
      return baseImageFromHtmlText(html);
    }
  };

  fetchImagePayload = async function(candidate) {
    const urls = uniqueUrls([...(candidate?.urls || []), candidate?.url]);
    for (const url of urls) {
      const payload = await baseFetchImagePayload({ ...candidate, url });
      if (payload) {
        payload.source = url;
        payload.resolvedImageUrl = url;
        return payload;
      }
    }
    return null;
  };
})();
