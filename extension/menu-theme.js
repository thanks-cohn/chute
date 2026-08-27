(() => {
  const DEFAULTS = {
    chuteMenuBackgroundColor: "#11130f",
    chuteMenuTextColor: "#f4f5ee"
  };

  function normalizeHex(value, fallback) {
    const next = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(next) ? next.toLowerCase() : fallback;
  }

  function rgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  function hex(values) {
    return `#${values.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
  }

  function mix(a, b, amount) {
    const left = rgb(a);
    const right = rgb(b);
    return hex(left.map((value, index) => value + (right[index] - value) * amount));
  }

  function applyTheme(settings) {
    const background = normalizeHex(settings.chuteMenuBackgroundColor, DEFAULTS.chuteMenuBackgroundColor);
    const text = normalizeHex(settings.chuteMenuTextColor, DEFAULTS.chuteMenuTextColor);
    const root = document.documentElement;

    root.style.setProperty("--chute-menu-bg", background);
    root.style.setProperty("--chute-menu-text", text);
    root.style.setProperty("--chute-menu-panel", mix(background, text, 0.045));
    root.style.setProperty("--chute-menu-panel-strong", mix(background, text, 0.085));
    root.style.setProperty("--chute-menu-control", mix(background, text, 0.105));
    root.style.setProperty("--chute-menu-control-hover", mix(background, text, 0.16));
    root.style.setProperty("--chute-menu-border", mix(background, text, 0.20));
    root.style.setProperty("--chute-menu-muted", mix(text, background, 0.42));
    root.style.setProperty("--chute-menu-subtle", mix(text, background, 0.58));
  }

  async function loadTheme() {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    applyTheme(settings);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes.chuteMenuBackgroundColor && !changes.chuteMenuTextColor) return;
    loadTheme().catch(() => {});
  });

  globalThis.resetChuteMenuTheme = async function resetChuteMenuTheme() {
    await chrome.storage.sync.set(DEFAULTS);
    applyTheme(DEFAULTS);
  };

  loadTheme().catch(() => applyTheme(DEFAULTS));
})();
