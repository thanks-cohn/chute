(() => {
  const isPopupSurface = location.pathname.endsWith("/popup.html");
  const originalResetHistory = resetHistory;
  const thumbnailRetries = new WeakMap();
  const thumbnailInFlight = new WeakSet();
  const retryDelays = [250, 600, 1200, 2500, 5000, 9000];

  function showThumbnail(img, blob) {
    // Keep the vector fallback visible until the browser ACTUALLY decodes the
    // thumbnail. A nonempty but corrupt cached WebP must never obscure it.
    return new Promise((resolve, reject) => {
      if (!img.isConnected) return resolve(false);
      const url = URL.createObjectURL(blob);
      let finished = false;
      const finish = (ok) => {
        if (finished) return;
        finished = true;
        URL.revokeObjectURL(url);
        img.onload = null;
        img.onerror = null;
        if (ok && img.isConnected) {
          img.hidden = false;
          img.closest(".file-icon")?.classList.add("has-thumbnail");
          resolve(true);
        } else {
          img.hidden = true;
          img.closest(".file-icon")?.classList.remove("has-thumbnail");
          if (ok) resolve(false);
          else reject(new Error("Thumbnail could not be decoded"));
        }
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url;
    });
  }

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
    if (!showThumbnails || !isPreviewableImage(file) || !img?.isConnected || !img.hidden) return;
    if (thumbnailInFlight.has(img)) return;
    thumbnailInFlight.add(img);

    try {
      try {
        const cached = await fetch(thumbnailUrl(file), { cache: "no-store" });
        if (cached.ok) {
          const blob = await cached.blob();
          if (blob.size) {
            // If a cached thumbnail is corrupted or no longer decodes, fetch
            // the original image and rebuild instead of displaying a blank box.
            try {
              if (await showThumbnail(img, blob)) {
                generatedThumbs.add(file.id);
                thumbnailRetries.delete(img);
                return;
              }
              return; // Page changed while decoding; no more work needed.
            } catch {
              // Ignore the corrupted cache and reconstruct the thumbnail.
            }
          }
        }
      } catch {}

      const response = await api(`/api/files/${encodeURIComponent(file.id)}`);
      const source = await response.blob();
      if (!source.size) throw new Error("Image file has no bytes");

      // Display the ACTUAL locally saved image first. Never gate the picture
      // behind WebP generation, the 256 KiB thumbnail cache, or a successful
      // POST. Those optimizations are optional, not prerequisites to rendering.
      if (!showThumbnails || !img.isConnected) return;
      if (!await showThumbnail(img, source)) return;
      generatedThumbs.add(file.id);
      thumbnailRetries.delete(img);

      // Cache a compact preview for the next visit. A failure to generate or
      // persist the cache must not remove an image that is already visible.
      try {
        let thumbnail;
        try {
          thumbnail = await canvasThumbnail(source);
        } catch {
          thumbnail = await imageElementThumbnail(source);
        }
        if (thumbnail && !await persistThumbnail(file, thumbnail)) {
          console.warn(`Chute showed the original image for ${file.name}; thumbnail cache unavailable.`);
        }
      } catch (thumbnailError) {
        console.warn(`Chute displayed the original image without a generated preview for ${file.name}:`, thumbnailError);
      }
    } catch (error) {
      console.warn("Chute could not display locally saved image; retrying:", error);
      scheduleThumbnailRetry(file, img);
    } finally {
      thumbnailInFlight.delete(img);
    }
  };

  // shelf.js already watches only on-screen thumbnail rows with an
  // IntersectionObserver. Do not schedule every image via MutationObserver:
  // a large 200-item page should not fetch 200 full originals at once.

  async function renderLivePopup() {
    if (dragOutActive) return;
    const token = ++historyRequestToken;
    try {
      const params = new URLSearchParams({
        scope: "live", page: String(currentPage), limit: String(displayLimit)
      });
      const response = await api(`/api/browse?${params}`);
      const payload = await response.json();
      if (token !== historyRequestToken) return;
      const files = Array.isArray(payload.files) ? payload.files : [];

      if (currentPage > 0 && files.length === 0) {
        currentPage -= 1;
        await renderLivePopup();
        return;
      }

      loadedCount = files.length;
      previousDate = null;
      nextDate = null;
      currentDate = null;
      generatedThumbs.clear();
      thumbObserver.disconnect();
      listElement.replaceChildren();

      if (historyDateInput) historyDateInput.value = "";
      if (historyPrevButton) historyPrevButton.disabled = true;
      if (historyNextButton) historyNextButton.disabled = true;
      updatePageControls(payload);

      if (!files.length) {
        listElement.innerHTML = `<div class="empty"><strong>Chute is clear.</strong>Your dated history is preserved. Open the Shelf or choose a day whenever you need something back.</div>`;
        setStatus("0 live items · history preserved");
        chrome.runtime.sendMessage({ type: "badge-refresh" });
        return;
      }

      for (const [index, file] of files.entries()) {
        listElement.append(createRow(file, index));
      }
      const first = currentPage * displayLimit + 1;
      setStatus(`Live Chute · ${first}–${first + files.length - 1} · page ${currentPage + 1}`);
      chrome.runtime.sendMessage({ type: "badge-refresh" });
    } catch (error) {
      if (token !== historyRequestToken) return;
      setStatus(error.message || "Cannot reach 127.0.0.1:17891", true);
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
      currentPage = 0;
      if (historyDateInput) historyDateInput.value = "";
    }, true);
  }
})();
