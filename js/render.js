// DOM rendering. User-supplied strings (name, comment, tags) are always set
// via textContent, never innerHTML, to prevent XSS (see CLAUDE.md Section 4.1).

const STAR_SYMBOL = "★";
const PRICE_SYMBOL = "€";

export function formatStars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  return STAR_SYMBOL.repeat(n) || "–";
}

export function formatPrice(level) {
  const n = Math.max(0, Math.min(3, Math.round(level ?? 0)));
  return PRICE_SYMBOL.repeat(n) || "–";
}

// Builds an interactive 0–5 picker inside `container` and calls onChange(value)
// whenever the user picks a new value. Reads the initial value from
// container.dataset.value.
export function renderStarPicker(container, onChange) {
  container.textContent = "";
  const current = Number(container.dataset.value || 0);
  for (let i = 1; i <= 5; i++) {
    const span = document.createElement("span");
    span.className = "symbol" + (i <= current ? " active" : "");
    span.textContent = STAR_SYMBOL;
    span.setAttribute("role", "radio");
    span.setAttribute("aria-checked", String(i <= current));
    span.addEventListener("click", () => {
      const next = Number(container.dataset.value) === i ? 0 : i;
      container.dataset.value = String(next);
      renderStarPicker(container, onChange);
      onChange(next);
    });
    container.appendChild(span);
  }
}

export function renderPricePicker(container, onChange) {
  container.textContent = "";
  const current = Number(container.dataset.value || 0);
  for (let i = 1; i <= 3; i++) {
    const span = document.createElement("span");
    span.className = "symbol" + (i <= current ? " active" : "");
    span.textContent = PRICE_SYMBOL;
    span.setAttribute("role", "radio");
    span.setAttribute("aria-checked", String(i <= current));
    span.addEventListener("click", () => {
      const next = Number(container.dataset.value) === i ? 0 : i;
      container.dataset.value = String(next);
      renderPricePicker(container, onChange);
      onChange(next);
    });
    container.appendChild(span);
  }
}

// Renders the grouped restaurant list into `tbody`. `onRowClick` receives the
// restaurant's google_maps_url so the caller can open the detail view.
export function renderRestaurantList(tbody, restaurants, onRowClick) {
  tbody.textContent = "";

  if (restaurants.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No ratings yet.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const restaurant of restaurants) {
    const row = document.createElement("tr");
    row.tabIndex = 0;

    const nameCell = document.createElement("td");
    nameCell.textContent = restaurant.name;

    const ratingCell = document.createElement("td");
    ratingCell.textContent = formatStars(restaurant.latest.rating);

    const priceCell = document.createElement("td");
    priceCell.textContent = formatPrice(restaurant.latest.price_level);

    const commentCell = document.createElement("td");
    commentCell.textContent = restaurant.latest.comment || "";

    const dateCell = document.createElement("td");
    dateCell.textContent = restaurant.latest.visited_at || "";

    row.append(nameCell, ratingCell, priceCell, commentCell, dateCell);
    row.addEventListener("click", () => onRowClick(restaurant.google_maps_url));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick(restaurant.google_maps_url);
      }
    });
    tbody.appendChild(row);
  }
}

export function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "";
}
