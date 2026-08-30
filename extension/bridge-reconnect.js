(() => {
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const AUTO_RETRY_DELAYS = [250, 500, 1000, 2000];
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

  async function recoverBridge({ forceNative = false } = {}) {
    if (recoveryPromise) return recoveryPromise;

    recoveryPromise = (async () => {
      emitBridgeState("waking");

      if (forceNative && window.ChuteNativeWake?.wake) {
        const woke = await window.ChuteNativeWake.wake();
        if (woke) {
          emitBridgeState("connected", { recovered: true });
          return true;
        }
      } else if (await rawHealthCheck()) {
        emitBridgeState("connected", { recovered: false });
        return true;
      }

      // The failed request that brought us here has already received one full
      // native wake cycle from native-wake-page.js. These are only bounded
      // health probes, not repeated process launches.
      for (const delay of AUTO_RETRY_DELAYS) {
        await sleep(delay);
        if (await rawHealthCheck()) {
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

    function renderWaking() {
      status.classList.remove("error");
      status.textContent = "Waking Chute…";
      if (files && RAW_TRANSPORT_PATTERN.test(files.textContent || "")) {
        files.innerHTML = '<div class="empty"><strong>Chute is waking up.</strong>This usually takes only a moment.</div>';
      }
    }

    function renderOffline() {
      status.classList.add("error");
      status.replaceChildren();
      status.append(document.createTextNode("Chute is asleep. "));

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
          refresh?.click();
        } else {
          renderOffline();
        }
      });
      status.append(reconnectButton);

      if (files) {
        files.innerHTML = '<div class="empty"><strong>Chute is asleep.</strong>Hit Reconnect above and Chute will try to wake itself.</div>';
      }
    }

    function normalizeRawFailure() {
      const statusText = status.textContent || "";
      const filesText = files?.textContent || "";
      if (RAW_TRANSPORT_PATTERN.test(statusText) || RAW_TRANSPORT_PATTERN.test(filesText)) {
        renderOffline();
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
        /waking chute|chute is asleep/i.test(status.textContent || "")
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
      const healthy = await rawHealthCheck();
      if (!healthy) {
        const recovered = await recoverBridge({ forceNative: true });
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
