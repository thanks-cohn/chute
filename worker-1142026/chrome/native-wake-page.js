(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const HEALTH_URL = `${CHUTE_ORIGIN}/health`;
  const WORKER_WAKE_TIMEOUT_MS = 8000;
  const DIRECT_WAKE_TIMEOUT_MS = 8000;
  const nativeFetch = window.fetch.bind(window);
  let wakePromise = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function callbackMessage(send, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      try {
        send((response) => {
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

  async function sendNative(message) {
    return callbackMessage(
      (done) => chrome.runtime.sendNativeMessage(HOST_NAME, message, done),
      DIRECT_WAKE_TIMEOUT_MS,
      "Chute native helper timed out."
    );
  }

  async function askWorkerToWake() {
    if (!chrome.runtime?.sendMessage) return null;
    try {
      const response = await callbackMessage(
        (done) => chrome.runtime.sendMessage({ type: "chute-ensure-bridge" }, done),
        WORKER_WAKE_TIMEOUT_MS,
        "Chute worker reconnect timed out."
      );
      return response?.ok === true;
    } catch (error) {
      console.debug("Chute worker wake unavailable:", error?.message || error);
      return null;
    }
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

      // Main/store builds prefer the MV3 worker. If the worker answered, its
      // answer is authoritative: it already attempted the same registered
      // helper, so do not run the native sequence a second time.
      const workerResult = await askWorkerToWake();
      if (workerResult === true) return healthCheck();
      if (workerResult === false) return false;

      // Only fall back to direct native messaging if the worker route itself was
      // unavailable (for example an unusual service-worker startup failure).
      try {
        const response = await sendNative({ action: "ensure_bridge" });
        if (!response?.ok) return false;
      } catch (error) {
        console.debug("Chute native wake unavailable:", error.message);
        return false;
      }

      if (await healthCheck()) return true;
      for (const delay of [100, 250, 500, 900]) {
        await sleep(delay);
        if (await healthCheck()) return true;
      }
      return false;
    })().finally(() => {
      wakePromise = null;
    });
    return wakePromise;
  }

  // This file intentionally does NOT wrap window.fetch. bridge-reconnect.js is
  // the one page-level recovery wrapper. Keeping a single owner prevents one
  // failed request from running the entire native wake sequence twice.
  window.ChuteNativeWake = Object.freeze({
    wake: wakeCompanion,
    health: healthCheck,
    hostName: HOST_NAME
  });
})();
