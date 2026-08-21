const CHUTE_MINI_THUMB_SIZE = 48;
const chuteBaseUploadBlobForProvenance = uploadBlob;
const chuteBaseConsumePayloadsNowForProvenance = consumePayloadsNow;
let chuteActiveUploadCollector = null;

async function chuteUploadCustomThumbnail(blob, name, source = "browser-drop") {
  const response = await fetch(`${BASE_URL}/api/custom-thumbnails`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": blob.type || "image/webp",
      "X-Chute-Filename": encodeURIComponent(safeName(name, "browser-custom.webp")),
      "X-Chute-Mime": blob.type || "image/webp",
      "X-Chute-Source": encodeURIComponent(source)
    },
    body: blob
  });
  if (!response.ok) {
    let message = `Local bridge returned ${response.status}`;
    try {
      const payload = await response.json();
      if (payload.error) message = payload.error;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

uploadBlob = async function(blob, name, source = "browser-drop") {
  const collector = chuteActiveUploadCollector;
  const payload = collector?.byBlob?.get(blob);
  const result = payload?.chuteArtifactRole === "custom_thumbnail"
    ? await chuteUploadCustomThumbnail(blob, name, source)
    : await chuteBaseUploadBlobForProvenance(blob, name, source);
  if (payload) collector.uploads.push({ payload, result });
  return result;
};

async function chuteMakeMiniThumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(
      CHUTE_MINI_THUMB_SIZE / bitmap.width,
      CHUTE_MINI_THUMB_SIZE / bitmap.height,
      1
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = CHUTE_MINI_THUMB_SIZE;
    canvas.height = CHUTE_MINI_THUMB_SIZE;
    const context = canvas.getContext("2d", { alpha: true });
    context.clearRect(0, 0, CHUTE_MINI_THUMB_SIZE, CHUTE_MINI_THUMB_SIZE);
    context.drawImage(
      bitmap,
      Math.floor((CHUTE_MINI_THUMB_SIZE - width) / 2),
      Math.floor((CHUTE_MINI_THUMB_SIZE - height) / 2),
      width,
      height
    );
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (thumb) => thumb ? resolve(thumb) : reject(new Error("Could not encode mini thumbnail")),
        "image/webp",
        0.42
      );
    });
  } finally {
    bitmap.close();
  }
}

async function chuteSaveMiniThumbnail(itemId, sourceBlob) {
  for (const delay of [0, 250, 700]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const thumb = await chuteMakeMiniThumbnail(sourceBlob);
      const response = await fetch(`${BASE_URL}/api/thumbnails/${encodeURIComponent(itemId)}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "image/webp" },
        body: thumb
      });
      if (response.ok) return true;
    } catch (error) {
      console.warn("Chute mini-thumbnail provenance step will retry:", error);
    }
  }
  return false;
}

async function chuteAppendProvenance(record) {
  let lastError = null;
  for (const delay of [0, 300, 1000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`${BASE_URL}/api/provenance/image`, {
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
  console.error("Chute could not append image provenance JSONL:", lastError);
  return false;
}

function chuteUploadForRole(uploads, role) {
  return uploads.find(({ payload }) => payload?.chuteArtifactRole === role) || null;
}

async function chuteFinalizeImageCapture(payloads, uploads) {
  const capturePayload = payloads.find((payload) => payload?.chuteProvenance);
  const provenance = capturePayload?.chuteProvenance;
  if (!provenance?.imageUrl) return;

  const downloaded = chuteUploadForRole(uploads, "downloaded_image");
  const custom = chuteUploadForRole(uploads, "custom_thumbnail");
  const sourceLink = chuteUploadForRole(uploads, "source_link_file");

  let miniThumbnailId = null;
  const preferred = downloaded || custom;
  if (preferred?.result?.file?.id) {
    const { chuteThumbnails = true } = await chrome.storage.sync.get({ chuteThumbnails: true });
    if (chuteThumbnails !== false) {
      const saved = await chuteSaveMiniThumbnail(preferred.result.file.id, preferred.payload.blob);
      if (saved) miniThumbnailId = preferred.result.file.id;
    }
  }

  await chuteAppendProvenance({
    capture_id: provenance.captureId,
    page_url: provenance.pageUrl || "",
    image_url: provenance.imageUrl,
    downloaded_image_id: downloaded?.result?.file?.id || null,
    mini_thumbnail_id: miniThumbnailId,
    custom_thumbnail_id: custom?.result?.file?.id || null,
    source_link_file_id: sourceLink?.result?.file?.id || null
  });
}

consumePayloadsNow = async function(payloadPromise, expected) {
  const payloads = await payloadPromise;
  const tracked = payloads.filter((payload) => payload?.chuteProvenance);
  if (!tracked.length) {
    return chuteBaseConsumePayloadsNowForProvenance(Promise.resolve(payloads), expected);
  }

  const collector = {
    byBlob: new Map(tracked.map((payload) => [payload.blob, payload])),
    uploads: []
  };
  chuteActiveUploadCollector = collector;
  try {
    await chuteBaseConsumePayloadsNowForProvenance(Promise.resolve(payloads), expected);
  } finally {
    chuteActiveUploadCollector = null;
  }

  if (collector.uploads.length) {
    await chuteFinalizeImageCapture(tracked, collector.uploads);
  }
};
