const chuteStrictBackgroundUploadCustom = chuteBackgroundUploadCustom;

chuteBackgroundUploadCustom = async function(blob, name, source) {
  try {
    return await chuteStrictBackgroundUploadCustom(blob, name, source);
  } catch (error) {
    console.warn("Chute custom-thumbnail folder is not available yet; preserving the derivative through compatibility storage:", error);
    return uploadBlob(blob, name, source || "browser-context-menu");
  }
};
