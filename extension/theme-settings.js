(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const MAX_IMAGE_BYTES = 1_500_000;
  const IMAGE_KEYS = {
    default: "chuteMascotImageDefault",
    hover: "chuteMascotImageHover",
    grab: "chuteMascotImageGrab"
  };
  const MENU_DEFAULTS = {
    chuteMenuTheme: "original",
    chuteMenuBackgroundColor: "#11130f",
    chuteMenuTextColor: "#f4f5ee",
    chuteMenuAccentColor: "#d7ff3f"
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

  function makeColor(labelText, id, value) {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = labelText;
    const input = document.createElement("input");
    input.id = id;
    input.type = "color";
    input.value = value;
    input.setAttribute("aria-label", `${labelText} color`);
    label.append(text, input);
    return { label, input };
  }

  const themeMarker = document.createElement("div");
  themeMarker.className = "settings-note";
  themeMarker.innerHTML = "<strong>Menu theme</strong> — recolors the Chute popup and Shelf only. Chutey's artwork is left alone.";

  const themePresets = document.createElement("div");
  themePresets.className = "theme-presets";
  const presetDefs = [
    ["original", "Original Chute"],
    ["neon", "Neon Pink"],
    ["navy", "Navy Blue"],
    ["black", "Back to Black"]
  ];
  const presetButtons = new Map();
  for (const [id, title] of presetDefs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-preset";
    button.dataset.theme = id;
    button.textContent = title;
    themePresets.append(button);
    presetButtons.set(id, button);
  }

  const customColors = document.createElement("div");
  customColors.className = "theme-custom-colors";
  const backgroundColor = makeColor("Background", "menu-background-color", MENU_DEFAULTS.chuteMenuBackgroundColor);
  const menuTextColor = makeColor("Text", "menu-text-color", MENU_DEFAULTS.chuteMenuTextColor);
  const accentColor = makeColor("Accent", "menu-accent-color", MENU_DEFAULTS.chuteMenuAccentColor);
  customColors.append(backgroundColor.label, menuTextColor.label, accentColor.label);

  const mascotMarker = document.createElement("div");
  mascotMarker.className = "settings-note";
  mascotMarker.innerHTML = "<strong>Chutey images</strong> — bundled states come from <code>assets/grab/default.png</code>, <code>hover.png</code>, and <code>grab.png</code>. Optional local images override those files on this browser only.";

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
    themeMarker,
    themePresets,
    customColors,
    mascotMarker,
    makeLabel("Default image", defaultImage),
    makeLabel("Hover image", hoverImage),
    makeLabel("Grab image", grabImage),
    resetImages,
    makeLabel("Delete local Chute history", deleteHistory),
    uninstall,
    uninstallNote
  );

  function markTheme(id) {
    for (const [themeId, button] of presetButtons) {
      button.classList.toggle("active", id === themeId);
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No image selected"));
      if (file.size > MAX_IMAGE_BYTES) return reject(new Error("Mascot images must be 1.5 MB or smaller"));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  async function loadSettings() {
    const sync = await chrome.storage.sync.get({ chuteAutoHide: true, ...MENU_DEFAULTS });
    if (floatingBehavior) floatingBehavior.value = sync.chuteAutoHide === false ? "always" : "auto-hide";
    backgroundColor.input.value = sync.chuteMenuBackgroundColor || MENU_DEFAULTS.chuteMenuBackgroundColor;
    menuTextColor.input.value = sync.chuteMenuTextColor || MENU_DEFAULTS.chuteMenuTextColor;
    accentColor.input.value = sync.chuteMenuAccentColor || MENU_DEFAULTS.chuteMenuAccentColor;
    markTheme(sync.chuteMenuTheme || "original");
  }

  floatingBehavior?.addEventListener("change", async () => {
    const autoHide = floatingBehavior.value !== "always";
    await chrome.storage.sync.set({ chuteAutoHide: autoHide });
    status(autoHide ? "Chutey will auto-hide" : "Chutey will stay visible");
  });

  for (const [themeId, button] of presetButtons) {
    button.addEventListener("click", async () => {
      try {
        const theme = await globalThis.setChuteMenuTheme?.(themeId);
        if (!theme) throw new Error("Menu theme engine is not loaded");
        backgroundColor.input.value = theme.background;
        menuTextColor.input.value = theme.text;
        accentColor.input.value = theme.accent;
        markTheme(themeId);
        status(`${theme.name} theme applied`);
      } catch (error) {
        status(error.message, true);
      }
    });
  }

  async function saveCustomTheme() {
    const next = {
      chuteMenuTheme: "custom",
      chuteMenuBackgroundColor: backgroundColor.input.value,
      chuteMenuTextColor: menuTextColor.input.value,
      chuteMenuAccentColor: accentColor.input.value
    };
    await chrome.storage.sync.set(next);
    globalThis.applyChuteMenuTheme?.(next);
    markTheme("custom");
  }
  backgroundColor.input.addEventListener("input", saveCustomTheme);
  menuTextColor.input.addEventListener("input", saveCustomTheme);
  accentColor.input.addEventListener("input", saveCustomTheme);

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
        if (error) return reject(new Error(error.message));
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
