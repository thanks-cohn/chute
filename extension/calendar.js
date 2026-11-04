(() => {
  // Native date inputs cannot style individual day cells. This accessible
  // calendar replaces the picker UI while preserving the existing date input
  // and its history-navigation change event.
  const input = document.querySelector("#history-date");
  const toggle = document.querySelector("#history-calendar-toggle");
  const label = document.querySelector("#history-calendar-label");
  const popover = document.querySelector("#history-calendar-popover");
  const grid = document.querySelector("#history-calendar-grid");
  const monthLabel = document.querySelector("#history-calendar-month-label");
  const monthPrev = document.querySelector("#history-calendar-month-prev");
  const monthNext = document.querySelector("#history-calendar-month-next");
  if (!input || !toggle || !label || !popover || !grid || !monthLabel) return;

  const baseUrl = "http://127.0.0.1:17891";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date().toISOString().slice(0, 10);
  let visibleMonth = (input.value || today).slice(0, 7);
  let fetchSequence = 0;

  // Boundaries are disjoint: 0-9 / 10-19 / 20-49 / 50+.
  function activityClass(count) {
    if (count >= 50) return "calendar-money";
    if (count >= 20) return "calendar-light-green";
    if (count >= 10) return "calendar-orange";
    return "calendar-maroon";
  }

  function monthDate(value) {
    const [year, month] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }

  function addMonth(value, offset) {
    const date = monthDate(value);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
  }

  function displayMonth(value) {
    return new Intl.DateTimeFormat(undefined, {
      month: "long", year: "numeric", timeZone: "UTC"
    }).format(monthDate(value));
  }

  function updateSelection() {
    const chosen = input.value;
    label.textContent = chosen
      ? new Intl.DateTimeFormat(undefined, {
        month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
      }).format(new Date(`${chosen}T00:00:00Z`))
      : "Calendar";
    toggle.title = chosen ? `Browse history — ${chosen}` : "Choose a history day";
    const selected = grid.querySelectorAll(".calendar-day[aria-pressed]");
    for (const element of selected) {
      element.setAttribute("aria-pressed", String(element.dataset.day === chosen));
    }
  }

  function drawMonth(counts) {
    grid.replaceChildren();
    const header = document.createElement("div");
    header.className = "calendar-weekdays";
    for (const day of weekdays) {
      const cell = document.createElement("span");
      cell.textContent = day;
      header.append(cell);
    }
    grid.append(header);

    const dates = document.createElement("div");
    dates.className = "calendar-days";
    const first = monthDate(visibleMonth);
    const offset = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    for (let index = 0; index < offset; index += 1) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-empty";
      spacer.setAttribute("aria-hidden", "true");
      dates.append(spacer);
    }
    for (let date = 1; date <= daysInMonth; date += 1) {
      const day = `${visibleMonth}-${String(date).padStart(2, "0")}`;
      const count = Number(counts[day] || 0);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `calendar-day ${activityClass(count)}`;
      button.dataset.day = day;
      button.textContent = String(date);
      button.title = `${day}: ${count} item${count === 1 ? "" : "s"} saved`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(day === input.value));
      if (day === today) button.classList.add("calendar-today");
      button.addEventListener("click", () => {
        input.value = day;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        updateSelection();
        closeCalendar();
        toggle.focus();
      });
      dates.append(button);
    }
    grid.append(dates);
    updateSelection();
  }

  async function refreshMonth() {
    const sequence = ++fetchSequence;
    const requestMonth = visibleMonth;
    monthLabel.textContent = displayMonth(requestMonth);
    grid.textContent = "Loading saved days…";
    grid.classList.add("calendar-loading");
    try {
      const response = await fetch(`${baseUrl}/api/calendar?month=${encodeURIComponent(requestMonth)}`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Could not load calendar");
      const payload = await response.json();
      if (sequence !== fetchSequence || popover.hidden) return;
      grid.classList.remove("calendar-loading");
      drawMonth(payload.counts || {});
    } catch (error) {
      if (sequence !== fetchSequence || popover.hidden) return;
      grid.classList.add("calendar-loading");
      grid.textContent = "Calendar unavailable — check the Chute companion.";
      console.warn("Chute calendar could not load:", error);
    }
  }

  function closeCalendar() {
    popover.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    fetchSequence += 1;
  }

  toggle.addEventListener("click", () => {
    if (!popover.hidden) {
      closeCalendar();
      return;
    }
    visibleMonth = (input.value || today).slice(0, 7);
    popover.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    refreshMonth();
  });

  monthPrev?.addEventListener("click", () => {
    visibleMonth = addMonth(visibleMonth, -1);
    refreshMonth();
  });
  monthNext?.addEventListener("click", () => {
    visibleMonth = addMonth(visibleMonth, 1);
    refreshMonth();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !toggle.contains(event.target)) {
      closeCalendar();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) {
      closeCalendar();
      toggle.focus();
    }
  });

  input.addEventListener("change", updateSelection);
  for (const id of ["history-prev", "history-next", "history-latest"]) {
    document.querySelector(`#${id}`)?.addEventListener("click", () => {
      queueMicrotask(updateSelection);
    });
  }
  updateSelection();
})();
