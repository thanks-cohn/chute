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
    connect(value) { token = value.trim(); },
    async command(command, args = {}) {
      const receipt = await (await request("command", {command, args})).json();
      if (receipt.state !== "completed") throw new Error(receipt.error?.message || "Command failed.");
      return receipt.result;
    },
    async content(row, {thumbnail = false, signal} = {}) {
      return (await request("content", {handle: row.handle, identity: row.identity, thumbnail}, signal)).blob();
    }
  });
})();
