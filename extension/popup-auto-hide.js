(() => {
  const behaviorSelect = document.querySelector("#floating-behavior");
  const accessModeSelect = document.querySelector("#access-mode");
  if (!behaviorSelect) return;

  chrome.storage.sync.get({ chuteAutoHide: true }, ({ chuteAutoHide }) => {
    behaviorSelect.value = chuteAutoHide === false ? "always" : "auto-hide";
  });

  behaviorSelect.addEventListener("change", async () => {
    const always = behaviorSelect.value === "always";
    const update = { chuteAutoHide: !always };
    const { chuteAccessMode = null, chuteBinVisible = true } =
      await chrome.storage.sync.get({ chuteAccessMode: null, chuteBinVisible: true });
    const mode = chuteAccessMode || (chuteBinVisible ? "floating" : "context");
    // Selecting floating behavior implies showing the mascot. Preserve
    // right-click functionality when upgrading an old "context" preference.
    if (mode === "context") {
      update.chuteAccessMode = "both";
      update.chuteBinVisible = true;
      if (accessModeSelect) accessModeSelect.value = "both";
    }
    await chrome.storage.sync.set(update);
  });
})();