// Keep the image action available even when the floating mascot is the user's
// preferred browser access mode. Link/page/selection actions still respect the
// broader context-menu setting.
syncContextMenu = async function(mode) {
  await chrome.contextMenus.removeAll();
  const contexts = mode === "context" || mode === "both"
    ? ["image", "link", "selection", "page"]
    : ["image"];

  await new Promise((resolve, reject) => {
    chrome.contextMenus.create({
      id: "chute-send",
      title: contexts.length === 1 ? "Send image to Chute" : "Send to Chute",
      contexts
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
};

// A development extension reload does not necessarily emit onInstalled or a
// browser onStartup event. Register immediately when this worker boots too.
chrome.storage.sync.get({ chuteAccessMode: "floating" })
  .then(({ chuteAccessMode }) => syncContextMenu(chuteAccessMode || "floating"))
  .catch((error) => console.warn("Chute could not register its image menu:", error));
