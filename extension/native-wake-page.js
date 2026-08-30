(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const HEALTH_URL = `${CHUTE_ORIGIN}/health`;
  const RETRY_DELAYS = [80, 180, 350, 700, 1200];
  const nativeFetch = window.fetch.bind(window);
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
      try {
        chrome.runtime.sendNativeMessage(HOST_NAME, message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function healthCheck() {
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
      if (await healthCheck()) return true;

      try {
        const response = await sendNative({ action: "ensure_bridge" });
        if (!response?.ok) return false;
      } catch (error) {
        console.debug("Chute native wake unavailable:", error.message);
        return false;
      }

      for (const delay of RETRY_DELAYS) {
        await sleep(delay);
        if (await healthCheck()) return true;
      }
      return false;
    })().finally(() => {
      wakePromise = null;
    });
    return wakePromise;
  }

  window.fetch = async function chuteNativeWakeFetch(input, init) {
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

  window.ChuteNativeWake = Object.freeze({
    wake: wakeCompanion,
    hostName: HOST_NAME,
    offlineError
  });
})();
