/* Transport only. Python owns capabilities, handles and command semantics. */
(() => {
  "use strict";
  let token = "";
  const base = "http://127.0.0.1:17891/api/explorer/v1/";
  async function request(route, body, signal) {
    const response = await fetch(base + route, {method: "POST", cache: "no-store", signal,
      headers: {"Content-Type": "application/json", Authorization: "Bearer " + token}, body: JSON.stringify(body)});
    if (!response.ok) {
      const receipt = await response.json().catch(() => ({}));
      throw new Error(receipt.error?.message || "The local companion is unavailable.");
    }
    return response;
  }
  window.ChuteyExplorerAPI = Object.freeze({
    async nativeSession(select = false, writable = false) {
      const capabilities = await chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action:"get_native_capabilities"});
      if (!capabilities?.ok || capabilities.explorer_protocol !== "1.1") {
        throw new Error("Your Windows companion needs updating. Install the Windows EXE and Chrome extension from the same test pair.");
      }
      const response = await chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action: select ? (writable ? "explorer_select_write_folder" : "explorer_select_folder") : "explorer_resume"});
      if (!response?.ok || !response.token) throw new Error(response?.error || "Select a folder using the matching Windows companion.");
      token = response.token;
      return response;
    },
    connect(value) { token = value.trim(); },
    async command(command, args = {}) {
      const receipt = await (await request("command", {command, args})).json();
      if (receipt.state !== "completed") throw new Error(receipt.error?.message || "Command failed.");
      return receipt.result;
    },
    async receive(destination, file) {
      const response = await fetch(base + "receive", {method:"POST",cache:"no-store",
        headers:{Authorization:"Bearer " + token,"Content-Type":"application/octet-stream",
          "X-Chute-Operation":crypto.randomUUID().replaceAll("-",""),"X-Chute-Destination":destination,"X-Chute-Filename":encodeURIComponent(file.name)},body:file});
      const receipt = await response.json();
      if (!response.ok || receipt.state !== "COMMITTED") throw new Error(receipt.error?.message || "Copy did not commit. Check the destination before retrying.");
      return receipt;
    },
    async content(row, {thumbnail = false, signal} = {}) {
      return (await request("content", {handle: row.handle, identity: row.identity, thumbnail}, signal)).blob();
    }
  });
})();
