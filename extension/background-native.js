(() => {
  const HOST_NAME = "com.thankscohn.chute";
  const CHUTE_ORIGIN = "http://127.0.0.1:17891";
  const HEALTH_URL = `${CHUTE_ORIGIN}/health`;
  const NATIVE_WAKE_TIMEOUT_MS = 7500;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  let wakePromise = null, failures = 0, nextWake = 0, outcome = 'unknown';
  const events = [];
  const stateLoaded = chrome.storage.session ? chrome.storage.session.get({chuteyRecovery:null}).then(value=>{
    const saved=value.chuteyRecovery;
    if (saved && Number.isFinite(saved.nextWake) && saved.nextWake<Date.now()+120001) {
      nextWake=saved.nextWake;failures=Math.min(8,Math.max(0,Number(saved.failures)||0));
    }
  }).catch(()=>{}) : Promise.resolve();
  function record(reason,layer='native_bridge') {
    outcome=reason;events.push({at:Date.now(),layer,reason,failures});
    if (events.length>20) events.shift();
    if (chrome.storage.session) void chrome.storage.session.set({chuteyRecovery:{failures,nextWake,events:[...events]}}).catch(()=>{});
  }
  function failed(reason) {
    failures++;nextWake=Date.now()+(failures>=3?120000:2000*2**(failures-1));
    record(reason);if (failures>=3) record('circuit_cooldown');return false;
  }
  globalThis.ChuteRecovery=Object.freeze({wake:()=>wakeCompanion(),snapshot:()=>({outcome,failures,nextWake,events:[...events]})});

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input?.url || "";
  }

  function isBridgeRequest(input) {
    try { return new URL(requestUrl(input)).origin===CHUTE_ORIGIN; } catch { return false; }
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
      const response = await nativeFetch(HEALTH_URL, { cache: "no-store", signal:AbortSignal.timeout(1200) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function wakeCompanion() {
    if (wakePromise) return wakePromise;
    wakePromise = (async () => {
      await stateLoaded;
      if (await bridgeHealthy()) { failures=0;nextWake=0;record('healthy');return true; }
      if (Date.now()<nextWake) { record('backoff');return false; }
      record('probe_failed');
      try {
        const capabilities=await sendNative({action:'get_native_capabilities'});
        if (capabilities?.safe_recovery!==1) return failed('legacy_helper_requires_user_action');
        const response = await sendNative({ action: "ensure_bridge" });
        if (!response?.ok) return failed(({LIVE_UNRESPONSIVE:'live_process_unresponsive',PROCESS_IDENTITY_UNKNOWN:'process_identity_unknown',BUSY:'busy',BACKOFF:'backoff',CIRCUIT_OPEN:'circuit_cooldown',RECOVERY_STATE_UNAVAILABLE:'recovery_storage_unavailable',START_TIMEOUT:'start_timeout'})[response?.code] || 'native_unavailable');
      } catch (error) {
        return failed(/forbidden|not allowed/i.test(error.message)?'native_forbidden':'native_unavailable');
      }

      for (const delay of [80, 180, 350, 700, 1200]) {
        await sleep(delay);
        if (await bridgeHealthy()) { failures=0;nextWake=0;record("recovered");return true; }
      }
      return failed("health_timeout");
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
    if (message?.type==='chute-diagnostics') {sendResponse({recovery:globalThis.ChuteRecovery.snapshot(),counts:globalThis.ChuteStatus?.diagnostics()});return false;}
    if (message?.type==='chute-ui-diagnostic') {
      if (['host_remounted','remount_cooldown','pending_intake_detached','expected_autohide','floating_disabled'].includes(message.reason)) record(message.reason,'mascot_ui');
      sendResponse({ok:true});return false;
    }
    if (message?.type !== "chute-ensure-bridge") return undefined;

    wakeCompanion()
      .then((ok) => sendResponse({ ok, bridge: ok ? "ready" : "unavailable" }))
      .catch((error) => sendResponse({
        ok: false,
        bridge: "unavailable",
        code: "RECOVERY_UNAVAILABLE"
      }));
    return true;
  });

  chrome.runtime.onStartup.addListener(() => ensureBridgeInBackground("browser startup"));
  chrome.runtime.onInstalled.addListener(() => ensureBridgeInBackground("extension install/update"));
  ensureBridgeInBackground("service worker startup");

  globalThis.fetch = async function chuteBackgroundFetch(input, init) {
    if (!isBridgeRequest(input)) return nativeFetch(input, init);
    try {
      const response=await nativeFetch(input, init);
      if (response.status===503) throw offlineError();
      return response;
    } catch (firstError) {
      if (firstError?.name === "AbortError") throw firstError;
      const recovered = await wakeCompanion();
      if (!recovered) throw offlineError(firstError);
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      if (!['GET','HEAD'].includes(method)) throw new Error('Save receipt unavailable. Check the basket before retrying; the write was not replayed.');
      try {
        return await nativeFetch(input, init);
      } catch (secondError) {
        throw offlineError(secondError);
      }
    }
  };
})();
