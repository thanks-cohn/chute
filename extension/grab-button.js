(() => {
  const iconUrl = chrome.runtime.getURL("assets/grab/grab.png");
  const seen = new WeakSet();

  function upgrade(button) {
    if (!(button instanceof HTMLButtonElement) || seen.has(button)) return;
    seen.add(button);
    button.classList.add("grab");
    button.title = "Grab this file into the active page";
    button.setAttribute("aria-label", "Grab this file into the active page");
    button.replaceChildren();

    const icon = document.createElement("img");
    icon.src = iconUrl;
    icon.alt = "";
    icon.width = 16;
    icon.height = 16;
    icon.draggable = false;
    Object.assign(icon.style, {
      width: "16px",
      height: "16px",
      objectFit: "contain",
      verticalAlign: "middle",
      marginRight: "4px",
      pointerEvents: "none"
    });
    icon.addEventListener("error", () => icon.remove(), { once: true });

    const text = document.createElement("span");
    text.textContent = "Grab";
    button.append(icon, text);
  }

  function scan(root = document) {
    for (const button of root.querySelectorAll?.("button.attach") || []) upgrade(button);
  }

  scan();
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("button.attach")) upgrade(node);
        scan(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
