const chuteBaseResolvedContextSend = sendContextToChute;

function chuteUniqueContextUrls(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

async function chuteContextImageDetails(tab) {
  if (!tab?.id) return null;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "chute-context-image-details" });
    return response?.image || null;
  } catch {
    return null;
  }
}

async function chuteFetchContextImage(url) {
  for (const credentials of ["omit", "include"]) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials,
        referrerPolicy: "no-referrer"
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      const mime = String(blob.type || response.headers.get("Content-Type") || "").toLowerCase();
      if (!mime.startsWith("image/")) continue;
      return blob;
    } catch {}
  }
  return null;
}

sendContextToChute = async function(info, tab) {
  if (!info?.srcUrl) return chuteBaseResolvedContextSend(info, tab);

  const details = await chuteContextImageDetails(tab);
  const candidates = chuteUniqueContextUrls([
    ...(details?.urls || []),
    details?.url,
    info.srcUrl
  ]);
  const pageUrl = String(details?.pageUrl || info.pageUrl || tab?.url || "");

  for (const imageUrl of candidates) {
    const blob = await chuteFetchContextImage(imageUrl);
    if (!blob) continue;

    let name = urlName(imageUrl, "browser-image");
    if (!name.includes(".") && blob.type.startsWith("image/")) {
      const subtype = blob.type.split("/")[1]?.split("+")[0] || "img";
      name = `${name}.${subtype === "jpeg" ? "jpg" : subtype}`;
    }

    await chuteBackgroundFinalizeImage(blob, name, imageUrl, pageUrl);
    return;
  }

  return chuteBaseResolvedContextSend(info, tab);
};
