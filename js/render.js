// DOM rendering. User-supplied strings (name, comment, tags) are always set
// via textContent, never innerHTML, to prevent XSS (see CLAUDE.md Section 4.1).

const STAR_SYMBOL = "★";
const PRICE_SYMBOL = "€";

// Always renders all 5 stars: `rating` of them filled (bright yellow), the
// rest empty (gray outline) — so a real 0-star rating is visibly distinct
// from "not rated at all" (rating === null/undefined, e.g. a wishlist entry
// that hasn't been visited yet), which renders as plain text instead.
export function buildStarsDisplay(rating) {
  const container = document.createElement("span");
  container.className = "stars-display";

  if (rating === null || rating === undefined) {
    container.classList.add("stars-display-empty-state");
    container.textContent = "Not yet visited";
    return container;
  }

  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  container.setAttribute("role", "img");
  container.setAttribute("aria-label", `${filled} out of 5 stars`);
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("span");
    star.className = "star-display-symbol " + (i <= filled ? "filled" : "empty");
    star.textContent = STAR_SYMBOL;
    container.appendChild(star);
  }
  return container;
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

const VISITED_COLUMNS = ["Name", "Rating", "Price", "Last comment", "Last visit"];
const WISHLIST_COLUMNS = ["Name", "Tags", "Added"];

// Rewrites the table header row for the current list view mode.
export function renderListHeader(headerRow, mode = "visited") {
  headerRow.textContent = "";
  const columns = mode === "wishlist" ? WISHLIST_COLUMNS : VISITED_COLUMNS;
  for (const col of columns) {
    const th = document.createElement("th");
    th.textContent = col;
    headerRow.appendChild(th);
  }
}

// Renders the grouped restaurant list into `tbody`. `onRowClick` receives the
// restaurant's groupKey so the caller can open the detail view (the Google
// Maps link is optional, so groupKey — not google_maps_url — is what
// uniquely identifies a restaurant/group; see state.js).
// `mode` ("visited" | "wishlist") selects which columns to show.
export function renderRestaurantList(tbody, restaurants, onRowClick, mode = "visited") {
  tbody.textContent = "";

  if (restaurants.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = mode === "wishlist" ? WISHLIST_COLUMNS.length : VISITED_COLUMNS.length;
    cell.textContent = mode === "wishlist" ? "Wishlist is empty." : "No ratings yet.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const restaurant of restaurants) {
    const row = document.createElement("tr");
    row.tabIndex = 0;

    const nameCell = document.createElement("td");
    nameCell.textContent = restaurant.name;
    row.appendChild(nameCell);

    if (mode === "wishlist") {
      const tagsCell = document.createElement("td");
      tagsCell.textContent = (restaurant.latest.tags || []).join(", ");

      const addedCell = document.createElement("td");
      addedCell.textContent = (restaurant.latest.created_at || "").slice(0, 10);

      row.append(tagsCell, addedCell);
    } else {
      const ratingCell = document.createElement("td");
      ratingCell.appendChild(buildStarsDisplay(restaurant.latest.rating));

      const priceCell = document.createElement("td");
      priceCell.textContent = formatPrice(restaurant.latest.price_level);

      const commentCell = document.createElement("td");
      commentCell.textContent = restaurant.latest.comment || "";

      const dateCell = document.createElement("td");
      dateCell.textContent = restaurant.latest.visited_at || "";

      row.append(ratingCell, priceCell, commentCell, dateCell);
    }

    row.addEventListener("click", () => onRowClick(restaurant.groupKey));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick(restaurant.groupKey);
      }
    });
    tbody.appendChild(row);
  }
}

export function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.style.color = isError ? "#c0392b" : "";
}
