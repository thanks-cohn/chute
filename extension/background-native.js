(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const HEALTH_URL = `${CHUTE_ORIGIN}/health`;
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

  function sendNative(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(response || null);
      });
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
      // Fast path: do not spawn the native helper when the bridge is already up.
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

  // Do not rely on the Windows Run key alone. MV3 service workers are allowed
  // to disappear and restart, so every cold start becomes another chance to
  // self-heal the local companion. Browser startup and extension updates are
  // explicit recovery points too.
  chrome.runtime.onStartup.addListener(() => ensureBridgeInBackground("browser startup"));
  chrome.runtime.onInstalled.addListener(() => ensureBridgeInBackground("extension install/update"));
  ensureBridgeInBackground("service worker startup");

  globalThis.fetch = async function chuteBackgroundFetch(input, init) {
    if (!isBridgeRequest(input)) return nativeFetch(input, init);
    try {
      return await nativeFetch(input, init);
    } catch (error) {
      await wakeCompanion();
      return nativeFetch(input, init);
    }
  };
})();
