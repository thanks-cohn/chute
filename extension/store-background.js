const CAPTURE_KEY = "chute-recent-image-capture-v2";
const MAX_CAPTURE_AGE_MS = 12000;

async function configureSidePanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn("Chute could not configure the side panel.", error);
  }
}

async function rememberCapture(message, sender) {
  const capture = message?.capture;
  if (!capture?.urls?.length || !sender?.tab?.id) return { ok: false };
  const record = {
    ...capture,
    source: String(message.source || capture.source || "browser"),
    tabId: sender.tab.id,
    capturedAt: Number(capture.capturedAt || Date.now())
  };
  await chrome.storage.session.set({ [CAPTURE_KEY]: record });
  return { ok: true };
}

async function readRecentCapture() {
  const stored = await chrome.storage.session.get(CAPTURE_KEY);
  const capture = stored?.[CAPTURE_KEY];
  if (!capture?.urls?.length || !Number.isInteger(capture.tabId)) return null;
  const age = Date.now() - Number(capture.capturedAt || 0);
  if (age < 0 || age > MAX_CAPTURE_AGE_MS) return null;
  return capture;
}

async function resolveRecentDrag() {
  const capture = await readRecentCapture();
  if (!capture) return { ok: false, error: "No recent supported image drag was captured." };

  const urls = Array.from(new Set(capture.urls.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, 24);
  let lastError = "The source page could not provide that image.";

  for (const url of urls) {
    try {
      const result = await chrome.tabs.sendMessage(capture.tabId, {
        type: "chute-read-page-resource-v2",
        url,
        suggestedName: capture.title || `${capture.source || "browser"}-image`
      });
      if (!result?.ok) {
        if (result?.error) lastError = result.error;
        continue;
      }
      if (!String(result.type || "").toLowerCase().startsWith("image/")) continue;
      return {
        ...result,
        ok: true,
        source: capture.source,
        sourceUrl: url,
        parentPageUrl: capture.pageUrl || ""
      };
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  return { ok: false, error: lastError };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "chute-capture-source-v2") {
    void rememberCapture(message, sender)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  if (message?.type === "chute-resolve-recent-drag-v2") {
    void resolveRecentDrag()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => void configureSidePanel());
chrome.runtime.onStartup.addListener(() => void configureSidePanel());
void configureSidePanel();
