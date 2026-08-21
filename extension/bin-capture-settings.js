const CHUTE_BROWSER_CAPTURE_THUMB_SIZE = 512;
let chuteBrowserImageCaptureMode = "full";

const chuteCaptureFullImagePayload = fetchImagePayload;

function chuteCaptureName(name) {
  const value = String(name || "browser-image");
  const base = value.replace(/\.[a-z0-9]{2,8}$/i, "") || "browser-image";
  return `${base}-thumb.webp`;
}

async function chuteCaptureThumbnail(payload) {
  if (!payload?.blob || !String(payload.blob.type || "").startsWith("image/")) return null;

  const bitmap = await createImageBitmap(payload.blob);
  const scale = Math.min(
    CHUTE_BROWSER_CAPTURE_THUMB_SIZE / bitmap.width,
    CHUTE_BROWSER_CAPTURE_THUMB_SIZE / bitmap.height,
    1
  );

  // If the source is already thumbnail-sized, keep its original bytes. There
  // is no reason to recompress a small image just because thumbnail-only mode
  // is selected.
  if (scale >= 1) {
    bitmap.close();
    return payload;
  }

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Could not encode browser thumbnail")),
      "image/webp",
      0.72
    );
  });

  return {
    ...payload,
    blob,
    name: chuteCaptureName(payload.name),
    kind: "image-thumbnail"
  };
}

fetchImagePayload = async function(candidate) {
  const payload = await chuteCaptureFullImagePayload(candidate);
  if (!payload || chuteBrowserImageCaptureMode !== "thumbnail") return payload;

  try {
    return await chuteCaptureThumbnail(payload);
  } catch (error) {
    // Thumbnail-only is an explicit storage choice. Do not silently keep the
    // full original if reduction fails; let the existing link fallback run.
    console.warn("Chute could not create thumbnail-only browser capture:", error);
    return null;
  }
};

chrome.storage.sync.get({ chuteBrowserImageCapture: "full" }, ({ chuteBrowserImageCapture }) => {
  chuteBrowserImageCaptureMode = chuteBrowserImageCapture === "thumbnail" ? "thumbnail" : "full";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.chuteBrowserImageCapture) return;
  chuteBrowserImageCaptureMode = changes.chuteBrowserImageCapture.newValue === "thumbnail" ? "thumbnail" : "full";
});
