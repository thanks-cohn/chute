(() => {
  const isPopupSurface = location.pathname.endsWith("/popup.html");
  const originalResetHistory = resetHistory;
  const thumbnailRetries = new WeakMap();
  const thumbnailInFlight = new WeakSet();
  const retryDelays = [250, 600, 1200, 2500, 5000, 9000];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function imageElementThumbnail(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(THUMB_SIZE / image.naturalWidth, THUMB_SIZE / image.naturalHeight, 1);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = THUMB_SIZE;
          canvas.height = THUMB_SIZE;
          const context = canvas.getContext("2d", { alpha: true });
          context.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
          context.drawImage(
            image,
            Math.floor((THUMB_SIZE - width) / 2),
            Math.floor((THUMB_SIZE - height) / 2),
            width,
            height
          );
          canvas.toBlob(
            (thumb) => thumb ? resolve(thumb) : reject(new Error("Could not encode thumbnail")),
            "image/webp",
            0.42
          );
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Browser could not decode image for thumbnail"));
      };
      image.src = url;
    });
  }

  async function persistThumbnail(file, thumbnail) {
    for (const delay of [0, 350, 1200]) {
      if (delay) await sleep(delay);
      try {
        const response = await fetch(thumbnailUrl(file), {
          method: "POST",
          headers: { "Content-Type": "image/webp" },
          body: thumbnail
        });
        if (response.ok) return true;
      } catch {}
    }
    return false;
  }

  function scheduleThumbnailRetry(file, img) {
    if (!showThumbnails || !img?.isConnected || !img.hidden) return;
    const attempt = thumbnailRetries.get(img) || 0;
    if (attempt >= retryDelays.length) return;
    thumbnailRetries.set(img, attempt + 1);
    setTimeout(() => ensureThumbnail(file, img), retryDelays[attempt]);
  }

  ensureThumbnail = async function(file, img) {
    if (!showThumbnails || !file?.mime?.startsWith("image/") || !img?.isConnected || !img.hidden) return;
    if (thumbnailInFlight.has(img)) return;
    thumbnailInFlight.add(img);

    try {
      try {
        const cached = await fetch(thumbnailUrl(file), { cache: "no-store" });
        if (cached.ok) {
          const blob = await cached.blob();
          if (blob.size) {
            img.src = URL.createObjectURL(blob);
            img.hidden = false;
            generatedThumbs.add(file.id);
            thumbnailRetries.delete(img);
            return;
          }
        }
      } catch {}

      const response = await api(`/api/files/${encodeURIComponent(file.id)}`);
      const source = await response.blob();
      let thumbnail;
      try {
        thumbnail = await canvasThumbnail(source);
      } catch {
        thumbnail = await imageElementThumbnail(source);
      }

      if (!showThumbnails || !img.isConnected) return;
      img.src = URL.createObjectURL(thumbnail);
      img.hidden = false;
      thumbnailRetries.delete(img);

      if (await persistThumbnail(file, thumbnail)) {
        generatedThumbs.add(file.id);
      } else {
        console.warn(`Chute showed thumbnail for ${file.name}, but could not persist it yet.`);
      }
    } catch (error) {
      console.warn("Chute thumbnail generation will retry:", error);
      scheduleThumbnailRetry(file, img);
    } finally {
      thumbnailInFlight.delete(img);
    }
  };

  function kickThumbnail(img, delay = 80) {
    if (!showThumbnails || !(img instanceof HTMLImageElement) || !img.hidden) return;
    const file = img.__chuteFile;
    if (!file?.mime?.startsWith("image/")) return;
    setTimeout(() => ensureThumbnail(file, img), delay);
  }

  const thumbnailKickObserver = new MutationObserver((records) => {
    if (!showThumbnails) return;
    let delay = 60;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("img.file-thumb")) {
          kickThumbnail(node, delay);
          delay += 45;
        }
        for (const img of node.querySelectorAll?.("img.file-thumb") || []) {
          kickThumbnail(img, delay);
          delay += 45;
        }
      }
    }
  });

  if (listElement) {
    thumbnailKickObserver.observe(listElement, { childList: true, subtree: true });
    for (const img of listElement.querySelectorAll("img.file-thumb")) kickThumbnail(img);
  }

  async function renderLivePopup() {
    if (dragOutActive) return;
    try {
      loadedCount = 0;
      previousDate = null;
      nextDate = null;
      currentDate = null;
      generatedThumbs.clear();
      thumbObserver.disconnect();
      listElement.replaceChildren();

      if (historyDateInput) historyDateInput.value = "";
      if (historyPrevButton) historyPrevButton.disabled = true;
      if (historyNextButton) historyNextButton.disabled = true;

      const response = await api("/api/files");
      const payload = await response.json();
      const files = Array.isArray(payload.files) ? payload.files : [];

      if (!files.length) {
        listElement.innerHTML = `<div class="empty"><strong>Chute is clear.</strong>Your dated history is preserved. Open the Shelf or choose a date whenever you need something back.</div>`;
        setStatus("0 live items · history preserved");
        chrome.runtime.sendMessage({ type: "badge-refresh" });
        return;
      }

      for (const file of files) {
        listElement.append(createRow(file, loadedCount));
        loadedCount += 1;
      }
      setStatus(`${loadedCount} live item${loadedCount === 1 ? "" : "s"} in Chute`);
      chrome.runtime.sendMessage({ type: "badge-refresh" });
    } catch (error) {
      listElement.innerHTML = `<div class="empty"><strong>Chute is not running.</strong>Start the local Chute service and try again.</div>`;
      setStatus("Cannot reach 127.0.0.1:17891", true);
      console.error("Chute live basket refresh failed:", error);
    }
  }

  resetHistory = async function(day = selectedDay || null) {
    if (isPopupSurface && !day) return renderLivePopup();
    return originalResetHistory(day);
  };

  if (isPopupSurface) {
    document.querySelector("#clear-chute")?.addEventListener("click", () => {
      selectedDay = "";
      if (historyDateInput) historyDateInput.value = "";
    }, true);

    // shelf.js may already have queued its original history render before this
    // compatibility layer loaded. Replace it with the live working basket.
    setTimeout(() => resetHistory(null), 0);
  }
})();
