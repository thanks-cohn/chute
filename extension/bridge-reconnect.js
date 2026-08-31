(() => {
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const AUTO_RETRY_DELAYS = [250, 500, 1000, 2000, 3500];
  const nativeFetch = window.fetch.bind(window);
  const RAW_TRANSPORT_PATTERN = /(?:127\.0\.0\.1(?::\d+)?|localhost(?::\d+)?|failed to fetch|networkerror|load failed|chute (?:server|bridge) returned|local bridge returned|chute is not running|could not read file \(\d+\)|chutebridgeofflineerror)/i;

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

  function isTransportFailure(value) {
    const text = typeof value === "string" ? value : value?.message || String(value || "");
    return value?.name === "ChuteBridgeOfflineError" || RAW_TRANSPORT_PATTERN.test(text);
  }

  function emitBridgeState(state, detail = {}) {
    lastBridgeState = state;
    window.dispatchEvent(new CustomEvent("chute-bridge-state", {
      detail: { state, ...detail }
    }));
  }

  async function rawHealthCheck() {
    if (window.ChuteNativeWake?.health) {
      return window.ChuteNativeWake.health();
    }
    try {
      const response = await nativeFetch(`${CHUTE_ORIGIN}/health`, { cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function askWorkerToWake() {
    if (!globalThis.chrome?.runtime?.sendMessage) return false;
    try {
      const response = await chrome.runtime.sendMessage({ type: "chute-ensure-bridge" });
      return response?.ok === true;
    } catch (error) {
      console.debug("Chute worker reconnect unavailable:", error?.message || error);
      return false;
    }
  }

  async function recoverBridge({ forceNative = false } = {}) {
    if (recoveryPromise) return recoveryPromise;

    recoveryPromise = (async () => {
      emitBridgeState("waking");

      if (await rawHealthCheck()) {
        emitBridgeState("connected", { recovered: false });
        return true;
      }

      // The service worker is the preferred recovery owner. Sending this
      // message wakes the MV3 worker if necessary; the worker then talks to the
      // Windows native host, which repairs/restarts Chute.exe and waits for the
      // localhost bridge to become healthy.
      if (await askWorkerToWake()) {
        if (await rawHealthCheck()) {
          emitBridgeState("connected", { recovered: true, via: "worker" });
          return true;
        }
      }

      // Keep a direct page-native path as a fallback for unpacked/development
      // builds or unusual worker startup failures.
      if ((forceNative || lastBridgeState === "waking") && window.ChuteNativeWake?.wake) {
        const woke = await window.ChuteNativeWake.wake();
        if (woke && await rawHealthCheck()) {
          emitBridgeState("connected", { recovered: true, via: "native" });
          return true;
        }
      }

      // A helper may have launched successfully but taken a little longer to
      // bind localhost. Keep probing instead of leaving the UI frozen forever.
      for (const delay of AUTO_RETRY_DELAYS) {
        await sleep(delay);
        if (await rawHealthCheck()) {
          emitBridgeState("connected", { recovered: true, via: "probe" });
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
      const recovered = await recoverBridge({ forceNative: false });
      if (!recovered) {
        const friendly = new Error("Chute is asleep.");
        friendly.name = "ChuteBridgeOfflineError";
        friendly.cause = error;
        throw friendly;
      }

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

    let reconnecting = false;
    let autoReconnectScheduled = false;

    function refreshView() {
      if (refresh) {
        refresh.click();
        return;
      }
      // popup.html has no refresh button. Reloading the extension page reruns
      // shelf.js immediately and replaces the stale asleep message with data.
      setTimeout(() => location.reload(), 0);
    }

    function renderWaking() {
      status.classList.remove("error");
      status.textContent = "Chute went to sleep too — waking up…";
      if (files && RAW_TRANSPORT_PATTERN.test(files.textContent || "")) {
        files.innerHTML = '<div class="empty"><strong>Chute is waking up.</strong>The worker is reconnecting to the local helper automatically.</div>';
      }
    }

    function renderOffline() {
      status.classList.add("error");
      status.replaceChildren();
      status.append(document.createTextNode("Chute could not wake itself. "));

      const reconnectButton = document.createElement("button");
      reconnectButton.type = "button";
      reconnectButton.className = "secondary-button";
      reconnectButton.textContent = "Reconnect";
      reconnectButton.disabled = reconnecting;
      reconnectButton.addEventListener("click", async () => {
        if (reconnecting) return;
        reconnecting = true;
        renderWaking();
        const ok = await recoverBridge({ forceNative: true });
        reconnecting = false;
        if (ok) {
          status.classList.remove("error");
          status.textContent = "Chute reconnected";
          refreshView();
        } else {
          renderOffline();
        }
      });
      status.append(reconnectButton);

      if (files) {
        files.innerHTML = '<div class="empty"><strong>Chute is asleep.</strong>Automatic reconnect failed. Hit Reconnect above to ask the worker/helper again.</div>';
      }
    }

    function scheduleAutomaticReconnect() {
      if (autoReconnectScheduled || reconnecting) return;
      autoReconnectScheduled = true;
      queueMicrotask(async () => {
        try {
          renderWaking();
          const ok = await recoverBridge({ forceNative: false });
          if (ok) {
            status.classList.remove("error");
            status.textContent = "Chute reconnected";
            refreshView();
          } else {
            renderOffline();
          }
        } finally {
          autoReconnectScheduled = false;
        }
      });
    }

    function normalizeRawFailure() {
      const statusText = status.textContent || "";
      const filesText = files?.textContent || "";
      if (RAW_TRANSPORT_PATTERN.test(statusText) || RAW_TRANSPORT_PATTERN.test(filesText)) {
        scheduleAutomaticReconnect();
      }
    }

    window.addEventListener("chute-bridge-state", (event) => {
      const state = event.detail?.state;
      if (state === "waking") {
        renderWaking();
      } else if (state === "offline") {
        renderOffline();
      } else if (state === "connected" && (
        status.classList.contains("error") ||
        /waking up|waking chute|chute is asleep|could not wake itself/i.test(status.textContent || "")
      )) {
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
      try {
        const healthy = await rawHealthCheck();
        if (!healthy) {
          const recovered = await recoverBridge({ forceNative: false });
          if (recovered) refreshView();
        }
      } finally {
        wakeProbeRunning = false;
      }
    }

    window.addEventListener("focus", probeAfterWake);
    window.addEventListener("pageshow", probeAfterWake);
    window.addEventListener("online", probeAfterWake);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) probeAfterWake();
    });

    window.ChuteBridgeRecovery = Object.freeze({
      reconnect: () => recoverBridge({ forceNative: true }),
      showOffline: renderOffline,
      isTransportFailure,
      state: () => lastBridgeState
    });

    normalizeRawFailure();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupReconnectUi, { once: true });
  } else {
    setupReconnectUi();
  }
})();
