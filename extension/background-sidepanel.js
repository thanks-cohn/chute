openShelf = async function(sender) {
  if (!chrome.sidePanel?.open) {
    throw new Error("This browser does not support the Chute side panel.");
  }

  let windowId = sender?.tab?.windowId;
  if (!windowId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    windowId = tab?.windowId;
  }
  if (!windowId) throw new Error("No active browser window found.");

  await chrome.sidePanel.open({ windowId });
};
