(() => {
  const behaviorSelect = document.querySelector("#floating-behavior");
  if (!behaviorSelect) return;

  chrome.storage.sync.get({ chuteAutoHide: true }, ({ chuteAutoHide }) => {
    behaviorSelect.value = chuteAutoHide === false ? "always" : "auto-hide";
  });

  behaviorSelect.addEventListener("change", async () => {
    await chrome.storage.sync.set({
      chuteAutoHide: behaviorSelect.value !== "always"
    });
  });
})();
