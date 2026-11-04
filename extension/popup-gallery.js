/* Popup-only gallery adapter. Existing History renderer and drag/thumbnail code remain authoritative. */
(() => {
  "use strict";
  if (!location.pathname.endsWith("/popup.html")) return;
  const layouts = [{columns:4,rows:4},{columns:5,rows:4},{columns:5,rows:5},{columns:6,rows:5}];
  const dial = document.querySelector("#gallery-density");
  const readout = document.querySelector("#gallery-density-value");
  const viewerSize = document.querySelector("#shelf-viewer-size");
  const popupStatus = document.querySelector("#status");
  let opening = false;

  function applyLayout(value) {
    const n = Number(value);
    const step = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
    const choice = layouts[step];
    document.body.style.setProperty("--chutey-gallery-columns", String(choice.columns));
    document.body.style.setProperty("--chutey-gallery-rows", String(choice.rows));
    document.body.dataset.galleryLayout = choice.columns + "x" + choice.rows;
    if (dial) dial.value = String(step);
    if (readout) readout.textContent = choice.columns + " × " + choice.rows;
    return step;
  }
  applyLayout(0);
  dial?.addEventListener("input", () => {
    const step = applyLayout(dial.value);
    void chrome.storage.sync.set({chutePopupGridStep:step}).catch(console.warn);
  });
  viewerSize?.addEventListener("change", () => {
    void chrome.storage.sync.set({chuteShelfViewerSize:viewerSize.value === "full" ? "full" : "half"}).catch(console.warn);
  });
  void chrome.storage.sync.get({chutePopupGridStep:0,chuteShelfViewerSize:"half"})
    .then(settings => {
      applyLayout(settings.chutePopupGridStep);
      if (viewerSize) viewerSize.value = settings.chuteShelfViewerSize === "full" ? "full" : "half";
    }).catch(console.warn);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.chutePopupGridStep) applyLayout(changes.chutePopupGridStep.newValue);
    if (changes.chuteShelfViewerSize && viewerSize) {
      viewerSize.value = changes.chuteShelfViewerSize.newValue === "full" ? "full" : "half";
    }
  });

  async function openItem(file, index) {
    if (opening || !/^[0-9a-f]{32}$/i.test(String(file.id || ""))) return;
    opening = true;
    const day = selectedDay || String(file.created_at || "").slice(0,10);
    const intent = {
      id:file.id, name:String(file.name || "Saved image").slice(0,256),
      mime:String(file.mime || ""), day:/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "",
      page:currentPage, index:index, scope:selectedDay ? "history" : "live",
      requestId:String(Date.now()) + "-" + Math.random().toString(36).slice(2,9),
      issuedAt:Date.now()
    };
    try {
      const tabs = await chrome.tabs.query({active:true,currentWindow:true});
      const tab = tabs[0];
      if (!chrome.sidePanel?.open || !tab?.windowId) throw new Error("Shelf not available");
      intent.windowId = tab.windowId;
      await chrome.storage.session.set({chuteyPopupOpenItem:intent});
      await chrome.sidePanel.open({windowId:tab.windowId});
      window.close();
    } catch (error) {
      if (popupStatus) {
        popupStatus.textContent = "Could not open this image in the Shelf.";
        popupStatus.classList.add("error");
      }
      console.warn("Chutey popup gallery handoff failed:",error);
    } finally {
      opening = false;
    }
  }
  const original = createRow;
  createRow = function galleryRow(file,index) {
    const row = original(file,index);
    row.classList.add("chutey-gallery-tile");
    row.tabIndex = 0;
    row.title = file.name;
    row.setAttribute("aria-label","Open " + file.name + " in Chutey Shelf");
    row.addEventListener("click",event => {
      if (event.defaultPrevented || event.target.closest("button,input,a,select")) return;
      void openItem(file,index);
    });
    row.addEventListener("keydown",event => {
      if (!["Enter"," "].includes(event.key) || event.target.closest("button,input,a,select")) return;
      event.preventDefault();
      void openItem(file,index);
    });
    return row;
  };
})();
