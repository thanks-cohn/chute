(() => {
  if (window.top !== window) return;

  const hostname = location.hostname.toLowerCase();
  const isGoogle = /(^|\.)google\.[a-z.]+$/.test(hostname);
  const isYandex = /(^|\.)yandex\.[a-z.]+$/.test(hostname);
  if (!isGoogle && !isYandex) return;

  let chuteDragActive = false;
  let chuteDragTimer = null;
  let routing = false;

  const STRONG_TERMS = [
    "search by image",
    "search with google lens",
    "google lens",
    "image search",
    "visual search",
    "upload image",
    "upload a file",
    "camera",
    "lens",
    "поиск по картинке",
    "поиск по изображению",
    "поиск картинки",
    "загрузить картинку",
    "загрузить изображение",
    "загрузить фото",
    "камера"
  ];

  const IMAGE_TERMS = [
    "image",
    "picture",
    "photo",
    "lens",
    "camera",
    "upload",
    "картин",
    "изображ",
    "фото",
    "загруз",
    "камер"
  ];

  function activateChuteDrag() {
    chuteDragActive = true;
    if (chuteDragTimer) clearTimeout(chuteDragTimer);
    chuteDragTimer = setTimeout(() => {
      chuteDragActive = false;
      chuteDragTimer = null;
    }, 15000);
  }

  function finishChuteDrag() {
    chuteDragActive = false;
    if (chuteDragTimer) {
      clearTimeout(chuteDragTimer);
      chuteDragTimer = null;
    }
  }

  function textFor(element) {
    if (!(element instanceof Element)) return "";
    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.getAttribute("data-title"),
      element.getAttribute("name"),
      element.id,
      element.className,
      element.textContent
    ]
      .filter((value) => typeof value === "string" && value)
      .join(" ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .slice(0, 1200);
  }

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function imageFiles(files) {
    return Array.from(files || []).filter((file) =>
      file instanceof File && String(file.type || "").toLowerCase().startsWith("image/")
    );
  }

  function imageInputScore(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || input.disabled) return -1000;
    const accept = String(input.accept || "").toLowerCase();
    const words = textFor(input);
    let score = 0;

    if (accept.includes("image")) score += 100;
    else if (accept && !accept.includes("image")) score -= 80;

    for (const term of IMAGE_TERMS) {
      if (words.includes(term)) score += 12;
    }

    const label = input.closest("label") || (input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null);
    const labelWords = textFor(label);
    for (const term of IMAGE_TERMS) {
      if (labelWords.includes(term)) score += 8;
    }

    return score;
  }

  function bestImageInput() {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (!inputs.length) return null;

    const ranked = inputs
      .map((input) => ({ input, score: imageInputScore(input) }))
      .sort((a, b) => b.score - a.score);

    if (ranked[0].score > 0) return ranked[0].input;
    if (inputs.length === 1 && !String(inputs[0].accept || "").trim()) return inputs[0];
    return null;
  }

  function triggerScore(element, originalTarget) {
    if (!(element instanceof Element) || !visible(element)) return -1000;
    const words = textFor(element);
    let score = 0;

    for (const term of STRONG_TERMS) {
      if (words.includes(term)) score += term === "camera" || term === "lens" ? 20 : 60;
    }
    if (!score) return -1000;

    if (originalTarget instanceof Element) {
      if (element === originalTarget || element.contains(originalTarget) || originalTarget.contains(element)) score += 80;
      const a = originalTarget.getBoundingClientRect();
      const b = element.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const distance = Math.hypot(ax - bx, ay - by);
      if (distance < 220) score += 45;
      else if (distance < 500) score += 20;
    }

    if (element.matches("button, [role='button']")) score += 10;
    return score;
  }

  function bestImageTrigger(originalTarget) {
    const selectors = [
      "button",
      "[role='button']",
      "[aria-label]",
      "[title]",
      "[data-tooltip]"
    ].join(",");

    return Array.from(document.querySelectorAll(selectors))
      .map((element) => ({ element, score: triggerScore(element, originalTarget) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  }

  function transferFor(files) {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    transfer.effectAllowed = "copy";
    transfer.dropEffect = "copy";
    return transfer;
  }

  function putFilesIntoInput(input, files) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || !files.length) return false;
    try {
      const transfer = transferFor(files);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return Boolean(input.files?.length);
    } catch (error) {
      console.warn("Chute direct image input delivery failed:", error);
      return false;
    }
  }

  async function waitForImageInput(timeoutMs = 1800) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const input = bestImageInput();
      if (input) return input;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  async function routeImageDrop(event, files) {
    if (routing || !files.length) return;

    const target = event.target instanceof Element ? event.target : null;
    const directInput = target?.matches('input[type="file"]')
      ? target
      : target?.closest("label")?.querySelector('input[type="file"]');

    // Existing expanded Google/Yandex upload boxes already work. Leave those
    // alone so the normal Chute delivery path remains the fallback.
    if (directInput) return;

    let input = bestImageInput();
    let trigger = null;
    if (!input) trigger = bestImageTrigger(target);

    // If we cannot identify either an image input or the site's image-search
    // control, do not interfere with Chute's normal synthetic drop.
    if (!input && !trigger) return;

    routing = true;
    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      if (!input && trigger) {
        try { trigger.click(); } catch {}
        input = await waitForImageInput();
      }

      if (!input || !putFilesIntoInput(input, files)) {
        console.warn("Chute could not locate the Google/Yandex image upload input after opening image search.");
        return;
      }

      finishChuteDrag();
    } finally {
      routing = false;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "chute-drag-out-start") activateChuteDrag();
  });

  // content.js turns the Chute item into a real File and dispatches a
  // synthetic file drop. On Google/Yandex we catch that exact delivery and
  // feed the file into the site's image-search uploader, opening it first when
  // necessary. Trusted user drags and all other sites are untouched.
  document.addEventListener("drop", (event) => {
    if (!chuteDragActive || event.isTrusted || routing) return;
    const files = imageFiles(event.dataTransfer?.files);
    if (!files.length) return;
    void routeImageDrop(event, files);
  }, true);
})();
