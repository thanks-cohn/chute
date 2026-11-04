// Deterministic boot test: execute the real classic MV3 importScripts chain
// with Chrome API mocks, including a cold local companion recovered via
// native messaging. It does not replace a real Chrome/Windows acceptance test.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const EXT = path.resolve(__dirname, "../extension");

async function boot(offlineInitially) {
  let healthy = !offlineInitially;
  let nativeCalls = 0;
  let menuCalls = 0;
  const events = {};
  const event = (name) => ({
    addListener: (callback) => (events[name] ||= []).push(callback)
  });
  const chrome = {
    runtime: {
      lastError: null,
      onMessage: event("message"),
      onInstalled: event("installed"),
      onStartup: event("startup"),
      sendNativeMessage: (_name, _message, callback) => {
        nativeCalls += 1;
        healthy = true;
        callback({ ok: true });
      },
      getURL: (rel) => "chrome-extension://test/" + rel
    },
    storage: {
      sync: {
        get: async (defaults) => defaults,
        set: async () => undefined
      },
      onChanged: event("storage-change")
    },
    contextMenus: {
      removeAll: async () => undefined,
      create: (_options, callback) => {
        menuCalls += 1;
        callback?.();
      },
      onClicked: event("context-clicked")
    },
    action: {
      setBadgeBackgroundColor: async () => undefined,
      setBadgeTextColor: async () => undefined,
      setBadgeText: async () => undefined
    },
    tabs: {
      query: async () => [{ id: 1, windowId: 7 }],
      sendMessage: async () => ({ ok: true }),
      create: async () => undefined
    },
    sidePanel: {
      open: async () => undefined,
      setPanelBehavior: async () => undefined
    }
  };
  const fetchMock = async (url) => ({
    ok: healthy,
    status: healthy ? 200 : 503,
    json: async () => url.includes("/api/files") ? { files: [] } : { ok: healthy }
  });
  let context;
  const runFile = (file) => {
    const filename = path.join(EXT, file);
    assert.ok(fs.existsSync(filename), "Missing script " + file);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, {
      filename,
      timeout: 5000
    });
  };
  context = vm.createContext({
    chrome,
    fetch: fetchMock,
    URL,
    Blob,
    setTimeout,
    clearTimeout,
    console,
    importScripts: (...files) => files.forEach(runFile)
  });
  runFile("background-entry.js");
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(events.message?.length >= 2, "Worker has no message handlers");
  assert.ok(events.installed?.length >= 1, "Worker has no install handlers");
  assert.ok(events.startup?.length >= 1, "Worker has no startup handlers");
  assert.ok(events["context-clicked"]?.length >= 1, "No context menu click handler");
  assert.ok(menuCalls >= 1, "Image menu was not registered on cold boot");

  async function send(message) {
    return Promise.race([
      new Promise((resolve, reject) => {
        for (const listener of events.message) {
          const handled = listener(message, {}, resolve);
          if (handled === true) return;
        }
        reject(new Error("No handler for " + message.type));
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Worker response timed out")), 2500))
    ]);
  }
  const wake = await send({ type: "chute-ensure-bridge" });
  assert.equal(wake?.ok, true, "Native companion wake did not complete");
  const shelf = await send({ type: "open-side-panel" });
  assert.equal(shelf?.ok, true, "Worker could not open Chute Shelf");
  if (offlineInitially) {
    assert.ok(nativeCalls >= 1, "Cold companion did not request native host");
  }
  return { nativeCalls, menuCalls };
}

(async () => {
  const normal = await boot(false);
  const recovered = await boot(true);
  console.log("PASS: cold MV3 worker import chain, context menu, Shelf, native reconnect", { normal, recovered });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
