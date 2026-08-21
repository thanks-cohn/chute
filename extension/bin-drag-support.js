const chuteSupportBin = document.querySelector("#bin");
const chuteSupportCard = document.querySelector("#support-card");
let chuteSupportCloseTimer = null;

function chuteSupportOpen() {
  if (!chuteSupportCard) return;
  if (chuteSupportCloseTimer) {
    clearTimeout(chuteSupportCloseTimer);
    chuteSupportCloseTimer = null;
  }
  chuteSupportCard.classList.add("visible");
  chuteSupportCard.setAttribute("aria-hidden", "false");
  window.parent.postMessage({ type: "chute-support-hover", active: true }, "*");
}

function chuteSupportClose() {
  if (!chuteSupportCard) return;
  chuteSupportCard.classList.remove("visible");
  chuteSupportCard.setAttribute("aria-hidden", "true");
  window.parent.postMessage({ type: "chute-support-hover", active: false }, "*");
}

function chuteSupportLinger() {
  if (chuteSupportCloseTimer) clearTimeout(chuteSupportCloseTimer);
  chuteSupportCloseTimer = setTimeout(() => {
    chuteSupportCloseTimer = null;
    chuteSupportClose();
  }, 2000);
}

function chuteDragLooksLikeImage(transfer) {
  try {
    return Array.from(transfer?.items || []).some((item) =>
      item.kind === "file" && String(item.type || "").toLowerCase().startsWith("image/")
    );
  } catch {
    return false;
  }
}

chuteSupportBin?.addEventListener("dragenter", (event) => {
  if (chuteDragLooksLikeImage(event.dataTransfer)) chuteSupportOpen();
});

chuteSupportBin?.addEventListener("dragover", (event) => {
  if (chuteDragLooksLikeImage(event.dataTransfer)) chuteSupportOpen();
});

chuteSupportBin?.addEventListener("dragleave", () => chuteSupportLinger());
chuteSupportBin?.addEventListener("drop", (event) => {
  if (chuteDragLooksLikeImage(event.dataTransfer)) {
    chuteSupportOpen();
    chuteSupportLinger();
  }
});

chuteSupportCard?.addEventListener("pointerenter", () => chuteSupportOpen());
chuteSupportCard?.addEventListener("pointerleave", () => chuteSupportLinger());

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;

  if (event.data?.type === "chute-page-drop-active") {
    if (event.data.active && event.data.imageDrag) chuteSupportOpen();
    if (!event.data.active && chuteSupportCard?.classList.contains("visible")) chuteSupportLinger();
    return;
  }

  if (event.data?.type === "chute-page-drop") {
    const drop = event.data.drop || {};
    const imageFile = Array.from(drop.files || []).some((file) =>
      String(file?.type || "").toLowerCase().startsWith("image/")
    );
    const imageSource = drop.source?.kind === "image";
    if (imageFile || imageSource) {
      chuteSupportOpen();
      chuteSupportLinger();
    }
  }
});
