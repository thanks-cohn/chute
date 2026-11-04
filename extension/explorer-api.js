/* Transport only. Python owns capabilities, handles and command semantics. */
(() => {
  "use strict";
  let token = "";
  const base = "http://127.0.0.1:17891/api/explorer/v1/";
  let renewing = null;
  async function request(route, body, signal, retry = true) {
    let response;
    try {
      response = await fetch(base + route, {method:"POST",cache:"no-store",signal,
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(body)});
    } catch (error) {
      const readOnly = route === "content" || ["roots","list","stat","preview","resume_location"].includes(body.command);
      if (!retry || !readOnly || error.name === "AbortError") throw error;
      await window.ChuteyExplorerAPI.nativeSession(false);
      return request(route,body,signal,false);
    }
    if (!response.ok) {
      const receipt = await response.json().catch(() => ({}));
      if ([401,403].includes(response.status) && retry && receipt.error?.code === "UNAUTHORIZED") {
        await window.ChuteyExplorerAPI.nativeSession(false);
        return request(route,body,signal,false);
      }
      const error = new Error(receipt.error?.message || "The local companion is unavailable.");
      error.code = receipt.error?.code;
      throw error;
    }
    return response;
  }
  window.ChuteyExplorerAPI = Object.freeze({
    async nativeSession(select = false, writable = false) {
      if (!select && renewing) return renewing;
      const operation = async () => {
      const capabilities = await chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action:"get_native_capabilities"});
      if (!capabilities?.ok || capabilities.explorer_protocol !== "1.1") {
        throw new Error("Your Windows companion needs updating. Install the Windows EXE and Chrome extension from the same test pair.");
      }
      let response;
      for (let attempt=0;attempt<3;attempt++) {
        response = await chrome.runtime.sendNativeMessage("com.thankscohn.chute", {action:select ? (writable ? "explorer_select_write_folder" : "explorer_select_folder") : "explorer_resume"});
        if (select || response?.ok || !["BUSY","BRIDGE_UNAVAILABLE"].includes(response?.code) || attempt===2) break;
        await new Promise(resolve => setTimeout(resolve,150*(attempt+1)));
      }
      if (!response?.ok || !response.token) {
        const error = new Error(response?.error || "The local companion could not resume. Retry in Folder Access settings.");
        error.code = response?.code || "BRIDGE_UNAVAILABLE";
        throw error;
      }
      if (response.protocol !== "1.1") {
        throw new Error("The running Windows companion needs updating or restarting. Use the Windows EXE and Chrome extension from the same test pair.");
      }
      token = response.token;
      return response;
      };
      if (select) return operation(); // Never retry an explicit picker gesture.
      renewing = operation();
      try { return await renewing; } finally { renewing = null; }
    },
    connect(value) { token = value.trim(); },
    async command(command, args = {}) {
      const receipt = await (await request("command", {command, args})).json();
      if (receipt.state !== "completed") throw new Error(receipt.error?.message || "Command failed.");
      return receipt.result;
    },
    async receive(destination, file) {
      // Renew BEFORE a write; never replay a transfer whose receipt was lost.
      if (chrome.runtime?.sendNativeMessage) await window.ChuteyExplorerAPI.nativeSession(false);
      const response = await fetch(base + "receive", {method:"POST",cache:"no-store",
        headers:{Authorization:"Bearer " + token,"Content-Type":"application/octet-stream",
          "X-Chute-Operation":crypto.randomUUID().replaceAll("-",""),"X-Chute-Destination":destination,"X-Chute-Filename":encodeURIComponent(file.name)},body:file});
      const receipt = await response.json();
      if (!response.ok || receipt.state !== "COMMITTED") throw new Error(receipt.error?.message || "Copy did not commit. Check the destination before retrying.");
      return receipt;
    },
    async content(row, {thumbnail = false, original = false, signal} = {}) {
      return (await request("content", {handle: row.handle, identity: row.identity, thumbnail, original}, signal)).blob();
    }
  });
})();
