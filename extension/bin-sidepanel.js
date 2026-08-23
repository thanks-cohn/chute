const chuteSidePanelBin = document.querySelector("#bin");

chuteSidePanelBin?.addEventListener("click", (event) => {
  // Keep the side-panel request directly attached to the real user click.
  // Routing through window.postMessage first can lose Chromium's transient
  // user activation before chrome.sidePanel.open() reaches the worker.
  event.stopImmediatePropagation();

  chrome.runtime.sendMessage({ type: "open-side-panel" })
    .then((result) => {
      if (result?.ok === false) {
        console.error("Chute Shelf could not open:", result.error || "Unknown side-panel error");
      }
    })
    .catch((error) => {
      console.error("Chute Shelf could not open:", error);
      // Retain the older parent/content-script route as a last-resort fallback.
      window.parent.postMessage({ type: "chute-open-side-panel" }, "*");
    });
}, true);
