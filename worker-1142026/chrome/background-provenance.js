const CHUTE_BACKGROUND_BASE_URL = "http://127.0.0.1:17891";
const CHUTE_BACKGROUND_MINI_SIZE = 48;
const chuteBaseSendContextToChuteForProvenance = sendContextToChute;

function chuteBackgroundCaptureId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function chuteBackgroundMiniThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(CHUTE_BACKGROUND_MINI_SIZE / bitmap.width, CHUTE_BACKGROUND_MINI_SIZE / bitmap.height, 1);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(CHUTE_BACKGROUND_MINI_SIZE, CHUTE_BACKGROUND_MINI_SIZE);
    const context = canvas.getContext("2d", { alpha: true });
    context.clearRect(0, 0, CHUTE_BACKGROUND_MINI_SIZE, CHUTE_BACKGROUND_MINI_SIZE);
    context.drawImage(
      bitmap,
      Math.floor((CHUTE_BACKGROUND_MINI_SIZE - width) / 2),
      Math.floor((CHUTE_BACKGROUND_MINI_SIZE - height) / 2),
      width,
      height
    );
    return await canvas.convertToBlob({ type: "image/webp", quality: 0.42 });
  } finally {
    bitmap.close();
  }
}

async function chuteBackgroundSaveMini(itemId, blob) {
  for (const delay of [0, 250, 700]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const thumbnail = await chuteBackgroundMiniThumbnail(blob);
      const response = await fetch(`${CHUTE_BACKGROUND_BASE_URL}/api/thumbnails/${encodeURIComponent(itemId)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "image/webp" },
        body: thumbnail
      });
      if (response.ok) return true;
    } catch (error) {
      console.warn("Chute context-menu mini thumbnail will retry:", error);
    }
  }
  return false;
}

async function chuteBackgroundUploadCustom(blob, name, source) {
  const response = await fetch(`${CHUTE_BACKGROUND_BASE_URL}/api/custom-thumbnails`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": blob.type || "image/webp",
      "X-Chute-Filename": encodeURIComponent(safeName(name, "browser-custom.webp")),
      "X-Chute-Mime": blob.type || "image/webp",
      "X-Chute-Source": encodeURIComponent(source || "browser-context-menu")
    },
    body: blob
  });
  if (!response.ok) {
    let detail = `Chute server returned ${response.status}`;
    try {
      const payload = await response.json();
      if (payload.error) detail = payload.error;
    } catch {}
    throw new Error(detail);
  }
  return response.json();
}

async function chuteBackgroundAppendProvenance(record) {
  let lastError = null;
  for (const delay of [0, 300, 1000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`${CHUTE_BACKGROUND_BASE_URL}/api/provenance/image`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record)
      });
      if (response.ok) return true;
      lastError = new Error(`provenance endpoint returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  console.error("Chute could not append context-menu provenance:", lastError);
  return false;
}

async function chuteBackgroundFinalizeImage(blob, name, imageUrl, pageUrl) {
  const capture = await getBrowserImageCaptureSettings();
  const { chuteThumbnails = true } = await chrome.storage.sync.get({ chuteThumbnails: true });
  let downloaded = null;
  let custom = null;
  let customBlob = null;
  let sourceLink = null;

  if (capture.saveFull) {
    downloaded = await uploadBlob(blob, name, imageUrl);
  }

  if (capture.saveCustom) {
    try {
      const derivative = await createCustomImageCopy(blob, name, capture.width, capture.height);
      customBlob = derivative.blob;
      custom = await chuteBackgroundUploadCustom(derivative.blob, derivative.name, imageUrl);
    } catch (error) {
      console.warn("Chute custom context-menu image copy failed:", error);
    }
  }

  if (!downloaded && !custom) {
    sourceLink = await uploadBlob(
      internetShortcut(imageUrl),
      `${urlName(imageUrl, "browser-image")}.url`,
      imageUrl
    );
  }

  let miniThumbnailId = null;
  const miniTarget = downloaded || custom;
  if (chuteThumbnails !== false && miniTarget?.file?.id) {
    const miniSource = downloaded ? blob : customBlob;
    if (miniSource) {
      const saved = await chuteBackgroundSaveMini(miniTarget.file.id, miniSource);
      if (saved) miniThumbnailId = miniTarget.file.id;
    }
  }

  await chuteBackgroundAppendProvenance({
    capture_id: chuteBackgroundCaptureId(),
    page_url: pageUrl || "",
    image_url: imageUrl,
    downloaded_image_id: downloaded?.file?.id || null,
    mini_thumbnail_id: miniThumbnailId,
    custom_thumbnail_id: custom?.file?.id || null,
    source_link_file_id: sourceLink?.file?.id || null
  });
}

sendContextToChute = async function(info, tab) {
  if (!info?.srcUrl) return chuteBaseSendContextToChuteForProvenance(info, tab);

  const imageUrl = info.srcUrl;
  const pageUrl = info.pageUrl || tab?.url || "";
  try {
    const response = await fetch(imageUrl, {
      cache: "no-store",
      credentials: "omit"
    });
    if (!response.ok) throw new Error(`Image returned ${response.status}`);
    const blob = await response.blob();
    let name = urlName(imageUrl, "browser-image");
    if (!name.includes(".") && blob.type.startsWith("image/")) {
      const subtype = blob.type.split("/")[1]?.split("+")[0] || "img";
      name = `${name}.${subtype === "jpeg" ? "jpg" : subtype}`;
    }
    await chuteBackgroundFinalizeImage(blob, name, imageUrl, pageUrl);
    return;
  } catch (error) {
    console.warn("Chute could not download context-menu image; preserving its link:", error);
    const sourceLink = await uploadBlob(
      internetShortcut(imageUrl),
      `${urlName(imageUrl, "browser-image")}.url`,
      imageUrl
    );
    await chuteBackgroundAppendProvenance({
      capture_id: chuteBackgroundCaptureId(),
      page_url: pageUrl,
      image_url: imageUrl,
      downloaded_image_id: null,
      mini_thumbnail_id: null,
      custom_thumbnail_id: null,
      source_link_file_id: sourceLink?.file?.id || null
    });
  }
};
