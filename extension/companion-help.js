(() => {
  const RELEASES_URL = "https://github.com/thanks-cohn/chute/releases";

  function enhanceCompanionError() {
    const empty = document.querySelector(".empty");
    if (!empty || !/Chute is not running/i.test(empty.textContent || "")) return;
    if (empty.querySelector(".chute-companion-link")) return;

    empty.innerHTML = `
      <strong>Chute companion is not running.</strong>
      Chute keeps your basket on your own computer. Install or start the Windows companion, then reopen this panel.
      <br><br>
      <a class="chute-companion-link secondary-button" href="${RELEASES_URL}" target="_blank" rel="noopener noreferrer">Get the Windows companion</a>`;
  }

  const observer = new MutationObserver(enhanceCompanionError);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhanceCompanionError();
})();
