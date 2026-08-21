(() => {
  const card = document.querySelector("#platform-setup");
  const title = document.querySelector("#platform-setup-title");
  const copy = document.querySelector("#platform-setup-copy");
  const button = document.querySelector("#platform-setup-button");
  if (!card || !title || !copy || !button) return;

  const HEALTH = "http://127.0.0.1:17891/health";
  const WINDOWS = "https://github.com/thanks-cohn/chute/releases/latest/download/Chute-Windows.exe";
  const LINUX = "https://github.com/thanks-cohn/chute/releases/latest/download/Chute-Linux-x86_64";
  const RELEASES = "https://github.com/thanks-cohn/chute/releases/latest";

  async function bridgeOnline() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 700);
    try {
      const response = await fetch(HEALTH, { cache: "no-store", signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function render() {
    if (await bridgeOnline()) {
      card.hidden = true;
      return;
    }

    let platform = { os: "unknown", arch: "unknown" };
    try {
      platform = await chrome.runtime.getPlatformInfo();
    } catch {}

    if (platform.os === "win") {
      title.textContent = "One quick Windows setup";
      copy.textContent = "Download Chute once and double-click it. No admin, Python, PowerShell, or Windows Service required.";
      button.textContent = "Download Chute for Windows";
      button.href = WINDOWS;
    } else if (platform.os === "linux") {
      title.textContent = "One quick Linux setup";
      copy.textContent = "Download the Chute desktop companion once. It uses normal per-user autostart; no systemd setup is required.";
      button.textContent = "Download Chute for Linux";
      button.href = LINUX;
    } else {
      title.textContent = "Chute desktop companion needed";
      copy.textContent = "This platform does not have a one-click Chute companion yet. Open the latest release for available builds.";
      button.textContent = "View Chute releases";
      button.href = RELEASES;
    }

    card.hidden = false;
  }

  render();
  setInterval(render, 4000);
})();
