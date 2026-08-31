(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const HEALTH_URL = `${CHUTE_ORIGIN}/health`;
  const NATIVE_WAKE_TIMEOUT_MS = 7500;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let wakePromise = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input?.url || "";
  }

  function isBridgeRequest(input) {
    return requestUrl(input).startsWith(CHUTE_ORIGIN);
  }

  function offlineError(cause) {
    const error = new Error("Chute is asleep.");
    error.name = "ChuteBridgeOfflineError";
    if (cause !== undefined) error.cause = cause;
    return error;
  }

  function sendNative(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Chute native helper timed out."));
      }, NATIVE_WAKE_TIMEOUT_MS);

      try {
        chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);

          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function bridgeHealthy() {
    try {
      const response = await nativeFetch(HEALTH_URL, { cache: "no-store" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function wakeCompanion() {
    if (wakePromise) return wakePromise;
    wakePromise = (async () => {
      if (await bridgeHealthy()) return true;

      try {
        const response = await sendNative({ action: "ensure_bridge" });
        if (!response?.ok) return false;
      } catch (error) {
        console.debug("Chute background native wake unavailable:", error.message);
        return false;
      }

      for (const delay of [80, 180, 350, 700, 1200]) {
        await sleep(delay);
        if (await bridgeHealthy()) return true;
      }
      return false;
    })().finally(() => {
      wakePromise = null;
    });
    return wakePromise;
  }

  function ensureBridgeInBackground(reason) {
    void wakeCompanion()
      .then((ok) => {
        if (!ok) console.debug(`Chute bridge unavailable after ${reason}`);
      })
      .catch((error) => {
        console.debug(`Chute bridge wake failed after ${reason}:`, error?.message || error);
      });
  }

  // Extension pages ask the MV3 worker to own recovery. Sending the message also
  // wakes a sleeping MV3 worker, then this worker asks the registered Windows
  // native host to repair/restart Chute.exe.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "chute-ensure-bridge") return undefined;

    wakeCompanion()
      .then((ok) => sendResponse({ ok, bridge: ok ? "ready" : "unavailable" }))
      .catch((error) => sendResponse({
        ok: false,
        bridge: "unavailable",
        error: error?.message || String(error)
      }));
    return true;
  });

  chrome.runtime.onStartup.addListener(() => ensureBridgeInBackground("browser startup"));
  chrome.runtime.onInstalled.addListener(() => ensureBridgeInBackground("extension install/update"));
  ensureBridgeInBackground("service worker startup");

  globalThis.fetch = async function chuteBackgroundFetch(input, init) {
    if (!isBridgeRequest(input)) return nativeFetch(input, init);
    try {
      return await nativeFetch(input, init);
    } catch (firstError) {
      const recovered = await wakeCompanion();
      if (!recovered) throw offlineError(firstError);
      try {
        return await nativeFetch(input, init);
      } catch (secondError) {
        throw offlineError(secondError);
      }
    }
  };
})();
