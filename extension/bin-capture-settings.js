const CHUTE_CUSTOM_IMAGE_DEFAULT = 512;
let chuteSaveFullBrowserImage = true;
let chuteSaveCustomBrowserImage = false;
let chuteCustomBrowserImageWidth = CHUTE_CUSTOM_IMAGE_DEFAULT;
let chuteCustomBrowserImageHeight = CHUTE_CUSTOM_IMAGE_DEFAULT;

const chuteBaseNormalizedPayloads = normalizedPayloads;
const chuteBaseFetchImagePayload = fetchImagePayload;

function chuteClampCaptureDimension(value, fallback = CHUTE_CUSTOM_IMAGE_DEFAULT) {
  const next = Math.trunc(Number(value) || fallback);
  return Math.min(4096, Math.max(16, next));
}

function chuteCustomCopyName(name, maxWidth, maxHeight) {
  const value = String(name || "browser-image");
  const base = value.replace(/\.[a-z0-9]{2,8}$/i, "") || "browser-image";
  return `${base}-${maxWidth}x${maxHeight}.webp`;
}

function chuteCaptureId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function chuteWithProvenance(payload, provenance, role) {
  return {
    ...payload,
    chuteProvenance: provenance,
    chuteArtifactRole: role
  };
}

async function chuteMakeCustomImageCopy(payload) {
  const blob = payload?.blob;
  if (!blob || !String(blob.type || "").toLowerCase().startsWith("image/")) return null;

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(
    chuteCustomBrowserImageWidth / bitmap.width,
    chuteCustomBrowserImageHeight / bitmap.height,
    1
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const derivative = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Could not encode custom browser image copy")),
      "image/webp",
      0.9
    );
  });

  return {
    ...payload,
    blob: derivative,
    name: chuteCustomCopyName(payload.name, chuteCustomBrowserImageWidth, chuteCustomBrowserImageHeight),
    kind: "image-custom-copy"
  };
}

function chuteImageLinkFallback(candidate) {
  const url = candidate?.url || "";
  const body = `[InternetShortcut]\r\nURL=${url}\r\n`;
  return {
    blob: new Blob([body], { type: "application/internet-shortcut" }),
    name: linkName(url),
    source: url,
    kind: "image-link"
  };
}

normalizedPayloads = async function(args = {}) {
  const actualFiles = Array.from(args.files || []).filter((file) => file instanceof Blob);
  if (actualFiles.length) return chuteBaseNormalizedPayloads(args);

  const htmlImage = imageFromHtmlText(args.html || "");
  const candidate = args.source?.kind === "image" ? args.source : htmlImage;
  if (!candidate?.url) return chuteBaseNormalizedPayloads(args);

  const pageUrl = String(args.pageUrl || args.source?.pageUrl || candidate.pageUrl || "");
  const provenance = {
    captureId: chuteCaptureId(),
    pageUrl,
    imageUrl: String(candidate.url)
  };

  const full = await chuteBaseFetchImagePayload(candidate);
  if (!full) {
    return [chuteWithProvenance(chuteImageLinkFallback(candidate), provenance, "source_link_file")];
  }

  const outputs = [];
  if (chuteSaveFullBrowserImage) {
    outputs.push(chuteWithProvenance(full, provenance, "downloaded_image"));
  }

  if (chuteSaveCustomBrowserImage) {
    try {
      const custom = await chuteMakeCustomImageCopy(full);
      if (custom) outputs.push(chuteWithProvenance(custom, provenance, "custom_thumbnail"));
    } catch (error) {
      console.warn("Chute could not create custom browser image copy:", error);
    }
  }

  if (outputs.length) return outputs;
  return [chuteWithProvenance(chuteImageLinkFallback(candidate), provenance, "source_link_file")];
};

chrome.storage.sync.get({
  chuteBrowserImageCapture: "full",
  chuteBrowserImageSaveFull: null,
  chuteBrowserImageSaveCustom: null,
  chuteBrowserImageWidth: CHUTE_CUSTOM_IMAGE_DEFAULT,
  chuteBrowserImageHeight: CHUTE_CUSTOM_IMAGE_DEFAULT
}, async (settings) => {
  chuteSaveFullBrowserImage = settings.chuteBrowserImageSaveFull === null
    ? settings.chuteBrowserImageCapture !== "thumbnail"
    : settings.chuteBrowserImageSaveFull !== false;
  chuteSaveCustomBrowserImage = settings.chuteBrowserImageSaveCustom === null
    ? settings.chuteBrowserImageCapture === "thumbnail"
    : settings.chuteBrowserImageSaveCustom === true;
  chuteCustomBrowserImageWidth = chuteClampCaptureDimension(settings.chuteBrowserImageWidth);
  chuteCustomBrowserImageHeight = chuteClampCaptureDimension(settings.chuteBrowserImageHeight);

  if (settings.chuteBrowserImageSaveFull === null || settings.chuteBrowserImageSaveCustom === null) {
    await chrome.storage.sync.set({
      chuteBrowserImageSaveFull: chuteSaveFullBrowserImage,
      chuteBrowserImageSaveCustom: chuteSaveCustomBrowserImage,
      chuteBrowserImageWidth: chuteCustomBrowserImageWidth,
      chuteBrowserImageHeight: chuteCustomBrowserImageHeight
    });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.chuteBrowserImageSaveFull) {
    chuteSaveFullBrowserImage = changes.chuteBrowserImageSaveFull.newValue !== false;
  }
  if (changes.chuteBrowserImageSaveCustom) {
    chuteSaveCustomBrowserImage = changes.chuteBrowserImageSaveCustom.newValue === true;
  }
  if (changes.chuteBrowserImageWidth) {
    chuteCustomBrowserImageWidth = chuteClampCaptureDimension(changes.chuteBrowserImageWidth.newValue);
  }
  if (changes.chuteBrowserImageHeight) {
    chuteCustomBrowserImageHeight = chuteClampCaptureDimension(changes.chuteBrowserImageHeight.newValue);
  }
});
