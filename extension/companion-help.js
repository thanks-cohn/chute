(() => {
  const RELEASES_URL = "https://github.com/thanks-cohn/chute/releases";

  function enhanceCompanionHelp() {
    const empty = document.querySelector(".empty");
    if (!empty) return;
    if (!/Chute is asleep|Chute is not running|companion is not installed/i.test(empty.textContent || "")) return;
    if (empty.querySelector(".chute-companion-link")) return;

    const help = document.createElement("div");
    help.className = "chute-companion-help";
    help.innerHTML = `
      <br>
      <span>First time using Chute on this Windows PC?</span>
      <br><br>
      <a class="chute-companion-link secondary-button" href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">Finish Windows setup</a>`;
    empty.append(help);
  }

  const observer = new MutationObserver(enhanceCompanionHelp);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhanceCompanionHelp();
})();
