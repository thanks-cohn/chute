(() => {
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const HEALTH_URL = `${CHUTE_ORIGIN}/health`;
  const RETRY_DELAYS = [0, 250, 500, 1000, 2000, 5000];
  const nativeFetch = window.fetch.bind(window);

  let recoveryPromise = null;
  let lastBridgeState = "unknown";

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input?.url || "";
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function isBridgeRequest(input) {
    return requestUrl(input).startsWith(CHUTE_ORIGIN);
  }

  function emitBridgeState(state, detail = {}) {
    lastBridgeState = state;
    window.dispatchEvent(new CustomEvent("chute-bridge-state", {
      detail: { state, ...detail }
    }));
  }

  async function healthCheck() {
    try {
      const response = await nativeFetch(HEALTH_URL, { cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function recoverBridge() {
    if (recoveryPromise) return recoveryPromise;

    recoveryPromise = (async () => {
      emitBridgeState("waking");

      for (const delay of RETRY_DELAYS) {
        if (delay) await sleep(delay);
        if (await healthCheck()) {
          emitBridgeState("connected", { recovered: true });
          return true;
        }
      }

      emitBridgeState("offline");
      return false;
    })().finally(() => {
      recoveryPromise = null;
    });

    return recoveryPromise;
  }

  window.fetch = async function chuteRecoveringFetch(input, init) {
    if (!isBridgeRequest(input)) return nativeFetch(input, init);

    try {
      const response = await nativeFetch(input, init);
      if (response.ok && lastBridgeState !== "connected") emitBridgeState("connected");
      return response;
    } catch (error) {
      const recovered = await recoverBridge();
      if (!recovered) throw error;

      const method = requestMethod(input, init);
      if (method === "GET" || method === "HEAD") {
        return nativeFetch(input, init);
      }

      throw new Error("Chute reconnected. Please try that action again.");
    }
  };

  function setupReconnectUi() {
    const status = document.querySelector("#status");
    const files = document.querySelector("#files");
    const refresh = document.querySelector("#refresh");
    if (!status) return;

    let reconnectButton = null;
    let reconnecting = false;

    function renderWaking() {
      status.classList.remove("error");
      status.textContent = "Chute went to sleep too — waking up…";
      reconnectButton = null;
    }

    function renderOffline() {
      status.classList.add("error");
      status.textContent = "Chute is still asleep. ";

      reconnectButton = document.createElement("button");
      reconnectButton.type = "button";
      reconnectButton.className = "secondary-button";
      reconnectButton.textContent = "Reconnect";
      reconnectButton.addEventListener("click", async () => {
        if (reconnecting) return;
        reconnecting = true;
        reconnectButton.disabled = true;
        renderWaking();
        const ok = await recoverBridge();
        reconnecting = false;
        if (ok) {
          status.classList.remove("error");
          status.textContent = "Chute reconnected";
          refresh?.click();
        } else {
          renderOffline();
        }
      });
      status.append(reconnectButton);

      if (files && /Chute is not running|127\.0\.0\.1:17891/i.test(files.textContent || "")) {
        files.innerHTML = '<div class="empty"><strong>Chute is still asleep.</strong>Reconnect above to continue.</div>';
      }
    }

    function normalizeRawFailure() {
      if (/Cannot reach 127\.0\.0\.1:17891|Chute is not running/i.test(status.textContent || "")) {
        renderOffline();
      }
      if (files && /Chute is not running/i.test(files.textContent || "")) {
        files.innerHTML = '<div class="empty"><strong>Chute is still asleep.</strong>Reconnect above to continue.</div>';
      }
    }

    window.addEventListener("chute-bridge-state", (event) => {
      const state = event.detail?.state;
      if (state === "waking") {
        renderWaking();
      } else if (state === "offline") {
        renderOffline();
      } else if (state === "connected" && (status.classList.contains("error") || /waking up|still asleep|127\.0\.0\.1:17891/i.test(status.textContent || ""))) {
        status.classList.remove("error");
        status.textContent = "Chute reconnected";
      }
    });

    const observer = new MutationObserver(normalizeRawFailure);
    observer.observe(status, { childList: true, subtree: true, characterData: true });
    if (files) observer.observe(files, { childList: true, subtree: true, characterData: true });

    let wakeProbeRunning = false;
    async function probeAfterWake() {
      if (wakeProbeRunning || document.hidden) return;
      wakeProbeRunning = true;
      const healthy = await healthCheck();
      if (!healthy) {
        const recovered = await recoverBridge();
        if (recovered) refresh?.click();
      }
      wakeProbeRunning = false;
    }

    window.addEventListener("focus", probeAfterWake);
    window.addEventListener("pageshow", probeAfterWake);
    window.addEventListener("online", probeAfterWake);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) probeAfterWake();
    });

    normalizeRawFailure();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupReconnectUi, { once: true });
  } else {
    setupReconnectUi();
  }
})();
