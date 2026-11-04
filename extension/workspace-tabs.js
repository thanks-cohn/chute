(() => {
  "use strict";
  const navigation = document.querySelector("#chutey-workspace-tabs");
  if (!navigation) return;
  const tabs = {
    history: document.querySelector("#chutey-tab-history"),
    explorer: document.querySelector("#chutey-tab-explorer")
  };
  const panels = {
    history: document.querySelector("#chutey-history-view"),
    explorer: document.querySelector("#chutey-explorer-view")
  };
  if (Object.values(tabs).some(x => !x) || Object.values(panels).some(x => !x)) return;
  const historyActions = ["#refresh", "#clear"].map(selector => document.querySelector(selector));
  const STORAGE_KEY = "chuteyShelfActiveTab";
  let userInteracted = false;

  function selectTab(name, { focus = false, remember = false } = {}) {
    if (!tabs[name]) return;
    for (const [key, tab] of Object.entries(tabs)) {
      const active = key === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle("is-active", active);
      panels[key].hidden = !active;
    }
    // The active tab is ALWAYS positioned on the left of its sibling.
    navigation.prepend(tabs[name]);
    for (const action of historyActions) if (action) action.hidden = name !== "history";
    if (focus) tabs[name].focus();
    if (remember) {
      userInteracted = true;
      // Preference is machine-local, independent from archived Chute history.
      void chrome.storage.local.set({ [STORAGE_KEY]: name }).catch(() => {});
    }
  }
  for (const [name, tab] of Object.entries(tabs)) {
    tab.addEventListener("click", () => selectTab(name, { remember: true }));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "history"
        : event.key === "End" ? "explorer"
        : name === "history" ? "explorer" : "history";
      selectTab(next, { focus: true, remember: true });
    });
  }
  // History is the safe first-ever default; load the saved tab on later opens.
  selectTab("history");
  void chrome.storage.local.get({ [STORAGE_KEY]: "history" })
    .then(settings => {
      if (!userInteracted) selectTab(settings[STORAGE_KEY] === "explorer" ? "explorer" : "history");
    })
    .catch(() => {});
})();