/* Synchronous local geometry hint: no network, decoding, or popup animation. */
(() => {
  function paintPlaceholders() {
    const grid = document.querySelector("#files");
    if (!grid?.querySelector(".chutey-popup-placeholder")) return;
    const root = document.documentElement;
    const columns = Number(document.body?.style.getPropertyValue("--chutey-gallery-columns") || root.style.getPropertyValue("--chutey-gallery-columns")) || 4;
    const rows = Number(document.body?.style.getPropertyValue("--chutey-gallery-rows") || root.style.getPropertyValue("--chutey-gallery-rows")) || 4;
    const slots = document.createDocumentFragment();
    for (let i=0;i<columns*rows;i++) {
      const slot = document.createElement("div"); slot.className = "chutey-popup-placeholder";
      slot.setAttribute("aria-hidden","true"); slots.append(slot);
    }
    grid.replaceChildren(slots);
  }
  window.ChuteyPopupLayout = Object.freeze({paintPlaceholders});
  try {
    const value = Number(localStorage.getItem("chuteyPopupGridStep"));
    const layouts = [[4,4],[5,4],[5,5],[6,5]];
    const [columns,rows] = layouts[Number.isInteger(value) && value >= 0 && value < 4 ? value : 0];
    document.documentElement.style.setProperty("--chutey-gallery-columns",String(columns));
    document.documentElement.style.setProperty("--chutey-gallery-rows",String(rows));
  } catch { /* The complete default layout remains usable without storage. */ }
})();
