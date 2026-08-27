// Keep the image action available even when the floating mascot is the user's
// preferred browser access mode. Link/page/selection actions still respect the
// broader context-menu setting.
//
// MV3 can deliver worker-start, onInstalled/onStartup and storage-change work
// very close together. Context-menu mutation is therefore serialized so two
// callers can never race through remove/create and try to create `chute-send`
// twice.
let chuteContextMenuSync = Promise.resolve();

function removeChuteMenu() {
  return new Promise((resolve) => {
    chrome.contextMenus.remove("chute-send", () => {
      // Missing menu is the normal first-run state. Reading lastError prevents
      // Chrome from reporting it as an unchecked runtime error.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function createChuteMenu(contexts) {
  return new Promise((resolve, reject) => {
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
}

syncContextMenu = function(mode) {
  const contexts = mode === "context" || mode === "both"
    ? ["image", "link", "selection", "page"]
    : ["image"];

  const run = async () => {
    await removeChuteMenu();
    await createChuteMenu(contexts);
  };

  chuteContextMenuSync = chuteContextMenuSync
    .catch(() => {})
    .then(run);

  return chuteContextMenuSync;
};

// A development extension reload does not necessarily emit onInstalled or a
// browser onStartup event. Register immediately when this worker boots too.
chrome.storage.sync.get({ chuteAccessMode: "floating" })
  .then(({ chuteAccessMode }) => syncContextMenu(chuteAccessMode || "floating"))
  .catch((error) => console.warn("Chute could not register its image menu:", error));
