// Keep context-menu image resizing aligned with the popup/bin custom-copy rule:
// any positive requested bounding box is accepted, and images may upscale or
// downscale while preserving aspect ratio. Browser canvas/memory limits remain
// the only practical ceiling.
clampCaptureDimension = function(value, fallback = 512) {
  const next = Math.trunc(Number(value) || fallback);
  return Math.max(1, next);
};

createCustomImageCopy = async function(blob, name, maxWidth, maxHeight) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(bitmap, 0, 0, width, height);
    const derivative = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
    return {
      blob: derivative,
      name: customCopyName(name, maxWidth, maxHeight)
    };
  } finally {
    bitmap.close();
  }
};
