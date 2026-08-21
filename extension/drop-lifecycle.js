(() => {
  if (window.top !== window) return;

  let chuteDragActive = false;
  let chuteDragTimer = null;
  let cleanupSerial = 0;

  function activateChuteDrag() {
    chuteDragActive = true;
    cleanupSerial += 1;
    if (chuteDragTimer) clearTimeout(chuteDragTimer);
    chuteDragTimer = setTimeout(() => {
      chuteDragActive = false;
      chuteDragTimer = null;
    }, 15000);
  }

  function transferFromFiles(files) {
    try {
      const transfer = new DataTransfer();
      for (const file of Array.from(files || [])) {
        if (file instanceof File) transfer.items.add(file);
      }
      transfer.effectAllowed = "copy";
      transfer.dropEffect = "copy";
      return transfer;
    } catch {
      return null;
    }
  }

  function cleanupTargets(target) {
    const result = [];
    const seen = new Set();
    const add = (value) => {
      if (!value || seen.has(value) || typeof value.dispatchEvent !== "function") return;
      seen.add(value);
      result.push(value);
    };

    let current = target instanceof Element ? target : null;
    while (current) {
      add(current);
      current = current.parentElement;
    }
    add(document.body);
    add(document.documentElement);
    add(document);
    add(window);
    return result;
  }

  function dispatchDragCleanup(target, transfer) {
    const nodes = cleanupTargets(target);
    const dataTransfer = transfer || new DataTransfer();
    const init = {
      bubbles: true,
      cancelable: true,
      dataTransfer
    };

    for (const node of nodes) {
      try { node.dispatchEvent(new DragEvent("dragleave", init)); } catch {}
    }
    for (const node of nodes) {
      try { node.dispatchEvent(new DragEvent("dragend", init)); } catch {}
    }
  }

  function finishChuteDrag(target, transfer) {
    if (!chuteDragActive) return;
    const serial = cleanupSerial;

    // Run only after the receiving page has finished handling the synthetic
    // drop/change that delivered the Chute file.
    setTimeout(() => {
      if (!chuteDragActive || serial !== cleanupSerial) return;
      dispatchDragCleanup(target, transfer);

      // Some drop overlays keep drag-depth state on a root element. Repeat a
      // root-level cleanup shortly afterward without touching the file again.
      setTimeout(() => {
        if (serial !== cleanupSerial) return;
        dispatchDragCleanup(document.documentElement, transfer);
        chuteDragActive = false;
        if (chuteDragTimer) {
          clearTimeout(chuteDragTimer);
          chuteDragTimer = null;
        }
      }, 80);
    }, 0);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "chute-drag-out-start") activateChuteDrag();
  });

  document.addEventListener("drop", (event) => {
    if (!chuteDragActive || event.isTrusted) return;
    if (!event.dataTransfer?.files?.length) return;
    finishChuteDrag(event.target, event.dataTransfer);
  }, true);

  document.addEventListener("change", (event) => {
    if (!chuteDragActive || event.isTrusted) return;
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || !input.files?.length) return;
    finishChuteDrag(input, transferFromFiles(input.files));
  }, true);
})();
