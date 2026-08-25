(() => {
  try {
    const channel = new BroadcastChannel("chute-shelf-events-v1");
    channel.addEventListener("message", (event) => {
      if (event.data?.type !== "changed") return;
      if (typeof window.render === "function") void window.render();
      else location.reload();
    });
  } catch {}
})();
