/* Packaged presentation only: this module grants no file or network access. */
(() => {
  "use strict";
  const KEY = "chuteyPresentation", VERSION = 1;
  const defaults = Object.freeze({version:VERSION, color:"#293728", animation:true, speed:13, image:"icons/icon32.png", variedFaces:true});
  let settings = {...defaults}, revision = 0;
  const validImage = value => value === defaults.image || /^alternate-chuteys\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(png|webp|gif|jpe?g)$/i.test(value || "");
  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    return {version:VERSION, color:/^#[0-9a-f]{6}$/i.test(source.color || "") ? source.color : defaults.color,
      animation:typeof source.animation === "boolean" ? source.animation : defaults.animation,
      speed:[8,13,24].includes(source.speed) ? source.speed : defaults.speed,
      image:validImage(source.image) ? source.image : defaults.image,
      variedFaces:typeof source.variedFaces === "boolean" ? source.variedFaces : defaults.variedFaces};
  }
  // Preserve the packaged link-face palette, centralized with asset validation.
  const faces = [];
  function allocateFaces() {
    const columns = Number(document.body.style.getPropertyValue("--chutey-gallery-columns")) || 4;
    const assigned = [], palette = [settings.image,...faces.filter(path => path !== settings.image)];
    document.querySelectorAll("#files .file-row").forEach((tile,index) => {
      const icon = tile.querySelector('.file-icon[data-kind="link"]');
      const image = icon?.querySelector(".chutey-tile-mascot");
      if (!image || !settings.variedFaces) { assigned.push(null); return; }
      const forbidden = new Set();
      if (index % columns && assigned[index-1] != null) forbidden.add(assigned[index-1]);
      if (index >= columns && assigned[index-columns] != null) forbidden.add(assigned[index-columns]);
      const candidates = palette.map((_,i) => i).filter(i => !forbidden.has(i));
      let hash = 2166136261;
      for (const char of String(tile.dataset.chuteId || "")) hash = Math.imul(hash ^ char.codePointAt(0),16777619);
      const choice = candidates.length ? candidates[(hash >>> 0) % candidates.length] : 0;
      if (image.getAttribute("src") !== palette[choice]) image.src = palette[choice];
      assigned.push(choice);
    });
  }
  function mascot(image = settings.image) {
    const node = document.createElement("img");
    node.className = "chutey-tile-mascot"; node.alt = ""; node.draggable = false;
    node.src = validImage(image) ? image : defaults.image;
    node.onerror = () => { node.onerror = null; node.src = defaults.image; };
    return node;
  }
  function decorate(icon) {
    const fallback = icon?.querySelector(".file-fallback");
    if (!fallback) return;
    icon.classList.add("chutey-mascot-fallback");
    fallback.replaceChildren(mascot());
  }
  function apply(value) {
    settings = normalize(value);
    document.documentElement.style.setProperty("--chutey-card-background", settings.color);
    document.documentElement.style.setProperty("--chutey-background-period", settings.speed + "s");
    document.documentElement.dataset.chuteyBackgroundAnimation = String(settings.animation);
    document.querySelectorAll(".chutey-mascot-fallback .chutey-tile-mascot").forEach(node => {
      node.src = settings.image;
    });
    document.querySelectorAll("[data-presentation-color]").forEach(node => { node.value = settings.color; });
    document.querySelectorAll("[data-presentation-animation]").forEach(node => { node.checked = settings.animation; });
    document.querySelectorAll("[data-presentation-speed]").forEach(node => { node.value = String(settings.speed); });
    document.querySelectorAll("[data-presentation-faces]").forEach(node => { node.checked = settings.variedFaces; });
    allocateFaces();
    document.querySelectorAll("[data-presentation-image]").forEach(node => { node.value = settings.image; });
  }
  async function update(patch) {
    ++revision; apply({...settings,...patch});
    await chrome.storage.sync.set({[KEY]:settings});
  }
  window.ChuteyPresentation = Object.freeze({decorate, mascot, normalize,
    get:() => ({...settings}), update, reset:() => update(defaults)});
  apply(settings);
  const initial = revision;
  void chrome.storage.sync.get({[KEY]:null}).then(result => {
    if (initial !== revision) return;
    apply(result[KEY]);
    // Migrate malformed/older values; never persist paths or external URLs.
    if (result[KEY] && JSON.stringify(result[KEY]) !== JSON.stringify(settings)) {
      void chrome.storage.sync.set({[KEY]:settings}).catch(console.warn);
    }
  }).catch(console.warn);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[KEY]) { ++revision; apply(changes[KEY].newValue); }
  });
  for (const panel of document.querySelectorAll("[data-presentation-settings]")) {
    panel.innerHTML = `<legend>Default image and background</legend>
      <label>Default image <select data-presentation-image><option value="icons/icon32.png">Original Chutey</option></select></label>
      <label><input type="checkbox" data-presentation-faces> Vary packaged faces on link cards</label>
      <label>Background color <input type="color" data-presentation-color aria-label="Card background color"></label>
      <label><input type="checkbox" data-presentation-animation> Animate the decoration behind default images</label>
      <label>Background animation speed <select data-presentation-speed><option value="8">Fast</option><option value="13">Normal</option><option value="24">Slow</option></select></label>
      <div class="chutey-presentation-sample file-icon chutey-mascot-fallback"><span class="file-fallback"></span></div>
      <button type="button" data-presentation-reset>Reset image and background</button><span role="status" data-presentation-status></span>`;
    decorate(panel.querySelector(".file-icon"));
    const save = patch => update(patch).then(() => { panel.querySelector('[data-presentation-status]').textContent = "Saved"; }).catch(() => {
      panel.querySelector('[data-presentation-status]').textContent = "Could not save. Please retry.";
    });
    panel.querySelector('[data-presentation-color]').oninput = event => { void save({color:event.target.value}); };
    panel.querySelector('[data-presentation-animation]').onchange = event => { void save({animation:event.target.checked}); };
    panel.querySelector('[data-presentation-speed]').onchange = event => { void save({speed:Number(event.target.value)}); };
    panel.querySelector('[data-presentation-image]').onchange = event => { void save({image:event.target.value,variedFaces:false}); };
    panel.querySelector('[data-presentation-faces]').onchange = event => { void save({variedFaces:event.target.checked}); };
    panel.querySelector('[data-presentation-reset]').onclick = () => { void save(defaults); };
    // Only manifest-listed packaged assets are selectable. Never accept URLs.
    void fetch(chrome.runtime.getURL("alternate-chuteys/manifest.json")).then(r => r.ok ? r.json() : []).then(names => {
      if (!Array.isArray(names)) return;
      const select = panel.querySelector('[data-presentation-image]');
      for (const name of names) {
        const path = "alternate-chuteys/" + name;
        if (!validImage(path)) continue;
        if (!faces.includes(path)) faces.push(path);
        const option = document.createElement("option"); option.value = path; option.textContent = name; select.append(option);
      }
      select.value = settings.image; allocateFaces();
    }).catch(() => {});
  }
  const grid = document.querySelector("#files");
  if (grid) new MutationObserver(allocateFaces).observe(grid,{childList:true,subtree:true});
  apply(settings);
})();
