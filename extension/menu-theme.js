(() => {
  const THEMES = {
    original: {
      name: "Original Chute",
      background: "#11130f",
      text: "#f4f5ee",
      accent: "#d7ff3f"
    },
    neon: {
      name: "Neon Pink",
      background: "#1c0618",
      text: "#fff0fb",
      accent: "#ff3bbd"
    },
    navy: {
      name: "Navy Blue",
      background: "#071426",
      text: "#eef5ff",
      accent: "#58a6ff"
    },
    black: {
      name: "Back to Black",
      background: "#050505",
      text: "#ffffff",
      accent: "#ef3e45"
    }
  };

  const DEFAULTS = {
    chuteMenuTheme: "original",
    chuteMenuBackgroundColor: THEMES.original.background,
    chuteMenuTextColor: THEMES.original.text,
    chuteMenuAccentColor: THEMES.original.accent
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

  function readableOnAccent(accent) {
    const [r, g, b] = rgb(accent);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.58 ? "#090909" : "#ffffff";
  }

  function applyTheme(settings) {
    const background = normalizeHex(settings.chuteMenuBackgroundColor, DEFAULTS.chuteMenuBackgroundColor);
    const text = normalizeHex(settings.chuteMenuTextColor, DEFAULTS.chuteMenuTextColor);
    const accent = normalizeHex(settings.chuteMenuAccentColor, DEFAULTS.chuteMenuAccentColor);
    const root = document.documentElement;

    root.style.setProperty("--chute-menu-bg", background);
    root.style.setProperty("--chute-menu-text", text);
    root.style.setProperty("--chute-menu-accent", accent);
    root.style.setProperty("--chute-menu-on-accent", readableOnAccent(accent));
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

  async function setTheme(themeId) {
    const theme = THEMES[themeId];
    if (!theme) throw new Error(`Unknown Chute theme: ${themeId}`);
    const next = {
      chuteMenuTheme: themeId,
      chuteMenuBackgroundColor: theme.background,
      chuteMenuTextColor: theme.text,
      chuteMenuAccentColor: theme.accent
    };
    await chrome.storage.sync.set(next);
    applyTheme(next);
    return theme;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (
      !changes.chuteMenuTheme &&
      !changes.chuteMenuBackgroundColor &&
      !changes.chuteMenuTextColor &&
      !changes.chuteMenuAccentColor
    ) return;
    loadTheme().catch(() => {});
  });

  globalThis.CHUTE_MENU_THEMES = THEMES;
  globalThis.setChuteMenuTheme = setTheme;
  globalThis.resetChuteMenuTheme = () => setTheme("original");
  globalThis.applyChuteMenuTheme = applyTheme;

  loadTheme().catch(() => applyTheme(DEFAULTS));
})();
