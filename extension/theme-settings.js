(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const MAX_IMAGE_BYTES = 1_500_000;
  const IMAGE_KEYS = {
    default: "chuteMascotImageDefault",
    hover: "chuteMascotImageHover",
    grab: "chuteMascotImageGrab"
  };

  const settingsRoot = document.querySelector(".settings");
  const floatingBehavior = document.querySelector("#floating-behavior");
  if (!settingsRoot) return;

  function status(message, error = false) {
    const node = document.querySelector("#status");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("error", error);
  }

  function makeLabel(text, control) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = text;
    label.append(span, control);
    return label;
  }

  function makeColor(id, value, label) {
    const input = document.createElement("input");
    input.id = id;
    input.type = "color";
    input.value = value;
    input.setAttribute("aria-label", label);
    return input;
  }

  function makeFile(id, state) {
    const input = document.createElement("input");
    input.id = id;
    input.type = "file";
    input.accept = "image/png,image/webp,image/jpeg";
    input.dataset.state = state;
    input.setAttribute("aria-label", `${state} mascot image`);
    input.style.maxWidth = "190px";
    input.style.fontSize = "10px";
    return input;
  }

  const marker = document.createElement("div");
  marker.className = "settings-note";
  marker.innerHTML = "<strong>Chutey theme</strong> — bundled states come from <code>assets/grab/default.png</code>, <code>hover.png</code>, and <code>grab.png</code>. Optional local images override those files on this browser only.";

  const boxColor = makeColor("mascot-box-color", "#ffe87a", "Mascot box color");
  const textColor = makeColor("mascot-text-color", "#4a3a13", "Mascot text color");
  const defaultImage = makeFile("mascot-image-default", "default");
  const hoverImage = makeFile("mascot-image-hover", "hover");
  const grabImage = makeFile("mascot-image-grab", "grab");

  const resetImages = document.createElement("button");
  resetImages.type = "button";
  resetImages.className = "secondary-button";
  resetImages.textContent = "Use bundled mascot images";

  const deleteHistory = document.createElement("input");
  deleteHistory.type = "checkbox";
  deleteHistory.id = "delete-history-on-uninstall";
  deleteHistory.className = "toggle";

  const uninstall = document.createElement("button");
  uninstall.type = "button";
  uninstall.className = "secondary-button";
  uninstall.id = "uninstall-chute-completely";
  uninstall.textContent = "Uninstall Chute completely";

  const uninstallNote = document.createElement("div");
  uninstallNote.className = "settings-note";
  uninstallNote.textContent = "Complete uninstall removes the Windows companion, startup/native-host registration, then this extension. Chute history is kept unless you select Delete local Chute history.";

  settingsRoot.append(
    marker,
    makeLabel("Mascot box color", boxColor),
    makeLabel("Mascot text color", textColor),
    makeLabel("Default image", defaultImage),
    makeLabel("Hover image", hoverImage),
    makeLabel("Grab image", grabImage),
    resetImages,
    makeLabel("Delete local Chute history", deleteHistory),
    uninstall,
    uninstallNote
  );

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No image selected"));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error("Mascot images must be 1.5 MB or smaller"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  async function loadSettings() {
    const sync = await chrome.storage.sync.get({
      chuteAutoHide: true,
      chuteMascotBoxColor: "#ffe87a",
      chuteMascotTextColor: "#4a3a13"
    });
    if (floatingBehavior) floatingBehavior.value = sync.chuteAutoHide === false ? "always" : "auto-hide";
    boxColor.value = sync.chuteMascotBoxColor || "#ffe87a";
    textColor.value = sync.chuteMascotTextColor || "#4a3a13";
  }

  floatingBehavior?.addEventListener("change", async () => {
    const autoHide = floatingBehavior.value !== "always";
    await chrome.storage.sync.set({ chuteAutoHide: autoHide });
    status(autoHide ? "Chutey will auto-hide" : "Chutey will stay visible");
  });

  boxColor.addEventListener("input", () => {
    chrome.storage.sync.set({ chuteMascotBoxColor: boxColor.value });
  });
  textColor.addEventListener("input", () => {
    chrome.storage.sync.set({ chuteMascotTextColor: textColor.value });
  });

  for (const input of [defaultImage, hoverImage, grabImage]) {
    input.addEventListener("change", async () => {
      const state = input.dataset.state;
      try {
        const dataUrl = await fileToDataUrl(input.files?.[0]);
        await chrome.storage.local.set({ [IMAGE_KEYS[state]]: dataUrl });
        status(`${state[0].toUpperCase()}${state.slice(1)} mascot image saved`);
      } catch (error) {
        status(error.message, true);
      } finally {
        input.value = "";
      }
    });
  }

  resetImages.addEventListener("click", async () => {
    await chrome.storage.local.remove(Object.values(IMAGE_KEYS));
    status("Bundled mascot images restored");
  });

  function sendNative(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response || null);
      });
    });
  }

  uninstall.addEventListener("click", async () => {
    const removeHistory = deleteHistory.checked;
    const warning = removeHistory
      ? "This will remove Chute, its Windows companion, AND your local Chute history. Continue?"
      : "This will remove the Chute extension and Windows companion. Your local Chute history will be kept. Continue?";
    if (!window.confirm(warning)) return;

    uninstall.disabled = true;
    status("Removing Windows companion…");
    try {
      const response = await sendNative({ action: "uninstall", delete_data: removeHistory });
      if (!response?.ok) throw new Error(response?.error || "Companion uninstall failed");
      status("Removing Chute extension…");
      chrome.management.uninstallSelf({ showConfirmDialog: false });
    } catch (error) {
      uninstall.disabled = false;
      status(`Could not complete uninstall: ${error.message}`, true);
    }
  });

  loadSettings();
})();
